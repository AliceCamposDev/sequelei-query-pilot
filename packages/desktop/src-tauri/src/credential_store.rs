use std::collections::HashMap;
use std::fmt;
use std::sync::atomic::{compiler_fence, Ordering};
use std::sync::Mutex;

use thiserror::Error;

pub const DEFAULT_SERVICE_NAME: &str = "com.sequelei.app";

/// Wrapper de segredo que impede vazamento em logs (`Debug`/`Display`) e limpa
/// a memória ao sair de escopo.
#[derive(Clone, PartialEq, Eq)]
pub struct SecretString(String);

impl SecretString {
    pub fn new(value: String) -> Self {
        Self(value)
    }

    pub fn expose_secret(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for SecretString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("[REDACTED]")
    }
}

impl fmt::Display for SecretString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("[REDACTED]")
    }
}

impl Drop for SecretString {
    fn drop(&mut self) {
        // SAFETY: preencher com zeros (`0u8`) preserva UTF-8 válido antes de limpar o buffer.
        unsafe {
            self.0.as_bytes_mut().fill(0);
        }
        compiler_fence(Ordering::SeqCst);
        self.0.clear();
    }
}

#[derive(Debug, Error)]
pub enum CredentialError {
    #[error("credential key must not be empty")]
    EmptyKey,

    #[error("credential secret must not be empty")]
    EmptySecret,

    #[error("credential not found for key '{0}'")]
    NotFound(String),

    #[error("secure OS credential store is unavailable: {0}")]
    BackendUnavailable(String),

    #[error("credential store operation failed: {0}")]
    PlatformError(String),
}

/// Abstração de backend seguro de credenciais (keyring nativo ou fakes em teste).
pub trait CredentialBackend: Send + Sync {
    fn set_secret(&self, service: &str, key: &str, secret: &str) -> Result<(), CredentialError>;
    fn get_secret(&self, service: &str, key: &str) -> Result<String, CredentialError>;
    fn delete_secret(&self, service: &str, key: &str) -> Result<(), CredentialError>;
}

/// Backend nativo baseado no crate `keyring` (Windows DPAPI/Credential Manager,
/// macOS Keychain e Linux libsecret). Nunca faz fallback para plaintext.
#[derive(Debug, Default, Clone, Copy)]
pub struct KeyringBackend;

impl KeyringBackend {
    pub fn new() -> Self {
        Self
    }

    fn map_error(key: &str, error: keyring::Error) -> CredentialError {
        match error {
            keyring::Error::NoEntry => CredentialError::NotFound(key.to_string()),
            keyring::Error::NoStorageAccess(inner) => {
                CredentialError::BackendUnavailable(inner.to_string())
            }
            keyring::Error::PlatformFailure(inner) => {
                CredentialError::BackendUnavailable(inner.to_string())
            }
            other => CredentialError::PlatformError(other.to_string()),
        }
    }
}

impl CredentialBackend for KeyringBackend {
    fn set_secret(&self, service: &str, key: &str, secret: &str) -> Result<(), CredentialError> {
        let entry =
            keyring::Entry::new(service, key).map_err(|err| Self::map_error(key, err))?;
        entry
            .set_password(secret)
            .map_err(|err| Self::map_error(key, err))
    }

    fn get_secret(&self, service: &str, key: &str) -> Result<String, CredentialError> {
        let entry =
            keyring::Entry::new(service, key).map_err(|err| Self::map_error(key, err))?;
        entry
            .get_password()
            .map_err(|err| Self::map_error(key, err))
    }

    fn delete_secret(&self, service: &str, key: &str) -> Result<(), CredentialError> {
        let entry =
            keyring::Entry::new(service, key).map_err(|err| Self::map_error(key, err))?;
        entry
            .delete_credential()
            .map_err(|err| Self::map_error(key, err))
    }
}

/// Backend fake em memória para testes unitários determinísticos.
#[derive(Default)]
pub struct InMemoryCredentialBackend {
    entries: Mutex<HashMap<(String, String), String>>,
}

