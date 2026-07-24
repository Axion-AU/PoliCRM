use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, patch, post},
    Json, Router,
};
use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::auth::{AdminUser, CurrentUser};
use crate::models::Branch;

// ─── Response types ─────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct BranchResponse {
    pub id: Uuid,
    pub name: String,
    pub r#type: String,
    pub parent_id: Option<Uuid>,
    pub parent_name: Option<String>,
    pub children_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct BranchTreeNode {
    pub id: Uuid,
    pub name: String,
    pub r#type: String,
    pub parent_id: Option<Uuid>,
    pub children: Vec<BranchTreeNode>,
}

// ─── Payloads ───────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateBranchPayload {
    pub name: String,
    pub r#type: String,
    pub parent_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct UpdateBranchPayload {
    pub name: Option<String>,
    pub r#type: Option<String>,
    pub parent_id: Option<Option<Uuid>>,
}

#[derive(Deserialize)]
pub struct ListBranchesQuery {
    pub r#type: Option<String>,
}

// ─── Router ─────────────────────────────────────────────────────────────────

pub fn router() -> Router<SqlitePool> {
    Router::new()
        .route("/", get(list_branches).post(create_branch))
        .route("/{id}", get(get_branch).patch(update_branch).delete(delete_branch))
        .route("/{id}/tree", get(get_branch_tree))
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async fn children_count(pool: &SqlitePool, parent_id: Uuid) -> i64 {
    sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM branches WHERE parent_id = ?1")
        .bind(parent_id)
        .fetch_one(pool)
        .await
        .unwrap_or(0)
}

fn build_subtree<'a>(pool: &'a SqlitePool, parent_id: Uuid) -> BoxFuture<'a, Vec<BranchTreeNode>> {
    Box::pin(async move {
        let children = sqlx::query_as::<_, Branch>(
            "SELECT * FROM branches WHERE parent_id = ?1 ORDER BY name",
        )
        .bind(parent_id)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        let mut tree = Vec::new();
        for child in children {
            let grandchildren = build_subtree(pool, child.id).await;
            tree.push(BranchTreeNode {
                id: child.id,
                name: child.name,
                r#type: child.r#type,
                parent_id: child.parent_id,
                children: grandchildren,
            });
        }
        tree
    })
}

// ─── Handlers ───────────────────────────────────────────────────────────────

