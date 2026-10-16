import { json, sha256Hex } from '../../_lib/util.js';

export async function onRequestGet({ request, env }) {
  const cookie = (request.headers.get('Cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith('pb_session='));
  if (!cookie) return json({ error: '未登录' }, 401);
  const row = await env.DB.prepare(
    `SELECT m.id,m.phone,m.created_at,p.nickname,p.gender,p.age,p.city,p.bio,p.visibility,p.education,p.height,p.weight,p.marriage_status,p.photo_visibility,p.photo_key,g.status AS review_status
     FROM member_sessions s JOIN members m ON m.id=s.member_id LEFT JOIN member_profiles p ON p.member_id=m.id LEFT JOIN guests g ON g.id=m.id
     WHERE s.token_hash=? AND s.expires_at>?`
  ).bind(await sha256Hex(cookie.slice(11)), Math.floor(Date.now() / 1000)).first();
  if (!row) return json({ error: '登录已过期' }, 401);
  const photos = await env.DB.prepare('SELECT photo_key FROM member_photos WHERE member_id=? ORDER BY sort_order').bind(row.id).all();
  row.photos = (photos.results || []).map(x => x.photo_key);
  return json(row);
}
