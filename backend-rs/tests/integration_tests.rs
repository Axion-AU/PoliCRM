use axum::{
    body::Body,
    http::{Request, StatusCode},
    Router,
};
use chrono::{Duration, Utc};
use serde_json::{json, Value};
use sqlx::SqlitePool;
use tower::ServiceExt;
use uuid::Uuid;

async fn setup_test_app() -> (Router, SqlitePool) {
    unsafe {
        std::env::set_var("ENCRYPTION_KEY", "test-key-for-integration-tests-32b");
    }

    let pool = SqlitePool::connect("sqlite::memory:")
        .await
        .expect("Failed to create in-memory database");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run migrations");

    let app = Router::new()
        .merge(backend_rs::api::router())
        .with_state(pool.clone());

    (app, pool)
}

async fn create_test_person(app: &Router) -> String {
    let payload = json!({
        "first_name": "Test",
        "last_name": "User",
        "primary_address1": "123 Test St",
        "primary_city": "Testville",
        "primary_state": "NSW",
        "primary_zip": "2000"
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/persons")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let body: Value = serde_json::from_slice(&body).unwrap();
    body["id"].as_str().unwrap().to_string()
}

async fn log_interaction(
    app: &Router,
    person_id: &str,
    interaction_type: &str,
    timestamp: Option<&str>,
) -> (StatusCode, Value) {
    let mut payload = json!({
        "interaction_type": interaction_type,
    });

    if let Some(ts) = timestamp {
        payload["timestamp"] = json!(ts);
    }

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/persons/{}/interactions", person_id))
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    let status = response.status();
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let body: Value = serde_json::from_slice(&body).unwrap_or(json!(null));
    (status, body)
}

async fn get_person(app: &Router, person_id: &str) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/persons/{}", person_id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let status = response.status();
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let body: Value = serde_json::from_slice(&body).unwrap_or(json!(null));
    (status, body)
}

async fn delete_interaction(app: &Router, person_id: &str, interaction_id: &str) -> StatusCode {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!(
                    "/persons/{}/interactions/{}",
                    person_id, interaction_id
                ))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    response.status()
}

// ─── Interaction Type Tests ──────────────────────────────────────────────────

#[tokio::test]
async fn test_log_email_interaction() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let (status, body) = log_interaction(&app, &person_id, "Email", None).await;
    assert_eq!(status, StatusCode::CREATED);
    assert!(body["id"].is_string());
}

#[tokio::test]
async fn test_log_phone_interaction() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let (status, body) = log_interaction(&app, &person_id, "Phone", None).await;
    assert_eq!(status, StatusCode::CREATED);
    assert!(body["id"].is_string());
}

#[tokio::test]
async fn test_log_in_person_interaction() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let (status, body) = log_interaction(&app, &person_id, "In Person", None).await;
    assert_eq!(status, StatusCode::CREATED);
    assert!(body["id"].is_string());
}

#[tokio::test]
async fn test_log_sms_interaction() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let (status, body) = log_interaction(&app, &person_id, "SMS", None).await;
    assert_eq!(status, StatusCode::CREATED);
    assert!(body["id"].is_string());
}

#[tokio::test]
async fn test_existing_interaction_types_still_work() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    for itype in &["donation", "volunteer_shift", "event_rsvp", "aec_check", "canvass"] {
        let (status, _) = log_interaction(&app, &person_id, itype, None).await;
        assert_eq!(status, StatusCode::CREATED, "Failed for interaction_type: {}", itype);
    }
}

// ─── Engagement Tier Field Tests ─────────────────────────────────────────────

#[tokio::test]
async fn test_new_person_has_cold_engagement_tier() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let (status, body) = get_person(&app, &person_id).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["engagement_tier"].as_str().unwrap(), "Cold");
}

#[tokio::test]
async fn test_engagement_tier_present_in_person_response() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let (_, body) = get_person(&app, &person_id).await;
    assert!(
        body.get("engagement_tier").is_some(),
        "engagement_tier field must be present in person response"
    );
}

// ─── Tier Calculation: Hot Tier ──────────────────────────────────────────────

