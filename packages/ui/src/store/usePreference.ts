import { useSelector } from 'react-redux';

import type { PreferencesState } from './preferencesSlice';
import type { RootState } from './store';

export function usePreference<Key extends keyof PreferencesState>(key: Key): PreferencesState[Key] {
  return useSelector((state: RootState) => state.preferences[key]);
}
