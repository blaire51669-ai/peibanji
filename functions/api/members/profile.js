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
    // 同时兼容表单(multipart，带照片)和旧版 JSON(无照片)，避免浏览器缓存了旧页面脚本时无法保存
    const ct = (request.headers.get('Content-Type') || '').toLowerCase();
    let get, photoFields = [], removedPhotos = [];
    try {
      if (ct.includes('application/json')) { const b = await request.json(); get = k => b[k]; }
      else { const f = await request.formData(); get = k => f.get(k); photoFields = f.getAll('photos'); try { removedPhotos = JSON.parse(f.get('removed_photos') || '[]'); } catch {} }
    } catch (e) {
      console.error('profile parse failed:', ct, e && e.message);
      return json({ error: `请求格式不正确（${ct || '无类型'}）。请按 Ctrl+F5 强制刷新页面后重试。` }, 400);
    }
    const nickname = String(get('nickname') || '').trim(), gender = String(get('gender') || ''), age = Number(get('age')),
          city = String(get('city') || '').trim(), bio = String(get('bio') || '').trim(),
          education = String(get('education') || '').trim(), height = Number(get('height')), weight = Number(get('weight')),
          marriageStatus = String(get('marriage_status') || ''), photoVisibility = String(get('photo_visibility') || '');
    if (!nickname || nickname.length > 20 || !['男', '女'].includes(gender) || !Number.isInteger(age) || age < 18 || age > 99 ||
        !city || city.length > 30 || bio.length > 120 || education.length > 30 ||
        !Number.isInteger(height) || height < 100 || height > 250 || !Number.isInteger(weight) || weight < 25 || weight > 250 ||
        !['未婚', '离异'].includes(marriageStatus) || !['public', 'members'].includes(photoVisibility))
      return json({ error: '资料格式不正确：请检查昵称、年龄、城市、学历、身高、体重、婚姻状况和照片可见范围。' }, 400);

    const existing = await env.DB.prepare('SELECT photo_key FROM member_photos WHERE member_id=? ORDER BY sort_order').bind(memberId).all();
    let photos = (existing.results || []).map(x => x.photo_key);
    const removed = Array.isArray(removedPhotos) ? removedPhotos.filter(k => photos.includes(k)) : [];
    photos = photos.filter(k => !removed.includes(k));
    const newKeys = [];
    for (const photo of photoFields) {
      if (!photo || typeof photo === 'string' || !photo.size) continue;
      if (photo.size > 3 * 1024 * 1024) return json({ error: '照片不能超过 3MB。' }, 400);
      const buf = new Uint8Array(await photo.arrayBuffer());
      const type = sniff(buf);
      if (!type) return json({ error: '照片仅支持 JPG、PNG、WebP。' }, 400);
      if (photos.length + newKeys.length >= 3) return json({ error: '最多只能保留 3 张照片。' }, 400);
      const key = `member-${memberId}-${crypto.randomUUID()}.${EXT[type]}`;
      await env.PHOTOS.put(key, buf, { httpMetadata: { contentType: type } });
      newKeys.push(key);
    }
    photos.push(...newKeys);
    const photoKey = photos[0] || null;
    if (!photoKey) return json({ error: '至少保留一张本人照片，社交展示需要真实照片。' }, 400);

    // 会员资料 + 公开展示记录（guests，id 与会员相同）一起写入。新建或内容有变动时进入「待审核」，站长通过后才公开
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO member_profiles(member_id,nickname,gender,age,city,bio,education,height,weight,marriage_status,photo_visibility,photo_key,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
         ON CONFLICT(member_id) DO UPDATE SET nickname=excluded.nickname,gender=excluded.gender,age=excluded.age,city=excluded.city,bio=excluded.bio,education=excluded.education,height=excluded.height,weight=excluded.weight,marriage_status=excluded.marriage_status,photo_visibility=excluded.photo_visibility,photo_key=excluded.photo_key,updated_at=CURRENT_TIMESTAMP`
      ).bind(memberId, nickname, gender, age, city, bio, education, height, weight, marriageStatus, photoVisibility, photoKey),
      env.DB.prepare(
        `INSERT INTO guests(id,name,gender,age,city,bio,education,height,weight,marriage_status,photo_visibility,photo_key,photos,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')
         ON CONFLICT(id) DO UPDATE SET
           status=CASE WHEN guests.status='deleted' THEN 'deleted'
                       WHEN guests.name=excluded.name AND guests.gender=excluded.gender AND guests.age=excluded.age AND guests.city=excluded.city
                            AND guests.bio=excluded.bio AND guests.education=excluded.education AND guests.height=excluded.height AND guests.weight=excluded.weight
                            AND guests.marriage_status=excluded.marriage_status AND guests.photo_visibility=excluded.photo_visibility
                            AND guests.photos=excluded.photos THEN guests.status
                       ELSE 'pending' END,
           name=excluded.name,gender=excluded.gender,age=excluded.age,city=excluded.city,bio=excluded.bio,education=excluded.education,height=excluded.height,weight=excluded.weight,marriage_status=excluded.marriage_status,photo_visibility=excluded.photo_visibility,photo_key=excluded.photo_key,photos=excluded.photos,updated_at=CURRENT_TIMESTAMP`
      ).bind(memberId, nickname, gender, age, city, bio, education, height, weight, marriageStatus, photoVisibility, photoKey, JSON.stringify(photos))
    ]);
    await env.DB.prepare('DELETE FROM member_photos WHERE member_id=?').bind(memberId).run();
    for (let i = 0; i < photos.length; i++) await env.DB.prepare('INSERT INTO member_photos(member_id,photo_key,sort_order) VALUES(?,?,?)').bind(memberId, photos[i], i).run();
    for (const key of removed) { try { await env.PHOTOS.delete(key); } catch {} }
    const g = await env.DB.prepare('SELECT status FROM guests WHERE id=?').bind(memberId).first();
    return json({ ok: true, photo_key: photoKey, photos, photo_visibility: photoVisibility, review_status: g ? g.status : 'pending' });
  } catch (err) {
    console.error('profile save failed:', err && err.message);
    return json({ error: '保存失败，请稍后再试。' }, 500);
  }
}
