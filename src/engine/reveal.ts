/* ============================================================================
   COME UNA RISPOSTA COMPARE (MASTER SPEC v1.12 §17.4)

   Fino a ieri funzionava così: appariva subito la frase deterministica, e
   quando arrivava la risposta vera dell'AI **quella frase veniva sostituita**.
   Stavi leggendo e il testo cambiava sotto gli occhi.

   Non c'è niente che faccia sembrare una cosa più finta. Non è un compagno che
   ci ripensa: è una macchina che si corregge. Quindi la bolla adesso nasce
   VUOTA, con i puntini, e il fallback entra soltanto se la voce vera non
   arriva — quando non hai ancora letto niente e non c'è niente da sostituire.

   ⚠️ QUESTO FILE È PURO DI PROPOSITO. La comparsa è la cosa che non si può
   provare senza una chiave API: la strada che conta passa dallo streaming, e
   lo streaming non gira nei controlli. Se la logica vivesse dentro il
   componente React, l'unica verifica possibile sarebbe guardarla a occhio.

   Qui invece si calcola un PIANO — chi compare, quando, in quale bolla — e il
   piano è una struttura dati che si controlla da riga di comando. Chi lo
   esegue si limita a rispettare degli orari.
   ========================================================================= */

import { MAX_REVEAL_MS, type TypingRhythm } from './typingRhythm';

export interface RevealStep {
  /** Millisecondi dall'inizio del turno. */
  at: number;
  /**
   * In quale bolla va. 0 è la risposta, 1 è il seguito di chi prima reagisce
   * e poi argomenta (`splitReply`). Una bolla 1 che non compare mai in un
   * piano significa che questo .mon non fa così.
   */
  bubble: 0 | 1;
  /** Il testo COMPLETO di quella bolla a quel momento, non il pezzo nuovo. */
  text: string;
}

export interface RevealPlan {
  steps: RevealStep[];
  /** Quando l'indicatore va spento perché sta esitando, e quando torna. */
  hesitation: { from: number; to: number } | null;
  /** Quando tutto è finito: dopo, la bolla non è più `pending`. */
  endsAt: number;
}

/** La pausa fra la reazione corta e il seguito, quando il .mon spezza. */
const SPLIT_GAP_MS = 900;

/** Quanto dura l'esitazione: abbastanza da vedersi, non da preoccupare. */
const HESITATION_MS = 700;

/**
 * Taglia il testo in «prima frase» + «il resto».
 *
 * Serve solo a chi spezza. Se non c'è un punto di taglio decente — una frase
 * sola, o una primissima frase lunghissima che come reazione istintiva non
 * avrebbe senso — non si taglia: meglio una bolla sola che una finta pausa in
 * mezzo a un ragionamento.
 */
export function splitFirstSentence(text: string): [string, string] | null {
  const match = /^(.{6,90}?[.!?…])\s+(\S[\s\S]*)$/.exec(text.trim());
  if (!match) return null;
  return [match[1]!.trim(), match[2]!.trim()];
}

/** Le parole di un testo, tenendo la spaziatura per ricostruirlo esatto. */
function words(text: string): string[] {
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

/**
 * Il piano di comparsa di una risposta.
 *
 * `reveal: 'block'` non produce passi intermedi: chi scrive così ha formulato
 * in testa e consegna il messaggio finito. Fargli comparire il testo parola
 * per parola sarebbe dargli il ritmo di qualcun altro.
 */
export function planReveal(text: string, rhythm: TypingRhythm): RevealPlan {
  const clean = text.trim();
  const hesitation = rhythm.hesitates
    ? { from: Math.round(rhythm.thinkMs * 0.45), to: Math.round(rhythm.thinkMs * 0.45) + HESITATION_MS }
    : null;

  /* L'esitazione sposta in avanti tutto quello che viene dopo: è una pausa
     reale nel turno, non un'animazione che gira in parallelo. */
  const start = rhythm.thinkMs + (hesitation ? HESITATION_MS : 0);

  const parts = rhythm.splitReply ? splitFirstSentence(clean) : null;
  const steps: RevealStep[] = [];

  /** Riempie una bolla e restituisce il momento in cui ha finito. */
  const fill = (bubble: 0 | 1, body: string, from: number): number => {
    if (rhythm.reveal === 'block' || body.length === 0) {
      steps.push({ at: from, bubble, text: body });
      return from;
    }

    const tokens = words(body);
    const wordCount = tokens.filter((t) => t.trim().length > 0).length;
    /* Lo stesso tetto di typingRhythm: su una risposta lunga il passo si
       comprime, altrimenti il carattere lento diventa un'app rotta. */
    const total = Math.min(wordCount * rhythm.paceMs, MAX_REVEAL_MS);
    const per = wordCount > 0 ? total / wordCount : 0;

    let so = '';
    let seen = 0;
    for (const token of tokens) {
      so += token;
      if (token.trim().length === 0) continue;
      seen++;
      steps.push({ at: Math.round(from + seen * per), bubble, text: so });
    }
    return from + total;
  };

  if (parts) {
    const doneFirst = fill(0, parts[0]!, start);
    const endsAt = fill(1, parts[1]!, doneFirst + SPLIT_GAP_MS);
    return { steps, hesitation, endsAt: Math.round(endsAt) };
  }

  return { steps, hesitation, endsAt: Math.round(fill(0, clean, start)) };
}

/** Quante bolle userà questo piano: 1 o 2. Serve a chi le deve creare. */
export function bubbleCount(plan: RevealPlan): 1 | 2 {
  return plan.steps.some((s) => s.bubble === 1) ? 2 : 1;
}
