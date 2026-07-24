use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

// ─── Email Campaign Models ────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct EmailCampaign {
    pub id: String,
    pub branch_id: Option<String>,
    pub title: String,
    pub subject: String,
    pub body_html: String,
    pub sender_name: Option<String>,
    pub sender_email: Option<String>,
    pub status: String,
    pub scheduled_at: Option<DateTime<Utc>>,
    pub sent_at: Option<DateTime<Utc>>,
    pub created_by: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct EmailRecipient {
    pub id: String,
    pub campaign_id: String,
    pub person_id: String,
    pub email_address: String,
    pub status: String,
    pub sent_at: Option<DateTime<Utc>>,
    pub opened_at: Option<DateTime<Utc>>,
    pub clicked_at: Option<DateTime<Utc>>,
    pub bounce_reason: Option<String>,
    pub created_at: DateTime<Utc>,
}

// ─── SMS Models ───────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct SmsMessage {
    pub id: String,
    pub person_id: Option<String>,
    pub phone_number: String,
    pub body: String,
    pub sender_name: Option<String>,
    pub status: String,
    pub sent_at: Option<DateTime<Utc>>,
    pub delivered_at: Option<DateTime<Utc>>,
    pub campaign_id: Option<String>,
    pub created_at: DateTime<Utc>,
}

// ─── Prospect Models ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct ProspectScore {
    pub person_id: String,
    pub score: i32,
    pub score_components: Option<String>,
    pub suggested_ask_cents: Option<i32>,
    pub reason: Option<String>,
    pub tier: String,
    pub last_calculated: DateTime<Utc>,
}

// ─── Response Types ───────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct CampaignStats {
    pub sent: i64,
    pub opened: i64,
    pub clicked: i64,
    pub bounced: i64,
    pub pending: i64,
    pub open_rate: f64,
    pub click_rate: f64,
    pub bounce_rate: f64,
}

#[derive(Serialize)]
pub struct CampaignResponse {
    pub id: String,
    pub branch_id: Option<String>,
    pub title: String,
    pub subject: String,
    pub body_html: String,
    pub sender_name: Option<String>,
    pub sender_email: Option<String>,
    pub status: String,
    pub scheduled_at: Option<String>,
    pub sent_at: Option<String>,
    pub created_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub stats: CampaignStats,
}

