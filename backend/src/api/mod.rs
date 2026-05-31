use axum::{Router, middleware};
use sqlx::PgPool;
use crate::middleware::auth::auth_middleware;

pub mod auth;
pub mod citizens;
pub mod education;
pub mod revenue;
pub mod labour;
pub mod verify;
pub mod admin;
pub mod disputes;

pub fn router(pool: PgPool) -> Router {
    let auth_router = Router::new()
        .nest("/auth", auth::private_router(pool.clone()))
        .nest("/citizens", citizens::router(pool.clone()))
        .nest("/education", education::router(pool.clone()))
        .nest("/revenue", revenue::router(pool.clone()))
        .nest("/labour", labour::router(pool.clone()))
        .nest("/verify", verify::router(pool.clone()))
        .nest("/admin", admin::router(pool.clone()))
        .nest("/disputes", disputes::router(pool.clone()))
        .route_layer(middleware::from_fn_with_state(pool.clone(), auth_middleware));

    Router::new()
        .nest("/auth", auth::public_router(pool.clone()))
        .merge(auth_router)
}
