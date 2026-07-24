-- Donations table for tracking financial contributions
CREATE TABLE IF NOT EXISTS donations (
    id TEXT PRIMARY KEY,
    person_id TEXT NOT NULL REFERENCES persons(id),
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'AUD',
    donation_type TEXT NOT NULL DEFAULT 'one_off',
    status TEXT NOT NULL DEFAULT 'completed',
    payment_provider TEXT,
    payment_provider_id TEXT,
    campaign TEXT,
    is_monthly INTEGER NOT NULL DEFAULT 0,
    recurring_interval TEXT,
    recurring_id TEXT,
    donated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_donations_person ON donations(person_id);
CREATE INDEX IF NOT EXISTS idx_donations_date ON donations(donated_at);
CREATE INDEX IF NOT EXISTS idx_donations_campaign ON donations(campaign);
