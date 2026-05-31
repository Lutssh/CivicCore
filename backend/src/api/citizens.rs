use axum::{
    extract::{State, Path},
    routing::{post, get},
    Json, Router, Extension,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use crate::crypto::citizen_id::{generate_citizen_id, Sex};
use crate::db::audit::AuditWriter;
use crate::middleware::auth::AuthContext;
use crate::models::{Citizen, EducationRecord, ExamResult, RevenueRecord, LabourRecord, AuditEntry};
use chrono::NaiveDate;
use sha2::{Digest, Sha256};

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/register", post(register))
        .route("/stats", get(get_stats))
        .route("/search", get(search_citizens))
        .route("/:citizen_id", get(get_citizen))
        .route("/:citizen_id/death", post(register_death))
        .route("/:citizen_id/audit", get(get_citizen_audit))
        .route("/validate-id", post(validate_id))
        .with_state(pool)
}

// Add this handler function anywhere in citizens.rs
async fn get_stats(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
) -> Json<CitizenResponse> {
    if auth.user.role != "CIVIL_REGISTRAR" && auth.user.role != "SYSTEM_ADMIN" {
        return Json(CitizenResponse {
            success: false,
            data: None,
            error: Some("Unauthorized".into()),
        });
    }

    let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM core.citizens")
        .fetch_one(&pool)
        .await
        .unwrap_or((0,));

    let today: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM core.citizens WHERE registered_at >= CURRENT_DATE"
    )
    .fetch_one(&pool)
    .await
    .unwrap_or((0,));

    Json(CitizenResponse {
        success: true,
        data: Some(serde_json::json!({
            "total_citizens": total.0,
            "registrations_today": today.0
        })),
        error: None,
    })
}

#[derive(Deserialize)]
pub struct SearchQuery {
    pub query: Option<String>,
}

async fn search_citizens(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
    axum::extract::Query(params): axum::extract::Query<SearchQuery>,
) -> Json<CitizenResponse> {
    if !["CIVIL_REGISTRAR", "SYSTEM_ADMIN"].contains(&auth.user.role.as_str()) {
        return Json(CitizenResponse { success: false, data: None, error: Some("Unauthorized".into()) });
    }

    let search_val = params.query.unwrap_or_default().trim().to_string();
    if search_val.is_empty() {
        return Json(CitizenResponse { success: true, data: Some(serde_json::json!([])), error: None });
    }

    let search_pattern = format!("%{}%", search_val);

    let citizens = sqlx::query(
        "SELECT citizen_id, full_name, sex, year_of_birth, district_of_birth, status, registered_at
         FROM core.citizens
         WHERE citizen_id ILIKE $1 OR full_name ILIKE $1
         ORDER BY full_name ASC
         LIMIT 50"
    )
    .bind(&search_pattern)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let list: Vec<serde_json::Value> = citizens.iter().map(|row| {
        use sqlx::Row;
        serde_json::json!({
            "citizen_id":    row.get::<String, _>("citizen_id"),
            "full_name":     row.get::<String, _>("full_name"),
            "sex":           row.get::<String, _>("sex"),
            "year_of_birth": row.get::<i16, _>("year_of_birth"),
            "district":      row.get::<String, _>("district_of_birth"),
            "status":        row.get::<String, _>("status"),
            "registered_at": row.get::<chrono::DateTime<chrono::Utc>, _>("registered_at"),
        })
    }).collect();

    Json(CitizenResponse {
        success: true,
        data: Some(serde_json::to_value(list).unwrap_or_default()),
        error: None,
    })
}

#[derive(Deserialize, Serialize)]
pub struct DeathRequest {
    pub date_of_death: NaiveDate,
    pub place_of_death: String,
    pub cause_of_death: Option<String>,
    pub informant_name: String,
    pub informant_relationship: String,
}

