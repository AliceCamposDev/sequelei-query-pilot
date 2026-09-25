import { describe, expect, it } from 'vitest';

import {
  defaultPreferences,
  preferencesReducer,
  setApplyNolock,
  setDefaultTop,
  setTheme,
} from './preferencesSlice';

describe('preferences slice', () => {
  it('começa com os padrões definidos no DRG', () => {
    expect(preferencesReducer(undefined, { type: '@@init' })).toEqual(defaultPreferences);
  });

  it('atualiza o tema', () => {
    const state = preferencesReducer(defaultPreferences, setTheme('light'));

    expect(state.theme).toBe('light');
  });

  it('altera a aplicação automática de NOLOCK', () => {
    const state = preferencesReducer(defaultPreferences, setApplyNolock(false));

    expect(state.applyNolock).toBe(false);
  });

  it('altera o limite padrão de linhas', () => {
    const state = preferencesReducer(defaultPreferences, setDefaultTop(500));

    expect(state.defaultTop).toBe(500);
  });
});
