use std::sync::{Arc, Mutex};
use std::time::Duration;

use async_trait::async_trait;
use sequelei_desktop::{
    ColumnInfo, DatabaseInfo, ForeignKeyInfo, MetadataError, MetadataService, ProcedureInfo,
    QueryResult, SqlConnectionError, SqlExecutor, SqlValue, TableInfo, ViewInfo,
    DEFAULT_METADATA_CACHE_TTL,
};
use ts_rs::TS;

#[derive(Clone)]
struct RecordingSqlExecutor {
    executed_sqls: Arc<Mutex<Vec<String>>>,
    responder: Arc<dyn Fn(&str) -> QueryResult + Send + Sync>,
}

impl RecordingSqlExecutor {
    fn new(responder: impl Fn(&str) -> QueryResult + Send + Sync + 'static) -> Self {
        Self {
            executed_sqls: Arc::new(Mutex::new(Vec::new())),
            responder: Arc::new(responder),
        }
    }

    fn call_count(&self) -> usize {
        self.executed_sqls.lock().unwrap().len()
    }

    fn last_sql(&self) -> Option<String> {
        self.executed_sqls.lock().unwrap().last().cloned()
    }
}

#[async_trait]
impl SqlExecutor for RecordingSqlExecutor {
    async fn execute(&mut self, sql: &str) -> Result<QueryResult, SqlConnectionError> {
        self.executed_sqls.lock().unwrap().push(sql.to_string());
        Ok((self.responder)(sql))
    }
}

#[tokio::test]
async fn get_databases_queries_sys_databases_and_parses_rows() {
    let mut executor = RecordingSqlExecutor::new(|_| QueryResult {
        columns: vec!["name".to_string(), "state_desc".to_string()],
        rows: vec![
            vec![
                SqlValue::Text("Vendas".to_string()),
                SqlValue::Text("ONLINE".to_string()),
            ],
            vec![
                SqlValue::Text("Analytics".to_string()),
                SqlValue::Text("ONLINE".to_string()),
            ],
        ],
        rows_affected: 2,
    });

    let service = MetadataService::new();
    let databases = service
        .get_databases(&mut executor, "conn-1")
        .await
        .expect("get_databases deve retornar bancos");

    assert_eq!(
        databases,
        vec![
            DatabaseInfo {
                name: "Vendas".to_string(),
                state: "ONLINE".to_string(),
            },
            DatabaseInfo {
                name: "Analytics".to_string(),
                state: "ONLINE".to_string(),
            },
        ]
    );

    let sql = executor.last_sql().unwrap().to_lowercase();
    assert!(sql.contains("sys.databases"));
    assert!(sql.contains("with (nolock)"));
    assert!(!sql.contains("information_schema"));
}

#[tokio::test]
async fn get_tables_views_and_procedures_query_sys_catalogs() {
    let mut executor = RecordingSqlExecutor::new(|sql| {
        let lower = sql.to_lowercase();
        if lower.contains("sys.tables") {
            QueryResult {
                columns: vec!["schema_name".to_string(), "table_name".to_string()],
                rows: vec![vec![
                    SqlValue::Text("dbo".to_string()),
                    SqlValue::Text("Clientes".to_string()),
                ]],
                rows_affected: 1,
            }
        } else if lower.contains("sys.views") {
            QueryResult {
                columns: vec!["schema_name".to_string(), "view_name".to_string()],
                rows: vec![vec![
                    SqlValue::Text("dbo".to_string()),
                    SqlValue::Text("vw_Faturamento".to_string()),
                ]],
                rows_affected: 1,
            }
        } else {
            QueryResult {
                columns: vec!["schema_name".to_string(), "procedure_name".to_string()],
                rows: vec![vec![
                    SqlValue::Text("dbo".to_string()),
                    SqlValue::Text("sp_FecharMes".to_string()),
                ]],
                rows_affected: 1,
            }
        }
    });

    let service = MetadataService::new();

    let tables = service.get_tables(&mut executor, "conn-1", "Vendas").await.unwrap();
    assert_eq!(
        tables,
        vec![TableInfo {
            schema: "dbo".to_string(),
            name: "Clientes".to_string(),
        }]
    );
    let tables_sql = executor.last_sql().unwrap().to_lowercase();
    assert!(tables_sql.contains("[vendas].sys.tables"));
    assert!(!tables_sql.contains("information_schema"));

    let views = service.get_views(&mut executor, "conn-1", "Vendas").await.unwrap();
    assert_eq!(
        views,
        vec![ViewInfo {
            schema: "dbo".to_string(),
            name: "vw_Faturamento".to_string(),
        }]
    );
    assert!(executor
        .last_sql()
        .unwrap()
        .to_lowercase()
        .contains("[vendas].sys.views"));

    let procedures = service
        .get_procedures(&mut executor, "conn-1", "Vendas")
        .await
        .unwrap();
    assert_eq!(
        procedures,
        vec![ProcedureInfo {
            schema: "dbo".to_string(),
            name: "sp_FecharMes".to_string(),
        }]
    );
    assert!(executor
        .last_sql()
        .unwrap()
        .to_lowercase()
        .contains("[vendas].sys.procedures"));
}

