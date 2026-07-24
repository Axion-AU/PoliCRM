CREATE TABLE IF NOT EXISTS automations (
    id TEXT PRIMARY KEY,
    branch_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    trigger_type TEXT NOT NULL,
    trigger_config TEXT NOT NULL,
    conditions TEXT,
    actions TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS automation_runs (
    id TEXT PRIMARY KEY,
    automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
    person_id TEXT,
    trigger_type TEXT NOT NULL,
    trigger_context TEXT,
    actions_taken TEXT,
    status TEXT NOT NULL DEFAULT 'completed',
    error_message TEXT,
    ran_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_automation ON automation_runs(automation_id);
