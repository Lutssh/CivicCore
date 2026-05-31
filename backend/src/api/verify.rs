use axum::{
    extract::{State},
    routing::{post, get},
    Json, Router, Extension,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use crate::middleware::auth::AuthContext;
use crate::db::audit::AuditWriter;
use crate::crypto::protocol::{send_query, InterSectorRequest};
use crate::models::Citizen;
use uuid::Uuid;
use chrono::Utc;

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/query", post(run_query))
        .route("/history", get(get_history))
        .route("/demo/health-mode", post(set_health_mode))
        .with_state(pool)
}

#[derive(Deserialize)]
pub struct QueryRequest {
    pub citizen_id: String,
    pub query_type: String,
    pub purpose: String,
    pub location: String,
}

#[derive(Serialize)]
pub struct QueryResponse {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<serde_json::Value>,
}

async fn run_query(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
    Json(payload): Json<QueryRequest>,
) -> Json<QueryResponse> {
    if auth.user.role != "BORDER_OFFICER" && auth.user.role != "SYSTEM_ADMIN" {
        return Json(QueryResponse { success: false, data: None, error: Some(serde_json::json!({ "code": "UNAUTHORIZED", "message": "Only Border Officers can run queries" })) });
    }

    let citizen = sqlx::query_as::<_, Citizen>(
        "SELECT * FROM core.citizens WHERE citizen_id = $1"
    )
    .bind(&payload.citizen_id)
    .fetch_optional(&pool)
    .await;

    let citizen = match citizen {
        Ok(Some(c)) => c,
        Ok(None) => return Json(QueryResponse { 
            success: false, 
            data: None, 
            error: Some(serde_json::json!({ "code": "NOT_FOUND", "message": "Citizen ID not found" })) 
        }),
        Err(_) => return Json(QueryResponse { 
            success: false, 
            data: None, 
            error: Some(serde_json::json!({ "code": "DB_ERROR", "message": "Database error" })) 
        }),
    };

    let request_id = Uuid::new_v4();
    let request = InterSectorRequest {
        request_id,
        citizen_id: payload.citizen_id.clone(),
        query_type: payload.query_type.clone(),
        requesting_authority: auth.user.sector.clone().unwrap_or_else(|| "UNKNOWN".to_string()),
        requesting_officer: auth.user.id,
        timestamp: Utc::now(),
        purpose: payload.purpose,
    };

    // Log query initiation
    let _ = AuditWriter::log(
        &pool,
        Some(&payload.citizen_id),
        Some(auth.user.id),
        &auth.user.role,
        auth.user.sector.as_deref(),
        "INTER_SECTOR_QUERY_SENT",
        Some("HEALTH"),
        "SUCCESS",
        Some(serde_json::json!({ "request_id": request_id, "type": payload.query_type })),
    ).await;

    // Send query to mock health service (assuming it's at localhost:3001)
    let target_url = "http://localhost:3001/query";
    let result = send_query("health", target_url, request).await;

    match result {
        Ok(resp) => {
            let _ = AuditWriter::log(
                &pool,
                Some(&payload.citizen_id),
                Some(auth.user.id),
                &auth.user.role,
                auth.user.sector.as_deref(),
                "INTER_SECTOR_RESPONSE_RECEIVED",
                Some("HEALTH"),
                "SUCCESS",
                Some(serde_json::json!({ "request_id": request_id, "clearance": resp.clearance })),
            ).await;

            Json(QueryResponse {
                success: true,
                data: Some(serde_json::json!({
                    "request_id": resp.request_id,
                    "citizen_id": resp.citizen_id,
                    "query_type": resp.query_type,
                    "citizen": {
                        "full_name": citizen.full_name,
                        "year_of_birth": citizen.year_of_birth,
                        "nationality": citizen.nationality,
                        "status": citizen.status,
                        "photo_url": citizen.photo_path
                    },
                    "clearance": resp.clearance,
                    "flags": resp.flags,
                    "responding_sector": resp.responding_sector,
                    "timestamp": resp.timestamp
                })),
                error: None,
            })
        }
        Err(e) => {
            let error_msg = e.to_string();
            let outcome = if error_msg.contains("signature") { "SECURITY_ALERT" } else { "FAILED" };
            let action = if error_msg.contains("signature") { "INTER_SECTOR_SIGNATURE_FAILED" } else { "FAILED" };

            let _ = AuditWriter::log(
                &pool,
                Some(&payload.citizen_id),
                Some(auth.user.id),
                &auth.user.role,
                auth.user.sector.as_deref(),
                action,
                Some("HEALTH"),
                outcome,
                Some(serde_json::json!({ "request_id": request_id, "error": error_msg })),
            ).await;

            Json(QueryResponse {
                success: false,
                data: None,
                error: Some(serde_json::json!({ "code": "CRYPTO_FAILURE", "message": error_msg })),
            })
        }
    }
}

async fn get_history(
    State(pool): State<PgPool>,
    Extension(_auth): Extension<AuthContext>,
) -> Json<QueryResponse> {
    let history = sqlx::query(
        "SELECT citizen_id, actor_role, actor_sector, action, outcome, details, created_at
         FROM audit.log 
         WHERE action IN ('INTER_SECTOR_QUERY_SENT', 'INTER_SECTOR_SIGNATURE_FAILED', 'BORDER_CLEARANCE_QUERIED')
         ORDER BY created_at DESC LIMIT 50"
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let history_list: Vec<serde_json::Value> = history.iter().map(|row| {
        use sqlx::Row;
        serde_json::json!({
            "citizen_id": row.get::<Option<String>, _>("citizen_id"),
            "actor_role": row.get::<String, _>("actor_role"),
            "action": row.get::<String, _>("action"),
            "outcome": row.get::<String, _>("outcome"),
            "details": row.get::<Option<serde_json::Value>, _>("details"),
            "created_at": row.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
        })
    }).collect();

    Json(QueryResponse { 
        success: true, 
        data: Some(serde_json::json!({ "history": history_list })), 
        error: None 
    })
}

async fn set_health_mode(
    Json(payload): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    let client = reqwest::Client::new();
    let mock_url = std::env::var("MOCK_HEALTH_URL").unwrap_or_else(|_| "http://localhost:3001".to_string());
    let result = client.post(format!("{}/demo/set-mode", mock_url))
        .json(&payload)
        .send()
        .await;

    match result {
        Ok(_) => Json(serde_json::json!({ "success": true })),
        Err(e) => Json(serde_json::json!({ "success": false, "error": e.to_string() })),
    }
}
