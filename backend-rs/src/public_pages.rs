use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, patch, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use crate::crypto::{blind_index, encrypt_opt};

// ─── Models ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct PublicPage {
    pub id: String,
    pub branch_id: Option<String>,
    pub page_type: String,
    pub slug: String,
    pub title: String,
    pub body_html: Option<String>,
    pub thank_you_text: Option<String>,
    pub is_published: i32,
    pub settings: Option<String>,
    pub created_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct FormSubmission {
    pub id: String,
    pub page_id: String,
    pub person_id: Option<String>,
    pub data: String,
    pub source_ip: Option<String>,
    pub user_agent: Option<String>,
    pub created_at: String,
}

// ─── Payloads ─────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreatePagePayload {
    pub branch_id: Option<String>,
    pub page_type: String,
    pub slug: String,
    pub title: String,
    pub body_html: Option<String>,
    pub thank_you_text: Option<String>,
    pub settings: Option<serde_json::Value>,
}

#[derive(Deserialize)]
pub struct UpdatePagePayload {
    pub page_type: Option<String>,
    pub slug: Option<String>,
    pub title: Option<String>,
    pub body_html: Option<Option<String>>,
    pub thank_you_text: Option<Option<String>>,
    pub settings: Option<Option<serde_json::Value>>,
}

#[derive(Deserialize)]
pub struct FormSubmissionPayload {
    pub data: serde_json::Value,
}

#[derive(Deserialize)]
pub struct ListPagesQuery {
    pub page_type: Option<String>,
    pub is_published: Option<String>,
}

