CREATE TABLE IF NOT EXISTS sms_messages (
    id TEXT PRIMARY KEY,
    person_id TEXT REFERENCES persons(id),
    phone_number TEXT NOT NULL,
    body TEXT NOT NULL,
    sender_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    sent_at DATETIME,
    delivered_at DATETIME,
    campaign_id TEXT REFERENCES email_campaigns(id),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sms_person ON sms_messages(person_id);
CREATE INDEX IF NOT EXISTS idx_sms_status ON sms_messages(status);
