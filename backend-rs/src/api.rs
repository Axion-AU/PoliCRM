use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post, patch, delete},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;
use base64::Engine as _;

use crate::crypto::{blind_index, decrypt_opt, encrypt, encrypt_opt};
use crate::models::Person;

// ─── Public API response shape (decrypted) ───────────────────────────────────

#[derive(Serialize)]
pub struct PersonResponse {
    pub id: String,
    pub first_name: String,
    #[serde(rename = "given_name")]
    pub given_name: String,
    pub middle_name: Option<String>,
    pub last_name: String,
    #[serde(rename = "surname")]
    pub surname: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub mobile: Option<String>,
    pub primary_address1: String,
    pub primary_address2: Option<String>,
    pub primary_address3: Option<String>,
    pub primary_city: String,
    pub primary_state: String,
    pub primary_zip: String,
    pub primary_country_code: String,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

fn decrypt_person(p: Person) -> Result<PersonResponse, String> {
    let first_name = p.first_name.as_deref().map(|v| crate::crypto::decrypt(v)).transpose()?.unwrap_or_default();
    let last_name = p.last_name.as_deref().map(|v| crate::crypto::decrypt(v)).transpose()?.unwrap_or_default();
    Ok(PersonResponse {
        id: p.id.to_string(),
        first_name: first_name.clone(),
        given_name: first_name,
        middle_name: decrypt_opt(p.middle_name.as_deref())?,
        last_name: last_name.clone(),
        surname: last_name,
        email: decrypt_opt(p.email.as_deref())?,
        phone: decrypt_opt(p.phone.as_deref())?,
        mobile: decrypt_opt(p.mobile.as_deref())?,
        primary_address1: p.primary_address1.as_deref().map(|v| crate::crypto::decrypt(v)).transpose()?.unwrap_or_default(),
        primary_address2: decrypt_opt(p.primary_address2.as_deref())?,
        primary_address3: decrypt_opt(p.primary_address3.as_deref())?,
        primary_city: p.primary_city.as_deref().map(|v| crate::crypto::decrypt(v)).transpose()?.unwrap_or_default(),
        primary_state: p.primary_state,
        primary_zip: p.primary_zip,
        primary_country_code: p.primary_country_code,
        created_at: p.created_at.to_rfc3339(),
        updated_at: p.updated_at.to_rfc3339(),
        deleted_at: p.deleted_at.map(|d| d.to_rfc3339()),
    })
}

// ─── Input payloads ──────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreatePersonPayload {
    pub first_name: String,
    pub middle_name: Option<String>,
    pub last_name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub mobile: Option<String>,
    pub primary_address1: String,
    pub primary_address2: Option<String>,
    pub primary_address3: Option<String>,
    pub primary_city: String,
    pub primary_state: String,
    pub primary_zip: String,
    pub primary_country_code: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdatePersonPayload {
    #[serde(alias = "given_name")]
    pub first_name: Option<String>,
    pub middle_name: Option<Option<String>>,
    #[serde(alias = "surname")]
    pub last_name: Option<String>,
    pub email: Option<Option<String>>,
    pub phone: Option<Option<String>>,
    pub mobile: Option<Option<String>>,
    pub primary_address1: Option<String>,
    pub primary_address2: Option<Option<String>>,
    pub primary_address3: Option<Option<String>>,
    pub primary_city: Option<String>,
    pub primary_state: Option<String>,
    pub primary_zip: Option<String>,
    pub primary_country_code: Option<String>,
}

// ─── Router ──────────────────────────────────────────────────────────────────

pub fn router() -> Router<SqlitePool> {
    Router::new()
        .route("/persons", post(create_person).get(list_persons))
        .route("/persons/{id}", get(get_person).patch(update_person).delete(delete_person))
        .route("/import/nationbuilder", post(import_nationbuilder))
        .route("/analytics/summary", get(get_analytics_summary))
        .route("/analytics/growth", get(get_analytics_growth))
        .route("/analytics/geographic", get(get_geographic))
        .route("/analytics/electorate-counts", get(get_electorate_counts))
        .route("/stats/dashboard", get(get_stats_dashboard))
        .route("/stats/electorates", get(get_stats_electorates))
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async fn create_person(
    State(pool): State<SqlitePool>,
    Json(payload): Json<CreatePersonPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    // Validate required fields
    if payload.first_name.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    if payload.last_name.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    if payload.primary_address1.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    if payload.primary_city.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    if payload.primary_state.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    if payload.primary_zip.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let id = Uuid::new_v4();
    let country_code = payload.primary_country_code.unwrap_or_else(|| "AU".to_string());

    // Encrypt all PII fields
    let enc_first_name = encrypt(&payload.first_name).map_err(|e| { eprintln!("Encryption error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;
    let enc_middle_name = encrypt_opt(payload.middle_name.as_deref()).map_err(|e| { eprintln!("Encryption error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;
    let enc_last_name = encrypt(&payload.last_name).map_err(|e| { eprintln!("Encryption error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;
    let enc_email = encrypt_opt(payload.email.as_deref()).map_err(|e| { eprintln!("Encryption error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;
    let email_idx = payload.email.as_deref().filter(|e| !e.is_empty()).map(blind_index);
    let enc_phone = encrypt_opt(payload.phone.as_deref()).map_err(|e| { eprintln!("Encryption error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;
    let enc_mobile = encrypt_opt(payload.mobile.as_deref()).map_err(|e| { eprintln!("Encryption error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;
    let enc_address1 = encrypt(&payload.primary_address1).map_err(|e| { eprintln!("Encryption error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;
    let enc_address2 = encrypt_opt(payload.primary_address2.as_deref()).map_err(|e| { eprintln!("Encryption error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;
    let enc_address3 = encrypt_opt(payload.primary_address3.as_deref()).map_err(|e| { eprintln!("Encryption error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;
    let enc_city = encrypt(&payload.primary_city).map_err(|e| { eprintln!("Encryption error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let result = sqlx::query(
        r#"
        INSERT INTO persons (id, first_name, middle_name, last_name, email, email_blind_index,
                             phone, mobile, primary_address1, primary_address2, primary_address3,
                             primary_city, primary_state, primary_zip, primary_country_code)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
        "#,
    )
    .bind(id)
    .bind(enc_first_name)
    .bind(enc_middle_name)
    .bind(enc_last_name)
    .bind(enc_email)
    .bind(email_idx)
    .bind(enc_phone)
    .bind(enc_mobile)
    .bind(enc_address1)
    .bind(enc_address2)
    .bind(enc_address3)
    .bind(enc_city)
    .bind(&payload.primary_state)   // NOT encrypted — used for geo filtering
    .bind(&payload.primary_zip)     // NOT encrypted — low sensitivity, used for filtering
    .bind(&country_code)
    .execute(&pool)
    .await;

    match result {
        Ok(_) => Ok((StatusCode::CREATED, Json(serde_json::json!({"id": id})))),
        Err(e) => {
            eprintln!("Database error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn get_person(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
) -> Result<Json<PersonResponse>, StatusCode> {
    let person = sqlx::query_as::<_, Person>("SELECT * FROM persons WHERE id = ?1 AND deleted_at IS NULL")
        .bind(id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    match person {
        Some(p) => {
            let resp = decrypt_person(p).map_err(|e| {
                eprintln!("Decryption error: {}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
            Ok(Json(resp))
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}

#[derive(Deserialize)]
pub struct ListPersonsQuery {
    pub state: Option<String>,
    pub zip: Option<String>,
    pub email: Option<String>,
    pub search: Option<String>,
    pub cursor: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Serialize)]
pub struct PaginatedPersonsResponse {
    pub data: Vec<PersonResponse>,
    pub next_cursor: Option<String>,
    pub total: i64,
}

async fn list_persons(
    State(pool): State<SqlitePool>,
    Query(query): Query<ListPersonsQuery>,
) -> Result<Json<PaginatedPersonsResponse>, StatusCode> {
    let limit = query.limit.unwrap_or(50).min(100);

    // 1. Fetch total count matching filters (without pagination cursor)
    let mut count_builder = sqlx::QueryBuilder::new("SELECT COUNT(*) FROM persons WHERE deleted_at IS NULL");
    
    if let Some(ref state) = query.state {
        if !state.is_empty() {
            count_builder.push(" AND primary_state = ");
            count_builder.push_bind(state);
        }
    }
    if let Some(ref zip) = query.zip {
        if !zip.is_empty() {
            count_builder.push(" AND primary_zip = ");
            count_builder.push_bind(zip);
        }
    }
    if let Some(ref email) = query.email {
        if !email.is_empty() {
            let idx = blind_index(email);
            count_builder.push(" AND email_blind_index = ");
            count_builder.push_bind(idx);
        }
    }
    if let Some(ref search_term) = query.search {
        if !search_term.is_empty() {
            let idx = blind_index(search_term);
            count_builder.push(" AND (email_blind_index = ");
            count_builder.push_bind(idx);
            count_builder.push(" OR primary_state = ");
            count_builder.push_bind(search_term);
            count_builder.push(" OR primary_zip = ");
            count_builder.push_bind(search_term);
            count_builder.push(")");
        }
    }

    let total: i64 = count_builder.build_query_scalar()
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error fetching count: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // 2. Fetch records
    let mut query_builder = sqlx::QueryBuilder::new("SELECT * FROM persons WHERE deleted_at IS NULL");

    if let Some(ref state) = query.state {
        if !state.is_empty() {
            query_builder.push(" AND primary_state = ");
            query_builder.push_bind(state);
        }
    }
    if let Some(ref zip) = query.zip {
        if !zip.is_empty() {
            query_builder.push(" AND primary_zip = ");
            query_builder.push_bind(zip);
        }
    }
    if let Some(ref email) = query.email {
        if !email.is_empty() {
            let idx = blind_index(email);
            query_builder.push(" AND email_blind_index = ");
            query_builder.push_bind(idx);
        }
    }
    if let Some(ref search_term) = query.search {
        if !search_term.is_empty() {
            let idx = blind_index(search_term);
            query_builder.push(" AND (email_blind_index = ");
            query_builder.push_bind(idx);
            query_builder.push(" OR primary_state = ");
            query_builder.push_bind(search_term);
            query_builder.push(" OR primary_zip = ");
            query_builder.push_bind(search_term);
            query_builder.push(")");
        }
    }

    // Decode cursor: base64(created_at_rfc3339 + "|" + id_uuid)
    if let Some(ref cursor_str) = query.cursor {
        if let Ok(decoded_bytes) = base64::engine::general_purpose::STANDARD.decode(cursor_str) {
            if let Ok(decoded_str) = String::from_utf8(decoded_bytes) {
                if let Some((created_at_str, id_str)) = decoded_str.split_once('|') {
                    if let (Ok(created_at), Ok(id)) = (chrono::DateTime::parse_from_rfc3339(created_at_str), Uuid::parse_str(id_str)) {
                        query_builder.push(" AND (created_at < ");
                        query_builder.push_bind(created_at.with_timezone(&chrono::Utc));
                        query_builder.push(" OR (created_at = ");
                        query_builder.push_bind(created_at.with_timezone(&chrono::Utc));
                        query_builder.push(" AND id < ");
                        query_builder.push_bind(id);
                        query_builder.push("))");
                    }
                }
            }
        }
    }

    query_builder.push(" ORDER BY created_at DESC, id DESC LIMIT ");
    query_builder.push_bind((limit + 1) as i64);

    let persons = query_builder.build_query_as::<Person>()
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error fetching persons: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let mut decrypted = Vec::new();
    for p in persons {
        let resp = decrypt_person(p).map_err(|e| {
            eprintln!("Decryption error: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
        decrypted.push(resp);
    }

    let mut next_cursor = None;
    if decrypted.len() > limit {
        if let Some(last_item) = decrypted.get(limit - 1) {
            let cursor_payload = format!("{}|{}", last_item.created_at, last_item.id);
            next_cursor = Some(base64::engine::general_purpose::STANDARD.encode(cursor_payload));
        }
        decrypted.truncate(limit);
    }

    Ok(Json(PaginatedPersonsResponse {
        data: decrypted,
        next_cursor,
        total,
    }))
}

async fn update_person(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdatePersonPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM persons WHERE id = ?1 AND deleted_at IS NULL")
        .bind(id)
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error checking existence: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if exists == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let mut query_builder = sqlx::QueryBuilder::new("UPDATE persons SET ");
    let mut separated = query_builder.separated(", ");

    if let Some(ref first_name) = payload.first_name {
        let enc = encrypt(first_name).map_err(|e| { eprintln!("Encryption error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;
        separated.push("first_name = ");
        separated.push_bind_unseparated(enc);
    }

    if let Some(ref middle_name_opt) = payload.middle_name {
        let enc = encrypt_opt(middle_name_opt.as_deref()).map_err(|e| { eprintln!("Encryption error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;
        separated.push("middle_name = ");
        separated.push_bind_unseparated(enc);
    }

    if let Some(ref last_name) = payload.last_name {
        let enc = encrypt(last_name).map_err(|e| { eprintln!("Encryption error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;
        separated.push("last_name = ");
        separated.push_bind_unseparated(enc);
    }

    if let Some(ref email_opt) = payload.email {
        let enc = encrypt_opt(email_opt.as_deref()).map_err(|e| { eprintln!("Encryption error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;
        separated.push("email = ");
        separated.push_bind_unseparated(enc);

        let email_idx = email_opt.as_deref().filter(|e| !e.is_empty()).map(blind_index);
        separated.push("email_blind_index = ");
        separated.push_bind_unseparated(email_idx);
    }

    if let Some(ref phone_opt) = payload.phone {
        let enc = encrypt_opt(phone_opt.as_deref()).map_err(|e| { eprintln!("Encryption error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;
        separated.push("phone = ");
        separated.push_bind_unseparated(enc);
    }

    if let Some(ref mobile_opt) = payload.mobile {
        let enc = encrypt_opt(mobile_opt.as_deref()).map_err(|e| { eprintln!("Encryption error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;
        separated.push("mobile = ");
        separated.push_bind_unseparated(enc);
    }

    if let Some(ref address1) = payload.primary_address1 {
        let enc = encrypt(address1).map_err(|e| { eprintln!("Encryption error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;
        separated.push("primary_address1 = ");
        separated.push_bind_unseparated(enc);
    }

    if let Some(ref address2_opt) = payload.primary_address2 {
        let enc = encrypt_opt(address2_opt.as_deref()).map_err(|e| { eprintln!("Encryption error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;
        separated.push("primary_address2 = ");
        separated.push_bind_unseparated(enc);
    }

    if let Some(ref address3_opt) = payload.primary_address3 {
        let enc = encrypt_opt(address3_opt.as_deref()).map_err(|e| { eprintln!("Encryption error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;
        separated.push("primary_address3 = ");
        separated.push_bind_unseparated(enc);
    }

    if let Some(ref city) = payload.primary_city {
        let enc = encrypt(city).map_err(|e| { eprintln!("Encryption error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;
        separated.push("primary_city = ");
        separated.push_bind_unseparated(enc);
    }

    if let Some(ref state) = payload.primary_state {
        separated.push("primary_state = ");
        separated.push_bind_unseparated(state);
    }

    if let Some(ref zip) = payload.primary_zip {
        separated.push("primary_zip = ");
        separated.push_bind_unseparated(zip);
    }

    if let Some(ref country_code) = payload.primary_country_code {
        separated.push("primary_country_code = ");
        separated.push_bind_unseparated(country_code);
    }

    separated.push("updated_at = ");
    separated.push_bind_unseparated(chrono::Utc::now());

    query_builder.push(" WHERE id = ");
    query_builder.push_bind(id);
    query_builder.push(" AND deleted_at IS NULL");

    let query = query_builder.build();
    query.execute(&pool).await.map_err(|e| {
        eprintln!("Database error executing update: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(StatusCode::OK)
}

async fn delete_person(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, StatusCode> {
    let result = sqlx::query("UPDATE persons SET deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL")
        .bind(chrono::Utc::now())
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error executing soft delete: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        Err(StatusCode::NOT_FOUND)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}

// ─── NationBuilder Import ─────────────────────────────────────────────────────

#[derive(Deserialize, Debug)]
pub struct NBPeopleResponse {
    pub results: Vec<NBPerson>,
}

#[derive(Deserialize, Debug)]
pub struct NBPerson {
    pub id: i64,
    pub first_name: Option<String>,
    pub middle_name: Option<String>,
    pub last_name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub mobile: Option<String>,
    pub primary_address: Option<NBAddress>,
}

#[derive(Deserialize, Debug)]
pub struct NBAddress {
    pub address1: Option<String>,
    pub address2: Option<String>,
    pub address3: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub zip: Option<String>,
    pub country_code: Option<String>,
}

async fn import_nationbuilder(
    State(pool): State<SqlitePool>,
) -> Result<impl IntoResponse, StatusCode> {
    let api_key = std::env::var("NATIONBUILDER_API_KEY").map_err(|_| {
        eprintln!("Missing NATIONBUILDER_API_KEY in environment");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let slug = std::env::var("NATIONBUILDER_SLUG").unwrap_or_else(|_| "futureparty".to_string());
    let url = format!("https://{}.nationbuilder.com/api/v1/people?limit=100", slug);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| {
            eprintln!("Failed to build HTTP client: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| {
            eprintln!("Failed to send request to NationBuilder: {}", e);
            StatusCode::BAD_GATEWAY
        })?;

    if !response.status().is_success() {
        eprintln!("NationBuilder API returned status: {}", response.status());
        return Err(StatusCode::BAD_GATEWAY);
    }

    let payload: NBPeopleResponse = response.json().await.map_err(|e| {
        eprintln!("Failed to parse NationBuilder response: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut imported_count = 0;
    let mut skipped_count = 0;

    for nb_person in payload.results {
        let provider_id = nb_person.id.to_string();

        // Check if already imported
        let existing = sqlx::query_scalar::<_, String>(
            "SELECT person_id FROM external_identities WHERE provider = 'nationbuilder' AND provider_id = ?1"
        )
        .bind(&provider_id)
        .fetch_optional(&pool)
        .await;

        match existing {
            Ok(Some(_)) => {
                skipped_count += 1;
                continue;
            }
            Err(e) => {
                eprintln!("Database error checking existence: {}", e);
                continue;
            }
            Ok(None) => {}
        }

        let first_name = nb_person.first_name.unwrap_or_else(|| "Unknown".to_string());
        let last_name = nb_person.last_name.unwrap_or_else(|| "Unknown".to_string());

        let addr = nb_person.primary_address.unwrap_or(NBAddress {
            address1: None, address2: None, address3: None,
            city: None, state: None, zip: None, country_code: None,
        });

        // Encrypt PII
        let enc_first_name = match encrypt(&first_name) { Ok(v) => v, Err(e) => { eprintln!("Encrypt error: {}", e); continue; } };
        let enc_middle_name = match encrypt_opt(nb_person.middle_name.as_deref()) {
            Ok(v) => v,
            Err(e) => { eprintln!("Encrypt error for middle_name (nb_id={}): {}", provider_id, e); continue; }
        };
        let enc_last_name = match encrypt(&last_name) { Ok(v) => v, Err(e) => { eprintln!("Encrypt error: {}", e); continue; } };
        let enc_email = match encrypt_opt(nb_person.email.as_deref()) {
            Ok(v) => v,
            Err(e) => { eprintln!("Encrypt error for email (nb_id={}): {}", provider_id, e); continue; }
        };
        let email_idx = nb_person.email.as_deref().filter(|e| !e.is_empty()).map(blind_index);
        let enc_phone = match encrypt_opt(nb_person.phone.as_deref()) {
            Ok(v) => v,
            Err(e) => { eprintln!("Encrypt error for phone (nb_id={}): {}", provider_id, e); continue; }
        };
        let enc_mobile = match encrypt_opt(nb_person.mobile.as_deref()) {
            Ok(v) => v,
            Err(e) => { eprintln!("Encrypt error for mobile (nb_id={}): {}", provider_id, e); continue; }
        };
        let enc_address1 = match encrypt(&addr.address1.clone().unwrap_or_default()) {
            Ok(v) => v,
            Err(e) => { eprintln!("Encrypt error for address1 (nb_id={}): {}", provider_id, e); continue; }
        };
        let enc_address2 = match encrypt_opt(addr.address2.as_deref()) {
            Ok(v) => v,
            Err(e) => { eprintln!("Encrypt error for address2 (nb_id={}): {}", provider_id, e); continue; }
        };
        let enc_address3 = match encrypt_opt(addr.address3.as_deref()) {
            Ok(v) => v,
            Err(e) => { eprintln!("Encrypt error for address3 (nb_id={}): {}", provider_id, e); continue; }
        };
        let enc_city = match encrypt(&addr.city.clone().unwrap_or_default()) {
            Ok(v) => v,
            Err(e) => { eprintln!("Encrypt error for city (nb_id={}): {}", provider_id, e); continue; }
        };
        let primary_state = addr.state.unwrap_or_default();
        let primary_zip = addr.zip.unwrap_or_default();
        let country_code = addr.country_code.unwrap_or_else(|| "AU".to_string());

        let person_id = Uuid::new_v4();
        let mut tx = pool.begin().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let person_res = sqlx::query(
            r#"
            INSERT INTO persons (id, first_name, middle_name, last_name, email, email_blind_index,
                                 phone, mobile, primary_address1, primary_address2, primary_address3,
                                 primary_city, primary_state, primary_zip, primary_country_code)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
            "#
        )
        .bind(person_id)
        .bind(enc_first_name)
        .bind(enc_middle_name)
        .bind(enc_last_name)
        .bind(enc_email)
        .bind(email_idx)
        .bind(enc_phone)
        .bind(enc_mobile)
        .bind(enc_address1)
        .bind(enc_address2)
        .bind(enc_address3)
        .bind(enc_city)
        .bind(primary_state)
        .bind(primary_zip)
        .bind(country_code)
        .execute(&mut *tx)
        .await;

        if let Err(e) = person_res {
            eprintln!("Failed to insert person: {}", e);
            let _ = tx.rollback().await;
            continue;
        }

        let identity_id = Uuid::new_v4();
        let identity_res = sqlx::query(
            r#"
            INSERT INTO external_identities (id, person_id, provider, provider_id)
            VALUES (?1, ?2, 'nationbuilder', ?3)
            "#
        )
        .bind(identity_id)
        .bind(person_id)
        .bind(&provider_id)
        .execute(&mut *tx)
        .await;

        if let Err(e) = identity_res {
            eprintln!("Failed to insert external identity: {}", e);
            let _ = tx.rollback().await;
            continue;
        }

        match tx.commit().await {
            Ok(_) => imported_count += 1,
            Err(e) => {
                eprintln!("Failed to commit transaction for nb_id={}: {}", provider_id, e);
                // Row is not counted; continue to next record
            }
        }
    }

    Ok((
        StatusCode::OK,
        Json(serde_json::json!({
            "status": "success",
            "imported": imported_count,
            "skipped": skipped_count
        })),
    ))
}

// ─── Analytics and Stats API Structs ──────────────────────────────────────────

#[derive(Serialize)]
pub struct AnalyticsSummaryResponse {
    pub total_persons: i64,
    pub states_covered: i64,
    pub imports_total: i64,
    pub last_import_at: Option<String>,
}

#[derive(Serialize)]
pub struct StatsDashboardResponse {
    pub total_members: i64,
    pub active_members: i64,
    pub lapsed_members: i64,
    pub verified_count: i64,
    pub failed_count: i64,
    pub partial_match_count: i64,
    pub captcha_count: i64,
    pub unchecked_count: i64,
    pub duplicate_count: i64,
    pub new_members_30d: i64,
    pub by_state: std::collections::HashMap<String, i64>,
}

#[derive(Serialize)]
pub struct ElectorateStat {
    pub federal_division: String,
    pub count: i64,
}

#[derive(Serialize)]
pub struct GeographicResponse {
    pub by_state: std::collections::HashMap<String, i64>,
    pub by_division: std::collections::HashMap<String, i64>,
}

#[derive(Serialize)]
pub struct ElectorateCountsResponse {
    pub verified: std::collections::HashMap<String, i64>,
    pub projected: std::collections::HashMap<String, i64>,
    pub metadata: ElectorateCountsMetadata,
}

#[derive(Serialize)]
pub struct ElectorateCountsMetadata {
    pub verified_max: i64,
    pub projected_max: i64,
}

// ─── Analytics and Stats Handlers ─────────────────────────────────────────────

async fn get_analytics_summary(
    State(pool): State<SqlitePool>,
) -> Result<Json<AnalyticsSummaryResponse>, StatusCode> {
    let total_persons: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM persons WHERE deleted_at IS NULL")
        .fetch_one(&pool)
        .await
        .map_err(|e| { eprintln!("Summary error (total_persons): {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let states_covered: i64 = sqlx::query_scalar("SELECT COUNT(DISTINCT primary_state) FROM persons WHERE deleted_at IS NULL AND primary_state != ''")
        .fetch_one(&pool)
        .await
        .map_err(|e| { eprintln!("Summary error (states_covered): {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let imports_total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM external_identities")
        .fetch_one(&pool)
        .await
        .map_err(|e| { eprintln!("Summary error (imports_total): {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let last_import_at: Option<String> = sqlx::query_scalar("SELECT MAX(created_at) FROM external_identities")
        .fetch_one(&pool)
        .await
        .unwrap_or(None);

    Ok(Json(AnalyticsSummaryResponse {
        total_persons,
        states_covered,
        imports_total,
        last_import_at,
    }))
}

async fn get_analytics_growth(
    State(pool): State<SqlitePool>,
) -> Result<Json<std::collections::BTreeMap<String, i64>>, StatusCode> {
    let rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count FROM persons WHERE deleted_at IS NULL GROUP BY month ORDER BY month ASC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| { eprintln!("Growth error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let mut map = std::collections::BTreeMap::new();
    for (month, count) in rows {
        map.insert(month, count);
    }

    Ok(Json(map))
}

async fn get_geographic(
    State(pool): State<SqlitePool>,
) -> Result<Json<GeographicResponse>, StatusCode> {
    let state_rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT primary_state, COUNT(*) FROM persons WHERE deleted_at IS NULL GROUP BY primary_state"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| { eprintln!("Geographic state error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let mut by_state = std::collections::HashMap::new();
    for (state, count) in state_rows {
        if !state.is_empty() {
            by_state.insert(state, count);
        }
    }

    let div_rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT json_extract(metadata, '$.federal_division') as div, COUNT(DISTINCT person_id) \
         FROM interactions \
         WHERE interaction_type = 'aec_check' \
           AND json_extract(metadata, '$.result') = 'Pass' \
           AND div IS NOT NULL \
         GROUP BY div"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| { eprintln!("Geographic division error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let mut by_division = std::collections::HashMap::new();
    for (div, count) in div_rows {
        if !div.is_empty() {
            by_division.insert(div, count);
        }
    }

    Ok(Json(GeographicResponse { by_state, by_division }))
}

async fn get_electorate_counts(
    State(pool): State<SqlitePool>,
) -> Result<Json<ElectorateCountsResponse>, StatusCode> {
    let verified_rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT json_extract(metadata, '$.federal_division') as div, COUNT(DISTINCT person_id) \
         FROM interactions \
         WHERE interaction_type = 'aec_check' \
           AND json_extract(metadata, '$.result') = 'Pass' \
           AND div IS NOT NULL \
         GROUP BY div"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| { eprintln!("Electorate verified error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let mut verified = std::collections::HashMap::new();
    let mut verified_max = 0;
    for (div, count) in verified_rows {
        if !div.is_empty() {
            verified.insert(div.clone(), count);
            if count > verified_max {
                verified_max = count;
            }
        }
    }

    let mut projected = std::collections::HashMap::new();
    let mut projected_max = 0;

    let postcode_map: std::collections::HashMap<String, serde_json::Value> = {
        if let Ok(content) = std::fs::read_to_string("../src/api/data/postcode_to_electorate.json") {
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            std::collections::HashMap::new()
        }
    };

    let pending_zips: Vec<String> = sqlx::query_scalar(
        "SELECT primary_zip FROM persons \
         WHERE deleted_at IS NULL \
           AND id NOT IN ( \
             SELECT DISTINCT person_id FROM interactions \
             WHERE interaction_type = 'aec_check' AND json_extract(metadata, '$.result') = 'Pass' \
           )"
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    for zip in pending_zips {
        if !zip.is_empty() {
            if let Some(electorate_val) = postcode_map.get(&zip) {
                let target_electorate = match electorate_val {
                    serde_json::Value::Array(arr) => {
                        arr.first().and_then(|v| v.as_str())
                    }
                    serde_json::Value::String(s) => Some(s.as_str()),
                    _ => None,
                };
                if let Some(el_name) = target_electorate {
                    let entry = projected.entry(el_name.to_string()).or_insert(0);
                    *entry += 1;
                    if *entry > projected_max {
                        projected_max = *entry;
                    }
                }
            }
        }
    }

    Ok(Json(ElectorateCountsResponse {
        verified,
        projected,
        metadata: ElectorateCountsMetadata {
            verified_max,
            projected_max,
        },
    }))
}

async fn get_stats_dashboard(
    State(pool): State<SqlitePool>,
) -> Result<Json<StatsDashboardResponse>, StatusCode> {
    let total_members: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM persons WHERE deleted_at IS NULL")
        .fetch_one(&pool)
        .await
        .unwrap_or(0);

    let active_members: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM memberships WHERE status = 'active' AND deleted_at IS NULL")
        .fetch_one(&pool)
        .await
        .unwrap_or(0);

    let lapsed_members: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM memberships WHERE status = 'lapsed' AND deleted_at IS NULL")
        .fetch_one(&pool)
        .await
        .unwrap_or(0);

    let verified_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT person_id) FROM interactions WHERE interaction_type = 'aec_check' AND json_extract(metadata, '$.result') = 'Pass'"
    )
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    let failed_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT person_id) FROM interactions WHERE interaction_type = 'aec_check' AND json_extract(metadata, '$.result') IN ('Fail', 'Fail_Suburb', 'Fail_Street', 'Fail_No_Match')"
    )
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    let partial_match_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT person_id) FROM interactions WHERE interaction_type = 'aec_check' AND json_extract(metadata, '$.result') = 'Partial'"
    )
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    let captcha_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT person_id) FROM interactions WHERE interaction_type = 'aec_check' AND json_extract(metadata, '$.result') = 'Captcha'"
    )
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    let unchecked_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM persons WHERE id NOT IN (SELECT DISTINCT person_id FROM interactions WHERE interaction_type = 'aec_check')"
    )
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    let new_members_30d: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM persons WHERE deleted_at IS NULL AND created_at >= datetime('now', '-30 days')"
    )
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    let state_rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT primary_state, COUNT(*) FROM persons WHERE deleted_at IS NULL GROUP BY primary_state"
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let mut by_state = std::collections::HashMap::new();
    for (state, count) in state_rows {
        if !state.is_empty() {
            by_state.insert(state, count);
        }
    }

    Ok(Json(StatsDashboardResponse {
        total_members,
        active_members,
        lapsed_members,
        verified_count,
        failed_count,
        partial_match_count,
        captcha_count,
        unchecked_count,
        duplicate_count: 0,
        new_members_30d,
        by_state,
    }))
}

async fn get_stats_electorates(
    State(pool): State<SqlitePool>,
) -> Result<Json<Vec<ElectorateStat>>, StatusCode> {
    let rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT json_extract(metadata, '$.federal_division') as div, COUNT(DISTINCT person_id) as count \
         FROM interactions \
         WHERE interaction_type = 'aec_check' \
           AND json_extract(metadata, '$.result') = 'Pass' \
           AND div IS NOT NULL \
         GROUP BY div \
         ORDER BY count DESC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| { eprintln!("Electorate stats error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let stats = rows
        .into_iter()
        .map(|(div, count)| ElectorateStat {
            federal_division: div,
            count,
        })
        .collect();

    Ok(Json(stats))
}