async fn register_death(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
    Path(citizen_id): Path<String>,
    Json(payload): Json<DeathRequest>,
) -> Json<CitizenResponse> {
    if auth.user.role != "CIVIL_REGISTRAR" && auth.user.role != "SYSTEM_ADMIN" {
        return Json(CitizenResponse { success: false, data: None, error: Some("Unauthorized role".into()) });
    }

    let res = sqlx::query(
        "UPDATE core.citizens SET status = 'DECEASED', death_registered_at = NOW(), death_registered_by = $1
         WHERE citizen_id = $2 AND status = 'ACTIVE'"
    )
    .bind(auth.user.id)
    .bind(&citizen_id)
    .execute(&pool)
    .await;

    match res {
        Ok(r) if r.rows_affected() > 0 => {
            // Trigger cascade
            let pool_clone = pool.clone();
            let citizen_id_clone = citizen_id.clone();
            tokio::spawn(async move {
                match crate::workers::death_cascade::run_death_cascade(&citizen_id_clone, &pool_clone).await {
                    Ok(_) => tracing::info!("Death cascade completed successfully for {}", citizen_id_clone),
                    Err(e) => tracing::error!("DEATH CASCADE FAILED for {}: {:?}", citizen_id_clone, e),
                }
            });

            let _ = AuditWriter::log(
                &pool,
                Some(&citizen_id),
                Some(auth.user.id),
                &auth.user.role,
                auth.user.sector.as_deref(),
                "CITIZEN_DEATH_REGISTERED",
                Some("CORE"),
                "SUCCESS",
                Some(serde_json::to_value(payload).unwrap_or_default()),
            ).await;

            Json(CitizenResponse { success: true, data: None, error: None })
        }
        Ok(_) => Json(CitizenResponse { success: false, data: None, error: Some("Citizen not found or already deceased".into()) }),
        Err(_) => Json(CitizenResponse { success: false, data: None, error: Some("Database error".into()) }),
    }
}

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub full_name: String,
    pub sex: char,
    pub year_of_birth: u16,
    pub month_of_birth: u8,
    pub day_of_birth: u8,
    pub district_of_birth: String,
    pub place_of_birth: Option<String>,
    pub father_citizen_id: Option<String>,
    pub mother_citizen_id: Option<String>,
    pub spouse_citizen_id: Option<String>,
}

#[derive(Serialize)]
pub struct CitizenResponse {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}

fn empty_to_none(s: Option<String>) -> Option<String> {
    s.filter(|v| !v.trim().is_empty())
}

