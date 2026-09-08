/* ============================================================================
   NUOVA PARTITA, MA CANCELLA ANCHE I RICORDI

   🔷 «Ho ricominciato il gioco perché vedo i topic vecchi sotto?» — perché
   NUOVA PARTITA (vedi `SystemLab.tsx` → SAVE) resetta il gioco di proposito
   senza toccare la relazione: la conversazione, i topic e la memoria
   personale sopravvivono a una rinascita della creatura per scelta, non per
   dimenticanza. «Ah, c'è bisogno di un tasto che ricominci facendo
   cancellare anche i ricordi» — sì, ed è un'azione DIVERSA, non la stessa
   con un'opzione in più: quella resta com'è.

   🔒 QUESTO ENDPOINT NON TOCCA IL GIOCO. `NUOVA PARTITA` (`startNewGame` in
   `state/store.ts`) resta l'unica cosa che scrive `reset: true` sul
   salvataggio. Qui si cancella solo quello che VINZ ha imparato di te: la
   memoria personale, le osservazioni di THINK (Reflection/ME/Me.mon) e i
   topic. Chi chiama i due insieme (il bottone in LAB) decide di farlo, ma
   sono due scritture indipendenti — non un reset unico più aggressivo.

   ⚠️ IL FILO DELLA CHAT NON VIENE TOCCATO QUI. I messaggi già scritti restano
   nella cronologia del thread: cancellarli è un sistema di storage diverso
   (quello di assistant-ui), e mescolarlo qui avrebbe significato disegnarlo
   senza averlo verificato contro una conversazione vera. Dichiarato, non
   nascosto: il LAB lo dice nel testo di conferma. */

import { authorize, denied, json } from './_shared/auth';
import { getStore } from './_shared/localStore';
import { memoryBackendMode } from './_shared/core/memory';
import { wipeMem0 } from './_shared/mem0MemoryClient';

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'solo POST' }, 405);
  const auth = authorize(request);
  if (!auth.ok) {
    console.warn('[memory-reset] richiesta rifiutata:', auth.reason);
    return denied();
  }

  const result: { memory: unknown; topics: unknown; machines: unknown } = {
    memory: null,
    topics: null,
    machines: null,
  };

  const backend = memoryBackendMode();
  if (backend === 'mem0') {
    try {
      result.memory = await wipeMem0();
    } catch (error) {
      result.memory = { error: error instanceof Error ? error.message : 'errore sconosciuto' };
    }
  } else if (backend === 'custom') {
    await getStore({ name: 'vinzmon-state', consistency: 'strong' }).delete('me-model-v1');
    result.memory = { cleared: 'me-model' };
  } else {
    result.memory = { cleared: 'nessuna (backend frozen: non c\'era niente da cancellare)' };
  }

  const topicsStore = getStore({ name: 'vinzmon-topics', consistency: 'strong' });
  const { blobs: topicBlobs } = await topicsStore.list({ prefix: 'topic:' });
  await Promise.all(topicBlobs.map((blob) => topicsStore.delete(blob.key)));
  result.topics = { deleted: topicBlobs.length };

  /* Stessa chiave che `machines.ts` legge e scrive: azzerarla equivale a
     `emptyState()` al prossimo giro, esattamente come al primo avvio. */
  await getStore({ name: 'vinzmon-machines', consistency: 'strong' }).delete('machine-state-v1');
  result.machines = { cleared: true };

  return json({ ok: true, ...result });
}

export const config = { path: '/api/memory-reset' };
