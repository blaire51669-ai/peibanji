import { sha256Hex } from '../_lib/util.js';

async function isRegisteredMember(request, env) {
  const cookie = (request.headers.get('Cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith('pb_session='));
  if (!cookie) return false;
  const row = await env.DB.prepare('SELECT 1 AS ok FROM member_sessions WHERE token_hash=? AND expires_at>?')
    .bind(await sha256Hex(cookie.slice(11)), Math.floor(Date.now() / 1000)).first();
  return !!row;
}

export async function onRequestGet({ request, env }) {
  const member = await isRegisteredMember(request, env);
  const { results = [] } = await env.DB.prepare(
    "SELECT id,name,gender,age,city,bio,education,height,weight,marriage_status,photo_visibility,photo_key,photos,created_at FROM guests WHERE status='published' ORDER BY created_at DESC"
  ).all();
  for (const guest of results) {
    try { guest.photos = JSON.parse(guest.photos || '[]'); }
    catch { guest.photos = guest.photo_key ? [guest.photo_key] : []; }
    if (guest.photo_visibility === 'members' && !member) {
      guest.photo_key = null;
      guest.photos = [];
    }
  }
  return Response.json(results, { headers: { 'Cache-Control': 'private, no-store' } });
}
