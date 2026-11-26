use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use async_trait::async_trait;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tiberius::Client;
use tokio::net::TcpStream;
use tokio_util::compat::TokioAsyncWriteCompatExt;

use crate::credential_store::{CredentialBackend, CredentialError, CredentialStore, KeyringBackend};
use crate::sql_connection::{
    query_scalar_int, AuthMethod, ConnectionOptions, SqlConnectionError,
};

static ID_SEQUENCE: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionEnvironment {
    Dev,
    Staging,
    Production,
}

impl ConnectionEnvironment {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Dev => "dev",
            Self::Staging => "staging",
            Self::Production => "production",
        }
    }

    fn from_db_str(value: &str) -> Self {
        match value {
            "staging" => Self::Staging,
            "production" => Self::Production,
            _ => Self::Dev,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum CreateAuthPayload {
    Sql { user: String, password: String },
    WindowsSspi,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateConnectionPayload {
    pub name: String,
    pub host: String,
    pub port: Option<u16>,
    pub database: Option<String>,
    pub auth: CreateAuthPayload,
    pub encrypt: Option<bool>,
    pub trust_server_certificate: Option<bool>,
    pub environment: Option<ConnectionEnvironment>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionSummary {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub database: Option<String>,
    pub auth_type: String,
    pub username: Option<String>,
    pub encrypt: bool,
    pub trust_server_certificate: bool,
    pub environment: ConnectionEnvironment,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub ok: bool,
    pub latency_ms: u64,
    pub message: String,
}

#[derive(Debug, Error)]
pub enum ConnectionManagerError {
    #[error("validation error: {0}")]
    Validation(String),

    #[error("connection not found: {0}")]
    NotFound(String),

    #[error("database persistence error: {0}")]
    Storage(#[from] rusqlite::Error),

    #[error("credential store error: {0}")]
    Credential(#[from] CredentialError),

    #[error("SQL Server connection test failed: {0}")]
    ConnectionTest(#[from] SqlConnectionError),
}

#[async_trait]
pub trait ConnectionTester: Send + Sync {
    async fn test(
        &self,
        options: &ConnectionOptions,
    ) -> Result<ConnectionTestResult, SqlConnectionError>;
}

/// Implementação real de teste de conexão via `tiberius` executando `select 1`.
#[derive(Debug, Default, Clone, Copy)]
pub struct TiberiusConnectionTester;

#[async_trait]
impl ConnectionTester for TiberiusConnectionTester {
    async fn test(
        &self,
        options: &ConnectionOptions,
    ) -> Result<ConnectionTestResult, SqlConnectionError> {
        let config = options.to_tiberius_config()?;
        let timeout = options.connection_timeout.unwrap_or(Duration::from_secs(5));
        let started_at = Instant::now();

        let connect_and_ping = async {
            let tcp = TcpStream::connect(config.get_addr())
                .await
                .map_err(SqlConnectionError::Network)?;
            tcp.set_nodelay(true).map_err(SqlConnectionError::Network)?;

            let mut client = Client::connect(config, tcp.compat_write())
                .await
                .map_err(SqlConnectionError::Handshake)?;

            let scalar = query_scalar_int(&mut client, "select 1").await?;
            if scalar != Some(1) {
                return Err(SqlConnectionError::Pool(
                    "resposta inesperada ao executar health check select 1".to_string(),
                ));
            }
            Ok(())
        };

        match tokio::time::timeout(timeout, connect_and_ping).await {
            Ok(Ok(())) => Ok(ConnectionTestResult {
                ok: true,
                latency_ms: started_at.elapsed().as_millis() as u64,
                message: "Conexão validada com sucesso".to_string(),
            }),
            Ok(Err(err)) => Err(err),
            Err(_) => Err(SqlConnectionError::Timeout(timeout)),
        }
    }
}

/// Tester mock para testes determinísticos sem SQL Server real.
#[derive(Debug, Clone)]
pub struct MockConnectionTester {
    latency_ms: u64,
    fail_message: Option<String>,
}

impl MockConnectionTester {
    pub fn ok(latency_ms: u64) -> Self {
        Self {
            latency_ms,
            fail_message: None,
        }
    }

    pub fn failing(message: impl Into<String>) -> Self {
        Self {
            latency_ms: 0,
            fail_message: Some(message.into()),
        }
    }
}

#[async_trait]
impl ConnectionTester for MockConnectionTester {
    async fn test(
        &self,
        options: &ConnectionOptions,
    ) -> Result<ConnectionTestResult, SqlConnectionError> {
        options.validate_tls_policy()?;
        if let Some(ref message) = self.fail_message {
            return Err(SqlConnectionError::Pool(message.clone()));
        }

        Ok(ConnectionTestResult {
            ok: true,
            latency_ms: self.latency_ms,
            message: "Conexão validada com sucesso".to_string(),
        })
    }
}

pub struct ConnectionManager<B: CredentialBackend = KeyringBackend> {
    credentials: CredentialStore<B>,
}

impl ConnectionManager<KeyringBackend> {
    pub fn system() -> Self {
        Self::new(CredentialStore::system())
    }
}

impl<B: CredentialBackend> ConnectionManager<B> {
    pub fn new(credentials: CredentialStore<B>) -> Self {
        Self { credentials }
    }

    pub fn init_schema(db: &Connection) -> Result<(), ConnectionManagerError> {
        db.execute(
            "CREATE TABLE IF NOT EXISTS connection (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL DEFAULT 1433,
                database TEXT,
                auth_type TEXT NOT NULL,
                username TEXT,
                encrypt INTEGER NOT NULL DEFAULT 1,
                trust_server_certificate INTEGER NOT NULL DEFAULT 0,
                environment TEXT NOT NULL DEFAULT 'dev',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;
        Ok(())
    }

    pub fn list_connections(
        &self,
        db: &Connection,
    ) -> Result<Vec<ConnectionSummary>, ConnectionManagerError> {
        let mut statement = db.prepare(
            "SELECT id, name, host, port, database, auth_type, username, encrypt,
                    trust_server_certificate, environment, created_at
             FROM connection
             ORDER BY created_at ASC, name ASC",
        )?;

        let rows = statement.query_map([], map_summary_row)?;
        let mut connections = Vec::new();
        for row in rows {
            connections.push(row?);
        }

        Ok(connections)
    }

    pub fn create_connection(
        &self,
        db: &Connection,
        payload: CreateConnectionPayload,
    ) -> Result<ConnectionSummary, ConnectionManagerError> {
        let validated = validate_create_payload(payload)?;
        let id = generate_connection_id();
        let cred_key = credential_key(&id);

        if let Some(ref secret) = validated.password {
            self.credentials.save_credential(&cred_key, secret)?;
        }

        let insert_result = db.execute(
            "INSERT INTO connection (
                id, name, host, port, database, auth_type, username,
                encrypt, trust_server_certificate, environment
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                id,
                validated.name,
                validated.host,
                validated.port,
                validated.database,
                validated.auth_type,
                validated.username,
                i32::from(validated.encrypt),
                i32::from(validated.trust_server_certificate),
                validated.environment.as_str(),
            ],
        );

        if let Err(err) = insert_result {
            if validated.password.is_some() {
                let _ = self.credentials.delete_credential(&cred_key);
            }
            return Err(ConnectionManagerError::Storage(err));
        }

        find_summary_by_id(db, &id)?.ok_or_else(|| ConnectionManagerError::NotFound(id))
    }

    pub fn resolve_connection_options(
        &self,
        db: &Connection,
        id: &str,
    ) -> Result<ConnectionOptions, ConnectionManagerError> {
        let valid_id = validate_id(id)?;
        let summary = find_summary_by_id(db, valid_id)?
            .ok_or_else(|| ConnectionManagerError::NotFound(valid_id.to_string()))?;

        let auth = if summary.auth_type == "sql" {
            let user = summary.username.clone().ok_or_else(|| {
                ConnectionManagerError::Validation(
                    "conexão SQL sem usuário associado no armazenamento".to_string(),
                )
            })?;
            let secret = self
                .credentials
                .load_credential(&credential_key(&summary.id))?;
            AuthMethod::Sql {
                user,
                password: secret.expose_secret().to_string(),
            }
        } else {
            AuthMethod::WindowsSspi
        };

        Ok(ConnectionOptions {
            host: summary.host,
            port: summary.port,
            database: summary.database,
            auth,
            encrypt: summary.encrypt,
            trust_server_certificate: summary.trust_server_certificate,
            connection_timeout: Some(Duration::from_secs(5)),
        })
    }

    pub async fn test_connection<T: ConnectionTester>(
        &self,
        db: &Connection,
        tester: &T,
        id: &str,
    ) -> Result<ConnectionTestResult, ConnectionManagerError> {
        let options = self.resolve_connection_options(db, id)?;
        let result = tester.test(&options).await?;
        Ok(result)
    }

    pub fn delete_connection(
        &self,
        db: &Connection,
        id: &str,
    ) -> Result<(), ConnectionManagerError> {
        let valid_id = validate_id(id)?;
        let summary = find_summary_by_id(db, valid_id)?
            .ok_or_else(|| ConnectionManagerError::NotFound(valid_id.to_string()))?;

        db.execute("DELETE FROM connection WHERE id = ?1", params![summary.id])?;

        if summary.auth_type == "sql" {
            match self
                .credentials
                .delete_credential(&credential_key(&summary.id))
            {
                Ok(()) | Err(CredentialError::NotFound(_)) => {}
                Err(err) => return Err(ConnectionManagerError::Credential(err)),
            }
        }

        Ok(())
    }
}

struct ValidatedConnection {
    name: String,
    host: String,
    port: u16,
    database: Option<String>,
    auth_type: &'static str,
    username: Option<String>,
    password: Option<String>,
    encrypt: bool,
    trust_server_certificate: bool,
    environment: ConnectionEnvironment,
}

fn validate_create_payload(
    payload: CreateConnectionPayload,
) -> Result<ValidatedConnection, ConnectionManagerError> {
    let name = payload.name.trim().to_string();
    if name.is_empty() || name.len() > 100 || contains_control_chars(&name) {
        return Err(ConnectionManagerError::Validation(
            "nome da conexão deve ter entre 1 e 100 caracteres válidos".to_string(),
        ));
    }

    let host = payload.host.trim().to_string();
    if host.is_empty()
        || host.len() > 255
        || contains_control_chars(&host)
        || host.chars().any(|c| c.is_whitespace() || c == ';')
    {
        return Err(ConnectionManagerError::Validation(
            "host inválido: não pode estar vazio nem conter espaços ou ';'".to_string(),
        ));
    }

    let port = payload.port.unwrap_or(1433);
    if port == 0 {
        return Err(ConnectionManagerError::Validation(
            "porta deve estar entre 1 e 65535".to_string(),
        ));
    }

    let database = match payload.database {
        Some(raw) => {
            let trimmed = raw.trim().to_string();
            if trimmed.is_empty() {
                None
            } else if trimmed.len() > 128
                || contains_control_chars(&trimmed)
                || trimmed.contains(';')
            {
                return Err(ConnectionManagerError::Validation(
                    "nome do banco de dados inválido".to_string(),
                ));
            } else {
                Some(trimmed)
            }
        }
        None => None,
    };

    let encrypt = payload.encrypt.unwrap_or(true);
    let trust_server_certificate = payload.trust_server_certificate.unwrap_or(false);
    let environment = payload.environment.unwrap_or(ConnectionEnvironment::Dev);

    let (auth_type, username, password) = match payload.auth {
        CreateAuthPayload::Sql { user, password } => {
            let trimmed_user = user.trim().to_string();
            if trimmed_user.is_empty()
                || trimmed_user.len() > 128
                || contains_control_chars(&trimmed_user)
                || trimmed_user.contains(';')
            {
                return Err(ConnectionManagerError::Validation(
                    "usuário SQL inválido".to_string(),
                ));
            }
            if password.is_empty() {
                return Err(ConnectionManagerError::Validation(
                    "senha SQL é obrigatória para autenticação SQL".to_string(),
                ));
            }
            ("sql", Some(trimmed_user), Some(password))
        }
        CreateAuthPayload::WindowsSspi => ("windows_sspi", None, None),
    };

    // Aplica política SEC-06 (TLS obrigatório para hosts remotos)
    let policy_probe = ConnectionOptions {
        host: host.clone(),
        port,
        database: database.clone(),
        auth: AuthMethod::WindowsSspi,
        encrypt,
        trust_server_certificate,
        connection_timeout: None,
    };
    policy_probe
        .validate_tls_policy()
        .map_err(|err| ConnectionManagerError::Validation(err.to_string()))?;

    Ok(ValidatedConnection {
        name,
        host,
        port,
        database,
        auth_type,
        username,
        password,
        encrypt,
        trust_server_certificate,
        environment,
    })
}

fn validate_id(id: &str) -> Result<&str, ConnectionManagerError> {
    let trimmed = id.trim();
    if trimmed.is_empty()
        || trimmed.len() > 64
        || !trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(ConnectionManagerError::Validation(
            "id de conexão inválido".to_string(),
        ));
    }
    Ok(trimmed)
}

fn contains_control_chars(value: &str) -> bool {
    value.chars().any(|c| c.is_control())
}

fn credential_key(connection_id: &str) -> String {
    format!("connection:{connection_id}")
}

fn generate_connection_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let seq = ID_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    format!("conn-{nanos:x}-{seq}")
}

fn find_summary_by_id(
    db: &Connection,
    id: &str,
) -> Result<Option<ConnectionSummary>, rusqlite::Error> {
    let mut statement = db.prepare(
        "SELECT id, name, host, port, database, auth_type, username, encrypt,
                trust_server_certificate, environment, created_at
         FROM connection
         WHERE id = ?1",
    )?;

    statement
        .query_row(params![id], map_summary_row)
        .optional()
}

fn map_summary_row(row: &rusqlite::Row<'_>) -> Result<ConnectionSummary, rusqlite::Error> {
    let encrypt_int: i32 = row.get(7)?;
    let trust_int: i32 = row.get(8)?;
    let env_str: String = row.get(9)?;

    Ok(ConnectionSummary {
        id: row.get(0)?,
        name: row.get(1)?,
        host: row.get(2)?,
        port: row.get::<_, u16>(3)?,
        database: row.get(4)?,
        auth_type: row.get(5)?,
        username: row.get(6)?,
        encrypt: encrypt_int != 0,
        trust_server_certificate: trust_int != 0,
        environment: ConnectionEnvironment::from_db_str(&env_str),
        created_at: row.get(10)?,
    })
}