async fn register(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
    Json(payload): Json<RegisterRequest>,
) -> Json<CitizenResponse> {
    // Check if user has permission
    if auth.user.role != "CIVIL_REGISTRAR" && auth.user.role != "SYSTEM_ADMIN" {
        return Json(CitizenResponse { success: false, data: None, error: Some("Unauthorized role".into()) });
    }

    // Validate month/day range
    if payload.month_of_birth < 1 || payload.month_of_birth > 12 {
        return Json(CitizenResponse { success: false, data: None, error: Some("Invalid month".into()) });
    }
    if payload.day_of_birth < 1 || payload.day_of_birth > 31 {
        return Json(CitizenResponse { success: false, data: None, error: Some("Invalid day".into()) });
    }

    // Compute DOB hash — format as YYYY-MM-DD before hashing
    let dob_string = format!(
        "{:04}-{:02}-{:02}",
        payload.year_of_birth, payload.month_of_birth, payload.day_of_birth
    );
    let dob_hash = format!("{:x}", Sha256::digest(dob_string.as_bytes()));

    let mut tx = match pool.begin().await {
        Ok(tx) => tx,
        Err(_) => return Json(CitizenResponse { success: false, data: None, error: Some("Database error".into()) }),
    };

    // 1. Get next sequence
    let row: (i32,) = match sqlx::query_as("UPDATE core.sequence_counter SET current_value = current_value + 1 RETURNING current_value")
        .fetch_one(&mut *tx)
        .await {
            Ok(row) => row,
            Err(_) => return Json(CitizenResponse { success: false, data: None, error: Some("Failed to get sequence".into()) }),
        };
    
    let sequence = row.0 as u32;

    // 2. Generate Citizen ID
    let sex = match Sex::from_char(payload.sex) {
        Some(s) => s,
        None => return Json(CitizenResponse { success: false, data: None, error: Some("Invalid sex".into()) }),
    };
    let citizen_id = generate_citizen_id(sex, payload.year_of_birth, sequence);

    // 3. Create citizen record
    let res = sqlx::query(
        "INSERT INTO core.citizens (citizen_id, full_name, sex, year_of_birth, date_of_birth_hash,
         district_of_birth, place_of_birth, father_citizen_id, mother_citizen_id,
         spouse_citizen_id, registered_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id"
    )
    .bind(&citizen_id)
    .bind(&payload.full_name)
    .bind(payload.sex.to_string())
    .bind(payload.year_of_birth as i16)
    .bind(&dob_hash)
    .bind(&payload.district_of_birth)
    .bind(&payload.place_of_birth)
    .bind(empty_to_none(payload.father_citizen_id.clone()))
    .bind(empty_to_none(payload.mother_citizen_id.clone()))
    .bind(empty_to_none(payload.spouse_citizen_id.clone()))
    .bind(auth.user.id)
    .fetch_one(&mut *tx)
    .await;

    let _citizen_row = match res {
        Ok(row) => row,
        Err(e) => {
            // Log the real error to stderr so it appears in server logs
            tracing::error!("Failed to insert citizen: {:?}", e);
            let msg = if e.to_string().contains("foreign key") {
                "Invalid parent ID — no citizen exists with that ID".to_string()
            } else if e.to_string().contains("unique") {
                "A citizen with this ID already exists".to_string()
            } else {
                format!("Database error: {}", e)
            };
            return Json(CitizenResponse { success: false, data: None, error: Some(msg) });
        }
    };

    // 4. Handle family links
    if let Some(ref father_id) = payload.father_citizen_id {
        let _ = sqlx::query("INSERT INTO core.citizen_children (parent_citizen_id, child_citizen_id, relationship) VALUES ($1, $2, 'BIOLOGICAL')")
            .bind(father_id)
            .bind(&citizen_id)
            .execute(&mut *tx)
            .await;
    }
    if let Some(ref mother_id) = payload.mother_citizen_id {
        let _ = sqlx::query("INSERT INTO core.citizen_children (parent_citizen_id, child_citizen_id, relationship) VALUES ($1, $2, 'BIOLOGICAL')")
            .bind(mother_id)
            .bind(&citizen_id)
            .execute(&mut *tx)
            .await;
    }

    // 5. Commit transaction
    if tx.commit().await.is_err() {
        return Json(CitizenResponse { success: false, data: None, error: Some("Failed to commit transaction".into()) });
    }

    // 6. Log audit entry
    let _ = AuditWriter::log(
        &pool,
        Some(&citizen_id),
        Some(auth.user.id),
        &auth.user.role,
        auth.user.sector.as_deref(),
        "CITIZEN_REGISTERED",
        Some("CORE"),
        "SUCCESS",
        None,
    ).await;

    Json(CitizenResponse {
        success: true,
        data: Some(serde_json::json!({ "citizen_id": citizen_id, "full_name": payload.full_name })),
        error: None,
    })
}

