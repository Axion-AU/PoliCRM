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

// ─── Models ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct Automation {
    pub id: String,
    pub branch_id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub trigger_type: String,
    pub trigger_config: String,
    pub conditions: Option<String>,
    pub actions: String,
    pub is_active: i32,
    pub created_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct AutomationRun {
    pub id: String,
    pub automation_id: String,
    pub person_id: Option<String>,
    pub trigger_type: String,
    pub trigger_context: Option<String>,
    pub actions_taken: Option<String>,
    pub status: String,
    pub error_message: Option<String>,
    pub ran_at: String,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct ActivityLogEntry {
    pub id: String,
    pub user_id: Option<String>,
    pub person_id: Option<String>,
    pub action: String,
    pub description: Option<String>,
    pub metadata: Option<String>,
    pub created_at: String,
}

// ─── Payloads ─────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateAutomationPayload {
    pub branch_id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub trigger_type: String,
    pub trigger_config: serde_json::Value,
    pub conditions: Option<serde_json::Value>,
    pub actions: Vec<serde_json::Value>,
}

#[derive(Deserialize)]
pub struct UpdateAutomationPayload {
    pub name: Option<String>,
    pub description: Option<Option<String>>,
    pub trigger_type: Option<String>,
    pub trigger_config: Option<serde_json::Value>,
    pub conditions: Option<Option<serde_json::Value>>,
    pub actions: Option<Vec<serde_json::Value>>,
}

#[derive(Deserialize)]
pub struct ListAutomationsQuery {
    pub is_active: Option<String>,
    pub trigger_type: Option<String>,
}

#[derive(Deserialize)]
pub struct TestAutomationPayload {
    pub person_id: String,
}

