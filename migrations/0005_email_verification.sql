ALTER TABLE members ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS email_tokens(token_hash TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')),expires_at INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS email_tokens_member ON email_tokens(member_id,purpose);
