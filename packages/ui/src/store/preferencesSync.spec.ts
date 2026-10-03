import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import { hydratePreferences, preferencesReducer, setTheme } from './preferencesSlice';
import { createPreferencesSync, loadPreferences, type PreferenceKey } from './preferencesSync';

describe('preferencesSync', () => {
  it('persiste a preferência alterada usando o invoker fornecido', async () => {
    const calls: Array<{ command: string; key: string; value: string }> = [];
    const invoke = async (command: string, payload?: { key: PreferenceKey; value: string }) => {
      if (payload) calls.push({ command, ...payload });
    };
    const testStore = configureStore({
      reducer: { preferences: preferencesReducer },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(createPreferencesSync(invoke)),
    });

    testStore.dispatch(setTheme('light'));
    await Promise.resolve();

    expect(calls).toEqual([{ command: 'save_preference', key: 'theme', value: 'light' }]);
  });

  it('carrega e converte preferências persistidas', async () => {
    const invoke = async () => ({
      applyNolock: 'false',
      defaultTop: '500',
      queryTimeoutMs: '15000',
      theme: 'light',
    });
    const preferences = await loadPreferences(invoke);

    expect(preferences).toEqual({
      applyNolock: false,
      defaultTop: 500,
      queryTimeoutMs: 15000,
      theme: 'light',
    });
  });

  it('hidrata o slice sem substituir preferências ausentes', () => {
    const state = preferencesReducer(undefined, hydratePreferences({ theme: 'light' }));

    expect(state).toMatchObject({
      theme: 'light',
      applyNolock: true,
      defaultTop: 1000,
    });
  });
});
