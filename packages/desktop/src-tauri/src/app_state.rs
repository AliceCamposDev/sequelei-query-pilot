use std::fs;
use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use thiserror::Error;

const TABS_STATE_KEY: &str = "tabs";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedTabCursor {
    pub column: u32,
    pub line_number: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedTabScroll {
    pub scroll_left: i64,
    pub scroll_top: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedQueryTab {
    pub id: String,
    pub title: String,
    pub sql: String,
    pub dirty: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cursor: Option<PersistedTabCursor>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scroll: Option<PersistedTabScroll>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedAppState {
    #[serde(default)]
    pub active_tab_id: Option<String>,
    #[serde(default)]
    pub tabs: Vec<PersistedQueryTab>,
}

#[derive(Debug, Error)]
pub enum AppStateError {
    #[error("failed to create state directory: {0}")]
    Io(#[from] std::io::Error),

    #[error("SQLite persistence error: {0}")]
    Storage(#[from] rusqlite::Error),

    #[error("JSON serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

/// Cria a tabela `app_state` e ativa WAL + synchronous FULL para resistência a crash.
pub fn init_app_state_schema(db: &Connection) -> Result<(), rusqlite::Error> {
    let _ = db.pragma_update(None, "journal_mode", "WAL");
    let _ = db.pragma_update(None, "synchronous", "FULL");

    db.execute(
        "CREATE TABLE IF NOT EXISTS app_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;
    Ok(())
}

/// Persiste o estado das abas na tabela `app_state` dentro de uma transação atômica.
pub fn save_app_state_to_db(
    db: &Connection,
    state: &PersistedAppState,
) -> Result<(), AppStateError> {
    init_app_state_schema(db)?;
    let serialized = serde_json::to_string(state)?;

    db.execute(
        "INSERT INTO app_state (key, value, updated_at)
         VALUES (?1, ?2, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = CURRENT_TIMESTAMP",
        params![TABS_STATE_KEY, serialized],
    )?;

    Ok(())
}

/// Lê o estado das abas da tabela `app_state`. Se estiver ausente ou corrompido,
/// retorna estado vazio sem lançar erro nem quebrar a inicialização.
pub fn load_app_state_from_db(db: &Connection) -> PersistedAppState {
    if init_app_state_schema(db).is_err() {
        return PersistedAppState::default();
    }

    let raw: Result<Option<String>, rusqlite::Error> = db
        .prepare("SELECT value FROM app_state WHERE key = ?1")
        .and_then(|mut stmt| {
            stmt.query_row(params![TABS_STATE_KEY], |row| row.get(0))
                .optional()
        });

    match raw {
        Ok(Some(json)) => serde_json::from_str::<PersistedAppState>(&json).unwrap_or_default(),
        _ => PersistedAppState::default(),
    }
}

/// Persiste `PersistedAppState` em um arquivo SQLite no disco com proteção contra arquivo corrompido.
pub fn save_app_state_to_path(
    db_path: &Path,
    state: &PersistedAppState,
) -> Result<(), AppStateError> {
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let db = match Connection::open(db_path).and_then(|conn| {
        init_app_state_schema(&conn)?;
        Ok(conn)
    }) {
        Ok(conn) => conn,
        Err(_) => {
            // Se o arquivo anterior estiver corrompido, move-o para backup e recria limpo
            if db_path.exists() {
                let backup = db_path.with_extension("db.corrupt");
                let _ = fs::rename(db_path, backup);
            }
            let fresh = Connection::open(db_path)?;
            init_app_state_schema(&fresh)?;
            fresh
        }
    };

    save_app_state_to_db(&db, state)
}

/// Carrega `PersistedAppState` a partir de um arquivo SQLite no disco.
/// Nunca falha nem derruba o app se o arquivo estiver corrompido ou truncado.
pub fn load_app_state_from_path(db_path: &Path) -> PersistedAppState {
    if !db_path.exists() {
        return PersistedAppState::default();
    }

    match Connection::open(db_path) {
        Ok(db) => load_app_state_from_db(&db),
        Err(_) => PersistedAppState::default(),
    }
}