async fn list_branches(
    State(pool): State<SqlitePool>,
    _user: CurrentUser,
    Query(query): Query<ListBranchesQuery>,
) -> Result<Json<Vec<BranchResponse>>, StatusCode> {
    let branches = if let Some(ref r#type) = query.r#type {
        sqlx::query_as::<_, Branch>(
            "SELECT * FROM branches WHERE type = ?1 ORDER BY name",
        )
        .bind(r#type)
        .fetch_all(&pool)
        .await
    } else {
        sqlx::query_as::<_, Branch>("SELECT * FROM branches ORDER BY name")
            .fetch_all(&pool)
            .await
    }
    .map_err(|e| {
        eprintln!("Database error listing branches: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut responses = Vec::new();
    for b in branches {
        let parent_name: Option<String> = if let Some(pid) = b.parent_id {
            sqlx::query_scalar("SELECT name FROM branches WHERE id = ?1")
                .bind(pid)
                .fetch_optional(&pool)
                .await
                .unwrap_or(None)
        } else {
            None
        };

        responses.push(BranchResponse {
            id: b.id,
            name: b.name,
            r#type: b.r#type,
            parent_id: b.parent_id,
            parent_name,
            children_count: children_count(&pool, b.id).await,
            created_at: b.created_at.to_rfc3339(),
            updated_at: b.updated_at.to_rfc3339(),
        });
    }

    Ok(Json(responses))
}

async fn get_branch(
    State(pool): State<SqlitePool>,
    _user: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<BranchResponse>, StatusCode> {
    let branch = sqlx::query_as::<_, Branch>("SELECT * FROM branches WHERE id = ?1")
        .bind(id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error fetching branch: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    match branch {
        Some(b) => {
            let parent_name: Option<String> = if let Some(pid) = b.parent_id {
                sqlx::query_scalar("SELECT name FROM branches WHERE id = ?1")
                    .bind(pid)
                    .fetch_optional(&pool)
                    .await
                    .unwrap_or(None)
            } else {
                None
            };

            Ok(Json(BranchResponse {
                id: b.id,
                name: b.name,
                r#type: b.r#type,
                parent_id: b.parent_id,
                parent_name,
                children_count: children_count(&pool, b.id).await,
                created_at: b.created_at.to_rfc3339(),
                updated_at: b.updated_at.to_rfc3339(),
            }))
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}

async fn create_branch(
    State(pool): State<SqlitePool>,
    _admin: AdminUser,
    Json(payload): Json<CreateBranchPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    if payload.name.trim().is_empty() || payload.r#type.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let valid_types = ["national", "state", "branch", "team"];
    if !valid_types.contains(&payload.r#type.as_str()) {
        return Err(StatusCode::BAD_REQUEST);
    }

    if let Some(pid) = payload.parent_id {
        let parent_exists = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM branches WHERE id = ?1",
        )
        .bind(pid)
        .fetch_one(&pool)
        .await
        .unwrap_or(0);

        if parent_exists == 0 {
            return Err(StatusCode::BAD_REQUEST);
        }
    }

    let id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO branches (id, name, type, parent_id) VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(id)
    .bind(&payload.name)
    .bind(&payload.r#type)
    .bind(payload.parent_id)
    .execute(&pool)
    .await
    .map_err(|e| {
        eprintln!("Database error creating branch: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({"id": id}))))
}

async fn update_branch(
    State(pool): State<SqlitePool>,
    _admin: AdminUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateBranchPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM branches WHERE id = ?1")
        .bind(id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if exists == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let mut query_builder = sqlx::QueryBuilder::new("UPDATE branches SET ");
    let mut separated = query_builder.separated(", ");

    if let Some(ref name) = payload.name {
        if name.trim().is_empty() {
            return Err(StatusCode::BAD_REQUEST);
        }
        separated.push("name = ");
        separated.push_bind_unseparated(name);
    }

    if let Some(ref r#type) = payload.r#type {
        let valid_types = ["national", "state", "branch", "team"];
        if !valid_types.contains(&r#type.as_str()) {
            return Err(StatusCode::BAD_REQUEST);
        }
        separated.push("type = ");
        separated.push_bind_unseparated(r#type);
    }

    if let Some(ref parent_id_opt) = payload.parent_id {
        if let Some(pid) = parent_id_opt {
            if *pid == id {
                return Err(StatusCode::BAD_REQUEST);
            }
            let parent_exists = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM branches WHERE id = ?1",
            )
            .bind(pid)
            .fetch_one(&pool)
            .await
            .unwrap_or(0);

            if parent_exists == 0 {
                return Err(StatusCode::BAD_REQUEST);
            }
        }
        separated.push("parent_id = ");
        separated.push_bind_unseparated(parent_id_opt);
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
            eprintln!("Database error updating branch: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::OK)
}

async fn delete_branch(
    State(pool): State<SqlitePool>,
    _admin: AdminUser,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, StatusCode> {
    let child_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM branches WHERE parent_id = ?1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if child_count > 0 {
        return Err(StatusCode::CONFLICT);
    }

    let result = sqlx::query("DELETE FROM branches WHERE id = ?1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error deleting branch: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        Err(StatusCode::NOT_FOUND)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}

async fn get_branch_tree(
    State(pool): State<SqlitePool>,
    _user: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<BranchTreeNode>, StatusCode> {
    let branch = sqlx::query_as::<_, Branch>("SELECT * FROM branches WHERE id = ?1")
        .bind(id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error fetching branch: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    match branch {
        Some(b) => {
            let children = build_subtree(&pool, b.id).await;
            Ok(Json(BranchTreeNode {
                id: b.id,
                name: b.name,
                r#type: b.r#type,
                parent_id: b.parent_id,
                children,
            }))
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}
