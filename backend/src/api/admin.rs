use axum::{
    extract::{State},
    routing::{get, post},
    Json, Router, Extension,
};
use serde::{Deserialize};
use sqlx::PgPool;
use crate::middleware::auth::AuthContext;
use crate::models::AuditEntry;
use crate::db::audit::AuditWriter;

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/dashboard", get(get_dashboard))
        .route("/audit", get(get_audit))
        .route("/users", get(get_users))
        .route("/officials/provision", post(provision_official))
        .route("/sectors", get(get_sectors))
        .route("/citizens", get(get_citizens))
        .with_state(pool)
}

#[derive(Deserialize)]
pub struct ProvisionRequest {
    pub email: String,
    pub full_name: String,
    pub role: String,
    pub sector: String,
}

async fn provision_official(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
    Json(payload): Json<ProvisionRequest>,
) -> Json<serde_json::Value> {
    if auth.user.role != "SYSTEM_ADMIN" {
        return Json(serde_json::json!({ "success": false, "error": "Only System Admin can provision officials" }));
    }

    // Validate work email domain
    if !payload.email.ends_with(".civiccore.demo") {
        return Json(serde_json::json!({ "success": false, "error": "Only work emails (@*.civiccore.demo) are allowed for officials" }));
    }

    // Generate a random temporary password
    let temp_password: String = (0..12)
        .map(|_| rand::Rng::sample(&mut rand::thread_rng(), rand::distributions::Alphanumeric) as char)
        .collect();

    // Hash the temporary password
    use argon2::{password_hash::SaltString, Argon2, PasswordHasher};
    let salt = SaltString::generate(&mut rand::thread_rng());
    let password_hash = Argon2::default()
        .hash_password(temp_password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .unwrap_or_default();

    let res = sqlx::query(
        "INSERT INTO core.users (email, password_hash, role, full_name, sector, status, provisioned_by)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6)"
    )
    .bind(&payload.email)
    .bind(&password_hash)
    .bind(&payload.role)
    .bind(&payload.full_name)
    .bind(&payload.sector)
    .bind(auth.user.id)
    .execute(&pool)
    .await;

    match res {
        Ok(_) => {
            let _ = AuditWriter::log(
                &pool,
                None,
                Some(auth.user.id),
                &auth.user.role,
                auth.user.sector.as_deref(),
                "OFFICIAL_PROVISIONED",
                Some("ADMIN"),
                "SUCCESS",
                Some(serde_json::json!({ "provisioned_email": payload.email, "role": payload.role })),
            ).await;
            Json(serde_json::json!({ "success": true, "temp_password": temp_password }))
        }
        Err(e) => {
            tracing::error!("Failed to provision official: {:?}", e);
            Json(serde_json::json!({ "success": false, "error": "Email already registered or database error" }))
        }
    }
}

async fn get_citizens(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
) -> Json<serde_json::Value> {
    if auth.user.role != "SYSTEM_ADMIN" {
        return Json(serde_json::json!({ "success": false, "error": "Unauthorized" }));
    }

    let citizens = sqlx::query(
        "SELECT citizen_id, full_name, sex, year_of_birth, district_of_birth,
                nationality, status, registered_at
         FROM core.citizens
         ORDER BY registered_at DESC
         LIMIT 200"
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let list: Vec<serde_json::Value> = citizens.iter().map(|row| {
        use sqlx::Row;
        serde_json::json!({
            "citizen_id":       row.get::<String, _>("citizen_id"),
            "full_name":        row.get::<String, _>("full_name"),
            "sex":              row.get::<String, _>("sex"),
            "year_of_birth":    row.get::<i16, _>("year_of_birth"),
            "district":         row.get::<String, _>("district_of_birth"),
            "nationality":      row.get::<String, _>("nationality"),
            "status":           row.get::<String, _>("status"),
            "registered_at":    row.get::<chrono::DateTime<chrono::Utc>, _>("registered_at"),
        })
    }).collect();

    Json(serde_json::json!({ "success": true, "data": list }))
}

async fn get_dashboard(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
) -> Json<serde_json::Value> {
    if auth.user.role != "SYSTEM_ADMIN" {
        return Json(serde_json::json!({ "success": false, "error": "Unauthorized" }));
    }

    let citizen_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM core.citizens")
        .fetch_one(&pool).await.unwrap_or((0,));
    
    let active_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM core.citizens WHERE status = 'ACTIVE'"
    ).fetch_one(&pool).await.unwrap_or((0,));
    
    let deceased_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM core.citizens WHERE status = 'DECEASED'"
    ).fetch_one(&pool).await.unwrap_or((0,));

    let edu_today: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM education.records WHERE recorded_at >= CURRENT_DATE"
    ).fetch_one(&pool).await.unwrap_or((0,));

    let rev_today: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM revenue.records WHERE registered_at >= CURRENT_DATE"
    ).fetch_one(&pool).await.unwrap_or((0,));

    let labour_today: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM labour.records WHERE recorded_at >= CURRENT_DATE"
    ).fetch_one(&pool).await.unwrap_or((0,));

    let queries_today: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM audit.log WHERE action = 'BORDER_CLEARANCE_QUERIED' AND created_at >= CURRENT_DATE"
    ).fetch_one(&pool).await.unwrap_or((0,));

    let security_events_today: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM audit.log WHERE outcome IN ('BLOCKED', 'SECURITY_ALERT') AND created_at >= CURRENT_DATE"
    ).fetch_one(&pool).await.unwrap_or((0,));

    Json(serde_json::json!({
        "success": true,
        "data": {
            "total_citizens": citizen_count.0,
            "active_citizens": active_count.0,
            "deceased_citizens": deceased_count.0,
            "records_today": {
                "education": edu_today.0,
                "revenue": rev_today.0,
                "labour": labour_today.0
            },
            "queries_today": queries_today.0,
            "security_events_today": security_events_today.0
        }
    }))
}

