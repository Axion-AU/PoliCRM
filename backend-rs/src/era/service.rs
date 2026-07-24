/// ERA business-logic service layer.
///
/// Handles:
///   - Bulk INSERT of parsed ERA records (batched, INSERT OR IGNORE)
///   - Background file processing via `tokio::spawn`
///   - Fuzzy search against the ERA records table
///   - Member ↔ ERA matching
///   - Upload-directory sync (auto-resume interrupted imports)
use std::collections::HashMap;
use std::path::Path;

use sqlx::SqlitePool;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::fs::File;

use super::fuzzy::{match_score, name_score};
use super::models::{EraRecord, EraRecordInsert, EraUpload};
use super::parse::{normalize_name, parse_era_row};

// ─── Batch size ───────────────────────────────────────────────────────────────

/// Number of rows to accumulate before flushing to SQLite.
/// Larger batches = fewer round-trips, but more memory.
const BATCH_SIZE: usize = 10_000;

// ─── Search result ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct EraSearchResult {
    pub era_record_id: i64,
    pub surname: String,
    pub given_names: String,
    pub full_address: String,
    pub locality_name: String,
    pub post_code: String,
    pub federal_division: String,
    pub state_district: String,
    pub local_government_area: String,
    pub overall_score: i64,
    pub name_score: i64,
    pub address_score: i64,
}

// ─── ERA statistics ───────────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize)]
pub struct EraStats {
    pub total_records: i64,
    pub total_uploads: i64,
    pub by_state: HashMap<String, i64>,
    pub top_divisions: Vec<DivisionCount>,
    pub total_matches: i64,
    pub verified_matches: i64,
}

#[derive(Debug, serde::Serialize)]
pub struct DivisionCount {
    pub division: String,
    pub count: i64,
}

// ─── Bulk INSERT ──────────────────────────────────────────────────────────────

/// Insert a batch of parsed ERA rows.  Uses `INSERT OR IGNORE` to silently
/// skip rows that violate the unique constraint (surname_norm, given_norm, address).
///
/// SQLite does not support multi-row VALUES in parameterised queries via sqlx,
/// so we execute one INSERT per row inside a single transaction.
pub async fn bulk_insert_batch(
    pool: &SqlitePool,
    records: &[EraRecordInsert],
) -> Result<usize, sqlx::Error> {
    if records.is_empty() {
        return Ok(0);
    }

    let mut tx = pool.begin().await?;
    let mut inserted = 0usize;

    for r in records {
        let result = sqlx::query(
            r#"
            INSERT OR IGNORE INTO era_records (
                upload_id, enrolment_state, transaction_number, federal_direct_indicator,
                title, given_names, surname, surname_normalized, given_names_normalized,
                date_of_birth, gender,
                habitation_name, flat_number, street_number, street_name, street_type,
                locality_name, post_code, state, full_address, enrolled_address_dpid,
                walk_number, enrolled_date, eligibility_flag, gpv_indicator, new_enrolment_flag,
                postal_address, postal_address_dpid,
                federal_division, federal_division_pre_redistribution,
                state_district, state_district_pre_redistribution,
                local_government_area, lga_pre_redistribution, sa1,
                mailing_name, mailing_address_line1, mailing_address_line2,
                mailing_address_line3, mailing_address_line4,
                prev_enrolment_state, prev_transaction_number,
                dual_enrolment_state, dual_transaction_number
            ) VALUES (
                ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,
                ?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,?29,?30,?31,?32,?33,?34,
                ?35,?36,?37,?38,?39,?40,?41,?42,?43,?44,?45
            )
            "#,
        )
        .bind(r.upload_id)
        .bind(&r.enrolment_state)
        .bind(&r.transaction_number)
        .bind(&r.federal_direct_indicator)
        .bind(&r.title)
        .bind(&r.given_names)
        .bind(&r.surname)
        .bind(&r.surname_normalized)
        .bind(&r.given_names_normalized)
        .bind(&r.date_of_birth)
        .bind(&r.gender)
        .bind(&r.habitation_name)
        .bind(&r.flat_number)
        .bind(&r.street_number)
        .bind(&r.street_name)
        .bind(&r.street_type)
        .bind(&r.locality_name)
        .bind(&r.post_code)
        .bind(&r.state)
        .bind(&r.full_address)
        .bind(&r.enrolled_address_dpid)
        .bind(&r.walk_number)
        .bind(&r.enrolled_date)
        .bind(&r.eligibility_flag)
        .bind(&r.gpv_indicator)
        .bind(&r.new_enrolment_flag)
        .bind(&r.postal_address)
        .bind(&r.postal_address_dpid)
        .bind(&r.federal_division)
        .bind(&r.federal_division_pre_redistribution)
        .bind(&r.state_district)
        .bind(&r.state_district_pre_redistribution)
        .bind(&r.local_government_area)
        .bind(&r.lga_pre_redistribution)
        .bind(&r.sa1)
        .bind(&r.mailing_name)
        .bind(&r.mailing_address_line1)
        .bind(&r.mailing_address_line2)
        .bind(&r.mailing_address_line3)
        .bind(&r.mailing_address_line4)
        .bind(&r.prev_enrolment_state)
        .bind(&r.prev_transaction_number)
        .bind(&r.dual_enrolment_state)
        .bind(&r.dual_transaction_number)
        .execute(&mut *tx)
        .await?;

        inserted += result.rows_affected() as usize;
    }

    tx.commit().await?;
    Ok(inserted)
}

