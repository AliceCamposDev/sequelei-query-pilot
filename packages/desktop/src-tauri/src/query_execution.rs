use std::collections::HashMap;
use std::fmt::Write as _;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::ser::{SerializeSeq, SerializeStruct};
use serde::{Deserialize, Serialize, Serializer};
use tokio_util::sync::CancellationToken;

use crate::sql_connection::{execute_query, SqlConnectionError, SqlExecutor, SqlValue};

/// Timeout padrão obrigatório para execução de queries (30 segundos — RF-ED-05).
pub const DEFAULT_QUERY_TIMEOUT_MS: u64 = 30_000;

/// Tamanho padrão de lote para streaming de resultados grandes (1.000 linhas — Fase 3 Dia 46–47).
pub const DEFAULT_RESULT_CHUNK_SIZE: usize = 1_000;

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

impl ExecuteQueryResponse {
    /// Infere o tipo lógico de cada coluna a partir do primeiro valor não nulo.
    pub fn inferred_column_types(&self) -> Vec<&'static str> {
        (0..self.columns.len())
            .map(|col_idx| {
                self.rows
                    .iter()
                    .filter_map(|row| row.get(col_idx))
                    .find(|value| !value.is_null())
                    .map(sql_value_type_name)
                    .unwrap_or("null")
            })
            .collect()
    }

    /// Serializa o resultado em JSON compacto (sem tags por célula, com metadados de tipo por coluna).
    pub fn to_compact_json_bytes(&self) -> Result<Vec<u8>, serde_json::Error> {
        let estimated_capacity = 256 + self.rows.len().saturating_mul(64);
        let mut buffer = Vec::with_capacity(estimated_capacity);
        let view = CompactQueryResultView {
            response: self,
            column_types: self.inferred_column_types(),
        };
        serde_json::to_writer(&mut buffer, &view)?;
        Ok(buffer)
    }

    /// Serializa o resultado em JSON compacto UTF-8.
    pub fn to_compact_json(&self) -> Result<String, serde_json::Error> {
        let bytes = self.to_compact_json_bytes()?;
        Ok(String::from_utf8(bytes).unwrap_or_default())
    }
}

/// Chunk de streaming de resultado (lotes padrão de 1.000 linhas).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultChunk {
    pub execution_id: String,
    pub chunk_index: usize,
    pub columns: Vec<String>,
    pub column_types: Vec<String>,
    pub rows: Vec<Vec<SqlValue>>,
    pub rows_in_chunk: usize,
    pub total_rows_so_far: usize,
    pub is_last: bool,
}

/// Divide um `ExecuteQueryResponse` em chunks de tamanho fixo (padrão 1.000 linhas)
/// invocando `on_chunk` incrementalmente para reduzir pressão de memória/IPC.
pub fn stream_result_chunks<F>(
    response: &ExecuteQueryResponse,
    chunk_size: usize,
    mut on_chunk: F,
) -> usize
where
    F: FnMut(ResultChunk),
{
    let effective_size = chunk_size.max(1);
    let column_types: Vec<String> = response
        .inferred_column_types()
        .into_iter()
        .map(String::from)
        .collect();

    if response.rows.is_empty() {
        on_chunk(ResultChunk {
            execution_id: response.execution_id.clone(),
            chunk_index: 0,
            columns: response.columns.clone(),
            column_types,
            rows: Vec::new(),
            rows_in_chunk: 0,
            total_rows_so_far: 0,
            is_last: true,
        });
        return 1;
    }

    let total_chunks = response.rows.len().div_ceil(effective_size);
    let mut total_rows_so_far = 0usize;

    for (chunk_index, slice) in response.rows.chunks(effective_size).enumerate() {
        let rows_in_chunk = slice.len();
        total_rows_so_far += rows_in_chunk;
        on_chunk(ResultChunk {
            execution_id: response.execution_id.clone(),
            chunk_index,
            columns: response.columns.clone(),
            column_types: column_types.clone(),
            rows: slice.to_vec(),
            rows_in_chunk,
            total_rows_so_far,
            is_last: chunk_index + 1 == total_chunks,
        });
    }

    total_chunks
}

struct CompactQueryResultView<'a> {
    response: &'a ExecuteQueryResponse,
    column_types: Vec<&'static str>,
}

impl Serialize for CompactQueryResultView<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("CompactQueryResult", 6)?;
        state.serialize_field("executionId", &self.response.execution_id)?;
        state.serialize_field("columns", &self.response.columns)?;
        state.serialize_field("columnTypes", &self.column_types)?;
        state.serialize_field("rows", &CompactRowsView(&self.response.rows))?;
        state.serialize_field("rowsAffected", &self.response.rows_affected)?;
        state.serialize_field("durationMs", &self.response.duration_ms)?;
        state.end()
    }
}

struct CompactRowsView<'a>(&'a [Vec<SqlValue>]);

impl Serialize for CompactRowsView<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut seq = serializer.serialize_seq(Some(self.0.len()))?;
        for row in self.0 {
            seq.serialize_element(&CompactRowView(row))?;
        }
        seq.end()
    }
}

struct CompactRowView<'a>(&'a [SqlValue]);

impl Serialize for CompactRowView<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut seq = serializer.serialize_seq(Some(self.0.len()))?;
        for cell in self.0 {
            seq.serialize_element(&CompactCellView(cell))?;
        }
        seq.end()
    }
}

struct CompactCellView<'a>(&'a SqlValue);

impl Serialize for CompactCellView<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self.0 {
            SqlValue::Null => serializer.serialize_none(),
            SqlValue::Int(v) => serializer.serialize_i64(*v),
            SqlValue::Float(v) => serializer.serialize_f64(*v),
            SqlValue::Boolean(v) => serializer.serialize_bool(*v),
            SqlValue::Text(s) | SqlValue::Decimal(s) | SqlValue::DateTime(s) => {
                serializer.serialize_str(s)
            }
            SqlValue::Binary(bytes) => {
                let mut hex = String::with_capacity(2 + bytes.len() * 2);
                hex.push_str("0x");
                for byte in bytes {
                    let _ = write!(&mut hex, "{byte:02x}");
                }
                serializer.serialize_str(&hex)
            }
        }
    }
}

fn sql_value_type_name(value: &SqlValue) -> &'static str {
    match value {
        SqlValue::Null => "null",
        SqlValue::Int(_) => "int",
        SqlValue::Float(_) => "float",
        SqlValue::Text(_) => "string",
        SqlValue::Decimal(_) => "decimal",
        SqlValue::DateTime(_) => "date",
        SqlValue::Boolean(_) => "boolean",
        SqlValue::Binary(_) => "binary",
    }
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

    pub async fn execute_streamed_with_registry<E, F>(
        &self,
        executor: &mut E,
        sql: &str,
        options: ExecuteQueryOptions,
        chunk_size: usize,
        on_chunk: F,
    ) -> Result<(ExecuteQueryResponse, usize), SqlConnectionError>
    where
        E: SqlExecutor,
        F: FnMut(ResultChunk),
    {
        let response = self.execute_with_registry(executor, sql, options).await?;
        let chunk_count = stream_result_chunks(&response, chunk_size, on_chunk);
        Ok((response, chunk_count))
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
