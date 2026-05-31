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
        .route("/:citizen_id/compliance", patch(update_compliance))
        .route("/:citizen_id", get(get_record))
        .with_state(pool)
}

#[derive(Deserialize)]
pub struct SearchQuery {
    pub query: Option<String>,
}

async fn get_stats(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
) -> Json<RevenueResponse> {
    if auth.user.role != "REVENUE_OFFICER" && auth.user.role != "SYSTEM_ADMIN" {
        return Json(RevenueResponse { success: false, data: None, error: Some("Unauthorized".into()) });
    }

    let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM revenue.records")
        .fetch_one(&pool).await.unwrap_or((0,));
    
    let compliant: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM revenue.records WHERE compliance_status = 'COMPLIANT'")
        .fetch_one(&pool).await.unwrap_or((0,));

    let today: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM revenue.records WHERE registered_at >= CURRENT_DATE")
        .fetch_one(&pool).await.unwrap_or((0,));

    Json(RevenueResponse {
        success: true,
        data: Some(serde_json::json!({
            "total_taxpayers": total.0,
            "compliant_taxpayers": compliant.0,
            "registrations_today": today.0
        })),
        error: None,
    })
}

async fn search_records(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
    axum::extract::Query(params): axum::extract::Query<SearchQuery>,
) -> Json<RevenueResponse> {
    if auth.user.role != "REVENUE_OFFICER" && auth.user.role != "SYSTEM_ADMIN" {
        return Json(RevenueResponse { success: false, data: None, error: Some("Unauthorized".into()) });
    }

    let query = params.query.unwrap_or_default().trim().to_string();
    if query.is_empty() {
        return Json(RevenueResponse { success: true, data: Some(serde_json::json!([])), error: None });
    }

    let search_pattern = format!("%{}%", query);

    let records = sqlx::query(
        "SELECT r.*, c.full_name 
         FROM revenue.records r
         JOIN core.citizens c ON r.citizen_id = c.citizen_id
         WHERE r.citizen_id ILIKE $1 OR c.full_name ILIKE $1 OR r.tax_id ILIKE $1
         ORDER BY r.registered_at DESC LIMIT 50"
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
            "tax_id": row.get::<String, _>("tax_id"),
            "taxpayer_category": row.get::<String, _>("taxpayer_category"),
            "compliance_status": row.get::<String, _>("compliance_status"),
            "registration_date": row.get::<NaiveDate, _>("registration_date"),
        })
    }).collect();

    Json(RevenueResponse { success: true, data: Some(serde_json::json!(list)), error: None })
}

#[derive(Deserialize)]
pub struct RegisterTaxpayerRequest {
    pub citizen_id: String,
    pub taxpayer_category: String,
    pub registration_date: Option<NaiveDate>,
}

#[derive(Deserialize)]
pub struct UpdateComplianceRequest {
    pub compliance_status: String,
    pub last_filing_period: Option<String>,
}

#[derive(Serialize)]
pub struct RevenueResponse {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}

async fn register(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
    Json(payload): Json<RegisterTaxpayerRequest>,
) -> Json<RevenueResponse> {
    if auth.user.role != "REVENUE_OFFICER" && auth.user.role != "SYSTEM_ADMIN" {
        return Json(RevenueResponse { success: false, data: None, error: Some("Unauthorized role".into()) });
    }

    // Generate TIN: KV-TAX-YYYYNNNNNN
    let year = chrono::Utc::now().format("%Y").to_string();
    let row: (i64,) = match sqlx::query_as("SELECT nextval('revenue.tin_seq')")
        .fetch_one(&pool)
        .await {
            Ok(row) => row,
            Err(e) => {
                tracing::error!("Failed to generate TIN: {:?}", e);
                return Json(RevenueResponse { success: false, data: None, error: Some("Failed to generate TIN".into()) });
            }
        };
    let tin = format!("KV-TAX-{}{:06}", year, row.0);

    let res = sqlx::query(
        "INSERT INTO revenue.records (citizen_id, tax_id, taxpayer_category, registration_date, registered_by)
         VALUES ($1, $2, $3, $4, $5)"
    )
    .bind(&payload.citizen_id)
    .bind(&tin)
    .bind(&payload.taxpayer_category)
    .bind(payload.registration_date.unwrap_or_else(|| chrono::Utc::now().date_naive()))
    .bind(auth.user.id)
    .execute(&pool)
    .await;

    if res.is_err() {
        return Json(RevenueResponse { success: false, data: None, error: Some("Failed to register taxpayer".into()) });
    }

    let _ = AuditWriter::log(
        &pool,
        Some(&payload.citizen_id),
        Some(auth.user.id),
        &auth.user.role,
        auth.user.sector.as_deref(),
        "TAX_RECORD_CREATED",
        Some("REVENUE"),
        "SUCCESS",
        None,
    ).await;

    Json(RevenueResponse { success: true, data: Some(serde_json::json!({ "tax_id": tin })), error: None })
}

