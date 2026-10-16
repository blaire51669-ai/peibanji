import { sha256Hex } from '../../_lib/util.js';

const headersFor = (object, cache) => ({ 'Content-Type': object.httpMetadata?.contentType || 'image/jpeg', 'Cache-Control': cache });

export async function onRequestGet({ request, env, params }) {
  const key = params.key;
  const cookie = (request.headers.get('Cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith('pb_session='));
  let memberId = null;
  if (cookie) {
    const session = await env.DB.prepare('SELECT member_id FROM member_sessions WHERE token_hash=? AND expires_at>?')
      .bind(await sha256Hex(cookie.slice(11)), Math.floor(Date.now() / 1000)).first();
    memberId = session?.member_id || null;
  }
  // 本人：登录后始终能看自己的照片（含审核中、未通过）
  if (key.startsWith('member-') && memberId) {
    const own = await env.DB.prepare('SELECT 1 AS ok FROM member_photos WHERE member_id=? AND photo_key=?').bind(memberId, key).first();
    if (own) {
      const object = await env.PHOTOS.get(key);
      if (object) return new Response(object.body, { headers: headersFor(object, 'private, no-store') });
    }
  }
  // 公开照片与待审核的随机键照片沿用现有规则；仅会员可见的照片必须有有效会员会话。
  const row = await env.DB.prepare("SELECT g.photo_visibility FROM guests g JOIN member_photos p ON p.member_id=g.id WHERE p.photo_key=? AND g.status IN ('pending','published') UNION SELECT photo_visibility FROM guests WHERE photo_key=? AND status IN ('pending','published')").bind(key,key).first();
  if (!row) return new Response('Not found', { status: 404 });
  if (row.photo_visibility === 'members' && !memberId) return new Response('Not found', { status: 404 });
  const object = await env.PHOTOS.get(key);
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.body, { headers: headersFor(object, 'private, no-store') });
}
