import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { readEntrypoint } from './lab/entrypoint';
import { applyDocumentMeta } from './lab/applyLabDocumentMeta';
import { ErrorBoundary } from './system/ErrorBoundary';

/* ============================================================================
   DUE INGRESSI, UNA PAGINA SOLA

   🔷 «Una nuova parte del sito, LAB, dove dentro c'è DEV e tanto altro.»

   Si legge l'indirizzo una volta e si decide COSA montare:

     /       → VINZ.MON, identica a prima
     /#/lab  → VINZ.LAB, il laboratorio privato

   🔷 LAB INFORMATION ARCHITECTURE CLEANUP — il terzo ingresso,
   `?design-preview=…`, montava una schermata vera dentro l'iframe di
   DESIGN.LAB. Con quella stanza rimossa (nessun altro la usava — verificato)
   sparisce anche questo ramo di boot.

   ⚠️ `App` resta un import dinamico anche sulla strada normale. Non è
   eleganza: è che così il bundle del laboratorio non trascina dentro l'app
   intera, e viceversa.
   ========================================================================= */

async function boot() {
  const entry = readEntrypoint();
  const { pullRuntimeConfig, runtimeConfig: localRuntimeConfig } = await import('./system/runtimeConfig');
  let runtimeConfigTimer = 0;
  const runtimeConfig = await Promise.race([
    pullRuntimeConfig(),
    new Promise<ReturnType<typeof localRuntimeConfig>>((resolve) => {
      runtimeConfigTimer = window.setTimeout(() => {
        console.warn('[boot] configurazione remota scaduta; uso quella locale');
        resolve(localRuntimeConfig());
      }, 4_000);
    }),
  ]).catch((error: unknown) => {
    console.warn('[boot] configurazione remota non disponibile; uso quella locale', error);
    return localRuntimeConfig();
  });
  window.clearTimeout(runtimeConfigTimer);
  applyDocumentMeta(entry.kind === 'lab' ? 'lab' : 'app');

  let content: ReactNode;

  /* 🔒 Il foglio di stile dell'app si carica solo dove serve: il laboratorio
     ha il suo, disegnato a parte. Vedi `appStyles.ts`. Subito dopo si
     rimettono sopra gli scarti dei design token (SYSTEM.LAB → 🎛 TOKENS):
     senza, un valore cambiato lì sparirebbe al primo riavvio, e "vale per
     tutti" diventerebbe "vale finché non ricarichi". */
  if (entry.kind !== 'lab') {
    await import('./appStyles');
    const { applyTokenOverrides } = await import('./engine/designTokens');
    applyTokenOverrides();
  }

  if (entry.kind === 'lab') {
    const { LabApp } = await import('./lab/LabApp');
    content = <LabApp initialLab={entry.lab} />;
  } else {
    const { App } = await import('./App');
    content = <App />;
  }

  const { applyRuntimeConfigToStore } = await import('./state/store');
  applyRuntimeConfigToStore(runtimeConfig);

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {/* 🔒 FUORI da tutto: un errore in App, in una schermata o in uno store
          deve trovare qualcuno che lo racconti. Senza, resta lo sfondo grigio
          del body e nessuno sa niente. */}
      <ErrorBoundary>{content}</ErrorBoundary>
    </StrictMode>,
  );
}

void boot().catch((error: unknown) => {
  console.error('[boot] avvio non riuscito', error);
  document.getElementById('root')!.innerHTML = `
    <main style="min-height:100dvh;display:grid;place-items:center;padding:calc(env(safe-area-inset-top) + 24px) 24px calc(env(safe-area-inset-bottom) + 24px);background:#000;color:#fff;font-family:system-ui,sans-serif;text-align:center">
      <div><strong style="display:block;font-size:22px;margin-bottom:12px">VINZ.MON</strong><p style="margin:0 0 18px;color:#aaa">Avvio non riuscito.</p><button type="button" onclick="location.reload()" style="min-height:44px;padding:0 18px;border:1px solid #fff;background:#000;color:#fff">RIPROVA</button></div>
    </main>`;
});
