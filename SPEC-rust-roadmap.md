# PoliCRM Rust Backend — Feature Build Plan

Adapting the feature set from Cobber (a modern campaign CRM) into PoliCRM's Rust rewrite.

## Strategic Context

- **Remove all Python code.** The Python backend (`src/`) is deleted. The Rust backend (`backend-rs/`) becomes the sole backend.
- **The React frontend stays.** It already talks to a REST API. The Rust backend serves the same API contract.
- **Existing data model stays.** The SQLite schema (persons, interactions, parties, memberships, ERA) is the foundation. New tables are added alongside.
- **Auth.js runs as a Cloudflare Worker** in front of the backend (or standalone as an auth gateway).

---

> **Note**: References to "Cobber" in the feature descriptions below refer to the
> campaign CRM feature set we are adapting — not a rebrand.

## What backend-rs Has Today (keep + extend)

| Feature | Status | Notes |
|---|---|---|
| Person CRUD (encrypted PII) | ✅ Done | AES-256-GCM, blind indexes for email |
| Person list/search/filter | ✅ Done | Cursor pagination, state/zip/email/search |
| Interactions (event-sourced) | ✅ Done | 9 interaction types, metadata as JSON |
| Engagement tier scoring | ✅ Done | Hot/Warm/Cold based on recency+frequency |
| NationBuilder import | ✅ Done | Pulls from NB API, dedup via external_identities |
| ERA upload/parse | ✅ Done | Async TSV parsing, 10k batch insert |
| ERA fuzzy search + matching | ✅ Done | Normalized Levenshtein, name(70%)+address(30%) |
| ERA browse/divisions/localities | ✅ Done | Skip/limit pagination |
| ERA household + recruitment | ✅ Done | Same-address/surname targeting |
| Analytics summary + growth | ✅ Done | Total persons, states, monthly growth |
| Stats dashboard | ✅ Done | Active/lapsed, verified counts, by-state |
| Geographic + electorate counts | ✅ Done | Projected via postcode-to-electorate mapping |
| Crypto + tests | ✅ Done | 25+ unit tests |

---

## What backend-rs Must Add (ordered by Cobber feature area)

### PHASE 1 — Foundation (auth, org structure, tasks)

#### 1.1 Auth System
Leave auth to the Auth.js Worker gateway. The Rust backend:
- Reads `X-User-Id`, `X-User-Email`, `X-User-Role` headers injected by the Worker
- Adds a `CurrentUser` extractor for Axum (middleware that reads headers)
- Adds a `require_role("admin")` guard
- Adds a `users` table mirroring what the Worker knows about users:
  ```sql
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'organiser',
    is_active INTEGER NOT NULL DEFAULT 1,
    password_hash TEXT,           -- set by auth-worker
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  ```

**Endpoints:**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/auth/me` | Any | Returns current user profile + permissions |
| GET | `/users` | Admin | List all users |
| POST | `/users` | Admin | Create user (auth-worker handles password) |
| PATCH | `/users/{id}` | Admin | Update role/active status |

#### 1.2 Org Hierarchy (Divisions)
The existing `parties` table has `id, name, type, parent_id`. Extend it into a full org hierarchy:
- National → State → Branch → Team
- Every person belongs to a branch (FK on person model)
- Users have a `branch_id` scope — they only see their branch and below

**New/modified tables:**
```sql
ALTER TABLE persons ADD COLUMN branch_id TEXT REFERENCES branches(id);
ALTER TABLE users ADD COLUMN branch_id TEXT REFERENCES branches(id);

