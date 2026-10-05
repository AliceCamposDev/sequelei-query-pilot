import { configureStore } from '@reduxjs/toolkit';

import { preferencesReducer } from './preferencesSlice';
import { createPreferencesSync } from './preferencesSync';
import { tabsReducer } from './tabsSlice';

export const store = configureStore({
  reducer: {
    preferences: preferencesReducer,
    tabs: tabsReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(createPreferencesSync()),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
