use axum::{
    extract::State,
    routing::{post, get},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;
use rand;

pub fn public_router(pool: PgPool) -> Router {
    Router::new()
        .route("/login", post(login))
        .route("/citizen/verify-identity", post(citizen_verify_identity))
        .route("/citizen/verify-otp", post(citizen_verify_otp))
        .route("/citizen/set-password", post(citizen_set_password))
        .with_state(pool)
}

// ─── Citizen Self-Registration ────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CitizenVerifyIdentityRequest {
    pub citizen_id: String,
    pub phone: String,     // must match core.citizens record (future: full phone match)
}

async fn citizen_verify_identity(
    State(pool): State<PgPool>,
    Json(payload): Json<CitizenVerifyIdentityRequest>,
) -> Json<AuthResponse> {
    // NOTE: In this prototype, phone matching is deferred. 
    // In production, we would verify that payload.phone matches the phone on file for the citizen.
    
    // 1. Citizen ID must exist in core.citizens
    let citizen = sqlx::query(
        "SELECT citizen_id FROM core.citizens WHERE citizen_id = $1 AND status = 'ACTIVE'"
    )
    .bind(&payload.citizen_id)
    .fetch_optional(&pool)
    .await;

    if citizen.unwrap_or(None).is_none() {
        // Generic error — don't reveal which field failed
        return Json(AuthResponse {
            success: false,
            data: None,
            error: Some(AuthError {
                code: "IDENTITY_NOT_FOUND".into(),
                message: "Could not verify identity. Check your Citizen ID and phone number.".into(),
            }),
        });
    }

    // 2. Check no existing ACTIVE user account for this citizen_id
    let existing = sqlx::query(
        "SELECT id FROM core.users WHERE citizen_id = $1 AND is_active = true"
    )
    .bind(&payload.citizen_id)
    .fetch_optional(&pool)
    .await
    .unwrap_or(None);

    if existing.is_some() {
        return Json(AuthResponse {
            success: false,
            data: None,
            error: Some(AuthError {
                code: "ACCOUNT_EXISTS".into(),
                message: "A portal account already exists for this citizen. Please log in.".into(),
            }),
        });
    }

    // 3. Generate 6-digit OTP
    let otp_code = format!("{:06}", rand::random::<u32>() % 1_000_000);
    let expires_at = Utc::now() + Duration::minutes(10);

    // Delete any existing unused OTPs for this phone
    let _ = sqlx::query("DELETE FROM core.otp_codes WHERE phone = $1 AND used_at IS NULL")
        .bind(&payload.phone)
        .execute(&pool)
        .await;

    let _ = sqlx::query(
        "INSERT INTO core.otp_codes (phone, code, purpose, expires_at) VALUES ($1, $2, $3, $4)"
    )
    .bind(&payload.phone)
    .bind(&otp_code)
    .bind("CITIZEN_REGISTER")
    .bind(expires_at)
    .execute(&pool)
    .await;

    // 4. In prototype: log OTP to server console (Mailtrap integration is deferred)
    // Redacted for security in production-like environments
    tracing::info!("OTP issued for citizen {} (delivery deferred — Mailtrap integration pending)", 
        &payload.citizen_id[..std::cmp::min(6, payload.citizen_id.len())]);

    Json(AuthResponse {
        success: true,
        data: None,
        error: None,
    })
}

// ─────────────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CitizenVerifyOtpRequest {
    pub citizen_id: String,
    pub phone: String,
    pub otp: String,
}

