use axum::{
    extract::{FromRef, FromRequestParts},
    http::{HeaderName, StatusCode, request::Parts},
};
use jsonwebtoken::{DecodingKey, Validation, decode, encode, Header, EncodingKey};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,       // user UUID
    pub email: String,
    pub name: String,
    pub role: String,
    pub branch_id: Option<String>,
    pub exp: usize,
    pub iat: usize,
}

#[derive(Debug, Clone)]
pub struct CurrentUser {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub role: String,
    pub branch_id: Option<Uuid>,
}

#[derive(Debug, Clone)]
pub struct AdminUser(pub CurrentUser);

fn jwt_secret() -> String {
    std::env::var("JWT_SECRET")
        .or_else(|_| std::env::var("SECRET_KEY"))
        .unwrap_or_else(|_| "change-me-in-production".to_string())
}

pub fn create_token(user: &CurrentUser) -> Result<String, String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs() as usize;

    let claims = Claims {
        sub: user.id.to_string(),
        email: user.email.clone(),
        name: user.name.clone(),
        role: user.role.clone(),
        branch_id: user.branch_id.map(|id| id.to_string()),
        exp: now + 86400 * 7, // 7 days
        iat: now,
    };

    encode(&Header::default(), &claims, &EncodingKey::from_secret(jwt_secret().as_bytes()))
        .map_err(|e| e.to_string())
}

fn decode_token(token: &str) -> Result<Claims, StatusCode> {
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(jwt_secret().as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| StatusCode::UNAUTHORIZED)?;

    Ok(token_data.claims)
}

impl<S> FromRequestParts<S> for CurrentUser
where
    S: Send + Sync,
    SqlitePool: FromRef<S>,
{
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        // Strategy 1: X-User-* headers from auth-worker (production mode)
        if let Some(user_id_str) = parts
            .headers
            .get(HeaderName::from_static("x-user-id"))
            .and_then(|v| v.to_str().ok())
        {
            let id = Uuid::parse_str(user_id_str).map_err(|_| StatusCode::UNAUTHORIZED)?;
            let email = parts
                .headers
                .get(HeaderName::from_static("x-user-email"))
                .and_then(|v| v.to_str().ok())
                .ok_or(StatusCode::UNAUTHORIZED)?;
            let name = parts
                .headers
                .get(HeaderName::from_static("x-user-name"))
                .and_then(|v| v.to_str().ok())
                .ok_or(StatusCode::UNAUTHORIZED)?;
            let role = parts
                .headers
                .get(HeaderName::from_static("x-user-role"))
                .and_then(|v| v.to_str().ok())
                .ok_or(StatusCode::UNAUTHORIZED)?;
            let branch_id = parts
                .headers
                .get(HeaderName::from_static("x-user-branch-id"))
                .and_then(|v| v.to_str().ok())
                .filter(|s| !s.is_empty())
                .and_then(|s| Uuid::parse_str(s).ok());

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
            .bind(email.to_string())
            .bind(name.to_string())
            .bind(role.to_string())
            .bind(branch_id)
            .bind(chrono::Utc::now())
            .execute(&pool)
            .await;

            return Ok(CurrentUser { id, email: email.to_string(), name: name.to_string(), role: role.to_string(), branch_id });
        }

        // Strategy 2: Bearer JWT token (direct auth mode)
        let auth_header = parts
            .headers
            .get(HeaderName::from_static("authorization"))
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or(StatusCode::UNAUTHORIZED)?;

        let claims = decode_token(auth_header)?;

        let id = Uuid::parse_str(&claims.sub).map_err(|_| StatusCode::UNAUTHORIZED)?;
        let branch_id = claims.branch_id.as_deref().and_then(|s| Uuid::parse_str(s).ok());

        Ok(CurrentUser {
            id,
            email: claims.email,
            name: claims.name,
            role: claims.role,
            branch_id,
        })
    }
}

impl<S> FromRequestParts<S> for AdminUser
where
    S: Send + Sync,
    SqlitePool: FromRef<S>,
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
