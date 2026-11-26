use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

use crate::sql_connection::{execute_query, SqlConnectionError, SqlExecutor, SqlValue};

/// Timeout padrão obrigatório para execução de queries (30 segundos — RF-ED-05).
pub const DEFAULT_QUERY_TIMEOUT_MS: u64 = 30_000;

static EXECUTION_SEQ: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteQueryOptions {
    pub connection_id: Option<String>,
    pub execution_id: Option<String>,
    pub timeout_ms: Option<u64>,
}

impl ExecuteQueryOptions {
    pub fn resolved_timeout(&self) -> Duration {
        let ms = self
            .timeout_ms
            .filter(|value| *value > 0)
            .unwrap_or(DEFAULT_QUERY_TIMEOUT_MS);
        Duration::from_millis(ms)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteQueryResponse {
    pub execution_id: String,
    pub columns: Vec<String>,
    pub rows: Vec<Vec<SqlValue>>,
    pub rows_affected: u64,
    pub duration_ms: u64,
}

/// Registro concorrente de execuções em andamento para cancelamento cooperativo real.
#[derive(Default)]
pub struct ExecutionRegistry {
    active: Mutex<HashMap<String, CancellationToken>>,
}

impl ExecutionRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&self, requested_id: Option<String>) -> (String, CancellationToken) {
        let id = requested_id
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(generate_execution_id);
        let token = CancellationToken::new();

        if let Ok(mut guard) = self.active.lock() {
            guard.insert(id.clone(), token.clone());
        }

        (id, token)
    }

    pub fn cancel(&self, execution_id: &str) -> bool {
        if let Ok(guard) = self.active.lock() {
            if let Some(token) = guard.get(execution_id) {
                token.cancel();
                return true;
            }
        }
        false
    }

    pub fn cancel_all(&self) -> usize {
        if let Ok(guard) = self.active.lock() {
            let count = guard.len();
            for token in guard.values() {
                token.cancel();
            }
            return count;
        }
        0
    }

    pub fn active_count(&self) -> usize {
        self.active.lock().map(|guard| guard.len()).unwrap_or(0)
    }

    fn remove(&self, execution_id: &str) {
        if let Ok(mut guard) = self.active.lock() {
            guard.remove(execution_id);
        }
    }

    pub async fn execute_with_registry<E: SqlExecutor>(
        &self,
        executor: &mut E,
        sql: &str,
        options: ExecuteQueryOptions,
    ) -> Result<ExecuteQueryResponse, SqlConnectionError> {
        if sql.trim().is_empty() {
            return Err(SqlConnectionError::Pool(
                "SQL não pode estar vazio para execução".to_string(),
            ));
        }

        let timeout = options.resolved_timeout();
        let (execution_id, token) = self.register(options.execution_id);
        let _cleanup = ExecutionCleanupGuard {
            registry: self,
            execution_id: execution_id.clone(),
        };

        let started_at = Instant::now();
        let result = execute_query(executor, sql, Some(timeout), Some(&token)).await?;

        Ok(ExecuteQueryResponse {
            execution_id,
            columns: result.columns,
            rows: result.rows,
            rows_affected: result.rows_affected,
            duration_ms: started_at.elapsed().as_millis() as u64,
        })
    }
}

struct ExecutionCleanupGuard<'a> {
    registry: &'a ExecutionRegistry,
    execution_id: String,
}

impl Drop for ExecutionCleanupGuard<'_> {
    fn drop(&mut self) {
        self.registry.remove(&self.execution_id);
    }
}

fn generate_execution_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let seq = EXECUTION_SEQ.fetch_add(1, Ordering::Relaxed);
    format!("exec-{nanos:x}-{seq}")
}
