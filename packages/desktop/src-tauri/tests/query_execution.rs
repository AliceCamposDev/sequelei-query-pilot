use std::sync::Arc;
use std::time::{Duration, Instant};

use sequelei_desktop::{
    connect_sql_server, stream_result_chunks, ExecuteQueryOptions, ExecuteQueryResponse,
    ExecutionRegistry, MockSqlExecutor, QueryResult, ResultChunk, SqlConnectionError, SqlValue,
    DEFAULT_QUERY_TIMEOUT_MS, DEFAULT_RESULT_CHUNK_SIZE,
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

#[tokio::test]
async fn execute_query_preserves_int_string_decimal_date_null_boolean_and_metadata() {
    let registry = ExecutionRegistry::new();
    let sql = "select Id, Nome, Valor, CriadoEm, Obs, Ativo from dbo.Pedidos";
    let mut executor = MockSqlExecutor::new().with_response(
        sql,
        QueryResult {
            columns: vec![
                "Id".to_string(),
                "Nome".to_string(),
                "Valor".to_string(),
                "CriadoEm".to_string(),
                "Obs".to_string(),
                "Ativo".to_string(),
            ],
            rows: vec![vec![
                SqlValue::Int(101),
                SqlValue::Text("Alice".to_string()),
                SqlValue::Decimal("1599.90".to_string()),
                SqlValue::DateTime("2026-11-25T23:00:00".to_string()),
                SqlValue::Null,
                SqlValue::Boolean(true),
            ]],
            rows_affected: 1,
        },
    );

    let response = registry
        .execute_with_registry(&mut executor, sql, ExecuteQueryOptions::default())
        .await
        .expect("execução deve retornar tipos preservados");

    assert_eq!(
        response.columns,
        vec!["Id", "Nome", "Valor", "CriadoEm", "Obs", "Ativo"]
    );
    assert_eq!(response.rows_affected, 1);
    assert!(response.duration_ms < 5_000);
    assert_eq!(
        response.inferred_column_types(),
        vec!["int", "string", "decimal", "date", "null", "boolean"]
    );

    let compact_json = response
        .to_compact_json()
        .expect("serialização JSON compacta deve suceder");
    let parsed: serde_json::Value =
        serde_json::from_str(&compact_json).expect("JSON compacto deve ser válido");

    assert_eq!(parsed["columns"], serde_json::json!(["Id", "Nome", "Valor", "CriadoEm", "Obs", "Ativo"]));
    assert_eq!(parsed["columnTypes"], serde_json::json!(["int", "string", "decimal", "date", "null", "boolean"]));
    assert_eq!(parsed["rows"][0][0], serde_json::json!(101));
    assert_eq!(parsed["rows"][0][1], serde_json::json!("Alice"));
    assert_eq!(parsed["rows"][0][2], serde_json::json!("1599.90"));
    assert_eq!(parsed["rows"][0][3], serde_json::json!("2026-11-25T23:00:00"));
    assert!(parsed["rows"][0][4].is_null());
    assert_eq!(parsed["rows"][0][5], serde_json::json!(true));
    assert_eq!(parsed["rowsAffected"], serde_json::json!(1));
}

#[test]
fn compact_json_serialization_of_100k_rows_completes_under_2_seconds() {
    let row_count = 100_000usize;
    let mut rows = Vec::with_capacity(row_count);
    for idx in 0..row_count {
        rows.push(vec![
            SqlValue::Int(idx as i64),
            SqlValue::Text("Cliente".to_string()),
            SqlValue::Decimal("1234.56".to_string()),
            SqlValue::DateTime("2026-11-25".to_string()),
            if idx % 2 == 0 {
                SqlValue::Null
            } else {
                SqlValue::Text("ok".to_string())
            },
            SqlValue::Boolean(idx % 2 == 0),
        ]);
    }

    let response = ExecuteQueryResponse {
        execution_id: "bench-100k".to_string(),
        columns: vec![
            "Id".to_string(),
            "Nome".to_string(),
            "Valor".to_string(),
            "Data".to_string(),
            "Obs".to_string(),
            "Ativo".to_string(),
        ],
        rows,
        rows_affected: row_count as u64,
        duration_ms: 150,
    };

    let started = Instant::now();
    let bytes = response
        .to_compact_json_bytes()
        .expect("serialização de 100k linhas deve suceder");
    let elapsed = started.elapsed();

    assert!(bytes.len() > 1_000_000);
    assert!(
        elapsed < Duration::from_secs(2),
        "serialização de 100k linhas levou {:?}, acima do limite de 2s",
        elapsed
    );
}

#[tokio::test]
async fn streams_large_results_in_chunks_of_1000_rows() {
    assert_eq!(DEFAULT_RESULT_CHUNK_SIZE, 1_000);

    let total_rows = 2_500usize;
    let rows: Vec<Vec<SqlValue>> = (0..total_rows)
        .map(|idx| vec![SqlValue::Int(idx as i64), SqlValue::Text("item".to_string())])
        .collect();

    let sql = "select Id, Nome from dbo.Grande";
    let mut executor = MockSqlExecutor::new().with_response(
        sql,
        QueryResult {
            columns: vec!["Id".to_string(), "Nome".to_string()],
            rows,
            rows_affected: total_rows as u64,
        },
    );

    let registry = ExecutionRegistry::new();
    let mut chunks: Vec<ResultChunk> = Vec::new();

    let (_response, count) = registry
        .execute_streamed_with_registry(
            &mut executor,
            sql,
            ExecuteQueryOptions::default(),
            DEFAULT_RESULT_CHUNK_SIZE,
            |chunk| chunks.push(chunk),
        )
        .await
        .expect("streaming em chunks deve suceder");

    assert_eq!(count, 3);
    assert_eq!(chunks.len(), 3);
    assert_eq!(chunks[0].rows_in_chunk, 1_000);
    assert_eq!(chunks[0].total_rows_so_far, 1_000);
    assert!(!chunks[0].is_last);

    assert_eq!(chunks[1].rows_in_chunk, 1_000);
    assert_eq!(chunks[1].total_rows_so_far, 2_000);
    assert!(!chunks[1].is_last);

    assert_eq!(chunks[2].rows_in_chunk, 500);
    assert_eq!(chunks[2].total_rows_so_far, 2_500);
    assert!(chunks[2].is_last);

    // Resultado vazio emite 1 chunk final vazio
    let empty_response = ExecuteQueryResponse {
        execution_id: "empty-1".to_string(),
        columns: vec!["Id".to_string()],
        rows: vec![],
        rows_affected: 0,
        duration_ms: 1,
    };
    let mut empty_chunks = Vec::new();
    let empty_count = stream_result_chunks(&empty_response, DEFAULT_RESULT_CHUNK_SIZE, |chunk| {
        empty_chunks.push(chunk);
    });
    assert_eq!(empty_count, 1);
    assert!(empty_chunks[0].is_last);
    assert_eq!(empty_chunks[0].rows_in_chunk, 0);
}
