import { describe, expect, it } from 'vitest';

import {
  addTab,
  closeTab,
  cycleTab,
  defaultTabs,
  newTab,
  setActiveTab,
  tabsReducer,
  updateTabCursor,
  updateTabScroll,
  updateTabSql,
} from './tabsSlice';

describe('tabs slice', () => {
  it('cria uma nova aba e a torna ativa via addTab', () => {
    const state = tabsReducer(defaultTabs, addTab({ sql: 'select 1', title: 'Teste' }));

    expect(state.tabs).toHaveLength(2);
    expect(state.tabs[1]).toMatchObject({ sql: 'select 1', title: 'Teste' });
    expect(state.activeTabId).toBe(state.tabs[1]?.id);
  });

  it('cria uma nova aba e a torna ativa via newTab', () => {
    const state = tabsReducer(defaultTabs, newTab({ sql: 'select top 1000 *', title: 'Nova' }));

    expect(state.tabs).toHaveLength(2);
    expect(state.tabs[1]).toMatchObject({ sql: 'select top 1000 *', title: 'Nova' });
    expect(state.activeTabId).toBe(state.tabs[1]?.id);
  });

  it('atualiza o SQL e marca a aba como dirty', () => {
    const state = tabsReducer(defaultTabs, updateTabSql({ id: 'query-1', sql: 'select 2' }));

    expect(state.tabs[0]).toMatchObject({ dirty: true, sql: 'select 2' });
  });

  it('permite alternar a aba ativa com setActiveTab', () => {
    let state = tabsReducer(defaultTabs, addTab({ id: 'query-2', title: 'Aba 2' }));
    expect(state.activeTabId).toBe('query-2');

    state = tabsReducer(state, setActiveTab('query-1'));
    expect(state.activeTabId).toBe('query-1');
  });

  it('fecha uma aba e ajusta a aba ativa para a anterior ou fallback', () => {
    let state = tabsReducer(defaultTabs, addTab({ id: 'query-2', title: 'Aba 2' }));
    state = tabsReducer(state, addTab({ id: 'query-3', title: 'Aba 3' }));
    expect(state.tabs).toHaveLength(3);
    expect(state.activeTabId).toBe('query-3');

    state = tabsReducer(state, closeTab('query-3'));
    expect(state.tabs).toHaveLength(2);
    expect(state.activeTabId).toBe('query-2');
  });

  it('não fecha a última aba restante', () => {
    const state = tabsReducer(defaultTabs, closeTab('query-1'));

    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.id).toBe('query-1');
  });

  it('cicla abas para a frente e para trás via cycleTab', () => {
    let state = tabsReducer(defaultTabs, addTab({ id: 'query-2', title: 'Aba 2' }));
    state = tabsReducer(state, addTab({ id: 'query-3', title: 'Aba 3' }));

    state = tabsReducer(state, setActiveTab('query-1'));
    expect(state.activeTabId).toBe('query-1');

    state = tabsReducer(state, cycleTab('next'));
    expect(state.activeTabId).toBe('query-2');

    state = tabsReducer(state, cycleTab('next'));
    expect(state.activeTabId).toBe('query-3');

    state = tabsReducer(state, cycleTab('prev'));
    expect(state.activeTabId).toBe('query-2');
  });

  it('armazena cursor e scroll por aba', () => {
    let state = tabsReducer(
      defaultTabs,
      updateTabCursor({ cursor: { column: 5, lineNumber: 2 }, id: 'query-1' }),
    );
    state = tabsReducer(
      state,
      updateTabScroll({ id: 'query-1', scroll: { scrollLeft: 10, scrollTop: 20 } }),
    );

    expect(state.tabs[0]?.cursor).toEqual({ column: 5, lineNumber: 2 });
    expect(state.tabs[0]?.scroll).toEqual({ scrollLeft: 10, scrollTop: 20 });
  });

  it('preserva o conteúdo independente entre as abas', () => {
    let state = tabsReducer(defaultTabs, addTab({ id: 'query-2', sql: 'select a from b' }));
    state = tabsReducer(state, updateTabSql({ id: 'query-1', sql: 'select x from y' }));

    expect(state.tabs.find((t) => t.id === 'query-1')?.sql).toBe('select x from y');
    expect(state.tabs.find((t) => t.id === 'query-2')?.sql).toBe('select a from b');
  });
});
