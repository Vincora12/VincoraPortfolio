import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/inter';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import '../styles/tokens.css';
import './brain.css';
import { Brain } from './Brain';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Brain />
  </StrictMode>,
);
