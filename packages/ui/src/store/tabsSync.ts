import type { QueryTab, TabsState } from './tabsSlice';
import type { Middleware } from '@reduxjs/toolkit';

const LOCAL_APP_STATE_KEY = 'sequelei_app_state';

type TabsRootState = { tabs: TabsState };

export interface PersistedAppState {
  activeTabId: string | null;
  tabs: QueryTab[];
}

export type AppStateInvoker = (command: string, payload?: unknown) => Promise<unknown>;

const PERSISTED_TAB_ACTIONS = new Set([
  'tabs/addTab',
  'tabs/closeTab',
  'tabs/cycleTab',
  'tabs/newTab',
  'tabs/setActiveTab',
  'tabs/updateTabCursor',
  'tabs/updateTabScroll',
  'tabs/updateTabSql',
]);

const defaultAppStateInvoker: AppStateInvoker = async (command, payload) => {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return undefined;
  return invoke(command, payload);
};

export function parsePersistedAppState(raw: unknown): PersistedAppState {
  if (typeof raw !== 'object' || raw === null) {
    return { activeTabId: null, tabs: [] };
  }

  const candidate = raw as { activeTabId?: unknown; tabs?: unknown };
  if (!Array.isArray(candidate.tabs)) {
    return { activeTabId: null, tabs: [] };
  }

  const tabs: QueryTab[] = [];
  for (const item of candidate.tabs) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    if (
      typeof record.id !== 'string' ||
      typeof record.title !== 'string' ||
      typeof record.sql !== 'string'
    ) {
      continue;
    }

    const tab: QueryTab = {
      dirty: Boolean(record.dirty),
      id: record.id,
      sql: record.sql,
      title: record.title,
    };

    if (
      typeof record.cursor === 'object' &&
      record.cursor !== null &&
      typeof (record.cursor as Record<string, unknown>).column === 'number' &&
      typeof (record.cursor as Record<string, unknown>).lineNumber === 'number'
    ) {
      tab.cursor = {
        column: (record.cursor as { column: number }).column,
        lineNumber: (record.cursor as { lineNumber: number }).lineNumber,
      };
    }

    if (
      typeof record.scroll === 'object' &&
      record.scroll !== null &&
      typeof (record.scroll as Record<string, unknown>).scrollLeft === 'number' &&
      typeof (record.scroll as Record<string, unknown>).scrollTop === 'number'
    ) {
      tab.scroll = {
        scrollLeft: (record.scroll as { scrollLeft: number }).scrollLeft,
        scrollTop: (record.scroll as { scrollTop: number }).scrollTop,
      };
    }

    tabs.push(tab);
  }

  const activeTabId = typeof candidate.activeTabId === 'string' ? candidate.activeTabId : null;
  return { activeTabId, tabs };
}

export async function saveAppState(
  tabsState: TabsState,
  invoke: AppStateInvoker = defaultAppStateInvoker,
): Promise<void> {
  const payload: PersistedAppState = {
    activeTabId: tabsState.activeTabId,
    tabs: tabsState.tabs,
  };

  try {
    localStorage.setItem(LOCAL_APP_STATE_KEY, JSON.stringify(payload));
  } catch {
    // Ignora quota/storage indisponível em ambientes restritos
  }

  await invoke('save_app_state', { state: payload }).catch(() => undefined);
}

export async function loadAppState(
  invoke: AppStateInvoker = defaultAppStateInvoker,
): Promise<PersistedAppState> {
  try {
    const fromTauri = await invoke('load_app_state');
    const parsed = parsePersistedAppState(fromTauri);
    if (parsed.tabs.length > 0) {
      return parsed;
    }
  } catch {
    // Em caso de falha/corrupção no backend, tenta fallback ou inicia vazio sem quebrar
  }

  try {
    const rawLocal = localStorage.getItem(LOCAL_APP_STATE_KEY);
    if (!rawLocal) {
      return { activeTabId: null, tabs: [] };
    }
    return parsePersistedAppState(JSON.parse(rawLocal));
  } catch {
    return { activeTabId: null, tabs: [] };
  }
}

export function createTabsSync(
  invoke: AppStateInvoker = defaultAppStateInvoker,
): Middleware<unknown, TabsRootState> {
  return (store) => (next) => (action) => {
    const result = next(action);
    const actionType =
      typeof action === 'object' && action !== null && 'type' in action
        ? String(action.type)
        : undefined;

    if (actionType && PERSISTED_TAB_ACTIONS.has(actionType)) {
      void saveAppState(store.getState().tabs, invoke);
    }

    return result;
  };
}
