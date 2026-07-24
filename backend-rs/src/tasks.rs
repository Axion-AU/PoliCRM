use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, patch, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

// ─── Task Model ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Task {
    pub id: Uuid,
    pub person_id: Option<Uuid>,
    pub assigned_to: Option<String>,
    pub assigned_by: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub due_date: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub completed_by: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Serialize)]
pub struct TaskResponse {
    pub id: String,
    pub person_id: Option<String>,
    pub assigned_to: Option<String>,
    pub assigned_by: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub due_date: Option<String>,
    pub completed_at: Option<String>,
    pub completed_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn to_task_response(t: Task) -> TaskResponse {
    TaskResponse {
        id: t.id.to_string(),
        person_id: t.person_id.map(|u| u.to_string()),
        assigned_to: t.assigned_to,
        assigned_by: t.assigned_by,
        title: t.title,
        description: t.description,
        status: t.status,
        due_date: t.due_date.map(|d| d.to_rfc3339()),
        completed_at: t.completed_at.map(|d| d.to_rfc3339()),
        completed_by: t.completed_by,
        created_at: t.created_at.to_rfc3339(),
        updated_at: t.updated_at.to_rfc3339(),
    }
}

// ─── Payloads ────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateTaskPayload {
    pub person_id: Option<Uuid>,
    pub assigned_to: Option<String>,
    pub assigned_by: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub due_date: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateTaskPayload {
    pub title: Option<String>,
    pub description: Option<Option<String>>,
    pub assigned_to: Option<Option<String>>,
    pub due_date: Option<Option<String>>,
}

#[derive(Deserialize)]
pub struct ListTasksQuery {
    pub assigned_to: Option<String>,
    pub status: Option<String>,
    pub due_before: Option<String>,
    pub person_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct TagList {
    pub tags: Vec<String>,
}

#[derive(Serialize)]
pub struct TagListResponse {
    pub tags: Vec<String>,
}

// ─── Router ──────────────────────────────────────────────────────────────────

pub fn router() -> Router<SqlitePool> {
    Router::new()
        .route("/tasks", get(list_tasks).post(create_task))
        .route("/tasks/today", get(today_tasks))
        .route("/tasks/overdue", get(overdue_tasks))
        .route("/tasks/{id}", get(get_task).patch(update_task).delete(delete_task))
        .route("/tasks/{id}/complete", post(complete_task))
        .route("/tasks/{id}/cancel", post(cancel_task))
        .route("/persons/{id}/tags", post(add_person_tags).delete(remove_person_tags))
        .route("/tags", get(list_all_tags))
}

// ─── Task Handlers ──────────────────────────────────────────────────────────

async fn list_tasks(
    State(pool): State<SqlitePool>,
    Query(query): Query<ListTasksQuery>,
) -> Result<Json<Vec<TaskResponse>>, StatusCode> {
    let mut qb = sqlx::QueryBuilder::new("SELECT * FROM tasks WHERE 1=1");

    if let Some(ref assigned_to) = query.assigned_to {
        qb.push(" AND assigned_to = ");
        qb.push_bind(assigned_to);
    }

    if let Some(ref status) = query.status {
        qb.push(" AND status = ");
        qb.push_bind(status);
    }

    if let Some(ref due_before) = query.due_before {
        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(due_before) {
            qb.push(" AND (due_date IS NOT NULL AND due_date <= ");
            qb.push_bind(dt.with_timezone(&Utc));
            qb.push(")");
        }
    }

    if let Some(person_id) = query.person_id {
        qb.push(" AND person_id = ");
        qb.push_bind(person_id);
    }

    qb.push(" ORDER BY created_at DESC");

    let tasks = qb.build_query_as::<Task>()
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error listing tasks: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(tasks.into_iter().map(to_task_response).collect()))
}

async fn today_tasks(
    State(pool): State<SqlitePool>,
) -> Result<Json<Vec<TaskResponse>>, StatusCode> {
    let tasks = sqlx::query_as::<_, Task>(
        "SELECT * FROM tasks WHERE date(due_date) <= date('now') AND status = 'pending' ORDER BY due_date ASC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("Database error fetching today's tasks: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(tasks.into_iter().map(to_task_response).collect()))
}

async fn overdue_tasks(
    State(pool): State<SqlitePool>,
) -> Result<Json<Vec<TaskResponse>>, StatusCode> {
    let tasks = sqlx::query_as::<_, Task>(
        "SELECT * FROM tasks WHERE date(due_date) < date('now') AND status = 'pending' ORDER BY due_date ASC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("Database error fetching overdue tasks: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(tasks.into_iter().map(to_task_response).collect()))
}

async fn get_task(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
) -> Result<Json<TaskResponse>, StatusCode> {
    let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = ?1")
        .bind(id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error fetching task: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    match task {
        Some(t) => Ok(Json(to_task_response(t))),
        None => Err(StatusCode::NOT_FOUND),
    }
}

async fn create_task(
    State(pool): State<SqlitePool>,
    Json(payload): Json<CreateTaskPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    if payload.title.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let id = Uuid::new_v4();

    let due_date = payload.due_date.as_deref()
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.with_timezone(&Utc));

    sqlx::query(
        r#"
        INSERT INTO tasks (id, person_id, assigned_to, assigned_by, title, description, due_date)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        "#,
    )
    .bind(id)
    .bind(payload.person_id)
    .bind(&payload.assigned_to)
    .bind(&payload.assigned_by)
    .bind(&payload.title)
    .bind(&payload.description)
    .bind(due_date)
    .execute(&pool)
    .await
    .map_err(|e| {
        eprintln!("Database error creating task: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({"id": id}))))
}

async fn update_task(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateTaskPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM tasks WHERE id = ?1")
        .bind(id)
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error checking task existence: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if exists == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let mut qb = sqlx::QueryBuilder::new("UPDATE tasks SET ");
    let mut separated = qb.separated(", ");

    if let Some(ref title) = payload.title {
        separated.push("title = ");
        separated.push_bind_unseparated(title);
    }

    if let Some(ref description_opt) = payload.description {
        separated.push("description = ");
        separated.push_bind_unseparated(description_opt);
    }

    if let Some(ref assigned_to_opt) = payload.assigned_to {
        separated.push("assigned_to = ");
        separated.push_bind_unseparated(assigned_to_opt);
    }

    if let Some(ref due_date_opt) = payload.due_date {
        let parsed = due_date_opt.as_deref()
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.with_timezone(&Utc));
        separated.push("due_date = ");
        separated.push_bind_unseparated(parsed);
    }

    separated.push("updated_at = ");
    separated.push_bind_unseparated(Utc::now());

    qb.push(" WHERE id = ");
    qb.push_bind(id);

    qb.build().execute(&pool).await.map_err(|e| {
        eprintln!("Database error updating task: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(StatusCode::OK)
}

async fn complete_task(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, StatusCode> {
    let now = Utc::now();
    let result = sqlx::query(
        r#"
        UPDATE tasks SET status = 'completed', completed_at = ?1, updated_at = ?2
        WHERE id = ?3 AND status != 'completed'
        "#,
    )
    .bind(now)
    .bind(now)
    .bind(id)
    .execute(&pool)
    .await
    .map_err(|e| {
        eprintln!("Database error completing task: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(StatusCode::OK)
}

async fn cancel_task(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, StatusCode> {
    let result = sqlx::query(
        "UPDATE tasks SET status = 'cancelled', updated_at = ?1 WHERE id = ?2 AND status NOT IN ('completed', 'cancelled')"
    )
    .bind(Utc::now())
    .bind(id)
    .execute(&pool)
    .await
    .map_err(|e| {
        eprintln!("Database error cancelling task: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(StatusCode::OK)
}

async fn delete_task(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, StatusCode> {
    let result = sqlx::query("DELETE FROM tasks WHERE id = ?1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error deleting task: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        Err(StatusCode::NOT_FOUND)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}

// ─── Tag Handlers ─────────────────────────────────────────────────────────────

async fn add_person_tags(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
    Json(payload): Json<TagList>,
) -> Result<impl IntoResponse, StatusCode> {
    let existing_tags: Option<String> = sqlx::query_scalar(
        "SELECT tags FROM persons WHERE id = ?1 AND deleted_at IS NULL"
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("Database error fetching person tags: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .flatten();

    let mut current: Vec<String> = existing_tags
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    for tag in payload.tags {
        if !current.contains(&tag) {
            current.push(tag);
        }
    }

    let updated = serde_json::to_string(&current).unwrap_or_else(|_| "[]".to_string());

    let result = sqlx::query("UPDATE persons SET tags = ?1, updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL")
        .bind(&updated)
        .bind(Utc::now())
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error updating person tags: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(StatusCode::OK)
}

async fn remove_person_tags(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
    Json(payload): Json<TagList>,
) -> Result<impl IntoResponse, StatusCode> {
    let existing_tags: Option<String> = sqlx::query_scalar(
        "SELECT tags FROM persons WHERE id = ?1 AND deleted_at IS NULL"
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("Database error fetching person tags: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .flatten();

    let mut current: Vec<String> = existing_tags
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    current.retain(|t| !payload.tags.contains(t));

    let updated = serde_json::to_string(&current).unwrap_or_else(|_| "[]".to_string());

    let result = sqlx::query("UPDATE persons SET tags = ?1, updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL")
        .bind(&updated)
        .bind(Utc::now())
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error updating person tags: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(StatusCode::OK)
}

async fn list_all_tags(
    State(pool): State<SqlitePool>,
) -> Result<Json<TagListResponse>, StatusCode> {
    let rows: Vec<Option<String>> = sqlx::query_scalar(
        "SELECT tags FROM persons WHERE deleted_at IS NULL AND tags IS NOT NULL AND tags != '[]'"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("Database error listing tags: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut all_tags: Vec<String> = Vec::new();
    for row in rows {
        if let Some(tags_str) = row {
            if let Ok(tags) = serde_json::from_str::<Vec<String>>(&tags_str) {
                for tag in tags {
                    if !all_tags.contains(&tag) {
                        all_tags.push(tag);
                    }
                }
            }
        }
    }

    all_tags.sort();

    Ok(Json(TagListResponse { tags: all_tags }))
}
