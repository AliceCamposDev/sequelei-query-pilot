use sequelei_desktop::{connect_sql_server, SqlConnectionError};

#[tokio::test]
async fn invalid_connection_string_returns_typed_error() {
    let result = connect_sql_server("not a connection string").await;

    assert!(matches!(
        result,
        Err(SqlConnectionError::InvalidConnectionString(_))
    ));
}
