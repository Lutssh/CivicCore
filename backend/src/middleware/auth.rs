use axum::{
    extract::{Request, State},
    middleware::Next,
    response::Response,
    http::StatusCode,
};
use sqlx::PgPool;
use crate::models::User;
use sha2::{Digest, Sha256};

#[derive(Clone)]
pub struct AuthContext {
    pub user: User,
    pub token: String,
}

pub async fn auth_middleware(
    State(pool): State<PgPool>,
    mut request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let token = {
        let auth_header = request
            .headers()
            .get("Authorization")
            .and_then(|h| h.to_str().ok())
            .and_then(|h| h.strip_prefix("Bearer "));

        match auth_header {
            Some(token) => token.to_string(),
            None => return Err(StatusCode::UNAUTHORIZED),
        }
    };

    let token_hash = format!("{:x}", Sha256::digest(token.as_bytes()));

    let user = sqlx::query_as::<_, User>(
        "SELECT u.* FROM core.users u
         JOIN core.sessions s ON s.user_id = u.id
         WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.is_active = true"
    )
    .bind(&token_hash)
    .fetch_optional(&pool)
    .await;

    match user {
        Ok(Some(user)) => {
            request.extensions_mut().insert(AuthContext { user, token: token.to_string() });
            Ok(next.run(request).await)
        }
        Ok(None) => {
            tracing::warn!("Auth failed: Session not found or expired for token hash starting with {}", &token_hash[..8]);
            Err(StatusCode::UNAUTHORIZED)
        }
        Err(e) => {
            tracing::error!("Database error in auth middleware: {:?}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}
