import { StrictMode, type ReactNode } from 'react';
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

import { readEntrypoint } from './lab/entrypoint';
import { applyDocumentMeta } from './lab/applyLabDocumentMeta';
import { ErrorBoundary } from './system/ErrorBoundary';

/* ============================================================================
   TRE INGRESSI, UNA PAGINA SOLA

   🔷 «Una nuova parte del sito, LAB, dove dentro c'è DEV e tanto altro.»

   Prima qui c'era una riga sola: monta `App`. Adesso si legge l'indirizzo una
   volta e si decide COSA montare — e le tre cose si escludono a vicenda:

     /                     → VINZ.MON, identica a prima
     /#/lab                → VINZ.LAB, il laboratorio privato
     /?design-preview=mon  → UNA schermata vera, sola, dentro l'iframe di
                             DESIGN.LAB

   🔒 L'ORDINE DELLE IMPORTAZIONI È LA COSA CHE CONTA, e per questo `boot` è
   asincrona. In modalità preview i guardiani vanno installati PRIMA che il
   modulo dello store venga caricato: `import` statico si esegue tutto
   all'avvio, `await import()` no. Se lo store si inizializzasse per primo,
   scriverebbe prima che ci sia qualcuno a impedirglielo — cioè la preview
   avrebbe già toccato la produzione al primo render.

   ⚠️ `App` resta un import dinamico anche sulla strada normale. Non è
   eleganza: è che così il bundle del laboratorio non trascina dentro l'app
   intera, e viceversa.
   ========================================================================= */

async function boot() {
  const entry = readEntrypoint();
  applyDocumentMeta(entry.kind === 'lab' ? 'lab' : 'app');

  let content: ReactNode;

  if (entry.kind === 'design-preview') {
    const { installPreviewGuards } = await import('./lab/design/installPreviewGuards');
    installPreviewGuards();

    // Dopo i guardiani, mai prima.
    const { DesignPreviewRoute } = await import('./lab/design/DesignPreviewRoute');
    content = <DesignPreviewRoute screen={entry.screen} />;
  } else if (entry.kind === 'lab') {
    const { LabApp } = await import('./lab/LabApp');
    content = <LabApp initialLab={entry.lab} />;
  } else {
    const { App } = await import('./App');
    content = <App />;
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {/* 🔒 FUORI da tutto: un errore in App, in una schermata o in uno store
          deve trovare qualcuno che lo racconti. Senza, resta lo sfondo grigio
          del body e nessuno sa niente. */}
      <ErrorBoundary>{content}</ErrorBoundary>
    </StrictMode>,
  );
}

void boot();
