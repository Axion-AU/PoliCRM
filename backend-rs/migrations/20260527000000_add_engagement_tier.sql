ALTER TABLE persons ADD COLUMN engagement_tier TEXT NOT NULL DEFAULT 'Cold';

CREATE INDEX IF NOT EXISTS idx_interactions_person_timestamp ON interactions(person_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_interactions_type_timestamp ON interactions(person_id, interaction_type, timestamp);
