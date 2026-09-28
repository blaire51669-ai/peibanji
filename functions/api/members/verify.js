import { json, findToken, useToken } from '../../_lib/util.js';

// 用 POST 而不是 GET：邮箱服务商的链接预览/安全扫描会自动访问链接，GET 会误消耗令牌
export async function onRequestPost({ request, env }) {
  try {
    const { token } = await request.json();
    const t = String(token || '');
    const memberId = await findToken(env, t, 'verify');
    if (!memberId) return json({ error: '验证链接无效或已过期，请回到登录页重新发送验证邮件。' }, 400);
    await env.DB.prepare('UPDATE members SET email_verified=1 WHERE id=?').bind(memberId).run();
    await useToken(env, t);
    return json({ ok: true });
  } catch (err) {
    console.error('verify failed:', err && err.message);
    return json({ error: '验证失败，请稍后再试。' }, 500);
  }
}