impl InMemoryCredentialBackend {
    pub fn new() -> Self {
        Self::default()
    }
}

impl CredentialBackend for InMemoryCredentialBackend {
    fn set_secret(&self, service: &str, key: &str, secret: &str) -> Result<(), CredentialError> {
        let mut guard = self
            .entries
            .lock()
            .map_err(|_| CredentialError::PlatformError("in-memory lock poisoned".to_string()))?;
        guard.insert((service.to_string(), key.to_string()), secret.to_string());
        Ok(())
    }

    fn get_secret(&self, service: &str, key: &str) -> Result<String, CredentialError> {
        let guard = self
            .entries
            .lock()
            .map_err(|_| CredentialError::PlatformError("in-memory lock poisoned".to_string()))?;
        guard
            .get(&(service.to_string(), key.to_string()))
            .cloned()
            .ok_or_else(|| CredentialError::NotFound(key.to_string()))
    }

    fn delete_secret(&self, service: &str, key: &str) -> Result<(), CredentialError> {
        let mut guard = self
            .entries
            .lock()
            .map_err(|_| CredentialError::PlatformError("in-memory lock poisoned".to_string()))?;
        guard
            .remove(&(service.to_string(), key.to_string()))
            .map(|_| ())
            .ok_or_else(|| CredentialError::NotFound(key.to_string()))
    }
}

/// Backend fake que simula indisponibilidade do keyring do SO para validar falha fechada.
#[derive(Debug, Clone)]
pub struct UnavailableCredentialBackend {
    reason: String,
}

impl UnavailableCredentialBackend {
    pub fn new(reason: impl Into<String>) -> Self {
        Self {
            reason: reason.into(),
        }
    }
}

impl CredentialBackend for UnavailableCredentialBackend {
    fn set_secret(&self, _service: &str, _key: &str, _secret: &str) -> Result<(), CredentialError> {
        Err(CredentialError::BackendUnavailable(self.reason.clone()))
    }

    fn get_secret(&self, _service: &str, _key: &str) -> Result<String, CredentialError> {
        Err(CredentialError::BackendUnavailable(self.reason.clone()))
    }

    fn delete_secret(&self, _service: &str, _key: &str) -> Result<(), CredentialError> {
        Err(CredentialError::BackendUnavailable(self.reason.clone()))
    }
}

/// Gerenciador de credenciais do Sequelei (DPAPI / Keychain / libsecret).
pub struct CredentialStore<B: CredentialBackend = KeyringBackend> {
    service_name: String,
    backend: B,
}

impl CredentialStore<KeyringBackend> {
    pub fn system() -> Self {
        Self::new(DEFAULT_SERVICE_NAME, KeyringBackend::new())
    }
}

impl<B: CredentialBackend> CredentialStore<B> {
    pub fn new(service_name: impl Into<String>, backend: B) -> Self {
        Self {
            service_name: service_name.into(),
            backend,
        }
    }

    pub fn save_credential(&self, key: &str, secret: &str) -> Result<(), CredentialError> {
        let trimmed_key = validate_key(key)?;
        if secret.is_empty() {
            return Err(CredentialError::EmptySecret);
        }

        self.backend
            .set_secret(&self.service_name, trimmed_key, secret)
    }

    pub fn load_credential(&self, key: &str) -> Result<SecretString, CredentialError> {
        let trimmed_key = validate_key(key)?;
        let secret = self.backend.get_secret(&self.service_name, trimmed_key)?;
        Ok(SecretString::new(secret))
    }

    pub fn delete_credential(&self, key: &str) -> Result<(), CredentialError> {
        let trimmed_key = validate_key(key)?;
        self.backend.delete_secret(&self.service_name, trimmed_key)
    }
}

fn validate_key(key: &str) -> Result<&str, CredentialError> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err(CredentialError::EmptyKey);
    }
    Ok(trimmed)
}
