use std::sync::Arc;
use std::time::Duration;

use sequelei_desktop::{
    connect_sql_server, ExecuteQueryOptions, ExecutionRegistry, MockSqlExecutor, QueryResult,
    SqlConnectionError, SqlValue, DEFAULT_QUERY_TIMEOUT_MS,
};

#[test]
fn default_timeout_is_30_seconds_and_respects_custom_override() {
    assert_eq!(DEFAULT_QUERY_TIMEOUT_MS, 30_000);

    let default_opts = ExecuteQueryOptions::default();
    assert_eq!(default_opts.resolved_timeout(), Duration::from_secs(30));

    let zero_opts = ExecuteQueryOptions {
        timeout_ms: Some(0),
        ..Default::default()
    };
    assert_eq!(zero_opts.resolved_timeout(), Duration::from_secs(30));

    let custom_opts = ExecuteQueryOptions {
        timeout_ms: Some(5_000),
        ..Default::default()
    };
    assert_eq!(custom_opts.resolved_timeout(), Duration::from_secs(5));
}

#[tokio::test]
async fn executes_query_via_registry_and_cleans_up_active_entry() {
    let registry = ExecutionRegistry::new();
    let sql = "select 1 as ok, 'Sequelei' as app";
    let mut executor = MockSqlExecutor::new().with_response(
        sql,
        QueryResult {
            columns: vec!["ok".to_string(), "app".to_string()],
            rows: vec![vec![
                SqlValue::Int(1),
                SqlValue::Text("Sequelei".to_string()),
            ]],
            rows_affected: 1,
        },
    );

    let response = registry
        .execute_with_registry(
            &mut executor,
            sql,
            ExecuteQueryOptions {
                execution_id: Some("exec-unit-1".to_string()),
                timeout_ms: Some(5_000),
                ..Default::default()
            },
        )
        .await
        .expect("execução via registry deve suceder");

    assert_eq!(response.execution_id, "exec-unit-1");
    assert_eq!(response.columns, vec!["ok", "app"]);
    assert_eq!(response.rows.len(), 1);
    assert_eq!(response.rows_affected, 1);
    assert_eq!(
        registry.active_count(),
        0,
        "entrada deve ser removida do registro após término"
    );
}

#[tokio::test]
async fn real_cancellation_via_execution_registry_aborts_in_flight_query() {
    let registry = Arc::new(ExecutionRegistry::new());
    let mut slow_executor = MockSqlExecutor::new().with_delay(Duration::from_secs(5));

    let cancel_registry = Arc::clone(&registry);
    let cancel_task = tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(30)).await;
        cancel_registry.cancel("exec-cancel-1")
    });

    let result = registry
        .execute_with_registry(
            &mut slow_executor,
            "WAITFOR DELAY '00:00:05'",
            ExecuteQueryOptions {
                execution_id: Some("exec-cancel-1".to_string()),
                timeout_ms: Some(30_000),
                ..Default::default()
            },
        )
        .await;

    let was_cancelled = cancel_task.await.unwrap();
    assert!(was_cancelled, "cancel() deve localizar a execução em andamento");
    assert!(matches!(result, Err(SqlConnectionError::Cancelled)));
    assert_eq!(registry.active_count(), 0);
}

#[tokio::test]
async fn real_docker_sql_server_query_execution_and_cancellation_when_env_present() {
    let Ok(conn_str) = std::env::var("TEST_SQL_SERVER_CONN") else {
        return;
    };

    let registry = Arc::new(ExecutionRegistry::new());
    let mut client = connect_sql_server(&conn_str)
        .await
        .expect("conexão ao SQL Server Docker falhou");

    let response = registry
        .execute_with_registry(
            &mut client,
            "select 1 as ok",
            ExecuteQueryOptions {
                execution_id: Some("docker-exec-1".to_string()),
                timeout_ms: Some(10_000),
                ..Default::default()
            },
        )
        .await
        .expect("execução real no SQL Server Docker falhou");
    assert_eq!(response.rows[0][0], SqlValue::Int(1));

    // Cancelamento real de WAITFOR DELAY no SQL Server Docker
    let mut slow_client = connect_sql_server(&conn_str)
        .await
        .expect("segunda conexão ao SQL Server Docker falhou");
    let cancel_registry = Arc::clone(&registry);
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(150)).await;
        cancel_registry.cancel("docker-cancel-1");
    });

    let cancelled = registry
        .execute_with_registry(
            &mut slow_client,
            "WAITFOR DELAY '00:00:10'",
            ExecuteQueryOptions {
                execution_id: Some("docker-cancel-1".to_string()),
                timeout_ms: Some(30_000),
                ..Default::default()
            },
        )
        .await;
    assert!(matches!(cancelled, Err(SqlConnectionError::Cancelled)));
}