async fn citizen_verify_otp(
    State(pool): State<PgPool>,
    Json(payload): Json<CitizenVerifyOtpRequest>,
) -> Json<AuthResponse> {
    let otp_row = sqlx::query(
        "SELECT id FROM core.otp_codes
         WHERE phone = $1 AND code = $2 AND purpose = 'CITIZEN_REGISTER'
               AND expires_at > NOW() AND used_at IS NULL"
    )
    .bind(&payload.phone)
    .bind(&payload.otp)
    .fetch_optional(&pool)
    .await
    .unwrap_or(None);

    if otp_row.is_none() {
        return Json(AuthResponse {
            success: false,
            data: None,
            error: Some(AuthError {
                code: "INVALID_OTP".into(),
                message: "Incorrect or expired code.".into(),
            }),
        });
    }

    // Mark OTP as used
    use sqlx::Row;
    let otp_id: Uuid = otp_row.unwrap().get("id");
    let _ = sqlx::query("UPDATE core.otp_codes SET used_at = NOW() WHERE id = $1")
        .bind(otp_id)
        .execute(&pool)
        .await;

    Json(AuthResponse { success: true, data: None, error: None })
}

// ─────────────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CitizenSetPasswordRequest {
    pub citizen_id: String,
    pub phone: String,
    pub password: String,
}

async fn citizen_set_password(
    State(pool): State<PgPool>,
    Json(payload): Json<CitizenSetPasswordRequest>,
) -> Json<AuthResponse> {
    // Verify the OTP was recently completed (used_at within last 5 minutes)
    let verified = sqlx::query(
        "SELECT 1 FROM core.otp_codes
         WHERE phone = $1 AND purpose = 'CITIZEN_REGISTER'
               AND used_at IS NOT NULL AND used_at > NOW() - INTERVAL '5 minutes'"
    )
    .bind(&payload.phone)
    .fetch_optional(&pool)
    .await
    .unwrap_or(None);

    if verified.is_none() {
        return Json(AuthResponse {
            success: false,
            data: None,
            error: Some(AuthError {
                code: "OTP_NOT_VERIFIED".into(),
                message: "OTP verification required before setting password.".into(),
            }),
        });
    }

    // Validate password length
    if payload.password.len() < 8 {
        return Json(AuthResponse {
            success: false,
            data: None,
            error: Some(AuthError {
                code: "WEAK_PASSWORD".into(),
                message: "Password must be at least 8 characters.".into(),
            }),
        });
    }

    // Fetch citizen's full_name for the new user row
    let citizen = sqlx::query("SELECT full_name FROM core.citizens WHERE citizen_id = $1")
        .bind(&payload.citizen_id)
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);

    let full_name: String = match citizen {
        Some(row) => { use sqlx::Row; row.get("full_name") },
        None => return Json(AuthResponse {
            success: false,
            data: None,
            error: Some(AuthError { code: "NOT_FOUND".into(), message: "Citizen not found.".into() }),
        }),
    };

    // Hash password
    use argon2::password_hash::{rand_core::OsRng, PasswordHasher, SaltString};
    let salt = SaltString::generate(&mut OsRng);
    let password_hash = Argon2::default()
        .hash_password(payload.password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .unwrap_or_default();

    // Create user account
    let result = sqlx::query(
        "INSERT INTO core.users (email, password_hash, role, full_name, citizen_id, status)
         VALUES ($1, $2, 'CITIZEN', $3, $4, 'ACTIVE')
         ON CONFLICT (email) DO NOTHING"
    )
    .bind(&payload.citizen_id)     // citizen_id used as email (consistent with seed.py pattern)
    .bind(&password_hash)
    .bind(&full_name)
    .bind(&payload.citizen_id)
    .execute(&pool)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => Json(AuthResponse { success: true, data: None, error: None }),
        Ok(_) => Json(AuthResponse {
            success: false,
            data: None,
            error: Some(AuthError { code: "ACCOUNT_EXISTS".into(), message: "Account already exists.".into() }),
        }),
        Err(e) => {
            tracing::error!("Failed to create citizen user: {:?}", e);
            Json(AuthResponse {
                success: false,
                data: None,
                error: Some(AuthError { code: "INTERNAL_ERROR".into(), message: "Failed to create account.".into() }),
            })
        }
    }
}

pub fn private_router(pool: PgPool) -> Router {
    Router::new()
        .route("/logout", post(logout))
        .route("/me", get(me))
        .with_state(pool)
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub success: bool,
    pub data: Option<AuthData>,
    pub error: Option<AuthError>,
}

