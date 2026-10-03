import type { PreferencesState } from './preferencesSlice';
import type { Middleware } from '@reduxjs/toolkit';

type PreferencesRootState = { preferences: PreferencesState };

export type PreferenceKey = keyof PreferencesState;
export type PreferenceInvoker = (
  command: string,
  payload?: { key: PreferenceKey; value: string },
) => Promise<unknown>;

const actionToPreference: Record<string, PreferenceKey> = {
  'preferences/setApplyNolock': 'applyNolock',
  'preferences/setDefaultTop': 'defaultTop',
  'preferences/setTheme': 'theme',
};

const defaultInvoker: PreferenceInvoker = async (command, payload) => {
  const invoke = window.__TAURI__?.core?.invoke;

  if (!invoke) return undefined;

  return invoke(command, payload);
};

export function createPreferencesSync(
  invoke: PreferenceInvoker = defaultInvoker,
): Middleware<unknown, PreferencesRootState> {
  return (store) => (next) => (action) => {
    const result = next(action);
    const actionType =
      typeof action === 'object' && action !== null && 'type' in action
        ? String(action.type)
        : undefined;
    const key = actionType ? actionToPreference[actionType] : undefined;

    if (key) {
      const value = String(store.getState().preferences[key]);
      void invoke('save_preference', { key, value }).catch(() => undefined);
    }

    return result;
  };
}

export function loadPreferences(invoke: PreferenceInvoker = defaultInvoker) {
  return invoke('load_preferences').then(parsePreferences);
}

function parsePreferences(value: unknown): Partial<PreferencesState> {
  if (typeof value !== 'object' || value === null) return {};

  const raw = value as Record<string, unknown>;
  const preferences: Partial<PreferencesState> = {};

  if (raw.applyNolock === 'true' || raw.applyNolock === 'false') {
    preferences.applyNolock = raw.applyNolock === 'true';
  }
  if (raw.lowercaseKeywords === 'true' || raw.lowercaseKeywords === 'false') {
    preferences.lowercaseKeywords = raw.lowercaseKeywords === 'true';
  }
  if (typeof raw.defaultTop === 'string' && /^\d+$/.test(raw.defaultTop)) {
    preferences.defaultTop = Number(raw.defaultTop);
  }
  if (typeof raw.queryTimeoutMs === 'string' && /^\d+$/.test(raw.queryTimeoutMs)) {
    preferences.queryTimeoutMs = Number(raw.queryTimeoutMs);
  }
  if (raw.theme === 'dark' || raw.theme === 'light') {
    preferences.theme = raw.theme;
  }

  return preferences;
}
