-- 扩展会员资料并支持最多三张会员照片。
ALTER TABLE member_profiles ADD COLUMN education TEXT NOT NULL DEFAULT '';
ALTER TABLE member_profiles ADD COLUMN height INTEGER;
ALTER TABLE member_profiles ADD COLUMN weight INTEGER;
ALTER TABLE guests ADD COLUMN education TEXT NOT NULL DEFAULT '';
ALTER TABLE guests ADD COLUMN height INTEGER;
ALTER TABLE guests ADD COLUMN weight INTEGER;
ALTER TABLE guests ADD COLUMN photos TEXT NOT NULL DEFAULT '[]';
CREATE TABLE member_photos(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  photo_key TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX member_photos_member ON member_photos(member_id, sort_order);
INSERT INTO member_photos(member_id,photo_key,sort_order)
SELECT member_id,photo_key,0 FROM member_profiles WHERE photo_key IS NOT NULL;
UPDATE guests SET photos=json_array(photo_key) WHERE photo_key IS NOT NULL;
