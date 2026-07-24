<p align="center">
  <img src="https://axionventures.com.au/images/policrm-banner-transparent.png" alt="PoliCRM" width="600" />
</p>

<p align="center">
  <strong>Member management built for people trying to win.</strong>
</p>

<p align="center">
  Automated AEC enrollment verification and member CRM for Australian political campaigns.<br/>
  An <a href="https://axionventures.com.au">Axion Ventures</a> project.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.x-0D9488?style=flat-square&logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/selenium-firefox-0D9488?style=flat-square&logo=selenium&logoColor=white" />
  <img src="https://img.shields.io/badge/status-active-0D9488?style=flat-square" />
</p>

---

## What it does

PoliCRM verifies member enrollment against the Australian Electoral Roll and manages member records across a campaign. It supports two verification methods:

- **Electoral Roll Access (ERA):** Upload your party's AEC-issued ERA `.txt` file. PoliCRM processes it into the local database and matches members directly against the roll, no scraping, no rate limits, no CAPTCHAs. This is the recommended path.
- **AEC website automation:** Automates manual lookups against [check.aec.gov.au](https://check.aec.gov.au/) via Selenium. See [the note on AEC automation](#aec-website-automation) before using this.

Two interfaces: a **terminal TUI** for scripted runs and a **web CRM** for day-to-day member management.

---

## Prerequisites

- Python 3.x
- Firefox (Selenium uses Firefox to better mimic human browsing behaviour)

---

## Installation

```bash
git clone <repository-url>
cd AEC_Checker

python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

pip install -r requirements.txt
```

---

## Usage

### Web CRM (recommended for most users)

Full graphical interface with member management, dashboard, and bulk tools:

```bash
./run_crm.sh
```

Opens at `http://localhost:8000`.

| Feature | Description |
|---------|-------------|
| Dashboard | Real-time stats on verification progress |
| Member Management | Add, edit, tag, and annotate members |
| Import | Drag-and-drop CSV import with auto-verification |
| AEC Verification | Automated background checks |

---

### Interactive TUI

Guided setup for one-off or first-time runs:

```bash
python aec_checker.py
```

Walks through: CSV selection, address normalisation, dry-run option, retry/delay config, progress tracking, and filtered output export.

---

### CLI

For automation and scripted workflows:

```bash
python aec_checker.py --infile input.csv --outfile output.csv --threads 2 --headless
```

| Argument | Default | Description |
|----------|---------|-------------|
| `--infile` | `input.csv` | Input CSV path |
| `--outfile` | `output.csv` | Output CSV path |
| `--skip` | `0` | Records to skip (resume interrupted runs) |
| `--threads` | `1` | Concurrent browser threads (2–3 max recommended) |
| `--headless` | off | Run without visible browser windows |
| `--dry-run` | off | Validate input data without hitting AEC |
| `--max-retries` | `3` | Retry attempts per record |
| `--delay-min` | `1.5` | Minimum delay between requests (seconds) |
| `--delay-max` | `3.0` | Maximum delay between requests (seconds) |

---

## Common workflows

**Validate data quality before a run:**
```bash
python aec_checker.py --infile members.csv --dry-run
```

**Production run with conservative rate limiting:**
```bash
python aec_checker.py --infile members.csv --outfile verified.csv \
  --threads 2 --headless --max-retries 5 --delay-min 2.0 --delay-max 4.0
```

**Resume an interrupted job:**
```bash
python aec_checker.py --infile members.csv --outfile verified.csv --skip 150
```

---

## Data format

### Import (NationBuilder export format)

The CSV importer expects NationBuilder's standard export columns:

| Column | Description |
|--------|-------------|
| `first_name` | |
| `middle_name` | |
| `last_name` | |
| `nationbuilder_id` | Mapped to `external_identities` on import |
| `primary_address1` | Street address |
| `primary_address2` | Optional |
| `primary_address3` | Optional |
| `primary_city` | Suburb |
| `primary_state` | State abbreviation (e.g. `VIC`, `NSW`) |
| `primary_zip` | Postcode |
| `primary_country_code` | Defaults to `AU` |

### Verification output columns

| Column | Description |
|--------|-------------|
| `nationbuilder_link` | Link to member profile |
| `AEC_result` | `Pass`, `Partial`, `Fail`, `Fail_Street`, `Fail_Suburb` |
| `federal_division` | Federal electorate |
| `state_division` | State electorate |
| `local_government` | LGA |
| `local_ward` | Ward |

---

## Database schema

The Rust rewrite stores all person records in SQLite with AES-256-GCM encryption on PII fields. The full migration is in `migrations/0001_initial_schema.sql`.

### Encryption model

PII fields (names, email, phone, address lines, city) are encrypted at rest as AES-256-GCM ciphertext encoded in base64. Only the fields needed for filtering and search are stored in plaintext:

| Field | Storage | Reason |
|-------|---------|--------|
| `primary_state` | Plaintext | Geographic filtering |
| `primary_zip` | Plaintext | Low sensitivity, filtering |
| `email_blind_index` | Plaintext | `SHA-256(email + pepper)` — searchable without decrypting email |
| Everything else | Encrypted | Name, address, phone, mobile, city |

The blind index lets you look up a person by email without ever storing the email in a queryable form. The pepper is application-controlled and not stored in the database.

### Core tables

**`persons`** — one row per individual. PII columns encrypted as above.

**`external_identities`** — maps a person to IDs in external systems (NationBuilder, etc.). Keyed on `(provider, provider_id)`.

**`parties`** — party and branch hierarchy. Self-referential via `parent_id` for nested structures (e.g. a branch under a state division under the national party).

**`memberships`** — links a person to a party with status, type, and lifecycle dates (`join_date`, `renewal_date`, `resignation_date`). Soft-deleted via `deleted_at`.

**`interactions`** — append-only log of contact events. `interaction_type` is a string enum; `metadata` is freeform JSON for type-specific fields.

### Soft deletes

`persons` and `memberships` use `deleted_at` rather than hard deletes. Electoral compliance contexts often require retaining records; check your party's data retention obligations before purging rows.

---

## Address normalisation

Raw exports often have inconsistent address formats (`Street` vs `St`, `Victoria` vs `VIC`). Normalise before running:

```bash
python src/utils/convert_addresses.py <input.csv> <output.csv>
```

Normalises `primary_address1` and `primary_state` to match AEC expectations. Original address is preserved in `origAddress`.

---

## Electoral Roll Access (ERA)

ERA is a direct feed of the Australian electoral roll, issued by the AEC to registered political parties under strict access conditions. It's significantly faster and more reliable than web scraping.

> **Important:** PoliCRM processes ERA files but does not distribute them. The roll is managed by your party's designated ERA custodian in accordance with AEC access requirements. If you don't have an ERA file, contact your party's state or national secretary.

### Uploading an ERA file

In the web CRM, navigate to **Settings → Electoral Roll → Import ERA File** and upload your `.txt` file. PoliCRM will:

1. Parse the ERA format into the local database
2. Match existing member records against the roll
3. Flag discrepancies (name mismatches, address changes, unenrolled members)
4. Surface electorate data (federal division, state division, LGA, ward) without a live AEC lookup

ERA data is stored locally. It never leaves the machine running PoliCRM.

### ERA vs AEC automation

| | ERA | AEC automation |
|--|-----|-------------|
| Speed | Fast (local lookup) | Slow (1–3s per record) |
| Rate limits | None | Yes, strict |
| CAPTCHA risk | None | Present |
| Requires AEC access agreement | Yes | No |
| Data freshness | As of roll extract date | Live |
| Compliance position | Sanctioned | Gray area |

Use ERA when available. The automation method exists as a fallback but carries compliance risk; read the section below before using it.

---

## AEC Website Automation

> **Note:** Automating the AEC's enrollment checker is a gray area. The tool replicates what a party volunteer would do manually, but the AEC's site includes bot detection, which implies automated access is not intended. Use this method only if your party does not hold current ERA access, and assess your own compliance position before running it at scale.

The scraping method uses Selenium with Firefox to submit member details to [check.aec.gov.au](https://check.aec.gov.au/) and extract the result. It works, but it's slower, subject to rate limiting and CAPTCHAs, and sits outside the AEC's sanctioned access paths.

**If your party holds ERA access, use that instead.**

---

## Troubleshooting (AEC automation)

**"Unable to validate, if you are using VPN software..."**

The AEC site has anti-bot protections. Disable any VPN, keep Firefox up to date, and use conservative delays (`--delay-min 2.0 --delay-max 4.0`).

**CAPTCHA challenges**

Increase delays and reduce threads to `--threads 1`. The script detects CAPTCHAs and pauses automatically. Check `aec_checker.log` for warnings.

**Browser crashes**

The script auto-recovers crashed browser threads and saves progress after each record. Check logs for repeated crash patterns.

**"Element click intercepted" / selection errors**

Run address normalisation first. The AEC site's dropdowns are sensitive to address format. See `aec_checker.log` for specific errors.

---

## Project structure

```
aec_checker.py          Entry point
src/
  aec_core/
    browser.py          Selenium automation
    models.py           Data models and constants
    utils.py            Helper functions
  utils/
    convert_addresses.py  Address normalisation
```

---

## Changelog

**Rust rewrite (current)**
- Full rewrite in Rust
- SQLite database with AES-256-GCM encryption on all PII fields
- Blind index for email search without plaintext storage
- Normalised schema: persons, memberships, parties, interactions, external identities
- Soft deletes on persons and memberships

**Python (legacy)**

See `IMPROVEMENTS.md` for the full Python-era changelog. Summary:
- Retry logic with exponential backoff
- Configurable rate limiting
- Input validation and dry-run mode
- Enhanced result extraction (actual electoral divisions)
- Browser crash recovery
- CAPTCHA detection

---

<p align="center">
  <a href="https://axionventures.com.au">
    <img src="https://axionventures.com.au/images/policrm-logo-transparent.png" alt="An Axion Ventures project" height="32" />
  </a>
</p>
