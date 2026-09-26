/* ============================================================================
   LO STRATO VOCE (MASTER SPEC v1.13 §17, §19.5)

   ✅ LA CHIAVE NON VIVE PIÙ NEL BROWSER.

   Qui c'era l'SDK di Anthropic, costruito con la chiave dell'API presa dal
   `localStorage`, e un commento lungo che spiegava perché fosse accettabile
   per un prototipo di una persona sola. Non lo è più stato nel momento in cui
   questa è diventata l'app di tutti i giorni con un budget vero dietro.

   Adesso ogni chiamata passa da `/api/ai`: le funzioni tengono le chiavi, il
   tetto di spesa e la scelta del fornitore. Il browser ha solo un token che
   apre quelle funzioni e niente altro.

   Quello che NON è cambiato, ed è il punto: le firme di questo file. Lo store
   chiama le stesse funzioni di prima. Il commento vecchio prometteva
   «si sostituisce solo `callAnthropic`» — era vero.

   🔒 §17 resta la regola: nessuna funzione qui lancia. Senza token, senza
   rete, con il tetto sfondato, si torna `null` e chi chiama usa la voce
   deterministica.
   ========================================================================= */

import type { MonRecord } from '../engine/types';
import type { MoodState } from '../engine/mood';
import type { VoiceNote } from '../engine/notebook';
import { buildOperatorPrompt, buildVoiceSystemPrompt, introductionRequest } from './voicePrompt';
import { ask, type BackendFailure, type VoiceData } from './backend';
import { recordUsageEntry } from './usage';

export interface VoiceResult {
  text: string;
  /** Il modello che ha effettivamente risposto: con un fallback può differire. */
  model: string;
}

/**
 * Perché la voce non è arrivata.
 *
 * 🔷 v1.13 — `capped` è nuovo e non è un errore come gli altri: è il tetto che
 * hai deciso tu. L'interfaccia deve poterlo dire, invece di mostrare la voce
 * deterministica come se il modello si fosse rotto.
 */
export type VoiceFailure = 'no-key' | 'refused' | 'error' | 'capped';

export interface VoiceOutcome {
  result: VoiceResult | null;
  failure: VoiceFailure | null;
}

/** Traduce l'esito del backend nel vocabolario che la UI già conosce. */
function asVoiceFailure(failure: BackendFailure): VoiceFailure {
  if (failure === 'no-token') return 'no-key';
  if (failure === 'capped') return 'capped';
  return 'error';
}


/* vNext cleanup — `speak` is now single-shot. Its tool loop served only
   `generateReply` ← store `requestReply` ← store `sendMessage`, which had no
   caller left (the chat runs through `assistant-original/netlify-runtime.ts`).
   The only live callers are the birth introduction and DEV/LAB voice tests. */
async function speak(
  token: string,
  record: MonRecord,
  userTurn: string,
  subsystem: 'introduction',
  mood: MoodState | null,
  notes: VoiceNote[],
  deliberate = false,
  /* 🔷 §19.2 — chi dà la voce, se non il predefinito. */
  voiceModel?: string | null,
  opts?: { build?: boolean; effort?: 'none' | 'low' | 'medium' },
): Promise<VoiceOutcome> {
  const build = opts?.build === true;

  const system = build
    ? [{ text: buildOperatorPrompt(), cache: true }]
    : [{ text: buildVoiceSystemPrompt(record, mood, notes), cache: true }];

  const res = await ask<VoiceData & { usage?: Record<string, number>; toolUses?: { id: string; name: string; input: unknown }[] }>(token, {
    capability: 'character-voice',
    voiceModel,
    system,
    turns: [],
    user: userTurn,
    thinking: deliberate,
    effort: opts?.effort,
    maxTokens: 2000,
  });
  const data = res.data;
  const failure: BackendFailure | null = res.failure;
  recordVoiceUsage(subsystem, res.data);

  if (!data) return { result: null, failure: asVoiceFailure(failure ?? 'error') };

  /* ════════════════════════════════════════════════════════════════════════
     🔴 UNA RISPOSTA ARRIVATA VUOTA È UNA RISPOSTA CHE NON È ARRIVATA.

     🔷 «Sai che non risponde.»

     Qui c'era solo `if (!data)`. Ma `data` può esistere benissimo con dentro
     `text: ''` — succede quando il modello chiude il turno con una chiamata a
     uno strumento e nessuna frase, o quando il tetto di token se ne va tutto
     nel ragionamento. In quel caso questa funzione tornava un successo con una
     stringa vuota, e chi chiama faceva la cosa che gli era stata detta di
     fare: mostrarla.

     Il risultato a schermo è una BOLLA GRIGIA VUOTA. Non i puntini che
     girano — quella è un'attesa, e si capisce. Una bolla vuota è una risposta
     arrivata: sembra che il .mon abbia deciso di non dire niente.

     🔒 Il ripiego deterministico esiste per questo (§17), e da qui lo si
     raggiunge tornando `result: null`. Chi chiama lo mostra già marcato come
     ripiego, quindi si vede subito che la voce vera non è arrivata.

     ⚠️ `trim()` e non `length > 0`: uno spazio o un a-capo da soli sono una
     bolla vuota identica, e sono l'uscita più probabile di un turno finito
     male.
     ════════════════════════════════════════════════════════════════════════ */
  if (!(data.text ?? '').trim()) {
    console.warn('[voce] il modello ha risposto senza testo: uso il ripiego', {
      model: data.model,
      strumentiUsati: (data.toolUses ?? []).map((u) => u.name),
    });
    return { result: null, failure: 'error' };
  }

  return { result: { text: data.text, model: data.model }, failure: null };
}

