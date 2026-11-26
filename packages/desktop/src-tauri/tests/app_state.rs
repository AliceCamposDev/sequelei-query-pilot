use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;
use sequelei_desktop::{
    init_app_state_schema, load_app_state_from_db, load_app_state_from_path,
    save_app_state_to_path, PersistedAppState, PersistedQueryTab, PersistedTabCursor,
    PersistedTabScroll,
};

fn unique_temp_db_path(label: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!(
        "sequelei-{label}-{}-{nanos}.db",
        std::process::id()
    ))
}

fn cleanup_db_files(path: &PathBuf) {
    let _ = fs::remove_file(path);
    let _ = fs::remove_file(path.with_extension("db-wal"));
    let _ = fs::remove_file(path.with_extension("db-shm"));
    let _ = fs::remove_file(path.with_extension("db.corrupt"));
}

#[test]
fn close_and_reopen_restores_tabs_and_content() {
    let db_path = unique_temp_db_path("restore");

    let saved_state = PersistedAppState {
        active_tab_id: Some("query-2".to_string()),
        tabs: vec![
            PersistedQueryTab {
                id: "query-1".to_string(),
                title: "Clientes".to_string(),
                sql: "select top 100 * from dbo.Clientes with (nolock);".to_string(),
                dirty: false,
                cursor: Some(PersistedTabCursor {
                    line_number: 1,
                    column: 12,
                }),
                scroll: Some(PersistedTabScroll {
                    scroll_left: 0,
                    scroll_top: 40,
                }),
            },
            PersistedQueryTab {
                id: "query-2".to_string(),
                title: "Pedidos".to_string(),
                sql: "select count(*) from dbo.Pedidos with (nolock);".to_string(),
                dirty: true,
                cursor: Some(PersistedTabCursor {
                    line_number: 2,
                    column: 5,
                }),
                scroll: None,
            },
        ],
    };

    save_app_state_to_path(&db_path, &saved_state).expect("salvar app_state deve suceder");

    // Reabre a partir do disco simulando reinício completo do app
    let restored = load_app_state_from_path(&db_path);
    cleanup_db_files(&db_path);

    assert_eq!(restored, saved_state);
}

#[test]
fn corrupted_state_file_and_corrupted_json_start_empty_without_crashing() {
    // Caso 1: arquivo SQLite corrompido em disco
    let corrupt_path = unique_temp_db_path("corrupt-file");
    fs::write(&corrupt_path, b"THIS IS NOT A VALID SQLITE DATABASE FILE!!!").unwrap();

    let from_corrupt_file = load_app_state_from_path(&corrupt_path);
    assert_eq!(from_corrupt_file, PersistedAppState::default());

    // Salvar novamente sobre o arquivo corrompido deve se recuperar automaticamente
    let recovered = PersistedAppState {
        active_tab_id: Some("query-1".to_string()),
        tabs: vec![PersistedQueryTab {
            id: "query-1".to_string(),
            title: "Recuperada".to_string(),
            sql: "select 1".to_string(),
            dirty: false,
            cursor: None,
            scroll: None,
        }],
    };
    save_app_state_to_path(&corrupt_path, &recovered)
        .expect("salvar após corrupção deve recriar banco limpo");
    assert_eq!(load_app_state_from_path(&corrupt_path), recovered);
    cleanup_db_files(&corrupt_path);

    // Caso 2: JSON corrompido dentro da tabela app_state
    let db = Connection::open_in_memory().unwrap();
    init_app_state_schema(&db).unwrap();
    db.execute(
        "INSERT INTO app_state (key, value) VALUES ('tabs', '{json-invalido')",
        [],
    )
    .unwrap();

    let from_corrupt_json = load_app_state_from_db(&db);
    assert_eq!(from_corrupt_json, PersistedAppState::default());
}

/// Processo filho que persiste abas e encerra abruptamente via `std::process::exit(137)` (crash).
#[test]
#[ignore]
fn child_save_and_crash_with_exit() {
    let path_str =
        std::env::var("SEQUELEI_CRASH_TEST_DB").expect("SEQUELEI_CRASH_TEST_DB ausente");
    let db_path = PathBuf::from(path_str);

    let state = PersistedAppState {
        active_tab_id: Some("crash-tab-2".to_string()),
        tabs: vec![
            PersistedQueryTab {
                id: "crash-tab-1".to_string(),
                title: "Antes do crash".to_string(),
                sql: "select * from dbo.Vendas with (nolock);".to_string(),
                dirty: true,
                cursor: Some(PersistedTabCursor {
                    line_number: 1,
                    column: 7,
                }),
                scroll: None,
            },
            PersistedQueryTab {
                id: "crash-tab-2".to_string(),
                title: "Aba ativa".to_string(),
                sql: "select top 50 * from dbo.Clientes with (nolock);".to_string(),
                dirty: true,
                cursor: None,
                scroll: None,
            },
        ],
    };

    save_app_state_to_path(&db_path, &state).expect("persistir estado antes do crash");

    // Simula crash abrupto no meio da execução (sem rodar destructors nem shutdown gracioso)
    std::process::exit(137);
}

#[test]
fn simulated_crash_with_process_exit_recovers_saved_tabs() {
    let db_path = unique_temp_db_path("crash-sim");
    let current_exe = std::env::current_exe().expect("localizar executável de teste");

    let status = Command::new(current_exe)
        .args([
            "--exact",
            "child_save_and_crash_with_exit",
            "--ignored",
            "--nocapture",
        ])
        .env("SEQUELEI_CRASH_TEST_DB", db_path.to_string_lossy().as_ref())
        .status()
        .expect("iniciar processo filho de crash");

    assert_eq!(
        status.code(),
        Some(137),
        "processo filho deve simular crash encerrando com exit code 137"
    );

    let restored = load_app_state_from_path(&db_path);
    cleanup_db_files(&db_path);

    assert_eq!(restored.active_tab_id.as_deref(), Some("crash-tab-2"));
    assert_eq!(restored.tabs.len(), 2);
    assert_eq!(
        restored.tabs[0].sql,
        "select * from dbo.Vendas with (nolock);"
    );
    assert_eq!(
        restored.tabs[1].sql,
        "select top 50 * from dbo.Clientes with (nolock);"
    );
}
