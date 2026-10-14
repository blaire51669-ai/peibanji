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

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
// 校验文件头，防止改扩展名/类型上传其他文件
function sniff(b) {
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

export async function onRequestPut({ request, env }) {
  try {
    const memberId = await sessionMemberId(request, env);
    if (!memberId) return json({ error: '登录已过期，请重新登录。' }, 401);
    let f;
    try { f = await request.formData(); } catch { return json({ error: '请求格式不正确。' }, 400); }
    const nickname = String(f.get('nickname') || '').trim(), gender = String(f.get('gender') || ''), age = Number(f.get('age')),
          city = String(f.get('city') || '').trim(), bio = String(f.get('bio') || '').trim();
    if (!nickname || nickname.length > 20 || !['男', '女'].includes(gender) || !Number.isInteger(age) || age < 18 || age > 99 ||
        !city || city.length > 30 || bio.length > 120)
      return json({ error: '资料格式不正确：昵称≤20字，年龄18–99，城市≤30字，自我介绍≤120字。' }, 400);

    const old = await env.DB.prepare('SELECT photo_key FROM member_profiles WHERE member_id=?').bind(memberId).first();
    let photoKey = old ? old.photo_key : null, newKey = null;
    const photo = f.get('photo');
    if (photo && typeof photo !== 'string' && photo.size) {
      if (photo.size > 3 * 1024 * 1024) return json({ error: '照片不能超过 3MB。' }, 400);
      const buf = new Uint8Array(await photo.arrayBuffer());
      const type = sniff(buf);
      if (!type) return json({ error: '照片仅支持 JPG、PNG、WebP。' }, 400);
      newKey = `member-${memberId}-${crypto.randomUUID()}.${EXT[type]}`;
      await env.PHOTOS.put(newKey, buf, { httpMetadata: { contentType: type } });
      photoKey = newKey;
    }
    if (!photoKey) return json({ error: '请上传一张本人照片，社交展示需要真实照片。' }, 400);

    const member = await env.DB.prepare('SELECT phone FROM members WHERE id=?').bind(memberId).first();
    // 会员资料 + 公开展示记录（guests，id 与会员相同）一起写入。新建或内容有变动时进入「待审核」，站长通过后才公开
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO member_profiles(member_id,nickname,gender,age,city,bio,photo_key,updated_at) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
         ON CONFLICT(member_id) DO UPDATE SET nickname=excluded.nickname,gender=excluded.gender,age=excluded.age,city=excluded.city,bio=excluded.bio,photo_key=excluded.photo_key,updated_at=CURRENT_TIMESTAMP`
      ).bind(memberId, nickname, gender, age, city, bio, photoKey),
      env.DB.prepare(
        `INSERT INTO guests(id,name,gender,age,city,bio,contact,photo_key,status) VALUES(?,?,?,?,?,?,?,?,'pending')
         ON CONFLICT(id) DO UPDATE SET
           status=CASE WHEN guests.status='deleted' THEN 'deleted'
                       WHEN guests.name=excluded.name AND guests.gender=excluded.gender AND guests.age=excluded.age AND guests.city=excluded.city
                            AND guests.bio=excluded.bio AND guests.photo_key IS excluded.photo_key THEN guests.status
                       ELSE 'pending' END,
           name=excluded.name,gender=excluded.gender,age=excluded.age,city=excluded.city,bio=excluded.bio,contact=excluded.contact,photo_key=excluded.photo_key,updated_at=CURRENT_TIMESTAMP`
      ).bind(memberId, nickname, gender, age, city, bio, member ? member.phone : '', photoKey)
    ]);
    if (newKey && old && old.photo_key) { try { await env.PHOTOS.delete(old.photo_key); } catch {} }   // 换照片后清理旧文件
    const g = await env.DB.prepare('SELECT status FROM guests WHERE id=?').bind(memberId).first();
    return json({ ok: true, photo_key: photoKey, review_status: g ? g.status : 'pending' });
  } catch (err) {
    console.error('profile save failed:', err && err.message);
    return json({ error: '保存失败，请稍后再试。' }, 500);
  }
}
