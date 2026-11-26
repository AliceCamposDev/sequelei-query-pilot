import { useEffect, useState } from 'react';

import type {
  ConnectionEnvironment,
  ConnectionSummary,
  ConnectionTestResult,
  CreateConnectionPayload,
} from '../services/connections';

export interface ConnectionManagerDialogProps {
  activeConnectionId: string | null;
  connections: ConnectionSummary[];
  error: string | null;
  isOpen: boolean;
  loading: boolean;
  onClose: () => void;
  onCreateConnection: (payload: CreateConnectionPayload) => Promise<ConnectionSummary>;
  onCreateDatabase: (connectionId: string, dbName: string) => Promise<void>;
  onDeleteConnection: (id: string) => Promise<void>;
  onSelectConnection: (connection: ConnectionSummary) => void;
  onTestConnection: (id: string) => Promise<ConnectionTestResult>;
}

export function ConnectionManagerDialog({
  activeConnectionId,
  connections,
  error,
  isOpen,
  loading,
  onClose,
  onCreateConnection,
  onCreateDatabase,
  onDeleteConnection,
  onSelectConnection,
  onTestConnection,
}: ConnectionManagerDialogProps) {
  const [name, setName] = useState('');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('1433');
  const [database, setDatabase] = useState('master');
  const [authType, setAuthType] = useState<'sql' | 'windows_sspi'>('sql');
  const [username, setUsername] = useState('sa');
  const [password, setPassword] = useState('');
  const [environment, setEnvironment] = useState<ConnectionEnvironment>('dev');
  const [encrypt, setEncrypt] = useState(true);
  const [trustServerCertificate, setTrustServerCertificate] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [testStatuses, setTestStatuses] = useState<Record<string, string>>({});
  const [newDbName, setNewDbName] = useState('');
  const [dbFeedback, setDbFeedback] = useState<{ kind: 'error' | 'success'; text: string } | null>(
    null,
  );
  const [creatingDb, setCreatingDb] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const activeConnection = connections.find((conn) => conn.id === activeConnectionId) ?? null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const parsedPort = Number(port);
      const payload: CreateConnectionPayload = {
        auth:
          authType === 'sql' ? { password, type: 'sql', user: username } : { type: 'windows_sspi' },
        encrypt,
        environment,
        host,
        name,
        port: Number.isFinite(parsedPort) ? parsedPort : 1433,
        trustServerCertificate,
        ...(database.trim() ? { database: database.trim() } : {}),
      };

      const created = await onCreateConnection(payload);
      setName('');
      setPassword('');
      onSelectConnection(created);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleTest = async (id: string) => {
    setTestStatuses((prev) => ({ ...prev, [id]: 'Testando...' }));
    try {
      const result = await onTestConnection(id);
      setTestStatuses((prev) => ({
        ...prev,
        [id]: result.ok ? `OK (${result.latencyMs}ms)` : result.message,
      }));
    } catch (err) {
      setTestStatuses((prev) => ({
        ...prev,
        [id]: `Falha: ${err instanceof Error ? err.message : String(err)}`,
      }));
    }
  };

  const handleCreateDb = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeConnection || !newDbName.trim()) return;

    setCreatingDb(true);
    setDbFeedback(null);
    try {
      const createdName = newDbName.trim();
      await onCreateDatabase(activeConnection.id, createdName);
      setNewDbName('');
      setDbFeedback({
        kind: 'success',
        text: `Banco "${createdName}" criado e carregado no explorador.`,
      });
    } catch (err) {
      setDbFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setCreatingDb(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal-dialog connection-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Gerenciar conexões SQL Server"
        data-testid="connection-dialog"
      >
        <div className="modal-header">
          <div>
            <span className="panel-eyebrow">SQL SERVER</span>
            <h2>Conexões e Bancos de Dados</h2>
          </div>
          <button type="button" aria-label="Fechar conexões" onClick={onClose}>
            Fechar
          </button>
        </div>

        {(error || formError) && (
          <div role="alert" className="modal-alert">
            {formError ?? error}
          </div>
        )}

        <div className="connection-dialog-grid">
          <section className="connection-section" aria-label="Conexões salvas">
            <h3>Conexões salvas</h3>
            {loading ? (
              <p className="tree-empty">Carregando conexões...</p>
            ) : connections.length === 0 ? (
              <p className="tree-empty">
                Nenhuma conexão cadastrada. Crie uma conexão ao lado para listar os bancos reais.
              </p>
            ) : (
              <ul className="connection-list">
                {connections.map((conn) => {
                  const isActive = conn.id === activeConnectionId;
                  const testStatus = testStatuses[conn.id];
                  return (
                    <li
                      key={conn.id}
                      className={`connection-card ${isActive ? 'connection-card-active' : ''}`}
                    >
                      <div className="connection-card-header">
                        <strong>
                          {conn.environment === 'production' ? '🔒 ' : ''}
                          {conn.name}
                        </strong>
                        <span className={`env-badge env-badge-${conn.environment}`}>
                          {conn.environment}
                        </span>
                      </div>
                      <div className="connection-card-meta">
                        <span>
                          {conn.host}:{conn.port}
                          {conn.database ? ` / ${conn.database}` : ''}
                        </span>
                        <span>
                          {conn.authType === 'sql'
                            ? `SQL (${conn.username ?? ''})`
                            : 'Windows SSPI'}
                        </span>
                      </div>
                      {testStatus && <p className="connection-test-status">{testStatus}</p>}
                      <div className="connection-card-actions">
                        <button
                          type="button"
                          onClick={() => onSelectConnection(conn)}
                          disabled={isActive}
                        >
                          {isActive ? 'Conectado' : 'Conectar'}
                        </button>
                        <button type="button" onClick={() => void handleTest(conn.id)}>
                          Testar
                        </button>
                        <button
                          type="button"
                          className="danger-btn"
                          onClick={() => void onDeleteConnection(conn.id)}
                        >
                          Excluir
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="create-db-box">
              <h3>Criar banco de dados</h3>
              {activeConnection ? (
                <form className="create-db-form" onSubmit={(event) => void handleCreateDb(event)}>
                  <label htmlFor="new-database-name">
                    Servidor ativo: <strong>{activeConnection.name}</strong>
                  </label>
                  <div className="create-db-row">
                    <input
                      id="new-database-name"
                      type="text"
                      placeholder="Nome do novo banco (ex.: SequeleiApp)"
                      value={newDbName}
                      onChange={(event) => setNewDbName(event.target.value)}
                      required
                    />
                    <button type="submit" disabled={creatingDb || !newDbName.trim()}>
                      {creatingDb ? 'Criando...' : 'Criar banco'}
                    </button>
                  </div>
                  {dbFeedback && (
                    <p
                      role={dbFeedback.kind === 'error' ? 'alert' : 'status'}
                      className={
                        dbFeedback.kind === 'error'
                          ? 'connection-feedback-error'
                          : 'connection-feedback-ok'
                      }
                    >
                      {dbFeedback.text}
                    </p>
                  )}
                </form>
              ) : (
                <p className="tree-empty">
                  Selecione ou crie uma conexão para criar novos bancos de dados.
                </p>
              )}
            </div>
          </section>

          <section className="connection-section" aria-label="Nova conexão">
            <h3>Nova conexão</h3>
            <form className="connection-form" onSubmit={(event) => void handleSubmit(event)}>
              <label>
                Nome da conexão
                <input
                  type="text"
                  placeholder="Ex.: SQL Server Local"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </label>

              <div className="connection-form-row">
                <label>
                  Host
                  <input
                    type="text"
                    placeholder="localhost ou sql.empresa.com"
                    value={host}
                    onChange={(event) => setHost(event.target.value)}
                    required
                  />
                </label>
                <label>
                  Porta
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={port}
                    onChange={(event) => setPort(event.target.value)}
                    required
                  />
                </label>
              </div>

              <div className="connection-form-row">
                <label>
                  Banco inicial (opcional)
                  <input
                    type="text"
                    placeholder="master"
                    value={database}
                    onChange={(event) => setDatabase(event.target.value)}
                  />
                </label>
                <label>
                  Ambiente
                  <select
                    value={environment}
                    onChange={(event) =>
                      setEnvironment(event.target.value as ConnectionEnvironment)
                    }
                  >
                    <option value="dev">dev</option>
                    <option value="staging">staging</option>
                    <option value="production">production</option>
                  </select>
                </label>
              </div>

              <label>
                Autenticação
                <select
                  value={authType}
                  onChange={(event) => setAuthType(event.target.value as 'sql' | 'windows_sspi')}
                >
                  <option value="sql">SQL Server (usuário e senha)</option>
                  <option value="windows_sspi">Windows (SSPI)</option>
                </select>
              </label>

              {authType === 'sql' && (
                <div className="connection-form-row">
                  <label>
                    Usuário
                    <input
                      type="text"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Senha
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                    />
                  </label>
                </div>
              )}

              <div className="connection-checkboxes">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={encrypt}
                    onChange={(event) => setEncrypt(event.target.checked)}
                  />
                  Usar TLS (obrigatório para hosts remotos)
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={trustServerCertificate}
                    onChange={(event) => setTrustServerCertificate(event.target.checked)}
                  />
                  Confiar no certificado do servidor (dev/local)
                </label>
              </div>

              <button type="submit" className="primary-btn" disabled={submitting}>
                {submitting ? 'Salvando...' : 'Salvar e conectar'}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
