CREATE TABLE IF NOT EXISTS public_pages (
    id TEXT PRIMARY KEY,
    branch_id TEXT,
    page_type TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    body_html TEXT,
    thank_you_text TEXT,
    is_published INTEGER NOT NULL DEFAULT 0,
    settings TEXT,
    created_by TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS form_submissions (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL REFERENCES public_pages(id) ON DELETE CASCADE,
    person_id TEXT REFERENCES persons(id),
    data TEXT NOT NULL,
    source_ip TEXT,
    user_agent TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_page ON form_submissions(page_id);
