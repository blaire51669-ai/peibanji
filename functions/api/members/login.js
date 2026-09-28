import { json, clientIp, isPhone, verifyPassword, turnstileOk, tooMany, startSession } from '../../_lib/util.js';

export async function onRequestPost({ request, env }) {
  try {
    const { phone, password, turnstileToken } = await request.json();
    const p = String(phone || '').trim(), pw = String(password || '');
    if (!isPhone(p) || !pw || pw.length > 128) return json({ error: '手机号或密码不正确。' }, 401);

    if (await tooMany(env, `login-ip:${clientIp(request)}`, 20, 900) || await tooMany(env, `login-phone:${p}`, 10, 900))
      return json({ error: '尝试次数过多，请15分钟后再试。' }, 429);
    if (!await turnstileOk(String(turnstileToken || ''), request, env)) return json({ error: '请先完成安全验证后重试。' }, 400);

    const row = await env.DB.prepare('SELECT id,password_hash,password_salt FROM members WHERE phone=?').bind(p).first();
    if (!row || !await verifyPassword(pw, row.password_salt, row.password_hash)) return json({ error: '手机号或密码不正确。' }, 401);
    return await startSession(env, row.id);
  } catch (err) {
    console.error('login failed:', err && err.message);
    return json({ error: '登录暂时不可用，请稍后再试。' }, 500);
  }
}
