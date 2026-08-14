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
import type { Turn } from '../engine/memoryContext';
import { buildVoiceSystemPrompt, introductionRequest } from './voicePrompt';
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

/**
 * Quello che il .mon si porta dietro in questo turno.
 *
 * §15.2 — i due pezzi finiscono in POSTI diversi della richiesta perché
 * cambiano a ritmi diversi: `memory` una volta al giorno (secondo blocco di
 * sistema, in cache), `turns` a ogni messaggio (nei messaggi, dove il modello
 * si aspetta un dialogo e non una trascrizione).
 */
export interface VoiceMemory {
  memory: string;
  turns: Turn[];
}

/**
 * Una battuta nella voce di un .mon.
 *
 * `deliberate` accende il ragionamento. Resta spento sulla conversazione — su
 * due frasi in personaggio non aggiunge niente e l'uscita si paga cinque volte
 * l'entrata — e si riaccende sulla nascita e sulle domande vere (§17.5).
 */
async function speak(
  token: string,
  record: MonRecord,
  userTurn: string,
  subsystem: 'introduction' | 'reply',
  mood: MoodState | null,
  memory: VoiceMemory | null,
  deliberate = false,
): Promise<VoiceOutcome> {
  const { data, failure } = await ask<VoiceData & { usage?: Record<string, number> }>(token, {
    capability: 'character-voice',
    system: [
      // Il briefing non cambia mai dentro una conversazione: in cache.
      { text: buildVoiceSystemPrompt(record, mood), cache: true },
      // La memoria cambia una volta al giorno: seconda voce di cache, così
      // quella del briefing non si invalida mai.
      ...(memory ? [{ text: memory.memory, cache: true }] : []),
    ],
    turns: memory?.turns ?? [],
    user: userTurn,
    thinking: deliberate,
    maxTokens: 2000,
  });

  if (!data) return { result: null, failure: asVoiceFailure(failure ?? 'error') };

  /* La telemetria di DEV resta lato browser: il server ha il suo registro,
     ma quello dice quanto hai speso in totale, non cosa è appena successo in
     questa sessione. Le due cose servono a domande diverse. */
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

  return { result: { text: data.text, model: data.model }, failure: null };
}

/**
 * Una risposta in conversazione.
 *
 * `context` dice al modello cosa il sistema ha già registrato da quel
 * messaggio. Non è un ordine di ringraziare: è per non far chiedere una cosa
 * che si è appena letta.
 */
export async function generateReply(
  token: string | null,
  record: MonRecord,
  userText: string,
  context: string | null,
  mood: MoodState | null,
  memory: VoiceMemory | null,
  deliberate = false,
): Promise<VoiceOutcome> {
  if (!token) return { result: null, failure: 'no-key' };
  const turn = context ? `${userText}\n\n[${context}]` : userText;
  return speak(token, record, turn, 'reply', mood, memory, deliberate);
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
): Promise<VoiceOutcome> {
  if (!token) return { result: null, failure: 'no-key' };
  // Nessuna memoria: è il primo istante, non c'è niente prima. Una memoria
  // vuota lo farebbe partire come se avesse dimenticato qualcosa.
  return speak(token, record, introductionRequest(record), 'introduction', mood, null, true);
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
): Promise<PhotoSignals | null> {
  if (!token) return null;

  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  const [, mediaType, data] = match;

  const { data: result } = await ask<VoiceData & { usage?: Record<string, number> }>(token, {
    capability: 'vision-quick',
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
