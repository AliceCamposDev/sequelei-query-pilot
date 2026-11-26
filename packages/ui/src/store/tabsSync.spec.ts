import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hydrateTabs, newTab, tabsReducer, updateTabSql } from './tabsSlice';
import {
  createTabsSync,
  loadAppState,
  parsePersistedAppState,
  type AppStateInvoker,
} from './tabsSync';

describe('tabsSync (persistência de abas e recuperação)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persiste abas via save_app_state ao editar e restaura ao reabrir', async () => {
    let persistedPayload: unknown = null;
    const invoker = vi.fn(async (command: string, payload?: unknown) => {
      if (command === 'save_app_state') {
        persistedPayload = (payload as { state: unknown }).state;
      }
      if (command === 'load_app_state') {
        return persistedPayload;
      }
      return undefined;
    }) as unknown as AppStateInvoker;

    // Sessão 1: cria aba, escreve SQL e "fecha"
    const storeSession1 = configureStore({
      middleware: (getDefault) => getDefault().concat(createTabsSync(invoker)),
      reducer: { tabs: tabsReducer },
    });

    storeSession1.dispatch(newTab({ sql: 'select * from dbo.Vendas', title: 'Vendas' }));
    const activeId = storeSession1.getState().tabs.activeTabId;
    storeSession1.dispatch(
      updateTabSql({ id: activeId, sql: 'select top 50 * from dbo.Vendas with (nolock);' }),
    );

    expect(invoker).toHaveBeenCalledWith(
      'save_app_state',
      expect.objectContaining({
        state: expect.objectContaining({
          activeTabId: activeId,
        }),
      }),
    );

    // Sessão 2: reabre store limpo e hidrata a partir de load_app_state
    const restored = await loadAppState(invoker);
    const storeSession2 = configureStore({
      middleware: (getDefault) => getDefault().concat(createTabsSync(invoker)),
      reducer: { tabs: tabsReducer },
    });

    const saveCallsBeforeHydrate = (
      invoker as unknown as ReturnType<typeof vi.fn>
    ).mock.calls.filter((call) => call[0] === 'save_app_state').length;

    storeSession2.dispatch(hydrateTabs(restored));

    expect(storeSession2.getState().tabs.tabs).toHaveLength(2);
    expect(storeSession2.getState().tabs.activeTabId).toBe(activeId);
    expect(storeSession2.getState().tabs.tabs[1]?.sql).toBe(
      'select top 50 * from dbo.Vendas with (nolock);',
    );

    // hydrateTabs não deve regravar desnecessariamente
    const saveCallsAfterHydrate = (
      invoker as unknown as ReturnType<typeof vi.fn>
    ).mock.calls.filter((call) => call[0] === 'save_app_state').length;
    expect(saveCallsAfterHydrate).toBe(saveCallsBeforeHydrate);
  });

  it('inicia vazio sem quebrar se o estado armazenado estiver corrompido', async () => {
    localStorage.setItem('sequelei_app_state', '{corrupted-json!!!');
    const brokenInvoker = vi.fn(async () => {
      throw new Error('corrupted sqlite');
    }) as unknown as AppStateInvoker;

    const restored = await loadAppState(brokenInvoker);
    expect(restored).toEqual({ activeTabId: null, tabs: [] });

    expect(parsePersistedAppState('invalido')).toEqual({ activeTabId: null, tabs: [] });
    expect(parsePersistedAppState({ tabs: [null, { id: 123 }] })).toEqual({
      activeTabId: null,
      tabs: [],
    });
  });
});
