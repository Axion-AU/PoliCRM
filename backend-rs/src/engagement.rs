use chrono::{Duration, Utc};
use sqlx::SqlitePool;
use uuid::Uuid;

pub async fn recalculate_engagement_tier(
    pool: &SqlitePool,
    person_id: Uuid,
) -> Result<String, sqlx::Error> {
    let now = Utc::now();
    let seven_days_ago = now - Duration::days(7);
    let fourteen_days_ago = now - Duration::days(14);
    let thirty_days_ago = now - Duration::days(30);

    let in_person_last_7_days: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM interactions 
         WHERE person_id = ?1 
         AND interaction_type = 'In Person' 
         AND timestamp <= ?2 
         AND timestamp >= ?3"
    )
    .bind(person_id)
    .bind(now)
    .bind(seven_days_ago)
    .fetch_one(pool)
    .await?;

    if in_person_last_7_days >= 1 {
        update_tier(pool, person_id, "Hot").await?;
        return Ok("Hot".to_string());
    }

    let interactions_last_14_days: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM interactions 
         WHERE person_id = ?1 
         AND timestamp <= ?2 
         AND timestamp >= ?3"
    )
    .bind(person_id)
    .bind(now)
    .bind(fourteen_days_ago)
    .fetch_one(pool)
    .await?;

    if interactions_last_14_days >= 3 {
        update_tier(pool, person_id, "Hot").await?;
        return Ok("Hot".to_string());
    }

    let interactions_last_30_days: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM interactions 
         WHERE person_id = ?1 
         AND timestamp <= ?2 
         AND timestamp >= ?3"
    )
    .bind(person_id)
    .bind(now)
    .bind(thirty_days_ago)
    .fetch_one(pool)
    .await?;

    if interactions_last_30_days >= 1 {
        update_tier(pool, person_id, "Warm").await?;
        return Ok("Warm".to_string());
    }

    update_tier(pool, person_id, "Cold").await?;
    Ok("Cold".to_string())
}

async fn update_tier(
    pool: &SqlitePool,
    person_id: Uuid,
    tier: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE persons SET engagement_tier = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2"
    )
    .bind(tier)
    .bind(person_id)
    .execute(pool)
    .await?;
    Ok(())
}
