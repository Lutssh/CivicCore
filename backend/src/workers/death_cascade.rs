use sqlx::PgPool;
use crate::db::audit::AuditWriter;

pub async fn run_death_cascade(citizen_id: &str, pool: &PgPool) -> Result<(), sqlx::Error> {
    tracing::info!("Starting death cascade for citizen {}", citizen_id);

    // 1. Close active labour records
    sqlx::query(
        "UPDATE labour.records SET status = 'CLOSED', end_date = NOW()
         WHERE citizen_id = $1 AND status = 'ACTIVE'"
    )
    .bind(citizen_id)
    .execute(pool)
    .await?;

    // 2. Mark tax account as suspended
    sqlx::query(
        "UPDATE revenue.records SET compliance_status = 'SUSPENDED'
         WHERE citizen_id = $1"
    )
    .bind(citizen_id)
    .execute(pool)
    .await?;

    // 3. Update Tier 2 flags — prototype uses plaintext, production would encrypt with sector keys
    let flags = vec![
        ("employment_status", "DECEASED"),
        ("travel_clearance", "RESTRICTED"),
        ("tax_compliance_status", "SUSPENDED"),
    ];

    for (flag_name, flag_value) in flags {
        sqlx::query(
            "INSERT INTO core.tier2_flags (citizen_id, sector, flag_name, encrypted_value)
             VALUES ($1, 'CORE', $2, $3)
             ON CONFLICT (citizen_id, sector, flag_name) 
             DO UPDATE SET encrypted_value = $3, last_updated = NOW()"
        )
        .bind(citizen_id)
        .bind(flag_name)
        .bind(flag_value)  // In production: encrypt with sector public key before storing
        .execute(pool)
        .await?;
    }

    // 4. Log cascade actions
    let _ = AuditWriter::log(
        pool,
        Some(citizen_id),
        None, // System actor
        "SYSTEM",
        Some("CORE"),
        "DEATH_CASCADE_TRIGGERED",
        None,
        "SUCCESS",
        Some(serde_json::json!({ "details": "Labour records closed, tax suspended" })),
    )
    .await;

    tracing::info!("Death cascade completed for citizen {}", citizen_id);
    Ok(())
}
