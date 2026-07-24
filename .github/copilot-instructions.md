> AEC Checker automates AEC enrolment verification. Keep agents focused on existing flows; avoid aspirational patterns.

## Architecture & Responsibilities
- Pipeline: CSV (NationBuilder schema) → `aec_checker.py` CLI/TUI → `src/aec_core/browser.py` Selenium automation → results CSV with divisions.
- FastAPI CRM (`src/api/main.py`) fronts the same logic: seeds admin users/parties, serves built React assets from `src/api/static/dist`, and mounts routers for members/tags/stats/search/analytics/websocket/ERA.
- BrowserPool (`src/api/worker_pool.py`) is the API-side worker queue: per-thread Firefox drivers, RateLimiter (100/hr, 2000/day), watchdog for stuck workers, ERA short-circuit before hitting AEC.
- Address normalization lives in `src/utils/convert_addresses.py` (streetTypes/stateAbs maps ~220 entries) and must precede browser checks; PO Boxes stay untouched.

## Critical Workflows
- CLI verification: `python aec_checker.py --infile members.csv --outfile verified.csv --threads 2 --headless --max-retries 5 --delay-min 2.0 --delay-max 4.0`. Use `--dry-run` for validation only and keep threads ≤2 to avoid CAPTCHA.
- Data prep: `python src/utils/convert_addresses.py <input.csv> <output.csv>` to normalize addresses; expected columns: first/middle/last/nationbuilder_id/primary_address1/primary_city/primary_state/primary_zip.
- CRM stack: `./run_crm.sh` builds Vite frontend, spins Postgres via Docker if present (else SQLite), then `uvicorn src.api.main:app --reload` on :8000. API docs at /docs, dashboard at /.
- Tests: `python -m pytest tests/ -v`; targeted `python -m unittest tests/test_aec_checker.py`.

## Selenium/AEC Interaction
- Only suburb dropdown uses native `Select`; street uses Select2 search box (see `Select2` flow in `browser.py`).
- Humanization: random user-agents, private browsing, window size randomization, human_type/human_click, base retry delay 3s, rate-limit delay 12-20s between requests, page timeout 20s.
- Result parsing: `extract_electoral_info()` scrapes federal/state/local/ward labels; statuses include PASS, PARTIAL, FAIL_SUBURB, FAIL_STREET, FAIL_NO_MATCH, CAPTCHA.

## Threading & Safety
- `src/aec_core/main.py` worker: never share WebDriver across threads; installs geckodriver once; `MAX_CONSECUTIVE_FAILURES=5` triggers driver reinit; output guarded by `output_lock` and flushed every row.
- BrowserPool mirrors this with per-worker drivers and requeues on driver death; watchdog restarts workers idle >5m.

### Data Flow & CSV Schema

Input CSV (NationBuilder export format):

```
first_name, middle_name, last_name, nationbuilder_id,
primary_address1, primary_city, primary_state, primary_zip
```

Output adds: `AEC_result`, `federal_division`, `state_division`, `local_government`, `local_ward`

**Address normalization** (`convert_addresses.py`) must run first to convert "123 Smith Street" → "SMITH ST" and "Victoria" → "VIC". See `streetTypes` dict (220+ mappings) and `stateAbs` in `src/utils/convert_addresses.py`.

### Result Types (AECResult Enum)

- `PASS`: Electoral divisions extracted via regex (`extract_electoral_info()`)
- `FAIL_SUBURB`: Suburb not in AEC dropdown (missing postcode or typo)
- `FAIL_STREET`: Street not found (address normalization needed)
- `FAIL_NO_MATCH`: Valid check but person not enrolled
- `CAPTCHA`: Bot detection triggered - exponential backoff required
- `PARTIAL`: Manual review needed

## Development Workflows

### Running Checks

```bash
# Interactive TUI (recommended)
python aec_checker.py

# CLI with all options
python aec_checker.py --infile data.csv --outfile results.csv \
  --threads 2 --headless --max-retries 5 --delay-min 2.0 --delay-max 4.0

# Validate data quality without AEC checks
python aec_checker.py --infile data.csv --dry-run
```

### Testing

```bash
# Run all tests
python -m pytest tests/ -v

# Specific test file
python -m unittest tests/test_aec_checker.py
```

Tests cover: address parsing (`get_address_components`), normalization (`convert_addresses`), and API endpoints.

### API Mode (Experimental)

FastAPI backend in `src/api/` for CRM integration:

```bash
cd src/api
uvicorn main:app --reload
```

Uses SQLAlchemy models + worker pool pattern (`BrowserPool` in `worker_pool.py`) to queue checks.

## Code Patterns & Conventions

### Logging

Use Rich for console + file logging:

```python
from rich.logging import RichHandler
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    handlers=[RichHandler(rich_tracebacks=True), file_handler]
)
```

All worker threads log to `aec_checker.log` - **always check this file when debugging failures**.

### Browser Recovery

Workers auto-reinitialize crashed browsers:

```python
def init_driver():
    if driver:
        driver.quit()
    driver = get_driver(driver_path, headless=headless)
    driver.get("https://check.aec.gov.au/")
    return True
```

Monitor consecutive failures (`MAX_CONSECUTIVE_FAILURES = 5`) to detect persistent issues.

### Threading Model

`worker()` function in `src/aec_core/main.py`:

- Uses `queue.Queue` for thread-safe task distribution
- Each thread gets its own WebDriver instance (stored locally in `driver` variable)
- Results written with `output_lock` to prevent CSV corruption
- **Never share WebDriver instances between threads**

### Validation Before Processing

Always call `validate_membership_data()` before `getAECStatus()`:

```python
is_valid, error_msg = validate_membership_data(membership_row)
if not is_valid:
    return AECStatus(AECResult.FAIL, None, None, None, None)
```

Checks: required fields, numeric postcode, non-empty address components.

## File Organization

- `aec_checker.py` - Entry point with TUI (questionary) or CLI passthrough
- `src/aec_core/`
  - `browser.py` - Selenium automation, retry logic, CAPTCHA detection
  - `main.py` - Multithreading, CSV I/O, worker pool coordination
  - `models.py` - Data models (`AECStatus`, field constants)
  - `utils.py` - Name/address parsing helpers
- `src/utils/convert_addresses.py` - Standalone address normalization (can run as CLI)
- `src/api/` - FastAPI backend (optional CRM integration)
- `tests/` - Unit tests (pytest/unittest)

## Common Pitfalls
- Reducing delays/raising thread count causes CAPTCHA floods; prefer delay-min 3.0 / delay-max 5.0 under pressure.
- Missing geckodriver: local copy in `src/aec_core/bin/geckodriver` or fall back to webdriver-manager.
- ERA integration: only short-circuits when state data is loaded; otherwise falls back to browser. Keep `STATE_CODE_MAP` in sync with ERA uploads.