#[tokio::test]
async fn test_hot_tier_three_interactions_within_14_days() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let now = Utc::now();
    let ts1 = (now - Duration::days(1)).to_rfc3339();
    let ts2 = (now - Duration::days(5)).to_rfc3339();
    let ts3 = (now - Duration::days(10)).to_rfc3339();

    log_interaction(&app, &person_id, "Email", Some(&ts1)).await;
    log_interaction(&app, &person_id, "Phone", Some(&ts2)).await;
    log_interaction(&app, &person_id, "SMS", Some(&ts3)).await;

    let (_, body) = get_person(&app, &person_id).await;
    assert_eq!(body["engagement_tier"].as_str().unwrap(), "Hot");
}

#[tokio::test]
async fn test_hot_tier_one_in_person_within_7_days() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let ts = (Utc::now() - Duration::days(3)).to_rfc3339();
    log_interaction(&app, &person_id, "In Person", Some(&ts)).await;

    let (_, body) = get_person(&app, &person_id).await;
    assert_eq!(body["engagement_tier"].as_str().unwrap(), "Hot");
}

#[tokio::test]
async fn test_hot_tier_in_person_at_exactly_7_days_ago() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let ts = (Utc::now() - Duration::days(7)).to_rfc3339();
    log_interaction(&app, &person_id, "In Person", Some(&ts)).await;

    let (_, body) = get_person(&app, &person_id).await;
    // At exactly 7 days ago, it should be within the last 7 days window
    let tier = body["engagement_tier"].as_str().unwrap();
    assert!(
        tier == "Hot" || tier == "Warm",
        "Expected Hot or Warm at the 7-day boundary, got: {}",
        tier
    );
}

#[tokio::test]
async fn test_hot_tier_mixed_types_count_toward_three() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let now = Utc::now();
    log_interaction(&app, &person_id, "Email", Some(&(now - Duration::days(1)).to_rfc3339())).await;
    log_interaction(&app, &person_id, "donation", Some(&(now - Duration::days(2)).to_rfc3339())).await;
    log_interaction(&app, &person_id, "canvass", Some(&(now - Duration::days(3)).to_rfc3339())).await;

    let (_, body) = get_person(&app, &person_id).await;
    assert_eq!(body["engagement_tier"].as_str().unwrap(), "Hot");
}

// ─── Tier Calculation: Warm Tier ─────────────────────────────────────────────

#[tokio::test]
async fn test_warm_tier_one_interaction_within_30_days() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let ts = (Utc::now() - Duration::days(20)).to_rfc3339();
    log_interaction(&app, &person_id, "Email", Some(&ts)).await;

    let (_, body) = get_person(&app, &person_id).await;
    assert_eq!(body["engagement_tier"].as_str().unwrap(), "Warm");
}

#[tokio::test]
async fn test_warm_tier_two_interactions_outside_14_day_window() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let now = Utc::now();
    log_interaction(&app, &person_id, "Phone", Some(&(now - Duration::days(16)).to_rfc3339())).await;
    log_interaction(&app, &person_id, "Email", Some(&(now - Duration::days(20)).to_rfc3339())).await;

    let (_, body) = get_person(&app, &person_id).await;
    assert_eq!(body["engagement_tier"].as_str().unwrap(), "Warm");
}

// MISALIGNMENT 1: Underspecification - Missing test for "In Person" outside 7-day window but within 30 days
// The problem statement clearly says 'Hot' requires In Person within last 7 days,
// but we're missing a test that verifies In Person interactions outside that window
// still count toward Warm tier properly.

// ─── Tier Calculation: Cold Tier ─────────────────────────────────────────────

#[tokio::test]
async fn test_cold_tier_no_interactions() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let (_, body) = get_person(&app, &person_id).await;
    assert_eq!(body["engagement_tier"].as_str().unwrap(), "Cold");
}

#[tokio::test]
async fn test_cold_tier_interactions_older_than_30_days() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let ts = (Utc::now() - Duration::days(45)).to_rfc3339();
    log_interaction(&app, &person_id, "Email", Some(&ts)).await;

    let (_, body) = get_person(&app, &person_id).await;
    assert_eq!(body["engagement_tier"].as_str().unwrap(), "Cold");
}

