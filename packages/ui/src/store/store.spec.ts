import { describe, expect, it } from 'vitest';

import { setTheme } from './preferencesSlice';
import { store } from './store';

describe('store global', () => {
  it('registra o slice preferences e despacha actions', () => {
    store.dispatch(setTheme('light'));

    expect(store.getState().preferences.theme).toBe('light');
  });
});