CREATE TABLE branches (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'national', 'state', 'branch', 'team'
    parent_id TEXT REFERENCES branches(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Endpoints:**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/branches` | Any | List org tree (scoped to user's branch) |
| POST | `/branches` | Admin | Create branch |
| PATCH | `/branches/{id}` | Admin | Update branch |
| DELETE | `/branches/{id}` | Admin | Delete branch (no children) |
| GET | `/branches/{id}/tree` | Any | Full subtree as nested JSON |

#### 1.3 Tasks
New model and CRUD. Tasks are the operational backbone.

```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    person_id TEXT REFERENCES persons(id),       -- who this task is about
    assigned_to TEXT REFERENCES users(id),       -- who must do it
    assigned_by TEXT REFERENCES users(id),       -- who created it
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',      -- pending, completed, cancelled
    due_date DATETIME,
    completed_at DATETIME,
    completed_by TEXT REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to, status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
```

**Endpoints:**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/tasks` | Any | List tasks (filter: assigned_to, status, due_before) |
| GET | `/tasks/today` | Any | Today's tasks for current user + overdue |
| POST | `/tasks` | Any | Create task |
| PATCH | `/tasks/{id}` | Any | Update task (status, due_date, etc.) |
| POST | `/tasks/{id}/complete` | Any | Mark complete (sets completed_at, completed_by) |
| DELETE | `/tasks/{id}` | Owner/Admin | Delete task |

#### 1.4 Person Enhancements
Extend the Person model to match Cobber's feature set:
```sql
ALTER TABLE persons ADD COLUMN branch_id TEXT REFERENCES branches(id);
ALTER TABLE persons ADD COLUMN tags TEXT;  -- JSON array of tag strings
ALTER TABLE persons ADD COLUMN custom_fields TEXT; -- JSON object
ALTER TABLE persons ADD COLUMN source TEXT; -- 'signup', 'import', 'manual', 'donation', 'petition'
ALTER TABLE persons ADD COLUMN source_url TEXT; -- referral URL
ALTER TABLE persons ADD COLUMN federal_division TEXT; -- cached from AEC check
ALTER TABLE persons ADD COLUMN state_district TEXT;
ALTER TABLE persons ADD COLUMN lga TEXT;
ALTER TABLE persons ADD COLUMN last_contacted_at DATETIME;
```

**New endpoints:**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/persons/{id}/tags` | Any | Add tag(s) |
| DELETE | `/persons/{id}/tags` | Any | Remove tag |
| POST | `/persons/{id}/merge` | Admin | Merge duplicate persons |

### PHASE 2 — Fundraising & Memberships

#### 2.1 Memberships (build the existing ghost table)
The `memberships` table exists with zero endpoints. Build the full CRUD:

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/memberships` | Any | List memberships (scoped to branch) |
| GET | `/memberships/{id}` | Any | Get membership |
| POST | `/memberships` | Any | Create membership (join person to branch/party) |
| PATCH | `/memberships/{id}` | Any | Update (status, tier, renewal) |
| POST | `/memberships/{id}/renew` | Any | Extend renewal date |
| GET | `/persons/{id}/memberships` | Any | All memberships for a person |

Membership tiers as config (stored in a `membership_tiers` table, or as app config):
```sql
CREATE TABLE membership_tiers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,        -- 'Full', 'Supporter', 'Associate', 'Student'
    price_cents INTEGER NOT NULL,
    billing_period TEXT NOT NULL DEFAULT 'yearly', -- 'monthly', 'yearly'
    benefits TEXT,             -- JSON array of benefit descriptions
    branch_id TEXT REFERENCES branches(id), -- NULL = available org-wide
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE memberships ADD COLUMN tier_id TEXT REFERENCES membership_tiers(id);
ALTER TABLE memberships ADD COLUMN auto_renew INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memberships ADD COLUMN next_billing_date DATETIME;
```

#### 2.2 Donations / Fundraising
New model for one-off and recurring donations.

```sql
CREATE TABLE donations (
    id TEXT PRIMARY KEY,
    person_id TEXT NOT NULL REFERENCES persons(id),
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'AUD',
    donation_type TEXT NOT NULL,        -- 'one_off', 'recurring'
    status TEXT NOT NULL DEFAULT 'completed', -- 'pending', 'completed', 'failed', 'refunded'
    payment_provider TEXT,              -- 'stripe', 'bank_transfer', 'cash'
    payment_provider_id TEXT,           -- Stripe charge ID etc.
    campaign TEXT,                      -- donation page / campaign name
    is_monthly INTEGER NOT NULL DEFAULT 0,
    recurring_interval TEXT,            -- 'monthly', 'yearly'
    recurring_id TEXT,                  -- Stripe subscription ID
    donated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_donations_person ON donations(person_id);
CREATE INDEX idx_donations_date ON donations(donated_at);
CREATE INDEX idx_donations_campaign ON donations(campaign);
```

**Endpoints:**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/donations` | Any | List donations (filter: person, campaign, date) |
| POST | `/donations` | Any | Record donation (from Stripe webhook or manual) |
| GET | `/donations/stats` | Any | Revenue summary (7d, 30d, total, avg gift) |
| GET | `/donations/{id}` | Any | Get donation detail |
| GET | `/persons/{id}/donations` | Any | Donation history for a person |

#### 2.3 Events
New model for ticketed events, RSVPs, door check-in.

```sql
CREATE TABLE events (
    id TEXT PRIMARY KEY,
    branch_id TEXT REFERENCES branches(id),
    title TEXT NOT NULL,
    description TEXT,
    event_type TEXT NOT NULL DEFAULT 'in_person', -- 'in_person', 'online', 'hybrid'
    location TEXT,
    capacity INTEGER,
    ticket_price_cents INTEGER DEFAULT 0,
    start_at DATETIME NOT NULL,
    end_at DATETIME,
    status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'published', 'cancelled', 'completed'
    created_by TEXT REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE event_rsvps (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id),
    person_id TEXT NOT NULL REFERENCES persons(id),
    status TEXT NOT NULL DEFAULT 'registered', -- 'registered', 'attended', 'cancelled', 'no_show'
    ticket_count INTEGER NOT NULL DEFAULT 1,
    paid_cents INTEGER DEFAULT 0,
    checked_in_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rsvps_event ON event_rsvps(event_id);
CREATE INDEX idx_rsvps_person ON event_rsvps(person_id);
```

**Endpoints:**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/events` | Any | List published events |
| POST | `/events` | Admin | Create event |
| PATCH | `/events/{id}` | Admin | Update event |
| POST | `/events/{id}/rsvp` | Any | RSVP a person |
| PATCH | `/events/{id}/rsvps/{rsvp_id}` | Any | Update RSVP status |
| POST | `/events/{id}/check-in` | Any | Door check-in (by person ID or email) |
| GET | `/events/{id}/attendees` | Any | Attendee list |
| GET | `/events/{id}` | Any | Event detail + stats |

### PHASE 3 — Reaching Supporters

#### 3.1 Email Campaigns
Email is sent via an external provider (SendGrid, Mailgun, etc.). The backend stores campaign definitions, segments, and tracking data.

```sql
CREATE TABLE email_campaigns (
    id TEXT PRIMARY KEY,
    branch_id TEXT REFERENCES branches(id),
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    sender_name TEXT,
    sender_email TEXT,
    status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'scheduled', 'sending', 'sent', 'cancelled'
    scheduled_at DATETIME,
    sent_at DATETIME,
    created_by TEXT REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE email_recipients (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL REFERENCES email_campaigns(id),
    person_id TEXT NOT NULL REFERENCES persons(id),
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'opened', 'clicked', 'bounced', 'failed'
    sent_at DATETIME,
    opened_at DATETIME,
    clicked_at DATETIME,
    bounce_reason TEXT
);

CREATE INDEX idx_email_recipients_campaign ON email_recipients(campaign_id);
CREATE INDEX idx_email_recipients_status ON email_recipients(campaign_id, status);
```

**Endpoints:**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/email-campaigns` | Any | List campaigns |
| POST | `/email-campaigns` | Any | Create campaign |
| PATCH | `/email-campaigns/{id}` | Any | Update campaign |
| POST | `/email-campaigns/{id}/send` | Admin | Send/schedule campaign |
| GET | `/email-campaigns/{id}/stats` | Any | Open/click/bounce rates |
| POST | `/email-campaigns/{id}/preview` | Any | Preview as HTML |
| GET | `/email-campaigns/{id}/recipients` | Any | Recipient list + status |

#### 3.2 SMS
Similar to email — stored as a record, sent via Twilio or similar.

```sql
CREATE TABLE sms_messages (
    id TEXT PRIMARY KEY,
    branch_id TEXT REFERENCES branches(id),
    person_id TEXT REFERENCES persons(id),
    body TEXT NOT NULL,
    sender_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'failed'
    sent_at DATETIME,
    delivered_at DATETIME,
    campaign_id TEXT REFERENCES email_campaigns(id), -- optional, if part of a campaign
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Endpoints:**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/sms/send` | Any | Send SMS to person |
| POST | `/sms/broadcast` | Admin | Broadcast to segment |
| GET | `/sms/messages` | Any | Message history |

#### 3.3 Prospects AI
Ranking system that scores donors based on:
- Recency of last donation
- Frequency of donations
- Monetary value (RFM scoring)
- Email engagement
- Volunteer hours
- Days since last contact

No new table needed — this is a query + scoring function. The scores are computed on read (they change daily).

```sql
-- Cached prospect scores (re-computed nightly or on demand)
CREATE TABLE IF NOT EXISTS prospect_scores (
    person_id TEXT PRIMARY KEY REFERENCES persons(id),
    score INTEGER NOT NULL,            -- 0-100
    score_components TEXT,             -- JSON: {rfm: 85, email_engagement: 70, volunteer: 0, recency: 90}
    suggested_ask_cents INTEGER,
    reason TEXT,                       -- "Gave reliably for 3 years, then lapsed"
    tier TEXT NOT NULL,                -- 'lapsed', 'upgrade', 'major', 'non_donor', 'cooling'
    last_calculated DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Endpoints:**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/prospects` | Any | Ranked prospect list |
| GET | `/prospects/{id}` | Any | Prospect detail with talking points |
| POST | `/prospects/recalculate` | Admin | Force recalculate all scores |
| POST | `/prospects/{id}/log-outcome` | Any | Log call outcome (reached, voicemail, pledged) |

### PHASE 4 — Automations

#### 4.1 Automations Engine
Trigger → Conditions → Actions. Runs as a background worker.

```sql
CREATE TABLE automations (
    id TEXT PRIMARY KEY,
    branch_id TEXT REFERENCES branches(id),
    name TEXT NOT NULL,
    description TEXT,
    trigger_type TEXT NOT NULL,           -- 'donation_made', 'person_created', 'membership_lapsed', 'event_rsvp', 'form_submitted', 'tag_added', 'scheduled'
    trigger_config TEXT NOT NULL,         -- JSON config for trigger
    conditions TEXT,                      -- JSON array of conditions (AND logic)
    actions TEXT NOT NULL,                -- JSON array of actions
    is_active INTEGER NOT NULL DEFAULT 1,
    created_by TEXT REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Log of automation runs
CREATE TABLE automation_runs (
    id TEXT PRIMARY KEY,
    automation_id TEXT NOT NULL REFERENCES automations(id),
    person_id TEXT REFERENCES persons(id),
    trigger_type TEXT NOT NULL,
    actions_taken TEXT,                   -- JSON: what was done
    status TEXT NOT NULL DEFAULT 'completed', -- 'pending', 'completed', 'failed'
    error_message TEXT,
    ran_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Supported action types:**
- `send_email` — send an email template
- `send_sms` — send an SMS
- `create_task` — assign a follow-up task
- `add_tag` — tag the person
- `change_membership_status` — update membership status

**Endpoints:**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/automations` | Admin | List automations |
| POST | `/automations` | Admin | Create automation |
| PATCH | `/automations/{id}` | Admin | Update automation |
| DELETE | `/automations/{id}` | Admin | Delete automation |
| GET | `/automations/{id}/runs` | Admin | Run history |
| GET | `/automations/{id}/test` | Admin | Dry-run against a person |

### PHASE 5 — Public Pages & Forms

#### 5.1 Public Pages
Hosted pages for donations, petitions, volunteer signups, and general contact forms.

```sql
CREATE TABLE public_pages (
    id TEXT PRIMARY KEY,
    branch_id TEXT REFERENCES branches(id),
    page_type TEXT NOT NULL,         -- 'donation', 'petition', 'volunteer', 'signup', 'contact'
    slug TEXT NOT NULL UNIQUE,       -- cobber.au/pages/{slug}
    title TEXT NOT NULL,
    body_html TEXT,
    is_published INTEGER NOT NULL DEFAULT 0,
    settings TEXT,                   -- JSON: colors, image, suggested amounts, etc.
    created_by TEXT REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE form_submissions (
    id TEXT PRIMARY KEY,
    page_id TEXT REFERENCES public_pages(id),
    person_id TEXT REFERENCES persons(id),  -- linked if identifiable
    data TEXT NOT NULL,                      -- JSON: submitted form fields
    source_ip TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Endpoints:**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/pages` | Admin | List pages |
| POST | `/pages` | Admin | Create page |
| GET | `/pages/{slug}` | None | Public page data (form rendering) |
| POST | `/pages/{slug}/submit` | None | Public form submission |
| GET | `/pages/{id}/submissions` | Admin | View submissions |
| GET | `/pages/{id}/stats` | Admin | Submission stats |

### PHASE 6 — Team Health & Reporting

#### 6.1 Activity Feed
```sql
CREATE TABLE activity_log (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    person_id TEXT REFERENCES persons(id),
    action TEXT NOT NULL,             -- 'task_completed', 'donation_received', 'member_added', etc.
    description TEXT,
    metadata TEXT,                    -- JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Endpoints:**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/activity` | Any | Recent activity (branch-scoped) |
| GET | `/activity/stats` | Any | Team health: tasks completed, contacts made this week |
| GET | `/team-health` | Admin | Dashboard: who's active, conversion rates, etc. |

---

## Schema Migration Strategy

Each phase adds new tables and columns. Use numbered SQL migration files in `backend-rs/migrations/`:
```
20260701000000_add_users.sql
20260701000001_add_branches.sql
20260701000002_add_tasks.sql
20260701000003_extend_persons.sql
20260702000000_add_membership_tiers.sql
20260702000001_add_donations.sql
20260702000002_add_events.sql
20260703000000_add_email_campaigns.sql
20260703000001_add_sms.sql
20260703000002_add_prospect_scores.sql
20260704000000_add_automations.sql
20260705000000_add_public_pages.sql
20260706000000_add_activity_log.sql
```

---

## Dependency Additions to Cargo.toml

New crates needed across phases:
- `jsonwebtoken` — JWT validation for auth-worker tokens
- `hmac`, `hex` — HMAC for webhook verification
- `tokio-cron-scheduler` — Background job scheduling (automations, prospect recalculation)
- `serde_with` — Serde helpers for JSON fields
- `csv` — CSV export
- `scraper` / `select.rs` — HTML parsing if needed
- `rust-embed` — Embed static assets (GeoJSON, electorate maps)

---

## API Contract Notes

The Rust backend should match the frontend's existing API expectations where possible. Key frontend API calls from `frontend/src/services/api.ts`:
- `GET /persons` — list (cursor pagination) — already implemented
- `GET /persons/{id}` — get person — already implemented
- `POST /persons` — create — already implemented
- `POST /import/csv` — expects multipart form upload — **needs implementing**
- `POST /import/nationbuilder` — already implemented
- `GET /stats/dashboard` — already implemented
- `GET /stats/electorates` — already implemented
- `GET /analytics/*` — already implemented (4 endpoints)
- `GET /era/stats` — already implemented
- `GET /era/uploads` — already implemented
- `POST /era/upload` — already implemented

---

## What to Remove (Python cleanup)

Delete these directories entirely after the Rust backend covers their functionality:
```
src/                    # Full Python backend
tests/                  # Python tests
requirements.txt        # Python deps
alembic.ini + src/api/alembic/   # Python migrations
run_crm.sh              # Python startup script
scripts/                # Python migration scripts
Dockerfile              # Python Dockerfile (replace with Rust one)
```

---

## Build Order Summary

| Phase | Features | Priority | Depends On |
|---|---|---|---|
| P1 | Auth headers, Users, Branches, Tasks, Person tags/divisions | 🔴 Critical | Nothing |
| P2 | Memberships (tiers, renewals), Donations, Events | 🟡 High | P1 (branches, users) |
| P3 | Email campaigns, SMS, Prospects AI | 🟡 High | P1 (persons) |
| P4 | Automations engine (triggers, actions, background worker) | 🟢 Medium | P2 (donations, memberships), P3 (email, SMS) |
| P5 | Public pages + form submissions | 🟢 Medium | P1 (branches), P2 (donations) |
| P6 | Team health, activity feed, reporting | 🔵 Low | P1-P3 |
