CREATE TABLE IF NOT EXISTS prospect_scores (
    person_id TEXT PRIMARY KEY REFERENCES persons(id),
    score INTEGER NOT NULL,
    score_components TEXT,
    suggested_ask_cents INTEGER,
    reason TEXT,
    tier TEXT NOT NULL,
    last_calculated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
