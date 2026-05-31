use sqlx::PgPool;
use uuid::Uuid;
use serde_json::Value;

pub struct AuditWriter;

impl AuditWriter {
    pub async fn log(
        pool: &PgPool,
        citizen_id: Option<&str>,
        actor_user_id: Option<Uuid>,
        actor_role: &str,
        actor_sector: Option<&str>,
        action: &str,
        sector_accessed: Option<&str>,
        outcome: &str,
        details: Option<Value>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO audit.log (citizen_id, actor_user_id, actor_role, actor_sector, action, sector_accessed, outcome, details)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"
        )
        .bind(citizen_id)
        .bind(actor_user_id)
        .bind(actor_role)
        .bind(actor_sector)
        .bind(action)
        .bind(sector_accessed)
        .bind(outcome)
        .bind(details)
        .execute(pool)
        .await?;

        Ok(())
    }
}
