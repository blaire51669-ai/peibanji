import { json, clientIp, isEmail, turnstileOk, tooMany, issueToken, sendMail, siteBase, resetMail } from '../../_lib/util.js';

export async function onRequestPost({ request, env }) {
  try {
    const { email, turnstileToken } = await request.json();
    const e = String(email || '').trim().toLowerCase();
    if (!isEmail(e)) return json({ error: '请输入有效邮箱。' }, 400);
    if (await tooMany(env, `forgot-ip:${clientIp(request)}`, 10, 3600) || await tooMany(env, `forgot-email:${e}`, 3, 3600))
      return json({ error: '发送过于频繁，请一小时后再试。' }, 429);
    if (!await turnstileOk(String(turnstileToken || ''), request, env)) return json({ error: '请先完成安全验证后重试。' }, 400);

    const row = await env.DB.prepare('SELECT id FROM members WHERE email=? COLLATE NOCASE').bind(e).first();
    if (row) {
      const token = await issueToken(env, row.id, 'reset', 3600);
      await sendMail(env, { to: e, ...resetMail(`${siteBase(request, env)}/reset.html#token=${token}`) });
    }
    return json({ ok: true, message: '如果该邮箱已注册，重置密码的邮件已发出，请查收（也请看看垃圾箱）。' });
  } catch (err) {
    console.error('forgot failed:', err && err.message);
    return json({ error: '发送失败，请稍后再试。' }, 500);
  }
}
