use axum::{
    extract::{State, Path},
    routing::{post, patch, get},
    Json, Router, Extension,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use crate::middleware::auth::AuthContext;
use crate::db::audit::AuditWriter;
use chrono::NaiveDate;

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/register", post(register))
        .route("/stats", get(get_stats))
        .route("/search", get(search_records))
        .route("/:id/close", patch(close_employment))
        .route("/:citizen_id", get(get_records))
        .with_state(pool)
}

#[derive(Deserialize)]
pub struct SearchQuery {
    pub query: Option<String>,
}

async fn get_stats(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
) -> Json<LabourResponse> {
    if auth.user.role != "LABOUR_OFFICER" && auth.user.role != "SYSTEM_ADMIN" {
        return Json(LabourResponse { success: false, data: None, error: Some("Unauthorized".into()) });
    }

    let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM labour.records")
        .fetch_one(&pool).await.unwrap_or((0,));
    
    let active: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM labour.records WHERE status = 'ACTIVE'")
        .fetch_one(&pool).await.unwrap_or((0,));

    let today: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM labour.records WHERE recorded_at >= CURRENT_DATE")
        .fetch_one(&pool).await.unwrap_or((0,));

    Json(LabourResponse {
        success: true,
        data: Some(serde_json::json!({
            "total_records": total.0,
            "active_employment": active.0,
            "recorded_today": today.0
        })),
        error: None,
    })
}

async fn search_records(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
    axum::extract::Query(params): axum::extract::Query<SearchQuery>,
) -> Json<LabourResponse> {
    if auth.user.role != "LABOUR_OFFICER" && auth.user.role != "SYSTEM_ADMIN" {
        return Json(LabourResponse { success: false, data: None, error: Some("Unauthorized".into()) });
    }

    let query = params.query.unwrap_or_default().trim().to_string();
    if query.is_empty() {
        return Json(LabourResponse { success: true, data: Some(serde_json::json!([])), error: None });
    }

    let search_pattern = format!("%{}%", query);

    let records = sqlx::query(
        "SELECT r.*, c.full_name 
         FROM labour.records r
         JOIN core.citizens c ON r.citizen_id = c.citizen_id
         WHERE r.citizen_id ILIKE $1 OR c.full_name ILIKE $1 OR r.employer_name ILIKE $1
         ORDER BY r.recorded_at DESC LIMIT 50"
    )
    .bind(&search_pattern)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let list: Vec<serde_json::Value> = records.iter().map(|row| {
        use sqlx::Row;
        serde_json::json!({
            "id": row.get::<uuid::Uuid, _>("id"),
            "citizen_id": row.get::<String, _>("citizen_id"),
            "full_name": row.get::<String, _>("full_name"),
            "employer_name": row.get::<String, _>("employer_name"),
            "job_title": row.get::<String, _>("job_title"),
            "status": row.get::<String, _>("status"),
            "start_date": row.get::<NaiveDate, _>("start_date"),
            "recorded_at": row.get::<chrono::DateTime<chrono::Utc>, _>("recorded_at"),
        })
    }).collect();

    Json(LabourResponse { success: true, data: Some(serde_json::json!(list)), error: None })
}

#[derive(Deserialize)]
pub struct RegisterEmploymentRequest {
    pub citizen_id: String,
    pub employer_name: String,
    pub employer_tin: Option<String>,
    pub job_title: String,
    pub employment_type: String,
    pub start_date: NaiveDate,
    pub nssf_number: Option<String>,
}

#[derive(Deserialize)]
pub struct CloseEmploymentRequest {
    pub end_date: NaiveDate,
    pub reason_for_closure: Option<String>,
}

#[derive(Serialize)]
pub struct LabourResponse {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}

