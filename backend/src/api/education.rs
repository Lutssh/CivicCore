use axum::{
    extract::{State, Path},
    routing::{post, get},
    Json, Router, Extension,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use crate::middleware::auth::AuthContext;
use crate::db::audit::AuditWriter;
use chrono::NaiveDate;

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/enroll", post(enroll))
        .route("/stats", get(get_stats))
        .route("/search", get(search_students))
        .route("/results", post(record_results))
        .route("/enrollments/:id/complete", post(complete_enrollment))
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
) -> Json<EducationResponse> {
    if auth.user.role != "EDUCATION_OFFICER" && auth.user.role != "SYSTEM_ADMIN" {
        return Json(EducationResponse { success: false, data: None, error: Some("Unauthorized".into()) });
    }

    let total: (i64,) = sqlx::query_as("SELECT COUNT(DISTINCT citizen_id) FROM education.records")
        .fetch_one(&pool).await.unwrap_or((0,));
    
    let results: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM education.examination_results")
        .fetch_one(&pool).await.unwrap_or((0,));

    let today: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM education.records WHERE recorded_at >= CURRENT_DATE")
        .fetch_one(&pool).await.unwrap_or((0,));

    Json(EducationResponse {
        success: true,
        data: Some(serde_json::json!({
            "total_students": total.0,
            "results_recorded": results.0,
            "recorded_today": today.0
        })),
        error: None,
    })
}

async fn search_students(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
    axum::extract::Query(params): axum::extract::Query<SearchQuery>,
) -> Json<EducationResponse> {
    if auth.user.role != "EDUCATION_OFFICER" && auth.user.role != "SYSTEM_ADMIN" {
        return Json(EducationResponse { success: false, data: None, error: Some("Unauthorized".into()) });
    }

    let query = params.query.unwrap_or_default().trim().to_string();
    if query.is_empty() {
        return Json(EducationResponse { success: true, data: Some(serde_json::json!([])), error: None });
    }

    let search_pattern = format!("%{}%", query);

    // Return unique citizens with their latest enrollment
    let records = sqlx::query(
        "SELECT DISTINCT ON (r.citizen_id)
                r.*, c.full_name 
         FROM education.records r
         JOIN core.citizens c ON r.citizen_id = c.citizen_id
         WHERE r.citizen_id ILIKE $1 OR c.full_name ILIKE $1 OR r.institution_name ILIKE $1
         ORDER BY r.citizen_id, r.enrollment_date DESC"
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
            "institution_name": row.get::<String, _>("institution_name"),
            "institution_type": row.get::<String, _>("institution_type"),
            "status": row.get::<String, _>("status"),
            "enrollment_date": row.get::<NaiveDate, _>("enrollment_date"),
            "completion_date": row.get::<Option<NaiveDate>, _>("completion_date"),
        })
    }).collect();

    Json(EducationResponse { success: true, data: Some(serde_json::json!(list)), error: None })
}

#[derive(Deserialize)]
pub struct EnrollRequest {
    pub citizen_id: String,
    pub institution_name: String,
    pub institution_type: String,
    pub enrollment_date: NaiveDate,
}

#[derive(Deserialize)]
pub struct CompleteRequest {
    pub completion_date: NaiveDate,
    pub status: String, // COMPLETED, DROPPED_OUT, etc.
}

#[derive(Deserialize)]
pub struct ResultRequest {
    pub citizen_id: String,
    pub exam_type: String,
    pub year_of_exam: i16,
    pub grade: String,
    pub institution: Option<String>,
}

#[derive(Serialize)]
pub struct EducationResponse {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}

