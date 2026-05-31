use axum::{
    extract::{State, Path},
    routing::{post, get, patch},
    Json, Router, Extension,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use crate::middleware::auth::AuthContext;
use crate::db::audit::AuditWriter;

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/", get(list_disputes))
        .route("/submit", post(submit_dispute))
        .route("/:id/resolve", patch(resolve_dispute))
        .with_state(pool)
}

#[derive(Deserialize)]
pub struct DisputeRequest {
    pub citizen_id: String,
    pub dispute_type: String,
    pub description: String,
    pub supporting_info: Option<String>,
}

#[derive(Serialize)]
pub struct DisputeResponse {
    pub success: bool,
    pub dispute_id: Option<String>,
    pub error: Option<String>,
}

async fn submit_dispute(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
    Json(payload): Json<DisputeRequest>,
) -> Json<DisputeResponse> {
    // Only citizens can submit disputes for their own record
    if auth.user.role != "CITIZEN" ||
       auth.user.citizen_id.as_deref() != Some(&payload.citizen_id) {
        return Json(DisputeResponse {
            success: false,
            dispute_id: None,
            error: Some("Unauthorized — you can only raise disputes for your own record".into()),
        });
    }

    let result = sqlx::query_as::<_, (uuid::Uuid,)>(
        "INSERT INTO core.disputes (citizen_id, dispute_type, description, supporting_info)
         VALUES ($1, $2, $3, $4) RETURNING id"
    )
    .bind(&payload.citizen_id)
    .bind(&payload.dispute_type)
    .bind(&payload.description)
    .bind(&payload.supporting_info)
    .fetch_one(&pool)
    .await;

    match result {
        Ok((dispute_id,)) => {
            let _ = AuditWriter::log(
                &pool,
                Some(&payload.citizen_id),
                Some(auth.user.id),
                &auth.user.role,
                auth.user.sector.as_deref(),
                "DISPUTE_RAISED",
                Some("CORE"),
                "SUCCESS",
                Some(serde_json::json!({
                    "dispute_id": dispute_id,
                    "dispute_type": payload.dispute_type
                })),
            ).await;

            Json(DisputeResponse {
                success: true,
                dispute_id: Some(dispute_id.to_string()),
                error: None,
            })
        }
        Err(e) => {
            tracing::error!("Failed to insert dispute: {:?}", e);
            Json(DisputeResponse {
                success: false,
                dispute_id: None,
                error: Some("Failed to submit dispute".into()),
            })
        }
    }
}

#[derive(Serialize)]
pub struct DisputeListResponse {
    pub success: bool,
    pub disputes: Vec<serde_json::Value>,
    pub error: Option<String>,
}

async fn list_disputes(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
) -> Json<DisputeListResponse> {
    if auth.user.role != "SYSTEM_ADMIN" {
        return Json(DisputeListResponse { success: false, disputes: vec![], error: Some("Unauthorized".into()) });
    }

    let rows = sqlx::query(
        "SELECT id, citizen_id, dispute_type, description, status, created_at, resolved_at, resolution_notes
         FROM core.disputes
         ORDER BY created_at DESC"
    )
    .fetch_all(&pool)
    .await;

    match rows {
        Ok(disputes) => {
            let list = disputes.into_iter().map(|r| {
                use sqlx::Row;
                serde_json::json!({
                    "id": r.get::<uuid::Uuid, _>("id"),
                    "citizen_id": r.get::<String, _>("citizen_id"),
                    "dispute_type": r.get::<String, _>("dispute_type"),
                    "description": r.get::<String, _>("description"),
                    "status": r.get::<String, _>("status"),
                    "created_at": r.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
                    "resolved_at": r.get::<Option<chrono::DateTime<chrono::Utc>>, _>("resolved_at"),
                    "resolution_notes": r.get::<Option<String>, _>("resolution_notes"),
                })
            }).collect();
            Json(DisputeListResponse { success: true, disputes: list, error: None })
        }
        Err(e) => {
            tracing::error!("Failed to fetch disputes: {:?}", e);
            Json(DisputeListResponse { success: false, disputes: vec![], error: Some("Database error".into()) })
        }
    }
}

#[derive(Deserialize)]
pub struct ResolveDisputeRequest {
    pub status: String,
    pub resolution_notes: String,
}

async fn resolve_dispute(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
    Path(dispute_id): Path<uuid::Uuid>,
    Json(payload): Json<ResolveDisputeRequest>,
) -> Json<DisputeResponse> {
    if auth.user.role != "SYSTEM_ADMIN" {
        return Json(DisputeResponse { success: false, dispute_id: None, error: Some("Unauthorized".into()) });
    }

    let res = sqlx::query(
        "UPDATE core.disputes SET status = $1, resolution_notes = $2, resolved_at = NOW()
         WHERE id = $3"
    )
    .bind(&payload.status)
    .bind(&payload.resolution_notes)
    .bind(dispute_id)
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
                "DISPUTE_RESOLVED",
                Some("CORE"),
                "SUCCESS",
                Some(serde_json::json!({ "dispute_id": dispute_id, "status": payload.status })),
            ).await;

            Json(DisputeResponse { success: true, dispute_id: Some(dispute_id.to_string()), error: None })
        }
        Err(e) => {
            tracing::error!("Failed to resolve dispute: {:?}", e);
            Json(DisputeResponse { success: false, dispute_id: None, error: Some("Database error".into()) })
        }
    }
}
