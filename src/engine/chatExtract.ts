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
import {
  ADHERENCE_LABELS,
  FOOD_GROUP_LABELS,
  adherenceOf,
  classifyFood,
  classifyWorkout,
  type Adherence,
  type DietProtocol,
  type FoodGroup,
  type WorkoutKind,
} from './protocol';

export interface ExtractedSignal {
  status: SignalStatus;
  /** La provenienza che finirà nel calendario: le parole che l'hanno prodotta. */
  note: string;
}

/** 🔶 v1.9 §5.2 — una misura riconosciuta nel testo. */
export interface ExtractedMeasure {
  stat: 'FORM' | 'REC' | 'ATK' | 'SPD';
  label: string;
  value: number;
  unit: string;
}

export interface Extraction {
  signals: Partial<Record<DailySignalKey, ExtractedSignal>>;
  moods: MoodInputId[];
  measures: ExtractedMeasure[];
  /** Un'assenza dichiarata al passato: giorni in cui non c'eri. */
  absence: string | null;
  /**
   * 🔶 v1.10 §5.3 — COSA c'era nel piatto, non solo che hai mangiato. È la
   * differenza fra un contatore e un motore: due giorni con lo stesso «sì, ho
   * mangiato» ma cibi opposti devono produrre due creature diverse.
   */
  foodGroups: FoodGroup[];
  /** Che tipo di allenamento: la stessa domanda, dall'altro lato. */
  workoutKinds: WorkoutKind[];
  /** Il confronto col protocollo dichiarato. Mai un voto: vedi `protocol.ts`. */
  adherence: Adherence;
}

export const EMPTY_EXTRACTION: Extraction = {
  signals: {},
  moods: [],
  measures: [],
  absence: null,
  foodGroups: [],
  workoutKinds: [],
  adherence: 'SCONOSCIUTA',
};

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
export function extractFromMessage(text: string, diet: DietProtocol | null = null): Extraction {
  const h = normalise(text);
  const signals: Extraction['signals'] = {};
  const moods: MoodInputId[] = [];

  /* CIBO — 🔶 v1.10 §5.3. Prima si guardava se la frase parlasse di cibo;
     adesso si guarda COSA c'era dentro. I gruppi vengono prima delle parole
     generiche perché sono più informativi: «pollo e broccoli» dice tutto senza
     contenere nessuna delle parole di `FOOD_KNOWN`. */
  const foodGroups = classifyFood(text);
  const workoutKinds = classifyWorkout(text);
  const adherence = adherenceOf(foodGroups, diet);

  const fastHit = hits(h, FOOD_NOT_APPLICABLE);
  const foodHit = hits(h, FOOD_KNOWN);

  if (fastHit) {
    signals.FOOD = { status: 'NOT_APPLICABLE', note: `dalla chat: «${fastHit}»` };
  } else if (foodGroups.length > 0) {
    // La nota dice cosa hai mangiato e, se c'è un protocollo, come si colloca.
    // Non dice se hai fatto bene: quella frase non esiste in questo prodotto.
    const what = foodGroups.map((g) => FOOD_GROUP_LABELS[g]).join(', ');
    signals.FOOD = {
      status: 'KNOWN',
      note: diet ? `${what} — ${ADHERENCE_LABELS[adherence]}` : what,
    };
  } else if (foodHit) {
    signals.FOOD = { status: 'KNOWN', note: `dalla chat: «${foodHit}»` };
  }

  /* ALLENAMENTO — il riposo vince sull'allenamento se compaiono entrambi:
     «oggi niente palestra» contiene «palestra», ma dice l'opposto. */
  const restHit = hits(h, WORKOUT_REST);
  const workoutHit = hits(h, WORKOUT_KNOWN);
  if (restHit) {
    signals.WORKOUT = { status: 'NOT_APPLICABLE', note: `dalla chat: «${restHit}»` };
  } else if (workoutKinds.length > 0) {
    signals.WORKOUT = { status: 'KNOWN', note: workoutKinds.join(' · ').toLowerCase() };
  } else if (workoutHit) {
    signals.WORKOUT = { status: 'KNOWN', note: `dalla chat: «${workoutHit}»` };
  }

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

  return {
    signals,
    moods,
    measures: extractMeasures(text),
    absence: hits(h, ABSENCE),
    foodGroups,
    workoutKinds,
    adherence,
  };
}

