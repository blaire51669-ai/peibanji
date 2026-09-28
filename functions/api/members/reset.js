import { json, passwordOk, iterations, hashPassword, findToken, useToken } from '../../_lib/util.js';

export async function onRequestPost({ request, env }) {
  try {
    const { token, password } = await request.json();
    const t = String(token || ''), p = String(password || '');
    if (!passwordOk(p)) return json({ error: '密码须为12至128个字符。' }, 400);   // 先校验密码，输错不会浪费令牌
    const memberId = await findToken(env, t, 'reset');
    if (!memberId) return json({ error: '重置链接无效或已过期，请重新申请。' }, 400);

    const salt = crypto.randomUUID();
    // 重置成功即证明邮箱归本人：同时标记为已验证；并让所有旧登录失效
    await env.DB.prepare('UPDATE members SET password_hash=?,password_salt=?,email_verified=1 WHERE id=?')
      .bind(await hashPassword(p, salt, iterations(env)), salt, memberId).run();
    await env.DB.prepare('DELETE FROM member_sessions WHERE member_id=?').bind(memberId).run();
    await env.DB.prepare('DELETE FROM email_tokens WHERE member_id=?').bind(memberId).run();
    await useToken(env, t);
    return json({ ok: true });
  } catch (err) {
    console.error('reset failed:', err && err.message);
    return json({ error: '重置失败，请稍后再试。' }, 500);
  }
}
