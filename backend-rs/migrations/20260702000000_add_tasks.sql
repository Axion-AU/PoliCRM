CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    person_id TEXT REFERENCES persons(id),
    assigned_to TEXT,
    assigned_by TEXT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    due_date DATETIME,
    completed_at DATETIME,
    completed_by TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_person ON tasks(person_id);