#[tokio::test]
async fn get_columns_queries_sys_columns_with_types_and_pk() {
    let mut executor = RecordingSqlExecutor::new(|_| QueryResult {
        columns: vec![
            "column_name".to_string(),
            "data_type".to_string(),
            "max_length".to_string(),
            "precision".to_string(),
            "scale".to_string(),
            "is_nullable".to_string(),
            "is_primary_key".to_string(),
        ],
        rows: vec![
            vec![
                SqlValue::Text("ClienteID".to_string()),
                SqlValue::Text("int".to_string()),
                SqlValue::Int(4),
                SqlValue::Int(10),
                SqlValue::Int(0),
                SqlValue::Boolean(false),
                SqlValue::Boolean(true),
            ],
            vec![
                SqlValue::Text("Nome".to_string()),
                SqlValue::Text("nvarchar".to_string()),
                SqlValue::Int(200),
                SqlValue::Int(0),
                SqlValue::Int(0),
                SqlValue::Boolean(true),
                SqlValue::Boolean(false),
            ],
        ],
        rows_affected: 2,
    });

    let service = MetadataService::new();
    let columns = service
        .get_columns(&mut executor, "conn-1", "Vendas", "dbo", "Clientes")
        .await
        .unwrap();

    assert_eq!(
        columns,
        vec![
            ColumnInfo {
                name: "ClienteID".to_string(),
                data_type: "int".to_string(),
                max_length: 4,
                precision: 10,
                scale: 0,
                is_nullable: false,
                is_primary_key: true,
            },
            ColumnInfo {
                name: "Nome".to_string(),
                data_type: "nvarchar".to_string(),
                max_length: 200,
                precision: 0,
                scale: 0,
                is_nullable: true,
                is_primary_key: false,
            },
        ]
    );

    let sql = executor.last_sql().unwrap().to_lowercase();
    assert!(sql.contains("[vendas].sys.columns"));
    assert!(sql.contains("sys.types"));
    assert!(!sql.contains("information_schema"));
}

#[tokio::test]
async fn get_foreign_keys_queries_sys_foreign_keys() {
    let mut executor = RecordingSqlExecutor::new(|_| QueryResult {
        columns: vec![
            "constraint_name".to_string(),
            "parent_schema".to_string(),
            "parent_table".to_string(),
            "parent_column".to_string(),
            "referenced_schema".to_string(),
            "referenced_table".to_string(),
            "referenced_column".to_string(),
        ],
        rows: vec![vec![
            SqlValue::Text("FK_Pedidos_Clientes".to_string()),
            SqlValue::Text("dbo".to_string()),
            SqlValue::Text("Pedidos".to_string()),
            SqlValue::Text("ClienteID".to_string()),
            SqlValue::Text("dbo".to_string()),
            SqlValue::Text("Clientes".to_string()),
            SqlValue::Text("ClienteID".to_string()),
        ]],
        rows_affected: 1,
    });

    let service = MetadataService::new();
    let fks = service
        .get_foreign_keys(&mut executor, "conn-1", "Vendas")
        .await
        .unwrap();

    assert_eq!(
        fks,
        vec![ForeignKeyInfo {
            name: "FK_Pedidos_Clientes".to_string(),
            parent_schema: "dbo".to_string(),
            parent_table: "Pedidos".to_string(),
            parent_column: "ClienteID".to_string(),
            referenced_schema: "dbo".to_string(),
            referenced_table: "Clientes".to_string(),
            referenced_column: "ClienteID".to_string(),
        }]
    );

    let sql = executor.last_sql().unwrap().to_lowercase();
    assert!(sql.contains("[vendas].sys.foreign_keys"));
    assert!(sql.contains("[vendas].sys.foreign_key_columns"));
}