/* La telemetria di DEV resta lato browser: il server ha il suo registro, ma
   quello dice quanto hai speso in totale, non cosa è appena successo in questa
   sessione. Le due cose servono a domande diverse.

   ⚠️ Si registra a OGNI giro, non solo all'ultimo: con gli strumenti una
   risposta può costare tre chiamate, e contarne una sola farebbe sembrare
   gratis proprio la parte nuova. */
function recordVoiceUsage(
  subsystem: 'introduction',
  data: (VoiceData & { usage?: Record<string, number> }) | null,
): void {
  if (!data) return;
  try {
    const u = data.usage ?? {};
    recordUsageEntry(
      subsystem,
      data.model,
      u.inputTokens ?? 0,
      u.outputTokens ?? 0,
      u.cacheReadTokens ?? 0,
      u.cacheWriteTokens ?? 0,
    );
  } catch {
    /* la telemetria non deve poter rompere una risposta */
  }
}

/**
 * La prima frase di un .mon appena nato.
 *
 * È una delle due chiamate che ragionano. Succede una volta per creatura —
 * circa una ogni ventotto giorni — ed è la frase che si rilegge.
 */
export async function generateIntroduction(
  token: string | null,
  record: MonRecord,
  mood: MoodState | null,
  notes: VoiceNote[] = [],
  voiceModel?: string | null,
): Promise<VoiceOutcome> {
  if (!token) return { result: null, failure: 'no-key' };
  // Nessuna memoria: è il primo istante, non c'è niente prima. Una memoria
  // vuota lo farebbe partire come se avesse dimenticato qualcosa.
  return speak(token, record, introductionRequest(record), 'introduction', mood, notes, true, voiceModel);
}

/* ============================================================================
   §5.2 — LETTURA DI UNA FOTO

   Il modello guarda l'immagine e dice cosa ci vede in termini dei Daily
   Signals. Contratto stretto e JSON: qui non serve una descrizione, serve un
   dato, e una risposta libera andrebbe interpretata a sua volta.

   Regola non negoziabile, ripetuta nel prompt e imposta dal chiamante: può
   solo AGGIUNGERE segnali sconosciuti, mai correggerne uno che hai dichiarato.

   🔒 Questa è l'unica capacità che il backend manda su un fornitore con un
   piano gratuito, e va bene proprio perché parte SENZA contesto: una foto di
   un piatto non dice chi sei. La conversazione, i ricordi e l'umore non
   passano mai di lì.
   ========================================================================= */

export interface PhotoSignals {
  signals: Partial<Record<'FOOD' | 'WORKOUT' | 'MOOD', { status: 'KNOWN'; note: string }>>;
}

const PHOTO_SYSTEM = `You look at one photo a person took during their day and report ONLY what is actually visible.

Answer with a single JSON object, nothing else:
{"food": "<short Italian description>" | null,
 "workout": "<short Italian description>" | null}

Rules:
- "food" only if the photo shows something edible or a meal in progress. Describe it plainly in Italian, max 6 words. No judgement about whether it is healthy: that is forbidden by the product's safety rules.
- "workout" only if the photo shows physical activity, a gym, equipment, a route or a tracker screen. Max 6 words, Italian.
- If you are not sure, use null. Never guess. A wrong reading is worse than no reading.
- Never infer mood from a face: subjective states are only ever declared by the person.`;

export async function readPhotoSignals(
  token: string | null,
  dataUrl: string,
  /** Chi guarda la foto, se hai scelto. */
  model?: string | null,
): Promise<PhotoSignals | null> {
  if (!token) return null;

  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  const [, mediaType, data] = match;

  const { data: result } = await ask<VoiceData & { usage?: Record<string, number> }>(token, {
    capability: 'vision-quick',
    voiceModel: model,
    system: [{ text: PHOTO_SYSTEM }],
    user: 'Cosa vedi?',
    image: { mediaType: mediaType!, data: data! },
    maxTokens: 400,
  });

  if (!result) return null;

  try {
    const u = result.usage ?? {};
    recordUsageEntry('photo', result.model, u.inputTokens ?? 0, u.outputTokens ?? 0);
  } catch {
    /* la telemetria non rompe una lettura */
  }

  // Il modello può incorniciare il JSON: si prende il primo oggetto e basta.
  const json = /\{[\s\S]*\}/.exec(result.text)?.[0];
  if (!json) return null;

  try {
    const parsed = JSON.parse(json) as { food?: string | null; workout?: string | null };
    const signals: PhotoSignals['signals'] = {};
    if (parsed.food) signals.FOOD = { status: 'KNOWN', note: `dalla foto: ${parsed.food}` };
    if (parsed.workout) {
      signals.WORKOUT = { status: 'KNOWN', note: `dalla foto: ${parsed.workout}` };
    }
    return { signals };
  } catch {
    return null;
  }
}
