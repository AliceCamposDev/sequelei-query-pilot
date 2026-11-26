use rusqlite::Connection;
use sequelei_desktop::{
    ConnectionEnvironment, ConnectionManager, ConnectionManagerError, ConnectionTestResult,
    CreateAuthPayload, CreateConnectionPayload, CredentialStore, InMemoryCredentialBackend,
    MockConnectionTester, UnavailableCredentialBackend,
};

fn setup_in_memory_db() -> Connection {
    let conn = Connection::open_in_memory().expect("abrir SQLite in-memory");
    ConnectionManager::<InMemoryCredentialBackend>::init_schema(&conn)
        .expect("inicializar schema de conexões");
    conn
}

#[tokio::test]
async fn create_list_test_and_delete_sql_connection() {
    let db = setup_in_memory_db();
    let credentials = CredentialStore::new("com.sequelei.app.test", InMemoryCredentialBackend::new());
    let manager = ConnectionManager::new(credentials);

    let created = manager
        .create_connection(
            &db,
            CreateConnectionPayload {
                name: "Dev Local".to_string(),
                host: "localhost".to_string(),
                port: Some(1433),
                database: Some("Vendas".to_string()),
                auth: CreateAuthPayload::Sql {
                    user: "sa".to_string(),
                    password: "DevPassword#123".to_string(),
                },
                encrypt: Some(false),
                trust_server_certificate: Some(true),
                environment: Some(ConnectionEnvironment::Dev),
            },
        )
        .expect("criar conexão SQL válida deve funcionar");

    assert_eq!(created.name, "Dev Local");
    assert_eq!(created.host, "localhost");
    assert_eq!(created.port, 1433);
    assert_eq!(created.database.as_deref(), Some("Vendas"));
    assert_eq!(created.auth_type, "sql");
    assert_eq!(created.username.as_deref(), Some("sa"));
    assert_eq!(created.environment, ConnectionEnvironment::Dev);

    // Senha jamais aparece no resumo serializado
    let summary_json = serde_json::to_string(&created).unwrap();
    assert!(!summary_json.contains("DevPassword#123"));

    // Lista contém a conexão criada
    let list = manager.list_connections(&db).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].id, created.id);

    // test_connection recupera credencial do CredentialStore e executa o tester
    let tester = MockConnectionTester::ok(12);
    let test_result = manager
        .test_connection(&db, &tester, &created.id)
        .await
        .expect("test_connection deve suceder com tester mock");
    assert_eq!(
        test_result,
        ConnectionTestResult {
            ok: true,
            latency_ms: 12,
            message: "Conexão validada com sucesso".to_string(),
        }
    );

    // Remove conexão e credencial associada
    manager
        .delete_connection(&db, &created.id)
        .expect("delete_connection deve remover registro e segredo");
    assert!(manager.list_connections(&db).unwrap().is_empty());
}

#[tokio::test]
async fn create_windows_sspi_connection_does_not_require_keyring() {
    let db = setup_in_memory_db();
    let manager = ConnectionManager::new(CredentialStore::new(
        "com.sequelei.app.test",
        UnavailableCredentialBackend::new("sem keyring"),
    ));

    let created = manager
        .create_connection(
            &db,
            CreateConnectionPayload {
                name: "Local SSPI".to_string(),
                host: "localhost".to_string(),
                port: None,
                database: None,
                auth: CreateAuthPayload::WindowsSspi,
                encrypt: None,
                trust_server_certificate: None,
                environment: None,
            },
        )
        .expect("SSPI não depende de senha no keyring");

    assert_eq!(created.port, 1433);
    assert!(created.encrypt, "encrypt deve ser true por padrão");
    assert_eq!(created.auth_type, "windows_sspi");
    assert_eq!(created.username, None);
}

