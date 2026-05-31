use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub password_hash: String,
    pub role: String,
    pub citizen_id: Option<String>,
    pub full_name: String,
    pub sector: Option<String>,
    pub is_active: bool,
    pub status: String,
    pub phone: Option<String>,
    pub provisioned_by: Option<Uuid>,
    pub last_login_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Citizen {
    pub id: Uuid,
    pub citizen_id: String,
    pub full_name: String,
    pub sex: String,
    pub year_of_birth: i16,
    pub district_of_birth: String,
    pub place_of_birth: Option<String>,
    pub nationality: String,
    pub status: String,
    pub father_citizen_id: Option<String>,
    pub mother_citizen_id: Option<String>,
    pub spouse_citizen_id: Option<String>,
    pub photo_path: Option<String>,
    pub is_foreign_national: bool,
    pub registered_by: Option<Uuid>,
    pub registered_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EducationRecord {
    pub id: uuid::Uuid,
    pub citizen_id: String,
    pub institution_name: String,
    pub institution_type: String,
    pub enrollment_date: chrono::NaiveDate,
    pub completion_date: Option<chrono::NaiveDate>,
    pub status: String,
    pub recorded_by: uuid::Uuid,
    pub recorded_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ExamResult {
    pub id: uuid::Uuid,
    pub citizen_id: String,
    pub exam_type: String,
    pub year_of_exam: i16,
    pub grade: String,
    pub institution: Option<String>,
    pub recorded_by: uuid::Uuid,
    pub recorded_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RevenueRecord {
    pub id: uuid::Uuid,
    pub citizen_id: String,
    pub tax_id: String,
    pub taxpayer_category: String,
    pub compliance_status: String,
    pub registration_date: chrono::NaiveDate,
    pub last_filing_date: Option<chrono::NaiveDate>,
    pub last_filing_period: Option<String>,
    pub registered_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct LabourRecord {
    pub id: uuid::Uuid,
    pub citizen_id: String,
    pub employer_name: String,
    pub employer_tin: Option<String>,
    pub job_title: String,
    pub employment_type: String,
    pub start_date: chrono::NaiveDate,
    pub end_date: Option<chrono::NaiveDate>,
    pub status: String,
    pub nssf_number: Option<String>,
    pub nssf_status: String,
    pub recorded_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AuditEntry {
    pub id: i64,
    pub event_id: uuid::Uuid,
    pub citizen_id: Option<String>,
    pub actor_user_id: Option<uuid::Uuid>,
    pub actor_role: String,
    pub actor_sector: Option<String>,
    pub action: String,
    pub sector_accessed: Option<String>,
    pub outcome: String,
    pub details: Option<serde_json::Value>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

