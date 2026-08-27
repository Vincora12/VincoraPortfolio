/* ============================================================================
   /api/shortcut — brief «VINZ.MON iOS Shortcuts — Background Integration»

   🔷 «Apple Shortcuts triggers VINZ.MON in background through a secure API.
   Safari should not open for normal logging actions.»

   ════════════════════════════════════════════════════════════════════════════
   PERCHÉ QUESTO NON È `ingest.ts`, E PERCHÉ I DUE RESTANO SEPARATI.

   `ingest.ts` (§21) esisteva già: è una cassetta della posta passiva per dati
   di sensore — passi, minuti, sonno — che l'app legge quando la apri. Va
   benissimo per un'automazione notturna che non ha bisogno di una risposta
   intelligente.

   Questo è un'altra cosa: un'AZIONE con un nome (§5, l'Action Registry), a
   volte con una stima AI dietro, che deve rispondere SUBITO a chi ha appena
   dettato «ho mangiato una piadina» — non fra un'ora quando riapri l'app.

   ⚠️ MA LO STATO CANONICO (dieta, allenamenti, segnali del giorno) VIVE SOLO
   NEL BROWSER — `src/engine/healthJournal.ts` scrive `localStorage`, e i
   segnali FOOD/WORKOUT/MOOD del Daily Sync vivono nello zustand del client.
   Il server non ha una copia scrivibile di nessuno dei due: la sua unica copia
   dello stato (`state.ts`) è dichiaratamente opaca, «non affar suo».

   Per questo la scrittura vera resta com'è in `ingest.ts`: questo endpoint
   STIMA (quando serve l'AI) e METTE IN CODA — la stessa filosofia «il
   telefono chiede quando è pronto» di `ingest.ts`, non «il server scrive lui
   stesso». La differenza è che qui la coda porta già il risultato pronto: la
   Shortcut riceve un numero vero SUBITO, il .mon lo applica con le STESSE
   funzioni usate per un inserimento fatto a mano (`addMeal`, `addWeight`,
   `withSignal`) alla prossima apertura — zero logica duplicata fra client e
   server, lo stesso compromesso già scelto e già capito per `ingest.ts`.

   🔒 REGOLA IDENTICA A §21: può solo AGGIUNGERE un segnale sconosciuto.
   `checkin` fa eccezione motivata — vedi sotto — perché lì il testo è la tua
   dettatura diretta, non un'inferenza da sensore: la stessa distanza che
   passa fra «i passi dicono che sei stato attivo» (vietato) e «hai scritto tu
   in chat come stai» (già permesso oggi).
   ════════════════════════════════════════════════════════════════════════════
   ========================================================================= */

import { getStore } from '@netlify/blobs';
import { authorize, authorizeShortcut, denied, json } from './_shared/auth';
import { isShortcutAction, SHORTCUT_ACTIONS, type ShortcutActionId } from './_shared/shortcutActions';
import { recordShortcutCall } from './_shared/shortcutLog';
import { resolveRoute } from './_shared/routing';
import { callProvider } from './_shared/providers';
import { checkCap, recordSpend } from './_shared/spend';

const QUEUE_KEY = 'pending';
const MAX_TEXT = 2000;
const store = () => getStore('vinzmon-shortcut-queue');

/* --- Cosa aspetta il .mon alla prossima apertura -------------------------- */

export type MealSlot = 'colazione' | 'spuntino' | 'pranzo' | 'merenda' | 'cena' | 'extra';

export interface PendingAction {
  id: string;
  action: ShortcutActionId;
  at: string;
  meal?: {
    slot: MealSlot;
    description: string;
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    confidence: 'high' | 'medium' | 'low';
  };
  workout?: { title: string; details: string; minutes: number };
  checkin?: { text: string };
  weight?: { kg: number };
}

async function enqueue(entry: PendingAction): Promise<void> {
  const existing = ((await store().get(QUEUE_KEY, { type: 'json' })) as PendingAction[] | null) ?? [];
  await store().setJSON(QUEUE_KEY, [...existing, entry].slice(-100));
}

