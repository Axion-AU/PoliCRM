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

use crate::auth::{AdminUser, CurrentUser, create_token};
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

#[derive(Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserResponse,
}

// ─── Payloads ───────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct LoginPayload {
    pub email: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct RegisterPayload {
    pub name: String,
    pub email: String,
    pub password: String,
}

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
        .route("/auth/login", post(login))
        .route("/auth/register", post(register))
        .route("/auth/me", get(get_current_user))
        .route("/auth/seed", post(seed_admin))
        .nest("/users", users_router())
}

// ─── Helpers ────────────────────────────────────────────────────────────────

fn user_to_response(u: &User, branch_name: Option<String>) -> UserResponse {
    UserResponse {
        id: u.id,
        email: u.email.clone(),
        name: u.name.clone(),
        role: u.role.clone(),
        branch_id: u.branch_id,
        branch_name,
        is_active: u.is_active,
        last_login_at: u.last_login_at,
        created_at: u.created_at,
        updated_at: u.updated_at,
    }
}

async fn get_branch_name(pool: &SqlitePool, branch_id: Option<Uuid>) -> Option<String> {
    match branch_id {
        Some(bid) => sqlx::query_scalar::<_, String>("SELECT name FROM branches WHERE id = ?1")
            .bind(bid)
            .fetch_optional(pool)
            .await
            .unwrap_or(None),
        None => None,
    }
}

// ─── Auth handlers ─────────────────────────────────────────────────────────

async fn login(
    State(pool): State<SqlitePool>,
    Json(payload): Json<LoginPayload>,
) -> Result<Json<AuthResponse>, StatusCode> {
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = ?1")
        .bind(&payload.email)
        .fetch_optional(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::UNAUTHORIZED)?;

    if !user.is_active {
        return Err(StatusCode::FORBIDDEN);
    }

    let password_hash = user.password_hash.as_deref().ok_or(StatusCode::UNAUTHORIZED)?;
    let valid = bcrypt::verify(&payload.password, password_hash).unwrap_or(false);
    if !valid {
        return Err(StatusCode::UNAUTHORIZED);
    }

    // Update last_login_at
    let _ = sqlx::query("UPDATE users SET last_login_at = ?1 WHERE id = ?2")
        .bind(chrono::Utc::now())
        .bind(user.id)
        .execute(&pool)
        .await;

    let current_user = CurrentUser {
        id: user.id,
        email: user.email.clone(),
        name: user.name.clone(),
        role: user.role.clone(),
        branch_id: user.branch_id,
    };

    let token = create_token(&current_user).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let branch_name = get_branch_name(&pool, user.branch_id).await;

    Ok(Json(AuthResponse {
        token,
        user: user_to_response(&user, branch_name),
    }))
}

async fn register(
    State(pool): State<SqlitePool>,
    Json(payload): Json<RegisterPayload>,
) -> Result<Json<AuthResponse>, StatusCode> {
    if payload.email.trim().is_empty() || payload.name.trim().is_empty() || payload.password.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Check if email taken
    let existing = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users WHERE email = ?1")
        .bind(&payload.email)
        .fetch_one(&pool)
        .await
        .unwrap_or(0);

    if existing > 0 {
        return Err(StatusCode::CONFLICT);
    }

    let user_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&pool)
        .await
        .unwrap_or(0);
    let role = if user_count == 0 { "sys_admin" } else { "organiser" };

    let password_hash = bcrypt::hash(&payload.password, 12).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let id = Uuid::new_v4();

    sqlx::query(
        "INSERT INTO users (id, email, name, password_hash, role, is_active) VALUES (?1, ?2, ?3, ?4, ?5, 1)",
    )
    .bind(id)
    .bind(&payload.email)
    .bind(&payload.name)
    .bind(&password_hash)
    .bind(role)
    .bind(id)
    .bind(&payload.email)
    .bind(&payload.name)
    .bind(&password_hash)
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

    let user = User {
        id,
        email: payload.email,
        name: payload.name,
        role: role.to_string(),
        branch_id: None,
        is_active: true,
        password_hash: Some(password_hash),
        last_login_at: None,
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };

    let current_user = CurrentUser {
        id: user.id,
        email: user.email.clone(),
        name: user.name.clone(),
        role: user.role.clone(),
        branch_id: None,
    };

    let token = create_token(&current_user).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(AuthResponse {
        token,
        user: user_to_response(&user, None),
    }))
}

/// Seed an initial admin user (idempotent — safe to call on every deploy)
async fn seed_admin(
    State(pool): State<SqlitePool>,
    Json(payload): Json<RegisterPayload>,
) -> Result<Json<AuthResponse>, StatusCode> {
    let email = payload.email.trim().to_lowercase();
    if email.is_empty() || payload.password.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let existing = sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = ?1")
        .bind(&email)
        .fetch_optional(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(user) = existing {
        // Update password if user already exists
        let password_hash = bcrypt::hash(&payload.password, 12).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        sqlx::query("UPDATE users SET password_hash = ?1, role = 'sys_admin', updated_at = ?2 WHERE id = ?3")
            .bind(&password_hash)
            .bind(chrono::Utc::now())
            .bind(user.id)
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let current_user = CurrentUser {
            id: user.id,
            email: user.email.clone(),
            name: user.name.clone(),
            role: "sys_admin".to_string(),
            branch_id: user.branch_id,
        };
        let token = create_token(&current_user).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        return Ok(Json(AuthResponse {
            token,
            user: user_to_response(&user, None),
        }));
    }

    // Create new admin user
    let password_hash = bcrypt::hash(&payload.password, 12).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let id = Uuid::new_v4();
    let name = if payload.name.trim().is_empty() { &email } else { payload.name.trim() };

    sqlx::query(
        "INSERT INTO users (id, email, name, password_hash, role, is_active) VALUES (?1, ?2, ?3, ?4, 'sys_admin', 1)",
    )
    .bind(id)
    .bind(&email)
    .bind(name)
    .bind(&password_hash)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let current_user = CurrentUser {
        id,
        email: email.to_string(),
        name: name.to_string(),
        role: "sys_admin".to_string(),
        branch_id: None,
    };

    let token = create_token(&current_user).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(AuthResponse {
        token,
        user: user_to_response(
            &User {
                id,
                email: email.to_string(),
                name: name.to_string(),
                role: "sys_admin".to_string(),
                branch_id: None,
                is_active: true,
                password_hash: Some(password_hash),
                last_login_at: None,
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
            },
            None,
        ),
    }))
}

// ─── User handlers ─────────────────────────────────────────────────────────

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
            password_hash: None,
            last_login_at: row.get("last_login_at"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        };
        let branch_name: Option<String> = row.get("branch_name");
        users.push(user_to_response(&user, branch_name));
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