async fn get_citizen(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
    Path(citizen_id): Path<String>,
) -> Json<CitizenResponse> {
    // Fetch citizen
    let citizen = sqlx::query_as::<_, Citizen>("SELECT * FROM core.citizens WHERE citizen_id = $1")
        .bind(&citizen_id)
        .fetch_optional(&pool)
        .await;

    let citizen = match citizen {
        Ok(Some(c)) => c,
        Ok(None) => return Json(CitizenResponse { success: false, data: None, error: Some("Citizen not found".into()) }),
        Err(_) => return Json(CitizenResponse { success: false, data: None, error: Some("Database error".into()) }),
    };

    // Role-based filtering
    let mut education_block = serde_json::json!({ "visible": false, "reason": "UNAUTHORIZED_ROLE", "message": "Education Officer access required" });
    let mut revenue_block = serde_json::json!({ "visible": false, "reason": "UNAUTHORIZED_ROLE", "message": "Revenue Officer access required" });
    let mut labour_block = serde_json::json!({ "visible": false, "reason": "UNAUTHORIZED_ROLE", "message": "Labour Officer access required" });
    let health_block = serde_json::json!({ "visible": false, "reason": "SECTOR_NOT_ONBOARDED", "message": "Records held by National Health Service. Integration designed, not yet onboarded." });

    // Education block (for EDUCATION_OFFICER, SYSTEM_ADMIN, and Citizen self)
    if auth.user.role == "EDUCATION_OFFICER" || auth.user.role == "SYSTEM_ADMIN" || (auth.user.role == "CITIZEN" && auth.user.citizen_id.as_deref() == Some(&citizen_id)) {
        let edu_records = match sqlx::query_as::<_, EducationRecord>(
            "SELECT id, citizen_id, institution_name, institution_type, 
                    enrollment_date, completion_date, status, recorded_by, recorded_at 
             FROM education.records WHERE citizen_id = $1 ORDER BY enrollment_date ASC"
        )
        .bind(&citizen_id)
        .fetch_all(&pool)
        .await {
            Ok(rows) => rows,
            Err(e) => {
                tracing::error!("DATABASE ERROR fetching edu_records for {}: {:?}", citizen_id, e);
                Vec::new()
            }
        };

        let exam_results = match sqlx::query_as::<_, ExamResult>(
            "SELECT id, citizen_id, exam_type, year_of_exam, grade, institution, recorded_by, recorded_at 
             FROM education.examination_results WHERE citizen_id = $1 ORDER BY year_of_exam ASC"
        )
        .bind(&citizen_id)
        .fetch_all(&pool)
        .await {
            Ok(rows) => rows,
            Err(e) => {
                tracing::error!("DATABASE ERROR fetching exam_results for {}: {:?}", citizen_id, e);
                Vec::new()
            }
        };

        education_block = serde_json::json!({
            "visible": true,
            "data": {
                "enrollments": edu_records,
                "results": exam_results
            }
        });
    } else {
        let _ = AuditWriter::log(
            &pool,
            Some(&citizen_id),
            Some(auth.user.id),
            &auth.user.role,
            auth.user.sector.as_deref(),
            "SECTOR_ACCESS_BLOCKED",
            Some("EDUCATION"),
            "BLOCKED",
            Some(serde_json::json!({ "reason": "Role does not have education access" })),
        ).await;
    }

    // Revenue block (for REVENUE_OFFICER, SYSTEM_ADMIN, and Citizen self)
    if auth.user.role == "REVENUE_OFFICER" || auth.user.role == "SYSTEM_ADMIN" || (auth.user.role == "CITIZEN" && auth.user.citizen_id.as_deref() == Some(&citizen_id)) {
        let rev_record = sqlx::query_as::<_, RevenueRecord>(
            "SELECT id, citizen_id, tax_id, taxpayer_category, compliance_status, 
                    registration_date, last_filing_date, last_filing_period, registered_at 
             FROM revenue.records WHERE citizen_id = $1"
        )
        .bind(&citizen_id)
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);

        revenue_block = serde_json::json!({
            "visible": true,
            "data": rev_record
        });
    } else {
        let _ = AuditWriter::log(
            &pool,
            Some(&citizen_id),
            Some(auth.user.id),
            &auth.user.role,
            auth.user.sector.as_deref(),
            "SECTOR_ACCESS_BLOCKED",
            Some("REVENUE"),
            "BLOCKED",
            Some(serde_json::json!({ "reason": "Role does not have revenue access" })),
        ).await;
    }

    // Labour block (for LABOUR_OFFICER, SYSTEM_ADMIN, and Citizen self)
    if auth.user.role == "LABOUR_OFFICER" || auth.user.role == "SYSTEM_ADMIN" || (auth.user.role == "CITIZEN" && auth.user.citizen_id.as_deref() == Some(&citizen_id)) {
        let labour_records = sqlx::query_as::<_, LabourRecord>(
            "SELECT id, citizen_id, employer_name, employer_tin, job_title, 
                    employment_type, start_date, end_date, status, nssf_number, 
                    nssf_status, recorded_at 
             FROM labour.records WHERE citizen_id = $1 ORDER BY start_date ASC"
        )
        .bind(&citizen_id)
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

        labour_block = serde_json::json!({
            "visible": true,
            "data": labour_records
        });
    } else {
        let _ = AuditWriter::log(
            &pool,
            Some(&citizen_id),
            Some(auth.user.id),
            &auth.user.role,
            auth.user.sector.as_deref(),
            "SECTOR_ACCESS_BLOCKED",
            Some("LABOUR"),
            "BLOCKED",
            Some(serde_json::json!({ "reason": "Role does not have labour access" })),
        ).await;
    }

    // Fetch children from DB
    let children: Vec<String> = sqlx::query_as::<_, (String,)>(
        "SELECT child_citizen_id FROM core.citizen_children WHERE parent_citizen_id = $1"
    )
    .bind(&citizen_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|(id,)| id)
    .collect();

    let response_data = serde_json::json!({
        "citizen_id": citizen.citizen_id,
        "full_name": citizen.full_name,
        "sex": citizen.sex,
        "year_of_birth": citizen.year_of_birth,
        "district_of_birth": citizen.district_of_birth,
        "nationality": citizen.nationality,
        "status": citizen.status,
        "photo_url": citizen.photo_path,
        "family": {
            "father_citizen_id": citizen.father_citizen_id,
            "mother_citizen_id": citizen.mother_citizen_id,
            "spouse_citizen_id": citizen.spouse_citizen_id,
            "children": children
        },
        "sectors": {
            "education": education_block,
            "revenue": revenue_block,
            "labour": labour_block,
            "health": health_block
        }
    });

    let _ = AuditWriter::log(
        &pool,
        Some(&citizen_id),
        Some(auth.user.id),
        &auth.user.role,
        auth.user.sector.as_deref(),
        "CITIZEN_PROFILE_VIEWED",
        None,
        "SUCCESS",
        None,
    ).await;

    Json(CitizenResponse {
        success: true,
        data: Some(response_data),
        error: None,
    })
}

