/* ============================================================================
   LE LEZIONI, CHE DEVONO SOPRAVVIVERE SEMPRE

   🔷 «No, devono sopravvivere sempre.»

   ⚠️ E PERCHÉ NON BASTAVA IL SALVATAGGIO NORMALE, che pure le conteneva già.

   `/api/state` è arbitrato dal GIORNO DI GIOCO: fra due copie vince quella più
   avanti, e il server rifiuta un salvataggio che tornerebbe indietro. È la
   regola giusta per una partita — «più avanti» significa «contiene più
   storia» — ed è la regola sbagliata per queste righe, perché dopo un
   RICOMINCIA DA CAPO il giorno torna a 1. La partita nuova non riesce a
   scrivere, e le lezioni imparate dopo il reset non arrivano mai al server.

   🔒 Quindi una chiave loro, senza nessuna nozione di giorno. Le lezioni non
   appartengono a una partita: sopravvivono ai reset, ai telefoni e alle
   partite, e non c'è nessuno stato di gioco che le possa far tornare
   indietro.

   ════════════════════════════════════════════════════════════════════════════
   COME SI FONDONO DUE COPIE, E PERCHÉ NON È «VINCE L'ULTIMA»

   Un elenco che cresce non ha un «più avanti» da confrontare, e sostituirlo
   con quello che arriva vorrebbe dire: apri l'app sul telefono rimasto
   indietro, e le lezioni insegnate dall'altro spariscono.

   Quindi UNIONE per id. Ma un'unione da sola non sa cancellare: la lezione
   tolta su un telefono tornerebbe indietro dall'altro, per sempre, e
   «DIMENTICALA» diventerebbe un pulsante che non funziona.

   🔒 Perciò le cancellazioni lasciano una PIETRA TOMBALE — l'id resta in un
   elenco a parte. L'unione mette insieme tutto e poi toglie quello che
   qualcuno ha dimenticato. Il risultato non dipende dall'ordine in cui i
   telefoni parlano: la stessa fusione, fatta in qualunque sequenza, dà lo
   stesso elenco.
   ════════════════════════════════════════════════════════════════════════════
   ========================================================================= */

import { getStore } from './_shared/localStore';
import { authorize, denied, json } from './_shared/auth';

const KEY = 'lessons';

/** Una lezione è una riga. Mille righe sono già una vita di lavoro. */
const MAX_LESSONS = 1000;
/* Il documento sta dentro lo stesso tetto: il pacchetto ne pesa 17 kB, e mezzo
   mega lascia spazio a una versione molto più ricca senza aprire la porta a un
   file caricato per sbaglio. */
const MAX_BYTES = 512 * 1024;

interface Lesson {
  id: string;
  at: string;
  said: string;
  text: string;
  about?: string;
}

interface Book {
  lessons: Lesson[];
  /** Gli id dimenticati. Restano per sempre: sono la memoria della rimozione. */
  forgotten: string[];
  /**
   * 🔷 «Vorrei scaricarla, sistemarla con ChatGPT e ridargliela.»
   *
   * Il documento sostituito, se ce n'è uno. `null` = quello del pacchetto.
   *
   * ⚠️ NON si fonde come le lezioni, e non sarebbe nemmeno pensabile: unire
   * due versioni di un testo non dà un testo, dà un pasticcio. Fra due
   * documenti vince il più RECENTE, ed è la regola giusta perché un documento
   * lo riscrivi tutto in una volta, mentre le lezioni si aggiungono una alla
   * volta.
   */
  memory?: string | null;
  memoryAt?: string | null;
  savedAt: string | null;
}

const VUOTO: Book = { lessons: [], forgotten: [], memory: null, memoryAt: null, savedAt: null };

const store = () => getStore('vinzmon-state');

/**
 * L'unione, e nient'altro.
 *
 * 🔒 Funzione pura e separata: è la decisione che può far sparire il lavoro di
 * mesi, quindi deve stare in dieci righe leggibili invece che in mezzo alle
 * risposte HTTP.
 */
export function merge(a: Book, b: Book): Book {
  const forgotten = [...new Set([...a.forgotten, ...b.forgotten])];
  const perId = new Map<string, Lesson>();
  /* `a` per prima e `b` dopo: a parità di id vince la copia in arrivo, che è
     l'unica in cui il testo può essere stato corretto. */
  for (const l of [...a.lessons, ...b.lessons]) perId.set(l.id, l);

  const lessons = [...perId.values()]
    .filter((l) => !forgotten.includes(l.id))
    .sort((x, y) => x.at.localeCompare(y.at));

  /* Il più recente dei due, e in mancanza di data quello che ce l'ha. */
  const piuRecente =
    (b.memoryAt ?? '') > (a.memoryAt ?? '') ? b : a;

  return {
    lessons,
    forgotten,
    memory: piuRecente.memory ?? null,
    memoryAt: piuRecente.memoryAt ?? null,
    savedAt: new Date().toISOString(),
  };
}

export default async function handler(request: Request): Promise<Response> {
  const auth = authorize(request);
  if (!auth.ok) {
    console.warn('[lessons] richiesta rifiutata:', auth.reason);
    return denied();
  }

  if (request.method === 'GET') {
    const book = (await store().get(KEY, { type: 'json' })) as Book | null;
    return json(book ?? VUOTO);
  }

  if (request.method !== 'PUT') return json({ error: 'solo GET e PUT' }, 405);

  let incoming: Book;
  try {
    incoming = (await request.json()) as Book;
  } catch {
    return json({ error: 'body non leggibile' }, 400);
  }

  if (!Array.isArray(incoming?.lessons) || !Array.isArray(incoming?.forgotten)) {
    return json({ error: 'elenco malformato' }, 400);
  }
  if (incoming.lessons.length > MAX_LESSONS) {
    return json({ error: 'troppe lezioni' }, 413);
  }
  if (JSON.stringify(incoming).length > MAX_BYTES) {
    return json({ error: 'elenco troppo grande' }, 413);
  }

  const existing = ((await store().get(KEY, { type: 'json' })) as Book | null) ?? VUOTO;
  const merged = merge(existing, incoming);

  await store().setJSON(KEY, merged);

  /* 🔒 Torna l'elenco FUSO, non un «ok». Chi ha scritto deve adottare il
     risultato della fusione: se un altro telefono aveva insegnato qualcosa,
     da adesso ce l'ha anche questo, senza dover ricaricare niente. */
  return json(merged);
}

export const config = { path: '/api/lessons' };
