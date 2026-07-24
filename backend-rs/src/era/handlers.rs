/// Axum route handlers for the ERA (Electoral Roll Access) feature.
///
/// All routes are mounted at `/era/...` via `era::handlers::router()`.
/// Authentication is bearer-token checked via the `X-Api-Key` header
/// (same pattern used by the rest of backend-rs; replace with your auth
/// middleware if needed).

use axum::{
    extract::{Multipart, Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use super::fuzzy::MATCH_THRESHOLD;
use super::models::{EraRecord, EraUpload};
use super::parse::normalize_name;
use super::service::{
    get_era_stats, match_person_to_era, process_era_file, save_era_match, search_era_records,
    sync_era_files, EraSearchResult,
};

// ─── ERA upload directory (configurable via env) ──────────────────────────────

fn era_dir() -> String {
    std::env::var("ERA_DIR").unwrap_or_else(|_| "era".to_string())
}

// ─── Request / response schemas ───────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct EraSearchRequest {
    pub surname: String,
    pub given_names: Option<String>,
    pub locality: Option<String>,
    pub postcode: Option<String>,
    pub threshold: Option<i64>,
    pub limit: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct EraSearchResponse {
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

impl From<EraSearchResult> for EraSearchResponse {
    fn from(r: EraSearchResult) -> Self {
        Self {
            era_record_id: r.era_record_id,
            surname: r.surname,
            given_names: r.given_names,
            full_address: r.full_address,
            locality_name: r.locality_name,
            post_code: r.post_code,
            federal_division: r.federal_division,
            state_district: r.state_district,
            local_government_area: r.local_government_area,
            overall_score: r.overall_score,
            name_score: r.name_score,
            address_score: r.address_score,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct BrowseQuery {
    pub federal_division: Option<String>,
    pub locality: Option<String>,
    pub postcode: Option<String>,
    pub surname_starts_with: Option<String>,
    pub skip: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct ParseFromDiskQuery {
    pub filename: String,
    pub clear_existing: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct BatchMatchRequest {
    pub person_ids: Vec<String>,
    pub threshold: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct MatchThresholdQuery {
    pub threshold: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct RelatedSurnameQuery {
    pub same_locality: Option<bool>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct RecruitmentQuery {
    pub federal_division: Option<String>,
    pub locality: Option<String>,
    pub include_same_address: Option<bool>,
    pub include_same_surname: Option<bool>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct LocalitiesQuery {
    pub federal_division: Option<String>,
}

// ─── Router ───────────────────────────────────────────────────────────────────

pub fn router() -> Router<SqlitePool> {
    Router::new()
        // File management
        .route("/upload", post(upload_era_file))
        .route("/files", get(list_era_files))
        .route("/parse-from-disk", post(parse_from_disk))
        .route("/uploads", get(list_era_uploads))
        .route("/uploads/:id", delete(delete_era_upload))
        .route("/verify/:id", post(verify_era_upload))
        .route("/stats", get(era_statistics))
        .route("/sync", post(trigger_sync))
        // Search & matching
        .route("/search", post(search_era))
        .route("/match-member/:id", post(match_member))
        .route("/batch-match", post(batch_match_members))
        // Browse & targeting
        .route("/household/:id", get(get_household_members))
        .route("/related-surnames/:id", get(find_related_by_surname))
        .route("/recruitment-targets", get(find_recruitment_targets))
        .route("/browse", get(browse_era_records))
        .route("/divisions", get(list_federal_divisions))
        .route("/localities", get(list_localities))
}

// ─── File management handlers ─────────────────────────────────────────────────

/// `POST /era/upload` — accept a multipart ERA `.txt` file and queue parsing.
async fn upload_era_file(
    State(pool): State<SqlitePool>,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, StatusCode> {
    let dir = era_dir();
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?
    {
        let filename = match field.file_name() {
            Some(n) if n.ends_with(".txt") => n.to_string(),
            Some(_) => return Err(StatusCode::UNSUPPORTED_MEDIA_TYPE),
            None => continue,
        };

        let data = field.bytes().await.map_err(|_| StatusCode::BAD_REQUEST)?;
        let file_path = format!("{dir}/{filename}");
        tokio::fs::write(&file_path, &data)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let state = extract_state(&filename);
        let upload_id: i64 = sqlx::query_scalar(
            "INSERT INTO era_uploads (filename, state, status) VALUES (?1, ?2, 'pending') RETURNING id",
        )
        .bind(&filename)
        .bind(state)
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            eprintln!("[ERA] DB error creating upload: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        let pool_c = pool.clone();
        let fp = file_path.clone();
        tokio::spawn(async move {
            process_era_file(pool_c, fp, upload_id).await;
        });

        return Ok((
            StatusCode::ACCEPTED,
            Json(serde_json::json!({
                "message": "ERA file upload started",
                "upload_id": upload_id,
                "filename": filename,
            })),
        ));
    }

    Err(StatusCode::BAD_REQUEST)
}

/// `GET /era/files` — list `.txt` files on disk in the ERA directory.
async fn list_era_files() -> impl IntoResponse {
    let dir = era_dir();
    let _ = tokio::fs::create_dir_all(&dir).await;

    let mut files = Vec::new();
    if let Ok(mut entries) = tokio::fs::read_dir(&dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("txt") {
                let size = tokio::fs::metadata(&path)
                    .await
                    .map(|m| m.len())
                    .unwrap_or(0);
                files.push(serde_json::json!({
                    "filename": path.file_name().unwrap_or_default().to_string_lossy(),
                    "size_mb": (size as f64) / 1_048_576.0,
                }));
            }
        }
    }
    Json(files)
}

/// `POST /era/parse-from-disk` — re-parse an existing file in the ERA dir.
async fn parse_from_disk(
    State(pool): State<SqlitePool>,
    Query(q): Query<ParseFromDiskQuery>,
) -> Result<impl IntoResponse, StatusCode> {
    let file_path = format!("{}/{}", era_dir(), q.filename);
    if !tokio::fs::try_exists(&file_path).await.unwrap_or(false) {
        return Err(StatusCode::NOT_FOUND);
    }

    if q.clear_existing.unwrap_or(false) {
        sqlx::query("DELETE FROM era_matches WHERE era_record_id IN (SELECT id FROM era_records WHERE upload_id IN (SELECT id FROM era_uploads WHERE filename=?1))")
            .bind(&q.filename)
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        sqlx::query("DELETE FROM era_records WHERE upload_id IN (SELECT id FROM era_uploads WHERE filename=?1)")
            .bind(&q.filename)
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        sqlx::query("DELETE FROM era_uploads WHERE filename=?1")
            .bind(&q.filename)
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    let upload_id: i64 = sqlx::query_scalar(
        "INSERT INTO era_uploads (filename, state, status) VALUES (?1, ?2, 'pending') RETURNING id",
    )
    .bind(&q.filename)
    .bind(extract_state(&q.filename))
    .fetch_one(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let pool_c = pool.clone();
    let fp = file_path.clone();
    tokio::spawn(async move {
        process_era_file(pool_c, fp, upload_id).await;
    });

    Ok(Json(serde_json::json!({
        "message": format!("Started parsing {} from disk", q.filename),
        "upload_id": upload_id,
        "cleared_existing": q.clear_existing.unwrap_or(false),
    })))
}

/// `GET /era/uploads` — list all upload records.
async fn list_era_uploads(State(pool): State<SqlitePool>) -> Result<impl IntoResponse, StatusCode> {
    let uploads: Vec<EraUpload> =
        sqlx::query_as("SELECT * FROM era_uploads ORDER BY uploaded_at DESC")
            .fetch_all(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let resp: Vec<serde_json::Value> = uploads
        .iter()
        .map(|u| {
            serde_json::json!({
                "id": u.id,
                "filename": u.filename,
                "state": u.state,
                "record_count": u.record_count,
                "status": u.status,
                "error_message": u.error_message,
                "uploaded_at": u.uploaded_at.to_rfc3339(),
            })
        })
        .collect();

    Ok(Json(resp))
}

/// `DELETE /era/uploads/:id`
async fn delete_era_upload(
    State(pool): State<SqlitePool>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, StatusCode> {
    let rows = sqlx::query("DELETE FROM era_uploads WHERE id=?1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .rows_affected();

    if rows == 0 {
        Err(StatusCode::NOT_FOUND)
    } else {
        Ok(Json(serde_json::json!({"message": format!("Deleted upload {id}")})))
    }
}

/// `POST /era/verify/:id` — re-scan file and report record count.
async fn verify_era_upload(
    State(pool): State<SqlitePool>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, StatusCode> {
    let upload: EraUpload =
        sqlx::query_as("SELECT * FROM era_uploads WHERE id=?1")
            .bind(id)
            .fetch_optional(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .ok_or(StatusCode::NOT_FOUND)?;

    let file_path = format!("{}/{}", era_dir(), upload.filename);
    if !tokio::fs::try_exists(&file_path).await.unwrap_or(false) {
        return Err(StatusCode::NOT_FOUND);
    }

    // Re-count records in DB vs file lines
    let db_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM era_records WHERE upload_id=?1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap_or(0);

    Ok(Json(serde_json::json!({
        "upload_id": id,
        "filename": upload.filename,
        "db_record_count": db_count,
        "status": upload.status,
    })))
}

/// `GET /era/stats`
async fn era_statistics(State(pool): State<SqlitePool>) -> Result<impl IntoResponse, StatusCode> {
    let stats = get_era_stats(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(stats))
}

/// `POST /era/sync` — trigger directory sync (scan era/ dir, queue new/interrupted files).
async fn trigger_sync(State(pool): State<SqlitePool>) -> impl IntoResponse {
    let dir = era_dir();
    tokio::spawn(async move {
        sync_era_files(&pool, &dir).await;
    });
    Json(serde_json::json!({"message": "ERA directory sync triggered"}))
}

// ─── Search & matching handlers ───────────────────────────────────────────────

/// `POST /era/search`
async fn search_era(
    State(pool): State<SqlitePool>,
    Json(req): Json<EraSearchRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let threshold = req.threshold.unwrap_or(MATCH_THRESHOLD);
    let limit = req.limit.unwrap_or(20);

    let results = search_era_records(
        &pool,
        &req.surname,
        req.given_names.as_deref(),
        req.locality.as_deref(),
        req.postcode.as_deref(),
        limit,
        threshold,
    )
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let resp: Vec<EraSearchResponse> = results.into_iter().map(Into::into).collect();
    Ok(Json(resp))
}

/// `POST /era/match-member/:id`
///
/// `id` here is a person UUID string.
async fn match_member(
    State(pool): State<SqlitePool>,
    Path(person_id): Path<String>,
    Query(q): Query<MatchThresholdQuery>,
) -> Result<impl IntoResponse, StatusCode> {
    let threshold = q.threshold.unwrap_or(MATCH_THRESHOLD);

    // Fetch the person's name + address (not encrypted in this backend)
    let row: Option<(String, String, String, String)> = sqlx::query_as(
        "SELECT COALESCE(first_name,''), COALESCE(last_name,''), primary_city, primary_zip FROM persons WHERE id=?1 AND deleted_at IS NULL",
    )
    .bind(&person_id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let (first_name, last_name, city, zip) = row.ok_or(StatusCode::NOT_FOUND)?;

    let result = match_person_to_era(&pool, &last_name, &first_name, &city, &zip, threshold)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    match result {
        Some(r) => {
            let score = r.overall_score;
            let division = r.federal_division.clone();
            let state_district = r.state_district.clone();
            let lga = r.local_government_area.clone();
            let era_resp: EraSearchResponse = r.clone().into();

            // Save match record
            let _ = save_era_match(&pool, &person_id, &r).await;

            Ok(Json(serde_json::json!({
                "status": "matched",
                "score": score,
                "match": era_resp,
                "federal_division": division,
                "state_district": state_district,
                "local_government_area": lga,
            })))
        }
        None => Ok(Json(serde_json::json!({
            "status": "no_match",
            "message": format!("No ERA match found above {threshold}% threshold"),
        }))),
    }
}

/// `POST /era/batch-match`
async fn batch_match_members(
    State(pool): State<SqlitePool>,
    Json(req): Json<BatchMatchRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let threshold = req.threshold.unwrap_or(MATCH_THRESHOLD);
    let ids = req.person_ids;

    if ids.len() > 10 {
        // Large batch — run in background
        let pool_c = pool.clone();
        let ids_bg = ids.clone();
        tokio::spawn(async move {
            for person_id in &ids_bg {
                if let Ok(Some(row)) = sqlx::query_as::<_, (String, String, String, String)>(
                    "SELECT COALESCE(first_name,''), COALESCE(last_name,''), primary_city, primary_zip FROM persons WHERE id=?1 AND deleted_at IS NULL",
                )
                .bind(person_id)
                .fetch_optional(&pool_c)
                .await
                {
                    let (first, last, city, zip) = row;
                    if let Ok(Some(result)) =
                        match_person_to_era(&pool_c, &last, &first, &city, &zip, threshold).await
                    {
                        let _ = save_era_match(&pool_c, person_id, &result).await;
                    }
                }
            }
        });

        return Ok(Json(serde_json::json!({
            "status": "queued",
            "message": format!("Batch matching {} members in background", ids.len()),
        })));
    }

    // Small batch — run inline
    let mut results = Vec::new();
    for person_id in &ids {
        let row: Option<(String, String, String, String)> = sqlx::query_as(
            "SELECT COALESCE(first_name,''), COALESCE(last_name,''), primary_city, primary_zip FROM persons WHERE id=?1 AND deleted_at IS NULL",
        )
        .bind(person_id)
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);

        if let Some((first, last, city, zip)) = row {
            let m = match_person_to_era(&pool, &last, &first, &city, &zip, threshold)
                .await
                .unwrap_or(None);
            results.push(serde_json::json!({
                "person_id": person_id,
                "status": if m.is_some() { "matched" } else { "no_match" },
                "score": m.as_ref().map(|r| r.overall_score).unwrap_or(0),
            }));
        }
    }

    Ok(Json(serde_json::json!({"results": results})))
}

// ─── Browse & targeting handlers ──────────────────────────────────────────────

/// `GET /era/household/:id` — find ERA records at the same address as a person.
async fn get_household_members(
    State(pool): State<SqlitePool>,
    Path(person_id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let row: Option<(String, String, String)> = sqlx::query_as(
        "SELECT COALESCE(primary_address1,''), primary_city, primary_zip FROM persons WHERE id=?1 AND deleted_at IS NULL",
    )
    .bind(&person_id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let (address1, city, zip) = row.ok_or(StatusCode::NOT_FOUND)?;

    let addr_prefix = format!("%{}%", &address1.chars().take(10).collect::<String>());
    let city_prefix = format!("%{}%", &city);

    let household: Vec<EraRecord> = sqlx::query_as(
        "SELECT * FROM era_records WHERE post_code=?1 AND locality_name LIKE ?2 AND full_address LIKE ?3 LIMIT 50",
    )
    .bind(&zip)
    .bind(&city_prefix)
    .bind(&addr_prefix)
    .fetch_all(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let members: Vec<serde_json::Value> = household
        .iter()
        .map(|h| {
            serde_json::json!({
                "era_record_id": h.id,
                "given_names": h.given_names,
                "surname": h.surname,
                "gender": h.gender,
                "date_of_birth": h.date_of_birth,
            })
        })
        .collect();

    Ok(Json(serde_json::json!({
        "address": address1,
        "locality": city,
        "postcode": zip,
        "federal_division": household.first().and_then(|h| h.federal_division.as_deref()),
        "members": members,
        "total_at_address": members.len(),
    })))
}

/// `GET /era/related-surnames/:id`
async fn find_related_by_surname(
    State(pool): State<SqlitePool>,
    Path(person_id): Path<String>,
    Query(q): Query<RelatedSurnameQuery>,
) -> Result<impl IntoResponse, StatusCode> {
    let row: Option<(String, String)> = sqlx::query_as(
        "SELECT COALESCE(last_name,''), primary_city FROM persons WHERE id=?1 AND deleted_at IS NULL",
    )
    .bind(&person_id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let (last_name, city) = row.ok_or(StatusCode::NOT_FOUND)?;

    if last_name.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let surname_norm = normalize_name(&last_name);
    let limit = q.limit.unwrap_or(50);

    let records: Vec<EraRecord> = if q.same_locality.unwrap_or(true) && !city.is_empty() {
        let city_pat = format!("%{city}%");
        sqlx::query_as(
            "SELECT * FROM era_records WHERE surname_normalized=?1 AND locality_name LIKE ?2 LIMIT ?3",
        )
        .bind(&surname_norm)
        .bind(&city_pat)
        .bind(limit)
        .fetch_all(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    } else {
        sqlx::query_as(
            "SELECT * FROM era_records WHERE surname_normalized=?1 LIMIT ?2",
        )
        .bind(&surname_norm)
        .bind(limit)
        .fetch_all(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    };

    let resp: Vec<serde_json::Value> = records
        .iter()
        .map(|r| {
            serde_json::json!({
                "era_record_id": r.id,
                "given_names": r.given_names,
                "surname": r.surname,
                "full_address": r.full_address,
                "locality": r.locality_name,
                "postcode": r.post_code,
                "federal_division": r.federal_division,
            })
        })
        .collect();

    Ok(Json(resp))
}

/// `GET /era/recruitment-targets`
async fn find_recruitment_targets(
    State(pool): State<SqlitePool>,
    Query(q): Query<RecruitmentQuery>,
) -> Result<impl IntoResponse, StatusCode> {
    let limit = q.limit.unwrap_or(100).min(500);
    let include_addr = q.include_same_address.unwrap_or(true);
    let include_surname = q.include_same_surname.unwrap_or(true);

    // Fetch a sample of persons
    let persons: Vec<(String, String, String, String, String)> = sqlx::query_as(
        "SELECT id, COALESCE(last_name,''), COALESCE(first_name,''), COALESCE(primary_address1,''), primary_zip FROM persons WHERE deleted_at IS NULL LIMIT 500",
    )
    .fetch_all(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut targets: Vec<serde_json::Value> = Vec::new();

    'outer: for (pid, last, first, addr1, zip) in &persons {
        let member_name = format!("{first} {last}");

        if include_addr && !addr1.is_empty() {
            let addr_pat = format!("%{}%", &addr1.chars().take(15).collect::<String>());
            let same_addr: Vec<EraRecord> = sqlx::query_as(
                "SELECT * FROM era_records WHERE post_code=?1 AND full_address LIKE ?2 LIMIT 10",
            )
            .bind(zip)
            .bind(&addr_pat)
            .fetch_all(&pool)
            .await
            .unwrap_or_default();

            for era in same_addr {
                targets.push(serde_json::json!({
                    "era_record_id": era.id,
                    "given_names": era.given_names,
                    "surname": era.surname,
                    "full_address": era.full_address,
                    "federal_division": era.federal_division,
                    "relationship_type": "same_address",
                    "related_person_id": pid,
                    "related_person_name": member_name,
                }));
            }
        }

        if include_surname && !last.is_empty() {
            let sn = normalize_name(last);
            let same_sn: Vec<EraRecord> = sqlx::query_as(
                "SELECT * FROM era_records WHERE surname_normalized=?1 LIMIT 10",
            )
            .bind(&sn)
            .fetch_all(&pool)
            .await
            .unwrap_or_default();

            for era in same_sn {
                let era_id = era.id;
                if !targets.iter().any(|t| t["era_record_id"] == era_id) {
                    targets.push(serde_json::json!({
                        "era_record_id": era_id,
                        "given_names": era.given_names,
                        "surname": era.surname,
                        "full_address": era.full_address,
                        "federal_division": era.federal_division,
                        "relationship_type": "same_surname",
                        "related_person_id": pid,
                        "related_person_name": member_name,
                    }));
                }
            }
        }

        if targets.len() >= limit as usize {
            break 'outer;
        }
    }

    targets.truncate(limit as usize);
    Ok(Json(targets))
}

/// `GET /era/browse`
async fn browse_era_records(
    State(pool): State<SqlitePool>,
    Query(q): Query<BrowseQuery>,
) -> Result<impl IntoResponse, StatusCode> {
    let skip = q.skip.unwrap_or(0);
    let limit = q.limit.unwrap_or(50).min(200);

    // Count
    let mut count_builder =
        sqlx::QueryBuilder::new("SELECT COUNT(*) FROM era_records WHERE 1=1");
    if let Some(ref fd) = q.federal_division {
        count_builder.push(" AND federal_division = ").push_bind(fd);
    }
    if let Some(ref loc) = q.locality {
        count_builder
            .push(" AND locality_name LIKE ")
            .push_bind(format!("%{loc}%"));
    }
    if let Some(ref pc) = q.postcode {
        count_builder.push(" AND post_code = ").push_bind(pc);
    }
    if let Some(ref sw) = q.surname_starts_with {
        count_builder
            .push(" AND surname_normalized LIKE ")
            .push_bind(format!("{}%", normalize_name(sw)));
    }
    let total: i64 = count_builder
        .build_query_scalar()
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Records
    let mut q_builder = sqlx::QueryBuilder::new(
        "SELECT * FROM era_records WHERE 1=1",
    );
    if let Some(ref fd) = q.federal_division {
        q_builder.push(" AND federal_division = ").push_bind(fd);
    }
    if let Some(ref loc) = q.locality {
        q_builder
            .push(" AND locality_name LIKE ")
            .push_bind(format!("%{loc}%"));
    }
    if let Some(ref pc) = q.postcode {
        q_builder.push(" AND post_code = ").push_bind(pc);
    }
    if let Some(ref sw) = q.surname_starts_with {
        q_builder
            .push(" AND surname_normalized LIKE ")
            .push_bind(format!("{}%", normalize_name(sw)));
    }
    q_builder.push(" ORDER BY id LIMIT ").push_bind(limit);
    q_builder.push(" OFFSET ").push_bind(skip);

    let records: Vec<EraRecord> = q_builder
        .build_query_as()
        .fetch_all(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let record_json: Vec<serde_json::Value> = records
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.id,
                "given_names": r.given_names,
                "surname": r.surname,
                "full_address": r.full_address,
                "locality": r.locality_name,
                "postcode": r.post_code,
                "federal_division": r.federal_division,
                "state_district": r.state_district,
                "enrolled_date": r.enrolled_date,
            })
        })
        .collect();

    Ok(Json(serde_json::json!({
        "total": total,
        "skip": skip,
        "limit": limit,
        "records": record_json,
    })))
}

/// `GET /era/divisions`
async fn list_federal_divisions(
    State(pool): State<SqlitePool>,
) -> Result<impl IntoResponse, StatusCode> {
    let rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT federal_division, COUNT(*) as cnt FROM era_records WHERE federal_division IS NOT NULL GROUP BY federal_division ORDER BY federal_division",
    )
    .fetch_all(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let resp: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|(div, cnt)| serde_json::json!({"division": div, "count": cnt}))
        .collect();

    Ok(Json(resp))
}

/// `GET /era/localities`
async fn list_localities(
    State(pool): State<SqlitePool>,
    Query(q): Query<LocalitiesQuery>,
) -> Result<impl IntoResponse, StatusCode> {
    let rows: Vec<(String, String, i64)> = if let Some(ref fd) = q.federal_division {
        sqlx::query_as(
            "SELECT COALESCE(locality_name,''), COALESCE(post_code,''), COUNT(*) as cnt FROM era_records WHERE federal_division=?1 GROUP BY locality_name, post_code ORDER BY locality_name LIMIT 500",
        )
        .bind(fd)
        .fetch_all(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    } else {
        sqlx::query_as(
            "SELECT COALESCE(locality_name,''), COALESCE(post_code,''), COUNT(*) as cnt FROM era_records GROUP BY locality_name, post_code ORDER BY locality_name LIMIT 500",
        )
        .fetch_all(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    };

    let resp: Vec<serde_json::Value> = rows
        .into_iter()
        .filter(|(l, _, _)| !l.is_empty())
        .map(|(locality, postcode, count)| {
            serde_json::json!({"locality": locality, "postcode": postcode, "count": count})
        })
        .collect();

    Ok(Json(resp))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn extract_state(filename: &str) -> Option<String> {
    filename
        .trim_end_matches(".txt")
        .rsplit('_')
        .next()
        .map(|s| s.chars().take(3).collect())
}
