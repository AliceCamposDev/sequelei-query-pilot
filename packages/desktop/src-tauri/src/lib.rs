use std::fs;

use rusqlite::Connection;
use tauri::{AppHandle, Manager, State};

mod connections;
mod credential_store;
mod metadata;
mod sql_connection;

pub use connections::{
    ConnectionEnvironment, ConnectionManager, ConnectionManagerError, ConnectionSummary,
    ConnectionTestResult, ConnectionTester, CreateAuthPayload, CreateConnectionPayload,
    MockConnectionTester, TiberiusConnectionTester,
};
pub use credential_store::{
    CredentialBackend, CredentialError, CredentialStore, InMemoryCredentialBackend, KeyringBackend,
    SecretString, UnavailableCredentialBackend, DEFAULT_SERVICE_NAME,
};
pub use metadata::{
    escape_sql_literal, quote_identifier, ColumnInfo, DatabaseInfo, ForeignKeyInfo, MetadataError,
    MetadataService, ProcedureInfo, TableInfo, ViewInfo, DEFAULT_METADATA_CACHE_TTL,
};
pub use sql_connection::{
    connect_sql_server, connect_with_options, create_sql_server_pool, execute_query,
    query_scalar_int, AuthMethod, ConnectionOptions, MockSqlExecutor, QueryResult,
    SqlConnectionError, SqlExecutor, SqlServerClient, SqlServerPool, SqlValue,
};

pub fn ping() -> &'static str {
    "pong"
}