#[test]
fn validates_untrusted_frontend_inputs_in_rust() {
    let db = setup_in_memory_db();
    let manager = ConnectionManager::new(CredentialStore::new(
        "com.sequelei.app.test",
        InMemoryCredentialBackend::new(),
    ));

    // Nome vazio
    let empty_name = manager.create_connection(
        &db,
        CreateConnectionPayload {
            name: "   ".to_string(),
            host: "localhost".to_string(),
            port: Some(1433),
            database: None,
            auth: CreateAuthPayload::WindowsSspi,
            encrypt: Some(true),
            trust_server_certificate: Some(false),
            environment: Some(ConnectionEnvironment::Dev),
        },
    );
    assert!(matches!(empty_name, Err(ConnectionManagerError::Validation(_))));

    // Host com ponto-e-vírgula (tentativa de injeção em connection string)
    let injected_host = manager.create_connection(
        &db,
        CreateConnectionPayload {
            name: "Injected".to_string(),
            host: "localhost;TrustServerCertificate=true".to_string(),
            port: Some(1433),
            database: None,
            auth: CreateAuthPayload::WindowsSspi,
            encrypt: Some(true),
            trust_server_certificate: Some(false),
            environment: Some(ConnectionEnvironment::Dev),
        },
    );
    assert!(matches!(
        injected_host,
        Err(ConnectionManagerError::Validation(_))
    ));

    // Porta 0 inválida
    let invalid_port = manager.create_connection(
        &db,
        CreateConnectionPayload {
            name: "Porta Zero".to_string(),
            host: "localhost".to_string(),
            port: Some(0),
            database: None,
            auth: CreateAuthPayload::WindowsSspi,
            encrypt: Some(true),
            trust_server_certificate: Some(false),
            environment: Some(ConnectionEnvironment::Dev),
        },
    );
    assert!(matches!(
        invalid_port,
        Err(ConnectionManagerError::Validation(_))
    ));

    // Host remoto sem TLS deve ser bloqueado (SEC-06)
    let remote_no_tls = manager.create_connection(
        &db,
        CreateConnectionPayload {
            name: "Prod Sem TLS".to_string(),
            host: "sql.prod.empresa.com".to_string(),
            port: Some(1433),
            database: Some("ERP".to_string()),
            auth: CreateAuthPayload::WindowsSspi,
            encrypt: Some(false),
            trust_server_certificate: Some(false),
            environment: Some(ConnectionEnvironment::Production),
        },
    );
    assert!(matches!(
        remote_no_tls,
        Err(ConnectionManagerError::Validation(_))
    ));

    // Auth SQL com usuário vazio ou senha vazia
    let empty_sql_password = manager.create_connection(
        &db,
        CreateConnectionPayload {
            name: "Sem Senha".to_string(),
            host: "localhost".to_string(),
            port: Some(1433),
            database: None,
            auth: CreateAuthPayload::Sql {
                user: "sa".to_string(),
                password: "".to_string(),
            },
            encrypt: Some(true),
            trust_server_certificate: Some(false),
            environment: Some(ConnectionEnvironment::Dev),
        },
    );
    assert!(matches!(
        empty_sql_password,
        Err(ConnectionManagerError::Validation(_))
    ));

    // ID inválido em delete_connection
    let bad_id = manager.delete_connection(&db, "   ");
    assert!(matches!(bad_id, Err(ConnectionManagerError::Validation(_))));

    let injection_id = manager.delete_connection(&db, "conn-1; DROP TABLE connection;");
    assert!(matches!(
        injection_id,
        Err(ConnectionManagerError::Validation(_))
    ));
}

#[test]
fn fails_closed_without_writing_sqlite_row_when_keyring_unavailable() {
    let db = setup_in_memory_db();
    let manager = ConnectionManager::new(CredentialStore::new(
        "com.sequelei.app.test",
        UnavailableCredentialBackend::new("daemon indisponível"),
    ));

    let result = manager.create_connection(
        &db,
        CreateConnectionPayload {
            name: "Prod SQL".to_string(),
            host: "sql.prod.empresa.com".to_string(),
            port: Some(1433),
            database: Some("Vendas".to_string()),
            auth: CreateAuthPayload::Sql {
                user: "analyst".to_string(),
                password: "SuperSecretPassword!".to_string(),
            },
            encrypt: Some(true),
            trust_server_certificate: Some(false),
            environment: Some(ConnectionEnvironment::Production),
        },
    );

    assert!(matches!(result, Err(ConnectionManagerError::Credential(_))));
    assert!(
        manager.list_connections(&db).unwrap().is_empty(),
        "não deve gravar registro parcial no SQLite quando o keyring falha"
    );
}

#[tokio::test]
async fn test_connection_and_delete_return_not_found_for_unknown_id() {
    let db = setup_in_memory_db();
    let manager = ConnectionManager::new(CredentialStore::new(
        "com.sequelei.app.test",
        InMemoryCredentialBackend::new(),
    ));
    let tester = MockConnectionTester::ok(5);

    let test_err = manager
        .test_connection(&db, &tester, "conn-inexistente")
        .await
        .expect_err("id inexistente deve retornar NotFound");
    assert!(matches!(test_err, ConnectionManagerError::NotFound(_)));

    let delete_err = manager
        .delete_connection(&db, "conn-inexistente")
        .expect_err("delete de id inexistente deve retornar NotFound");
    assert!(matches!(delete_err, ConnectionManagerError::NotFound(_)));
}
