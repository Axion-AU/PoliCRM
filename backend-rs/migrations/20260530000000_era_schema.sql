-- ERA (Electoral Roll Access) schema
-- Records are populated from uploaded AEC ERA .txt files.
-- The raw .txt files are NOT stored in the database; only the parsed
-- records (for electoral-roll verification) and match results are persisted.

CREATE TABLE IF NOT EXISTS era_uploads (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    filename    TEXT    NOT NULL,
    state       TEXT,                                    -- V, N, Q, etc.
    record_count INTEGER NOT NULL DEFAULT 0,
    status      TEXT    NOT NULL DEFAULT 'pending',      -- pending | parsing | complete | error
    error_message TEXT,
    uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    uploaded_by TEXT                                     -- person UUID (nullable)
);

CREATE INDEX IF NOT EXISTS idx_era_uploads_filename ON era_uploads(filename);
CREATE INDEX IF NOT EXISTS idx_era_uploads_state    ON era_uploads(state);

-- ─── ERA records ──────────────────────────────────────────────────────────────
-- One row per enrolled elector, following the AEC ERA data dictionary (41 cols).
-- surname_normalized / given_names_normalized are lowercase-trimmed copies used
-- for efficient fuzzy matching without re-normalising at query time.

CREATE TABLE IF NOT EXISTS era_records (
    id                              INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id                       INTEGER REFERENCES era_uploads(id) ON DELETE CASCADE,

    -- Transaction identifiers
    enrolment_state                 TEXT(1),
    transaction_number              TEXT(8),
    federal_direct_indicator        TEXT(1),

    -- Name fields
    title                           TEXT,
    given_names                     TEXT,
    surname                         TEXT,
    surname_normalized              TEXT,    -- lowercase, stripped
    given_names_normalized          TEXT,    -- lowercase, stripped

    -- Demographics
    date_of_birth                   TEXT,    -- DD/MM/YYYY
    gender                          TEXT(1), -- F, M, or blank

    -- Address fields
    habitation_name                 TEXT,
    flat_number                     TEXT,
    street_number                   TEXT,
    street_name                     TEXT,
    street_type                     TEXT,
    locality_name                   TEXT,
    post_code                       TEXT(4),
    state                           TEXT(3),
    full_address                    TEXT,
    enrolled_address_dpid           TEXT,

    -- Geographic
    walk_number                     TEXT,

    -- Enrolment metadata
    enrolled_date                   TEXT,
    eligibility_flag                TEXT(1),
    gpv_indicator                   TEXT(1),
    new_enrolment_flag              TEXT(1),

    -- Postal address
    postal_address                  TEXT,
    postal_address_dpid             TEXT,

    -- Electoral divisions
    federal_division                TEXT,
    federal_division_pre_redistribution TEXT,
    state_district                  TEXT,
    state_district_pre_redistribution TEXT,
    local_government_area           TEXT,
    lga_pre_redistribution          TEXT,
    sa1                             TEXT,

    -- Mailing fields
    mailing_name                    TEXT,
    mailing_address_line1           TEXT,
    mailing_address_line2           TEXT,
    mailing_address_line3           TEXT,
    mailing_address_line4           TEXT,

    -- Previous / dual enrolment
    prev_enrolment_state            TEXT(1),
    prev_transaction_number         TEXT(8),
    dual_enrolment_state            TEXT(1),
    dual_transaction_number         TEXT(8),

    -- Deduplication: same person cannot appear twice with the same name + address
    UNIQUE(surname_normalized, given_names_normalized, full_address)
);

-- Indexes mirroring the Python SQLAlchemy composite indexes
CREATE INDEX IF NOT EXISTS idx_era_transaction         ON era_records(transaction_number);
CREATE INDEX IF NOT EXISTS idx_era_surname             ON era_records(surname);
CREATE INDEX IF NOT EXISTS idx_era_surname_norm        ON era_records(surname_normalized);
CREATE INDEX IF NOT EXISTS idx_era_given_norm          ON era_records(given_names_normalized);
CREATE INDEX IF NOT EXISTS idx_era_locality            ON era_records(locality_name);
CREATE INDEX IF NOT EXISTS idx_era_postcode            ON era_records(post_code);
CREATE INDEX IF NOT EXISTS idx_era_street              ON era_records(street_name);
CREATE INDEX IF NOT EXISTS idx_era_federal_div         ON era_records(federal_division);
CREATE INDEX IF NOT EXISTS idx_era_state_district      ON era_records(state_district);
CREATE INDEX IF NOT EXISTS idx_era_surname_locality    ON era_records(surname_normalized, locality_name);
CREATE INDEX IF NOT EXISTS idx_era_postcode_surname    ON era_records(post_code, surname_normalized);
CREATE INDEX IF NOT EXISTS idx_era_fed_div_surname     ON era_records(federal_division, surname_normalized);

-- ─── ERA match results ────────────────────────────────────────────────────────
-- Cached fuzzy-match results between CRM persons and ERA records.

CREATE TABLE IF NOT EXISTS era_matches (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id       TEXT    NOT NULL,   -- UUID from persons table
    era_record_id   INTEGER NOT NULL REFERENCES era_records(id) ON DELETE CASCADE,

    -- Scoring (0-100)
    overall_score   INTEGER NOT NULL,
    name_score      INTEGER NOT NULL,
    address_score   INTEGER NOT NULL,

    -- Verification status
    is_verified     INTEGER NOT NULL DEFAULT 0,  -- 1 = user confirmed
    matched_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    verified_by     TEXT,                         -- person UUID
    verified_at     DATETIME,

    -- Extracted electoral info from the matched ERA record
    federal_division       TEXT,
    state_district         TEXT,
    local_government_area  TEXT
);

CREATE INDEX IF NOT EXISTS idx_era_match_person  ON era_matches(person_id, overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_era_match_record  ON era_matches(era_record_id);
