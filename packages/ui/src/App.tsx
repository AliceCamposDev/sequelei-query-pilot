import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { ConnectionManagerDialog } from './components/ConnectionManagerDialog';
import { ExecutionOutput } from './editor/ExecutionOutput';
import { RunButton } from './editor/RunButton';
import { SqlEditor } from './editor/SqlEditor';
import { TabBar } from './editor/TabBar';
import { ObjectTree } from './explorer/ObjectTree';
import { useConnections } from './hooks/useConnections';
import {
  createExplorerDatabase,
  loadExplorerDatabases,
  refreshMetadataCache,
} from './services/metadata';
import { resetExplorer, setExplorerError, setNodes } from './store/explorerSlice';
import { setTheme } from './store/preferencesSlice';
import { closeTab, hydrateTabs, newTab, setActiveTab, updateTabSql } from './store/tabsSlice';
import { loadAppState } from './store/tabsSync';
import { usePreference } from './store/usePreference';

import type { ConnectionSummary } from './services/connections';
import type { AppDispatch, RootState } from './store/store';

type TauriInvoke = <T>(command: string, payload?: unknown) => Promise<T>;
const USER_PREFERENCE_KEY = 'user_preference';

type PanelPreferences = {
  chatWidth?: number;
  explorerWidth?: number;
  resultsHeight?: number;
};

function readPanelPreference(name: keyof Required<PanelPreferences>, fallback: number) {
  try {
    const preferences = JSON.parse(
      localStorage.getItem(USER_PREFERENCE_KEY) ?? '{}',
    ) as PanelPreferences;
    const storedValue = preferences[name];

    return typeof storedValue === 'number' ? storedValue : fallback;
  } catch {
    return fallback;
  }
}

declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke?: TauriInvoke;
      };
    };
  }
}

