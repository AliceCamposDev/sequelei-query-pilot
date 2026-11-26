use std::fs;

use rusqlite::Connection;
use tauri::AppHandle;
use tauri::Manager;

mod connections;
mod credential_store;
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
pub use sql_connection::{
    connect_sql_server, create_sql_server_pool, execute_query, query_scalar_int, AuthMethod,
    ConnectionOptions, MockSqlExecutor, QueryResult, SqlConnectionError, SqlExecutor,
    SqlServerClient, SqlServerPool, SqlValue,
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
    let options = {
        let db = open_app_database(&app)?;
        ConnectionManager::system()
            .resolve_connection_options(&db, &id)
            .map_err(|error| error.to_string())?
    };

    TiberiusConnectionTester
        .test(&options)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_connection(id: String, app: AppHandle) -> Result<(), String> {
    let db = open_app_database(&app)?;
    ConnectionManager::system()
        .delete_connection(&db, &id)
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
        .invoke_handler(tauri::generate_handler![
            create_connection,
            delete_connection,
            list_connections,
            load_preferences,
            ping_command,
            save_preference,
            test_connection
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sequelei");
}
