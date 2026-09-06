/* ============================================================================
   IL SALVATAGGIO (MASTER SPEC v1.13 §20)

   🔷 «Deve salvare in automatico tutto.»

   Fino a ieri il .mon viveva SOLO nel browser del telefono: umore, memoria,
   opinioni, ricordi, la creatura. Cancelli i dati di Safari e hai perso mesi.
   E non serve nemmeno farlo apposta — Safari su iPhone può liberare da sola
   lo spazio di un sito che non apri per un po'.

   Per un prototipo era accettabile. Per una cosa che accumula la tua storia
   no, e il momento in cui smette di esserlo è esattamente adesso: da quando
   c'è la memoria, ogni giorno che passa il salvataggio vale di più.

   ⚠️ IL SERVER È LA COPIA BUONA, NON L'UNICA. Il browser continua a tenere la
   sua, e non è ridondanza sprecata: senza rete l'app deve funzionare lo
   stesso. Il server è quello che sopravvive al telefono.

   🔒 CHI VINCE QUANDO LE DUE COPIE DIFFERISCONO. Vince la più avanzata nel
   GIORNO di gioco, non la più recente nel tempo reale. È una scelta:
   l'orologio del telefono può essere sbagliato, e un salvataggio vecchio con
   l'ora avanti cancellerebbe settimane. Il giorno di gioco invece cresce solo
   giocando, quindi «più avanti» significa davvero «contiene più storia».
   ========================================================================= */

import { getStore } from '@netlify/blobs';
import { authorize, denied, json } from './_shared/auth';

const KEY = 'save';

/** Un salvataggio pesa qualche decina di kB; oltre questo è un errore. */
const MAX_BYTES = 2 * 1024 * 1024;

interface Save {
  revision?: string;
  /** Il giorno di gioco: è l'arbitro fra due copie. */
  day: number;
  /** Quando è stato scritto, in ora reale. Serve a te, non alla decisione. */
  savedAt: string;
  /** Lo stato dell'app, opaco per il server. */
  state: unknown;
}

const store = () => getStore({ name: 'vinzmon-state', consistency: 'strong' });

export default async function handler(request: Request): Promise<Response> {
  const auth = authorize(request);
  if (!auth.ok) {
    console.warn('[state] richiesta rifiutata:', auth.reason);
    return denied();
  }

  if (request.method === 'GET') {
    const saved = await store().getWithMetadata(KEY, { type: 'json' }) as { data: Save; etag: string } | null;
    return json(saved ? { ...saved.data, revision: saved.data.revision ?? saved.etag } : { day: 0, savedAt: null, state: null, revision: null });
  }

  if (request.method !== 'PUT') return json({ error: 'solo GET e PUT' }, 405);

  let incoming: Save & { baseRevision?: string | null };
  try {
    incoming = (await request.json()) as typeof incoming;
  } catch {
    return json({ error: 'body non leggibile' }, 400);
  }

  if (!Number.isInteger(incoming?.day) || incoming.day < 1 || incoming.state == null || typeof incoming.state !== 'object' || Array.isArray(incoming.state)) {
    return json({ error: 'salvataggio malformato' }, 400);
  }

  const size = new TextEncoder().encode(JSON.stringify(incoming.state)).byteLength;
  if (size > MAX_BYTES) return json({ error: 'salvataggio troppo grande' }, 413);

  const existingEntry = await store().getWithMetadata(KEY, { type: 'json' }) as { data: Save; etag: string } | null;
  const existing = existingEntry?.data;
  const revision = existing?.revision ?? existingEntry?.etag ?? null;
  if (incoming.baseRevision !== revision) {
    return json({ error: 'salvataggio modificato da un altro client', reason: 'STATE_CONFLICT', revision }, 409);
  }

  /* 🔒 Un salvataggio non può far tornare indietro la storia.

     Il caso vero non è teorico: apri l'app su un telefono che era rimasto
     indietro, quello manda il suo stato vecchio, e settimane di .mon
     spariscono. Il server rifiuta, l'app riceve il rifiuto e SCARICA la
     copia buona invece di insistere. */
  const resetAt = (incoming.state as { resetAt?: unknown }).resetAt;
  const explicitNewGame = typeof resetAt === 'string' && Number.isFinite(Date.parse(resetAt)) && Boolean(existing && resetAt > existing.savedAt);
  if (existing && incoming.day < existing.day && !explicitNewGame) {
    return json(
      {
        error: 'esiste un salvataggio più avanti',
        reason: 'STATE_CONFLICT',
        serverDay: existing.day,
        yourDay: incoming.day,
      },
      409,
    );
  }

  const save: Save = {
    revision: crypto.randomUUID(),
    day: incoming.day,
    savedAt: new Date().toISOString(),
    state: incoming.state,
  };

  const result = await store().setJSON(KEY, save, existingEntry ? { onlyIfMatch: existingEntry.etag } : { onlyIfNew: true });
  if (!result.modified) return json({ error: 'salvataggio modificato durante la scrittura', reason: 'STATE_CONFLICT' }, 409);
  // The SDK can report modified on a non-412 failure. Require an ETag and a
  // strong read-back; never acknowledge a write which was not actually stored.
  if (!result.etag) return json({ error: 'scrittura non confermata', reason: 'STATE_WRITE_UNCONFIRMED' }, 503);
  const confirmed = await store().get(KEY, { type: 'json' }) as Save | null;
  if (confirmed?.revision !== save.revision) return json({ error: 'scrittura non confermata', reason: 'STATE_CONFLICT' }, 409);

  /* Una copia per giorno, che si sovrascrive quando il giorno si ripete.
     Non è un archivio completo — sarebbe spazio speso per una cosa che non
     guarderai mai — ma se un bug corrompe il salvataggio di oggi, ieri c'è
     ancora, ed è la differenza fra un fastidio e la fine della partita. */
  try { await store().setJSON(`day-${incoming.day}`, save); } catch { console.warn('[state] daily backup unavailable; canonical save confirmed'); }

  return json({ ok: true, day: save.day, savedAt: save.savedAt, revision: save.revision });
}

export const config = { path: '/api/state' };
