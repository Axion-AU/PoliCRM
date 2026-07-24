use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, patch, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

// ─── Database Row Models ────────────────────────────────────────

#[derive(Debug, sqlx::FromRow)]
pub struct DbMembershipTier {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub price_cents: i64,
    pub billing_period: String,
    pub benefits: Option<String>,
    pub branch_id: Option<Uuid>,
    pub is_active: bool,
    pub sort_order: i64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, sqlx::FromRow)]
pub struct DbMembership {
    pub id: Uuid,
    pub person_id: Uuid,
    pub party_id: Uuid,
    pub status: String,
    pub membership_type: Option<String>,
    pub join_date: Option<DateTime<Utc>>,
    pub renewal_date: Option<DateTime<Utc>>,
    pub resignation_date: Option<DateTime<Utc>>,
    pub tier_id: Option<Uuid>,
    pub auto_renew: bool,
    pub next_billing_date: Option<DateTime<Utc>>,
    pub payment_provider: Option<String>,
    pub payment_provider_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, sqlx::FromRow)]
pub struct DbDonation {
    pub id: Uuid,
    pub person_id: Uuid,
    pub amount_cents: i64,
    pub currency: String,
    pub donation_type: String,
    pub status: String,
    pub payment_provider: Option<String>,
    pub payment_provider_id: Option<String>,
    pub campaign: Option<String>,
    pub is_monthly: bool,
    pub recurring_interval: Option<String>,
    pub recurring_id: Option<String>,
    pub donated_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, sqlx::FromRow)]
pub struct DbEvent {
    pub id: Uuid,
    pub branch_id: Option<Uuid>,
    pub title: String,
    pub description: Option<String>,
    pub event_type: String,
    pub location: Option<String>,
    pub capacity: Option<i64>,
    pub ticket_price_cents: Option<i64>,
    pub start_at: DateTime<Utc>,
    pub end_at: Option<DateTime<Utc>>,
    pub status: String,
    pub created_by: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, sqlx::FromRow)]
pub struct DbEventRsvp {
    pub id: Uuid,
    pub event_id: Uuid,
    pub person_id: Uuid,
    pub status: String,
    pub ticket_count: i64,
    pub paid_cents: Option<i64>,
    pub checked_in_at: Option<DateTime<Utc>>,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
}

// ─── Aggregate query helper rows ─────────────────────────────────

#[derive(Debug, sqlx::FromRow)]
struct CampaignStatsRow {
    campaign: Option<String>,
    total_cents: i64,
    count: i64,
}

#[derive(Debug, sqlx::FromRow)]
struct EventAttendeeRow {
    id: Uuid,
    event_id: Uuid,
    person_id: Uuid,
    status: String,
    ticket_count: i64,
    paid_cents: Option<i64>,
    checked_in_at: Option<DateTime<Utc>>,
    notes: Option<String>,
    created_at: DateTime<Utc>,
}

// ─── Response Models ─────────────────────────────────────────────

#[derive(Serialize)]
pub struct MembershipTierResponse {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub price_cents: i64,
    pub billing_period: String,
    pub benefits: Option<Vec<String>>,
    pub branch_id: Option<String>,
    pub is_active: bool,
    pub sort_order: i64,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct MembershipResponse {
    pub id: String,
    pub person_id: String,
    pub party_id: String,
    pub status: String,
    pub membership_type: Option<String>,
    pub join_date: Option<String>,
    pub renewal_date: Option<String>,
    pub resignation_date: Option<String>,
    pub tier_id: Option<String>,
    pub tier_name: Option<String>,
    pub auto_renew: bool,
    pub next_billing_date: Option<String>,
    pub payment_provider: Option<String>,
    pub payment_provider_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Serialize)]