// ─── Responses ────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct PageResponse {
    pub id: String,
    pub branch_id: Option<String>,
    pub page_type: String,
    pub slug: String,
    pub title: String,
    pub body_html: Option<String>,
    pub thank_you_text: Option<String>,
    pub is_published: bool,
    pub settings: Option<serde_json::Value>,
    pub created_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct SubmissionResponse {
    pub id: String,
    pub page_id: String,
    pub person_id: Option<String>,
    pub data: serde_json::Value,
    pub source_ip: Option<String>,
    pub user_agent: Option<String>,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct PageStatsResponse {
    pub total_submissions: i64,
    pub unique_people: i64,
    pub today_submissions: i64,
}

#[derive(Serialize)]
pub struct PublicSubmitResponse {
    pub success: bool,
    pub submission_id: String,
    pub person_id: Option<String>,
    pub message: String,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn page_to_response(p: PublicPage) -> PageResponse {
    let settings: Option<serde_json::Value> = p.settings.as_deref()
        .and_then(|s| serde_json::from_str(s).ok());

    PageResponse {
        id: p.id,
        branch_id: p.branch_id,
        page_type: p.page_type,
        slug: p.slug,
        title: p.title,
        body_html: p.body_html,
        thank_you_text: p.thank_you_text,
        is_published: p.is_published != 0,
        settings,
        created_by: p.created_by,
        created_at: p.created_at,
        updated_at: p.updated_at,
    }
}

fn submission_to_response(s: FormSubmission) -> SubmissionResponse {
    let data: serde_json::Value = serde_json::from_str(&s.data).unwrap_or_default();

    SubmissionResponse {
        id: s.id,
        page_id: s.page_id,
        person_id: s.person_id,
        data,
        source_ip: s.source_ip,
        user_agent: s.user_agent,
        created_at: s.created_at,
    }
}

// ─── Router ───────────────────────────────────────────────────────────────────

pub fn router() -> Router<SqlitePool> {
    Router::new()
        // Admin: full CRUD by ID
        .route("/pages", get(list_pages).post(create_page))
        .route("/pages/{id}", patch(update_page).delete(delete_page))
        .route("/pages/{id}/publish", post(publish_page))
        .route("/pages/{id}/unpublish", post(unpublish_page))
        .route("/pages/{id}/submissions", get(list_submissions))
        .route("/pages/{id}/stats", get(page_stats))
        // Public: accessible by slug
        .route("/p/{slug}", get(get_page_by_slug))
        .route("/p/{slug}/submit", post(submit_form))
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async fn list_pages(
    State(pool): State<SqlitePool>,
    Query(query): Query<ListPagesQuery>,
) -> Result<Json<Vec<PageResponse>>, StatusCode> {
    let mut qb = sqlx::QueryBuilder::new("SELECT * FROM public_pages WHERE 1=1");
    if let Some(ref page_type) = query.page_type {
        qb.push(" AND page_type = ");
        qb.push_bind(page_type);
    }
    if let Some(ref published) = query.is_published {
        let val: i32 = if published == "true" || published == "1" { 1 } else { 0 };
        qb.push(" AND is_published = ");
        qb.push_bind(val);
    }
    qb.push(" ORDER BY created_at DESC");

    let pages = qb.build_query_as::<PublicPage>()
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error listing pages: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(pages.into_iter().map(page_to_response).collect()))
}

async fn get_page_by_slug(
    State(pool): State<SqlitePool>,
    Path(slug): Path<String>,
) -> Result<Json<PageResponse>, StatusCode> {
    let page = sqlx::query_as::<_, PublicPage>("SELECT * FROM public_pages WHERE slug = ?1")
        .bind(&slug)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error getting page: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    match page {
        Some(p) => Ok(Json(page_to_response(p))),
        None => Err(StatusCode::NOT_FOUND),
    }
}

async fn create_page(
    State(pool): State<SqlitePool>,
    Json(payload): Json<CreatePagePayload>,
) -> Result<impl IntoResponse, StatusCode> {
    if payload.title.trim().is_empty() || payload.slug.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let id = Uuid::new_v4().to_string();
    let settings = payload.settings.map(|s| serde_json::to_string(&s).unwrap_or_default());
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        r#"INSERT INTO public_pages (id, branch_id, page_type, slug, title, body_html, thank_you_text, settings, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"#
    )
    .bind(&id)
    .bind(&payload.branch_id)
    .bind(&payload.page_type)
    .bind(&payload.slug)
    .bind(&payload.title)
    .bind(&payload.body_html)
    .bind(&payload.thank_you_text)
    .bind(&settings)
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|e| {
        eprintln!("Database error creating page: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let page = sqlx::query_as::<_, PublicPage>("SELECT * FROM public_pages WHERE id = ?1")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(page_to_response(page))))
}

use chrono::Utc;

async fn update_page(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
    Json(payload): Json<UpdatePagePayload>,
) -> Result<Json<PageResponse>, StatusCode> {
    let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM public_pages WHERE id = ?1")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if exists == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let now = Utc::now().to_rfc3339();
    let mut query_builder = sqlx::QueryBuilder::new("UPDATE public_pages SET ");
    let mut separated = query_builder.separated(", ");

    if let Some(ref page_type) = payload.page_type {
        separated.push("page_type = ");
        separated.push_bind_unseparated(page_type);
    }
    if let Some(ref slug) = payload.slug {
        separated.push("slug = ");
        separated.push_bind_unseparated(slug);
    }
    if let Some(ref title) = payload.title {
        separated.push("title = ");
        separated.push_bind_unseparated(title);
    }
    if let Some(ref body_html) = payload.body_html {
        separated.push("body_html = ");
        separated.push_bind_unseparated(body_html);
    }
    if let Some(ref thank_you_text) = payload.thank_you_text {
        separated.push("thank_you_text = ");
        separated.push_bind_unseparated(thank_you_text);
    }
    if let Some(ref settings) = payload.settings {
        let s = settings.as_ref().map(|v| serde_json::to_string(v).unwrap_or_default());
        separated.push("settings = ");
        separated.push_bind_unseparated(s);
    }

    separated.push("updated_at = ");
    separated.push_bind_unseparated(&now);

    query_builder.push(" WHERE id = ");
    query_builder.push_bind(&id);

    query_builder.build().execute(&pool).await.map_err(|e| {
        eprintln!("Database error updating page: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let page = sqlx::query_as::<_, PublicPage>("SELECT * FROM public_pages WHERE id = ?1")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(page_to_response(page)))
}

async fn delete_page(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let result = sqlx::query("DELETE FROM public_pages WHERE id = ?1")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error deleting page: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        Err(StatusCode::NOT_FOUND)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}

async fn publish_page(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<Json<PageResponse>, StatusCode> {
    let result = sqlx::query("UPDATE public_pages SET is_published = 1, updated_at = ?1 WHERE id = ?2")
        .bind(Utc::now().to_rfc3339())
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error publishing page: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let page = sqlx::query_as::<_, PublicPage>("SELECT * FROM public_pages WHERE id = ?1")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(page_to_response(page)))
}

async fn unpublish_page(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<Json<PageResponse>, StatusCode> {
    let result = sqlx::query("UPDATE public_pages SET is_published = 0, updated_at = ?1 WHERE id = ?2")
        .bind(Utc::now().to_rfc3339())
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error unpublishing page: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let page = sqlx::query_as::<_, PublicPage>("SELECT * FROM public_pages WHERE id = ?1")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(page_to_response(page)))
}

// ─── Public Submit ────────────────────────────────────────────────────────────

async fn submit_form(
    State(pool): State<SqlitePool>,
    Path(slug): Path<String>,
    Json(payload): Json<FormSubmissionPayload>,
) -> Result<Json<PublicSubmitResponse>, StatusCode> {
    let page = sqlx::query_as::<_, PublicPage>("SELECT * FROM public_pages WHERE slug = ?1")
        .bind(&slug)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error getting page: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let page = page.ok_or(StatusCode::NOT_FOUND)?;

    if page.is_published == 0 {
        return Err(StatusCode::GONE);
    }

    let data_str = serde_json::to_string(&payload.data).map_err(|_| StatusCode::BAD_REQUEST)?;

    let email = payload.data.get("email").and_then(|v| v.as_str()).filter(|e| !e.is_empty());
    let person_id = if let Some(email_str) = email {
        let idx = blind_index(email_str);
        let existing = sqlx::query_scalar::<_, String>(
            "SELECT id FROM persons WHERE email_blind_index = ?1 AND deleted_at IS NULL LIMIT 1"
        )
        .bind(&idx)
        .fetch_optional(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        match existing {
            Some(pid) => Some(pid),
            None => {
                let new_id = Uuid::new_v4().to_string();
                let enc_email = encrypt_opt(Some(email_str)).map_err(|e| {
                    eprintln!("Encryption error: {}", e);
                    StatusCode::INTERNAL_SERVER_ERROR
                })?;
                let first_name = payload.data.get("first_name").and_then(|v| v.as_str()).unwrap_or("Unknown");
                let last_name = payload.data.get("last_name").and_then(|v| v.as_str()).unwrap_or("Unknown");

                let enc_first_name = crate::crypto::encrypt(first_name).map_err(|e| {
                    eprintln!("Encryption error: {}", e);
                    StatusCode::INTERNAL_SERVER_ERROR
                })?;
                let enc_last_name = crate::crypto::encrypt(last_name).map_err(|e| {
                    eprintln!("Encryption error: {}", e);
                    StatusCode::INTERNAL_SERVER_ERROR
                })?;

                let result = sqlx::query(
                    r#"INSERT INTO persons (id, first_name, last_name, email, email_blind_index, primary_state, primary_zip, primary_country_code)
                       VALUES (?1, ?2, ?3, ?4, ?5, '', '', 'AU')"#
                )
                .bind(&new_id)
                .bind(&enc_first_name)
                .bind(&enc_last_name)
                .bind(&enc_email)
                .bind(&idx)
                .execute(&pool)
                .await;

                match result {
                    Ok(_) => Some(new_id),
                    Err(e) => {
                        eprintln!("Failed to create person from submission: {}", e);
                        None
                    }
                }
            }
        }
    } else {
        None
    };

    let submission_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO form_submissions (id, page_id, person_id, data) VALUES (?1, ?2, ?3, ?4)"
    )
    .bind(&submission_id)
    .bind(&page.id)
    .bind(&person_id)
    .bind(&data_str)
    .execute(&pool)
    .await
    .map_err(|e| {
        eprintln!("Database error creating submission: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let thank_you = page.thank_you_text.unwrap_or_else(|| "Thank you for your submission.".to_string());

    Ok(Json(PublicSubmitResponse {
        success: true,
        submission_id,
        person_id,
        message: thank_you,
    }))
}

// ─── Submissions & Stats ──────────────────────────────────────────────────────

async fn list_submissions(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<Json<Vec<SubmissionResponse>>, StatusCode> {
    let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM public_pages WHERE id = ?1")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if exists == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let submissions = sqlx::query_as::<_, FormSubmission>(
        "SELECT * FROM form_submissions WHERE page_id = ?1 ORDER BY created_at DESC"
    )
    .bind(&id)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("Database error listing submissions: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(submissions.into_iter().map(submission_to_response).collect()))
}

async fn page_stats(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<Json<PageStatsResponse>, StatusCode> {
    let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM public_pages WHERE id = ?1")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if exists == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let total_submissions: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM form_submissions WHERE page_id = ?1"
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    let unique_people: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT person_id) FROM form_submissions WHERE page_id = ?1 AND person_id IS NOT NULL"
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    let today_submissions: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM form_submissions WHERE page_id = ?1 AND date(created_at) = date('now')"
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    Ok(Json(PageStatsResponse {
        total_submissions,
        unique_people,
        today_submissions,
    }))
}
