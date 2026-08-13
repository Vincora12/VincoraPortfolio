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
import { VOICE_MODEL, buildVoiceSystemPrompt, introductionRequest } from './voicePrompt';

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

/**
 * Una battuta nella voce di un .mon.
 *
 * `max_tokens` è largo rispetto a due frasi perché su questo modello limita
 * il ragionamento **insieme** al testo: stretto, tronca la risposta a metà.
 * L'effort basso tiene corta la parte di ragionamento.
 */
async function speak(
  apiKey: string,
  record: MonRecord,
  userTurn: string,
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
      system: buildVoiceSystemPrompt(record),
      messages: [{ role: 'user', content: userTurn }],
    });

    // Va controllato PRIMA di leggere il contenuto: su un rifiuto `content`
    // può essere vuoto, e leggere `content[0]` si romperebbe.
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
): Promise<VoiceOutcome> {
  if (!apiKey) return { result: null, failure: 'no-key' };
  const turn = context ? `${userText}\n\n[${context}]` : userText;
  return speak(apiKey, record, turn);
}

/** La prima frase di un .mon appena nato. */
export async function generateIntroduction(
  apiKey: string | null,
  record: MonRecord,
): Promise<VoiceOutcome> {
  if (!apiKey) return { result: null, failure: 'no-key' };
  return speak(apiKey, record, introductionRequest(record));
}