export function App() {
  const [status, setStatus] = useState('Conectando ao shell Tauri...');
  const [selectedSql, setSelectedSql] = useState('');
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<
    Array<{ role: 'assistant' | 'user'; text: string }>
  >([]);
  const dispatch = useDispatch<AppDispatch>();
  const theme = usePreference('theme');
  const execution = useSelector((state: RootState) => state.execution);
  const { activeTabId, tabs } = useSelector((state: RootState) => state.tabs);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]!;
  const {
    connections,
    create: createConnection,
    error: connectionsError,
    loading: connectionsLoading,
    remove: deleteConnection,
    test: testConnection,
  } = useConnections();

  const activeConnection =
    connections.find((connection) => connection.id === activeConnectionId) ?? null;

  const [leftWidth, setLeftWidth] = useState(() =>
    readPanelPreference('explorerWidth', Number(localStorage.getItem('explorerWidth')) || 248),
  );
  const [rightWidth, setRightWidth] = useState(() =>
    readPanelPreference('chatWidth', Number(localStorage.getItem('chatWidth')) || 320),
  );
  const [resultsHeight, setResultsHeight] = useState(() =>
    readPanelPreference('resultsHeight', Number(localStorage.getItem('resultsHeight')) || 220),
  );
  const dragState = useRef<
    | { side: 'left' | 'right'; startX: number; startWidth: number }
    | { side: 'bottom'; startY: number; startHeight: number }
    | null
  >(null);

  useEffect(() => {
    if (!activeConnectionId && connections.length > 0) {
      setActiveConnectionId(connections[0]!.id);
    } else if (
      activeConnectionId &&
      !connections.some((connection) => connection.id === activeConnectionId)
    ) {
      setActiveConnectionId(connections[0]?.id ?? null);
    }
  }, [activeConnectionId, connections]);

  const loadRealDatabases = useCallback(
    async (connectionId: string, invalidate = false) => {
      dispatch(setExplorerError(null));
      try {
        if (invalidate) {
          await refreshMetadataCache(connectionId);
        }
        const databaseNodes = await loadExplorerDatabases(connectionId);
        dispatch(setNodes(databaseNodes));
      } catch (err) {
        dispatch(setExplorerError(err instanceof Error ? err.message : String(err)));
      }
    },
    [dispatch],
  );

  useEffect(() => {
    if (!activeConnection) {
      return;
    }
    void loadRealDatabases(activeConnection.id);
  }, [activeConnection, loadRealDatabases]);

  useEffect(() => {
    setSelectedSql('');
  }, [activeTabId]);

  useEffect(() => {
    let active = true;
    void loadAppState().then((restored) => {
      if (active && restored.tabs.length > 0) {
        dispatch(hydrateTabs(restored));
      }
    });
    return () => {
      active = false;
    };
  }, [dispatch]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(
      USER_PREFERENCE_KEY,
      JSON.stringify({
        chatWidth: rightWidth,
        explorerWidth: leftWidth,
        resultsHeight,
      }),
    );
  }, [leftWidth, resultsHeight, rightWidth]);

  useEffect(() => {
    const invoke = window.__TAURI__?.core?.invoke;

    if (!invoke) {
      setStatus('Frontend pronto. Execute pelo shell Tauri para testar o ping.');
      return;
    }

    void invoke<string>('ping')
      .then((response) => setStatus(`Shell Tauri respondeu: ${response}`))
      .catch(() => setStatus('Não foi possível chamar o comando ping.'));
  }, []);

  useEffect(() => {
    const getMaxResultsHeight = () => Math.max(200, Math.floor(window.innerHeight * 0.65));

    const handlePointerMove = (event: PointerEvent) => {
      if (!dragState.current) return;

      if (dragState.current.side === 'bottom') {
        const deltaY = dragState.current.startY - event.clientY;
        const nextHeight = Math.max(
          110,
          Math.min(getMaxResultsHeight(), dragState.current.startHeight + deltaY),
        );
        setResultsHeight(nextHeight);
        return;
      }

      const { side, startX, startWidth } = dragState.current;
      const delta = event.clientX - startX;
      const nextWidth = Math.max(
        200,
        Math.min(420, startWidth + (side === 'left' ? delta : -delta)),
      );

      if (side === 'left') {
        setLeftWidth(nextWidth);
      } else {
        setRightWidth(nextWidth);
      }
    };
    const handlePointerUp = () => {
      if (!dragState.current) return;

      dragState.current = null;
      document.body.style.cursor = '';
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [leftWidth, resultsHeight, rightWidth]);

  const startResize = (side: 'left' | 'right', event: React.PointerEvent<HTMLButtonElement>) => {
    dragState.current = {
      side,
      startX: event.clientX,
      startWidth: side === 'left' ? leftWidth : rightWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.cursor = 'col-resize';
  };

  const startResultsResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    dragState.current = {
      side: 'bottom',
      startHeight: resultsHeight,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.cursor = 'row-resize';
  };

  const adjustWidth = (side: 'left' | 'right', direction: number) => {
    if (side === 'left') setLeftWidth((value) => Math.max(200, Math.min(420, value + direction)));
    if (side === 'right') setRightWidth((value) => Math.max(240, Math.min(460, value + direction)));
  };

  const adjustResultsHeight = (delta: number) => {
    const maxHeight = Math.max(200, Math.floor(window.innerHeight * 0.65));
    setResultsHeight((value) => Math.max(110, Math.min(maxHeight, value + delta)));
  };

  const handleSelectTop1000 = (schema: string, table: string) => {
    dispatch(
      newTab({
        sql: `select top 1000 *\nfrom ${schema}.${table} with (nolock);`,
        title: `${schema}.${table}`,
      }),
    );
  };

  const handleAskAi = (prompt: string) => {
    setChatMessage(prompt);
  };

  const handleSendMessage = () => {
    if (!chatMessage.trim()) return;
    const text = chatMessage.trim();
    setChatHistory((prev) => [
      ...prev,
      { role: 'user', text },
      { role: 'assistant', text: `Contexto recebido para consulta: "${text}".` },
    ]);
    setChatMessage('');
  };

  const handleSelectConnection = (connection: ConnectionSummary) => {
    setActiveConnectionId(connection.id);
  };

  const handleDeleteConnection = async (id: string) => {
    await deleteConnection(id);
    if (activeConnectionId === id) {
      setActiveConnectionId(null);
      dispatch(resetExplorer());
    }
  };

  const handleCreateDatabase = async (connectionId: string, dbName: string) => {
    await createExplorerDatabase(connectionId, dbName);
    await loadRealDatabases(connectionId, true);
  };

  const isProduction = activeConnection?.environment === 'production';

  return (
    <div className="app-shell" data-testid="app-shell">
      <header
        className={`topbar ${isProduction ? 'topbar-production' : ''}`}
        aria-label="Barra superior"
      >
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <div>
            <strong>Sequelei</strong>
            <span>QueryPilot</span>
          </div>
        </div>
        <button
          type="button"
          className="connection-status"
          aria-label="Gerenciar conexões"
          data-testid="connection-button"
          onClick={() => setConnectionsOpen(true)}
        >
          <span className="status-dot" aria-hidden="true" />
          <span>{isProduction ? '🔒 SQL Server' : 'SQL Server'}</span>
          <span className="connection-name">
            {activeConnection ? activeConnection.name : 'desenvolvimento'}
          </span>
        </button>
        <div className="topbar-actions">
          <button type="button" onClick={() => setConnectionsOpen(true)}>
            Conexões
          </button>
          <button
            type="button"
            onClick={() => dispatch(setTheme(theme === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          </button>
          <button type="button" onClick={() => dispatch(newTab())}>
            Nova query
          </button>
        </div>
      </header>

      <div
        className="workspace"
        style={{ gridTemplateColumns: `${leftWidth}px 6px minmax(360px, 1fr) 6px ${rightWidth}px` }}
      >
        <aside
          className="panel explorer-panel"
          aria-label="Explorador de objetos"
          data-testid="explorer-panel"
        >
          <PanelHeading
            eyebrow="OBJETOS"
            title="Explorador"
            action="Atualizar"
            onAction={() => {
              if (activeConnection) {
                void loadRealDatabases(activeConnection.id, true);
              } else {
                setConnectionsOpen(true);
              }
            }}
          />
          <ObjectTree
            {...(activeConnection ? { connectionId: activeConnection.id } : {})}
            onAskAi={handleAskAi}
            onSelectTop1000={handleSelectTop1000}
          />
        </aside>

        <ResizeHandle
          side="left"
          value={leftWidth}
          onPointerDown={startResize}
          onAdjust={adjustWidth}
        />

        <main
          className="panel editor-panel"
          aria-label="Editor SQL"
          data-testid="editor-panel"
          style={{
            gridTemplateRows: `auto 34px minmax(120px, 1fr) 6px ${resultsHeight}px 25px`,
          }}
        >
          <PanelHeading
            eyebrow={activeTab.title.toUpperCase()}
            title={activeTab.title}
            actionNode={
              <RunButton
                {...(activeConnection ? { connectionId: activeConnection.id } : {})}
                selectedSql={selectedSql}
                sql={activeTab.sql}
              />
            }
          />
          <TabBar
            activeTabId={activeTabId}
            onAddTab={() => dispatch(newTab())}
            onCloseTab={(id) => dispatch(closeTab(id))}
            onSelectTab={(id) => dispatch(setActiveTab(id))}
            tabs={tabs}
          />
          <div className="editor-container">
            <SqlEditor
              onChange={(sql) => dispatch(updateTabSql({ id: activeTab.id, sql }))}
              onSelectionChange={setSelectedSql}
              theme={theme}
              value={activeTab.sql}
            />
          </div>
          <HorizontalResizeHandle
            value={resultsHeight}
            onPointerDown={startResultsResize}
            onAdjust={adjustResultsHeight}
          />
          <ExecutionOutput />
          <div className="editor-footer">
            <span>
              {activeConnection
                ? `${activeConnection.host}:${activeConnection.port}`
                : 'SQL Server 2016+'}
            </span>
            <span>Ln 1, Col 1</span>
          </div>
        </main>

        <ResizeHandle
          side="right"
          value={rightWidth}
          onPointerDown={startResize}
          onAdjust={adjustWidth}
        />

        <aside className="panel chat-panel" aria-label="Assistente de IA" data-testid="chat-panel">
          <PanelHeading
            eyebrow="ASSISTENTE"
            title="Pergunte à IA"
            action="Limpar"
            onAction={() => setChatHistory([])}
          />
          <div className="chat-body">
            {chatHistory.length === 0 ? (
              <div className="chat-intro">
                <span className="chat-orb" aria-hidden="true">
                  ✦
                </span>
                <p>Descreva o que você quer consultar. O schema ativo será usado como contexto.</p>
              </div>
            ) : (
              <div className="chat-messages" style={{ display: 'grid', gap: '0.5rem' }}>
                {chatHistory.map((item, idx) => (
                  <div
                    key={idx}
                    className="chat-message"
                    style={{
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      lineHeight: '1.4',
                      padding: '0.4rem 0.6rem',
                    }}
                  >
                    <strong>{item.role === 'user' ? 'Você: ' : 'IA: '}</strong>
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="chat-suggestions">
              <button type="button" onClick={() => setChatMessage('Faturamento por cidade')}>
                Faturamento por cidade
              </button>
              <button type="button" onClick={() => setChatMessage('Explique esta query')}>
                Explique esta query
              </button>
            </div>
          </div>
          <div className="chat-composer">
            <textarea
              aria-label="Mensagem para a IA"
              placeholder="Pergunte sobre seus dados..."
              rows={3}
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            <button type="button" aria-label="Enviar mensagem" onClick={handleSendMessage}>
              Enviar
            </button>
          </div>
        </aside>
      </div>

      <footer className="statusbar" aria-label="Barra de status">
        <span>
          <span className="status-dot" aria-hidden="true" />{' '}
          {execution.status === 'running'
            ? 'Executando...'
            : execution.status === 'error'
              ? 'Erro na execução'
              : execution.status === 'cancelled'
                ? 'Cancelada'
                : 'Pronto'}
        </span>
        <span>
          {execution.status === 'error' && execution.error
            ? execution.error
            : execution.status === 'success' && execution.durationMs !== null
              ? `Concluída em ${execution.durationMs}ms (${execution.result?.rows.length ?? 0} linha(s))`
              : status}
        </span>
        <span>UTF-8</span>
        <span>SQL</span>
      </footer>

      <ConnectionManagerDialog
        activeConnectionId={activeConnectionId}
        connections={connections}
        error={connectionsError}
        isOpen={connectionsOpen}
        loading={connectionsLoading}
        onClose={() => setConnectionsOpen(false)}
        onCreateConnection={createConnection}
        onCreateDatabase={handleCreateDatabase}
        onDeleteConnection={handleDeleteConnection}
        onSelectConnection={handleSelectConnection}
        onTestConnection={testConnection}
      />
    </div>
  );
}

function PanelHeading({
  action,
  actionNode,
  eyebrow,
  onAction,
  title,
}: {
  action?: string;
  actionNode?: React.ReactNode;
  eyebrow: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <div className="panel-heading">
      <div>
        <span className="panel-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {actionNode ?? (
        <button type="button" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

function HorizontalResizeHandle({
  onAdjust,
  onPointerDown,
  value,
}: {
  onAdjust: (delta: number) => void;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  value: number;
}) {
  return (
    <button
      className="resize-handle-horizontal"
      type="button"
      aria-label="Redimensionar painel de resultados"
      aria-orientation="horizontal"
      role="separator"
      aria-valuenow={value}
      aria-valuemin={110}
      aria-valuemax={600}
      onPointerDown={onPointerDown}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          onAdjust(24);
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          onAdjust(-24);
        }
      }}
    />
  );
}

function ResizeHandle({
  onAdjust,
  onPointerDown,
  side,
  value,
}: {
  onAdjust: (side: 'left' | 'right', direction: number) => void;
  onPointerDown: (side: 'left' | 'right', event: React.PointerEvent<HTMLButtonElement>) => void;
  side: 'left' | 'right';
  value: number;
}) {
  return (
    <button
      className="resize-handle"
      type="button"
      aria-label={`Redimensionar painel ${side === 'left' ? 'explorador' : 'chat'}`}
      role="separator"
      aria-valuenow={value}
      aria-valuemin={200}
      aria-valuemax={460}
      onPointerDown={(event) => onPointerDown(side, event)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') onAdjust(side, -16);
        if (event.key === 'ArrowRight') onAdjust(side, 16);
      }}
    />
  );
}
