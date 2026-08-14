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
  /** Il giorno di gioco: è l'arbitro fra due copie. */
  day: number;
  /** Quando è stato scritto, in ora reale. Serve a te, non alla decisione. */
  savedAt: string;
  /** Lo stato dell'app, opaco per il server. */
  state: unknown;
}

const store = () => getStore('vinzmon-state');

export default async function handler(request: Request): Promise<Response> {
  const auth = authorize(request);
  if (!auth.ok) {
    console.warn('[state] richiesta rifiutata:', auth.reason);
    return denied();
  }

  if (request.method === 'GET') {
    const saved = (await store().get(KEY, { type: 'json' })) as Save | null;
    return json(saved ?? { day: 0, savedAt: null, state: null });
  }

  if (request.method !== 'PUT') return json({ error: 'solo GET e PUT' }, 405);

  let incoming: Save;
  try {
    incoming = (await request.json()) as Save;
  } catch {
    return json({ error: 'body non leggibile' }, 400);
  }

  if (typeof incoming?.day !== 'number' || incoming.state == null) {
    return json({ error: 'salvataggio malformato' }, 400);
  }

  const size = JSON.stringify(incoming.state).length;
  if (size > MAX_BYTES) return json({ error: 'salvataggio troppo grande' }, 413);

  const existing = (await store().get(KEY, { type: 'json' })) as Save | null;

  /* 🔒 Un salvataggio non può far tornare indietro la storia.

     Il caso vero non è teorico: apri l'app su un telefono che era rimasto
     indietro, quello manda il suo stato vecchio, e settimane di .mon
     spariscono. Il server rifiuta, l'app riceve il rifiuto e SCARICA la
     copia buona invece di insistere. */
  if (existing && incoming.day < existing.day) {
    return json(
      {
        error: 'esiste un salvataggio più avanti',
        serverDay: existing.day,
        yourDay: incoming.day,
      },
      409,
    );
  }

  const save: Save = {
    day: incoming.day,
    savedAt: new Date().toISOString(),
    state: incoming.state,
  };

  await store().setJSON(KEY, save);

  /* Una copia per giorno, che si sovrascrive quando il giorno si ripete.
     Non è un archivio completo — sarebbe spazio speso per una cosa che non
     guarderai mai — ma se un bug corrompe il salvataggio di oggi, ieri c'è
     ancora, ed è la differenza fra un fastidio e la fine della partita. */
  await store().setJSON(`day-${incoming.day}`, save);

  return json({ ok: true, day: save.day, savedAt: save.savedAt });
}

export const config = { path: '/api/state' };
