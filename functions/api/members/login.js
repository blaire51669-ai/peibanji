import { json, clientIp, hex, sha256Hex, verifyPassword, turnstileOk, tooMany } from '../../_lib/util.js';

export async function onRequestPost({ request, env }) {
  try {
    const { email, password, turnstileToken } = await request.json();
    const e = String(email || '').trim().toLowerCase(), p = String(password || '');
    if (!e || !p || e.length > 254 || p.length > 128) return json({ error: '邮箱或密码不正确。' }, 401);

    if (await tooMany(env, `login-ip:${clientIp(request)}`, 20, 900) || await tooMany(env, `login-email:${e}`, 10, 900))
      return json({ error: '尝试次数过多，请15分钟后再试。' }, 429);
    if (!await turnstileOk(String(turnstileToken || ''), request, env)) return json({ error: '请先完成安全验证后重试。' }, 400);

    const row = await env.DB.prepare('SELECT id,password_hash,password_salt,email_verified FROM members WHERE email=? COLLATE NOCASE').bind(e).first();
    if (!row || !await verifyPassword(p, row.password_salt, row.password_hash)) return json({ error: '邮箱或密码不正确。' }, 401);
    if (!row.email_verified) return json({ error: '邮箱尚未验证。请点击注册时发到邮箱的验证链接；没收到可以在下方重新发送。', code: 'unverified' }, 403);

    const now = Math.floor(Date.now() / 1000);
    const token = crypto.randomUUID() + crypto.randomUUID();
    await env.DB.prepare('DELETE FROM member_sessions WHERE expires_at<?').bind(now).run();
    await env.DB.prepare('INSERT INTO member_sessions(token_hash,member_id,expires_at) VALUES(?,?,?)').bind(await sha256Hex(token), row.id, now + 604800).run();
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': `pb_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800` }
    });
  } catch (err) {
    console.error('login failed:', err && err.message);
    return json({ error: '登录暂时不可用，请稍后再试。' }, 500);
  }
}
