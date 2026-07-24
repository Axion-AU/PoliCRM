/// ERA data models (SQLx `FromRow` + Serde).
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

// ─── era_uploads ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct EraUpload {
    pub id: i64,
    pub filename: String,
    pub state: Option<String>,
    pub record_count: i64,
    pub status: String,
    pub error_message: Option<String>,
    pub uploaded_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub uploaded_by: Option<String>,
}

// ─── era_records ──────────────────────────────────────────────────────────────

/// Full ERA record as stored in the database.
/// All fields are `Option<String>` (except id/upload_id) because AEC files
/// may have blank columns.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct EraRecord {
    pub id: i64,
    pub upload_id: Option<i64>,

    // Transaction identifiers
    pub enrolment_state: Option<String>,
    pub transaction_number: Option<String>,
    pub federal_direct_indicator: Option<String>,

    // Names
    pub title: Option<String>,
    pub given_names: Option<String>,
    pub surname: Option<String>,
    pub surname_normalized: Option<String>,
    pub given_names_normalized: Option<String>,

    // Demographics
    pub date_of_birth: Option<String>,
    pub gender: Option<String>,

    // Address
    pub habitation_name: Option<String>,
    pub flat_number: Option<String>,
    pub street_number: Option<String>,
    pub street_name: Option<String>,
    pub street_type: Option<String>,
    pub locality_name: Option<String>,
    pub post_code: Option<String>,
    pub state: Option<String>,
    pub full_address: Option<String>,
    pub enrolled_address_dpid: Option<String>,

    // Geographic
    pub walk_number: Option<String>,

    // Enrolment metadata
    pub enrolled_date: Option<String>,
    pub eligibility_flag: Option<String>,
    pub gpv_indicator: Option<String>,
    pub new_enrolment_flag: Option<String>,

    // Postal address
    pub postal_address: Option<String>,
    pub postal_address_dpid: Option<String>,

    // Electoral divisions
    pub federal_division: Option<String>,
    pub federal_division_pre_redistribution: Option<String>,
    pub state_district: Option<String>,
    pub state_district_pre_redistribution: Option<String>,
    pub local_government_area: Option<String>,
    pub lga_pre_redistribution: Option<String>,
    pub sa1: Option<String>,

    // Mailing
    pub mailing_name: Option<String>,
    pub mailing_address_line1: Option<String>,
    pub mailing_address_line2: Option<String>,
    pub mailing_address_line3: Option<String>,
    pub mailing_address_line4: Option<String>,

    // Previous / dual enrolment
    pub prev_enrolment_state: Option<String>,
    pub prev_transaction_number: Option<String>,
    pub dual_enrolment_state: Option<String>,
    pub dual_transaction_number: Option<String>,
}

/// Lightweight insert struct — only the fields we populate from the TSV.
/// Used for bulk INSERT batches (avoids binding every field individually).
#[derive(Debug, Clone)]
pub struct EraRecordInsert {
    pub upload_id: i64,

    // Identifiers
    pub enrolment_state: Option<String>,
    pub transaction_number: Option<String>,
    pub federal_direct_indicator: Option<String>,

    // Names
    pub title: Option<String>,
    pub given_names: Option<String>,
    pub surname: Option<String>,
    pub surname_normalized: String,
    pub given_names_normalized: String,

    // Demographics
    pub date_of_birth: Option<String>,
    pub gender: Option<String>,

    // Address
    pub habitation_name: Option<String>,
    pub flat_number: Option<String>,
    pub street_number: Option<String>,
    pub street_name: Option<String>,
    pub street_type: Option<String>,
    pub locality_name: Option<String>,
    pub post_code: Option<String>,
    pub state: Option<String>,
    pub full_address: Option<String>,
    pub enrolled_address_dpid: Option<String>,

    // Geographic
    pub walk_number: Option<String>,

    // Enrolment metadata
    pub enrolled_date: Option<String>,
    pub eligibility_flag: Option<String>,
    pub gpv_indicator: Option<String>,
    pub new_enrolment_flag: Option<String>,

    // Postal address
    pub postal_address: Option<String>,
    pub postal_address_dpid: Option<String>,

    // Electoral divisions
    pub federal_division: Option<String>,
    pub federal_division_pre_redistribution: Option<String>,
    pub state_district: Option<String>,
    pub state_district_pre_redistribution: Option<String>,
    pub local_government_area: Option<String>,
    pub lga_pre_redistribution: Option<String>,
    pub sa1: Option<String>,

    // Mailing
    pub mailing_name: Option<String>,
    pub mailing_address_line1: Option<String>,
    pub mailing_address_line2: Option<String>,
    pub mailing_address_line3: Option<String>,
    pub mailing_address_line4: Option<String>,

    // Previous / dual enrolment
    pub prev_enrolment_state: Option<String>,
    pub prev_transaction_number: Option<String>,
    pub dual_enrolment_state: Option<String>,
    pub dual_transaction_number: Option<String>,
}

// ─── era_matches ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct EraMatch {
    pub id: i64,
    pub person_id: String,
    pub era_record_id: i64,
    pub overall_score: i64,
    pub name_score: i64,
    pub address_score: i64,
    pub is_verified: i64,
    pub matched_at: DateTime<Utc>,
    pub verified_by: Option<String>,
    pub verified_at: Option<DateTime<Utc>>,
    pub federal_division: Option<String>,
    pub state_district: Option<String>,
    pub local_government_area: Option<String>,
}