const genId = (kind: string) => `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function sane(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

/** Una stima grezza dello slot dall'ora del messaggio — un punto di partenza
    modificabile, non una pretesa di sapere cosa hai mangiato. */
function slotFor(at: Date): MealSlot {
  const h = at.getHours();
  if (h >= 5 && h < 10) return 'colazione';
  if (h >= 10 && h < 12) return 'spuntino';
  if (h >= 12 && h < 15) return 'pranzo';
  if (h >= 15 && h < 18) return 'merenda';
  if (h >= 18 && h < 22) return 'cena';
  return 'extra';
}

/* --- La stima del pasto: l'unica azione che chiama davvero un'AI ---------- */

interface MealEstimate {
  description: string;
  slot: MealSlot;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: 'high' | 'medium' | 'low';
}

const MEAL_SLOTS: MealSlot[] = ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena', 'extra'];

function parseMealJson(text: string): MealEstimate | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const kcal = sane(raw.kcal, 0, 5000);
  const protein = sane(raw.protein, 0, 500);
  const carbs = sane(raw.carbs, 0, 1000);
  const fat = sane(raw.fat, 0, 500);
  if (kcal === null || protein === null || carbs === null || fat === null) return null;
  const slot = MEAL_SLOTS.includes(raw.slot as MealSlot) ? (raw.slot as MealSlot) : 'extra';
  const confidence = raw.confidence === 'high' || raw.confidence === 'medium' ? raw.confidence : 'low';
  const description = typeof raw.description === 'string' && raw.description.trim() ? raw.description.trim().slice(0, 200) : null;
  if (!description) return null;
  return { description, slot, kcal: Math.round(kcal), protein: Math.round(protein), carbs: Math.round(carbs), fat: Math.round(fat), confidence };
}

/**
 * Testo libero → stima. `text-cheap` (Haiku) — la stessa capacità usata per
 * ogni altro lavoro di testo che non è la voce del .mon, quindi già la scelta
 * più economica del catalogo per definizione (routing.ts).
 *
 * ⚠️ Nessuna precisione finta: se il modello non produce un JSON leggibile,
 * NON si inventano numeri — il pasto si mette in coda con la sola descrizione
 * e `confidence: 'low'`, kcal e macro a zero. Un numero sbagliato con l'aria
 * di una misura è peggio di nessun numero.
 */
async function estimateMeal(text: string): Promise<{ estimate: MealEstimate; costUsd: number } | { estimate: null; costUsd: number }> {
  const route = resolveRoute('text-cheap');
  const result = await callProvider(route.provider, {
    model: route.model,
    system: [
      {
        text: [
          'Sei uno stimatore nutrizionale. Ricevi la descrizione di un pasto in italiano,',
          'spesso dettata a voce e imprecisa. Rispondi SOLO con un oggetto JSON, senza testo',
          'intorno e senza blocchi di codice, con esattamente questi campi:',
          '{"description": string breve e pulita, "slot": uno tra "colazione","spuntino","pranzo","merenda","cena","extra",',
          '"kcal": numero, "protein": grammi, "carbs": grammi, "fat": grammi, "confidence": "high"|"medium"|"low"}.',
          'Usa valori arrotondati e plausibili, non falsa precisione. Se non riesci a stimare qualcosa metti 0 e confidence "low".',
        ].join(' '),
      },
    ],
    turns: [],
    user: text,
    maxTokens: 300,
    effort: 'none',
  });

  let costUsd = 0;
  if (result.usage.inputTokens || result.usage.outputTokens) {
    costUsd = await recordSpend('text-cheap', result.model, result.usage);
  }
  if (!result.ok) return { estimate: null, costUsd };
  return { estimate: parseMealJson(result.text), costUsd };
}

/* --- L'endpoint ------------------------------------------------------------ */

interface Incoming {
  action?: string;
  text?: string;
  number?: number;
  /** Quando è successo davvero, se la Shortcut lo sa. Assente = adesso. */
  at?: string;
}

export default async function handler(request: Request): Promise<Response> {
  /* GET: il .mon svuota la coda quando riapre — stesso token di sempre,
     stesso verso di `ingest.ts`. Le Shortcut non chiamano mai GET. */
  if (request.method === 'GET') {
    if (!authorize(request).ok) return denied();
    const pending = ((await store().get(QUEUE_KEY, { type: 'json' })) as PendingAction[] | null) ?? [];
    await store().delete(QUEUE_KEY);
    return json({ pending });
  }

  if (request.method !== 'POST') return json({ error: 'solo GET e POST' }, 405);

  /* POST: solo chi ha il segreto DEDICATO — mai VINZMON_TOKEN. È il punto
     dell'intero secondo token: revocabile senza toccare il resto dell'app. */
  const auth = authorizeShortcut(request);
  if (!auth.ok) {
    console.warn('[shortcut] richiesta rifiutata:', auth.reason);
    return denied();
  }

  const startedAt = Date.now();
  let body: Incoming;
  try {
    body = (await request.json()) as Incoming;
  } catch {
    return json({ error: 'body non leggibile' }, 400);
  }

  /* §4 del brief: «Reject unknown action IDs, malformed payloads.» Un'azione
     sconosciuta o non ancora accesa (memory/goal) si ferma qui, prima di
     leggere altro dal corpo. */
  if (!isShortcutAction(body.action)) {
    await recordShortcutCall({ action: 'unknown', at: new Date().toISOString(), ok: false, ms: Date.now() - startedAt, costUsd: 0, reason: 'azione sconosciuta' });
    return json({ error: 'azione sconosciuta' }, 400);
  }
  const actionId = body.action;
  const def = SHORTCUT_ACTIONS[actionId];
  if (!def.enabled) {
    return json({ error: 'azione non ancora disponibile in questa fase' }, 501);
  }

  const at = body.at && !Number.isNaN(Date.parse(body.at)) ? new Date(body.at) : new Date();
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';

  const fail = async (error: string, status = 400) => {
    await recordShortcutCall({ action: actionId, at: at.toISOString(), ok: false, ms: Date.now() - startedAt, costUsd: 0, reason: error });
    return json({ error }, status);
  };
  const ok = async (payload: Record<string, unknown>, costUsd = 0) => {
    await recordShortcutCall({ action: actionId, at: at.toISOString(), ok: true, ms: Date.now() - startedAt, costUsd });
    return json({ ok: true, ...payload });
  };

  if (actionId === 'weight') {
    const kg = sane(body.number, 20, 400);
    if (kg === null) return fail('peso non valido — atteso un numero fra 20 e 400 kg');
    await enqueue({ id: genId('weight'), action: 'weight', at: at.toISOString(), weight: { kg } });
    return ok({ message: 'Peso registrato', summary: `${kg} kg` });
  }

  if (actionId === 'checkin') {
    if (!text) return fail('testo mancante');
    /* 🔒 Testo verbatim, nessuna estrazione: è la stessa distanza fra
       «i passi dicono» (vietato, §21) e «hai scritto tu» (già permesso). */
    await enqueue({ id: genId('checkin'), action: 'checkin', at: at.toISOString(), checkin: { text } });
    return ok({ message: 'Come stai, registrato', summary: text.length > 80 ? `${text.slice(0, 80)}…` : text });
  }

  if (actionId === 'workout') {
    if (!text) return fail('testo mancante');
    const minutes = sane(body.number, 0, 600) ?? 0;
    await enqueue({
      id: genId('workout'),
      action: 'workout',
      at: at.toISOString(),
      workout: { title: 'Allenamento', details: text, minutes },
    });
    return ok({ message: 'Allenamento registrato', summary: minutes > 0 ? `${text} · ${minutes} min` : text });
  }

  if (actionId === 'meal') {
    if (!text) return fail('serve un testo — la foto arriva in una fase successiva (brief §7)');

    /* Il tetto si controlla solo qui: è la SOLA azione che spende. Bloccare
       peso/checkin/allenamento perché il budget AI è finito punirebbe una
       scrittura che non costa niente per colpa di una che non sta neanche
       chiedendo. */
    const cap = await checkCap();
    if (cap.blocked) return fail('tetto mensile raggiunto — riprova il mese prossimo, o registra il pasto a mano', 402);

    const { estimate, costUsd } = await estimateMeal(text);
    if (!estimate) {
      /* Non si inventa nessun numero: si mette in coda la descrizione grezza,
         a zero, con la confidenza dichiarata bassa — mai un numero con l'aria
         di una misura quando non lo è. */
      await enqueue({
        id: genId('meal'),
        action: 'meal',
        at: at.toISOString(),
        meal: { slot: slotFor(at), description: text, kcal: 0, protein: 0, carbs: 0, fat: 0, confidence: 'low' },
      });
      return ok({ message: 'Pasto registrato', summary: 'stima non riuscita — salvato solo il testo', confidence: 'low' }, costUsd);
    }

    await enqueue({
      id: genId('meal'),
      action: 'meal',
      at: at.toISOString(),
      meal: { ...estimate, slot: estimate.slot ?? slotFor(at) },
    });
    const spread = Math.max(10, Math.round(estimate.kcal * 0.15));
    return ok(
      {
        message: 'Pasto registrato',
        summary: `~${Math.max(0, estimate.kcal - spread)}-${estimate.kcal + spread} kcal · proteine ~${estimate.protein} g`,
        confidence: estimate.confidence,
      },
      costUsd,
    );
  }

  return fail('azione non gestita', 500);
}

export const config = { path: '/api/shortcut' };
