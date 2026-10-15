const authorized = (request, env) => !!env.ADMIN_TOKEN && request.headers.get('Authorization') === `Bearer ${env.ADMIN_TOKEN}`;

export async function onRequestDelete({ request, env, params }) {
  if (!authorized(request, env)) return new Response('Unauthorized', { status: 401 });
  const id = String(params.id || '');
  const { results = [] } = await env.DB.prepare('SELECT photo_key FROM member_photos WHERE member_id=?').bind(id).all();
  const legacy = await env.DB.prepare('SELECT photo_key FROM member_profiles WHERE member_id=?').bind(id).first();
  const keys = new Set(results.map(x => x.photo_key));
  if (legacy?.photo_key) keys.add(legacy.photo_key);
  for (const key of keys) { try { await env.PHOTOS.delete(key); } catch {} }
  await env.DB.batch([
    env.DB.prepare("UPDATE guests SET status='deleted',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id),
    env.DB.prepare('DELETE FROM members WHERE id=?').bind(id)
  ]);
  return Response.json({ ok: true });
}