// ─── Background file processor ────────────────────────────────────────────────

/// Parse an ERA `.txt` file and insert all records into the database.
///
/// Called via `tokio::spawn` from the upload handler.  Updates `era_uploads`
/// with progress as it goes, sets status to `complete` or `error` when done.
pub async fn process_era_file(pool: SqlitePool, file_path: String, upload_id: i64) {
    eprintln!("[ERA] Starting parse: {file_path} (upload_id={upload_id})");

    // Mark as parsing
    if let Err(e) = sqlx::query("UPDATE era_uploads SET status='parsing', updated_at=CURRENT_TIMESTAMP WHERE id=?1")
        .bind(upload_id)
        .execute(&pool)
        .await
    {
        eprintln!("[ERA] Failed to set status=parsing: {e}");
        return;
    }

    match process_era_file_inner(&pool, &file_path, upload_id).await {
        Ok(total) => {
            eprintln!("[ERA] Complete: {total} records inserted (upload_id={upload_id})");
            let _ = sqlx::query(
                "UPDATE era_uploads SET status='complete', record_count=?1, updated_at=CURRENT_TIMESTAMP WHERE id=?2",
            )
            .bind(total as i64)
            .bind(upload_id)
            .execute(&pool)
            .await;
        }
        Err(e) => {
            eprintln!("[ERA] Error processing file {file_path}: {e}");
            let msg = e.to_string();
            let _ = sqlx::query(
                "UPDATE era_uploads SET status='error', error_message=?1, updated_at=CURRENT_TIMESTAMP WHERE id=?2",
            )
            .bind(&msg)
            .bind(upload_id)
            .execute(&pool)
            .await;
        }
    }
}