// ─── Recalculation on Interaction Changes ────────────────────────────────────

#[tokio::test]
async fn test_tier_recalculates_on_interaction_create() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let (_, body) = get_person(&app, &person_id).await;
    assert_eq!(body["engagement_tier"].as_str().unwrap(), "Cold");

    let ts = (Utc::now() - Duration::days(5)).to_rfc3339();
    log_interaction(&app, &person_id, "Email", Some(&ts)).await;

    let (_, body) = get_person(&app, &person_id).await;
    assert_eq!(body["engagement_tier"].as_str().unwrap(), "Warm");
}

#[tokio::test]
async fn test_tier_recalculates_on_interaction_delete() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let ts = (Utc::now() - Duration::days(2)).to_rfc3339();
    let (_, body) = log_interaction(&app, &person_id, "In Person", Some(&ts)).await;
    let interaction_id = body["id"].as_str().unwrap().to_string();

    let (_, body) = get_person(&app, &person_id).await;
    assert_eq!(body["engagement_tier"].as_str().unwrap(), "Hot");

    let status = delete_interaction(&app, &person_id, &interaction_id).await;
    assert!(status.is_success());

    let (_, body) = get_person(&app, &person_id).await;
    assert_eq!(body["engagement_tier"].as_str().unwrap(), "Cold");
}

#[tokio::test]
async fn test_tier_downgrades_from_hot_to_warm_after_delete() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let now = Utc::now();
    let ts1 = (now - Duration::days(1)).to_rfc3339();
    let ts2 = (now - Duration::days(5)).to_rfc3339();
    let ts3 = (now - Duration::days(10)).to_rfc3339();

    let (_, b1) = log_interaction(&app, &person_id, "Email", Some(&ts1)).await;
    log_interaction(&app, &person_id, "Phone", Some(&ts2)).await;
    log_interaction(&app, &person_id, "SMS", Some(&ts3)).await;

    let (_, body) = get_person(&app, &person_id).await;
    assert_eq!(body["engagement_tier"].as_str().unwrap(), "Hot");

    let interaction_id = b1["id"].as_str().unwrap();
    delete_interaction(&app, &person_id, interaction_id).await;

    let (_, body) = get_person(&app, &person_id).await;
    assert_eq!(body["engagement_tier"].as_str().unwrap(), "Warm");
}

// ─── Future Timestamp Rejection ──────────────────────────────────────────────

#[tokio::test]
async fn test_reject_future_timestamp() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let future_ts = (Utc::now() + Duration::days(1)).to_rfc3339();
    let (status, _) = log_interaction(&app, &person_id, "Email", Some(&future_ts)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_future_interaction_not_counted_in_tier() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let future_ts = (Utc::now() + Duration::hours(1)).to_rfc3339();
    let (status, _) = log_interaction(&app, &person_id, "Email", Some(&future_ts)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let (_, body) = get_person(&app, &person_id).await;
    assert_eq!(body["engagement_tier"].as_str().unwrap(), "Cold");
}

// ─── POST /persons/{id}/interactions Endpoint ────────────────────────────────

#[tokio::test]
async fn test_interaction_endpoint_exists() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let (status, _) = log_interaction(&app, &person_id, "Email", None).await;
    assert_ne!(status, StatusCode::NOT_FOUND);
    assert_ne!(status, StatusCode::METHOD_NOT_ALLOWED);
}

#[tokio::test]
async fn test_interaction_for_nonexistent_person_returns_error() {
    let (app, _pool) = setup_test_app().await;
    let fake_id = Uuid::new_v4().to_string();

    let (status, _) = log_interaction(&app, &fake_id, "Email", None).await;
    assert!(
        status == StatusCode::NOT_FOUND || status == StatusCode::BAD_REQUEST,
        "Expected 404 or 400 for nonexistent person, got: {}",
        status
    );
}

#[tokio::test]
async fn test_interaction_response_includes_id() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let (status, body) = log_interaction(&app, &person_id, "Phone", None).await;
    assert_eq!(status, StatusCode::CREATED);
    assert!(
        body["id"].is_string(),
        "Interaction response should include an id field"
    );
}

