use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use sequelei_desktop::{
    CredentialError, CredentialStore, InMemoryCredentialBackend, SecretString,
    UnavailableCredentialBackend,
};

#[test]
fn in_memory_save_load_overwrite_and_delete_credential() {
    let store = CredentialStore::new("com.sequelei.app.test", InMemoryCredentialBackend::new());

    store
        .save_credential("conn-dev", "S3nh@SuperSecreta!")
        .expect("salvar credencial em memória deve funcionar");

    let loaded = store
        .load_credential("conn-dev")
        .expect("carregar credencial salva deve funcionar");
    assert_eq!(loaded.expose_secret(), "S3nh@SuperSecreta!");

    // Sobrescrever credencial existente
    store
        .save_credential("conn-dev", "NovaSenha#2026")
        .expect("sobrescrever credencial deve funcionar");
    let updated = store.load_credential("conn-dev").unwrap();
    assert_eq!(updated.expose_secret(), "NovaSenha#2026");

    // Remover credencial
    store
        .delete_credential("conn-dev")
        .expect("remover credencial deve funcionar");

    let after_delete = store.load_credential("conn-dev");
    assert!(matches!(after_delete, Err(CredentialError::NotFound(ref k)) if k == "conn-dev"));
}

#[test]
fn delete_nonexistent_credential_returns_not_found() {
    let store = CredentialStore::new("com.sequelei.app.test", InMemoryCredentialBackend::new());

    let result = store.delete_credential("nao-existe");
    assert!(matches!(result, Err(CredentialError::NotFound(ref k)) if k == "nao-existe"));
}

#[test]
fn rejects_empty_key_and_empty_secret() {
    let store = CredentialStore::new("com.sequelei.app.test", InMemoryCredentialBackend::new());

    assert!(matches!(
        store.save_credential("   ", "segredo"),
        Err(CredentialError::EmptyKey)
    ));
    assert!(matches!(
        store.save_credential("conn-1", ""),
        Err(CredentialError::EmptySecret)
    ));
    assert!(matches!(
        store.load_credential(""),
        Err(CredentialError::EmptyKey)
    ));
    assert!(matches!(
        store.delete_credential("  "),
        Err(CredentialError::EmptyKey)
    ));
}

#[test]
fn unavailable_keyring_returns_typed_error_without_plaintext_fallback() {
    let store = CredentialStore::new(
        "com.sequelei.app.test",
        UnavailableCredentialBackend::new("OS keyring daemon indisponível"),
    );

    let save_err = store
        .save_credential("conn-prod", "SegredoProducao!99")
        .expect_err("keyring indisponível deve falhar de forma fechada");
    assert!(matches!(save_err, CredentialError::BackendUnavailable(_)));

    let load_err = store
        .load_credential("conn-prod")
        .expect_err("não pode cair para fallback em plaintext");
    assert!(matches!(load_err, CredentialError::BackendUnavailable(_)));

    let delete_err = store
        .delete_credential("conn-prod")
        .expect_err("delete com keyring indisponível deve retornar BackendUnavailable");
    assert!(matches!(delete_err, CredentialError::BackendUnavailable(_)));

    // Garante que o erro nunca vaza o segredo em Display/Debug
    let save_msg = format!("{save_err} | {save_err:?}");
    assert!(!save_msg.contains("SegredoProducao!99"));
}

#[test]
fn secret_string_never_leaks_value_in_debug_or_display_logs() {
    let raw = "TopSecret#SqlPassword!2026";
    let secret = SecretString::new(raw.to_string());

    let debug_output = format!("{secret:?}");
    let display_output = format!("{secret}");

    assert_eq!(debug_output, "[REDACTED]");
    assert_eq!(display_output, "[REDACTED]");
    assert!(!debug_output.contains(raw));
    assert!(!display_output.contains(raw));
    assert_eq!(secret.expose_secret(), raw);
}

struct CredentialCleanupGuard {
    key: String,
}

impl Drop for CredentialCleanupGuard {
    fn drop(&mut self) {
        let _ = CredentialStore::system().delete_credential(&self.key);
    }
}

/// Helper executado em processo filho separado pelo teste `real_keyring_persists_across_process_restart`.
#[test]
#[ignore]
fn child_write_credential_helper() {
    let key = std::env::var("SEQUELEI_TEST_CRED_KEY").expect("SEQUELEI_TEST_CRED_KEY ausente");
    let value =
        std::env::var("SEQUELEI_TEST_CRED_VALUE").expect("SEQUELEI_TEST_CRED_VALUE ausente");

    CredentialStore::system()
        .save_credential(&key, &value)
        .expect("processo filho falhou ao gravar credencial no keyring do sistema");
}

#[test]
fn real_keyring_persists_across_process_restart() {
    let unique_suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let test_key = format!("sequelei-it-restart-{}-{unique_suffix}", std::process::id());
    let expected_secret = format!("Persist!{unique_suffix}");

    // Verifica se o keyring nativo está acessível neste ambiente (ex.: CI Linux headless sem D-Bus)
    let probe_key = format!("{test_key}-probe");
    match CredentialStore::system().save_credential(&probe_key, "probe") {
        Ok(()) => {
            let _ = CredentialStore::system().delete_credential(&probe_key);
        }
        Err(CredentialError::BackendUnavailable(_))
            if std::env::var("SEQUELEI_REQUIRE_KEYRING_IT").is_err() =>
        {
            // Em ambiente headless sem daemon de keyring, falha fechada já foi validada;
            // defina SEQUELEI_REQUIRE_KEYRING_IT=1 para exigir execução real.
            return;
        }
        Err(other) => panic!("falha inesperada ao testar disponibilidade do keyring: {other}"),
    }

    let _cleanup = CredentialCleanupGuard {
        key: test_key.clone(),
    };

    // 1. Grava credencial em um processo filho independente
    let current_exe = std::env::current_exe().expect("não foi possível localizar binário de teste");
    let status = Command::new(current_exe)
        .args([
            "--exact",
            "child_write_credential_helper",
            "--ignored",
            "--nocapture",
        ])
        .env("SEQUELEI_TEST_CRED_KEY", &test_key)
        .env("SEQUELEI_TEST_CRED_VALUE", &expected_secret)
        .status()
        .expect("falha ao iniciar processo filho");
    assert!(
        status.success(),
        "processo filho deve gravar credencial no keyring e encerrar com sucesso"
    );

    // 2. Processo filho encerrado (reinício simulado): lê de volta no processo atual
    let loaded = CredentialStore::system()
        .load_credential(&test_key)
        .expect("credencial gravada pelo processo filho deve persistir após reinício");
    assert_eq!(loaded.expose_secret(), expected_secret);

    // 3. Remove e garante que não existe mais
    CredentialStore::system()
        .delete_credential(&test_key)
        .expect("remoção da credencial real deve funcionar");
    assert!(matches!(
        CredentialStore::system().load_credential(&test_key),
        Err(CredentialError::NotFound(_))
    ));
}
