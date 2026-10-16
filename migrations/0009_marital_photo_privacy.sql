-- 增加婚姻状况与会员照片可见范围。
ALTER TABLE member_profiles ADD COLUMN marriage_status TEXT NOT NULL DEFAULT '' CHECK(marriage_status IN ('','未婚','离异'));
ALTER TABLE member_profiles ADD COLUMN photo_visibility TEXT NOT NULL DEFAULT 'public' CHECK(photo_visibility IN ('public','members'));
ALTER TABLE guests ADD COLUMN marriage_status TEXT NOT NULL DEFAULT '' CHECK(marriage_status IN ('','未婚','离异'));
ALTER TABLE guests ADD COLUMN photo_visibility TEXT NOT NULL DEFAULT 'public' CHECK(photo_visibility IN ('public','members'));
