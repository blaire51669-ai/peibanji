// 会员相关接口共用的工具函数（此文件没有 onRequest 导出，不会成为路由）
export const json = (v, s = 200) => Response.json(v, { status: s });
export const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
export const clientIp = request => request.headers.get('CF-Connecting-IP') || 'unknown';
export const isPhone = p => /^1[3-9]\d{9}$/.test(p);          // 中国大陆 11 位手机号
export const isCode = c => /^\d{6}$/.test(c);
export const passwordOk = p => p.length >= 12 && p.length <= 128;
export async function sha256Hex(text) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))); }
export function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ---------- 密码 ----------
// 默认 100000 次（Cloudflare 上限）。免费版 CPU 超时时，可在环境变量设 PBKDF2_ITERATIONS（10000–100000）
export const iterations = env => { const n = parseInt(env.PBKDF2_ITERATIONS, 10); return n >= 10000 && n <= 100000 ? n : 100000; };
async function derive(password, salt, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: iter, hash: 'SHA-256' }, key, 256));
}
export async function hashPassword(password, salt, iter) { return `pbkdf2$${iter}$${await derive(password, salt, iter)}`; }   // 格式：pbkdf2$迭代次数$哈希
export async function verifyPassword(password, salt, stored) {
  let iter = 100000, want = String(stored);
  const parts = want.split('$');
  if (parts[0] === 'pbkdf2' && parts.length === 3) { iter = parseInt(parts[1], 10); want = parts[2]; }
  if (!(iter >= 1000 && iter <= 100000)) return false;
  return safeEqual(await derive(password, salt, iter), want);
}

// ---------- 登录会话 ----------
export async function startSession(env, memberId) {
  const now = Math.floor(Date.now() / 1000);
  const token = crypto.randomUUID() + crypto.randomUUID();
  await env.DB.prepare('DELETE FROM member_sessions WHERE expires_at<?').bind(now).run();
  await env.DB.prepare('INSERT INTO member_sessions(token_hash,member_id,expires_at) VALUES(?,?,?)').bind(await sha256Hex(token), memberId, now + 604800).run();
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': `pb_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800` }
  });
}

// ---------- 防机器人 ----------
export async function turnstileOk(token, request, env) {
  if (!token || !env.TURNSTILE_SECRET) return false;
  const body = new FormData();
  body.set('secret', env.TURNSTILE_SECRET);
  body.set('response', token);
  const ip = clientIp(request);
  body.set('remoteip', ip === 'unknown' ? '' : ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  return (await r.json()).success === true;
}
// 滑动窗口限流：窗口内已有 max 次则返回 true，否则记一次并返回 false
export async function tooMany(env, bucket, max, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare('DELETE FROM rate_limits WHERE created_at<?').bind(now - 86400).run();
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM rate_limits WHERE bucket=? AND created_at>?').bind(bucket, now - windowSec).first();
  if (row.n >= max) return true;
  await env.DB.prepare('INSERT INTO rate_limits(bucket,created_at) VALUES(?,?)').bind(bucket, now).run();
  return false;
}

// ---------- 短信验证码（自己生成、只存哈希，5 分钟有效，最多试 5 次）----------
const codeHash = (phone, purpose, code) => sha256Hex(`${phone}|${purpose}|${code}`);
export async function issueCode(env, phone, purpose) {
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare('DELETE FROM sms_codes WHERE expires_at<?').bind(now - 3600).run();
  await env.DB.prepare('DELETE FROM sms_codes WHERE phone=? AND purpose=?').bind(phone, purpose).run();
  await env.DB.prepare('INSERT INTO sms_codes(phone,purpose,code_hash,expires_at,created_at) VALUES(?,?,?,?,?)')
    .bind(phone, purpose, await codeHash(phone, purpose, code), now + 300, now).run();
  return code;
}
export async function dropCode(env, phone, purpose) {
  await env.DB.prepare('DELETE FROM sms_codes WHERE phone=? AND purpose=?').bind(phone, purpose).run();
}
// 校验成功即作废；错误累计 5 次后作废
export async function checkCode(env, phone, purpose, code) {
  const row = await env.DB.prepare('SELECT id,code_hash,expires_at,attempts FROM sms_codes WHERE phone=? AND purpose=? ORDER BY id DESC LIMIT 1').bind(phone, purpose).first();
  if (!row || row.expires_at <= Math.floor(Date.now() / 1000)) return false;
  if (row.attempts >= 5) { await dropCode(env, phone, purpose); return false; }
  if (!safeEqual(row.code_hash, await codeHash(phone, purpose, code))) {
    await env.DB.prepare('UPDATE sms_codes SET attempts=attempts+1 WHERE id=?').bind(row.id).run();
    return false;
  }
  await env.DB.prepare('DELETE FROM sms_codes WHERE id=?').bind(row.id).run();
  return true;
}