async fn enroll(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
    Json(payload): Json<EnrollRequest>,
) -> Json<EducationResponse> {
    if auth.user.role != "EDUCATION_OFFICER" && auth.user.role != "SYSTEM_ADMIN" {
        return Json(EducationResponse { success: false, data: None, error: Some("Unauthorized role".into()) });
    }

    let res = sqlx::query(
        "INSERT INTO education.records (citizen_id, institution_name, institution_type, enrollment_date, recorded_by)
         VALUES ($1, $2, $3, $4, $5)"
    )
    .bind(&payload.citizen_id)
    .bind(&payload.institution_name)
    .bind(&payload.institution_type)
    .bind(payload.enrollment_date)
    .bind(auth.user.id)
    .execute(&pool)
    .await;

    if res.is_err() {
        return Json(EducationResponse { success: false, data: None, error: Some("Failed to record enrollment".into()) });
    }

    let _ = AuditWriter::log(
        &pool,
        Some(&payload.citizen_id),
        Some(auth.user.id),
        &auth.user.role,
        auth.user.sector.as_deref(),
        "EDUCATION_RECORD_WRITTEN",
        Some("EDUCATION"),
        "SUCCESS",
        None,
    ).await;

    Json(EducationResponse { success: true, data: None, error: None })
}

async fn complete_enrollment(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
    Path(id): Path<uuid::Uuid>,
    Json(payload): Json<CompleteRequest>,
) -> Json<EducationResponse> {
    if auth.user.role != "EDUCATION_OFFICER" && auth.user.role != "SYSTEM_ADMIN" {
        return Json(EducationResponse { success: false, data: None, error: Some("Unauthorized role".into()) });
    }

    let res = sqlx::query(
        "UPDATE education.records SET status = $1, completion_date = $2 WHERE id = $3"
    )
    .bind(&payload.status)
    .bind(payload.completion_date)
    .bind(id)
    .execute(&pool)
    .await;

    if let Err(e) = res {
        return Json(EducationResponse { success: false, data: None, error: Some(format!("Failed to update enrollment: {}", e)) });
    }

    Json(EducationResponse { success: true, data: None, error: None })
}

async fn record_results(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
    Json(payload): Json<ResultRequest>,
) -> Json<EducationResponse> {
    if auth.user.role != "EDUCATION_OFFICER" && auth.user.role != "SYSTEM_ADMIN" {
        return Json(EducationResponse { success: false, data: None, error: Some("Unauthorized role".into()) });
    }

    let res = sqlx::query(
        "INSERT INTO education.examination_results (citizen_id, exam_type, year_of_exam, grade, institution, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6)"
    )
    .bind(&payload.citizen_id)
    .bind(&payload.exam_type)
    .bind(payload.year_of_exam)
    .bind(&payload.grade)
    .bind(&payload.institution)
    .bind(auth.user.id)
    .execute(&pool)
    .await;

    if res.is_err() {
        return Json(EducationResponse { success: false, data: None, error: Some("Failed to record exam result".into()) });
    }

    let _ = AuditWriter::log(
        &pool,
        Some(&payload.citizen_id),
        Some(auth.user.id),
        &auth.user.role,
        auth.user.sector.as_deref(),
        "EXAMINATION_RESULT_WRITTEN",
        Some("EDUCATION"),
        "SUCCESS",
        None,
    ).await;

    Json(EducationResponse { success: true, data: None, error: None })
}

async fn get_records(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
    Path(citizen_id): Path<String>,
) -> Json<EducationResponse> {
    if auth.user.role != "EDUCATION_OFFICER" && auth.user.role != "SYSTEM_ADMIN" && (auth.user.role != "CITIZEN" || auth.user.citizen_id.as_deref() != Some(&citizen_id)) {
        return Json(EducationResponse { success: false, data: None, error: Some("Unauthorized role".into()) });
    }

    let enrollments = sqlx::query_as::<_, crate::models::EducationRecord>(
        "SELECT * FROM education.records WHERE citizen_id = $1 ORDER BY enrollment_date DESC"
    )
    .bind(&citizen_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let results = sqlx::query_as::<_, crate::models::ExamResult>(
        "SELECT * FROM education.examination_results WHERE citizen_id = $1 ORDER BY year_of_exam DESC"
    )
    .bind(&citizen_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    Json(EducationResponse {
        success: true,
        data: Some(serde_json::json!({
            "enrollments": enrollments,
            "results": results
        })),
        error: None,
    })
}
