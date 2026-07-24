use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

/// Branch in the org hierarchy (national → state → branch → team).
#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct Branch {
    pub id: Uuid,
    pub name: String,
    pub r#type: String,
    pub parent_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// User record synced from the auth worker headers.
#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub role: String,
    pub branch_id: Option<Uuid>,
    pub is_active: bool,
    pub password_hash: Option<String>,
    pub last_login_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Central person model. ALL PII fields are stored encrypted (AES-256-GCM, base64-encoded).
/// `primary_state` and `primary_zip` are stored in plaintext for geo-filtering.
/// `email_blind_index` is a deterministic SHA-256 HMAC used for exact-match email search.
#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct Person {
    pub id: Uuid,
    pub first_name: Option<String>,      // encrypted
    pub middle_name: Option<String>,     // encrypted
    pub last_name: Option<String>,       // encrypted
    pub email: Option<String>,           // encrypted
    pub email_blind_index: Option<String>, // SHA-256(email + pepper) — plaintext, searchable
    pub phone: Option<String>,           // encrypted
    pub mobile: Option<String>,          // encrypted
    pub primary_address1: Option<String>, // encrypted
    pub primary_address2: Option<String>, // encrypted
    pub primary_address3: Option<String>, // encrypted
    pub primary_city: Option<String>,    // encrypted
    pub primary_state: String,           // NOT encrypted — used for geo filtering
    pub primary_zip: String,             // NOT encrypted — low sensitivity, used for filtering
    pub primary_country_code: String,
    pub engagement_tier: String,
    pub tags: Option<String>,
    pub custom_fields: Option<String>,
    pub source: Option<String>,
    pub source_url: Option<String>,
    pub federal_division: Option<String>,
    pub state_district: Option<String>,
    pub lga: Option<String>,
    pub last_contacted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

/// External identity record for provider ID mapping (e.g. NationBuilder, Stripe, Auth0).
#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct ExternalIdentity {
    pub id: Uuid,
    pub person_id: Uuid,
    pub provider: String,
    pub provider_id: String,
    pub created_at: DateTime<Utc>,
}

/// Branch or party entity with hierarchical parent support.
#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct Party {
    pub id: Uuid,
    pub name: String,
    pub r#type: String,
    pub parent_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

/// Membership record linking a Person to a Party (Branch).
/// Supports overlapping and historical memberships.
#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct Membership {
    pub id: Uuid,
    pub person_id: Uuid,
    pub party_id: Uuid,
    pub status: String,              // active, lapsed, resigned, suspended
    pub membership_type: Option<String>,
    pub join_date: Option<DateTime<Utc>>,
    pub renewal_date: Option<DateTime<Utc>>,
    pub resignation_date: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

/// Event-sourced interaction record. Captures any touchpoint with a person.
/// `metadata` is a JSON blob for flexible, type-specific details.
#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct Interaction {
    pub id: Uuid,
    pub person_id: Uuid,
    pub interaction_type: String,   // donation, volunteer_shift, event_rsvp, aec_check, canvass, etc.
    pub metadata: Option<serde_json::Value>,
    pub timestamp: DateTime<Utc>,
    pub user_id: Option<Uuid>,
}
