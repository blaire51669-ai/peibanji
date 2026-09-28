const json = (v, s = 200) => Response.json(v, { status: s });
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

async function sessionMemberId(request, env) {
  const cookie = (request.headers.get('Cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith('pb_session='));
  if (!cookie) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cookie.slice(11)));
  const row = await env.DB.prepare('SELECT member_id FROM member_sessions WHERE token_hash=? AND expires_at>?')
    .bind(hex(digest), Math.floor(Date.now() / 1000)).first();
  return row ? row.member_id : null;
}

export async function onRequestPut({ request, env }) {
  try {
    const memberId = await sessionMemberId(request, env);
    if (!memberId) return json({ error: '登录已过期，请重新登录。' }, 401);
    let b;
    try { b = await request.json(); } catch { return json({ error: '请求格式不正确。' }, 400); }
    const nickname = String(b.nickname || '').trim(), gender = String(b.gender || ''), age = Number(b.age),
          city = String(b.city || '').trim(), bio = String(b.bio || '').trim();
    if (!nickname || nickname.length > 20 || !['男', '女'].includes(gender) || !Number.isInteger(age) || age < 18 || age > 99 ||
        !city || city.length > 30 || bio.length > 120)
      return json({ error: '资料格式不正确：昵称≤20字，年龄18–99，城市≤30字，自我介绍≤120字。' }, 400);
    await env.DB.prepare(
      `INSERT INTO member_profiles(member_id,nickname,gender,age,city,bio,updated_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)
       ON CONFLICT(member_id) DO UPDATE SET nickname=excluded.nickname,gender=excluded.gender,age=excluded.age,city=excluded.city,bio=excluded.bio,updated_at=CURRENT_TIMESTAMP`
    ).bind(memberId, nickname, gender, age, city, bio).run();
    return json({ ok: true });
  } catch (err) {
    console.error('profile save failed:', err && err.message);
    return json({ error: '保存失败，请稍后再试。' }, 500);
  }
}
