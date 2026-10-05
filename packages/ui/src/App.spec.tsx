import { configureStore } from '@reduxjs/toolkit';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';
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
});
