CREATE TABLE IF NOT EXISTS activity_log (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    person_id TEXT,
    action TEXT NOT NULL,
    description TEXT,
    metadata TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_person ON activity_log(person_id);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