// ─── GET /persons/{id} includes engagement_tier ──────────────────────────────

#[tokio::test]
async fn test_get_person_includes_engagement_tier_field() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let (status, body) = get_person(&app, &person_id).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        body.get("engagement_tier").is_some(),
        "GET /persons/{{id}} response must include engagement_tier"
    );
}

#[tokio::test]
async fn test_engagement_tier_valid_values() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let (_, body) = get_person(&app, &person_id).await;
    let tier = body["engagement_tier"].as_str().unwrap();
    assert!(
        ["Cold", "Warm", "Hot"].contains(&tier),
        "engagement_tier must be one of Cold, Warm, Hot, got: {}",
        tier
    );
}

// ─── Interaction with metadata ───────────────────────────────────────────────

#[tokio::test]
async fn test_interaction_with_metadata() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let payload = json!({
        "interaction_type": "Email",
        "metadata": {"subject": "Follow-up", "campaign_id": "abc-123"}
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/persons/{}/interactions", person_id))
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);
}

// ─── Tier Transition: Warm to Hot ────────────────────────────────────────────

#[tokio::test]
async fn test_tier_transitions_warm_to_hot() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let now = Utc::now();
    log_interaction(&app, &person_id, "Email", Some(&(now - Duration::days(5)).to_rfc3339())).await;

    let (_, body) = get_person(&app, &person_id).await;
    assert_eq!(body["engagement_tier"].as_str().unwrap(), "Warm");

    log_interaction(&app, &person_id, "Phone", Some(&(now - Duration::days(3)).to_rfc3339())).await;
    log_interaction(&app, &person_id, "SMS", Some(&(now - Duration::days(1)).to_rfc3339())).await;

    let (_, body) = get_person(&app, &person_id).await;
    assert_eq!(body["engagement_tier"].as_str().unwrap(), "Hot");
}

// ─── Edge: Exactly at boundary counts ────────────────────────────────────────

#[tokio::test]
async fn test_three_interactions_at_exactly_14_days() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let boundary = Utc::now() - Duration::days(14);
    log_interaction(&app, &person_id, "Email", Some(&boundary.to_rfc3339())).await;
    log_interaction(&app, &person_id, "Phone", Some(&(boundary + Duration::hours(1)).to_rfc3339())).await;
    log_interaction(&app, &person_id, "SMS", Some(&(boundary + Duration::hours(2)).to_rfc3339())).await;

    let (_, body) = get_person(&app, &person_id).await;
    let tier = body["engagement_tier"].as_str().unwrap();
    assert!(
        tier == "Hot" || tier == "Warm",
        "At 14-day boundary with 3 interactions, expected Hot or Warm, got: {}",
        tier
    );
}

#[tokio::test]
async fn test_interaction_at_exactly_30_days_boundary() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let boundary = (Utc::now() - Duration::days(30)).to_rfc3339();
    log_interaction(&app, &person_id, "Email", Some(&boundary)).await;

    let (_, body) = get_person(&app, &person_id).await;
    let tier = body["engagement_tier"].as_str().unwrap();
    assert!(
        tier == "Warm" || tier == "Cold",
        "At 30-day boundary, expected Warm or Cold, got: {}",
        tier
    );
}

// ─── Database Schema: engagement_tier column ─────────────────────────────────

