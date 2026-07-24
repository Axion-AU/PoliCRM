-- Events and RSVPs tables
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    branch_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    event_type TEXT NOT NULL DEFAULT 'in_person',
    location TEXT,
    capacity INTEGER,
    ticket_price_cents INTEGER DEFAULT 0,
    start_at DATETIME NOT NULL,
    end_at DATETIME,
    status TEXT NOT NULL DEFAULT 'draft',
    created_by TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_rsvps (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    person_id TEXT NOT NULL REFERENCES persons(id),
    status TEXT NOT NULL DEFAULT 'registered',
    ticket_count INTEGER NOT NULL DEFAULT 1,
    paid_cents INTEGER DEFAULT 0,
    checked_in_at DATETIME,
    notes TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rsvps_event ON event_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_person ON event_rsvps(person_id);