#[derive(Serialize)]
pub struct RecipientResponse {
    pub id: String,
    pub campaign_id: String,
    pub person_id: String,
    pub email_address: String,
    pub status: String,
    pub sent_at: Option<String>,
    pub opened_at: Option<String>,
    pub clicked_at: Option<String>,
    pub bounce_reason: Option<String>,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct SmsStatsResponse {
    pub total_sent: i64,
    pub delivery_rate: f64,
    pub by_date: Vec<SmsDayStat>,
}

#[derive(Serialize)]
pub struct SmsDayStat {
    pub date: String,
    pub sent: i64,
    pub delivered: i64,
    pub failed: i64,
}

#[derive(Serialize)]
pub struct SmsResponse {
    pub id: String,
    pub person_id: Option<String>,
    pub phone_number: String,
    pub body: String,
    pub sender_name: Option<String>,
    pub status: String,
    pub sent_at: Option<String>,
    pub delivered_at: Option<String>,
    pub campaign_id: Option<String>,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct ProspectResponse {
    pub person_id: String,
    pub score: i32,
    pub score_components: Option<serde_json::Value>,
    pub suggested_ask_cents: Option<i32>,
    pub reason: Option<String>,
    pub tier: String,
    pub last_calculated: String,
}

// ─── Input Payloads ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateCampaignPayload {
    pub branch_id: Option<String>,
    pub title: String,
    pub subject: String,
    pub body_html: String,
    pub sender_name: Option<String>,
    pub sender_email: Option<String>,
    pub scheduled_at: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateCampaignPayload {
    pub title: Option<String>,
    pub subject: Option<String>,
    pub body_html: Option<String>,
    pub sender_name: Option<Option<String>>,
    pub sender_email: Option<Option<String>>,
    pub status: Option<String>,
    pub scheduled_at: Option<Option<String>>,
}

#[derive(Deserialize)]
pub struct AddRecipientsPayload {
    pub person_ids: Vec<String>,
}

#[derive(Deserialize)]
pub struct SendSmsPayload {
    pub person_id: String,
    pub phone_number: String,
    pub body: String,
    pub sender_name: Option<String>,
}

#[derive(Deserialize)]
pub struct BroadcastSmsPayload {
    pub person_ids: Vec<String>,
    pub body: String,
    pub sender_name: Option<String>,
}

#[derive(Deserialize)]
pub struct ListCampaignsQuery {
    pub status: Option<String>,
    pub branch_id: Option<String>,
}

#[derive(Deserialize)]
pub struct ListSmsQuery {
    pub person_id: Option<String>,
    pub status: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
}

#[derive(Deserialize)]
pub struct LogOutcomePayload {
    pub outcome: String,
    pub pledged_cents: Option<i32>,
    pub notes: Option<String>,
}

// ─── Router ───────────────────────────────────────────────────────────────────

pub fn router() -> Router<SqlitePool> {
    Router::new()
        // Email campaigns
        .route("/email-campaigns", get(list_campaigns).post(create_campaign))
        .route("/email-campaigns/{id}", get(get_campaign).patch(update_campaign))
        .route("/email-campaigns/{id}/send", post(send_campaign))
        .route("/email-campaigns/{id}/preview", post(preview_campaign))
        .route("/email-campaigns/{id}/stats", get(get_campaign_stats))
        .route("/email-campaigns/{id}/recipients", get(list_recipients).post(add_recipients))
        .route("/email-campaigns/{id}/recipients/{recipient_id}", delete(delete_recipient))
        // SMS
        .route("/sms/send", post(send_sms))
        .route("/sms/broadcast", post(broadcast_sms))
        .route("/sms/messages", get(list_sms_messages))
        .route("/sms/stats", get(get_sms_stats))
        // Prospects
        .route("/prospects", get(list_prospects))
        .route("/prospects/{id}", get(get_prospect))
        .route("/prospects/recalculate", post(recalculate_prospects))
        .route("/prospects/{id}/log-outcome", post(log_prospect_outcome))
}

// ─── Email Campaign Handlers ──────────────────────────────────────────────────

async fn list_campaigns(
    State(pool): State<SqlitePool>,
    Query(query): Query<ListCampaignsQuery>,
) -> Result<Json<Vec<CampaignResponse>>, StatusCode> {
    let mut qb = sqlx::QueryBuilder::new("SELECT * FROM email_campaigns WHERE 1=1");
    if let Some(ref status) = query.status {
        qb.push(" AND status = ");
        qb.push_bind(status);
    }
    if let Some(ref branch_id) = query.branch_id {
        qb.push(" AND branch_id = ");
        qb.push_bind(branch_id);
    }
    qb.push(" ORDER BY created_at DESC");

    let campaigns: Vec<EmailCampaign> = qb.build_query_as()
        .fetch_all(&pool)
        .await
        .map_err(|e| { eprintln!("list_campaigns error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let mut results = Vec::new();
    for c in campaigns {
        let stats = get_stats_for_campaign(&pool, &c.id).await;
        results.push(to_campaign_response(c, stats));
    }
    Ok(Json(results))
}

async fn get_campaign(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<Json<CampaignResponse>, StatusCode> {
    let campaign: Option<EmailCampaign> = sqlx::query_as("SELECT * FROM email_campaigns WHERE id = ?1")
        .bind(&id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| { eprintln!("get_campaign error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    match campaign {
        Some(c) => {
            let stats = get_stats_for_campaign(&pool, &c.id).await;
            Ok(Json(to_campaign_response(c, stats)))
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}

async fn create_campaign(
    State(pool): State<SqlitePool>,
    Json(payload): Json<CreateCampaignPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    if payload.title.trim().is_empty() || payload.subject.trim().is_empty() || payload.body_html.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let id = Uuid::new_v4().to_string();
    let now = Utc::now();

    let scheduled_at = if let Some(ref s) = payload.scheduled_at {
        Some(DateTime::parse_from_rfc3339(s).map_err(|_| StatusCode::BAD_REQUEST)?.with_timezone(&Utc))
    } else {
        None
    };

    sqlx::query(
        r#"INSERT INTO email_campaigns (id, branch_id, title, subject, body_html, sender_name, sender_email, scheduled_at, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"#
    )
    .bind(&id)
    .bind(&payload.branch_id)
    .bind(&payload.title)
    .bind(&payload.subject)
    .bind(&payload.body_html)
    .bind(&payload.sender_name)
    .bind(&payload.sender_email)
    .bind(scheduled_at)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .map_err(|e| { eprintln!("create_campaign error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({"id": id}))))
}

async fn update_campaign(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateCampaignPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM email_campaigns WHERE id = ?1")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .map_err(|e| { eprintln!("update_campaign error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    if exists == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let now = Utc::now();
    let mut query_builder = sqlx::QueryBuilder::new("UPDATE email_campaigns SET ");
    let mut separated = query_builder.separated(", ");

    if let Some(ref title) = payload.title {
        separated.push("title = ");
        separated.push_bind_unseparated(title);
    }
    if let Some(ref subject) = payload.subject {
        separated.push("subject = ");
        separated.push_bind_unseparated(subject);
    }
    if let Some(ref body_html) = payload.body_html {
        separated.push("body_html = ");
        separated.push_bind_unseparated(body_html);
    }
    if let Some(ref sender_name_opt) = payload.sender_name {
        separated.push("sender_name = ");
        separated.push_bind_unseparated(sender_name_opt);
    }
    if let Some(ref sender_email_opt) = payload.sender_email {
        separated.push("sender_email = ");
        separated.push_bind_unseparated(sender_email_opt);
    }
    if let Some(ref status) = payload.status {
        separated.push("status = ");
        separated.push_bind_unseparated(status);
    }
    if let Some(ref scheduled_at_opt) = payload.scheduled_at {
        let parsed = scheduled_at_opt.as_deref().map(|s| DateTime::parse_from_rfc3339(s).ok()).flatten().map(|d| d.with_timezone(&Utc));
        separated.push("scheduled_at = ");
        separated.push_bind_unseparated(parsed);
    }

    separated.push("updated_at = ");
    separated.push_bind_unseparated(now);

    query_builder.push(" WHERE id = ");
    query_builder.push_bind(&id);

    query_builder.build().execute(&pool).await.map_err(|e| {
        eprintln!("update_campaign exec error: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(StatusCode::OK)
}

async fn send_campaign(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let now = Utc::now();
    let result = sqlx::query("UPDATE email_campaigns SET status = 'sent', sent_at = ?1, updated_at = ?2 WHERE id = ?3 AND status = 'draft'")
        .bind(now)
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| { eprintln!("send_campaign error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::BAD_REQUEST); // not in draft or not found
    }

    Ok(StatusCode::OK)
}

async fn preview_campaign(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let campaign: Option<EmailCampaign> = sqlx::query_as("SELECT * FROM email_campaigns WHERE id = ?1")
        .bind(&id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| { eprintln!("preview_campaign error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    match campaign {
        Some(c) => Ok((StatusCode::OK, c.body_html)),
        None => Err(StatusCode::NOT_FOUND),
    }
}

async fn get_campaign_stats(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<Json<CampaignStats>, StatusCode> {
    let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM email_campaigns WHERE id = ?1")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .map_err(|e| { eprintln!("get_campaign_stats error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    if exists == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(Json(get_stats_for_campaign(&pool, &id).await))
}

async fn list_recipients(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<Json<Vec<RecipientResponse>>, StatusCode> {
    let rows: Vec<EmailRecipient> = sqlx::query_as("SELECT * FROM email_recipients WHERE campaign_id = ?1 ORDER BY created_at DESC")
        .bind(&id)
        .fetch_all(&pool)
        .await
        .map_err(|e| { eprintln!("list_recipients error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let resp: Vec<RecipientResponse> = rows.into_iter().map(to_recipient_response).collect();
    Ok(Json(resp))
}

async fn add_recipients(
    State(pool): State<SqlitePool>,
    Path(campaign_id): Path<String>,
    Json(payload): Json<AddRecipientsPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    let campaign_exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM email_campaigns WHERE id = ?1")
        .bind(&campaign_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| { eprintln!("add_recipients error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    if campaign_exists == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let mut added = 0;
    for person_id_str in &payload.person_ids {
        let person_id = match Uuid::parse_str(person_id_str) {
            Ok(id) => id,
            Err(_) => continue,
        };

        let decrypted_email: Option<String> = sqlx::query_scalar("SELECT email FROM persons WHERE id = ?1 AND deleted_at IS NULL")
            .bind(person_id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| { eprintln!("add_recipients fetch email error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?
            .flatten();

        let email = match decrypted_email {
            Some(e) => e,
            None => continue,
        };

        let email_plain = match crate::crypto::decrypt(&email) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let recipient_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT OR IGNORE INTO email_recipients (id, campaign_id, person_id, email_address) VALUES (?1, ?2, ?3, ?4)"
        )
        .bind(&recipient_id)
        .bind(&campaign_id)
        .bind(person_id_str)
        .bind(&email_plain)
        .execute(&pool)
        .await
        .map_err(|e| { eprintln!("add_recipients insert error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

        added += 1;
    }

    Ok(Json(serde_json::json!({"added": added})))
}

async fn delete_recipient(
    State(pool): State<SqlitePool>,
    Path((campaign_id, recipient_id)): Path<(String, String)>,
) -> Result<StatusCode, StatusCode> {
    let result = sqlx::query("DELETE FROM email_recipients WHERE id = ?1 AND campaign_id = ?2")
        .bind(&recipient_id)
        .bind(&campaign_id)
        .execute(&pool)
        .await
        .map_err(|e| { eprintln!("delete_recipient error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok(StatusCode::NO_CONTENT)
}

// ─── SMS Handlers ─────────────────────────────────────────────────────────────

async fn send_sms(
    State(pool): State<SqlitePool>,
    Json(payload): Json<SendSmsPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    if payload.phone_number.trim().is_empty() || payload.body.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let person_uuid = Uuid::parse_str(&payload.person_id).map_err(|_| StatusCode::BAD_REQUEST)?;
    let person_exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM persons WHERE id = ?1 AND deleted_at IS NULL")
        .bind(person_uuid)
        .fetch_one(&pool)
        .await
        .map_err(|e| { eprintln!("send_sms check person error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    if person_exists == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let id = Uuid::new_v4().to_string();
    let now = Utc::now();

    sqlx::query(
        r#"INSERT INTO sms_messages (id, person_id, phone_number, body, sender_name, status, sent_at, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, 'sent', ?6, ?7)"#
    )
    .bind(&id)
    .bind(&payload.person_id)
    .bind(&payload.phone_number)
    .bind(&payload.body)
    .bind(&payload.sender_name)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .map_err(|e| { eprintln!("send_sms insert error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({"id": id}))))
}

async fn broadcast_sms(
    State(pool): State<SqlitePool>,
    Json(payload): Json<BroadcastSmsPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    if payload.body.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let now = Utc::now();
    let mut sent = 0;

    for person_id_str in &payload.person_ids {
        let person_uuid = match Uuid::parse_str(person_id_str) {
            Ok(u) => u,
            Err(_) => continue,
        };

        let phone: Option<String> = sqlx::query_scalar("SELECT phone FROM persons WHERE id = ?1 AND deleted_at IS NULL")
            .bind(person_uuid)
            .fetch_optional(&pool)
            .await
            .map_err(|e| { eprintln!("broadcast_sms query error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?
            .flatten();

        let phone_plain = match phone {
            Some(p) => match crate::crypto::decrypt(&p) {
                Ok(v) => v,
                Err(_) => continue,
            },
            None => continue,
        };

        let id = Uuid::new_v4().to_string();
        sqlx::query(
            r#"INSERT INTO sms_messages (id, person_id, phone_number, body, sender_name, status, sent_at, created_at)
               VALUES (?1, ?2, ?3, ?4, ?5, 'sent', ?6, ?7)"#
        )
        .bind(&id)
        .bind(person_id_str)
        .bind(&phone_plain)
        .bind(&payload.body)
        .bind(&payload.sender_name)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| { eprintln!("broadcast_sms insert error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

        sent += 1;
    }

    Ok(Json(serde_json::json!({"sent": sent})))
}

async fn list_sms_messages(
    State(pool): State<SqlitePool>,
    Query(query): Query<ListSmsQuery>,
) -> Result<Json<Vec<SmsResponse>>, StatusCode> {
    let mut qb = sqlx::QueryBuilder::new("SELECT * FROM sms_messages WHERE 1=1");
    if let Some(ref person_id) = query.person_id {
        qb.push(" AND person_id = ");
        qb.push_bind(person_id);
    }
    if let Some(ref status) = query.status {
        qb.push(" AND status = ");
        qb.push_bind(status);
    }
    if let Some(ref date_from) = query.date_from {
        qb.push(" AND created_at >= ");
        qb.push_bind(date_from);
    }
    if let Some(ref date_to) = query.date_to {
        qb.push(" AND created_at <= ");
        qb.push_bind(date_to);
    }
    qb.push(" ORDER BY created_at DESC");

    let messages: Vec<SmsMessage> = qb.build_query_as()
        .fetch_all(&pool)
        .await
        .map_err(|e| { eprintln!("list_sms error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let resp: Vec<SmsResponse> = messages.into_iter().map(to_sms_response).collect();
    Ok(Json(resp))
}

async fn get_sms_stats(
    State(pool): State<SqlitePool>,
) -> Result<Json<SmsStatsResponse>, StatusCode> {
    let total_sent: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sms_messages WHERE status IN ('sent', 'delivered')")
        .fetch_one(&pool)
        .await
        .unwrap_or(0);

    let delivered: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sms_messages WHERE status = 'delivered'")
        .fetch_one(&pool)
        .await
        .unwrap_or(0);

    let delivery_rate = if total_sent > 0 { delivered as f64 / total_sent as f64 } else { 0.0 };

    let rows: Vec<(String, i64, i64, i64)> = sqlx::query_as(
        "SELECT strftime('%Y-%m-%d', created_at) as date,
                SUM(CASE WHEN status IN ('sent','delivered') THEN 1 ELSE 0 END) as sent,
                SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
         FROM sms_messages
         GROUP BY date
         ORDER BY date DESC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| { eprintln!("get_sms_stats error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let by_date: Vec<SmsDayStat> = rows.into_iter().map(|(date, sent, del, fail)| {
        SmsDayStat { date, sent, delivered: del, failed: fail }
    }).collect();

    Ok(Json(SmsStatsResponse { total_sent, delivery_rate, by_date }))
}

// ─── Prospect Handlers ────────────────────────────────────────────────────────

async fn list_prospects(
    State(pool): State<SqlitePool>,
) -> Result<Json<Vec<ProspectResponse>>, StatusCode> {
    let rows: Vec<ProspectScore> = sqlx::query_as(
        "SELECT * FROM prospect_scores ORDER BY score DESC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| { eprintln!("list_prospects error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let resp: Vec<ProspectResponse> = rows.into_iter().map(to_prospect_response).collect();
    Ok(Json(resp))
}

async fn get_prospect(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
) -> Result<Json<ProspectResponse>, StatusCode> {
    let row: Option<ProspectScore> = sqlx::query_as("SELECT * FROM prospect_scores WHERE person_id = ?1")
        .bind(id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| { eprintln!("get_prospect error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    match row {
        Some(r) => Ok(Json(to_prospect_response(r))),
        None => Err(StatusCode::NOT_FOUND),
    }
}

async fn recalculate_prospects(
    State(pool): State<SqlitePool>,
) -> Result<impl IntoResponse, StatusCode> {
    let now = Utc::now();

    // Get all persons who have donated + those who've volunteered but never donated
    let donors: Vec<(String,)> = sqlx::query_as(
        "SELECT DISTINCT person_id FROM interactions WHERE interaction_type = 'donation'"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| { eprintln!("recalc prospects donors error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let volunteers: Vec<(String,)> = sqlx::query_as(
        "SELECT DISTINCT person_id FROM interactions WHERE interaction_type = 'volunteer_shift' AND person_id NOT IN (SELECT DISTINCT person_id FROM interactions WHERE interaction_type = 'donation')"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| { eprintln!("recalc prospects volunteers error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let mut scored = 0;

    for (person_id_str,) in &donors {
        let person_uuid = match Uuid::parse_str(person_id_str) {
            Ok(u) => u,
            Err(_) => continue,
        };

        let score = calculate_prospect_score(&pool, person_uuid, person_id_str, true).await;
        upsert_prospect_score(&pool, person_id_str, &score, &now).await;
        scored += 1;
    }

    for (person_id_str,) in &volunteers {
        let person_uuid = match Uuid::parse_str(person_id_str) {
            Ok(u) => u,
            Err(_) => continue,
        };

        let score = calculate_prospect_score(&pool, person_uuid, person_id_str, false).await;
        upsert_prospect_score(&pool, person_id_str, &score, &now).await;
        scored += 1;
    }

    Ok(Json(serde_json::json!({"scored": scored})))
}

struct ProspectCalc {
    score: i32,
    components: serde_json::Value,
    suggested_ask_cents: Option<i32>,
    reason: String,
    tier: String,
}

async fn calculate_prospect_score(
    pool: &SqlitePool,
    person_uuid: Uuid,
    person_id_str: &str,
    has_donated: bool,
) -> ProspectCalc {
    let now = Utc::now();

    if !has_donated {
        return ProspectCalc {
            score: 25,
            components: serde_json::json!({"rfm": 0, "email_engagement": 0, "volunteer": 15, "recency": 10}),
            suggested_ask_cents: None,
            reason: "Volunteer — has not donated yet. Engage with education about impact.".to_string(),
            tier: "non_donor".to_string(),
        };
    }

    // Donation data
    let donations: Vec<(String, Option<String>,)> = sqlx::query_as(
        "SELECT strftime('%s', timestamp) as ts, metadata FROM interactions WHERE person_id = ?1 AND interaction_type = 'donation' ORDER BY timestamp DESC"
    )
    .bind(person_uuid)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    if donations.is_empty() {
        return ProspectCalc {
            score: 0,
            components: serde_json::json!({"rfm": 0, "email_engagement": 0, "volunteer": 0, "recency": 0}),
            suggested_ask_cents: None,
            reason: "No donation data available.".to_string(),
            tier: "non_donor".to_string(),
        };
    }

    let mut donation_amounts: Vec<i64> = Vec::new();
    let mut donation_dates: Vec<i64> = Vec::new();

    for (ts_str, meta_json) in &donations {
        let ts: i64 = ts_str.parse().unwrap_or(0);
        donation_dates.push(ts);

        if let Some(meta_str) = meta_json {
            if let Ok(meta) = serde_json::from_str::<serde_json::Value>(meta_str) {
                if let Some(amount) = meta.get("amount_cents").and_then(|v| v.as_i64()) {
                    donation_amounts.push(amount);
                }
            }
        }
    }

    let now_ts = now.timestamp();
    let last_donation_ts = *donation_dates.first().unwrap_or(&0);
    let days_since_last_donation = if last_donation_ts > 0 { (now_ts - last_donation_ts) / 86400 } else { 999 };
    let total_donations = donation_dates.len() as i64;
    let total_amount: i64 = donation_amounts.iter().sum();
    let max_single: i64 = *donation_amounts.iter().max().unwrap_or(&0);

    // Recency score (0-30)
    let recency_score = if days_since_last_donation <= 30 { 30 }
    else if days_since_last_donation <= 90 { 25 }
    else if days_since_last_donation <= 180 { 20 }
    else if days_since_last_donation <= 365 { 10 }
    else { 0 };

    // Frequency score (0-30)
    let freq_score = if total_donations >= 10 { 30 }
    else if total_donations >= 6 { 25 }
    else if total_donations >= 4 { 20 }
    else if total_donations >= 2 { 15 }
    else { 10 };

    // Monetary score (0-20)
    let monetary_score = if total_amount >= 500000 { 20 }
    else if total_amount >= 200000 { 17 }
    else if total_amount >= 100000 { 14 }
    else if total_amount >= 50000 { 10 }
    else if total_amount >= 10000 { 5 }
    else { 2 };

    // Email engagement (0-10)
    let email_opens: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM email_recipients WHERE person_id = ?1 AND opened_at IS NOT NULL"
    )
    .bind(person_uuid)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    let email_clicks: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM email_recipients WHERE person_id = ?1 AND clicked_at IS NOT NULL"
    )
    .bind(person_uuid)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    let email_score = if email_clicks > 0 { 10 }
    else if email_opens > 5 { 8 }
    else if email_opens > 0 { 5 }
    else { 0 };

    // Volunteer history (0-10)
    let volunteer_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM interactions WHERE person_id = ?1 AND interaction_type = 'volunteer_shift'"
    )
    .bind(person_uuid)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    let volunteer_score = if volunteer_count >= 5 { 10 }
    else if volunteer_count >= 2 { 7 }
    else if volunteer_count >= 1 { 4 }
    else { 0 };

    // Days since last contact
    let last_contact_ts: Option<i64> = sqlx::query_scalar::<_, String>(
        "SELECT MAX(strftime('%s', timestamp)) FROM interactions WHERE person_id = ?1"
    )
    .bind(person_uuid)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .and_then(|s| s.parse().ok());

    let days_since_contact = last_contact_ts.map(|ts| (now_ts - ts) / 86400).unwrap_or(999);

    let total_score = recency_score + freq_score + monetary_score + email_score + volunteer_score;
    let total_score = total_score.min(100);

    // Tier assignment
    let (tier, reason, suggested_ask) = if days_since_last_donation > 365 {
        let reason = format!(
            "Lapsed donor — last donated {} days ago. Previously gave ${:.2} total across {} donation(s).",
            days_since_last_donation, total_amount as f64 / 100.0, total_donations
        );
        ("lapsed".to_string(), reason, Some(5000))
    } else if max_single >= 100000 {
        let reason = format!(
            "Major donor — largest gift was ${:.2}. Total giving ${:.2}. Re-engage personally.",
            max_single as f64 / 100.0, total_amount as f64 / 100.0
        );
        ("major".to_string(), reason, Some(max_single as i32 * 2))
    } else if total_donations >= 3 && days_since_last_donation > 60 && days_since_last_donation <= 365 {
        let reason = format!(
            "Cooling — gave {} times but last donation was {} days ago. Reactivate with a check-in.",
            total_donations, days_since_last_donation
        );
        ("cooling".to_string(), reason, Some(total_amount as i32 / total_donations as i32))
    } else if days_since_last_donation <= 365 && total_donations >= 2 {
        let avg_gift = if total_donations > 0 { total_amount / total_donations } else { 0 };
        let ask = if avg_gift > 0 { (avg_gift as f64 * 1.25) as i32 } else { 5000 };
        let reason = format!(
            "Upgrade candidate — gave {} times, ${:.2} total, last gift {} days ago. High engagement.",
            total_donations, total_amount as f64 / 100.0, days_since_last_donation
        );
        ("upgrade".to_string(), reason, Some(ask))
    } else {
        let reason = format!(
            "One-time donor — gave ${:.2}, {} days ago. Follow up to convert to recurring.",
            total_amount as f64 / 100.0, days_since_last_donation
        );
        ("upgrade".to_string(), reason, Some(2500))
    };

    ProspectCalc {
        score: total_score,
        components: serde_json::json!({
            "rfm": recency_score + freq_score + monetary_score,
            "email_engagement": email_score,
            "volunteer": volunteer_score,
            "recency": days_since_last_donation.min(999),
        }),
        suggested_ask_cents: suggested_ask,
        reason,
        tier,
    }
}

async fn upsert_prospect_score(
    pool: &SqlitePool,
    person_id_str: &str,
    calc: &ProspectCalc,
    now: &DateTime<Utc>,
) {
    let components_str = serde_json::to_string(&calc.components).unwrap_or_default();
    sqlx::query(
        r#"INSERT INTO prospect_scores (person_id, score, score_components, suggested_ask_cents, reason, tier, last_calculated)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
           ON CONFLICT(person_id) DO UPDATE SET
               score = excluded.score,
               score_components = excluded.score_components,
               suggested_ask_cents = excluded.suggested_ask_cents,
               reason = excluded.reason,
               tier = excluded.tier,
               last_calculated = excluded.last_calculated"#
    )
    .bind(person_id_str)
    .bind(calc.score)
    .bind(&components_str)
    .bind(calc.suggested_ask_cents)
    .bind(&calc.reason)
    .bind(&calc.tier)
    .bind(now)
    .execute(pool)
    .await
    .map(|_| ())
    .unwrap_or_else(|e| eprintln!("upsert_prospect_score error for {}: {}", person_id_str, e));
}

async fn log_prospect_outcome(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
    Json(payload): Json<LogOutcomePayload>,
) -> Result<impl IntoResponse, StatusCode> {
    let valid_outcomes = ["reached", "voicemail", "no_answer", "call_back"];
    if !valid_outcomes.contains(&payload.outcome.as_str()) {
        return Err(StatusCode::BAD_REQUEST);
    }

    let person_exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM persons WHERE id = ?1 AND deleted_at IS NULL")
        .bind(id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if person_exists == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let mut metadata = serde_json::json!({
        "outcome": payload.outcome,
        "source": "prospect",
    });

    if let Some(pledged) = payload.pledged_cents {
        metadata["pledged_cents"] = serde_json::json!(pledged);
    }
    if let Some(notes) = &payload.notes {
        metadata["notes"] = serde_json::json!(notes);
    }

    let interaction_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO interactions (id, person_id, interaction_type, metadata, timestamp) VALUES (?1, ?2, 'canvass', ?3, ?4)"
    )
    .bind(interaction_id)
    .bind(id)
    .bind(&metadata)
    .bind(Utc::now())
    .execute(&pool)
    .await
    .map_err(|e| { eprintln!("log_prospect_outcome error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    if let Err(e) = crate::engagement::recalculate_engagement_tier(&pool, id).await {
        eprintln!("Failed to recalculate engagement tier: {}", e);
    }

    Ok((StatusCode::CREATED, Json(serde_json::json!({"id": interaction_id}))))
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

async fn get_stats_for_campaign(pool: &SqlitePool, campaign_id: &str) -> CampaignStats {
    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM email_recipients WHERE campaign_id = ?1")
        .bind(campaign_id)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    let sent: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM email_recipients WHERE campaign_id = ?1 AND status IN ('sent','opened','clicked')")
        .bind(campaign_id)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    let opened: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM email_recipients WHERE campaign_id = ?1 AND opened_at IS NOT NULL")
        .bind(campaign_id)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    let clicked: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM email_recipients WHERE campaign_id = ?1 AND clicked_at IS NOT NULL")
        .bind(campaign_id)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    let bounced: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM email_recipients WHERE campaign_id = ?1 AND status = 'bounced'")
        .bind(campaign_id)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    let pending: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM email_recipients WHERE campaign_id = ?1 AND status = 'pending'")
        .bind(campaign_id)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    CampaignStats {
        sent,
        opened,
        clicked,
        bounced,
        pending,
        open_rate: if sent > 0 { opened as f64 / sent as f64 } else { 0.0 },
        click_rate: if sent > 0 { clicked as f64 / sent as f64 } else { 0.0 },
        bounce_rate: if total > 0 { bounced as f64 / total as f64 } else { 0.0 },
    }
}

fn to_campaign_response(c: EmailCampaign, stats: CampaignStats) -> CampaignResponse {
    CampaignResponse {
        id: c.id,
        branch_id: c.branch_id,
        title: c.title,
        subject: c.subject,
        body_html: c.body_html,
        sender_name: c.sender_name,
        sender_email: c.sender_email,
        status: c.status,
        scheduled_at: c.scheduled_at.map(|d| d.to_rfc3339()),
        sent_at: c.sent_at.map(|d| d.to_rfc3339()),
        created_by: c.created_by,
        created_at: c.created_at.to_rfc3339(),
        updated_at: c.updated_at.to_rfc3339(),
        stats,
    }
}

fn to_recipient_response(r: EmailRecipient) -> RecipientResponse {
    RecipientResponse {
        id: r.id,
        campaign_id: r.campaign_id,
        person_id: r.person_id,
        email_address: r.email_address,
        status: r.status,
        sent_at: r.sent_at.map(|d| d.to_rfc3339()),
        opened_at: r.opened_at.map(|d| d.to_rfc3339()),
        clicked_at: r.clicked_at.map(|d| d.to_rfc3339()),
        bounce_reason: r.bounce_reason,
        created_at: r.created_at.to_rfc3339(),
    }
}

fn to_sms_response(m: SmsMessage) -> SmsResponse {
    SmsResponse {
        id: m.id,
        person_id: m.person_id,
        phone_number: m.phone_number,
        body: m.body,
        sender_name: m.sender_name,
        status: m.status,
        sent_at: m.sent_at.map(|d| d.to_rfc3339()),
        delivered_at: m.delivered_at.map(|d| d.to_rfc3339()),
        campaign_id: m.campaign_id,
        created_at: m.created_at.to_rfc3339(),
    }
}

fn to_prospect_response(p: ProspectScore) -> ProspectResponse {
    let components: Option<serde_json::Value> = p.score_components
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok());

    ProspectResponse {
        person_id: p.person_id,
        score: p.score,
        score_components: components,
        suggested_ask_cents: p.suggested_ask_cents,
        reason: p.reason,
        tier: p.tier,
        last_calculated: p.last_calculated.to_rfc3339(),
    }
}
