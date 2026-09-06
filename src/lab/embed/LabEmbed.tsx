/* ============================================================================
   LAB, NATIVO, SOTTO L'APP — NON UN IFRAME

   🔷 CREATION LAB FIX + UI CLEANUP §19 — «LAB must NOT be loaded in an
   iframe. Use the native LAB shell/components... Opening LAB through this
   gesture must preserve the current app state.»

   🔒 IL VERO OSTACOLO NON ERA L'IFRAME: era che `LabApp`/`CreationLab`/
   `SystemLab` dichiarano `:root{--ink:...}` e regole su `html`/`body` — un
   documento intero, non un componente. Montarli COSÌ COME SONO dentro il
   documento di VINZ.MON scriverebbe quelle variabili sull'app vera, sempre,
   anche a cassetto chiuso: lo stesso guasto per cui LAB È SEMPRE STATO un
   documento a parte.

   Uno SHADOW ROOT risolve la stessa cosa senza copiare né riscrivere i
   componenti: il CSS iniettato AL SUO INTERNO (`LabStyle`, vedi quel file)
   non esce, e il CSS del documento vero non entra. `LabApp` è lo stesso
   componente del percorso `/lab` — stesso `useApp`, stesso store, nessuna
   sincronizzazione da scrivere: montarlo qui dentro invece che nel
   documento standalone non lo rende una copia, è lo stesso React tree in
   un punto diverso del DOM. Lo stato dell'app intorno (Chat, Mon, Sync, ME)
   non si tocca: nessuna navigazione, nessun reload.
   ========================================================================= */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LabApp } from './../LabApp';
import { LabScopeContext } from './LabStyle';
import type { LabId } from '../entrypoint';

export function LabEmbed({ initialLab }: { initialLab: LabId | null }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<ShadowRoot | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    /* `attachShadow` una volta sola: se il componente si rimonta (lo stesso
       nodo React) lo shadow root esiste già sull'elemento. */
    setRoot(host.shadowRoot ?? host.attachShadow({ mode: 'open' }));
  }, []);

  return (
    <div ref={hostRef} className="lab-embed-host">
      {root && createPortal(
        <LabScopeContext.Provider value={true}>
          <LabApp initialLab={initialLab} />
        </LabScopeContext.Provider>,
        root,
      )}
    </div>
  );
}
