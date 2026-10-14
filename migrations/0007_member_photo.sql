-- 会员资料增加照片（存私有 R2 桶，photo_key 为对象名）
ALTER TABLE member_profiles ADD COLUMN photo_key TEXT;
