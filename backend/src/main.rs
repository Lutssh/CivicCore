use axum::{routing::get, Router};
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use http::Method;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod api;
mod config;
mod crypto;
mod db;
mod middleware;
mod models;
mod workers;

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = config::Config::from_env().expect("Failed to load configuration");

    let pool = db::init_pool(&config.database_url)
        .await
        .expect("Failed to initialize database pool");

    let cors = CorsLayer::new()
        .allow_origin(tower_http::cors::Any)
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE, Method::OPTIONS])
        .allow_headers([
            http::header::AUTHORIZATION,
            http::header::CONTENT_TYPE,
            http::header::ACCEPT,
        ]);

    let pool_for_worker = pool.clone();
    tokio::spawn(async move {
        workers::flag_computer::run_flag_computer(pool_for_worker).await;
    });

    let app = Router::new()
        .route("/", get(|| async { "CivicCore API" }))
        .nest("/api", api::router(pool))
        // NOTE: Rate limiting is deferred to the infrastructure layer (Nginx/WAF) 
        // for this prototype. For production, consider adding Tower middleware.
        .layer(cors);

    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    tracing::info!("listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