async fn process_era_file_inner(
    pool: &SqlitePool,
    file_path: &str,
    upload_id: i64,
) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    let file = File::open(file_path).await?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();

    // Skip header row
    lines.next_line().await?;

    let mut batch: Vec<EraRecordInsert> = Vec::with_capacity(BATCH_SIZE);
    let mut total = 0usize;
    let mut errors = 0usize;

    while let Some(line) = lines.next_line().await? {
        match parse_era_row(&line, upload_id) {
            Some(record) => {
                batch.push(record);
                if batch.len() >= BATCH_SIZE {
                    let n = bulk_insert_batch(pool, &batch).await?;
                    total += n;
                    batch.clear();

                    // Update progress in DB every batch
                    let _ = sqlx::query(
                        "UPDATE era_uploads SET record_count=?1, updated_at=CURRENT_TIMESTAMP WHERE id=?2",
                    )
                    .bind(total as i64)
                    .bind(upload_id)
                    .execute(pool)
                    .await;

                    if total % 100_000 == 0 {
                        eprintln!("[ERA] Parsed {total} records so far...");
                    }
                }
            }
            None => {
                errors += 1;
                if errors <= 10 {
                    eprintln!("[ERA] Skipped empty/invalid row");
                }
            }
        }
    }

    // Flush remainder
    if !batch.is_empty() {
        let n = bulk_insert_batch(pool, &batch).await?;
        total += n;
    }

    eprintln!("[ERA] Parse complete: {total} rows inserted, {errors} skipped");
    Ok(total)
}

// ─── Fuzzy search ─────────────────────────────────────────────────────────────

/// Candidate limit for fuzzy search queries (pre-filter, before scoring).
const CANDIDATE_LIMIT: i64 = 1000;
const CANDIDATE_LIMIT_NAME_ONLY: i64 = 5000;

pub async fn search_era_records(
    pool: &SqlitePool,
    surname: &str,
    given_names: Option<&str>,
    locality: Option<&str>,
    postcode: Option<&str>,
    limit: usize,
    threshold: i64,
) -> Result<Vec<EraSearchResult>, sqlx::Error> {
    let surname_norm = normalize_name(surname);
    let name_only = postcode.is_none() && locality.is_none();

    // ── Candidate fetch ──────────────────────────────────────────────────────
    // Pre-filter by postcode (exact) or locality prefix, then by surname prefix.
    // We deliberately fetch more candidates than `limit` and rank in Rust.

    let candidate_limit = if name_only { CANDIDATE_LIMIT_NAME_ONLY } else { CANDIDATE_LIMIT };

    // Build query dynamically
    let candidates: Vec<EraRecord> = if name_only {
        // Name-only: exact surname match for precision
        sqlx::query_as::<_, EraRecord>(
            "SELECT * FROM era_records WHERE surname_normalized = ?1 LIMIT ?2",
        )
        .bind(&surname_norm)
        .bind(candidate_limit)
        .fetch_all(pool)
        .await?
    } else if let Some(pc) = postcode {
        let prefix = format!("{}%", &surname_norm.chars().take(3).collect::<String>());
        sqlx::query_as::<_, EraRecord>(
            "SELECT * FROM era_records WHERE post_code = ?1 AND surname_normalized LIKE ?2 LIMIT ?3",
        )
        .bind(pc)
        .bind(&prefix)
        .bind(candidate_limit)
        .fetch_all(pool)
        .await?
    } else {
        // locality-only filter
        let loc_prefix = locality
            .map(|l| format!("%{}%", &l.chars().take(4).collect::<String>()))
            .unwrap_or_else(|| "%".to_string());
        let surname_prefix = format!("{}%", &surname_norm.chars().take(3).collect::<String>());
        sqlx::query_as::<_, EraRecord>(
            "SELECT * FROM era_records WHERE locality_name LIKE ?1 AND surname_normalized LIKE ?2 LIMIT ?3",
        )
        .bind(&loc_prefix)
        .bind(&surname_prefix)
        .bind(candidate_limit)
        .fetch_all(pool)
        .await?
    };

    // ── Fuzzy scoring ────────────────────────────────────────────────────────
    let mut results: Vec<EraSearchResult> = Vec::new();

    for era in candidates {
        let era_surname = era.surname.as_deref().unwrap_or("");
        let era_given = era.given_names.as_deref().unwrap_or("");
        let era_locality = era.locality_name.as_deref().unwrap_or("");
        let era_postcode = era.post_code.as_deref().unwrap_or("");

        let (overall, name_sc, addr_sc) = if name_only {
            // Name-only scoring (no address context)
            let (ns, _, _) = name_score(surname, given_names.unwrap_or(""), era_surname, era_given);
            let effective_threshold = 50; // lower bar for exact-surname queries
            if ns < effective_threshold {
                continue;
            }
            (ns, ns, 0i64)
        } else {
            match_score(
                surname,
                given_names.unwrap_or(""),
                locality.unwrap_or(""),
                postcode.unwrap_or(""),
                era_surname,
                era_given,
                era_locality,
                era_postcode,
            )
        };

        let effective_threshold = if name_only { 50 } else { threshold };
        if overall >= effective_threshold {
            results.push(EraSearchResult {
                era_record_id: era.id,
                surname: era.surname.unwrap_or_default(),
                given_names: era.given_names.unwrap_or_default(),
                full_address: era.full_address.unwrap_or_default(),
                locality_name: era.locality_name.unwrap_or_default(),
                post_code: era.post_code.unwrap_or_default(),
                federal_division: era.federal_division.unwrap_or_default(),
                state_district: era.state_district.unwrap_or_default(),
                local_government_area: era.local_government_area.unwrap_or_default(),
                overall_score: overall,
                name_score: name_sc,
                address_score: addr_sc,
            });
        }
    }

    // ── Deduplication: keep highest score for same name+address ─────────────
    let mut seen: HashMap<(String, String, String), EraSearchResult> = HashMap::new();
    for r in results {
        let key = (
            r.surname.to_lowercase(),
            r.given_names.to_lowercase(),
            r.full_address.to_lowercase(),
        );
        let entry = seen.entry(key).or_insert_with(|| r.clone());
        if r.overall_score > entry.overall_score {
            *entry = r;
        }
    }

    let mut ranked: Vec<EraSearchResult> = seen.into_values().collect();
    ranked.sort_by(|a, b| b.overall_score.cmp(&a.overall_score));
    ranked.truncate(limit);
    Ok(ranked)
}

