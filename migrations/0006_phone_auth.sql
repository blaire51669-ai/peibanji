-- 改为手机号注册：会员表以手机号作为账号。会清空现有测试账号（如已有真实用户请先备份）。
DROP TABLE IF EXISTS email_tokens;
DROP TABLE IF EXISTS member_sessions;
DROP TABLE IF EXISTS member_profiles;
DROP TABLE IF EXISTS members;
CREATE TABLE members(id TEXT PRIMARY KEY,phone TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','admin')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE member_sessions(token_hash TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE member_profiles(member_id TEXT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,nickname TEXT NOT NULL,gender TEXT NOT NULL CHECK(gender IN ('男','女')),age INTEGER NOT NULL CHECK(age BETWEEN 18 AND 99),city TEXT NOT NULL,bio TEXT NOT NULL DEFAULT '',visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','public')),updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sms_codes(id INTEGER PRIMARY KEY AUTOINCREMENT,phone TEXT NOT NULL,purpose TEXT NOT NULL CHECK(purpose IN ('register','reset')),code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sms_codes_phone ON sms_codes(phone,purpose);
