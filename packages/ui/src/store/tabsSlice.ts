import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface TabCursor {
  column: number;
  lineNumber: number;
}

export interface TabScroll {
  scrollLeft: number;
  scrollTop: number;
}

export interface QueryTab {
  cursor?: TabCursor;
  dirty: boolean;
  id: string;
  scroll?: TabScroll;
  sql: string;
  title: string;
}

export interface TabsState {
  activeTabId: string;
  tabs: QueryTab[];
}

const firstTab: QueryTab = {
  dirty: false,
  id: 'query-1',
  sql: 'select top 100 *\nfrom dbo.TBResultados\nwhere ativo = 1;',
  title: 'Consulta 01',
};

const initialState: TabsState = {
  activeTabId: firstTab.id,
  tabs: [firstTab],
};

function createTab(existingCount: number, payload?: Partial<QueryTab>): QueryTab {
  const index = existingCount + 1;
  return {
    dirty: false,
    id: `query-${index}`,
    sql: '',
    title: `Consulta ${String(index).padStart(2, '0')}`,
    ...payload,
  };
}

const tabsSlice = createSlice({
  name: 'tabs',
  initialState,
  reducers: {
    addTab(state, action: PayloadAction<Partial<QueryTab> | undefined>) {
      const tab = createTab(state.tabs.length, action.payload);
      state.tabs.push(tab);
      state.activeTabId = tab.id;
    },
    newTab(state, action: PayloadAction<Partial<QueryTab> | undefined>) {
      const tab = createTab(state.tabs.length, action.payload);
      state.tabs.push(tab);
      state.activeTabId = tab.id;
    },
    closeTab(state, action: PayloadAction<string>) {
      if (state.tabs.length === 1) return;

      const closingIndex = state.tabs.findIndex((tab) => tab.id === action.payload);
      if (closingIndex === -1) return;

      state.tabs = state.tabs.filter((tab) => tab.id !== action.payload);

      if (state.activeTabId === action.payload) {
        const fallback = state.tabs[Math.max(0, closingIndex - 1)] ?? state.tabs[0];
        if (fallback) {
          state.activeTabId = fallback.id;
        }
      }
    },
    setActiveTab(state, action: PayloadAction<string>) {
      if (state.tabs.some((tab) => tab.id === action.payload)) {
        state.activeTabId = action.payload;
      }
    },
    updateTabSql(state, action: PayloadAction<{ id: string; sql: string }>) {
      const tab = state.tabs.find((item) => item.id === action.payload.id);

      if (tab) {
        tab.sql = action.payload.sql;
        tab.dirty = true;
      }
    },
    updateTabCursor(state, action: PayloadAction<{ cursor: TabCursor; id: string }>) {
      const tab = state.tabs.find((item) => item.id === action.payload.id);
      if (tab) {
        tab.cursor = action.payload.cursor;
      }
    },
    updateTabScroll(state, action: PayloadAction<{ id: string; scroll: TabScroll }>) {
      const tab = state.tabs.find((item) => item.id === action.payload.id);
      if (tab) {
        tab.scroll = action.payload.scroll;
      }
    },
    cycleTab(state, action: PayloadAction<'next' | 'prev' | undefined>) {
      if (state.tabs.length <= 1) return;
      const currentIndex = state.tabs.findIndex((tab) => tab.id === state.activeTabId);
      const direction = action.payload === 'prev' ? -1 : 1;
      const nextIndex = (currentIndex + direction + state.tabs.length) % state.tabs.length;
      const target = state.tabs[nextIndex];
      if (target) {
        state.activeTabId = target.id;
      }
    },
  },
});

export const {
  addTab,
  newTab,
  closeTab,
  setActiveTab,
  updateTabSql,
  updateTabCursor,
  updateTabScroll,
  cycleTab,
} = tabsSlice.actions;
export const tabsReducer = tabsSlice.reducer;
export { initialState as defaultTabs };
