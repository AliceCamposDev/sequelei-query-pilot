import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type Theme = 'dark' | 'light';

export interface PreferencesState {
  applyNolock: boolean;
  defaultTop: number;
  lowercaseKeywords: boolean;
  queryTimeoutMs: number;
  theme: Theme;
}

const initialState: PreferencesState = {
  applyNolock: true,
  defaultTop: 1000,
  lowercaseKeywords: true,
  queryTimeoutMs: 30000,
  theme: 'dark',
};

const preferencesSlice = createSlice({
  name: 'preferences',
  initialState,
  reducers: {
    setApplyNolock(state, action: PayloadAction<boolean>) {
      state.applyNolock = action.payload;
    },
    setDefaultTop(state, action: PayloadAction<number>) {
      state.defaultTop = action.payload;
    },
    setTheme(state, action: PayloadAction<Theme>) {
      state.theme = action.payload;
    },
  },
});

export const { setApplyNolock, setDefaultTop, setTheme } = preferencesSlice.actions;
export const preferencesReducer = preferencesSlice.reducer;
export { initialState as defaultPreferences };
