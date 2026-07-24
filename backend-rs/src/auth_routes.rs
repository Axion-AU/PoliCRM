use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, patch, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::auth::{AdminUser, CurrentUser};
use crate::models::{Branch, User};

// ─── Response types ─────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct UserResponse {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub role: String,
    pub branch_id: Option<Uuid>,
    pub branch_name: Option<String>,
    pub is_active: bool,
    pub last_login_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Serialize)]
pub struct CurrentUserResponse {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub role: String,
    pub branch_id: Option<Uuid>,
    pub branch: Option<Branch>,
}

// ─── Payloads ───────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateUserPayload {
    pub email: String,
    pub name: String,
    pub role: Option<String>,
    pub branch_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct UpdateUserPayload {
    pub role: Option<String>,
    pub branch_id: Option<Option<Uuid>>,
    pub is_active: Option<bool>,
}

#[derive(Deserialize)]
pub struct ListUsersQuery {
    pub role: Option<String>,
    pub branch_id: Option<Uuid>,
    pub is_active: Option<bool>,
}

// ─── Router ─────────────────────────────────────────────────────────────────

pub fn users_router() -> Router<SqlitePool> {
    Router::new()
        .route("/", get(list_users).post(create_user))
        .route("/{id}", patch(update_user))
}

pub fn router() -> Router<SqlitePool> {
    Router::new()
        .route("/auth/me", get(get_current_user))
        .nest("/users", users_router())
}

// ─── Handlers ───────────────────────────────────────────────────────────────

async fn get_current_user(
    State(pool): State<SqlitePool>,
    user: CurrentUser,
) -> Result<Json<CurrentUserResponse>, StatusCode> {
    let branch: Option<Branch> = if let Some(bid) = user.branch_id {
        sqlx::query_as::<_, Branch>("SELECT * FROM branches WHERE id = ?1")
            .bind(bid)
            .fetch_optional(&pool)
            .await
            .map_err(|e| {
                eprintln!("Database error fetching branch: {}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?
    } else {
        None
    };

    Ok(Json(CurrentUserResponse {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        branch_id: user.branch_id,
        branch,
    }))
}

async fn list_users(
    State(pool): State<SqlitePool>,
    _admin: AdminUser,
    Query(query): Query<ListUsersQuery>,
) -> Result<Json<Vec<UserResponse>>, StatusCode> {
    let mut builder = sqlx::QueryBuilder::new(
        "SELECT u.id, u.email, u.name, u.role, u.branch_id, u.is_active, u.last_login_at, u.created_at, u.updated_at, b.name as branch_name \
         FROM users u \
         LEFT JOIN branches b ON u.branch_id = b.id WHERE 1=1",
    );

    if let Some(ref role) = query.role {
        builder.push(" AND u.role = ");
        builder.push_bind(role);
    }
    if let Some(bid) = query.branch_id {
        builder.push(" AND u.branch_id = ");
        builder.push_bind(bid);
    }
    if let Some(active) = query.is_active {
        builder.push(" AND u.is_active = ");
        builder.push_bind(active);
    }

    builder.push(" ORDER BY u.created_at DESC");

    let raw_rows = builder
        .build()
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error listing users: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let mut users = Vec::new();
    use sqlx::Row;
    for row in raw_rows {
        let user = User {
            id: row.get("id"),
            email: row.get("email"),
            name: row.get("name"),
            role: row.get("role"),
            branch_id: row.get("branch_id"),
            is_active: row.get("is_active"),
            last_login_at: row.get("last_login_at"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        };
        let branch_name: Option<String> = row.get("branch_name");
        users.push(UserResponse {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            branch_id: user.branch_id,
            branch_name,
            is_active: user.is_active,
            last_login_at: user.last_login_at,
            created_at: user.created_at,
            updated_at: user.updated_at,
        });
    }

    Ok(Json(users))
}

async fn create_user(
    State(pool): State<SqlitePool>,
    _admin: AdminUser,
    Json(payload): Json<CreateUserPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    if payload.email.trim().is_empty() || payload.name.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let id = Uuid::new_v4();
    let role = payload.role.unwrap_or_else(|| "organiser".to_string());

    sqlx::query(
        "INSERT INTO users (id, email, name, role, branch_id) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(id)
    .bind(&payload.email)
    .bind(&payload.name)
    .bind(&role)
    .bind(payload.branch_id)
    .execute(&pool)
    .await
    .map_err(|e| {
        eprintln!("Database error creating user: {}", e);
        if e.to_string().contains("UNIQUE") {
            StatusCode::CONFLICT
        } else {
            StatusCode::INTERNAL_SERVER_ERROR
        }
    })?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({"id": id}))))
}

async fn update_user(
    State(pool): State<SqlitePool>,
    _admin: AdminUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateUserPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users WHERE id = ?1")
        .bind(id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if exists == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let mut query_builder = sqlx::QueryBuilder::new("UPDATE users SET ");
    let mut separated = query_builder.separated(", ");

    if let Some(ref role) = payload.role {
        separated.push("role = ");
        separated.push_bind_unseparated(role);
    }

    if let Some(ref branch_id_opt) = payload.branch_id {
        separated.push("branch_id = ");
        separated.push_bind_unseparated(branch_id_opt);
    }

    if let Some(active) = payload.is_active {
        separated.push("is_active = ");
        separated.push_bind_unseparated(active);
    }

    separated.push("updated_at = ");
    separated.push_bind_unseparated(chrono::Utc::now());

    query_builder.push(" WHERE id = ");
    query_builder.push_bind(id);

    query_builder
        .build()
        .execute(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error updating user: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::OK)
}
