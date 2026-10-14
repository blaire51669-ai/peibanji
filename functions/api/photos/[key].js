import { sha256Hex } from '../../_lib/util.js';

const headersFor = (object, cache) => ({ 'Content-Type': object.httpMetadata?.contentType || 'image/jpeg', 'Cache-Control': cache });

export async function onRequestGet({ request, env, params }) {
  const key = params.key;
  // 本人：登录后始终能看自己的照片（含审核中、未通过）
  if (key.startsWith('member-')) {
    const cookie = (request.headers.get('Cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith('pb_session='));
    if (cookie) {
      const own = await env.DB.prepare(
        `SELECT p.photo_key FROM member_sessions s JOIN member_profiles p ON p.member_id=s.member_id
         WHERE s.token_hash=? AND s.expires_at>? AND p.photo_key=?`
      ).bind(await sha256Hex(cookie.slice(11)), Math.floor(Date.now() / 1000), key).first();
      if (own) {
        const object = await env.PHOTOS.get(key);
        if (object) return new Response(object.body, { headers: headersFor(object, 'private, no-store') });
      }
    }
  }
  // 其他人：已发布的照片可见；待审核的照片仅凭不可猜的随机文件名访问（后台审核要用）；被拒绝的不可见
  const row = await env.DB.prepare("SELECT photo_key FROM guests WHERE photo_key=? AND status IN ('pending','published')").bind(key).first();
  if (!row) return new Response('Not found', { status: 404 });
  const object = await env.PHOTOS.get(key);
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.body, { headers: headersFor(object, 'private, max-age=3600') });
}