async fn register(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
    Json(payload): Json<RegisterEmploymentRequest>,
) -> Json<LabourResponse> {
    if auth.user.role != "LABOUR_OFFICER" && auth.user.role != "SYSTEM_ADMIN" {
        return Json(LabourResponse { success: false, data: None, error: Some("Unauthorized role".into()) });
    }

    let nssf_status = if payload.nssf_number.is_some() { "ACTIVE" } else { "INACTIVE" };

    let res = sqlx::query(
        "INSERT INTO labour.records (citizen_id, employer_name, employer_tin, job_title, employment_type, start_date, nssf_number, nssf_status, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"
    )
    .bind(&payload.citizen_id)
    .bind(&payload.employer_name)
    .bind(&payload.employer_tin)
    .bind(&payload.job_title)
    .bind(&payload.employment_type)
    .bind(payload.start_date)
    .bind(&payload.nssf_number)
    .bind(nssf_status)
    .bind(auth.user.id)
    .execute(&pool)
    .await;

    if res.is_err() {
        return Json(LabourResponse { success: false, data: None, error: Some("Failed to register employment".into()) });
    }

    let _ = AuditWriter::log(
        &pool,
        Some(&payload.citizen_id),
        Some(auth.user.id),
        &auth.user.role,
        auth.user.sector.as_deref(),
        "EMPLOYMENT_REGISTERED",
        Some("LABOUR"),
        "SUCCESS",
        None,
    ).await;

    Json(LabourResponse { success: true, data: None, error: None })
}

async fn close_employment(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
    Path(id): Path<uuid::Uuid>,
    Json(payload): Json<CloseEmploymentRequest>,
) -> Json<LabourResponse> {
    if auth.user.role != "LABOUR_OFFICER" && auth.user.role != "SYSTEM_ADMIN" {
        return Json(LabourResponse { success: false, data: None, error: Some("Unauthorized role".into()) });
    }

    // Get citizen_id for auditing
    let row: (String,) = match sqlx::query_as("SELECT citizen_id FROM labour.records WHERE id = $1")
        .bind(id)
        .fetch_one(&pool)
        .await {
            Ok(row) => row,
            Err(_) => return Json(LabourResponse { success: false, data: None, error: Some("Record not found".into()) }),
        };

    let res = sqlx::query(
        "UPDATE labour.records SET status = 'CLOSED', end_date = $1, closed_by = $2, closed_at = NOW(), closure_reason = $3, nssf_status = 'INACTIVE'
         WHERE id = $4"
    )
    .bind(payload.end_date)
    .bind(auth.user.id)
    .bind(payload.reason_for_closure)
    .bind(id)
    .execute(&pool)
    .await;

    if res.is_err() {
        return Json(LabourResponse { success: false, data: None, error: Some("Failed to close employment".into()) });
    }

    let _ = AuditWriter::log(
        &pool,
        Some(&row.0),
        Some(auth.user.id),
        &auth.user.role,
        auth.user.sector.as_deref(),
        "EMPLOYMENT_CLOSED",
        Some("LABOUR"),
        "SUCCESS",
        None,
    ).await;

    Json(LabourResponse { success: true, data: None, error: None })
}

async fn get_records(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
    Path(citizen_id): Path<String>,
) -> Json<LabourResponse> {
    if auth.user.role != "LABOUR_OFFICER" && auth.user.role != "SYSTEM_ADMIN" && (auth.user.role != "CITIZEN" || auth.user.citizen_id.as_deref() != Some(&citizen_id)) {
        return Json(LabourResponse { success: false, data: None, error: Some("Unauthorized role".into()) });
    }

    let records = sqlx::query(
        "SELECT * FROM labour.records WHERE citizen_id = $1 ORDER BY start_date DESC"
    )
    .bind(&citizen_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let list: Vec<serde_json::Value> = records.iter().map(|row| {
        use sqlx::Row;
        serde_json::json!({
            "id": row.get::<uuid::Uuid, _>("id"),
            "employer_name": row.get::<String, _>("employer_name"),
            "job_title": row.get::<String, _>("job_title"),
            "employment_type": row.get::<String, _>("employment_type"),
            "start_date": row.get::<NaiveDate, _>("start_date"),
            "end_date": row.get::<Option<NaiveDate>, _>("end_date"),
            "status": row.get::<String, _>("status"),
            "nssf_number": row.get::<Option<String>, _>("nssf_number"),
            "nssf_status": row.get::<String, _>("nssf_status"),
        })
    }).collect();

    Json(LabourResponse { success: true, data: Some(serde_json::json!(list)), error: None })
}