/* --- Misure ------------------------------------------------------------------
   🔶 v1.9 §5.2 — «registrare le mie misure ci sta». Non con un modulo: si
   scrivono nella frase e basta, «peso 78» o «dormito 6 ore».

   Le misure NON sono un quarto Daily Signal e non danno SYNC. Alimentano le
   sei stat di salute di §4, che sono un'altra cosa: la salute forma la
   creatura, non ne compra la crescita.
   -------------------------------------------------------------------------- */

const MEASURE_RULES: {
  stat: ExtractedMeasure['stat'];
  label: string;
  unit: string;
  re: RegExp;
}[] = [
  { stat: 'FORM', label: 'peso', unit: 'kg', re: /(?:peso|pesat[oi])\D{0,12}(\d{2,3}(?:[.,]\d)?)/ },
  { stat: 'FORM', label: 'peso', unit: 'kg', re: /(\d{2,3}(?:[.,]\d)?)\s*(?:kg|chili)/ },
  { stat: 'REC', label: 'sonno', unit: 'h', re: /(?:dormit[oi]|sonno)\D{0,12}(\d{1,2}(?:[.,]\d)?)/ },
  { stat: 'REC', label: 'sonno', unit: 'h', re: /(\d{1,2}(?:[.,]\d)?)\s*ore\s*(?:di\s*)?(?:sonno|dormit)/ },
  { stat: 'SPD', label: 'passi', unit: '', re: /(\d{3,6})\s*passi/ },
  { stat: 'ATK', label: 'carico', unit: 'kg', re: /(?:panca|squat|stacco)\D{0,12}(\d{2,3})/ },
];

export function extractMeasures(text: string): ExtractedMeasure[] {
  const h = normalise(text);
  const out: ExtractedMeasure[] = [];

  for (const rule of MEASURE_RULES) {
    // Una misura sola per etichetta: «peso 78 kg» non deve contarsi due volte
    // solo perché due regole diverse la riconoscono entrambe.
    if (out.some((m) => m.label === rule.label)) continue;
    const match = rule.re.exec(h);
    if (!match?.[1]) continue;
    const value = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(value)) continue;
    out.push({ stat: rule.stat, label: rule.label, value, unit: rule.unit });
  }

  return out;
}

/** Le stesse quattro parole di `ADHERENCE_LABELS`, accorciate per la riga di conferma. */
const ADHERENCE_SHORT: Record<Adherence, string> = {
  IN_LINEA: 'in linea',
  FUORI: 'fuori protocollo',
  MISTO: 'in parte fuori',
  SCONOSCIUTA: '—',
};

/** Etichette leggibili di cosa è stato registrato, per la riga sotto al messaggio. */
export function extractionLabels(e: Extraction): string[] {
  const out: string[] = [];
  if (e.signals.FOOD) {
    // 🔶 v1.10 — se c'è un protocollo, la conferma dice anche come si colloca.
    // Fra parentesi e non come voce a sé: è una qualità del segnale CIBO, non
    // un quarto segnale, e non deve sembrare una riga di punteggio.
    out.push(
      e.adherence === 'SCONOSCIUTA' ? 'CIBO' : `CIBO (${ADHERENCE_SHORT[e.adherence]})`,
    );
  }
  if (e.signals.WORKOUT) out.push('ALLENAMENTO');
  if (e.signals.MOOD) out.push('UMORE');
  for (const m of e.measures) out.push(m.label.toUpperCase());
  return out;
}

/** Vero quando dal testo non è uscito niente: serve a non fingere di aver capito. */
export function isEmptyExtraction(e: Extraction): boolean {
  return (
    Object.keys(e.signals).length === 0 && e.measures.length === 0 && e.absence === null
  );
}
