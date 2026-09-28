import { json, clientIp, isEmail, turnstileOk, tooMany, issueToken, sendMail, siteBase, verifyMail } from '../../_lib/util.js';

// 无论邮箱是否存在都返回相同结果，避免被用来探测哪些邮箱已注册
export async function onRequestPost({ request, env }) {
  try {
    const { email, turnstileToken } = await request.json();
    const e = String(email || '').trim().toLowerCase();
    if (!isEmail(e)) return json({ error: '请输入有效邮箱。' }, 400);
    if (await tooMany(env, `resend-ip:${clientIp(request)}`, 10, 3600) || await tooMany(env, `resend-email:${e}`, 3, 3600))
      return json({ error: '发送过于频繁，请一小时后再试。' }, 429);
    if (!await turnstileOk(String(turnstileToken || ''), request, env)) return json({ error: '请先完成安全验证后重试。' }, 400);

    const row = await env.DB.prepare('SELECT id,email_verified FROM members WHERE email=? COLLATE NOCASE').bind(e).first();
    if (row && !row.email_verified) {
      const token = await issueToken(env, row.id, 'verify', 86400);
      await sendMail(env, { to: e, ...verifyMail(`${siteBase(request, env)}/verify.html#token=${token}`) });
    }
    return json({ ok: true, message: '如果该邮箱已注册且尚未验证，验证邮件已发出，请查收（也请看看垃圾箱）。' });
  } catch (err) {
    console.error('resend-verification failed:', err && err.message);
    return json({ error: '发送失败，请稍后再试。' }, 500);
  }
}
