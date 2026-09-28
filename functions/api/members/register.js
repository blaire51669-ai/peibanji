import { json, clientIp, isEmail, passwordOk, iterations, hashPassword, turnstileOk, tooMany, issueToken, sendMail, siteBase, verifyMail } from '../../_lib/util.js';

export async function onRequestPost({ request, env }) {
  try {
    const { email, password, turnstileToken } = await request.json();
    const e = String(email || '').trim().toLowerCase(), p = String(password || '');
    if (!isEmail(e) || !passwordOk(p)) return json({ error: '请输入有效邮箱，密码须为12至128个字符。' }, 400);
    if (await tooMany(env, `register:${clientIp(request)}`, 5, 3600)) return json({ error: '注册过于频繁，请稍后再试。' }, 429);
    if (!await turnstileOk(String(turnstileToken || ''), request, env)) return json({ error: '请先完成安全验证后重试。' }, 400);

    const salt = crypto.randomUUID(), id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO members(id,email,password_hash,password_salt) VALUES(?,?,?,?)')
      .bind(id, e, await hashPassword(p, salt, iterations(env)), salt).run();

    const token = await issueToken(env, id, 'verify', 86400);
    const sent = await sendMail(env, { to: e, ...verifyMail(`${siteBase(request, env)}/verify.html#token=${token}`) });
    return json({
      ok: true, emailSent: sent,
      message: sent ? '账号已创建。验证邮件已发送到你的邮箱，点击邮件里的链接后即可登录（没收到请查看垃圾箱）。'
                    : '账号已创建，但验证邮件发送失败。请稍后在登录页点击“重新发送验证邮件”。'
    }, 201);
  } catch (err) {
    const m = String(err && err.message || '');
    console.error('register failed:', m);
    return /UNIQUE/i.test(m) ? json({ error: '该邮箱已注册，请直接登录。' }, 409) : json({ error: '注册失败，请稍后再试。' }, 500);
  }
}
