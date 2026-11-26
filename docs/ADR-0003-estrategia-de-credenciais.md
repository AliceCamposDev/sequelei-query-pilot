# ADR-0003: Estratégia de Armazenamento Seguro de Credenciais

- **Status:** Aceita
- **Data:** 2026-11-25
- **Decisão:** delegar o armazenamento de segredos ao cofre nativo do sistema operacional via crate Rust `keyring`, sem fallback em texto claro

## Contexto

O Sequelei QueryPilot conecta-se a instâncias SQL Server locais e remotas (desenvolvimento, homologação e produção) usando autenticação Windows (SSPI) ou SQL Server (usuário/senha). Para conexões com autenticação SQL, as senhas precisam persistir entre reinícios do aplicativo sem jamais serem gravadas em texto claro no SQLite local, em `localStorage`, em arquivos de configuração ou em logs de execução.

As alternativas avaliadas foram:

1. Cofre nativo do sistema operacional abstraído pelo crate `keyring` (Windows Credential Manager/DPAPI, macOS Keychain e Linux Secret Service/`libsecret`).
2. Criptografia simétrica em arquivo local ou coluna SQLite com chave derivada/embutida no binário.
3. Pedir a senha ao usuário em toda abertura do aplicativo (sem persistência).

## Decisão

Adotaremos `CredentialStore` em Rust (`packages/desktop/src-tauri/src/credential_store.rs`) usando o crate `keyring` v3 com as features nativas por sistema operacional (`windows-native`, `apple-native`, `sync-secret-service`):

- **Windows:** Windows Credential Manager protegido via DPAPI por sessão/usuário.
- **macOS:** Apple Keychain.
- **Linux:** D-Bus Secret Service (`libsecret` / GNOME Keyring / KWallet).
- **Namespace do serviço:** `com.sequelei.app` (mesmo `identifier` do Tauri).
- **Política de falha fechada (fail-closed):** se o cofre do SO estiver indisponível ou bloqueado, o `CredentialStore` retorna `CredentialError::BackendUnavailable` e **nunca** faz fallback para arquivo plaintext ou SQLite sem proteção do SO.
- **Proteção contra vazamento em logs e memória:** toda credencial carregada é encapsulada em `SecretString`, cujas implementações de `Debug` e `Display` sempre produzem `[REDACTED]` e cujo `Drop` zera os bytes em memória antes de liberar o buffer. Erros tipados (`CredentialError`) nunca incluem o valor do segredo.
- **Testabilidade:** a trait `CredentialBackend` permite testes unitários determinísticos com `InMemoryCredentialBackend` e `UnavailableCredentialBackend`, complementados por teste de integração real entre processos (`real_keyring_persists_across_process_restart`).

## Justificativa

- Aproveita o controle de acesso, criptografia vinculada ao usuário e auditoria já fornecidos pelo sistema operacional.
- Elimina a necessidade de embutir ou gerenciar manualmente uma chave mestra no binário ou no disco.
- Mantém todas as credenciais restritas ao processo backend em Rust, nunca transitando para o WebView após o cadastro.
- Garante comportamento seguro por padrão (fail-closed) em ambientes sem cofre configurado.

## Consequências

### Positivas

- Segredos protegidos nativamente em Windows, macOS e Linux sem dependências externas customizadas.
- Zero risco de exposição acidental de senhas via `Debug`/`Display` ou arquivos locais em texto claro.
- Separação limpa entre metadados da conexão (armazenados em SQLite) e o segredo (armazenado no cofre do SO por `connection_id`).

### Negativas

- Em ambientes Linux headless (ex.: containers CI sem daemon D-Bus Secret Service), o keyring nativo não está disponível; o aplicativo recusa salvar credenciais com erro explícito em vez de degradar silenciosamente.
- Exige testes de integração específicos em cada sistema operacional alvo no pipeline de release.

## Alternativas rejeitadas

### Criptografia em arquivo/SQLite com chave local

Guardar uma chave de criptografia junto ao aplicativo ou em arquivo no diretório de dados apenas ofusca a credencial contra leitura casual, mas não protege contra acesso ao disco sem um cofre do sistema operacional ou senha mestra digitada pelo usuário.

### Não persistir credenciais

Reduz a superfície de armazenamento, mas prejudica significativamente a produtividade diária de analistas e engenheiros de dados com múltiplas conexões frequentes, incentivando o armazenamento inseguro em blocos de notas externos.
