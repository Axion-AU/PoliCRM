use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::fs;

/// Initialize the SQLite connection pool.
pub async fn create_pool(database_url: &str) -> Result<SqlitePool> {
    // Ensure the database file exists
    if database_url.starts_with("sqlite:") {
        let path = database_url.trim_start_matches("sqlite:");
        if path != ":memory:" && !std::path::Path::new(path).exists() {
            // Create the file
            fs::write(path, &[]).ok();
        }
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await?;

    Ok(pool)
}

/// Run the initial database migration from the embedded SQL file.
pub async fn run_migrations(pool: &SqlitePool) -> Result<()> {
    let migration_sql = include_str!("../../migrations/001_initial.sql");
    sqlx::query(migration_sql).execute(pool).await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Row structs (raw DB rows with encrypted fields as Vec<u8>)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct UserRow {
    pub id: i64,
    pub firebase_uid: Option<String>,
    pub email: String,
    pub role: String,
    pub is_active: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct MemberRow {
    pub id: i64,
    pub first_name: Vec<u8>,
    pub middle_name: Option<Vec<u8>>,
    pub last_name: Vec<u8>,
    pub email_hash: Option<String>,
    pub nationbuilder_id: i64,
    pub email: Option<Vec<u8>>,
    pub phone: Option<Vec<u8>>,
    pub mobile: Option<Vec<u8>>,
    pub primary_address1: Vec<u8>,
    pub primary_address2: Option<Vec<u8>>,
    pub primary_address3: Option<Vec<u8>>,
    pub primary_city: Vec<u8>,
    pub primary_state: Option<String>,
    pub primary_zip: Option<String>,
    pub primary_country_code: Option<String>,
    pub membership_status: Option<String>,
    pub join_date: Option<String>,
    pub renewal_date: Option<String>,
    pub membership_type: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub is_duplicate: i64,
    pub duplicate_of_id: Option<i64>,
}

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct CheckResultRow {
    pub id: i64,
    pub member_id: i64,
    pub result: String,
    pub federal_division: Option<String>,
    pub state_division: Option<String>,
    pub local_government: Option<String>,
    pub local_ward: Option<String>,
    pub timestamp: String,
}

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct MemberNoteRow {
    pub id: i64,
    pub member_id: i64,
    pub note: String,
    pub created_by: String,
    pub created_at: String,
}

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct TagRow {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub description: Option<String>,
    pub created_at: String,
}

// ---------------------------------------------------------------------------
// API response structs (decrypted, ready to serialize to JSON)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemberResponse {
    pub id: i64,
    pub first_name: String,
    pub middle_name: Option<String>,
    pub last_name: String,
    pub email_hash: Option<String>,
    pub nationbuilder_id: i64,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub mobile: Option<String>,
    pub primary_address1: String,
    pub primary_address2: Option<String>,
    pub primary_address3: Option<String>,
    pub primary_city: String,
    pub primary_state: Option<String>,
    pub primary_zip: Option<String>,
    pub primary_country_code: String,
    pub membership_status: String,
    pub join_date: Option<String>,
    pub renewal_date: Option<String>,
    pub membership_type: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub is_duplicate: bool,
    pub duplicate_of_id: Option<i64>,
    pub check_results: Vec<CheckResultRow>,
    pub notes: Vec<MemberNoteRow>,
    pub tags: Vec<TagRow>,
}

impl MemberRow {
    /// Decrypt all PII fields to produce a MemberResponse.
    pub fn decrypt(
        &self,
        security: &crate::api::security::Security,
    ) -> Result<MemberDecrypted> {
        Ok(MemberDecrypted {
            id: self.id,
            first_name: security.decrypt(&self.first_name)?,
            middle_name: self
                .middle_name
                .as_deref()
                .map(|b| security.decrypt(b))
                .transpose()?,
            last_name: security.decrypt(&self.last_name)?,
            email_hash: self.email_hash.clone(),
            nationbuilder_id: self.nationbuilder_id,
            email: self
                .email
                .as_deref()
                .map(|b| security.decrypt(b))
                .transpose()?,
            phone: self
                .phone
                .as_deref()
                .map(|b| security.decrypt(b))
                .transpose()?,
            mobile: self
                .mobile
                .as_deref()
                .map(|b| security.decrypt(b))
                .transpose()?,
            primary_address1: security.decrypt(&self.primary_address1)?,
            primary_address2: self
                .primary_address2
                .as_deref()
                .map(|b| security.decrypt(b))
                .transpose()?,
            primary_address3: self
                .primary_address3
                .as_deref()
                .map(|b| security.decrypt(b))
                .transpose()?,
            primary_city: security.decrypt(&self.primary_city)?,
            primary_state: self.primary_state.clone(),
            primary_zip: self.primary_zip.clone(),
            primary_country_code: self
                .primary_country_code
                .clone()
                .unwrap_or_else(|| "AU".to_string()),
            membership_status: self
                .membership_status
                .clone()
                .unwrap_or_else(|| "active".to_string()),
            join_date: self.join_date.clone(),
            renewal_date: self.renewal_date.clone(),
            membership_type: self.membership_type.clone(),
            created_at: self.created_at.clone(),
            updated_at: self.updated_at.clone(),
            is_duplicate: self.is_duplicate != 0,
            duplicate_of_id: self.duplicate_of_id,
        })
    }
}

/// Decrypted member data (no encrypted fields)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemberDecrypted {
    pub id: i64,
    pub first_name: String,
    pub middle_name: Option<String>,
    pub last_name: String,
    pub email_hash: Option<String>,
    pub nationbuilder_id: i64,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub mobile: Option<String>,
    pub primary_address1: String,
    pub primary_address2: Option<String>,
    pub primary_address3: Option<String>,
    pub primary_city: String,
    pub primary_state: Option<String>,
    pub primary_zip: Option<String>,
    pub primary_country_code: String,
    pub membership_status: String,
    pub join_date: Option<String>,
    pub renewal_date: Option<String>,
    pub membership_type: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub is_duplicate: bool,
    pub duplicate_of_id: Option<i64>,
}

// ---------------------------------------------------------------------------
// Request input structs
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct MemberCreate {
    pub first_name: String,
    pub middle_name: Option<String>,
    pub last_name: String,
    pub nationbuilder_id: i64,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub mobile: Option<String>,
    pub primary_address1: String,
    pub primary_address2: Option<String>,
    pub primary_address3: Option<String>,
    pub primary_city: String,
    pub primary_state: String,
    pub primary_zip: String,
    pub primary_country_code: Option<String>,
    pub membership_status: Option<String>,
    pub membership_type: Option<String>,
    pub join_date: Option<String>,
    pub renewal_date: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct MemberUpdate {
    pub first_name: Option<String>,
    pub middle_name: Option<String>,
    pub last_name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub mobile: Option<String>,
    pub primary_address1: Option<String>,
    pub primary_city: Option<String>,
    pub primary_state: Option<String>,
    pub primary_zip: Option<String>,
    pub membership_status: Option<String>,
    pub membership_type: Option<String>,
    pub renewal_date: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct MemberNoteCreate {
    pub note: String,
    pub created_by: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TagCreate {
    pub name: String,
    pub color: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UserCreate {
    pub email: String,
    pub role: Option<String>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UserUpdate {
    pub role: Option<String>,
    pub is_active: Option<bool>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::security::{generate_fernet_key, Security};

    /// Build a MemberRow with all required encrypted fields using the given Security instance.
    fn make_member_row(security: &Security) -> MemberRow {
        MemberRow {
            id: 1,
            first_name: security.encrypt("Alice"),
            middle_name: Some(security.encrypt("Jane")),
            last_name: security.encrypt("Smith"),
            email_hash: Some("abc123".to_string()),
            nationbuilder_id: 42,
            email: Some(security.encrypt("alice@example.com")),
            phone: Some(security.encrypt("0400000000")),
            mobile: Some(security.encrypt("0412345678")),
            primary_address1: security.encrypt("Main Street"),
            primary_address2: None,
            primary_address3: None,
            primary_city: security.encrypt("Melbourne"),
            primary_state: Some("VIC".to_string()),
            primary_zip: Some("3000".to_string()),
            primary_country_code: Some("AU".to_string()),
            membership_status: Some("active".to_string()),
            join_date: Some("2023-01-01".to_string()),
            renewal_date: Some("2024-01-01".to_string()),
            membership_type: Some("full".to_string()),
            created_at: "2023-01-01 00:00:00".to_string(),
            updated_at: "2023-06-01 00:00:00".to_string(),
            is_duplicate: 0,
            duplicate_of_id: None,
        }
    }

    // ─── MemberRow.decrypt ────────────────────────────────────────────────────

    #[test]
    fn test_member_row_decrypt_basic_fields() {
        let key = generate_fernet_key();
        let sec = Security::new(&key).unwrap();
        let row = make_member_row(&sec);

        let dec = row.decrypt(&sec).unwrap();
        assert_eq!(dec.first_name, "Alice");
        assert_eq!(dec.middle_name.as_deref(), Some("Jane"));
        assert_eq!(dec.last_name, "Smith");
        assert_eq!(dec.email.as_deref(), Some("alice@example.com"));
        assert_eq!(dec.phone.as_deref(), Some("0400000000"));
        assert_eq!(dec.mobile.as_deref(), Some("0412345678"));
        assert_eq!(dec.primary_address1, "Main Street");
        assert_eq!(dec.primary_city, "Melbourne");
    }

    #[test]
    fn test_member_row_decrypt_plain_fields() {
        let key = generate_fernet_key();
        let sec = Security::new(&key).unwrap();
        let row = make_member_row(&sec);

        let dec = row.decrypt(&sec).unwrap();
        assert_eq!(dec.id, 1);
        assert_eq!(dec.nationbuilder_id, 42);
        assert_eq!(dec.primary_state.as_deref(), Some("VIC"));
        assert_eq!(dec.primary_zip.as_deref(), Some("3000"));
        assert_eq!(dec.primary_country_code, "AU");
        assert_eq!(dec.membership_status, "active");
        assert_eq!(dec.join_date.as_deref(), Some("2023-01-01"));
        assert_eq!(dec.renewal_date.as_deref(), Some("2024-01-01"));
        assert_eq!(dec.membership_type.as_deref(), Some("full"));
    }

    #[test]
    fn test_member_row_decrypt_is_duplicate_zero_maps_false() {
        let key = generate_fernet_key();
        let sec = Security::new(&key).unwrap();
        let mut row = make_member_row(&sec);
        row.is_duplicate = 0;

        let dec = row.decrypt(&sec).unwrap();
        assert!(!dec.is_duplicate);
    }

    #[test]
    fn test_member_row_decrypt_is_duplicate_nonzero_maps_true() {
        let key = generate_fernet_key();
        let sec = Security::new(&key).unwrap();
        let mut row = make_member_row(&sec);
        row.is_duplicate = 1;

        let dec = row.decrypt(&sec).unwrap();
        assert!(dec.is_duplicate);
    }

    #[test]
    fn test_member_row_decrypt_optional_fields_none() {
        let key = generate_fernet_key();
        let sec = Security::new(&key).unwrap();
        let mut row = make_member_row(&sec);
        row.middle_name = None;
        row.email = None;
        row.phone = None;
        row.mobile = None;
        row.primary_address2 = None;
        row.primary_address3 = None;

        let dec = row.decrypt(&sec).unwrap();
        assert!(dec.middle_name.is_none());
        assert!(dec.email.is_none());
        assert!(dec.phone.is_none());
        assert!(dec.mobile.is_none());
        assert!(dec.primary_address2.is_none());
        assert!(dec.primary_address3.is_none());
    }

    #[test]
    fn test_member_row_decrypt_defaults_for_missing_plain_fields() {
        let key = generate_fernet_key();
        let sec = Security::new(&key).unwrap();
        let mut row = make_member_row(&sec);
        row.primary_country_code = None;
        row.membership_status = None;

        let dec = row.decrypt(&sec).unwrap();
        assert_eq!(dec.primary_country_code, "AU");
        assert_eq!(dec.membership_status, "active");
    }

    #[test]
    fn test_member_row_decrypt_with_wrong_key_fails() {
        let key1 = generate_fernet_key();
        let key2 = generate_fernet_key();
        let sec1 = Security::new(&key1).unwrap();
        let sec2 = Security::new(&key2).unwrap();

        let row = make_member_row(&sec1);
        // Decrypting with a different key should fail
        assert!(row.decrypt(&sec2).is_err());
    }

    // ─── TagCreate struct ─────────────────────────────────────────────────────

    #[test]
    fn test_tag_create_serialize() {
        let t = TagCreate {
            name: "Volunteer".to_string(),
            color: Some("#ff0000".to_string()),
            description: Some("Active volunteer".to_string()),
        };
        let json = serde_json::to_value(&t).unwrap();
        assert_eq!(json["name"], "Volunteer");
        assert_eq!(json["color"], "#ff0000");
        assert_eq!(json["description"], "Active volunteer");
    }

    #[test]
    fn test_tag_create_color_optional() {
        let t = TagCreate {
            name: "Member".to_string(),
            color: None,
            description: None,
        };
        let json = serde_json::to_value(&t).unwrap();
        assert_eq!(json["name"], "Member");
        assert!(json["color"].is_null());
    }

    // ─── MemberDecrypted serialization ────────────────────────────────────────

    #[test]
    fn test_member_decrypted_serializes_to_json() {
        let key = generate_fernet_key();
        let sec = Security::new(&key).unwrap();
        let row = make_member_row(&sec);
        let dec = row.decrypt(&sec).unwrap();

        let json = serde_json::to_value(&dec).unwrap();
        assert_eq!(json["first_name"], "Alice");
        assert_eq!(json["last_name"], "Smith");
        assert_eq!(json["nationbuilder_id"], 42);
        assert_eq!(json["is_duplicate"], false);
    }
}
