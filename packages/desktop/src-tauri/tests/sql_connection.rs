use std::time::Duration;

use sequelei_desktop::{
    connect_sql_server, create_sql_server_pool, execute_query, query_scalar_int, AuthMethod,
    ConnectionOptions, MockSqlExecutor, QueryResult, SqlConnectionError, SqlValue,
};
use tokio_util::sync::CancellationToken;

#[tokio::test]
async fn invalid_connection_string_returns_typed_error() {
    let result = connect_sql_server("not a connection string").await;

    assert!(matches!(
        result,
        Err(SqlConnectionError::InvalidConnectionString(_))
    ));
}

#[tokio::test]
async fn tls_mandatory_for_remote_host() {
    let remote_options_without_tls = ConnectionOptions {
        host: "sqlserver.empresa.com.br".to_string(),
        port: 1433,
        database: Some("producao".to_string()),
        auth: AuthMethod::Sql {
            user: "sa".to_string(),
            password: "secret_password".to_string(),
        },
        encrypt: false,
        trust_server_certificate: false,
        connection_timeout: Some(Duration::from_secs(5)),
    };

    let result = remote_options_without_tls.to_tiberius_config();
    assert!(
        matches!(result, Err(SqlConnectionError::TlsRequiredForRemote(ref h)) if h == "sqlserver.empresa.com.br"),
        "Conexão remota sem TLS deve ser rejeitada obrigatoriamente"
    );

    // Com TLS habilitado, a configuração remota deve ser gerada com sucesso
    let mut remote_with_tls = remote_options_without_tls;
    remote_with_tls.encrypt = true;
    let config_result = remote_with_tls.to_tiberius_config();
    assert!(config_result.is_ok());
}

#[tokio::test]
async fn tls_allowed_or_disabled_for_local_host() {
    let local_options = ConnectionOptions {
        host: "localhost".to_string(),
        port: 1433,
        database: Some("devdb".to_string()),
        auth: AuthMethod::WindowsSspi,
        encrypt: false,
        trust_server_certificate: true,
        connection_timeout: Some(Duration::from_secs(3)),
    };

    assert!(
        local_options.to_tiberius_config().is_ok(),
        "Host local deve permitir conexão sem TLS para ambiente de desenvolvimento"
    );
}

#[tokio::test]
async fn auth_methods_windows_sspi_and_sql_auth_configured_properly() {
    let sql_auth_options = ConnectionOptions {
        host: "127.0.0.1".to_string(),
        port: 1433,
        database: Some("master".to_string()),
        auth: AuthMethod::Sql {
            user: "usuario_sql".to_string(),
            password: "senha_forte".to_string(),
        },
        encrypt: false,
        trust_server_certificate: true,
        connection_timeout: None,
    };
    assert!(sql_auth_options.to_tiberius_config().is_ok());

    let sspi_options = ConnectionOptions {
        host: "127.0.0.1".to_string(),
        port: 1433,
        database: Some("master".to_string()),
        auth: AuthMethod::WindowsSspi,
        encrypt: false,
        trust_server_certificate: true,
        connection_timeout: None,
    };
    assert!(sspi_options.to_tiberius_config().is_ok());
}

#[tokio::test]
async fn pool_creates_successfully_with_deadpool() {
    let options = ConnectionOptions {
        host: "127.0.0.1".to_string(),
        port: 1433,
        database: Some("tempdb".to_string()),
        auth: AuthMethod::Sql {
            user: "sa".to_string(),
            password: "password123".to_string(),
        },
        encrypt: false,
        trust_server_certificate: true,
        connection_timeout: Some(Duration::from_secs(5)),
    };

    let pool_result = create_sql_server_pool(&options, 10);
    assert!(pool_result.is_ok(), "Deve inicializar o pool deadpool com sucesso");

    let pool = pool_result.unwrap();
    assert_eq!(pool.status().max_size, 10);
}

#[tokio::test]
async fn test_executes_select_1_and_returns_1() {
    let mut executor = MockSqlExecutor::new();
    let value = query_scalar_int(&mut executor, "select 1").await;

    assert_eq!(value.unwrap(), Some(1));
}

#[tokio::test]
async fn test_executes_select_with_varied_types_int_varchar_decimal_datetime_null() {
    let expected_result = QueryResult {
        columns: vec![
            "col_int".to_string(),
            "col_varchar".to_string(),
            "col_decimal".to_string(),
            "col_datetime".to_string(),
            "col_null".to_string(),
            "col_bool".to_string(),
            "col_float".to_string(),
        ],
        rows: vec![vec![
            SqlValue::Int(42),
            SqlValue::Text("Sequelei QueryPilot".to_string()),
            SqlValue::Decimal("1234.56".to_string()),
            SqlValue::DateTime("2026-10-05T06:00:00".to_string()),
            SqlValue::Null,
            SqlValue::Boolean(true),
            SqlValue::Float(3.14159),
        ]],
        rows_affected: 1,
    };

    let sql = "select 42, 'Sequelei QueryPilot', 1234.56, '2026-10-05T06:00:00', null, 1, 3.14159";
    let mut executor = MockSqlExecutor::new().with_response(sql, expected_result.clone());

    let result = execute_query(&mut executor, sql, None, None).await.unwrap();

    assert_eq!(result.columns.len(), 7);
    assert_eq!(result.rows.len(), 1);
    let row = &result.rows[0];
    assert_eq!(row[0], SqlValue::Int(42));
    assert_eq!(row[1], SqlValue::Text("Sequelei QueryPilot".to_string()));
    assert_eq!(row[2], SqlValue::Decimal("1234.56".to_string()));
    assert_eq!(row[3], SqlValue::DateTime("2026-10-05T06:00:00".to_string()));
    assert_eq!(row[4], SqlValue::Null);
    assert_eq!(row[5], SqlValue::Boolean(true));
    assert_eq!(row[6], SqlValue::Float(3.14159));
}

#[tokio::test]
async fn test_timeout_respected() {
    let mut slow_executor = MockSqlExecutor::new().with_delay(Duration::from_millis(300));
    let timeout = Duration::from_millis(50);

    let result = execute_query(
        &mut slow_executor,
        "WAITFOR DELAY '00:00:01'",
        Some(timeout),
        None,
    )
    .await;

    assert!(matches!(result, Err(SqlConnectionError::Timeout(d)) if d == timeout));
}

#[tokio::test]
async fn test_cancellation_cancelled_by_caller() {
    let mut slow_executor = MockSqlExecutor::new().with_delay(Duration::from_millis(300));
    let cancellation = CancellationToken::new();

    // Dispara cancelamento imediatamente após 20ms
    let cancel_token_clone = cancellation.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(20)).await;
        cancel_token_clone.cancel();
    });

    let result = execute_query(
        &mut slow_executor,
        "select * from big_table",
        Some(Duration::from_secs(5)),
        Some(&cancellation),
    )
    .await;

    assert!(matches!(result, Err(SqlConnectionError::Cancelled)));
}

#[tokio::test]
async fn test_real_sql_server_connection_if_env_present() {
    if let Ok(conn_str) = std::env::var("TEST_SQL_SERVER_CONN") {
        let mut client = connect_sql_server(&conn_str)
            .await
            .expect("Conexão ao SQL Server real falhou");
        let result = execute_query(&mut client, "select 1", Some(Duration::from_secs(10)), None)
            .await
            .expect("select 1 no SQL Server real falhou");
        assert_eq!(result.rows.len(), 1);
        assert_eq!(result.rows[0][0], SqlValue::Int(1));
    }
}
