import { json, clientIp, isPhone, isCode, passwordOk, iterations, hashPassword, tooMany, checkCode, startSession } from '../../_lib/util.js';

// 手机号 + 短信验证码 + 密码。验证码正确即注册成功并直接登录
export async function onRequestPost({ request, env }) {
  try {
    const { phone, code, password } = await request.json();
    const p = String(phone || '').trim(), c = String(code || '').trim(), pw = String(password || '');
    if (!isPhone(p) || !isCode(c) || !passwordOk(pw)) return json({ error: '请填写正确的手机号、6位验证码，密码须为12至128个字符。' }, 400);
    if (await tooMany(env, `register-ip:${clientIp(request)}`, 30, 3600)) return json({ error: '尝试次数过多，请稍后再试。' }, 429);
    if (!await checkCode(env, p, 'register', c)) return json({ error: '验证码错误或已过期，请重新获取。' }, 400);

    const salt = crypto.randomUUID(), id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO members(id,phone,password_hash,password_salt) VALUES(?,?,?,?)')
      .bind(id, p, await hashPassword(pw, salt, iterations(env)), salt).run();
    const res = await startSession(env, id);
    return new Response(JSON.stringify({ ok: true, message: '注册成功。' }), { status: 201, headers: res.headers });
  } catch (err) {
    const m = String(err && err.message || '');
    console.error('register failed:', m);
    return /UNIQUE/i.test(m) ? json({ error: '该手机号已注册，请直接登录。' }, 409) : json({ error: '注册失败，请稍后再试。' }, 500);
  }
}