#[derive(Deserialize)]
pub struct ValidateIdRequest {
    pub citizen_id: String,
}

async fn validate_id(
    Json(payload): Json<ValidateIdRequest>,
) -> Json<CitizenResponse> {
    let valid = crate::crypto::citizen_id::validate_citizen_id(&payload.citizen_id);
    Json(CitizenResponse {
        success: true,
        data: Some(serde_json::json!({ "valid": valid })),
        error: None,
    })
}

async fn get_citizen_audit(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
    Path(citizen_id): Path<String>,
) -> Json<CitizenResponse> {
    // Citizens can only see their own audit log
    if auth.user.role == "CITIZEN" && auth.user.citizen_id.as_deref() != Some(&citizen_id) {
        return Json(CitizenResponse { 
            success: false, 
            data: None, 
            error: Some("You can only view your own audit log".into()) 
        });
    }
    // Only citizen (own), civil registrar, and admin can see audit logs
    if !["CITIZEN", "CIVIL_REGISTRAR", "SYSTEM_ADMIN"].contains(&auth.user.role.as_str()) {
        return Json(CitizenResponse { 
            success: false, 
            data: None, 
            error: Some("Unauthorized".into()) 
        });
    }

    let entries = sqlx::query_as::<_, AuditEntry>(
        "SELECT id, event_id, citizen_id, actor_user_id, actor_role, actor_sector, 
                action, sector_accessed, outcome, details, created_at 
         FROM audit.log WHERE citizen_id = $1 ORDER BY created_at DESC LIMIT 100"
    )
    .bind(&citizen_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    Json(CitizenResponse {
        success: true,
        data: Some(serde_json::to_value(entries).unwrap_or_default()),
        error: None,
    })
}
