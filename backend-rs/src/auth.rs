use axum::{
    extract::{FromRef, FromRequestParts, Request},
    http::{HeaderMap, HeaderName, StatusCode, request::Parts},
    response::Response,
};
use sqlx::SqlitePool;
use uuid::Uuid;

// ─── CurrentUser ────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct CurrentUser {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub role: String,
    pub branch_id: Option<Uuid>,
}

const HEADER_USER_ID: &str = "X-User-Id";
const HEADER_USER_EMAIL: &str = "X-User-Email";
const HEADER_USER_NAME: &str = "X-User-Name";
const HEADER_USER_ROLE: &str = "X-User-Role";
const HEADER_USER_BRANCH: &str = "X-User-Branch-Id";

impl<S> FromRequestParts<S> for CurrentUser
where
    S: Send + Sync,
    SqlitePool: axum::extract::FromRef<S>,
    S: std::fmt::Debug,
{
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let is_dev = std::env::var("DEV_MODE").unwrap_or_default() == "true";

        // In dev mode, if auth-worker headers are missing, use a default admin user
        let user_id_header = parts.headers.get(HeaderName::from_static("x-user-id"));
        if is_dev && user_id_header.is_none() {
            let pool = SqlitePool::from_ref(state);
            let dev_email = "admin@policrm.au";
            let existing = sqlx::query_as::<_, crate::models::User>(
                "SELECT * FROM users WHERE email = ?1"
            )
            .bind(dev_email)
            .fetch_optional(&pool)
            .await
            .unwrap_or(None);

            if let Some(u) = existing {
                return Ok(CurrentUser {
                    id: u.id,
                    email: u.email,
                    name: u.name,
                    role: u.role,
                    branch_id: u.branch_id,
                });
            }

            let id = Uuid::new_v4();
            let _ = sqlx::query(
                "INSERT INTO users (id, email, name, role, is_active) VALUES (?1, ?2, ?3, 'sys_admin', 1)"
            )
            .bind(id)
            .bind(dev_email)
            .bind("Dev Admin")
            .execute(&pool)
            .await;

            return Ok(CurrentUser {
                id,
                email: dev_email.to_string(),
                name: "Dev Admin".to_string(),
                role: "sys_admin".to_string(),
                branch_id: None,
            });
        }

        let user_id_str = user_id_header
            .and_then(|v| v.to_str().ok())
            .ok_or(StatusCode::UNAUTHORIZED)?;

        let email = parts
            .headers
            .get(HeaderName::from_static("x-user-email"))
            .and_then(|v| v.to_str().ok())
            .ok_or(StatusCode::UNAUTHORIZED)?
            .to_string();

        let name = parts
            .headers
            .get(HeaderName::from_static("x-user-name"))
            .and_then(|v| v.to_str().ok())
            .ok_or(StatusCode::UNAUTHORIZED)?
            .to_string();

        let role = parts
            .headers
            .get(HeaderName::from_static("x-user-role"))
            .and_then(|v| v.to_str().ok())
            .ok_or(StatusCode::UNAUTHORIZED)?
            .to_string();

        let branch_id = parts
            .headers
            .get(HeaderName::from_static("x-user-branch-id"))
            .and_then(|v| v.to_str().ok())
            .filter(|s| !s.is_empty())
            .and_then(|s| Uuid::parse_str(s).ok());

        let id = Uuid::parse_str(user_id_str).map_err(|_| StatusCode::UNAUTHORIZED)?;

        let pool = SqlitePool::from_ref(state);

        let _ = sqlx::query(
            "INSERT INTO users (id, email, name, role, branch_id, last_login_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
             ON CONFLICT(id) DO UPDATE SET \
               email = excluded.email, \
               name = excluded.name, \
               role = excluded.role, \
               branch_id = excluded.branch_id, \
               last_login_at = excluded.last_login_at",
        )
        .bind(id)
        .bind(&email)
        .bind(&name)
        .bind(&role)
        .bind(branch_id)
        .bind(chrono::Utc::now())
        .execute(&pool)
        .await
        .map_err(|e| {
            eprintln!("Failed to upsert user from auth headers: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        Ok(CurrentUser {
            id,
            email,
            name,
            role,
            branch_id,
        })
    }
}

// ─── AdminUser ──────────────────────────────────────────────────────────────

pub struct AdminUser(pub CurrentUser);

impl<S> FromRequestParts<S> for AdminUser
where
    S: Send + Sync,
    SqlitePool: axum::extract::FromRef<S>,
    S: std::fmt::Debug,
{
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let user = CurrentUser::from_request_parts(parts, state).await?;
        if user.role != "sys_admin" {
            return Err(StatusCode::FORBIDDEN);
        }
        Ok(AdminUser(user))
    }
}

// ─── BranchUser ─────────────────────────────────────────────────────────────

pub struct BranchUser(pub CurrentUser);

impl<S> FromRequestParts<S> for BranchUser
where
    S: Send + Sync,
    SqlitePool: axum::extract::FromRef<S>,
    S: std::fmt::Debug,
{
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let user = CurrentUser::from_request_parts(parts, state).await?;
        if user.branch_id.is_none() {
            return Err(StatusCode::FORBIDDEN);
        }
        Ok(BranchUser(user))
    }
}