// ─── Member matching ──────────────────────────────────────────────────────────

/// Attempt to match a CRM person against ERA records.
/// Returns the best match above `threshold`, or `None`.
pub async fn match_person_to_era(
    pool: &SqlitePool,
    last_name: &str,
    first_name: &str,
    city: &str,
    zip: &str,
    threshold: i64,
) -> Result<Option<EraSearchResult>, sqlx::Error> {
    let results = search_era_records(
        pool,
        last_name,
        Some(first_name),
        Some(city),
        Some(zip),
        1,
        threshold,
    )
    .await?;
    Ok(results.into_iter().next())
}

/// Save a match result to `era_matches`.
pub async fn save_era_match(
    pool: &SqlitePool,
    person_id: &str,
    result: &EraSearchResult,
) -> Result<i64, sqlx::Error> {
    let id = sqlx::query_scalar(
        r#"
        INSERT INTO era_matches (
            person_id, era_record_id,
            overall_score, name_score, address_score,
            federal_division, state_district, local_government_area
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        RETURNING id
        "#,
    )
    .bind(person_id)
    .bind(result.era_record_id)
    .bind(result.overall_score)
    .bind(result.name_score)
    .bind(result.address_score)
    .bind(&result.federal_division)
    .bind(&result.state_district)
    .bind(&result.local_government_area)
    .fetch_one(pool)
    .await?;

    Ok(id)
}

// ─── Stats ────────────────────────────────────────────────────────────────────

pub async fn get_era_stats(pool: &SqlitePool) -> Result<EraStats, sqlx::Error> {
    let total_records: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM era_records")
            .fetch_one(pool)
            .await?;

    let total_uploads: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM era_uploads")
            .fetch_one(pool)
            .await?;

    let by_state_rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT COALESCE(enrolment_state,''), COUNT(*) FROM era_records GROUP BY enrolment_state",
    )
    .fetch_all(pool)
    .await?;

    let by_state: HashMap<String, i64> = by_state_rows.into_iter().collect();

    let top_div_rows: Vec<(String, i64)> = sqlx::query_as(
        r#"SELECT federal_division, COUNT(*) as cnt
           FROM era_records
           WHERE federal_division IS NOT NULL
           GROUP BY federal_division
           ORDER BY cnt DESC
           LIMIT 10"#,
    )
    .fetch_all(pool)
    .await?;

    let top_divisions = top_div_rows
        .into_iter()
        .map(|(division, count)| DivisionCount { division, count })
        .collect();

    let total_matches: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM era_matches")
            .fetch_one(pool)
            .await?;

    let verified_matches: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM era_matches WHERE is_verified=1")
            .fetch_one(pool)
            .await?;

    Ok(EraStats {
        total_records,
        total_uploads,
        by_state,
        top_divisions,
        total_matches,
        verified_matches,
    })
}