#[tauri::command]
fn save_preference(key: String, value: String, app: AppHandle) -> Result<(), String> {
    let connection = open_app_database(&app)?;
    connection
        .execute(
            "INSERT INTO user_preference (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (&key, &value),
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn load_preferences(app: AppHandle) -> Result<std::collections::HashMap<String, String>, String> {
    let connection = open_app_database(&app)?;
    let mut statement = connection
        .prepare("SELECT key, value FROM user_preference")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|error| error.to_string())?;
    let mut preferences = std::collections::HashMap::new();

    for row in rows {
        let (key, value) = row.map_err(|error| error.to_string())?;
        preferences.insert(key, value);
    }

    Ok(preferences)
}

#[tauri::command]
fn list_connections(app: AppHandle) -> Result<Vec<ConnectionSummary>, String> {
    let db = open_app_database(&app)?;
    ConnectionManager::system()
        .list_connections(&db)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn create_connection(
    payload: CreateConnectionPayload,
    app: AppHandle,
) -> Result<ConnectionSummary, String> {
    let db = open_app_database(&app)?;
    ConnectionManager::system()
        .create_connection(&db, payload)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn test_connection(id: String, app: AppHandle) -> Result<ConnectionTestResult, String> {
    let options = resolve_options_for_app(&app, &id)?;

    TiberiusConnectionTester
        .test(&options)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_connection(
    id: String,
    app: AppHandle,
    metadata: State<'_, MetadataService>,
) -> Result<(), String> {
    let db = open_app_database(&app)?;
    ConnectionManager::system()
        .delete_connection(&db, &id)
        .map_err(|error| error.to_string())?;
    metadata.invalidate_cache(Some(&id));
    Ok(())
}

#[tauri::command]
async fn get_databases(
    connection_id: String,
    app: AppHandle,
    metadata: State<'_, MetadataService>,
) -> Result<Vec<DatabaseInfo>, String> {
    if let Some(cached) = metadata.get_cached_databases(&connection_id) {
        return Ok(cached);
    }

    let options = resolve_options_for_app(&app, &connection_id)?;
    let mut client = connect_with_options(&options)
        .await
        .map_err(|error| error.to_string())?;

    metadata
        .get_databases(&mut client, &connection_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_tables(
    connection_id: String,
    db: String,
    app: AppHandle,
    metadata: State<'_, MetadataService>,
) -> Result<Vec<TableInfo>, String> {
    if let Some(cached) = metadata.get_cached_tables(&connection_id, &db) {
        return Ok(cached);
    }

    let options = resolve_options_for_app(&app, &connection_id)?;
    let mut client = connect_with_options(&options)
        .await
        .map_err(|error| error.to_string())?;

    metadata
        .get_tables(&mut client, &connection_id, &db)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_views(
    connection_id: String,
    db: String,
    app: AppHandle,
    metadata: State<'_, MetadataService>,
) -> Result<Vec<ViewInfo>, String> {
    if let Some(cached) = metadata.get_cached_views(&connection_id, &db) {
        return Ok(cached);
    }

    let options = resolve_options_for_app(&app, &connection_id)?;
    let mut client = connect_with_options(&options)
        .await
        .map_err(|error| error.to_string())?;

    metadata
        .get_views(&mut client, &connection_id, &db)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_procedures(
    connection_id: String,
    db: String,
    app: AppHandle,
    metadata: State<'_, MetadataService>,
) -> Result<Vec<ProcedureInfo>, String> {
    if let Some(cached) = metadata.get_cached_procedures(&connection_id, &db) {
        return Ok(cached);
    }

    let options = resolve_options_for_app(&app, &connection_id)?;
    let mut client = connect_with_options(&options)
        .await
        .map_err(|error| error.to_string())?;

    metadata
        .get_procedures(&mut client, &connection_id, &db)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_columns(
    connection_id: String,
    db: String,
    schema: String,
    table: String,
    app: AppHandle,
    metadata: State<'_, MetadataService>,
) -> Result<Vec<ColumnInfo>, String> {
    if let Some(cached) = metadata.get_cached_columns(&connection_id, &db, &schema, &table) {
        return Ok(cached);
    }

    let options = resolve_options_for_app(&app, &connection_id)?;
    let mut client = connect_with_options(&options)
        .await
        .map_err(|error| error.to_string())?;

    metadata
        .get_columns(&mut client, &connection_id, &db, &schema, &table)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_foreign_keys(
    connection_id: String,
    db: String,
    app: AppHandle,
    metadata: State<'_, MetadataService>,
) -> Result<Vec<ForeignKeyInfo>, String> {
    if let Some(cached) = metadata.get_cached_foreign_keys(&connection_id, &db) {
        return Ok(cached);
    }

    let options = resolve_options_for_app(&app, &connection_id)?;
    let mut client = connect_with_options(&options)
        .await
        .map_err(|error| error.to_string())?;

    metadata
        .get_foreign_keys(&mut client, &connection_id, &db)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn invalidate_metadata_cache(
    connection_id: Option<String>,
    metadata: State<'_, MetadataService>,
) {
    metadata.invalidate_cache(connection_id.as_deref());
}

fn resolve_options_for_app(app: &AppHandle, id: &str) -> Result<ConnectionOptions, String> {
    let db = open_app_database(app)?;
    ConnectionManager::system()
        .resolve_connection_options(&db, id)
        .map_err(|error| error.to_string())
}

fn open_app_database(app: &AppHandle) -> Result<Connection, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let connection =
        Connection::open(directory.join("sequelei.db")).map_err(|error| error.to_string())?;

    connection
        .execute(
            "CREATE TABLE IF NOT EXISTS user_preference (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            [],
        )
        .map_err(|error| error.to_string())?;

    ConnectionManager::<KeyringBackend>::init_schema(&connection)
        .map_err(|error| error.to_string())?;

    Ok(connection)
}

#[tauri::command(rename = "ping")]
fn ping_command() -> &'static str {
    ping()
}

pub fn run() {
    tauri::Builder::default()
        .manage(MetadataService::new())
        .invoke_handler(tauri::generate_handler![
            create_connection,
            delete_connection,
            get_columns,
            get_databases,
            get_foreign_keys,
            get_procedures,
            get_tables,
            get_views,
            invalidate_metadata_cache,
            list_connections,
            load_preferences,
            ping_command,
            save_preference,
            test_connection
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sequelei");
}
