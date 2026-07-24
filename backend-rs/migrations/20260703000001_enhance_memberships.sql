-- Enhance memberships table with tier and billing fields
ALTER TABLE memberships ADD COLUMN tier_id TEXT REFERENCES membership_tiers(id);
ALTER TABLE memberships ADD COLUMN auto_renew INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memberships ADD COLUMN next_billing_date DATETIME;
ALTER TABLE memberships ADD COLUMN payment_provider TEXT;
ALTER TABLE memberships ADD COLUMN payment_provider_id TEXT;
