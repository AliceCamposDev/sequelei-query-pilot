# Gerenciador de Conexão SQL Server (Rust / `tiberius`)

O módulo [`packages/desktop/src-tauri/src/sql_connection.rs`](../packages/desktop/src-tauri/src/sql_connection.rs) implementa a camada de conexão e execução de consultas SQL Server 2016+ no backend Tauri usando `tiberius` e pool `deadpool`.

## Principais tipos e funções

- `ConnectionOptions`: configurações de host, porta, banco de dados, método de autenticação (`AuthMethod::Sql` ou `AuthMethod::WindowsSspi`), política TLS (`encrypt`, `trust_server_certificate`) e timeout de conexão.
  - `validate_tls_policy()`: rejeita conexões remotas sem TLS (`SqlConnectionError::TlsRequiredForRemote`), atendendo a `SEC-06`. Hosts locais (`localhost`, `127.0.0.1`, `::1`, `.`, `(local)`) permitem desenvolvimento sem TLS.
  - `to_tiberius_config()`: valida a política TLS e converte para `tiberius::Config`.
- `create_sql_server_pool(options, max_size) -> Result<SqlServerPool, SqlConnectionError>`: cria um pool gerenciado com `deadpool` (`SqlServerConnectionManager`).
- `connect_sql_server(connection_string) -> Result<SqlServerClient, SqlConnectionError>`: abre uma conexão direta a partir de string ADO.NET (usada também em testes de integração).
- `SqlExecutor`: trait assíncrona implementada por `SqlServerClient` e por `MockSqlExecutor` para permitir testes determinísticos sem depender de banco externo.
- `execute_query(executor, sql, timeout, cancellation) -> Result<QueryResult, SqlConnectionError>`: executa a consulta respeitando timeout (`tokio::time::timeout`) e cancelamento cooperativo (`tokio_util::sync::CancellationToken`).
- `query_scalar_int(executor, sql) -> Result<Option<i64>, SqlConnectionError>`: helper para consultas escalares inteiras (ex.: health check `select 1`).
- `SqlValue` e `QueryResult`: representação serializável (`serde`) dos tipos retornados pelo SQL Server (`Null`, `Int`, `Float`, `Text`, `Decimal`, `DateTime`, `Boolean`, `Binary`).

## Erros tipados (`SqlConnectionError`)

| Variante | Descrição |
| --- | --- |
| `InvalidConnectionString` | String de conexão ADO.NET inválida |
| `Network` | Falha de TCP ao conectar no servidor |
| `Handshake` | Falha no handshake TDS/TLS ou autenticação |
| `Query` | Erro retornado pelo SQL Server na execução |
| `TlsRequiredForRemote` | Tentativa de conexão remota sem TLS |
| `Timeout` | Execução excedeu o limite configurado |
| `Cancelled` | Execução cancelada pelo chamador |
| `Pool` | Falha na criação ou aquisição de conexão no pool |

## Testes

Os testes estão em [`packages/desktop/src-tauri/tests/sql_connection.rs`](../packages/desktop/src-tauri/tests/sql_connection.rs) e cobrem:

- String de conexão inválida → erro tipado
- TLS obrigatório para host remoto e permitido desligado para host local
- Autenticação SQL e Windows SSPI
- Criação do pool `deadpool`
- Execução de `select 1` e tipos variados (`int`, `varchar`, `decimal`, `datetime`, `null`, `bit`, `float`)
- Timeout respeitado e cancelamento via `CancellationToken`
- Teste opcional contra SQL Server real quando `TEST_SQL_SERVER_CONN` está definida no ambiente