// ─── Directory sync ───────────────────────────────────────────────────────────

/// Scan `era_dir` for `.txt` files; auto-create upload records and queue
/// parsing for any that are new or previously interrupted.
///
/// Mirrors Python's `sync_era_files`.
pub async fn sync_era_files(pool: &SqlitePool, era_dir: &str) {
    let dir = Path::new(era_dir);
    if !dir.exists() {
        if let Err(e) = std::fs::create_dir_all(dir) {
            eprintln!("[ERA] Could not create ERA dir {era_dir}: {e}");
            return;
        }
    }

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("[ERA] Could not read ERA dir: {e}");
            return;
        }
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let filename = match path.file_name().and_then(|n| n.to_str()) {
            Some(f) if f.ends_with(".txt") => f.to_string(),
            _ => continue,
        };

        let upload: Option<EraUpload> =
            sqlx::query_as("SELECT * FROM era_uploads WHERE filename=?1 ORDER BY id DESC LIMIT 1")
                .bind(&filename)
                .fetch_optional(pool)
                .await
                .unwrap_or(None);

        let (should_parse, upload_id) = match upload {
            None => {
                // New file — create an upload record
                let id: i64 = sqlx::query_scalar(
                    "INSERT INTO era_uploads (filename, state, status) VALUES (?1, ?2, 'pending') RETURNING id",
                )
                .bind(&filename)
                .bind(extract_state_from_filename(&filename))
                .fetch_one(pool)
                .await
                .unwrap_or(0);
                eprintln!("[ERA] New file queued: {filename} (id={id})");
                (true, id)
            }
            Some(ref u) if u.status == "pending" || u.status == "parsing" => {
                // Interrupted — resume
                eprintln!("[ERA] Resuming interrupted file: {filename} (status={})", u.status);
                let _ = sqlx::query(
                    "UPDATE era_uploads SET status='pending', updated_at=CURRENT_TIMESTAMP WHERE id=?1",
                )
                .bind(u.id)
                .execute(pool)
                .await;
                (true, u.id)
            }
            Some(ref u) if u.status == "error" => {
                // Error — retry
                eprintln!("[ERA] Retrying errored file: {filename}");
                let _ = sqlx::query(
                    "UPDATE era_uploads SET status='pending', updated_at=CURRENT_TIMESTAMP WHERE id=?1",
                )
                .bind(u.id)
                .execute(pool)
                .await;
                (true, u.id)
            }
            Some(ref u) => {
                eprintln!("[ERA] File {filename} already complete (status={})", u.status);
                (false, u.id)
            }
        };

        if should_parse {
            let pool_clone = pool.clone();
            let fp = path.to_string_lossy().to_string();
            tokio::spawn(async move {
                process_era_file(pool_clone, fp, upload_id).await;
            });
        }
    }
}

/// Extract a 3-char state code from an ERA filename like `xxx_VIC.txt`.
fn extract_state_from_filename(filename: &str) -> Option<String> {
    filename
        .trim_end_matches(".txt")
        .rsplit('_')
        .next()
        .map(|s| s.chars().take(3).collect())
}
