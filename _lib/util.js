// 会员相关接口共用的工具函数（此文件没有 onRequest 导出，不会成为路由）
export const json = (v, s = 200) => Response.json(v, { status: s });
export const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
export const clientIp = request => request.headers.get('CF-Connecting-IP') || 'unknown';
export const isEmail = e => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
export const passwordOk = p => p.length >= 12 && p.length <= 128;

// ---------- 密码 ----------
// 默认 100000 次（Cloudflare 上限）。免费版 CPU 超时时，可在环境变量设 PBKDF2_ITERATIONS（10000–100000）
export const iterations = env => { const n = parseInt(env.PBKDF2_ITERATIONS, 10); return n >= 10000 && n <= 100000 ? n : 100000; };

async function derive(password, salt, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: iter, hash: 'SHA-256' }, key, 256));
}
// 存储格式 pbkdf2$迭代次数$哈希
export async function hashPassword(password, salt, iter) { return `pbkdf2$${iter}$${await derive(password, salt, iter)}`; }
export async function verifyPassword(password, salt, stored) {
  let iter = 100000, want = String(stored);
  const parts = want.split('$');
  if (parts[0] === 'pbkdf2' && parts.length === 3) { iter = parseInt(parts[1], 10); want = parts[2]; }
  if (!(iter >= 1000 && iter <= 100000)) return false;
  const got = await derive(password, salt, iter);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

// ---------- 防机器人 ----------
export async function turnstileOk(token, request, env) {
  if (!token || !env.TURNSTILE_SECRET) return false;
  const body = new FormData();
  body.set('secret', env.TURNSTILE_SECRET);
  body.set('response', token);
  body.set('remoteip', clientIp(request) === 'unknown' ? '' : clientIp(request));
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

// ---------- 邮件令牌（验证邮箱 / 重置密码）----------
export async function sha256Hex(text) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))); }
export const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));

export async function issueToken(env, memberId, purpose, ttlSec) {
  const token = randomToken();
  await env.DB.prepare('DELETE FROM email_tokens WHERE member_id=? AND purpose=?').bind(memberId, purpose).run();
  await env.DB.prepare('INSERT INTO email_tokens(token_hash,member_id,purpose,expires_at) VALUES(?,?,?,?)')
    .bind(await sha256Hex(token), memberId, purpose, Math.floor(Date.now() / 1000) + ttlSec).run();
  return token;
}
// 校验令牌，成功返回 member_id（不删除）；用 useToken 作废
export async function findToken(env, token, purpose) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const row = await env.DB.prepare('SELECT member_id FROM email_tokens WHERE token_hash=? AND purpose=? AND expires_at>?')
    .bind(await sha256Hex(token), purpose, Math.floor(Date.now() / 1000)).first();
  return row ? row.member_id : null;
}
export async function useToken(env, token) {
  await env.DB.prepare('DELETE FROM email_tokens WHERE token_hash=?').bind(await sha256Hex(token)).run();
}

// ---------- 发邮件（Resend）----------
export const siteBase = (request, env) => String(env.SITE_URL || new URL(request.url).origin).replace(/\/+$/, '');

export async function sendMail(env, { to, subject, html, text }) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) { console.error('sendMail: RESEND_API_KEY 或 MAIL_FROM 未配置'); return false; }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html, text })
    });
    if (!r.ok) { console.error('sendMail failed:', r.status, (await r.text()).slice(0, 300)); return false; }
    return true;
  } catch (e) { console.error('sendMail error:', e && e.message); return false; }
}

function layout(heading, lead, url, button, note) {
  const html = `<div style="max-width:480px;margin:auto;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#493a3d;line-height:1.7">
<h2 style="color:#b85b6e">♡ 陪伴记</h2><p><b>${heading}</b></p><p>${lead}</p>
<p style="margin:24px 0"><a href="${url}" style="background:#b85b6e;color:#fff;padding:10px 24px;border-radius:99px;text-decoration:none">${button}</a></p>
<p style="font-size:13px;color:#927a7c">如果按钮无法点击，请复制下面的链接到浏览器打开：<br>${url}</p>
<p style="font-size:13px;color:#927a7c">${note}</p></div>`;
  const text = `${heading}\n\n${lead}\n\n${url}\n\n${note}`;
  return { html, text };
}
export const verifyMail = url => ({ subject: '【陪伴记】请验证你的邮箱', ...layout('验证邮箱', '感谢注册陪伴记。请点击下面的按钮完成邮箱验证，链接 24 小时内有效。', url, '验证邮箱', '如果这不是你本人的操作，请忽略这封邮件。') });
export const resetMail = url => ({ subject: '【陪伴记】重置密码', ...layout('重置密码', '我们收到了重置密码的请求。请点击下面的按钮设置新密码，链接 1 小时内有效。', url, '重置密码', '如果这不是你本人的操作，请忽略这封邮件，你的密码不会改变。') });
