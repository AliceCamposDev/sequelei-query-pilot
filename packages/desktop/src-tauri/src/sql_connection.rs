use std::io;
use std::time::Duration;

use async_trait::async_trait;
use deadpool::managed::{Manager, Metrics, Pool, RecycleResult};
use serde::{Deserialize, Serialize};
use tiberius::{Client, ColumnData, Config};
use thiserror::Error;
use tokio::net::TcpStream;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};
use tokio_util::sync::CancellationToken;

pub type SqlServerClient = Client<Compat<TcpStream>>;

#[derive(Debug, Error)]
pub enum SqlConnectionError {
    #[error("invalid SQL Server connection string: {0}")]
    InvalidConnectionString(#[source] tiberius::error::Error),

    #[error("could not connect to SQL Server: {0}")]
    Network(#[source] io::Error),

    #[error("SQL Server handshake failed: {0}")]
    Handshake(#[source] tiberius::error::Error),

    #[error("SQL Server query execution failed: {0}")]
    Query(#[source] tiberius::error::Error),

    #[error("TLS is mandatory for remote host '{0}', but connection options have encryption disabled")]
    TlsRequiredForRemote(String),

    #[error("SQL query execution timed out after {0:?}")]
    Timeout(Duration),

    #[error("SQL query execution was cancelled by caller")]
    Cancelled,

    #[error("connection pool error: {0}")]
    Pool(String),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", content = "value")]
pub enum SqlValue {
    Null,
    Int(i64),
    Float(f64),
    Text(String),
    Decimal(String),
    DateTime(String),
    Boolean(bool),
    Binary(Vec<u8>),
}

impl SqlValue {
    pub fn as_i64(&self) -> Option<i64> {
        match self {
            Self::Int(v) => Some(*v),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Self::Text(v) => Some(v.as_str()),
            _ => None,
        }
    }

    pub fn is_null(&self) -> bool {
        matches!(self, Self::Null)
    }
}

impl<'a> From<ColumnData<'a>> for SqlValue {
    fn from(data: ColumnData<'a>) -> Self {
        match data {
            ColumnData::U8(Some(v)) => SqlValue::Int(v as i64),
            ColumnData::I16(Some(v)) => SqlValue::Int(v as i64),
            ColumnData::I32(Some(v)) => SqlValue::Int(v as i64),
            ColumnData::I64(Some(v)) => SqlValue::Int(v),
            ColumnData::F32(Some(v)) => SqlValue::Float(v as f64),
            ColumnData::F64(Some(v)) => SqlValue::Float(v),
            ColumnData::Bit(Some(v)) => SqlValue::Boolean(v),
            ColumnData::String(Some(v)) => SqlValue::Text(v.to_string()),
            ColumnData::Guid(Some(v)) => SqlValue::Text(v.to_string()),
            ColumnData::Binary(Some(v)) => SqlValue::Binary(v.to_vec()),
            ColumnData::Numeric(Some(v)) => SqlValue::Decimal(v.to_string()),
            ColumnData::DateTime(Some(v)) => SqlValue::DateTime(format!("{:?}", v)),
            ColumnData::SmallDateTime(Some(v)) => SqlValue::DateTime(format!("{:?}", v)),
            ColumnData::Time(Some(v)) => SqlValue::DateTime(format!("{:?}", v)),
            ColumnData::Date(Some(v)) => SqlValue::DateTime(format!("{:?}", v)),
            ColumnData::DateTime2(Some(v)) => SqlValue::DateTime(format!("{:?}", v)),
            ColumnData::DateTimeOffset(Some(v)) => SqlValue::DateTime(format!("{:?}", v)),
            ColumnData::Xml(Some(v)) => SqlValue::Text(v.to_string()),
            _ => SqlValue::Null,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<SqlValue>>,
    pub rows_affected: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum AuthMethod {
    Sql { user: String, password: String },
    WindowsSspi,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionOptions {
    pub host: String,
    pub port: u16,
    pub database: Option<String>,
    pub auth: AuthMethod,
    pub encrypt: bool,
    pub trust_server_certificate: bool,
    pub connection_timeout: Option<Duration>,
}

impl ConnectionOptions {
    pub fn is_remote(&self) -> bool {
        let h = self.host.trim().to_lowercase();
        h != "localhost"
            && h != "127.0.0.1"
            && h != "::1"
            && h != "."
            && h != "(local)"
            && !h.starts_with("127.")
    }

    pub fn validate_tls_policy(&self) -> Result<(), SqlConnectionError> {
        if self.is_remote() && !self.encrypt {
            return Err(SqlConnectionError::TlsRequiredForRemote(self.host.clone()));
        }
        Ok(())
    }

    pub fn to_tiberius_config(&self) -> Result<Config, SqlConnectionError> {
        self.validate_tls_policy()?;

        let mut config = Config::new();
        config.host(&self.host);
        config.port(self.port);

        if let Some(ref db) = self.database {
            config.database(db);
        }

        match &self.auth {
            AuthMethod::Sql { user, password } => {
                config.authentication(tiberius::AuthMethod::sql_server(user, password));
            }
            AuthMethod::WindowsSspi => {
                config.authentication(tiberius::AuthMethod::Integrated);
            }
        }

        if self.encrypt {
            config.encryption(tiberius::EncryptionLevel::Required);
        } else {
            config.encryption(tiberius::EncryptionLevel::Off);
        }

        if self.trust_server_certificate {
            config.trust_cert();
        }

        Ok(config)
    }
}

pub struct SqlServerConnectionManager {
    config: Config,
}

impl SqlServerConnectionManager {
    pub fn new(config: Config) -> Self {
        Self { config }
    }
}

impl Manager for SqlServerConnectionManager {
    type Type = SqlServerClient;
    type Error = SqlConnectionError;

    async fn create(&self) -> Result<SqlServerClient, SqlConnectionError> {
        let tcp = TcpStream::connect(self.config.get_addr())
            .await
            .map_err(SqlConnectionError::Network)?;
        tcp.set_nodelay(true).map_err(SqlConnectionError::Network)?;

        Client::connect(self.config.clone(), tcp.compat_write())
            .await
            .map_err(SqlConnectionError::Handshake)
    }

    async fn recycle(
        &self,
        _client: &mut SqlServerClient,
        _metrics: &Metrics,
    ) -> RecycleResult<SqlConnectionError> {
        Ok(())
    }
}

pub type SqlServerPool = Pool<SqlServerConnectionManager>;

pub fn create_sql_server_pool(
    options: &ConnectionOptions,
    max_size: usize,
) -> Result<SqlServerPool, SqlConnectionError> {
    let config = options.to_tiberius_config()?;
    let manager = SqlServerConnectionManager::new(config);
    SqlServerPool::builder(manager)
        .max_size(max_size)
        .build()
        .map_err(|error| SqlConnectionError::Pool(error.to_string()))
}

pub async fn connect_with_options(
    options: &ConnectionOptions,
) -> Result<SqlServerClient, SqlConnectionError> {
    let config = options.to_tiberius_config()?;
    let tcp = TcpStream::connect(config.get_addr())
        .await
        .map_err(SqlConnectionError::Network)?;

    tcp.set_nodelay(true).map_err(SqlConnectionError::Network)?;

    Client::connect(config, tcp.compat_write())
        .await
        .map_err(SqlConnectionError::Handshake)
}

pub async fn connect_sql_server(
    connection_string: &str,
) -> Result<SqlServerClient, SqlConnectionError> {
    let config = Config::from_ado_string(connection_string)
        .map_err(SqlConnectionError::InvalidConnectionString)?;
    let tcp = TcpStream::connect(config.get_addr())
        .await
        .map_err(SqlConnectionError::Network)?;

    tcp.set_nodelay(true).map_err(SqlConnectionError::Network)?;

    Client::connect(config, tcp.compat_write())
        .await
        .map_err(SqlConnectionError::Handshake)
}

#[async_trait]
pub trait SqlExecutor: Send + Sync {
    async fn execute(&mut self, sql: &str) -> Result<QueryResult, SqlConnectionError>;
}

#[async_trait]
impl SqlExecutor for SqlServerClient {
    async fn execute(&mut self, sql: &str) -> Result<QueryResult, SqlConnectionError> {
        let stream = self
            .simple_query(sql)
            .await
            .map_err(SqlConnectionError::Query)?;

        let mut columns = Vec::new();
        let mut rows = Vec::new();

        let results = stream
            .into_results()
            .await
            .map_err(SqlConnectionError::Query)?;

        for result_set in results {
            if result_set.is_empty() {
                continue;
            }
            let mut set_columns = Vec::new();
            let mut set_rows = Vec::with_capacity(result_set.len());
            for row in result_set {
                if set_columns.is_empty() {
                    set_columns = row
                        .columns()
                        .iter()
                        .map(|c| c.name().to_string())
                        .collect();
                }
                let row_values: Vec<SqlValue> = row.into_iter().map(SqlValue::from).collect();
                set_rows.push(row_values);
            }
            columns = set_columns;
            rows = set_rows;
        }

        let rows_affected = rows.len() as u64;

        Ok(QueryResult {
            columns,
            rows,
            rows_affected,
        })
    }
}

pub async fn execute_query<E: SqlExecutor>(
    executor: &mut E,
    sql: &str,
    timeout: Option<Duration>,
    cancellation: Option<&CancellationToken>,
) -> Result<QueryResult, SqlConnectionError> {
    let query_future = executor.execute(sql);

    let cancellable = async {
        if let Some(token) = cancellation {
            tokio::select! {
                _ = token.cancelled() => Err(SqlConnectionError::Cancelled),
                res = query_future => res,
            }
        } else {
            query_future.await
        }
    };

    if let Some(duration) = timeout {
        match tokio::time::timeout(duration, cancellable).await {
            Ok(result) => result,
            Err(_) => Err(SqlConnectionError::Timeout(duration)),
        }
    } else {
        cancellable.await
    }
}

pub async fn query_scalar_int<E: SqlExecutor>(
    executor: &mut E,
    sql: &str,
) -> Result<Option<i64>, SqlConnectionError> {
    let result = execute_query(executor, sql, None, None).await?;
    let val = result
        .rows
        .first()
        .and_then(|row| row.first())
        .and_then(|v| v.as_i64());
    Ok(val)
}

#[derive(Default, Clone)]
pub struct MockSqlExecutor {
    delay: Option<Duration>,
    responses: std::collections::HashMap<String, QueryResult>,
    default_response: Option<QueryResult>,
}

impl MockSqlExecutor {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_response(mut self, sql: impl Into<String>, result: QueryResult) -> Self {
        self.responses.insert(sql.into(), result);
        self
    }

    pub fn with_delay(mut self, delay: Duration) -> Self {
        self.delay = Some(delay);
        self
    }

    pub fn with_default_response(mut self, result: QueryResult) -> Self {
        self.default_response = Some(result);
        self
    }
}

#[async_trait]
impl SqlExecutor for MockSqlExecutor {
    async fn execute(&mut self, sql: &str) -> Result<QueryResult, SqlConnectionError> {
        if let Some(delay) = self.delay {
            tokio::time::sleep(delay).await;
        }

        if let Some(res) = self.responses.get(sql) {
            return Ok(res.clone());
        }

        if let Some(ref res) = self.default_response {
            return Ok(res.clone());
        }

        if sql.trim().to_lowercase() == "select 1" {
            return Ok(QueryResult {
                columns: vec!["".to_string()],
                rows: vec![vec![SqlValue::Int(1)]],
                rows_affected: 1,
            });
        }

        Ok(QueryResult {
            columns: vec![],
            rows: vec![],
            rows_affected: 0,
        })
    }
}
