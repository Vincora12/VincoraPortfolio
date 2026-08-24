/* ============================================================================
   I GUARDIANI DELLA PREVIEW

   🔒 REGOLA DEL PACCHETTO: «LAB TESTS / PREVIEWS / SIMULATIONS MUST NOT MUTATE
   PRODUCTION STATE OR REMOTE DATA.»

   La preview monta componenti VERI, e i componenti veri hanno store veri con
   `persist` vero attaccato allo stesso `localStorage` dell'app. Chiedere ai
   componenti di comportarsi bene non è una difesa: basta un `useEffect` che
   scrive e la sessione di produzione è cambiata perché ho guardato una
   schermata.

   Quindi non si chiede: si toglie la penna di mano. `setItem` diventa un
   niente che lo dice, e ogni fetch che non sia GET o HEAD ALZA UN ERRORE
   invece di partire — rumoroso di proposito: una scrittura silenziosamente
   ignorata è un bug che si scopre fra tre settimane.

   ⚠️ NON È UN «SOLA LETTURA» PERFETTO. `getItem` resta aperto (serve: la
   preview deve mostrare il .mon vero), e idb-keyval passa da IndexedDB, che
   qui non è coperto. Quello che è coperto è tutto quello che scrive lo store
   persistito e tutto quello che parte verso `/api/*`, cioè le due strade da
   cui la produzione può cambiare davvero.

   🔒 Si installa da `main.tsx` PRIMA di importare lo store. Se si installasse
   dopo, il primo `persist` sarebbe già passato.
   ========================================================================= */

export function installPreviewGuards() {
  const storageProto = Storage.prototype;
  const originalSet = storageProto.setItem;
  const originalRemove = storageProto.removeItem;
  const originalClear = storageProto.clear;
  const originalFetch = window.fetch.bind(window);

  storageProto.setItem = function () {
    console.info('[VINZ.LAB] blocked preview storage write');
  };
  storageProto.removeItem = function () {
    console.info('[VINZ.LAB] blocked preview storage removal');
  };
  storageProto.clear = function () {
    console.info('[VINZ.LAB] blocked preview storage clear');
  };

  window.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : null;
    const method = (init.method ?? request?.method ?? 'GET').toUpperCase();

    if (!['GET', 'HEAD'].includes(method)) {
      throw new Error(`[VINZ.LAB] blocked preview network mutation: ${method}`);
    }

    return originalFetch(input, init);
  };

  return () => {
    storageProto.setItem = originalSet;
    storageProto.removeItem = originalRemove;
    storageProto.clear = originalClear;
    window.fetch = originalFetch;
  };
}
