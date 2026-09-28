import { json, sha256Hex } from '../../_lib/util.js';

export async function onRequestGet({ request, env }) {
  const cookie = (request.headers.get('Cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith('pb_session='));
  if (!cookie) return json({ error: '未登录' }, 401);
  const row = await env.DB.prepare(
    `SELECT m.id,m.phone,m.created_at,p.nickname,p.gender,p.age,p.city,p.bio,p.visibility
     FROM member_sessions s JOIN members m ON m.id=s.member_id LEFT JOIN member_profiles p ON p.member_id=m.id
     WHERE s.token_hash=? AND s.expires_at>?`
  ).bind(await sha256Hex(cookie.slice(11)), Math.floor(Date.now() / 1000)).first();
  return row ? json(row) : json({ error: '登录已过期' }, 401);
}
