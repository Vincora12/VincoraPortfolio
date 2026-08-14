/* ============================================================================
   CLIENT ANTHROPIC — LATO BROWSER

   ⚠️ LA CHIAVE VIVE NEL BROWSER.

   È una scelta consapevole, presa per il prototipo: la chiave la incolla
   l'utente dal pannello DEV e resta nel `localStorage` di quel dispositivo.
   Nessuno la vede passare in rete verso di noi — ma chiunque apra quel browser
   può leggerla, e qualunque script caricato nella pagina può farlo.

   Regge finché il prototipo è di una persona sola. **Prima di darlo a
   chiunque altro** la chiave va spostata dietro una funzione serverless, dove
   il browser non la vede mai. Il resto di questo file non cambierebbe: si
   sostituisce solo `callAnthropic`.

   MASTER SPEC §17 — «ogni superficie AI ha un fallback». Qui nessuna funzione
   lancia: quando non c'è chiave, quando la rete fallisce, quando il modello
   rifiuta, si restituisce `null` e chi chiama usa la voce deterministica.
   ========================================================================= */

import Anthropic from '@anthropic-ai/sdk';
import type { MonRecord } from '../engine/types';
import type { MoodState } from '../engine/mood';
import type { Turn } from '../engine/memoryContext';
import { PHOTO_MODEL, VOICE_MODEL, buildVoiceSystemPrompt, introductionRequest } from './voicePrompt';
import { recordUsageEntry, type UsageSubsystem } from './usage';

/** Registra la chiamata nel contatore di DEV (§18.1). Non lancia mai. */
function recordUsage(subsystem: UsageSubsystem, response: Anthropic.Beta.BetaMessage): void {
  try {
    recordUsageEntry(
      subsystem,
      response.model,
      response.usage?.input_tokens ?? 0,
      response.usage?.output_tokens ?? 0,
      response.usage?.cache_read_input_tokens ?? 0,
      response.usage?.cache_creation_input_tokens ?? 0,
    );
  } catch {
    /* la telemetria non deve poter rompere una risposta */
  }
}

export interface VoiceResult {
  text: string;
  /** Il modello che ha effettivamente risposto: con un fallback può differire. */
  model: string;
}

/** Perché la voce non è arrivata. Serve alla UI, non solo al log. */
export type VoiceFailure = 'no-key' | 'refused' | 'error';

export interface VoiceOutcome {
  result: VoiceResult | null;
  failure: VoiceFailure | null;
}

function clientFor(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
    // Entrambi necessari per parlare all'API da una pagina: il primo disarma
    // la protezione dell'SDK, il secondo dice al servizio che la chiamata dal
    // browser è voluta. Restano un rischio dichiarato, non una soluzione.
    dangerouslyAllowBrowser: true,
    defaultHeaders: { 'anthropic-dangerous-direct-browser-access': 'true' },
  });
}

/* ============================================================================
   🔷 v1.12 — DOVE VANNO DAVVERO I SOLDI

   Il system prompt di una creatura misura ~1150 token e non cambia mai dentro
   una conversazione; una risposta in voce sono due frasi, ~60 token. Con il
   ragionamento acceso il modello ne produceva ~300, e su un modello che fa
   pagare l'uscita cinque volte l'entrata quella era la voce grossa del conto.

   Due correzioni, nessuna delle quali cambia modello:

   • Il ragionamento si spegne dove non serve. Una battuta in personaggio non
     è un problema da risolvere: il briefing dice già chi è, che tono ha e
     cosa non può dire. Resta acceso dove la frase si rilegge — la
     presentazione alla nascita, che si scrive una volta sola in ventotto
     giorni e vale il suo costo.

   • Il briefing si mette in cache. È identico a ogni turno, e sopra i 512
     token questo modello lo accetta: dal secondo messaggio in poi l'entrata
     costa un decimo.

   ⚠️ La stima del risparmio (~5×) è aritmetica sui listini, non una misura:
   i token di uscita reali non li ho contati, perché per contarli serve una
   chiave. Il pannello DEV → COSTI li mostra veri appena l'app parla.
   ========================================================================= */

/**
 * Quello che il .mon si porta dietro in questo turno.
 *
 * 🔷 v1.12 §15.2 — i due pezzi stanno in POSTI diversi della richiesta perché
 * cambiano a ritmi diversi, e la cache si forma su ciò che non cambia:
 * `memory` una volta al giorno (secondo blocco system, in cache), `turns` a
 * ogni messaggio (nei messaggi, dove il modello si aspetta un dialogo).
 */
export interface VoiceMemory {
  memory: string;
  turns: Turn[];
}

/**
 * Una battuta nella voce di un .mon.
 *
 * `deliberate` accende il ragionamento: è per i momenti che restano — la
 * nascita, l'evoluzione — non per la conversazione di tutti i giorni.
 *
 * `max_tokens` resta largo perché su questo modello limita il ragionamento
 * **insieme** al testo: stretto, troncherebbe la risposta a metà. È un tetto,
 * non un addebito: quello che non viene scritto non si paga.
 */
