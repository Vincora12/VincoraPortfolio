/* ============================================================================
   ESTRAZIONE NATURALE DALLA CHAT (MASTER SPEC v1.9 §5.1)

   🔶 v1.8 §13 diceva già dove si andava a parare: «Daily Scan → Replace with
   Daily Signals + **natural extraction**». Questo è quel pezzo.

   Il principio: **non deve esistere un secondo posto dove registrare le cose.**
   Se scrivi «oggi palestra e poi carbonara», il giorno si riempie da sé. La
   schermata dei segnali resta, ma diventa il posto dove *controllare*, non
   quello dove *inserire*.

   Perché è deterministico e non AI:

   • È istantaneo e non costa niente. Un'estrazione che arriva due secondi dopo
     il messaggio non si sente come «ha capito», si sente come un ritardo.
   • Funziona senza chiave API. MS §17 impone un fallback a ogni superficie AI,
     e qui il fallback è la superficie.
   • È verificabile. `verify:batch` gli passa frasi vere e controlla cosa esce.

   L'AI arriverà sopra questo, non al suo posto: leggerà le sfumature che le
   parole chiave non prendono e potrà solo AGGIUNGERE segnali, mai toglierne.

   ⚠️ Regola che il codice tiene esplicita: **dire di stare male NON è una
   pausa.** Se lo racconti, quella è una giornata normale e vale +1 SYNC come
   tutte le altre — raccontare com'è andata è esattamente ciò che il prodotto
   vuole. La pausa è per i giorni in cui non c'eri (vedi `progression.ts`).
   ========================================================================= */

import type { DailySignalKey, SignalStatus } from './progression';
import type { MoodInputId } from './generation-config';

export interface ExtractedSignal {
  status: SignalStatus;
  /** La provenienza che finirà nel calendario: le parole che l'hanno prodotta. */
  note: string;
}

export interface Extraction {
  signals: Partial<Record<DailySignalKey, ExtractedSignal>>;
  moods: MoodInputId[];
  /** Un'assenza dichiarata al passato: giorni in cui non c'eri. */
  absence: string | null;
}

export const EMPTY_EXTRACTION: Extraction = { signals: {}, moods: [], absence: null };

/* --- Vocabolari -------------------------------------------------------------
   Sono in italiano perché è la lingua parlata dell'app. Stanno tutti qui: se
   una frase non viene capita, si aggiunge una parola in un posto solo.
   -------------------------------------------------------------------------- */

/** Ha mangiato qualcosa, o ha detto che non ha mangiato: entrambi sono risposte. */
const FOOD_KNOWN = [
  'mangiat', 'colazione', 'pranzo', 'pranzat', 'cena', 'cenat', 'spuntino', 'merenda',
  'pizza', 'pasta', 'carbonara', 'panino', 'insalata', 'riso', 'carne', 'pesce',
  'dolce', 'gelato', 'birra', 'caffè', 'proteine', 'dieta', 'cucinat', 'ordinat',
];
const FOOD_NOT_APPLICABLE = ['digiun', 'saltato il pranzo', 'saltata la cena', 'non ho mangiato'];

const WORKOUT_KNOWN = [
  'palestra', 'allenat', 'allenamento', 'corsa', 'corso stamattina', 'corri', 'corro',
  'nuotat', 'nuoto', 'bici', 'bicicletta', 'workout', 'pesi', 'panca', 'squat',
  'camminat', 'passeggiat', 'partita', 'calcio', 'tennis', 'yoga', 'stretching',
];
const WORKOUT_REST = [
  'riposo', 'giorno di riposo', 'niente palestra', 'non mi sono allenato',
  'oggi fermo', 'rest day', 'salto l’allenamento', 'salto l\'allenamento',
];

/**
 * Assenza dichiarata: i giorni in cui NON c'eri. È al passato per costruzione —
 * «sono stato», «ero» — perché una pausa si dichiara dopo, non durante.
 * Dire «oggi sto male» non finisce qui: quella è una giornata da raccontare.
 */
const ABSENCE = [
  'non c’ero', 'non c\'ero', 'sono stato via', 'ero via', 'ero in ospedale',
  'sono stato in ospedale', 'ricoverat', 'sono stato male tutta', 'sono stato a letto',
  'non ho aperto', 'sono sparito', 'sono stato fuori',
];

