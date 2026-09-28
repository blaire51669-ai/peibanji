-- 若 guests 表已有 contact 列（PRAGMA table_info(guests) 可查），请删掉下面第一行
ALTER TABLE guests ADD COLUMN contact TEXT;
CREATE TABLE IF NOT EXISTS contact_requests(id TEXT PRIMARY KEY,guest_id TEXT NOT NULL REFERENCES guests(id),requester_contact TEXT NOT NULL,message TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','declined')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT);
CREATE INDEX IF NOT EXISTS contact_requests_status ON contact_requests(status,created_at);