async fn get_audit(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
) -> Json<serde_json::Value> {
    if auth.user.role != "SYSTEM_ADMIN" {
        return Json(serde_json::json!({ "success": false, "error": "Unauthorized" }));
    }

    let entries = sqlx::query_as::<_, AuditEntry>(
        "SELECT id, event_id, citizen_id, actor_user_id, actor_role, actor_sector,
                action, sector_accessed, outcome, details, created_at
         FROM audit.log ORDER BY created_at DESC LIMIT 200"
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    Json(serde_json::json!({
        "success": true,
        "data": entries
    }))
}

async fn get_users(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
) -> Json<serde_json::Value> {
    if auth.user.role != "SYSTEM_ADMIN" {
        return Json(serde_json::json!({ "success": false, "error": "Unauthorized" }));
    }

    let users = sqlx::query(
        "SELECT id, email, role, full_name, sector, is_active, last_login_at, created_at 
         FROM core.users ORDER BY created_at ASC"
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let user_list: Vec<serde_json::Value> = users.iter().map(|row| {
        use sqlx::Row;
        serde_json::json!({
            "id": row.get::<uuid::Uuid, _>("id"),
            "email": row.get::<String, _>("email"),
            "role": row.get::<String, _>("role"),
            "full_name": row.get::<String, _>("full_name"),
            "sector": row.get::<Option<String>, _>("sector"),
            "is_active": row.get::<bool, _>("is_active"),
            "last_login_at": row.get::<Option<chrono::DateTime<chrono::Utc>>, _>("last_login_at"),
        })
    }).collect();

    Json(serde_json::json!({ "success": true, "data": user_list }))
}

async fn get_sectors(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
) -> Json<serde_json::Value> {
    if auth.user.role != "SYSTEM_ADMIN" {
        return Json(serde_json::json!({ "success": false, "error": "Unauthorized" }));
    }

    let edu_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM education.records")
        .fetch_one(&pool).await.unwrap_or((0,));
    let edu_last: Option<(chrono::DateTime<chrono::Utc>,)> = sqlx::query_as(
        "SELECT recorded_at FROM education.records ORDER BY recorded_at DESC LIMIT 1"
    ).fetch_optional(&pool).await.unwrap_or(None);

    let rev_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM revenue.records")
        .fetch_one(&pool).await.unwrap_or((0,));
    let rev_last: Option<(chrono::DateTime<chrono::Utc>,)> = sqlx::query_as(
        "SELECT registered_at FROM revenue.records ORDER BY registered_at DESC LIMIT 1"
    ).fetch_optional(&pool).await.unwrap_or(None);

    let lab_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM labour.records")
        .fetch_one(&pool).await.unwrap_or((0,));
    let lab_last: Option<(chrono::DateTime<chrono::Utc>,)> = sqlx::query_as(
        "SELECT recorded_at FROM labour.records ORDER BY recorded_at DESC LIMIT 1"
    ).fetch_optional(&pool).await.unwrap_or(None);

    Json(serde_json::json!({
        "success": true,
        "data": [
            { "name": "Civil Registry", "record_count": 0, "last_write": null, "key_status": "ACTIVE" },
            { "name": "Education Authority", "record_count": edu_count.0, "last_write": edu_last.map(|(t,)| t), "key_status": "ACTIVE" },
            { "name": "Revenue Service", "record_count": rev_count.0, "last_write": rev_last.map(|(t,)| t), "key_status": "ACTIVE" },
            { "name": "Labour Authority", "record_count": lab_count.0, "last_write": lab_last.map(|(t,)| t), "key_status": "ACTIVE" },
            { "name": "Health Service (Mock)", "record_count": 0, "last_write": null, "key_status": "ACTIVE" }
        ]
    }))
}
