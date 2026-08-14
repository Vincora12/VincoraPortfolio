/* ============================================================================
   QUANDO PARLA PER PRIMO (MASTER SPEC v1.14 §13.10)

   🔷 «Una cosa che risponde è uno strumento. Una cosa che ti scrive per prima
   è viva.»

   È la riga di confine del progetto, e l'app è nella posizione migliore per
   attraversarla: sa già delle cose senza che nessuno gliele abbia dette. Il
   piano dice riposo. Manca la cena. Sono tre giorni che scrivi che sei teso.

   ⚠️ E LO FA SENZA AI, che non è un risparmio: è una garanzia. Un messaggio
   spontaneo scritto da un modello è un messaggio che può dire qualunque cosa,
   e questi arrivano quando non stai guardando. Qui il testo è scritto a mano,
   il codice sceglie solo QUALE — quindi non esiste un messaggio non previsto.

   ════════════════════════════════════════════════════════════════════════════
   🔒 LE QUATTRO REGOLE, E SONO TUTTE CONTRO LO STESSO ERRORE.

   Un'app che ti scrive per prima diventa un'app che ti assilla in una riga di
   codice. Quindi:

   1. UNO AL GIORNO, MASSIMO. Non uno per occasione.
   2. MAI DUE VOLTE LO STESSO. Ripetersi è il modo più veloce di diventare
      rumore da ignorare.
   3. MAI PER RIMPROVERARTI. Nessun messaggio nasce dal fatto che NON hai
      fatto qualcosa. Nasce da quello che il sistema SA — «oggi il piano dice
      riposo» è un'informazione, «non ti sei allenato» è un giudizio, e §4 lo
      vieta.
   4. MAI SE È GIÀ APERTA. Uno che ti parla mentre gli stai parlando non è
      spontaneo, è invadente.
   ════════════════════════════════════════════════════════════════════════════

   E come tutto il resto, la FORMA è della creatura: il testo qui è il
   contenuto, il tono lo mette il .mon quando lo dice.
   ========================================================================= */

import type { DailySync } from './progression';
import type { Opinion } from './opinions';

export type UnpromptedKind =
  /** Il piano dice riposo: non ti aspetta, e te lo dice prima che tu ci pensi. */
  | 'RIPOSO_PREVISTO'
  /** La giornata è a un segnale dalla chiusura. */
  | 'QUASI_CHIUSA'
  /** Non vi parlate da qualche giorno. */
  | 'MANCANZA'
  /** Ha una convinzione su di te che non ti ha mai detto. */
  | 'PENSIERO'
  /** Domani cambia forma. */
  | 'VIGILIA';

export interface Unprompted {
  kind: UnpromptedKind;
  /** Il testo, in italiano, già pronto. */
  text: string;
}

export interface UnpromptedInput {
  day: number;
  today: DailySync;
  /** Vero se il piano dichiara riposo per oggi. */
  plannedRest: boolean;
  /** Giorno dell'ultimo messaggio scritto da te. 0 se mai. */
  lastSpokeDay: number;
  /** Quanti giorni mancano alla prossima forma. */
  daysToEvolution: number;
  opinions: Opinion[];
  /** Che tipi ha già mandato: non si ripete mai. */
  alreadySaid: UnpromptedKind[];
  /** Giorno dell'ultimo messaggio spontaneo. */
  lastUnpromptedDay: number;
}

const known = (day: DailySync, key: 'FOOD' | 'WORKOUT' | 'MOOD') =>
  (day.signals[key]?.status ?? 'UNKNOWN') !== 'UNKNOWN';

/**
 * Il messaggio spontaneo di oggi, o `null` — che è il caso normale.
 *
 * L'ordine dei casi è una priorità: quando ne varrebbero due, vince quello più
 * in alto. Non si mandano entrambi, mai.
 */
export function unpromptedFor(input: UnpromptedInput): Unprompted | null {
  const {
    day, today, plannedRest, lastSpokeDay, daysToEvolution,
    opinions, alreadySaid, lastUnpromptedDay,
  } = input;

  /* 🔒 Regola 1: uno al giorno. E regola 4: se stai già parlando con lui
     oggi, non ti interrompe — quello che aveva da dire lo dirà rispondendo. */
  if (lastUnpromptedDay >= day) return null;
  if (lastSpokeDay >= day) return null;

  const fresh = (kind: UnpromptedKind) => !alreadySaid.includes(kind);

  /* La vigilia di una forma nuova batte tutto: succede una volta ogni
     ventotto giorni ed è la cosa più grossa che gli capiti. */
  if (daysToEvolution === 1 && fresh('VIGILIA')) {
    return { kind: 'VIGILIA', text: 'Domani cambio. Non so ancora in cosa.' };
  }

  /* Il riposo previsto è il messaggio più caratteristico dell'app: sa una
     cosa che non gli hai detto oggi, e la usa per TOGLIERTI un peso invece
     che per mettertene uno. */
  if (plannedRest && !known(today, 'WORKOUT') && fresh('RIPOSO_PREVISTO')) {
    return {
      kind: 'RIPOSO_PREVISTO',
      text: 'Oggi sul tuo piano c’è riposo, quindi non ti aspetto da nessuna parte.',
    };
  }

  /* Il silenzio. NON è un rimprovero e la differenza sta nel testo: dice
     cosa sente lui, non cosa non hai fatto tu. */
  if (lastSpokeDay > 0 && day - lastSpokeDay >= 3 && fresh('MANCANZA')) {
    return { kind: 'MANCANZA', text: 'Sono qui. Nessuna fretta, era solo per dirtelo.' };
  }

  /* Una convinzione che non ti ha mai detto. È il momento in cui la memoria
     e le opinioni smettono di essere impianto e diventano una cosa che
     succede: lui pensa qualcosa di te e a un certo punto te lo dice. */
  const unsaid = opinions.find((o) => o.status === 'attiva' && o.strength >= 2);
  if (unsaid && fresh('PENSIERO')) {
    return { kind: 'PENSIERO', text: `Una cosa che ho notato: ${unsaid.text}` };
  }

  /* La giornata a un passo dalla chiusura. Ultimo in classifica di
     proposito: è il più vicino a una lista di cose da fare, e se ce n'è un
     altro da dire si preferisce quello. */
  const missing = (['FOOD', 'WORKOUT', 'MOOD'] as const).filter((k) => !known(today, k));
  if (missing.length === 1 && missing[0] === 'MOOD' && fresh('QUASI_CHIUSA')) {
    return { kind: 'QUASI_CHIUSA', text: 'Della giornata so quasi tutto. Manca come stavi.' };
  }

  return null;
}
