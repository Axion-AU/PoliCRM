CREATE TABLE IF NOT EXISTS email_campaigns (
    id TEXT PRIMARY KEY,
    branch_id TEXT,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    sender_name TEXT,
    sender_email TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    scheduled_at DATETIME,
    sent_at DATETIME,
    created_by TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_recipients (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
    person_id TEXT NOT NULL REFERENCES persons(id),
    email_address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    sent_at DATETIME,
    opened_at DATETIME,
    clicked_at DATETIME,
    bounce_reason TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_recipients_campaign ON email_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_recipients_status ON email_recipients(campaign_id, status);
