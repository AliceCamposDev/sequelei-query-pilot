import { configureStore } from '@reduxjs/toolkit';

import { executionReducer } from './executionSlice';
import { explorerReducer } from './explorerSlice';
import { preferencesReducer } from './preferencesSlice';
import { createPreferencesSync } from './preferencesSync';
import { tabsReducer } from './tabsSlice';
import { createTabsSync } from './tabsSync';

export const store = configureStore({
  reducer: {
    execution: executionReducer,
    explorer: explorerReducer,
    preferences: preferencesReducer,
    tabs: tabsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(createPreferencesSync(), createTabsSync()),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
