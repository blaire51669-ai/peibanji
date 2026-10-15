const authorized = (request, env) => !!env.ADMIN_TOKEN && request.headers.get('Authorization') === `Bearer ${env.ADMIN_TOKEN}`;

export async function onRequestDelete({ request, env, params }) {
  if (!authorized(request, env)) return new Response('Unauthorized', { status: 401 });
  const id = String(params.id || '');
  const [{ results: photos = [] }, profile, guest] = await Promise.all([
    env.DB.prepare('SELECT photo_key FROM member_photos WHERE member_id=?').bind(id).all(),
    env.DB.prepare('SELECT photo_key FROM member_profiles WHERE member_id=?').bind(id).first(),
    env.DB.prepare('SELECT photo_key,photos FROM guests WHERE id=?').bind(id).first()
  ]);
  const keys = new Set(photos.map(x => x.photo_key));
  if (profile?.photo_key) keys.add(profile.photo_key);
  if (guest?.photo_key) keys.add(guest.photo_key);
  if (guest?.photos) { try { for (const key of JSON.parse(guest.photos)) if (typeof key === 'string') keys.add(key); } catch {} }
  try {
    for (const key of keys) await env.PHOTOS.delete(key);
  } catch (err) {
    console.error('member photo cleanup failed:', err && err.message);
    return Response.json({ error: '照片清理失败，会员资料未删除。请稍后重试。' }, { status: 500 });
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM contact_requests WHERE guest_id=?').bind(id),
    env.DB.prepare('DELETE FROM guests WHERE id=?').bind(id),
    env.DB.prepare('DELETE FROM members WHERE id=?').bind(id)
  ]);
  return Response.json({ ok: true, message: '会员账号、资料、照片及关联申请已彻底删除。' });
}
