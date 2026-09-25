import { useEffect, useRef, useState } from 'react';

type TauriInvoke = <T>(command: string) => Promise<T>;
const USER_PREFERENCE_KEY = 'user_preference';

type PanelPreferences = {
  chatWidth?: number;
  explorerWidth?: number;
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
  const [leftWidth, setLeftWidth] = useState(() =>
    readPanelPreference('explorerWidth', Number(localStorage.getItem('explorerWidth')) || 248),
  );
  const [rightWidth, setRightWidth] = useState(() =>
    readPanelPreference('chatWidth', Number(localStorage.getItem('chatWidth')) || 320),
  );
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const savedTheme = localStorage.getItem('theme');

    return savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'dark';
  });
  const dragState = useRef<{ side: 'left' | 'right'; startX: number; startWidth: number } | null>(
    null,
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(
      USER_PREFERENCE_KEY,
      JSON.stringify({ chatWidth: rightWidth, explorerWidth: leftWidth }),
    );
  }, [leftWidth, rightWidth]);

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
    const handlePointerMove = (event: PointerEvent) => {
      if (!dragState.current) return;

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
  }, [leftWidth, rightWidth]);

  const startResize = (side: 'left' | 'right', event: React.PointerEvent<HTMLButtonElement>) => {
    dragState.current = {
      side,
      startX: event.clientX,
      startWidth: side === 'left' ? leftWidth : rightWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.cursor = 'col-resize';
  };

  const adjustWidth = (side: 'left' | 'right', direction: number) => {
    if (side === 'left') setLeftWidth((value) => Math.max(200, Math.min(420, value + direction)));
    if (side === 'right') setRightWidth((value) => Math.max(240, Math.min(460, value + direction)));
  };

  return (
    <div className="app-shell" data-testid="app-shell">
      <header className="topbar" aria-label="Barra superior">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <div>
            <strong>Sequelei</strong>
            <span>QueryPilot</span>
          </div>
        </div>
        <div className="connection-status" aria-label="Status da conexão">
          <span className="status-dot" aria-hidden="true" />
          <span>SQL Server</span>
          <span className="connection-name">desenvolvimento</span>
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          </button>
          <button type="button">Nova query</button>
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
          <PanelHeading eyebrow="OBJETOS" title="Explorador" action="Atualizar" />
          <div className="panel-body explorer-tree">
            <button type="button" className="tree-row tree-row-active">
              ▾ <span>Banco de dados</span>
            </button>
            <button type="button" className="tree-row">
              ▸ <span>dbo</span>
            </button>
            <button type="button" className="tree-row tree-row-muted">
              ▸ <span>Tabelas</span>
            </button>
            <button type="button" className="tree-row tree-row-muted">
              ▸ <span>Views</span>
            </button>
          </div>
        </aside>

        <ResizeHandle
          side="left"
          value={leftWidth}
          onPointerDown={startResize}
          onAdjust={adjustWidth}
        />

        <main className="panel editor-panel" aria-label="Editor SQL" data-testid="editor-panel">
          <PanelHeading eyebrow="QUERY 01" title="Consulta sem título" action="Executar" />
          <div className="editor-tabs" role="tablist" aria-label="Abas de consulta">
            <button type="button" role="tab" aria-selected="true">
              Consulta 01 <span>×</span>
            </button>
            <button type="button" role="tab" aria-selected="false">
              +
            </button>
          </div>
          <div className="editor-surface" role="textbox" aria-label="Editor de SQL" tabIndex={0}>
            <div className="line-numbers" aria-hidden="true">
              1<br />2<br />3<br />4<br />5
            </div>
            <pre>
              <code>
                <span className="token-keyword">select</span>{' '}
                <span className="token-function">top</span>{' '}
                <span className="token-number">100</span> *{`\n`}
                <span className="token-keyword">from</span> dbo.TBResultados{`\n`}
                <span className="token-keyword">where</span> ativo ={' '}
                <span className="token-number">1</span>
                {`\n`}
                <span className="token-keyword">order by</span> data_criacao{' '}
                <span className="token-keyword">desc</span>;
              </code>
            </pre>
          </div>
          <div className="editor-footer">
            <span>SQL Server 2016+</span>
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
          <PanelHeading eyebrow="ASSISTENTE" title="Pergunte à IA" action="Limpar" />
          <div className="chat-body">
            <div className="chat-intro">
              <span className="chat-orb" aria-hidden="true">
                ✦
              </span>
              <p>Descreva o que você quer consultar. O schema ativo será usado como contexto.</p>
            </div>
            <div className="chat-suggestions">
              <button type="button">Faturamento por cidade</button>
              <button type="button">Explique esta query</button>
            </div>
          </div>
          <div className="chat-composer">
            <textarea
              aria-label="Mensagem para a IA"
              placeholder="Pergunte sobre seus dados..."
              rows={3}
            />
            <button type="button" aria-label="Enviar mensagem">
              Enviar
            </button>
          </div>
        </aside>
      </div>

      <footer className="statusbar" aria-label="Barra de status">
        <span>
          <span className="status-dot" aria-hidden="true" /> Pronto
        </span>
        <span>{status}</span>
        <span>UTF-8</span>
        <span>SQL</span>
      </footer>
    </div>
  );
}

function PanelHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action: string;
}) {
  return (
    <div className="panel-heading">
      <div>
        <span className="panel-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      <button type="button">{action}</button>
    </div>
  );
}

function ResizeHandle({
  side,
  value,
  onPointerDown,
  onAdjust,
}: {
  side: 'left' | 'right';
  value: number;
  onPointerDown: (side: 'left' | 'right', event: React.PointerEvent<HTMLButtonElement>) => void;
  onAdjust: (side: 'left' | 'right', direction: number) => void;
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
