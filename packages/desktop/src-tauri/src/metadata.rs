use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use thiserror::Error;
use ts_rs::TS;

use crate::sql_connection::{execute_query, SqlConnectionError, SqlExecutor, SqlValue};

/// TTL padrão do cache em memória de metadados (5 minutos — RF-EX-04).
pub const DEFAULT_METADATA_CACHE_TTL: Duration = Duration::from_secs(5 * 60);

#[derive(Debug, Error)]
pub enum MetadataError {
    #[error("invalid SQL identifier: {0}")]
    InvalidIdentifier(String),

    #[error("metadata query execution failed: {0}")]
    Query(#[from] SqlConnectionError),

    #[error("metadata cache lock poisoned")]
    CachePoisoned,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../db/src/generated/")]
pub struct DatabaseInfo {
    pub name: String,
    pub state: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../db/src/generated/")]
pub struct TableInfo {
    pub schema: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../db/src/generated/")]
pub struct ViewInfo {
    pub schema: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../db/src/generated/")]
pub struct ProcedureInfo {
    pub schema: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../db/src/generated/")]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub max_length: i32,
    pub precision: i32,
    pub scale: i32,
    pub is_nullable: bool,
    pub is_primary_key: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../db/src/generated/")]
pub struct ForeignKeyInfo {
    pub name: String,
    pub parent_schema: String,
    pub parent_table: String,
    pub parent_column: String,
    pub referenced_schema: String,
    pub referenced_table: String,
    pub referenced_column: String,
}

#[derive(Debug, Clone)]
enum CachedPayload {
    Databases(Vec<DatabaseInfo>),
    Tables(Vec<TableInfo>),
    Views(Vec<ViewInfo>),
    Procedures(Vec<ProcedureInfo>),
    Columns(Vec<ColumnInfo>),
    ForeignKeys(Vec<ForeignKeyInfo>),
}

#[derive(Debug, Clone)]
struct CacheEntry {
    inserted_at: Instant,
    payload: CachedPayload,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct CacheKey {
    connection_id: String,
    scope: String,
}

/// Serviço de introspecção de metadados SQL Server via `sys.*` com cache em memória (TTL padrão 5 min).
pub struct MetadataService {
    ttl: Duration,
    cache: Mutex<HashMap<CacheKey, CacheEntry>>,
}

impl Default for MetadataService {
    fn default() -> Self {
        Self::new()
    }
}

impl MetadataService {
    pub fn new() -> Self {
        Self::with_ttl(DEFAULT_METADATA_CACHE_TTL)
    }

    pub fn with_ttl(ttl: Duration) -> Self {
        Self {
            ttl,
            cache: Mutex::new(HashMap::new()),
        }
    }

    pub fn invalidate_cache(&self, connection_id: Option<&str>) {
        if let Ok(mut guard) = self.cache.lock() {
            match connection_id {
                Some(id) => guard.retain(|key, _| key.connection_id != id),
                None => guard.clear(),
            }
        }
    }

    pub fn get_cached_databases(&self, connection_id: &str) -> Option<Vec<DatabaseInfo>> {
        match self.read_cache(connection_id, "databases") {
            Some(CachedPayload::Databases(items)) => Some(items),
            _ => None,
        }
    }

    pub fn get_cached_tables(&self, connection_id: &str, db: &str) -> Option<Vec<TableInfo>> {
        let scope = format!("tables:{}", db.trim().to_lowercase());
        match self.read_cache(connection_id, &scope) {
            Some(CachedPayload::Tables(items)) => Some(items),
            _ => None,
        }
    }

    pub fn get_cached_views(&self, connection_id: &str, db: &str) -> Option<Vec<ViewInfo>> {
        let scope = format!("views:{}", db.trim().to_lowercase());
        match self.read_cache(connection_id, &scope) {
            Some(CachedPayload::Views(items)) => Some(items),
            _ => None,
        }
    }

    pub fn get_cached_procedures(
        &self,
        connection_id: &str,
        db: &str,
    ) -> Option<Vec<ProcedureInfo>> {
        let scope = format!("procedures:{}", db.trim().to_lowercase());
        match self.read_cache(connection_id, &scope) {
            Some(CachedPayload::Procedures(items)) => Some(items),
            _ => None,
        }
    }

    pub fn get_cached_columns(
        &self,
        connection_id: &str,
        db: &str,
        schema: &str,
        table: &str,
    ) -> Option<Vec<ColumnInfo>> {
        let scope = format!(
            "columns:{}:{}:{}",
            db.trim().to_lowercase(),
            schema.trim().to_lowercase(),
            table.trim().to_lowercase()
        );
        match self.read_cache(connection_id, &scope) {
            Some(CachedPayload::Columns(items)) => Some(items),
            _ => None,
        }
    }

    pub fn get_cached_foreign_keys(
        &self,
        connection_id: &str,
        db: &str,
    ) -> Option<Vec<ForeignKeyInfo>> {
        let scope = format!("fks:{}", db.trim().to_lowercase());
        match self.read_cache(connection_id, &scope) {
            Some(CachedPayload::ForeignKeys(items)) => Some(items),
            _ => None,
        }
    }

    pub async fn get_databases<E: SqlExecutor>(
        &self,
        executor: &mut E,
        connection_id: &str,
    ) -> Result<Vec<DatabaseInfo>, MetadataError> {
        if let Some(cached) = self.get_cached_databases(connection_id) {
            return Ok(cached);
        }

        let sql = "select d.name, d.state_desc
from sys.databases as d with (nolock)
where d.state = 0
order by d.name";

        let result = execute_query(executor, sql, Some(Duration::from_secs(15)), None).await?;
        let databases: Vec<DatabaseInfo> = result
            .rows
            .iter()
            .filter_map(|row| {
                let name = value_as_string(row.first()?)?;
                let state = row
                    .get(1)
                    .and_then(value_as_string)
                    .unwrap_or_else(|| "ONLINE".to_string());
                Some(DatabaseInfo { name, state })
            })
            .collect();

        self.write_cache(
            connection_id,
            "databases",
            CachedPayload::Databases(databases.clone()),
        )?;
        Ok(databases)
    }

    pub async fn create_database<E: SqlExecutor>(
        &self,
        executor: &mut E,
        connection_id: &str,
        db_name: &str,
    ) -> Result<DatabaseInfo, MetadataError> {
        let quoted_db = quote_identifier(db_name)?;
        let clean_name = db_name.trim().to_string();
        let sql = format!("create database {quoted_db}");

        execute_query(executor, &sql, Some(Duration::from_secs(30)), None).await?;
        self.invalidate_cache(Some(connection_id));

        Ok(DatabaseInfo {
            name: clean_name,
            state: "ONLINE".to_string(),
        })
    }

    pub async fn get_tables<E: SqlExecutor>(
        &self,
        executor: &mut E,
        connection_id: &str,
        db: &str,
    ) -> Result<Vec<TableInfo>, MetadataError> {
        let quoted_db = quote_identifier(db)?;
        let scope = format!("tables:{}", db.trim().to_lowercase());

        if let Some(CachedPayload::Tables(items)) = self.read_cache(connection_id, &scope) {
            return Ok(items);
        }

        let sql = format!(
            "select s.name as schema_name, t.name as table_name
from {quoted_db}.sys.tables as t with (nolock)
inner join {quoted_db}.sys.schemas as s with (nolock) on s.schema_id = t.schema_id
where t.is_ms_shipped = 0
order by s.name, t.name"
        );

        let result = execute_query(executor, &sql, Some(Duration::from_secs(15)), None).await?;
        let tables: Vec<TableInfo> = result
            .rows
            .iter()
            .filter_map(|row| {
                Some(TableInfo {
                    schema: value_as_string(row.first()?)?,
                    name: value_as_string(row.get(1)?)?,
                })
            })
            .collect();

        self.write_cache(connection_id, &scope, CachedPayload::Tables(tables.clone()))?;
        Ok(tables)
    }

    pub async fn get_views<E: SqlExecutor>(
        &self,
        executor: &mut E,
        connection_id: &str,
        db: &str,
    ) -> Result<Vec<ViewInfo>, MetadataError> {
        let quoted_db = quote_identifier(db)?;
        let scope = format!("views:{}", db.trim().to_lowercase());

        if let Some(CachedPayload::Views(items)) = self.read_cache(connection_id, &scope) {
            return Ok(items);
        }

        let sql = format!(
            "select s.name as schema_name, v.name as view_name
from {quoted_db}.sys.views as v with (nolock)
inner join {quoted_db}.sys.schemas as s with (nolock) on s.schema_id = v.schema_id
where v.is_ms_shipped = 0
order by s.name, v.name"
        );

        let result = execute_query(executor, &sql, Some(Duration::from_secs(15)), None).await?;
        let views: Vec<ViewInfo> = result
            .rows
            .iter()
            .filter_map(|row| {
                Some(ViewInfo {
                    schema: value_as_string(row.first()?)?,
                    name: value_as_string(row.get(1)?)?,
                })
            })
            .collect();

        self.write_cache(connection_id, &scope, CachedPayload::Views(views.clone()))?;
        Ok(views)
    }

    pub async fn get_procedures<E: SqlExecutor>(
        &self,
        executor: &mut E,
        connection_id: &str,
        db: &str,
    ) -> Result<Vec<ProcedureInfo>, MetadataError> {
        let quoted_db = quote_identifier(db)?;
        let scope = format!("procedures:{}", db.trim().to_lowercase());

        if let Some(CachedPayload::Procedures(items)) = self.read_cache(connection_id, &scope) {
            return Ok(items);
        }

        let sql = format!(
            "select s.name as schema_name, p.name as procedure_name
from {quoted_db}.sys.procedures as p with (nolock)
inner join {quoted_db}.sys.schemas as s with (nolock) on s.schema_id = p.schema_id
where p.is_ms_shipped = 0
order by s.name, p.name"
        );

        let result = execute_query(executor, &sql, Some(Duration::from_secs(15)), None).await?;
        let procedures: Vec<ProcedureInfo> = result
            .rows
            .iter()
            .filter_map(|row| {
                Some(ProcedureInfo {
                    schema: value_as_string(row.first()?)?,
                    name: value_as_string(row.get(1)?)?,
                })
            })
            .collect();

        self.write_cache(
            connection_id,
            &scope,
            CachedPayload::Procedures(procedures.clone()),
        )?;
        Ok(procedures)
    }

    pub async fn get_columns<E: SqlExecutor>(
        &self,
        executor: &mut E,
        connection_id: &str,
        db: &str,
        schema: &str,
        table: &str,
    ) -> Result<Vec<ColumnInfo>, MetadataError> {
        let quoted_db = quote_identifier(db)?;
        let safe_schema = escape_sql_literal(schema)?;
        let safe_table = escape_sql_literal(table)?;
        let scope = format!(
            "columns:{}:{}:{}",
            db.trim().to_lowercase(),
            schema.trim().to_lowercase(),
            table.trim().to_lowercase()
        );

        if let Some(CachedPayload::Columns(items)) = self.read_cache(connection_id, &scope) {
            return Ok(items);
        }

        let sql = format!(
            "select
    c.name as column_name,
    ty.name as data_type,
    c.max_length,
    c.precision,
    c.scale,
    c.is_nullable,
    cast(case when ic.column_id is not null then 1 else 0 end as bit) as is_primary_key
from {quoted_db}.sys.columns as c with (nolock)
inner join {quoted_db}.sys.objects as o with (nolock) on o.object_id = c.object_id
inner join {quoted_db}.sys.schemas as s with (nolock) on s.schema_id = o.schema_id
inner join {quoted_db}.sys.types as ty with (nolock) on ty.user_type_id = c.user_type_id
left join {quoted_db}.sys.indexes as i with (nolock)
    on i.object_id = o.object_id and i.is_primary_key = 1
left join {quoted_db}.sys.index_columns as ic with (nolock)
    on ic.object_id = i.object_id and ic.index_id = i.index_id and ic.column_id = c.column_id
where s.name = {safe_schema} and o.name = {safe_table} and o.type in ('U', 'V')
order by c.column_id"
        );

        let result = execute_query(executor, &sql, Some(Duration::from_secs(15)), None).await?;
        let columns: Vec<ColumnInfo> = result
            .rows
            .iter()
            .filter_map(|row| {
                Some(ColumnInfo {
                    name: value_as_string(row.first()?)?,
                    data_type: value_as_string(row.get(1)?)?,
                    max_length: value_as_i32(row.get(2)?)?,
                    precision: value_as_i32(row.get(3)?)?,
                    scale: value_as_i32(row.get(4)?)?,
                    is_nullable: value_as_bool(row.get(5)?)?,
                    is_primary_key: value_as_bool(row.get(6)?)?,
                })
            })
            .collect();

        self.write_cache(connection_id, &scope, CachedPayload::Columns(columns.clone()))?;
        Ok(columns)
    }

    pub async fn get_foreign_keys<E: SqlExecutor>(
        &self,
        executor: &mut E,
        connection_id: &str,
        db: &str,
    ) -> Result<Vec<ForeignKeyInfo>, MetadataError> {
        let quoted_db = quote_identifier(db)?;
        let scope = format!("fks:{}", db.trim().to_lowercase());

        if let Some(CachedPayload::ForeignKeys(items)) = self.read_cache(connection_id, &scope) {
            return Ok(items);
        }

        let sql = format!(
            "select
    fk.name as constraint_name,
    ps.name as parent_schema,
    pt.name as parent_table,
    pc.name as parent_column,
    rs.name as referenced_schema,
    rt.name as referenced_table,
    rc.name as referenced_column
from {quoted_db}.sys.foreign_keys as fk with (nolock)
inner join {quoted_db}.sys.foreign_key_columns as fkc with (nolock)
    on fkc.constraint_object_id = fk.object_id
inner join {quoted_db}.sys.tables as pt with (nolock)
    on pt.object_id = fkc.parent_object_id
inner join {quoted_db}.sys.schemas as ps with (nolock)
    on ps.schema_id = pt.schema_id
inner join {quoted_db}.sys.columns as pc with (nolock)
    on pc.object_id = fkc.parent_object_id and pc.column_id = fkc.parent_column_id
inner join {quoted_db}.sys.tables as rt with (nolock)
    on rt.object_id = fkc.referenced_object_id
inner join {quoted_db}.sys.schemas as rs with (nolock)
    on rs.schema_id = rt.schema_id
inner join {quoted_db}.sys.columns as rc with (nolock)
    on rc.object_id = fkc.referenced_object_id and rc.column_id = fkc.referenced_column_id
order by fk.name, fkc.constraint_column_id"
        );

        let result = execute_query(executor, &sql, Some(Duration::from_secs(15)), None).await?;
        let foreign_keys: Vec<ForeignKeyInfo> = result
            .rows
            .iter()
            .filter_map(|row| {
                Some(ForeignKeyInfo {
                    name: value_as_string(row.first()?)?,
                    parent_schema: value_as_string(row.get(1)?)?,
                    parent_table: value_as_string(row.get(2)?)?,
                    parent_column: value_as_string(row.get(3)?)?,
                    referenced_schema: value_as_string(row.get(4)?)?,
                    referenced_table: value_as_string(row.get(5)?)?,
                    referenced_column: value_as_string(row.get(6)?)?,
                })
            })
            .collect();

        self.write_cache(
            connection_id,
            &scope,
            CachedPayload::ForeignKeys(foreign_keys.clone()),
        )?;
        Ok(foreign_keys)
    }

    fn read_cache(&self, connection_id: &str, scope: &str) -> Option<CachedPayload> {
        let mut guard = self.cache.lock().ok()?;
        let key = CacheKey {
            connection_id: connection_id.to_string(),
            scope: scope.to_string(),
        };

        if let Some(entry) = guard.get(&key) {
            if entry.inserted_at.elapsed() < self.ttl {
                return Some(entry.payload.clone());
            }
            guard.remove(&key);
        }

        None
    }

    fn write_cache(
        &self,
        connection_id: &str,
        scope: &str,
        payload: CachedPayload,
    ) -> Result<(), MetadataError> {
        let mut guard = self
            .cache
            .lock()
            .map_err(|_| MetadataError::CachePoisoned)?;
        guard.insert(
            CacheKey {
                connection_id: connection_id.to_string(),
                scope: scope.to_string(),
            },
            CacheEntry {
                inserted_at: Instant::now(),
                payload,
            },
        );
        Ok(())
    }
}

/// Sanitiza e envolve um identificador SQL Server em colchetes `[...]` (SEC-05).
pub fn quote_identifier(identifier: &str) -> Result<String, MetadataError> {
    let valid = validate_identifier_raw(identifier)?;
    let escaped = valid.replace(']', "]]");
    Ok(format!("[{escaped}]"))
}

/// Sanitiza e envolve um literal SQL Unicode `N'...'` após validação do identificador (SEC-05).
pub fn escape_sql_literal(identifier: &str) -> Result<String, MetadataError> {
    let valid = validate_identifier_raw(identifier)?;
    let escaped = valid.replace('\'', "''");
    Ok(format!("N'{escaped}'"))
}

fn validate_identifier_raw(identifier: &str) -> Result<&str, MetadataError> {
    if identifier.chars().any(|c| c.is_control()) {
        return Err(MetadataError::InvalidIdentifier(
            "identificador contém caracteres de controle proibidos".to_string(),
        ));
    }

    let trimmed = identifier.trim();
    if trimmed.is_empty() || trimmed.len() > 128 {
        return Err(MetadataError::InvalidIdentifier(
            "identificador deve ter entre 1 e 128 caracteres".to_string(),
        ));
    }

    if trimmed.contains(';')
        || trimmed.contains("--")
        || trimmed.contains("/*")
        || trimmed.contains("*/")
    {
        return Err(MetadataError::InvalidIdentifier(
            "identificador contém caracteres proibidos".to_string(),
        ));
    }

    Ok(trimmed)
}

fn value_as_string(value: &SqlValue) -> Option<String> {
    match value {
        SqlValue::Text(text) => Some(text.clone()),
        _ => None,
    }
}

fn value_as_i32(value: &SqlValue) -> Option<i32> {
    match value {
        SqlValue::Int(v) => i32::try_from(*v).ok(),
        _ => None,
    }
}

fn value_as_bool(value: &SqlValue) -> Option<bool> {
    match value {
        SqlValue::Boolean(v) => Some(*v),
        SqlValue::Int(v) => Some(*v != 0),
        _ => None,
    }
}
