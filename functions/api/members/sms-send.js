import { json, clientIp, isPhone, turnstileOk, tooMany, issueCode, dropCode } from '../../_lib/util.js';
import { sendSms } from '../../_lib/aliyun.js';

// 发送验证码。purpose：register（注册）或 reset（找回密码）
export async function onRequestPost({ request, env }) {
  try {
    const { phone, purpose, turnstileToken } = await request.json();
    const p = String(phone || '').trim();
    if (!isPhone(p) || !['register', 'reset'].includes(purpose)) return json({ error: '请输入正确的11位手机号。' }, 400);
    if (!await turnstileOk(String(turnstileToken || ''), request, env)) return json({ error: '请先完成安全验证后重试。' }, 400);

    // 限流：先验证码人机验证，再限制频率，避免别人拿你的手机号来占用次数
    if (await tooMany(env, `sms-ip:${clientIp(request)}`, 10, 3600)) return json({ error: '发送次数过多，请稍后再试。' }, 429);
    if (await tooMany(env, `sms-phone-min:${p}`, 1, 60)) return json({ error: '发送太频繁，请60秒后再试。' }, 429);
    if (await tooMany(env, `sms-phone-day:${p}`, 5, 86400)) return json({ error: '该手机号今天发送次数已达上限，请明天再试。' }, 429);

    const exists = await env.DB.prepare('SELECT id FROM members WHERE phone=?').bind(p).first();
    if (purpose === 'register' && exists) return json({ error: '该手机号已注册，请直接登录。' }, 409);
    const okBody = { ok: true, message: '验证码已发送，5分钟内有效。' };
    if (purpose === 'reset' && !exists) return json(okBody);      // 不发短信，也不暴露该号码是否注册过

    // 每日总量上限：兜住最坏情况下的短信花费
    const dailyLimit = parseInt(env.SMS_DAILY_LIMIT, 10) > 0 ? parseInt(env.SMS_DAILY_LIMIT, 10) : 300;
    if (await tooMany(env, 'sms-global', dailyLimit, 86400)) return json({ error: '短信服务繁忙，请稍后再试。' }, 503);

    const code = await issueCode(env, p, purpose);
    const r = await sendSms(env, p, code);
    if (!r.ok) {
      await dropCode(env, p, purpose);
      return r.busy ? json({ error: '发送太频繁，请稍后再试。' }, 429) : json({ error: '短信发送失败，请稍后再试。' }, 502);
    }
    return json(okBody);
  } catch (err) {
    console.error('sms-send failed:', err && err.message);
    return json({ error: '发送失败，请稍后再试。' }, 500);
  }
}
