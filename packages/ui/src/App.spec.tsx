import { configureStore } from '@reduxjs/toolkit';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';
import { executionReducer } from './store/executionSlice';
import { explorerReducer } from './store/explorerSlice';
import { preferencesReducer } from './store/preferencesSlice';
import { tabsReducer } from './store/tabsSlice';

vi.mock('@monaco-editor/react', () => ({
  default: ({ onChange, value }: { onChange: (value: string) => void; value: string }) => (
    <textarea
      aria-label="Monaco SQL editor"
      onChange={(e) => onChange(e.target.value)}
      value={value}
    />
  ),
}));

function renderApp() {
  const store = configureStore({
    reducer: {
      execution: executionReducer,
      explorer: explorerReducer,
      preferences: preferencesReducer,
      tabs: tabsReducer,
    },
  });

  return render(
    <Provider store={store}>
      <App />
    </Provider>,
  );
}

describe('App integration', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    delete window.__TAURI__;
  });

  it('renderiza os painéis principais com tabs e editor integrados', () => {
    renderApp();

    expect(screen.getByTestId('app-shell')).not.toBeNull();
    expect(screen.getByTestId('explorer-panel')).not.toBeNull();
    expect(screen.getByTestId('editor-panel')).not.toBeNull();
    expect(screen.getByTestId('chat-panel')).not.toBeNull();
    expect(screen.getByRole('tablist', { name: 'Abas de consulta' })).not.toBeNull();
  });

  it('permite criar nova aba através do botão Nova query na topbar', () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Nova query' }));
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBeGreaterThan(1);
  });

  it('cria aba com select top 1000 e nolock através do menu de contexto do explorador', () => {
    renderApp();

    const tableNode = screen.getByText('TBResultados');
    fireEvent.contextMenu(tableNode, { clientX: 100, clientY: 100 });

    const selectItem = screen.getByRole('menuitem', { name: 'select top 1000 *' });
    fireEvent.click(selectItem);

    const editor = screen.getByRole('textbox', {
      name: 'Monaco SQL editor',
    }) as HTMLTextAreaElement;
    expect(editor.value).toBe('select top 1000 *\nfrom dbo.TBResultados with (nolock);');
  });

  it('preenche mensagem no chat ao clicar em Perguntar à IA no menu de contexto', () => {
    renderApp();

    const tableNode = screen.getByText('TBResultados');
    fireEvent.contextMenu(tableNode, { clientX: 100, clientY: 100 });

    const askAiItem = screen.getByRole('menuitem', { name: 'Perguntar à IA' });
    fireEvent.click(askAiItem);

    const chatComposer = screen.getByRole('textbox', {
      name: 'Mensagem para a IA',
    }) as HTMLTextAreaElement;
    expect(chatComposer.value).toBe('Descreva a tabela dbo.TBResultados e sugira consultas úteis.');
  });

  it('preserva conteúdo ao alternar entre abas', () => {
    renderApp();

    const editor = screen.getByRole('textbox', {
      name: 'Monaco SQL editor',
    }) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'select 111' } });

    fireEvent.click(screen.getByRole('button', { name: 'Nova query' }));
    const tabs = screen.getAllByRole('tab');
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');

    fireEvent.change(editor, { target: { value: 'select 222' } });

    fireEvent.click(tabs[0]!);
    expect(
      (screen.getByRole('textbox', { name: 'Monaco SQL editor' }) as HTMLTextAreaElement).value,
    ).toBe('select 111');

    fireEvent.click(tabs[1]!);
    expect(
      (screen.getByRole('textbox', { name: 'Monaco SQL editor' }) as HTMLTextAreaElement).value,
    ).toBe('select 222');
  });

  it('exibe logs visíveis no painel de saída ao clicar em Executar', async () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Executar consulta' }));

    expect(await screen.findByTestId('nolock-badge')).not.toBeNull();
    expect(await screen.findByText(/Erro na execução:/i)).not.toBeNull();
  });

  it('abre modal de conexões, cria conexão real, lista bancos reais e cria novo banco', async () => {
    const databases = [{ name: 'Vendas', state: 'ONLINE' }];
    const invoke = vi.fn(async (command: string, payload?: unknown) => {
      if (command === 'ping') return 'pong';
      if (command === 'list_connections') return [];
      if (command === 'create_connection') {
        return {
          authType: 'sql',
          createdAt: '2026-11-25 22:40:00',
          database: 'master',
          encrypt: true,
          environment: 'dev',
          host: 'localhost',
          id: 'conn-real-1',
          name: 'SQL Local Real',
          port: 1433,
          trustServerCertificate: true,
          username: 'sa',
        };
      }
      if (command === 'get_databases') return [...databases];
      if (command === 'create_database') {
        const { name } = payload as { name: string };
        databases.push({ name, state: 'ONLINE' });
        return { name, state: 'ONLINE' };
      }
      if (command === 'invalidate_metadata_cache') return undefined;
      return undefined;
    });

    window.__TAURI__ = {
      core: {
        invoke: invoke as unknown as <T>(command: string, payload?: unknown) => Promise<T>,
      },
    };

    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Conexões' }));
    expect(screen.getByTestId('connection-dialog')).not.toBeNull();

    fireEvent.change(screen.getByLabelText('Nome da conexão'), {
      target: { value: 'SQL Local Real' },
    });
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: 'Senha#2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e conectar' }));

    // Explorador passa a listar os bancos reais vindos de get_databases
    expect(await screen.findByRole('treeitem', { name: /Vendas/ })).not.toBeNull();

    // Cria novo banco pela aba de conexões e recarrega o explorador
    fireEvent.change(screen.getByPlaceholderText(/Nome do novo banco/i), {
      target: { value: 'SequeleiLab' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Criar banco' }));

    expect(await screen.findByRole('treeitem', { name: /SequeleiLab/ })).not.toBeNull();
    expect(invoke).toHaveBeenCalledWith('create_database', {
      connectionId: 'conn-real-1',
      name: 'SequeleiLab',
    });
  });

  it('permite redimensionar o painel de resultados verticalmente e persiste a altura', () => {
    localStorage.clear();
    renderApp();

    const resizer = screen.getByRole('separator', {
      name: 'Redimensionar painel de resultados',
    });
    expect(resizer.getAttribute('aria-valuenow')).toBe('220');

    fireEvent.keyDown(resizer, { key: 'ArrowUp' });
    expect(resizer.getAttribute('aria-valuenow')).toBe('244');

    fireEvent.keyDown(resizer, { key: 'ArrowDown' });
    expect(resizer.getAttribute('aria-valuenow')).toBe('220');

    const saved = JSON.parse(localStorage.getItem('user_preference') ?? '{}') as {
      resultsHeight?: number;
    };
    expect(saved.resultsHeight).toBe(220);
  });

  it('restaura abas e conteúdo salvos via load_app_state ao reabrir o app', async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === 'ping') return 'pong';
      if (command === 'list_connections') return [];
      if (command === 'load_app_state') {
        return {
          activeTabId: 'restored-2',
          tabs: [
            {
              dirty: false,
              id: 'restored-1',
              sql: 'select 1;',
              title: 'Aba 1',
            },
            {
              dirty: true,
              id: 'restored-2',
              sql: 'select * from dbo.Recuperada;',
              title: 'Recuperada',
            },
          ],
        };
      }
      return undefined;
    });

    window.__TAURI__ = {
      core: {
        invoke: invoke as unknown as <T>(command: string, payload?: unknown) => Promise<T>,
      },
    };

    renderApp();

    expect(await screen.findByRole('tab', { name: /Recuperada/ })).not.toBeNull();
    const editor = screen.getByRole('textbox', {
      name: 'Monaco SQL editor',
    }) as HTMLTextAreaElement;
    expect(editor.value).toBe('select * from dbo.Recuperada;');
  });
});