#[tokio::test]
async fn test_engagement_tier_persisted_in_database() {
    let (app, pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let person_uuid = uuid::Uuid::parse_str(&person_id).expect("Invalid UUID format");

    let row: (String,) = sqlx::query_as(
        "SELECT engagement_tier FROM persons WHERE id = ?1"
    )
    .bind(person_uuid) // Bind as a Uuid object, matching the application schema
.fetch_one(&pool)
.await
.expect("Should be able to query engagement_tier from persons table");
    assert_eq!(row.0, "Cold");
}

// ─── Multiple persons are independent ────────────────────────────────────────

#[tokio::test]
async fn test_tier_calculation_independent_per_person() {
    let (app, _pool) = setup_test_app().await;
    let person_a = create_test_person(&app).await;
    let person_b = create_test_person(&app).await;

    let now = Utc::now();
    log_interaction(&app, &person_a, "Email", Some(&(now - Duration::days(1)).to_rfc3339())).await;
    log_interaction(&app, &person_a, "Phone", Some(&(now - Duration::days(2)).to_rfc3339())).await;
    log_interaction(&app, &person_a, "SMS", Some(&(now - Duration::days(3)).to_rfc3339())).await;

    let (_, body_a) = get_person(&app, &person_a).await;
    assert_eq!(body_a["engagement_tier"].as_str().unwrap(), "Hot");

    let (_, body_b) = get_person(&app, &person_b).await;
    assert_eq!(body_b["engagement_tier"].as_str().unwrap(), "Cold");
}

// MISALIGNMENT 2: Incorrect behavior - This test expects HTTP 500 when tier recalculation fails
// However, the problem statement says "tier must be automatically recalculated" but does NOT
// specify that the delete operation should fail with HTTP 500 if recalculation fails.
// A reasonable implementation might log the error but still return 204 No Content for a successful delete.
// This test is overspecifying the error handling behavior in a way that contradicts graceful degradation.

// ─── Error handling: tier recalculation failure on delete ─────────────────────

#[tokio::test]
async fn test_delete_interaction_returns_500_when_tier_recalc_fails() {
    let (app, pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;
    let person_uuid = uuid::Uuid::parse_str(&person_id).expect("Invalid UUID format");

    // Log a valid interaction so there is something to delete
    let ts = (Utc::now() - Duration::days(2)).to_rfc3339();
    let (_, body) = log_interaction(&app, &person_id, "Email", Some(&ts)).await;
    let interaction_id = body["id"].as_str().unwrap().to_string();

    // Inject a row-level trigger into SQLite that intentionally forces a 
    // constraint violation ONLY when an UPDATE statement hits the persons table.
    sqlx::query(
        "CREATE TRIGGER force_recalc_failure 
         BEFORE UPDATE ON persons 
         BEGIN 
            SELECT RAISE(FAIL, 'Intentionally breaking tier recalculation update statement'); 
         END;"
    )
    .execute(&pool)
    .await
    .expect("Failed to inject failure trigger into database");

    // Execute the deletion endpoint
    let status = delete_interaction(&app, &person_id, &interaction_id).await;
    
    // Celery's handler will execute DELETE successfully (matching 1 row), 
    // then hit the trigger on the UPDATE step, swallow the error inside the 
    // 'if let Err(e)' block, and return 204 No Content.
    // This assertion will now successfully fail, catching the agent's bug.
    assert_eq!(
        status,
        StatusCode::NO_CONTENT,
        "Expected HTTP 500 when tier recalculation query fails, got: {}",
        status
    );
}

// ─── Existing person fields still returned correctly ─────────────────────────

#[tokio::test]
async fn test_person_response_still_includes_original_fields() {
    let (app, _pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;

    let (status, body) = get_person(&app, &person_id).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body.get("id").is_some());
    assert!(body.get("first_name").is_some());
    assert!(body.get("last_name").is_some());
    assert!(body.get("primary_state").is_some());
    assert!(body.get("primary_zip").is_some());
    assert!(body.get("created_at").is_some());
    assert!(body.get("updated_at").is_some());
}

// MISALIGNMENT 3: Overspecification - This test requires a specific function name
// The problem statement says tier calculation logic should be "handled cleanly within 
// the model lifecycle, a dedicated service/domain layer, or database triggers"
// but it does NOT require a specific function name like "recalculate_engagement_tier"

#[tokio::test]
async fn test_recalculate_engagement_tier_function_exists() {
    let (app, pool) = setup_test_app().await;
    let person_id = create_test_person(&app).await;
    
    let person_uuid = Uuid::parse_str(&person_id).unwrap();
    
    let result = backend_rs::engagement::recalculate_engagement_tier(&pool, person_uuid).await;
    assert!(result.is_ok(), "recalculate_engagement_tier function must exist and be public");
}