#[derive(Serialize)]
pub struct AuthData {
    pub token: String,
    pub user: UserInfo,
}

#[derive(Serialize)]
pub struct UserInfo {
    pub id: Uuid,
    pub email: String,
    pub full_name: String,
    pub role: String,
    pub sector: Option<String>,
    pub citizen_id: Option<String>,
}

#[derive(Serialize)]
pub struct AuthError {
    pub code: String,
    pub message: String,
}

use crate::models::User;
use argon2::{
    password_hash::{PasswordHash, PasswordVerifier},
    Argon2,
};
use chrono::{Duration, Utc};
use sha2::{Digest, Sha256};

async fn login(
    State(pool): State<PgPool>,
    Json(payload): Json<LoginRequest>,
) -> Json<AuthResponse> {
    // 1. Fetch user by email
    let user = sqlx::query_as::<_, User>("SELECT * FROM core.users WHERE email = $1 AND is_active = true")
        .bind(&payload.email)
        .fetch_optional(&pool)
        .await;

    let user = match user {
        Ok(Some(user)) => user,
        _ => return Json(AuthResponse {
            success: false,
            data: None,
            error: Some(AuthError {
                code: "INVALID_CREDENTIALS".to_string(),
                message: "Invalid email or password".to_string(),
            }),
        }),
    };

    // 2. Verify password with Argon2
    let parsed_hash = match PasswordHash::new(&user.password_hash) {
        Ok(hash) => hash,
        Err(_) => return Json(AuthResponse {
            success: false,
            data: None,
            error: Some(AuthError {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to parse password hash".to_string(),
            }),
        }),
    };

    if Argon2::default().verify_password(payload.password.as_bytes(), &parsed_hash).is_err() {
        return Json(AuthResponse {
            success: false,
            data: None,
            error: Some(AuthError {
                code: "INVALID_CREDENTIALS".to_string(),
                message: "Invalid email or password".to_string(),
            }),
        });
    }

    // 3. Create session
    let token = Uuid::new_v4().to_string();
    let token_hash = format!("{:x}", Sha256::digest(token.as_bytes()));
    let expires_at = Utc::now() + Duration::hours(24);

    let session_result = sqlx::query(
        "INSERT INTO core.sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)"
    )
    .bind(user.id)
    .bind(&token_hash)
    .bind(expires_at)
    .execute(&pool)
    .await;

    if session_result.is_err() {
        return Json(AuthResponse {
            success: false,
            data: None,
            error: Some(AuthError {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to create session".to_string(),
            }),
        });
    }

    // Update last login
    let _ = sqlx::query("UPDATE core.users SET last_login_at = NOW() WHERE id = $1")
        .bind(user.id)
        .execute(&pool)
        .await;

    Json(AuthResponse {
        success: true,
        data: Some(AuthData {
            token,
            user: UserInfo {
                id: user.id,
                email: user.email,
                full_name: user.full_name,
                role: user.role,
                sector: user.sector,
                citizen_id: user.citizen_id,
            },
        }),
        error: None,
    })
}

async fn logout(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
) -> Json<AuthResponse> {
    let token_hash = format!("{:x}", Sha256::digest(auth.token.as_bytes()));
    let _ = sqlx::query("DELETE FROM core.sessions WHERE token_hash = $1")
        .bind(&token_hash)
        .execute(&pool)
        .await;

    Json(AuthResponse {
        success: true,
        data: None,
        error: None,
    })
}

use axum::Extension;
use crate::middleware::auth::AuthContext;

async fn me(
    Extension(auth): Extension<AuthContext>,
) -> Json<AuthResponse> {
    Json(AuthResponse {
        success: true,
        data: Some(AuthData {
            token: auth.token,
            user: UserInfo {
                id: auth.user.id,
                email: auth.user.email,
                full_name: auth.user.full_name,
                role: auth.user.role,
                sector: auth.user.sector,
                citizen_id: auth.user.citizen_id,
            },
        }),
        error: None,
    })
}
