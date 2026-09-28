import { json, clientIp, isPhone, isCode, passwordOk, iterations, hashPassword, tooMany, checkCode } from '../../_lib/util.js';

// 找回密码：手机号 + 短信验证码 + 新密码
export async function onRequestPost({ request, env }) {
  try {
    const { phone, code, password } = await request.json();
    const p = String(phone || '').trim(), c = String(code || '').trim(), pw = String(password || '');
    if (!isPhone(p) || !isCode(c) || !passwordOk(pw)) return json({ error: '请填写正确的手机号、6位验证码，新密码须为12至128个字符。' }, 400);
    if (await tooMany(env, `reset-ip:${clientIp(request)}`, 30, 3600)) return json({ error: '尝试次数过多，请稍后再试。' }, 429);
    if (!await checkCode(env, p, 'reset', c)) return json({ error: '验证码错误或已过期，请重新获取。' }, 400);

    const row = await env.DB.prepare('SELECT id FROM members WHERE phone=?').bind(p).first();
    if (!row) return json({ error: '验证码错误或已过期，请重新获取。' }, 400);
    const salt = crypto.randomUUID();
    await env.DB.prepare('UPDATE members SET password_hash=?,password_salt=? WHERE id=?').bind(await hashPassword(pw, salt, iterations(env)), salt, row.id).run();
    await env.DB.prepare('DELETE FROM member_sessions WHERE member_id=?').bind(row.id).run();   // 旧登录全部失效
    return json({ ok: true });
  } catch (err) {
    console.error('reset failed:', err && err.message);
    return json({ error: '重置失败，请稍后再试。' }, 500);
  }
}
