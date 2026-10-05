use std::io;

use tiberius::{Client, Config};
use thiserror::Error;
use tokio::net::TcpStream;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};

pub type SqlServerClient = Client<Compat<TcpStream>>;

#[derive(Debug, Error)]
pub enum SqlConnectionError {
    #[error("invalid SQL Server connection string: {0}")]
    InvalidConnectionString(#[source] tiberius::error::Error),
    #[error("could not connect to SQL Server: {0}")]
    Network(#[source] io::Error),
    #[error("SQL Server handshake failed: {0}")]
    Handshake(#[source] tiberius::error::Error),
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