#[tokio::test]
async fn memory_cache_defaults_to_five_minutes_expires_and_supports_invalidation() {
    assert_eq!(DEFAULT_METADATA_CACHE_TTL, Duration::from_secs(5 * 60));

    let mut executor = RecordingSqlExecutor::new(|_| QueryResult {
        columns: vec!["schema_name".to_string(), "table_name".to_string()],
        rows: vec![vec![
            SqlValue::Text("dbo".to_string()),
            SqlValue::Text("Pedidos".to_string()),
        ]],
        rows_affected: 1,
    });

    let service = MetadataService::with_ttl(Duration::from_millis(40));

    // 1ª chamada: consulta o banco
    let first = service.get_tables(&mut executor, "conn-cache", "Vendas").await.unwrap();
    assert_eq!(first.len(), 1);
    assert_eq!(executor.call_count(), 1);

    // 2ª chamada dentro do TTL: retorna do cache sem chamar o banco
    let second = service.get_tables(&mut executor, "conn-cache", "Vendas").await.unwrap();
    assert_eq!(second, first);
    assert_eq!(executor.call_count(), 1);

    // Aguarda expiração do TTL
    tokio::time::sleep(Duration::from_millis(60)).await;

    // 3ª chamada após expiração: reexecuta no banco
    let third = service.get_tables(&mut executor, "conn-cache", "Vendas").await.unwrap();
    assert_eq!(third, first);
    assert_eq!(executor.call_count(), 2);

    // Invalidação manual força recarga imediata
    service.invalidate_cache(Some("conn-cache"));
    let _fourth = service.get_tables(&mut executor, "conn-cache", "Vendas").await.unwrap();
    assert_eq!(executor.call_count(), 3);
}

#[tokio::test]
async fn rejects_unsafe_identifiers_to_prevent_sql_injection() {
    let mut executor = RecordingSqlExecutor::new(|_| QueryResult {
        columns: vec![],
        rows: vec![],
        rows_affected: 0,
    });
    let service = MetadataService::new();

    let bad_db = service
        .get_tables(&mut executor, "conn-1", "Vendas]; DROP TABLE dbo.Clientes; --")
        .await;
    assert!(matches!(bad_db, Err(MetadataError::InvalidIdentifier(_))));

    let empty_table = service
        .get_columns(&mut executor, "conn-1", "Vendas", "dbo", "   ")
        .await;
    assert!(matches!(
        empty_table,
        Err(MetadataError::InvalidIdentifier(_))
    ));

    let control_char_schema = service
        .get_columns(&mut executor, "conn-1", "Vendas", "dbo\n", "Clientes")
        .await;
    assert!(matches!(
        control_char_schema,
        Err(MetadataError::InvalidIdentifier(_))
    ));

    assert_eq!(
        executor.call_count(),
        0,
        "nenhuma query deve ser executada para identificadores inválidos"
    );
}

#[tokio::test]
async fn create_database_executes_sanitized_ddl_and_invalidates_cache() {
    let mut executor = RecordingSqlExecutor::new(|sql| {
        if sql.to_lowercase().starts_with("create database") {
            QueryResult {
                columns: vec![],
                rows: vec![],
                rows_affected: 0,
            }
        } else {
            QueryResult {
                columns: vec!["name".to_string(), "state_desc".to_string()],
                rows: vec![vec![
                    SqlValue::Text("SequeleiLab".to_string()),
                    SqlValue::Text("ONLINE".to_string()),
                ]],
                rows_affected: 1,
            }
        }
    });

    let service = MetadataService::new();

    // Popula cache inicial
    let _initial = service.get_databases(&mut executor, "conn-db").await.unwrap();
    assert_eq!(executor.call_count(), 1);

    // Cria banco válido
    let created = service
        .create_database(&mut executor, "conn-db", "SequeleiLab")
        .await
        .expect("create_database deve executar DDL sanitizado");
    assert_eq!(
        created,
        DatabaseInfo {
            name: "SequeleiLab".to_string(),
            state: "ONLINE".to_string(),
        }
    );
    assert_eq!(
        executor.last_sql().unwrap(),
        "create database [SequeleiLab]"
    );

    // Cache foi invalidado: próxima chamada a get_databases consulta o banco novamente
    let _refreshed = service.get_databases(&mut executor, "conn-db").await.unwrap();
    assert_eq!(executor.call_count(), 3);

    // Payload de SQL injection deve ser rejeitado sem chamar o executor
    let before_count = executor.call_count();
    let bad = service
        .create_database(&mut executor, "conn-db", "Test]; DROP DATABASE master; --")
        .await;
    assert!(matches!(bad, Err(MetadataError::InvalidIdentifier(_))));
    assert_eq!(executor.call_count(), before_count);
}

#[test]
fn ts_rs_generates_camel_case_typescript_definitions() {
    assert!(DatabaseInfo::decl().contains("name: string"));
    assert!(TableInfo::decl().contains("schema: string"));
    assert!(ViewInfo::decl().contains("name: string"));
    assert!(ProcedureInfo::decl().contains("schema: string"));
    assert!(ColumnInfo::decl().contains("dataType: string"));
    assert!(ColumnInfo::decl().contains("isPrimaryKey: boolean"));
    assert!(ForeignKeyInfo::decl().contains("referencedTable: string"));
}
