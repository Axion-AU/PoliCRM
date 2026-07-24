pub mod models;
pub mod api;
mod auth;
mod auth_routes;
mod branches;
mod crypto;
mod era;
pub mod engagement;
pub mod fundraising;
pub mod tasks;
mod public_pages;
mod outreach;
mod automations;

use axum::{
    routing::get,
    Router,
};
use sqlx::sqlite::SqlitePoolOptions;
use std::net::SocketAddr;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    println!("Starting PoliCRM backend-rs...");

    // Setup connection pool
    let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite://crm.db".to_string());
    
    // Ensure the db file exists for sqlite
    if database_url.starts_with("sqlite://") {
        let sqlite_path = database_url.trim_start_matches("sqlite://");
        let db_path = std::path::Path::new(sqlite_path);
        if !db_path.exists() {
            if let Some(parent) = db_path.parent() {
                if !parent.as_os_str().is_empty() {
                    std::fs::create_dir_all(parent)?;
                }
            }
            std::fs::File::create(db_path)?;
        }
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;

    println!("Running database migrations...");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await?;

    println!("Database migrations completed successfully.");

    // Build our application with a single route
    let era_dir = std::env::var("ERA_DIR").unwrap_or_else(|_| "era".to_string());
    
    // On startup, sync ERA directory (auto-resume any interrupted imports)
    let pool_for_sync = pool.clone();
    tokio::spawn(async move {
        era::service::sync_era_files(&pool_for_sync, &era_dir).await;
    });

    let app = Router::new()
        .route("/health", get(health_check))
        .merge(api::router())
        .merge(tasks::router())
        .merge(fundraising::router())
        .merge(outreach::router())
        .merge(automations::router())
        .merge(public_pages::router())
        .merge(auth_routes::router())
        .nest("/branches", branches::router())
        .nest("/era", era::handlers::router())
        .with_state(pool);

    // Run it with fallback to alternative ports if occupied
    let mut port = 8080;
    let max_port = 8100;
    let listener = loop {
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        match tokio::net::TcpListener::bind(addr).await {
            Ok(listener) => {
                println!("Listening on {}", addr);
                break listener;
            }
            Err(e) if e.kind() == std::io::ErrorKind::AddrInUse && port < max_port => {
                println!("Port {} is already in use. Trying {}...", port, port + 1);
                port += 1;
            }
            Err(e) => return Err(e.into()),
        }
    };

    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_check() -> &'static str {
    "OK"
}
