import { configureStore } from '@reduxjs/toolkit';

import { explorerReducer } from './explorerSlice';
import { preferencesReducer } from './preferencesSlice';
import { createPreferencesSync } from './preferencesSync';
import { tabsReducer } from './tabsSlice';

export const store = configureStore({
  reducer: {
    explorer: explorerReducer,
    preferences: preferencesReducer,
    tabs: tabsReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(createPreferencesSync()),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
