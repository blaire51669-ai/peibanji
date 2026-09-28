CREATE TABLE IF NOT EXISTS rate_limits(id INTEGER PRIMARY KEY AUTOINCREMENT,bucket TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS rate_limits_bucket ON rate_limits(bucket,created_at);