pub struct DonationResponse {
    pub id: String,
    pub person_id: String,
    pub amount_cents: i64,
    pub currency: String,
    pub donation_type: String,
    pub status: String,
    pub payment_provider: Option<String>,
    pub payment_provider_id: Option<String>,
    pub campaign: Option<String>,
    pub is_monthly: bool,
    pub recurring_interval: Option<String>,
    pub recurring_id: Option<String>,
    pub donated_at: String,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct EventResponse {
    pub id: String,
    pub branch_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub event_type: String,
    pub location: Option<String>,
    pub capacity: Option<i64>,
    pub ticket_price_cents: Option<i64>,
    pub start_at: String,
    pub end_at: Option<String>,
    pub status: String,
    pub created_by: Option<String>,
    pub attendee_count: i64,
    pub revenue_cents: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct RsvpResponse {
    pub id: String,
    pub event_id: String,
    pub person_id: String,
    pub status: String,
    pub ticket_count: i64,
    pub paid_cents: Option<i64>,
    pub checked_in_at: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct DonationStatsResponse {
    pub total_7d: i64,
    pub total_30d: i64,
    pub total_all: i64,
    pub avg_gift: i64,
    pub monthly_recurring: i64,
    pub by_campaign: Vec<CampaignStatItem>,
}

#[derive(Serialize)]
pub struct CampaignStatItem {
    pub campaign: Option<String>,
    pub total_cents: i64,
    pub count: i64,
}

#[derive(Serialize)]
pub struct PersonDonationsResponse {
    pub donations: Vec<DonationResponse>,
    pub total_given: i64,
    pub avg_gift: i64,
}

// ─── Request Payloads ────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateMembershipTierPayload {
    pub name: String,
    pub description: Option<String>,
    pub price_cents: i64,
    pub billing_period: Option<String>,
    pub benefits: Option<Vec<String>>,
    pub branch_id: Option<Uuid>,
    pub sort_order: Option<i64>,
}

#[derive(Deserialize)]
pub struct UpdateMembershipTierPayload {
    pub name: Option<String>,
    pub description: Option<Option<String>>,
    pub price_cents: Option<i64>,
    pub billing_period: Option<String>,
    pub benefits: Option<Option<Vec<String>>>,
    pub branch_id: Option<Option<Uuid>>,
    pub sort_order: Option<i64>,
}

#[derive(Deserialize)]
pub struct CreateMembershipPayload {
    pub person_id: Uuid,
    pub party_id: Uuid,
    pub status: Option<String>,
    pub membership_type: Option<String>,
    pub tier_id: Option<Uuid>,
    pub join_date: Option<String>,
    pub renewal_date: Option<String>,
    pub auto_renew: Option<bool>,
    pub payment_provider: Option<String>,
    pub payment_provider_id: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateMembershipPayload {
    pub status: Option<String>,
    pub membership_type: Option<Option<String>>,
    pub tier_id: Option<Option<Uuid>>,
    pub auto_renew: Option<bool>,
    pub next_billing_date: Option<Option<String>>,
    pub payment_provider: Option<Option<String>>,
    pub payment_provider_id: Option<Option<String>>,
    pub join_date: Option<Option<String>>,
    pub renewal_date: Option<Option<String>>,
    pub resignation_date: Option<Option<String>>,
}

#[derive(Deserialize)]
pub struct CreateDonationPayload {
    pub person_id: Uuid,
    pub amount_cents: i64,
    pub currency: Option<String>,
    pub donation_type: Option<String>,
    pub status: Option<String>,
    pub payment_provider: Option<String>,
    pub payment_provider_id: Option<String>,
    pub campaign: Option<String>,
    pub is_monthly: Option<bool>,
    pub recurring_interval: Option<String>,
    pub recurring_id: Option<String>,
    pub donated_at: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateEventPayload {
    pub branch_id: Option<Uuid>,
    pub title: String,
    pub description: Option<String>,
    pub event_type: Option<String>,
    pub location: Option<String>,
    pub capacity: Option<i64>,
    pub ticket_price_cents: Option<i64>,
    pub start_at: String,
    pub end_at: Option<String>,
    pub created_by: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct UpdateEventPayload {
    pub title: Option<String>,
    pub description: Option<Option<String>>,
    pub event_type: Option<String>,
    pub location: Option<Option<String>>,
    pub capacity: Option<Option<i64>>,
    pub ticket_price_cents: Option<Option<i64>>,
    pub start_at: Option<String>,
    pub end_at: Option<Option<String>>,
}

#[derive(Deserialize)]
pub struct CreateRsvpPayload {
    pub person_id: Uuid,
    pub status: Option<String>,
    pub ticket_count: Option<i64>,
    pub paid_cents: Option<i64>,
    pub notes: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateRsvpPayload {
    pub status: Option<String>,
    pub ticket_count: Option<i64>,
    pub paid_cents: Option<i64>,
    pub notes: Option<Option<String>>,
}

#[derive(Deserialize)]
pub struct CheckInPayload {
    pub person_id: Uuid,
}

// ─── Query params ────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ListMembershipsQuery {
    pub status: Option<String>,
    pub branch_id: Option<Uuid>,
    pub person_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct ListDonationsQuery {
    pub person_id: Option<Uuid>,
    pub campaign: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
}

#[derive(Deserialize)]
pub struct ListEventsQuery {
    pub status: Option<String>,
    pub branch_id: Option<Uuid>,
    pub upcoming: Option<bool>,
}

// ─── Helpers ─────────────────────────────────────────────────────

fn tier_to_response(t: DbMembershipTier) -> MembershipTierResponse {
    let benefits = t.benefits.as_deref().and_then(|b| serde_json::from_str::<Vec<String>>(b).ok());
    MembershipTierResponse {
        id: t.id.to_string(),
        name: t.name,
        description: t.description,
        price_cents: t.price_cents,
        billing_period: t.billing_period,
        benefits,
        branch_id: t.branch_id.map(|b| b.to_string()),
        is_active: t.is_active,
        sort_order: t.sort_order,
        created_at: t.created_at.to_rfc3339(),
    }
}

fn membership_to_response(m: DbMembership, tier_name: Option<String>) -> MembershipResponse {
    MembershipResponse {
        id: m.id.to_string(),
        person_id: m.person_id.to_string(),
        party_id: m.party_id.to_string(),
        status: m.status,
        membership_type: m.membership_type,
        join_date: m.join_date.map(|d| d.to_rfc3339()),
        renewal_date: m.renewal_date.map(|d| d.to_rfc3339()),
        resignation_date: m.resignation_date.map(|d| d.to_rfc3339()),
        tier_id: m.tier_id.map(|t| t.to_string()),
        tier_name,
        auto_renew: m.auto_renew,
        next_billing_date: m.next_billing_date.map(|d| d.to_rfc3339()),
        payment_provider: m.payment_provider,
        payment_provider_id: m.payment_provider_id,
        created_at: m.created_at.to_rfc3339(),
        updated_at: m.updated_at.to_rfc3339(),
        deleted_at: m.deleted_at.map(|d| d.to_rfc3339()),
    }
}

fn donation_to_response(d: DbDonation) -> DonationResponse {
    DonationResponse {
        id: d.id.to_string(),
        person_id: d.person_id.to_string(),
        amount_cents: d.amount_cents,
        currency: d.currency,
        donation_type: d.donation_type,
        status: d.status,
        payment_provider: d.payment_provider,
        payment_provider_id: d.payment_provider_id,
        campaign: d.campaign,
        is_monthly: d.is_monthly,
        recurring_interval: d.recurring_interval,
        recurring_id: d.recurring_id,
        donated_at: d.donated_at.to_rfc3339(),
        created_at: d.created_at.to_rfc3339(),
    }
}

fn event_to_response(e: DbEvent, attendee_count: i64, revenue_cents: i64) -> EventResponse {
    EventResponse {
        id: e.id.to_string(),
        branch_id: e.branch_id.map(|b| b.to_string()),
        title: e.title,
        description: e.description,
        event_type: e.event_type,
        location: e.location,
        capacity: e.capacity,
        ticket_price_cents: e.ticket_price_cents,
        start_at: e.start_at.to_rfc3339(),
        end_at: e.end_at.map(|d| d.to_rfc3339()),
        status: e.status,
        created_by: e.created_by.map(|u| u.to_string()),
        attendee_count,
        revenue_cents,
        created_at: e.created_at.to_rfc3339(),
        updated_at: e.updated_at.to_rfc3339(),
    }
}

fn rsvp_to_response(r: DbEventRsvp) -> RsvpResponse {
    RsvpResponse {
        id: r.id.to_string(),
        event_id: r.event_id.to_string(),
        person_id: r.person_id.to_string(),
        status: r.status,
        ticket_count: r.ticket_count,
        paid_cents: r.paid_cents,
        checked_in_at: r.checked_in_at.map(|d| d.to_rfc3339()),
        notes: r.notes,
        created_at: r.created_at.to_rfc3339(),
    }
}

fn parse_rfc3339(s: &str) -> Result<DateTime<Utc>, StatusCode> {
    chrono::DateTime::parse_from_rfc3339(s)
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .map_err(|_| StatusCode::BAD_REQUEST)
}

// ─── Router ──────────────────────────────────────────────────────

pub fn router() -> Router<SqlitePool> {
    Router::new()
        // Membership Tiers
        .route("/membership-tiers", get(list_membership_tiers).post(create_membership_tier))
        .route("/membership-tiers/{id}", get(get_membership_tier).patch(update_membership_tier).delete(delete_membership_tier))
        // Memberships
        .route("/memberships", get(list_memberships).post(create_membership))
        .route("/memberships/{id}", get(get_membership).patch(update_membership).delete(delete_membership))
        .route("/memberships/{id}/renew", post(renew_membership))
        .route("/persons/{id}/memberships", get(list_person_memberships))
        // Donations
        .route("/donations", get(list_donations).post(create_donation))
        .route("/donations/{id}", get(get_donation))
        .route("/donations/stats", get(get_donation_stats))
        .route("/persons/{id}/donations", get(list_person_donations))
        // Events
        .route("/events", get(list_events).post(create_event))
        .route("/events/{id}", get(get_event).patch(update_event))
        .route("/events/{id}/publish", post(publish_event))
        .route("/events/{id}/cancel", post(cancel_event))
        .route("/events/{id}/rsvp", post(create_rsvp))
        .route("/events/{id}/rsvps/{rsvp_id}", patch(update_rsvp))
        .route("/events/{id}/check-in", post(check_in_attendee))
        .route("/events/{id}/attendees", get(list_attendees))
}

// ═══════════════════════════════════════════════════════════════════
// MEMBERSHIP TIERS
// ═══════════════════════════════════════════════════════════════════

async fn list_membership_tiers(
    State(pool): State<SqlitePool>,
) -> Result<Json<Vec<MembershipTierResponse>>, StatusCode> {
    let tiers = sqlx::query_as::<_, DbMembershipTier>(
        "SELECT * FROM membership_tiers WHERE is_active = 1 ORDER BY sort_order ASC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| { eprintln!("DB error listing tiers: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    Ok(Json(tiers.into_iter().map(tier_to_response).collect()))
}

async fn get_membership_tier(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
) -> Result<Json<MembershipTierResponse>, StatusCode> {
    let tier = sqlx::query_as::<_, DbMembershipTier>(
        "SELECT * FROM membership_tiers WHERE id = ?1"
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| { eprintln!("DB error getting tier: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    match tier {
        Some(t) => Ok(Json(tier_to_response(t))),
        None => Err(StatusCode::NOT_FOUND),
    }
}

async fn create_membership_tier(
    State(pool): State<SqlitePool>,
    Json(payload): Json<CreateMembershipTierPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    let id = Uuid::new_v4();
    let benefits = payload.benefits.map(|b| serde_json::to_string(&b).unwrap_or_default());

    sqlx::query(
        "INSERT INTO membership_tiers (id, name, description, price_cents, billing_period, benefits, branch_id, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
    )
    .bind(id)
    .bind(&payload.name)
    .bind(&payload.description)
    .bind(payload.price_cents)
    .bind(payload.billing_period.as_deref().unwrap_or("yearly"))
    .bind(&benefits)
    .bind(payload.branch_id)
    .bind(payload.sort_order.unwrap_or(0))
    .execute(&pool)
    .await
    .map_err(|e| { eprintln!("DB error creating tier: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({"id": id}))))
}

async fn update_membership_tier(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateMembershipTierPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM membership_tiers WHERE id = ?1")
        .bind(id)
        .fetch_one(&pool)
        .await
        .map_err(|e| { eprintln!("DB error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    if exists == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let mut qb = sqlx::QueryBuilder::new("UPDATE membership_tiers SET ");
    let mut sep = qb.separated(", ");

    if let Some(ref name) = payload.name {
        sep.push("name = "); sep.push_bind_unseparated(name);
    }
    if let Some(ref desc) = payload.description {
        sep.push("description = "); sep.push_bind_unseparated(desc);
    }
    if let Some(ref price) = payload.price_cents {
        sep.push("price_cents = "); sep.push_bind_unseparated(price);
    }
    if let Some(ref period) = payload.billing_period {
        sep.push("billing_period = "); sep.push_bind_unseparated(period);
    }
    if let Some(ref benefits_opt) = payload.benefits {
        let json = benefits_opt.as_ref().map(|b| serde_json::to_string(b).unwrap_or_default());
        sep.push("benefits = "); sep.push_bind_unseparated(json);
    }
    if let Some(ref branch) = payload.branch_id {
        sep.push("branch_id = "); sep.push_bind_unseparated(branch);
    }
    if let Some(ref sort) = payload.sort_order {
        sep.push("sort_order = "); sep.push_bind_unseparated(sort);
    }

    qb.push(" WHERE id = "); qb.push_bind(id);

    qb.build().execute(&pool).await
        .map_err(|e| { eprintln!("DB error updating tier: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    Ok(StatusCode::OK)
}

async fn delete_membership_tier(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, StatusCode> {
    let result = sqlx::query("UPDATE membership_tiers SET is_active = 0 WHERE id = ?1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| { eprintln!("DB error deactivating tier: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    if result.rows_affected() == 0 {
        Err(StatusCode::NOT_FOUND)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}

// ═══════════════════════════════════════════════════════════════════
// MEMBERSHIPS
// ═══════════════════════════════════════════════════════════════════

async fn list_memberships(
    State(pool): State<SqlitePool>,
    Query(query): Query<ListMembershipsQuery>,
) -> Result<Json<Vec<MembershipResponse>>, StatusCode> {
    let mut sql = String::from("SELECT m.*, t.name as tier_name FROM memberships m LEFT JOIN membership_tiers t ON m.tier_id = t.id WHERE m.deleted_at IS NULL");
    let mut bindings: Vec<Box<dyn sqlx::Encode<'_, sqlx::Sqlite> + Send>> = Vec::new();

    if let Some(ref status) = query.status {
        sql.push_str(" AND m.status = ?");
        bindings.push(Box::new(status.clone()));
    }
    if let Some(ref bid) = query.branch_id {
        sql.push_str(" AND m.party_id = ?");
        bindings.push(Box::new(*bid));
    }
    if let Some(ref pid) = query.person_id {
        sql.push_str(" AND m.person_id = ?");
        bindings.push(Box::new(*pid));
    }
    sql.push_str(" ORDER BY m.created_at DESC");

    // Since QueryBuilder with dynamic bindings across types is tricky in SQLx,
    // use the static query approach with optional chaining.
    // We build the query with positional params manually.
    let mut qb = sqlx::QueryBuilder::new(
        "SELECT m.*, t.name FROM memberships m LEFT JOIN membership_tiers t ON m.tier_id = t.id WHERE m.deleted_at IS NULL"
    );

    if let Some(ref status) = query.status {
        qb.push(" AND m.status = "); qb.push_bind(status);
    }
    if let Some(ref bid) = query.branch_id {
        qb.push(" AND m.party_id = "); qb.push_bind(bid);
    }
    if let Some(ref pid) = query.person_id {
        qb.push(" AND m.person_id = "); qb.push_bind(pid);
    }
    qb.push(" ORDER BY m.created_at DESC");

    #[derive(Debug, sqlx::FromRow)]
    struct MembershipWithTier {
        id: Uuid, person_id: Uuid, party_id: Uuid, status: String,
        membership_type: Option<String>,
        join_date: Option<DateTime<Utc>>, renewal_date: Option<DateTime<Utc>>,
        resignation_date: Option<DateTime<Utc>>,
        tier_id: Option<Uuid>, auto_renew: bool,
        next_billing_date: Option<DateTime<Utc>>,
        payment_provider: Option<String>, payment_provider_id: Option<String>,
        created_at: DateTime<Utc>, updated_at: DateTime<Utc>,
        deleted_at: Option<DateTime<Utc>>,
        name: Option<String>,
    }

    let rows = qb.build_query_as::<MembershipWithTier>()
        .fetch_all(&pool)
        .await
        .map_err(|e| { eprintln!("DB error listing memberships: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let responses = rows.into_iter().map(|r| {
        let m = DbMembership {
            id: r.id, person_id: r.person_id, party_id: r.party_id,
            status: r.status, membership_type: r.membership_type,
            join_date: r.join_date, renewal_date: r.renewal_date,
            resignation_date: r.resignation_date,
            tier_id: r.tier_id, auto_renew: r.auto_renew,
            next_billing_date: r.next_billing_date,
            payment_provider: r.payment_provider, payment_provider_id: r.payment_provider_id,
            created_at: r.created_at, updated_at: r.updated_at, deleted_at: r.deleted_at,
        };
        membership_to_response(m, r.name)
    }).collect();

    Ok(Json(responses))
}

async fn get_membership(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
) -> Result<Json<MembershipResponse>, StatusCode> {
    #[derive(Debug, sqlx::FromRow)]
    struct MembershipWithTier {
        id: Uuid, person_id: Uuid, party_id: Uuid, status: String,
        membership_type: Option<String>,
        join_date: Option<DateTime<Utc>>, renewal_date: Option<DateTime<Utc>>,
        resignation_date: Option<DateTime<Utc>>,
        tier_id: Option<Uuid>, auto_renew: bool,
        next_billing_date: Option<DateTime<Utc>>,
        payment_provider: Option<String>, payment_provider_id: Option<String>,
        created_at: DateTime<Utc>, updated_at: DateTime<Utc>,
        deleted_at: Option<DateTime<Utc>>,
        name: Option<String>,
    }

    let row = sqlx::query_as::<_, MembershipWithTier>(
        "SELECT m.*, t.name FROM memberships m LEFT JOIN membership_tiers t ON m.tier_id = t.id WHERE m.id = ?1 AND m.deleted_at IS NULL"
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| { eprintln!("DB error getting membership: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    match row {
        Some(r) => {
            let m = DbMembership {
                id: r.id, person_id: r.person_id, party_id: r.party_id,
                status: r.status, membership_type: r.membership_type,
                join_date: r.join_date, renewal_date: r.renewal_date,
                resignation_date: r.resignation_date,
                tier_id: r.tier_id, auto_renew: r.auto_renew,
                next_billing_date: r.next_billing_date,
                payment_provider: r.payment_provider, payment_provider_id: r.payment_provider_id,
                created_at: r.created_at, updated_at: r.updated_at, deleted_at: r.deleted_at,
            };
            Ok(Json(membership_to_response(m, r.name)))
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}

async fn create_membership(
    State(pool): State<SqlitePool>,
    Json(payload): Json<CreateMembershipPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    let id = Uuid::new_v4();
    let join_date = payload.join_date.as_ref().map(|s| parse_rfc3339(s)).transpose()?;
    let renewal_date = payload.renewal_date.as_ref().map(|s| parse_rfc3339(s)).transpose()?;

    sqlx::query(
        "INSERT INTO memberships (id, person_id, party_id, status, membership_type, tier_id, join_date, renewal_date, auto_renew, payment_provider, payment_provider_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)"
    )
    .bind(id)
    .bind(payload.person_id)
    .bind(payload.party_id)
    .bind(payload.status.as_deref().unwrap_or("active"))
    .bind(&payload.membership_type)
    .bind(payload.tier_id)
    .bind(join_date)
    .bind(renewal_date)
    .bind(payload.auto_renew.unwrap_or(false))
    .bind(&payload.payment_provider)
    .bind(&payload.payment_provider_id)
    .execute(&pool)
    .await
    .map_err(|e| { eprintln!("DB error creating membership: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({"id": id}))))
}

async fn update_membership(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateMembershipPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM memberships WHERE id = ?1 AND deleted_at IS NULL")
        .bind(id)
        .fetch_one(&pool)
        .await
        .map_err(|e| { eprintln!("DB error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    if exists == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let mut qb = sqlx::QueryBuilder::new("UPDATE memberships SET ");
    let mut sep = qb.separated(", ");

    if let Some(ref status) = payload.status {
        sep.push("status = "); sep.push_bind_unseparated(status);
    }
    if let Some(ref mtype) = payload.membership_type {
        sep.push("membership_type = "); sep.push_bind_unseparated(mtype);
    }
    if let Some(ref tier) = payload.tier_id {
        sep.push("tier_id = "); sep.push_bind_unseparated(tier);
    }
    if let Some(ref renew) = payload.auto_renew {
        sep.push("auto_renew = "); sep.push_bind_unseparated(renew);
    }
    if let Some(ref nbd) = payload.next_billing_date {
        let parsed = nbd.as_ref().map(|s| parse_rfc3339(s)).transpose()?;
        sep.push("next_billing_date = "); sep.push_bind_unseparated(parsed);
    }
    if let Some(ref pp) = payload.payment_provider {
        sep.push("payment_provider = "); sep.push_bind_unseparated(pp);
    }
    if let Some(ref ppi) = payload.payment_provider_id {
        sep.push("payment_provider_id = "); sep.push_bind_unseparated(ppi);
    }
    if let Some(ref jd) = payload.join_date {
        let parsed = jd.as_ref().map(|s| parse_rfc3339(s)).transpose()?;
        sep.push("join_date = "); sep.push_bind_unseparated(parsed);
    }
    if let Some(ref rd) = payload.renewal_date {
        let parsed = rd.as_ref().map(|s| parse_rfc3339(s)).transpose()?;
        sep.push("renewal_date = "); sep.push_bind_unseparated(parsed);
    }
    if let Some(ref rrd) = payload.resignation_date {
        let parsed = rrd.as_ref().map(|s| parse_rfc3339(s)).transpose()?;
        sep.push("resignation_date = "); sep.push_bind_unseparated(parsed);
    }

    sep.push("updated_at = "); sep.push_bind_unseparated(Utc::now());
    qb.push(" WHERE id = "); qb.push_bind(id);
    qb.push(" AND deleted_at IS NULL");

    qb.build().execute(&pool).await
        .map_err(|e| { eprintln!("DB error updating membership: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    Ok(StatusCode::OK)
}

async fn renew_membership(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, StatusCode> {
    let result = sqlx::query(
        "UPDATE memberships SET renewal_date = COALESCE(renewal_date, ?1) + INTERVAL '1 year', updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL"
    )
    .bind(Utc::now())
    .bind(Utc::now())
    .bind(id)
    .execute(&pool)
    .await;

    // SQLite doesn't support INTERVAL, so use a different approach
    let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM memberships WHERE id = ?1 AND deleted_at IS NULL")
        .bind(id)
        .fetch_one(&pool)
        .await
        .map_err(|e| { eprintln!("DB error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    if exists == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    // Get current renewal_date, add 1 year
    let current: Option<DateTime<Utc>> = sqlx::query_scalar("SELECT renewal_date FROM memberships WHERE id = ?1")
        .bind(id)
        .fetch_one(&pool)
        .await
        .map_err(|e| { eprintln!("DB error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let new_date = match current {
        Some(d) => d + chrono::Duration::days(365),
        None => Utc::now() + chrono::Duration::days(365),
    };

    sqlx::query("UPDATE memberships SET renewal_date = ?1, updated_at = ?2 WHERE id = ?3")
        .bind(new_date)
        .bind(Utc::now())
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| { eprintln!("DB error renewing membership: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    Ok(Json(serde_json::json!({"renewal_date": new_date.to_rfc3339()})))
}

async fn delete_membership(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, StatusCode> {
    let result = sqlx::query("UPDATE memberships SET deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL")
        .bind(Utc::now())
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| { eprintln!("DB error soft-deleting membership: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    if result.rows_affected() == 0 {
        Err(StatusCode::NOT_FOUND)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}

async fn list_person_memberships(
    State(pool): State<SqlitePool>,
    Path(person_id): Path<Uuid>,
) -> Result<Json<Vec<MembershipResponse>>, StatusCode> {
    #[derive(Debug, sqlx::FromRow)]
    struct MembershipWithTier {
        id: Uuid, person_id: Uuid, party_id: Uuid, status: String,
        membership_type: Option<String>,
        join_date: Option<DateTime<Utc>>, renewal_date: Option<DateTime<Utc>>,
        resignation_date: Option<DateTime<Utc>>,
        tier_id: Option<Uuid>, auto_renew: bool,
        next_billing_date: Option<DateTime<Utc>>,
        payment_provider: Option<String>, payment_provider_id: Option<String>,
        created_at: DateTime<Utc>, updated_at: DateTime<Utc>,
        deleted_at: Option<DateTime<Utc>>,
        name: Option<String>,
    }

    let rows = sqlx::query_as::<_, MembershipWithTier>(
        "SELECT m.*, t.name FROM memberships m LEFT JOIN membership_tiers t ON m.tier_id = t.id WHERE m.person_id = ?1 AND m.deleted_at IS NULL ORDER BY m.created_at DESC"
    )
    .bind(person_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| { eprintln!("DB error listing person memberships: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let responses = rows.into_iter().map(|r| {
        let m = DbMembership {
            id: r.id, person_id: r.person_id, party_id: r.party_id,
            status: r.status, membership_type: r.membership_type,
            join_date: r.join_date, renewal_date: r.renewal_date,
            resignation_date: r.resignation_date,
            tier_id: r.tier_id, auto_renew: r.auto_renew,
            next_billing_date: r.next_billing_date,
            payment_provider: r.payment_provider, payment_provider_id: r.payment_provider_id,
            created_at: r.created_at, updated_at: r.updated_at, deleted_at: r.deleted_at,
        };
        membership_to_response(m, r.name)
    }).collect();

    Ok(Json(responses))
}

// ═══════════════════════════════════════════════════════════════════
// DONATIONS
// ═══════════════════════════════════════════════════════════════════

async fn list_donations(
    State(pool): State<SqlitePool>,
    Query(query): Query<ListDonationsQuery>,
) -> Result<Json<Vec<DonationResponse>>, StatusCode> {
    let mut qb = sqlx::QueryBuilder::new("SELECT * FROM donations WHERE 1=1");

    if let Some(ref pid) = query.person_id {
        qb.push(" AND person_id = "); qb.push_bind(pid);
    }
    if let Some(ref campaign) = query.campaign {
        qb.push(" AND campaign = "); qb.push_bind(campaign);
    }
    if let Some(ref from) = query.date_from {
        if let Ok(dt) = parse_rfc3339(from) {
            qb.push(" AND donated_at >= "); qb.push_bind(dt);
        }
    }
    if let Some(ref to) = query.date_to {
        if let Ok(dt) = parse_rfc3339(to) {
            qb.push(" AND donated_at <= "); qb.push_bind(dt);
        }
    }
    qb.push(" ORDER BY donated_at DESC");

    let donations = qb.build_query_as::<DbDonation>()
        .fetch_all(&pool)
        .await
        .map_err(|e| { eprintln!("DB error listing donations: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    Ok(Json(donations.into_iter().map(donation_to_response).collect()))
}

async fn get_donation(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
) -> Result<Json<DonationResponse>, StatusCode> {
    let donation = sqlx::query_as::<_, DbDonation>("SELECT * FROM donations WHERE id = ?1")
        .bind(id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| { eprintln!("DB error getting donation: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    match donation {
        Some(d) => Ok(Json(donation_to_response(d))),
        None => Err(StatusCode::NOT_FOUND),
    }
}

async fn create_donation(
    State(pool): State<SqlitePool>,
    Json(payload): Json<CreateDonationPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    let id = Uuid::new_v4();
    let donated_at = payload.donated_at.as_ref().map(|s| parse_rfc3339(s)).transpose()?.unwrap_or(Utc::now());

    sqlx::query(
        "INSERT INTO donations (id, person_id, amount_cents, currency, donation_type, status, payment_provider, payment_provider_id, campaign, is_monthly, recurring_interval, recurring_id, donated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)"
    )
    .bind(id)
    .bind(payload.person_id)
    .bind(payload.amount_cents)
    .bind(payload.currency.as_deref().unwrap_or("AUD"))
    .bind(payload.donation_type.as_deref().unwrap_or("one_off"))
    .bind(payload.status.as_deref().unwrap_or("completed"))
    .bind(&payload.payment_provider)
    .bind(&payload.payment_provider_id)
    .bind(&payload.campaign)
    .bind(payload.is_monthly.unwrap_or(false))
    .bind(&payload.recurring_interval)
    .bind(&payload.recurring_id)
    .bind(donated_at)
    .execute(&pool)
    .await
    .map_err(|e| { eprintln!("DB error creating donation: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({"id": id}))))
}

async fn get_donation_stats(
    State(pool): State<SqlitePool>,
) -> Result<Json<DonationStatsResponse>, StatusCode> {
    let now = Utc::now();
    let seven_days_ago = now - chrono::Duration::days(7);
    let thirty_days_ago = now - chrono::Duration::days(30);

    let total_7d: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount_cents), 0) FROM donations WHERE status = 'completed' AND donated_at >= ?1"
    )
    .bind(seven_days_ago)
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    let total_30d: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount_cents), 0) FROM donations WHERE status = 'completed' AND donated_at >= ?1"
    )
    .bind(thirty_days_ago)
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    let total_all: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount_cents), 0) FROM donations WHERE status = 'completed'"
    )
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    let avg_gift: i64 = sqlx::query_scalar(
        "SELECT COALESCE(ROUND(AVG(amount_cents)), 0) FROM donations WHERE status = 'completed'"
    )
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    let monthly_recurring: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount_cents), 0) FROM donations WHERE is_monthly = 1 AND status = 'completed'"
    )
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    let campaign_rows = sqlx::query_as::<_, CampaignStatsRow>(
        "SELECT campaign, COALESCE(SUM(amount_cents), 0) as total_cents, COUNT(*) as count FROM donations WHERE status = 'completed' GROUP BY campaign ORDER BY total_cents DESC"
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let by_campaign = campaign_rows.into_iter().map(|r| CampaignStatItem {
        campaign: r.campaign,
        total_cents: r.total_cents,
        count: r.count,
    }).collect();

    Ok(Json(DonationStatsResponse {
        total_7d,
        total_30d,
        total_all,
        avg_gift,
        monthly_recurring,
        by_campaign,
    }))
}

async fn list_person_donations(
    State(pool): State<SqlitePool>,
    Path(person_id): Path<Uuid>,
) -> Result<Json<PersonDonationsResponse>, StatusCode> {
    let donations = sqlx::query_as::<_, DbDonation>(
        "SELECT * FROM donations WHERE person_id = ?1 ORDER BY donated_at DESC"
    )
    .bind(person_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| { eprintln!("DB error listing person donations: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let total_given: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount_cents), 0) FROM donations WHERE person_id = ?1 AND status = 'completed'"
    )
    .bind(person_id)
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    let count = donations.len() as i64;
    let avg_gift = if count > 0 { total_given / count } else { 0 };

    Ok(Json(PersonDonationsResponse {
        donations: donations.into_iter().map(donation_to_response).collect(),
        total_given,
        avg_gift,
    }))
}

// ═══════════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════════

async fn list_events(
    State(pool): State<SqlitePool>,
    Query(query): Query<ListEventsQuery>,
) -> Result<Json<Vec<EventResponse>>, StatusCode> {
    let mut qb = sqlx::QueryBuilder::new(
        "SELECT e.*, (SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id AND status IN ('registered', 'attended')) as attendee_count, (SELECT COALESCE(SUM(paid_cents), 0) FROM event_rsvps WHERE event_id = e.id) as revenue_cents FROM events e WHERE 1=1"
    );

    if let Some(ref status) = query.status {
        qb.push(" AND e.status = "); qb.push_bind(status);
    }
    if let Some(ref bid) = query.branch_id {
        qb.push(" AND e.branch_id = "); qb.push_bind(bid);
    }
    if let Some(true) = query.upcoming {
        qb.push(" AND e.start_at >= "); qb.push_bind(Utc::now());
    }
    qb.push(" ORDER BY e.start_at DESC");

    #[derive(Debug, sqlx::FromRow)]
    struct EventWithCounts {
        id: Uuid, branch_id: Option<Uuid>,
        title: String, description: Option<String>,
        event_type: String, location: Option<String>,
        capacity: Option<i64>, ticket_price_cents: Option<i64>,
        start_at: DateTime<Utc>, end_at: Option<DateTime<Utc>>,
        status: String, created_by: Option<Uuid>,
        created_at: DateTime<Utc>, updated_at: DateTime<Utc>,
        attendee_count: i64, revenue_cents: i64,
    }

    let rows = qb.build_query_as::<EventWithCounts>()
        .fetch_all(&pool)
        .await
        .map_err(|e| { eprintln!("DB error listing events: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let responses = rows.into_iter().map(|r| {
        let e = DbEvent {
            id: r.id, branch_id: r.branch_id, title: r.title,
            description: r.description, event_type: r.event_type,
            location: r.location, capacity: r.capacity,
            ticket_price_cents: r.ticket_price_cents,
            start_at: r.start_at, end_at: r.end_at, status: r.status,
            created_by: r.created_by,
            created_at: r.created_at, updated_at: r.updated_at,
        };
        event_to_response(e, r.attendee_count, r.revenue_cents)
    }).collect();

    Ok(Json(responses))
}

async fn get_event(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
) -> Result<Json<EventResponse>, StatusCode> {
    #[derive(Debug, sqlx::FromRow)]
    struct EventWithCounts {
        id: Uuid, branch_id: Option<Uuid>,
        title: String, description: Option<String>,
        event_type: String, location: Option<String>,
        capacity: Option<i64>, ticket_price_cents: Option<i64>,
        start_at: DateTime<Utc>, end_at: Option<DateTime<Utc>>,
        status: String, created_by: Option<Uuid>,
        created_at: DateTime<Utc>, updated_at: DateTime<Utc>,
        attendee_count: i64, revenue_cents: i64,
    }

    let row = sqlx::query_as::<_, EventWithCounts>(
        "SELECT e.*, (SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id AND status IN ('registered', 'attended')) as attendee_count, (SELECT COALESCE(SUM(paid_cents), 0) FROM event_rsvps WHERE event_id = e.id) as revenue_cents FROM events e WHERE e.id = ?1"
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| { eprintln!("DB error getting event: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    match row {
        Some(r) => {
            let e = DbEvent {
                id: r.id, branch_id: r.branch_id, title: r.title,
                description: r.description, event_type: r.event_type,
                location: r.location, capacity: r.capacity,
                ticket_price_cents: r.ticket_price_cents,
                start_at: r.start_at, end_at: r.end_at, status: r.status,
                created_by: r.created_by,
                created_at: r.created_at, updated_at: r.updated_at,
            };
            Ok(Json(event_to_response(e, r.attendee_count, r.revenue_cents)))
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}

async fn create_event(
    State(pool): State<SqlitePool>,
    Json(payload): Json<CreateEventPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    let id = Uuid::new_v4();
    let start_at = parse_rfc3339(&payload.start_at)?;
    let end_at = payload.end_at.as_ref().map(|s| parse_rfc3339(s)).transpose()?;
    let now = Utc::now();

    sqlx::query(
        "INSERT INTO events (id, branch_id, title, description, event_type, location, capacity, ticket_price_cents, start_at, end_at, created_by, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)"
    )
    .bind(id)
    .bind(payload.branch_id)
    .bind(&payload.title)
    .bind(&payload.description)
    .bind(payload.event_type.as_deref().unwrap_or("in_person"))
    .bind(&payload.location)
    .bind(payload.capacity)
    .bind(payload.ticket_price_cents)
    .bind(start_at)
    .bind(end_at)
    .bind(payload.created_by)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .map_err(|e| { eprintln!("DB error creating event: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({"id": id}))))
}

async fn update_event(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateEventPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM events WHERE id = ?1")
        .bind(id)
        .fetch_one(&pool)
        .await
        .map_err(|e| { eprintln!("DB error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    if exists == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let mut qb = sqlx::QueryBuilder::new("UPDATE events SET ");
    let mut sep = qb.separated(", ");

    if let Some(ref title) = payload.title {
        sep.push("title = "); sep.push_bind_unseparated(title);
    }
    if let Some(ref desc) = payload.description {
        sep.push("description = "); sep.push_bind_unseparated(desc);
    }
    if let Some(ref etype) = payload.event_type {
        sep.push("event_type = "); sep.push_bind_unseparated(etype);
    }
    if let Some(ref loc) = payload.location {
        sep.push("location = "); sep.push_bind_unseparated(loc);
    }
    if let Some(ref cap) = payload.capacity {
        sep.push("capacity = "); sep.push_bind_unseparated(cap);
    }
    if let Some(ref price) = payload.ticket_price_cents {
        sep.push("ticket_price_cents = "); sep.push_bind_unseparated(price);
    }
    if let Some(ref start) = payload.start_at {
        let parsed = parse_rfc3339(start)?;
        sep.push("start_at = "); sep.push_bind_unseparated(parsed);
    }
    if let Some(ref end) = payload.end_at {
        let parsed = end.as_ref().map(|s| parse_rfc3339(s)).transpose()?;
        sep.push("end_at = "); sep.push_bind_unseparated(parsed);
    }
    sep.push("updated_at = "); sep.push_bind_unseparated(Utc::now());

    qb.push(" WHERE id = "); qb.push_bind(id);

    qb.build().execute(&pool).await
        .map_err(|e| { eprintln!("DB error updating event: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    Ok(StatusCode::OK)
}

async fn publish_event(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, StatusCode> {
    let result = sqlx::query("UPDATE events SET status = 'published', updated_at = ?1 WHERE id = ?2")
        .bind(Utc::now())
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| { eprintln!("DB error publishing event: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    if result.rows_affected() == 0 {
        Err(StatusCode::NOT_FOUND)
    } else {
        Ok(StatusCode::OK)
    }
}

async fn cancel_event(
    State(pool): State<SqlitePool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, StatusCode> {
    let result = sqlx::query("UPDATE events SET status = 'cancelled', updated_at = ?1 WHERE id = ?2")
        .bind(Utc::now())
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| { eprintln!("DB error cancelling event: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    if result.rows_affected() == 0 {
        Err(StatusCode::NOT_FOUND)
    } else {
        Ok(StatusCode::OK)
    }
}

async fn create_rsvp(
    State(pool): State<SqlitePool>,
    Path(event_id): Path<Uuid>,
    Json(payload): Json<CreateRsvpPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    let id = Uuid::new_v4();

    // Check event exists and is not cancelled
    let event_status: Option<String> = sqlx::query_scalar("SELECT status FROM events WHERE id = ?1")
        .bind(event_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| { eprintln!("DB error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    match event_status {
        None => return Err(StatusCode::NOT_FOUND),
        Some(s) if s == "cancelled" => return Err(StatusCode::BAD_REQUEST),
        _ => {}
    }

    // Check capacity
    let capacity_opt: Option<i64> = sqlx::query_scalar("SELECT capacity FROM events WHERE id = ?1")
        .bind(event_id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(capacity) = capacity_opt {
        let current: i64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(ticket_count), 0) FROM event_rsvps WHERE event_id = ?1 AND status IN ('registered', 'attended')"
        )
        .bind(event_id)
        .fetch_one(&pool)
        .await
        .unwrap_or(0);

        let requested = payload.ticket_count.unwrap_or(1);
        if current + requested > capacity {
            return Err(StatusCode::BAD_REQUEST);
        }
    }

    sqlx::query(
        "INSERT INTO event_rsvps (id, event_id, person_id, status, ticket_count, paid_cents, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
    )
    .bind(id)
    .bind(event_id)
    .bind(payload.person_id)
    .bind(payload.status.as_deref().unwrap_or("registered"))
    .bind(payload.ticket_count.unwrap_or(1))
    .bind(payload.paid_cents)
    .bind(&payload.notes)
    .execute(&pool)
    .await
    .map_err(|e| { eprintln!("DB error creating RSVP: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({"id": id}))))
}

async fn update_rsvp(
    State(pool): State<SqlitePool>,
    Path((event_id, rsvp_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateRsvpPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    let exists = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM event_rsvps WHERE id = ?1 AND event_id = ?2"
    )
    .bind(rsvp_id)
    .bind(event_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| { eprintln!("DB error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    if exists == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let mut qb = sqlx::QueryBuilder::new("UPDATE event_rsvps SET ");
    let mut sep = qb.separated(", ");

    if let Some(ref status) = payload.status {
        sep.push("status = "); sep.push_bind_unseparated(status);
    }
    if let Some(ref count) = payload.ticket_count {
        sep.push("ticket_count = "); sep.push_bind_unseparated(count);
    }
    if let Some(ref paid) = payload.paid_cents {
        sep.push("paid_cents = "); sep.push_bind_unseparated(paid);
    }
    if let Some(ref notes) = payload.notes {
        sep.push("notes = "); sep.push_bind_unseparated(notes);
    }

    qb.push(" WHERE id = "); qb.push_bind(rsvp_id);
    qb.push(" AND event_id = "); qb.push_bind(event_id);

    qb.build().execute(&pool).await
        .map_err(|e| { eprintln!("DB error updating RSVP: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    Ok(StatusCode::OK)
}

async fn check_in_attendee(
    State(pool): State<SqlitePool>,
    Path(event_id): Path<Uuid>,
    Json(payload): Json<CheckInPayload>,
) -> Result<impl IntoResponse, StatusCode> {
    let event_exists: bool = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM events WHERE id = ?1")
        .bind(event_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| { eprintln!("DB error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })? > 0;

    if !event_exists {
        return Err(StatusCode::NOT_FOUND);
    }

    let now = Utc::now();

    // Try to find an existing RSVP for this person at this event
    let existing_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM event_rsvps WHERE event_id = ?1 AND person_id = ?2"
    )
    .bind(event_id)
    .bind(payload.person_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| { eprintln!("DB error: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    match existing_id {
        Some(rsvp_id) => {
            sqlx::query("UPDATE event_rsvps SET status = 'attended', checked_in_at = ?1 WHERE id = ?2")
                .bind(now)
                .bind(rsvp_id)
                .execute(&pool)
                .await
                .map_err(|e| { eprintln!("DB error checking in: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;
            Ok((StatusCode::OK, Json(serde_json::json!({"rsvp_id": rsvp_id, "checked_in_at": now.to_rfc3339()}))))
        }
        None => {
            let rsvp_id = Uuid::new_v4();
            sqlx::query(
                "INSERT INTO event_rsvps (id, event_id, person_id, status, checked_in_at) VALUES (?1, ?2, ?3, 'attended', ?4)"
            )
            .bind(rsvp_id)
            .bind(event_id)
            .bind(payload.person_id)
            .bind(now)
            .execute(&pool)
            .await
            .map_err(|e| { eprintln!("DB error creating walk-in RSVP: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;
            Ok((StatusCode::CREATED, Json(serde_json::json!({"rsvp_id": rsvp_id, "checked_in_at": now.to_rfc3339(), "walk_in": true}))))
        }
    }
}

async fn list_attendees(
    State(pool): State<SqlitePool>,
    Path(event_id): Path<Uuid>,
) -> Result<Json<Vec<RsvpResponse>>, StatusCode> {
    let rsvps = sqlx::query_as::<_, EventAttendeeRow>(
        "SELECT * FROM event_rsvps WHERE event_id = ?1 ORDER BY created_at ASC"
    )
    .bind(event_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| { eprintln!("DB error listing attendees: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let responses = rsvps.into_iter().map(|r| {
        let dbr = DbEventRsvp {
            id: r.id, event_id: r.event_id, person_id: r.person_id,
            status: r.status, ticket_count: r.ticket_count, paid_cents: r.paid_cents,
            checked_in_at: r.checked_in_at, notes: r.notes, created_at: r.created_at,
        };
        rsvp_to_response(dbr)
    }).collect();

    Ok(Json(responses))
}
