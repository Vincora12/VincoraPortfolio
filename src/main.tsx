import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Font self-hosted: nessuna richiesta esterna (§10.3).
// Archivo Variable con asse di larghezza + corsivo sta al posto di VINZ-HEAD.
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/archivo/wdth-italic.css';
import '@fontsource-variable/inter';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';

import './styles/tokens.css';
import './styles/base.css';
import './system/system.css';
import './system/assets.css';
import './screens/screens.css';
import './dev/dev.css';

import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