/** Le 13 voci di GB §11, con i modi in cui uno le dice davvero. */
const MOOD_WORDS: Record<MoodInputId, string[]> = {
  SERENO: ['sereno', 'tranquillo', 'in pace', 'va bene così'],
  AFFETTUOSO: ['affettuoso', 'coccole', 'mi manchi', 'voglia di abbracci'],
  ARRAPATO: ['arrapato', 'eccitato', 'voglia'],
  ENERGICO: ['energico', 'carico', 'pieno di energia', 'in forma'],
  EUFORICO: ['euforico', 'benissimo', 'alla grande', 'giornatona', 'felicissimo'],
  IRRITATO: ['irritato', 'incazzat', 'nervoso', 'scazzat', 'rotto le palle'],
  STRESSATO: ['stressat', 'ansia', 'ansios', 'sotto pressione', 'troppe cose'],
  PARANOIATO: ['paranoi', 'in paranoia', 'sospettoso'],
  SCARICO: ['scarico', 'stanco', 'esausto', 'a pezzi', 'non ho dormito', 'distrutto', 'malato', 'influenza', 'febbre', 'sto male', 'raffreddat'],
  MALINCONICO: ['malinconico', 'giù', 'triste', 'nostalgi', 'un po’ giù', 'un po\' giù'],
  CAZZARO: ['cazzaro', 'cazzeggi', 'in vena di scherzi', 'demenziale'],
  SICURO: ['sicuro di me', 'mi sento sicuro', 'centrat', 'lucido'],
  DISTACCATO: ['distaccato', 'distante', 'non mi va di parlare', 'lasciami stare'],
};

/**
 * Stare male implica un giorno di riposo, e dirlo è già una risposta sul
 * WORKOUT. Non è una deduzione azzardata: è la stessa cosa che farebbe
 * chiunque legga la frase.
 */
const ILLNESS = ['malato', 'influenza', 'febbre', 'sto male', 'raffreddat', 'a letto'];

/* --- Estrazione -------------------------------------------------------------- */

function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, "'");
}

function hits(haystack: string, needles: readonly string[]): string | null {
  for (const n of needles) {
    const probe = normalise(n);
    if (haystack.includes(probe)) return n;
  }
  return null;
}

/**
 * Legge un messaggio e dice cosa ci ha trovato. Puro: nessuno stato, nessuna
 * rete. Non inventa mai un segnale che non è nel testo — la regola di §5 sui
 * sensori vale identica qui: «should not silently fabricate subjective
 * information such as Mood».
 */
export function extractFromMessage(text: string): Extraction {
  const h = normalise(text);
  const signals: Extraction['signals'] = {};
  const moods: MoodInputId[] = [];

  /* CIBO */
  const fastHit = hits(h, FOOD_NOT_APPLICABLE);
  const foodHit = hits(h, FOOD_KNOWN);
  if (fastHit) signals.FOOD = { status: 'NOT_APPLICABLE', note: `dalla chat: «${fastHit}»` };
  else if (foodHit) signals.FOOD = { status: 'KNOWN', note: `dalla chat: «${foodHit}»` };

  /* ALLENAMENTO — il riposo vince sull'allenamento se compaiono entrambi:
     «oggi niente palestra» contiene «palestra», ma dice l'opposto. */
  const restHit = hits(h, WORKOUT_REST);
  const workoutHit = hits(h, WORKOUT_KNOWN);
  if (restHit) signals.WORKOUT = { status: 'NOT_APPLICABLE', note: `dalla chat: «${restHit}»` };
  else if (workoutHit) signals.WORKOUT = { status: 'KNOWN', note: `dalla chat: «${workoutHit}»` };

  /* UMORE — fino a 3, come impone GB §11. */
  for (const [id, words] of Object.entries(MOOD_WORDS) as [MoodInputId, string[]][]) {
    if (moods.length >= 3) break;
    if (hits(h, words)) moods.push(id);
  }
  if (moods.length > 0) {
    signals.MOOD = { status: 'KNOWN', note: `dalla chat: ${moods.join(' · ').toLowerCase()}` };
  }

  /* Malattia dichiarata: è una giornata da raccontare, non una pausa. Se non
     hai già detto qualcosa sull'allenamento, il riposo si dà per scontato. */
  const ill = hits(h, ILLNESS);
  if (ill && !signals.WORKOUT) {
    signals.WORKOUT = { status: 'NOT_APPLICABLE', note: `dalla chat: «${ill}»` };
  }

  return { signals, moods, absence: hits(h, ABSENCE) };
}

/** Etichette leggibili di cosa è stato registrato, per la riga sotto al messaggio. */
export function extractionLabels(e: Extraction): string[] {
  const out: string[] = [];
  if (e.signals.FOOD) out.push('CIBO');
  if (e.signals.WORKOUT) out.push('ALLENAMENTO');
  if (e.signals.MOOD) out.push('UMORE');
  return out;
}