#[derive(Serialize)]
pub struct AutomationResponse {
    pub id: String,
    pub branch_id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub trigger_type: String,
    pub trigger_config: serde_json::Value,
    pub conditions: Option<serde_json::Value>,
    pub actions: Vec<serde_json::Value>,
    pub is_active: bool,
    pub created_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct AutomationRunResponse {
    pub id: String,
    pub automation_id: String,
    pub person_id: Option<String>,
    pub trigger_type: String,
    pub trigger_context: Option<serde_json::Value>,
    pub actions_taken: Vec<serde_json::Value>,
    pub status: String,
    pub error_message: Option<String>,
    pub ran_at: String,
}

#[derive(Serialize)]
pub struct ActivityLogResponse {
    pub id: String,
    pub user_id: Option<String>,
    pub person_id: Option<String>,
    pub action: String,
    pub description: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct ActivityStatsResponse {
    pub tasks_completed_today: i64,
    pub contacts_made_this_week: i64,
    pub new_people_this_week: i64,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn automation_to_response(a: Automation) -> AutomationResponse {
    let trigger_config: serde_json::Value = serde_json::from_str(&a.trigger_config).unwrap_or_default();
    let conditions: Option<serde_json::Value> = a.conditions.as_deref()
        .and_then(|c| serde_json::from_str(c).ok());
    let actions: Vec<serde_json::Value> = serde_json::from_str(&a.actions).unwrap_or_default();

    AutomationResponse {
        id: a.id,
        branch_id: a.branch_id,
        name: a.name,
        description: a.description,
        trigger_type: a.trigger_type,
        trigger_config,
        conditions,
        actions,
        is_active: a.is_active != 0,
        created_by: a.created_by,
        created_at: a.created_at,
        updated_at: a.updated_at,
    }
}

fn run_to_response(r: AutomationRun) -> AutomationRunResponse {
    let trigger_context: Option<serde_json::Value> = r.trigger_context.as_deref()
        .and_then(|c| serde_json::from_str(c).ok());
    let actions_taken: Vec<serde_json::Value> = r.actions_taken.as_deref()
        .and_then(|a| serde_json::from_str(a).ok())
        .unwrap_or_default();

    AutomationRunResponse {
        id: r.id,
        automation_id: r.automation_id,
        person_id: r.person_id,
        trigger_type: r.trigger_type,
        trigger_context,
        actions_taken,
        status: r.status,
        error_message: r.error_message,
        ran_at: r.ran_at,
    }
}

fn activity_to_response(e: ActivityLogEntry) -> ActivityLogResponse {
    let metadata: Option<serde_json::Value> = e.metadata.as_deref()
        .and_then(|m| serde_json::from_str(m).ok());

    ActivityLogResponse {
        id: e.id,
        user_id: e.user_id,
        person_id: e.person_id,
        action: e.action,
        description: e.description,
        metadata,
        created_at: e.created_at,
    }
}

// ─── Router ───────────────────────────────────────────────────────────────────

pub fn router() -> Router<SqlitePool> {
    Router::new()
        .route("/automations", get(list_automations).post(create_automation))
        .route("/automations/{id}", get(get_automation).patch(update_automation).delete(delete_automation))
        .route("/automations/{id}/activate", post(activate_automation))
        .route("/automations/{id}/deactivate", post(deactivate_automation))
        .route("/automations/{id}/runs", get(list_automation_runs))
        .route("/automations/{id}/test", post(test_automation))
        .route("/activity", get(list_activity))
        .route("/activity/stats", get(activity_stats))
}

// ─── Automations CRUD ─────────────────────────────────────────────────────────

async fn list_automations(
    State(pool): State<SqlitePool>,
    Query(query): Query<ListAutomationsQuery>,
) -> Result<Json<Vec<AutomationResponse>>, StatusCode> {
    let mut qb = sqlx::QueryBuilder::new("SELECT * FROM automations WHERE 1=1");
    if let Some(ref active) = query.is_active {
        let val: i32 = if active == "true" || active == "1" { 1 } else { 0 };
        qb.push(" AND is_active = ");
        qb.push_bind(val);
    }
    if let Some(ref trigger_type) = query.trigger_type {
        qb.push(" AND trigger_type = ");
        qb.push_bind(trigger_type);
    }
    qb.push(" ORDER BY created_at DESC");

    let automations = qb.build_query_as::<Automation>()
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error listing automations: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(automations.into_iter().map(automation_to_response).collect()))
}

async fn get_automation(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<Json<AutomationResponse>, StatusCode> {
    let automation = sqlx::query_as::<_, Automation>("SELECT * FROM automations WHERE id = ?1")
        .bind(&id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error getting automation: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    match automation {
        Some(a) => Ok(Json(automation_to_response(a))),
        None => Err(StatusCode::NOT_FOUND),
    }
}

async fn create_automation(
    State(pool): State<SqlitePool>,
    Json(payload): Json<CreateAutomationPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    if payload.name.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let id = Uuid::new_v4().to_string();
    let trigger_config = serde_json::to_string(&payload.trigger_config).map_err(|_| StatusCode::BAD_REQUEST)?;
    let conditions = payload.conditions.map(|c| serde_json::to_string(&c).unwrap_or_default());
    let actions = serde_json::to_string(&payload.actions).map_err(|_| StatusCode::BAD_REQUEST)?;
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        r#"INSERT INTO automations (id, branch_id, name, description, trigger_type, trigger_config, conditions, actions, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"#
    )
    .bind(&id)
    .bind(&payload.branch_id)
    .bind(&payload.name)
    .bind(&payload.description)
    .bind(&payload.trigger_type)
    .bind(&trigger_config)
    .bind(&conditions)
    .bind(&actions)
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|e| {
        eprintln!("Database error creating automation: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let automation = sqlx::query_as::<_, Automation>("SELECT * FROM automations WHERE id = ?1")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(automation_to_response(automation))))
}

async fn update_automation(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateAutomationPayload>,
) -> Result<Json<AutomationResponse>, StatusCode> {
    let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM automations WHERE id = ?1")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if exists == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let now = Utc::now().to_rfc3339();
    let mut query_builder = sqlx::QueryBuilder::new("UPDATE automations SET ");
    let mut separated = query_builder.separated(", ");

    if let Some(ref name) = payload.name {
        separated.push("name = ");
        separated.push_bind_unseparated(name);
    }
    if let Some(ref description) = payload.description {
        separated.push("description = ");
        separated.push_bind_unseparated(description);
    }
    if let Some(ref trigger_type) = payload.trigger_type {
        separated.push("trigger_type = ");
        separated.push_bind_unseparated(trigger_type);
    }
    if let Some(ref trigger_config) = payload.trigger_config {
        let s = serde_json::to_string(trigger_config).map_err(|_| StatusCode::BAD_REQUEST)?;
        separated.push("trigger_config = ");
        separated.push_bind_unseparated(s);
    }
    if let Some(ref conditions) = payload.conditions {
        let s = conditions.as_ref().map(|c| serde_json::to_string(c).unwrap_or_default());
        separated.push("conditions = ");
        separated.push_bind_unseparated(s);
    }
    if let Some(ref actions) = payload.actions {
        let s = serde_json::to_string(actions).map_err(|_| StatusCode::BAD_REQUEST)?;
        separated.push("actions = ");
        separated.push_bind_unseparated(s);
    }

    separated.push("updated_at = ");
    separated.push_bind_unseparated(&now);

    query_builder.push(" WHERE id = ");
    query_builder.push_bind(&id);

    query_builder.build().execute(&pool).await.map_err(|e| {
        eprintln!("Database error updating automation: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let automation = sqlx::query_as::<_, Automation>("SELECT * FROM automations WHERE id = ?1")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(automation_to_response(automation)))
}

async fn delete_automation(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let result = sqlx::query("DELETE FROM automations WHERE id = ?1")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error deleting automation: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        Err(StatusCode::NOT_FOUND)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}

async fn activate_automation(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<Json<AutomationResponse>, StatusCode> {
    let result = sqlx::query("UPDATE automations SET is_active = 1, updated_at = ?1 WHERE id = ?2")
        .bind(Utc::now().to_rfc3339())
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error activating automation: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let automation = sqlx::query_as::<_, Automation>("SELECT * FROM automations WHERE id = ?1")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(automation_to_response(automation)))
}

async fn deactivate_automation(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<Json<AutomationResponse>, StatusCode> {
    let result = sqlx::query("UPDATE automations SET is_active = 0, updated_at = ?1 WHERE id = ?2")
        .bind(Utc::now().to_rfc3339())
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error deactivating automation: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let automation = sqlx::query_as::<_, Automation>("SELECT * FROM automations WHERE id = ?1")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(automation_to_response(automation)))
}

// ─── Runs ─────────────────────────────────────────────────────────────────────

async fn list_automation_runs(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<Json<Vec<AutomationRunResponse>>, StatusCode> {
    let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM automations WHERE id = ?1")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if exists == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let runs = sqlx::query_as::<_, AutomationRun>(
        "SELECT * FROM automation_runs WHERE automation_id = ?1 ORDER BY ran_at DESC"
    )
    .bind(&id)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("Database error listing automation runs: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(runs.into_iter().map(run_to_response).collect()))
}

async fn test_automation(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
    Json(payload): Json<TestAutomationPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    let automation = sqlx::query_as::<_, Automation>("SELECT * FROM automations WHERE id = ?1")
        .bind(&id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error getting automation: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let automation = automation.ok_or(StatusCode::NOT_FOUND)?;

    let person_uuid = Uuid::parse_str(&payload.person_id).map_err(|_| StatusCode::BAD_REQUEST)?;
    let person_exists = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM persons WHERE id = ?1 AND deleted_at IS NULL"
    )
    .bind(person_uuid)
    .fetch_one(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if person_exists == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let conditions_met = match automation.conditions.as_deref() {
        None | Some("") | Some("null") => true,
        Some(conditions_str) => {
            if let Ok(conds) = serde_json::from_str::<Vec<serde_json::Value>>(conditions_str) {
                conds.is_empty()
            } else {
                true
            }
        }
    };

    let actions: Vec<serde_json::Value> = serde_json::from_str(&automation.actions).unwrap_or_default();

    Ok(Json(serde_json::json!({
        "automation_id": automation.id,
        "person_id": payload.person_id,
        "conditions_met": conditions_met,
        "actions": if conditions_met { actions } else { Vec::<serde_json::Value>::new() },
        "note": if conditions_met { "Conditions met — these actions would be executed" } else { "Conditions not met — no actions would be executed" }
    })))
}

// ─── Activity Feed ────────────────────────────────────────────────────────────

async fn list_activity(
    State(pool): State<SqlitePool>,
) -> Result<Json<Vec<ActivityLogResponse>>, StatusCode> {
    let entries = sqlx::query_as::<_, ActivityLogEntry>(
        "SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 50"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("Database error listing activity: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(entries.into_iter().map(activity_to_response).collect()))
}

async fn activity_stats(
    State(pool): State<SqlitePool>,
) -> Result<Json<ActivityStatsResponse>, StatusCode> {
    let tasks_completed_today: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM activity_log WHERE action = 'task_completed' AND date(created_at) = date('now')"
    )
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    let contacts_made_this_week: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM activity_log WHERE action = 'contact_made' AND created_at >= datetime('now', '-7 days')"
    )
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    let new_people_this_week: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM activity_log WHERE action = 'person_created' AND created_at >= datetime('now', '-7 days')"
    )
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    Ok(Json(ActivityStatsResponse {
        tasks_completed_today,
        contacts_made_this_week,
        new_people_this_week,
    }))
}