async fn update_compliance(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
    Path(citizen_id): Path<String>,
    Json(payload): Json<UpdateComplianceRequest>,
) -> Json<RevenueResponse> {
    if auth.user.role != "REVENUE_OFFICER" && auth.user.role != "SYSTEM_ADMIN" {
        return Json(RevenueResponse { success: false, data: None, error: Some("Unauthorized role".into()) });
    }

    let res = sqlx::query(
        "UPDATE revenue.records SET compliance_status = $1, last_filing_period = $2, last_filing_date = NOW(), updated_at = NOW(), updated_by = $3
         WHERE citizen_id = $4"
    )
    .bind(&payload.compliance_status)
    .bind(&payload.last_filing_period)
    .bind(auth.user.id)
    .bind(&citizen_id)
    .execute(&pool)
    .await;

    if res.is_err() {
        return Json(RevenueResponse { success: false, data: None, error: Some("Failed to update compliance".into()) });
    }

    let _ = AuditWriter::log(
        &pool,
        Some(&citizen_id),
        Some(auth.user.id),
        &auth.user.role,
        auth.user.sector.as_deref(),
        "TAX_COMPLIANCE_UPDATED",
        Some("REVENUE"),
        "SUCCESS",
        None,
    ).await;

    Json(RevenueResponse { success: true, data: None, error: None })
}

async fn get_record(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
    Path(citizen_id): Path<String>,
) -> Json<RevenueResponse> {
    if auth.user.role != "REVENUE_OFFICER" && auth.user.role != "SYSTEM_ADMIN" && (auth.user.role != "CITIZEN" || auth.user.citizen_id.as_deref() != Some(&citizen_id)) {
        return Json(RevenueResponse { success: false, data: None, error: Some("Unauthorized role".into()) });
    }

    let record = sqlx::query(
        "SELECT r.*, c.full_name 
         FROM revenue.records r
         JOIN core.citizens c ON r.citizen_id = c.citizen_id
         WHERE r.citizen_id = $1"
    )
    .bind(&citizen_id)
    .fetch_optional(&pool)
    .await;

    match record {
        Ok(Some(row)) => {
            use sqlx::Row;
            Json(RevenueResponse {
                success: true,
                data: Some(serde_json::json!({
                    "id": row.get::<uuid::Uuid, _>("id"),
                    "citizen_id": row.get::<String, _>("citizen_id"),
                    "full_name": row.get::<String, _>("full_name"),
                    "tax_id": row.get::<String, _>("tax_id"),
                    "taxpayer_category": row.get::<String, _>("taxpayer_category"),
                    "compliance_status": row.get::<String, _>("compliance_status"),
                    "registration_date": row.get::<NaiveDate, _>("registration_date"),
                    "last_filing_date": row.get::<Option<NaiveDate>, _>("last_filing_date"),
                    "last_filing_period": row.get::<Option<String>, _>("last_filing_period"),
                })),
                error: None,
            })
        }
        Ok(None) => Json(RevenueResponse { success: false, data: None, error: Some("Record not found".into()) }),
        Err(e) => {
            tracing::error!("Database error in get_record: {:?}", e);
            Json(RevenueResponse { success: false, data: None, error: Some("Database error".into()) })
        }
    }
}
