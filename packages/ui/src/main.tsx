import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';

import { App } from './App';
import { hydratePreferences } from './store/preferencesSlice';
import { loadPreferences } from './store/preferencesSync';
import { store } from './store/store';
import './styles.css';
import './styles/tokens.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);

void loadPreferences()
  .then((preferences) => store.dispatch(hydratePreferences(preferences)))
  .catch(() => undefined);
