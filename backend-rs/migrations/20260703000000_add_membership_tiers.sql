-- Membership tiers table for organizing membership levels with pricing
CREATE TABLE IF NOT EXISTS membership_tiers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL,
    billing_period TEXT NOT NULL DEFAULT 'yearly',
    benefits TEXT,
    branch_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