async function speak(
  apiKey: string,
  record: MonRecord,
  userTurn: string,
  subsystem: UsageSubsystem,
  mood: MoodState | null,
  memory: VoiceMemory | null,
  deliberate = false,
): Promise<VoiceOutcome> {
  try {
    const client = clientFor(apiKey);

    const response = await client.beta.messages.create({
      model: VOICE_MODEL,
      max_tokens: 2000,
      // Se il modello declina, la richiesta viene rigiocata su un altro
      // modello dal servizio stesso invece di tornare indietro a mani vuote.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      ...(deliberate ? {} : { thinking: { type: 'disabled' as const } }),
      system: [
        {
          type: 'text' as const,
          text: buildVoiceSystemPrompt(record, mood),
          // Il briefing è lo stesso a ogni turno: dal secondo messaggio in poi
          // si rilegge dalla cache. Se un giorno il prompt scendesse sotto i
          // 512 token la cache smetterebbe di formarsi **senza dare errore** —
          // il controllo sta in scripts/batch-check.mjs, non nella fiducia.
          cache_control: { type: 'ephemeral' as const },
        },
        // Secondo punto di cache: la memoria cambia una volta al giorno, non a
        // ogni messaggio. Tenendola QUI invece che dentro il briefing, la
        // cache del briefing non si invalida mai e questa regge la giornata.
        ...(memory
          ? [
              {
                type: 'text' as const,
                text: memory.memory,
                cache_control: { type: 'ephemeral' as const },
              },
            ]
          : []),
      ],
      messages: [...(memory?.turns ?? []), { role: 'user' as const, content: userTurn }],
    });

    // Va controllato PRIMA di leggere il contenuto: su un rifiuto `content`
    // può essere vuoto, e leggere `content[0]` si romperebbe.
    recordUsage(subsystem, response);

    if (response.stop_reason === 'refusal') {
      return { result: null, failure: 'refused' };
    }

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    if (text.length === 0) return { result: null, failure: 'error' };

    return { result: { text, model: response.model }, failure: null };
  } catch (err) {
    // Non si propaga: la conversazione non deve mai restare muta (§17).
    console.warn('[ai] voce non disponibile, uso il fallback', err);
    return { result: null, failure: 'error' };
  }
}

/**
 * Una risposta in conversazione.
 *
 * 🔶 v1.9 — prima l'AI serviva solo la presentazione alla nascita e tutte le
 * altre battute restavano deterministiche. Adesso risponde davvero, perché
 * «posso anche solo chattare» è il modo principale di usare l'app: se le
 * risposte non stanno in piedi, non sta in piedi il prodotto.
 *
 * `context` dice al modello cosa il sistema ha già registrato da quel
 * messaggio. Non è un ordine di ringraziare: è per non far chiedere una cosa
 * che si è appena letta.
 */
export async function generateReply(
  apiKey: string | null,
  record: MonRecord,
  userText: string,
  context: string | null,
  mood: MoodState | null,
  memory: VoiceMemory | null,
): Promise<VoiceOutcome> {
  if (!apiKey) return { result: null, failure: 'no-key' };
  const turn = context ? `${userText}\n\n[${context}]` : userText;
  return speak(apiKey, record, turn, 'reply', mood, memory);
}

/* ============================================================================
   🔶 v1.9 §5.2 — LETTURA DI UNA FOTO

   Il modello guarda l'immagine e dice cosa ci vede in termini dei tre Daily
   Signals. Contratto stretto e JSON: qui non serve una descrizione, serve un
   dato, e una risposta libera andrebbe interpretata a sua volta.

   Regola non negoziabile, ripetuta nel prompt e imposta dal chiamante: può
   solo AGGIUNGERE segnali sconosciuti, mai correggerne uno che hai dichiarato.
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
  apiKey: string | null,
  dataUrl: string,
): Promise<PhotoSignals | null> {
  if (!apiKey) return null;

  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  const [, mediaType, data] = match;

  try {
    const response = await clientFor(apiKey).beta.messages.create({
      // Il modello piccolo: qui il contratto è «guarda e dichiara, nel dubbio
      // null», non c'è niente da ragionare, e il grande costa cinque volte
      // tanto per lo stesso risultato. `effort` e `thinking` sono omessi
      // perché questa generazione non li accetta (vedi PHOTO_MODEL).
      model: PHOTO_MODEL,
      max_tokens: 1200,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: PHOTO_SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType as 'image/png', data: data! },
            },
            { type: 'text', text: 'Cosa vedi?' },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') return null;

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    recordUsage('photo', response);

    // Il modello può incorniciare il JSON: si prende il primo oggetto e basta.
    const json = /\{[\s\S]*\}/.exec(text)?.[0];
    if (!json) return null;
    const parsed = JSON.parse(json) as { food?: string | null; workout?: string | null };

    const signals: PhotoSignals['signals'] = {};
    if (parsed.food) signals.FOOD = { status: 'KNOWN', note: `dalla foto: ${parsed.food}` };
    if (parsed.workout) {
      signals.WORKOUT = { status: 'KNOWN', note: `dalla foto: ${parsed.workout}` };
    }
    return { signals };
  } catch (err) {
    console.warn('[ai] foto non leggibile, resta salvata', err);
    return null;
  }
}

/**
 * La prima frase di un .mon appena nato.
 *
 * È l'unica chiamata che ragiona. Succede una volta per creatura — cioè circa
 * una volta ogni ventotto giorni — ed è la frase che si rilegge: qui il costo
 * pieno è giustificato, nella conversazione di tutti i giorni no.
 */
export async function generateIntroduction(
  apiKey: string | null,
  record: MonRecord,
  mood: MoodState | null,
): Promise<VoiceOutcome> {
  if (!apiKey) return { result: null, failure: 'no-key' };
  // Nessuna memoria: è il primo istante, non c'è niente prima. Passargli una
  // memoria vuota lo farebbe partire come se avesse dimenticato qualcosa.
  return speak(apiKey, record, introductionRequest(record), 'introduction', mood, null, true);
}
