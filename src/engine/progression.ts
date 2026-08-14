/* ============================================================================
   PROGRESSIONE — SYNC

   🔶 SOSTITUISCE `economy.ts`. Recepisce la MASTER SPEC v1.4/v1.5, che
   sostituisce a sua volta il modello a tre valute della v1.2.

   Il vecchio modello aveva tre cose adiacenti — XP, DISC e EVOLUTION SYNC —
   e la spec dice testualmente perché non funziona: «Do not show three
   competing progress bars on Home». Adesso ce n'è una sola.

     SYNC = quanto VINZ.MON ha capito di te.

   Le due regole che tengono in piedi tutto:

   1. **Un giorno vale al massimo +1 SYNC.** Registrare dieci pasti, mandare
      cento messaggi o allenarsi due volte migliora la qualità del contesto,
      non accelera la crescita. «Never farms additional SYNC.»

   2. **La salute non compra progressione.** SYNC si guadagna presentandosi e
      raccontando la giornata, non stando bene. I dati di salute *formano* la
      creatura; non ne accelerano l'evoluzione.

   Cadenza:
     7 giorni sincronizzati → INCUBAZIONE finita, prima forma
     ogni 7 dalla forma corrente → MICRO-GROWTH (stessa forma, un dettaglio matura)
     28 dalla forma corrente → FORM EVOLUTION disponibile (offerta, non obbligo)
   ========================================================================= */

import type { Rng } from './rng';
import type { FoodGroup, MealSlot } from './protocol';

/** I tre segnali che VINZ.MON prova a capire ogni giorno (v1.5). */
export const DAILY_SIGNALS = ['FOOD', 'WORKOUT', 'MOOD'] as const;
export type DailySignalKey = (typeof DAILY_SIGNALS)[number];

export const DAILY_SIGNAL_LABELS: Record<DailySignalKey, string> = {
  FOOD: 'CIBO',
  WORKOUT: 'ALLENAMENTO',
  MOOD: 'UMORE',
};

/**
 * §v1.5 — tre stati e basta. NOT_APPLICABLE non è un buco: è una risposta.
 * «WORKOUT = REST DAY still counts as KNOWN.»
 */
export type SignalStatus = 'UNKNOWN' | 'KNOWN' | 'NOT_APPLICABLE';

export interface DailySignalEntry {
  status: SignalStatus;
  /** Cosa ha detto l'utente, o da dove arriva il dato. */
  note?: string;
}

/**
 * 🔶 GRACE — deciso dopo la v1.8, che lo elencava fra gli stati canonici (§14)
 * senza dire mai cosa lo faccia scattare.
 *
 * **GRACE è una pausa dichiarata: malattia, ricovero, giorni in cui non ci
 * sei stato. E NON dà SYNC.**
 *
 * La seconda metà è la parte che conta, ed è una scelta, non una svista:
 *
 * • SYNC misura quanti giorni VINZ.MON ha potuto leggerti, non quanto sei
 *   stato bene. Se in quei giorni non c'eri, non ti ha letto: far avanzare il
 *   contatore sarebbe raccontare una bugia sulla relazione — lo stesso peccato
 *   che §5 vieta quando proibisce di dedurre l'umore dai sensori.
 * • Se GRACE desse SYNC, la strada più corta per crescere diventerebbe
 *   dichiararsi malati. Il numero perderebbe significato in una settimana.
 *
 * E allora a cosa serve, visto che §7 dice già che saltare un giorno non
 * azzera niente? A questo: **un giorno vuoto e un giorno di pausa non sono la
 * stessa cosa da guardare**. Il primo sembra abbandono, il secondo è un pezzo
 * di vita. La progressione non cambia — aspetta, come già faceva — ma il
 * calendario smette di essere un registro di buchi.
 *
 * ⚠️ Una giornata **in cui sei malato e lo racconti** non è GRACE: è una
 * giornata normale e va sincronizzata. Stare male è esattamente il contesto
 * che questo prodotto vuole. GRACE è per i giorni in cui non hai potuto nemmeno
 * aprire l'app.
 */
export type DayStatus = 'EMPTY' | 'PARTIAL' | 'SYNCED' | 'GRACE';

/** 🔷 v1.11 §5.4 — un pasto raccontato. */
export interface MealEntry {
  /** Cosa c'era dentro, come gruppi. Vuoto è legittimo: «ho mangiato» e basta. */
  groups: FoodGroup[];
  /** Le parole con cui l'hai raccontato. */
  note: string;
  /** Vero quando il pasto è stato dedotto dall'ora invece che dalle parole. */
  fromClock?: boolean;
}

export interface DailySync {
  day: number;
  status: DayStatus;
  signals: Record<DailySignalKey, DailySignalEntry>;
  /**
   * 🔷 v1.11 §5.4 — i pasti raccontati, uno per fascia.
   *
   * ⚠️ NON entrano in `canCloseDay`. Un giorno si chiude quando i tre segnali
   * sono noti, non quando hai raccontato tutti e cinque i pasti: far dipendere
   * il SYNC dal ricordarsi la merenda trasformerebbe il prodotto in una
   * checklist da non sbagliare, che è esattamente ciò che §7 evita. I pasti
   * arricchiscono la QUALITÀ del giorno, non la sua validità.
   */
  meals: Partial<Record<MealSlot, MealEntry>>;
  /** Una volta sola per giorno di calendario: è la regola anti-farming. */
  syncAwarded: boolean;
  /** Perché era una pausa. Compare nel dettaglio del giorno. */
  graceNote?: string;
}

export function emptyDay(day: number): DailySync {
  return {
    day,
    status: 'EMPTY',
    signals: {
      FOOD: { status: 'UNKNOWN' },
      WORKOUT: { status: 'UNKNOWN' },
      MOOD: { status: 'UNKNOWN' },
    },
    meals: {},
    syncAwarded: false,
  };
}

/** Un segnale conta come noto sia quando c'è, sia quando non si applica. */
export function isSignalKnown(entry: DailySignalEntry): boolean {
  return entry.status !== 'UNKNOWN';
}

export function knownSignals(day: DailySync): number {
  return DAILY_SIGNALS.filter((k) => isSignalKnown(day.signals[k])).length;
}

/**
 * Il giorno è chiudibile quando i tre segnali richiesti sono noti. Resta
 * comunque l'utente a confermare: «the day becomes COMPLETE only when the
 * user confirms SYNC DAY».
 */
export function canCloseDay(day: DailySync): boolean {
  return knownSignals(day) === DAILY_SIGNALS.length;
}

/** Lo stato di una casella del calendario. Nessun giorno è mai «cattivo». */
export function dayStatus(day: DailySync): DayStatus {
  // Un giorno che ha già dato SYNC resta SYNCED anche se poi lo si marca come
  // pausa: il SYNC è stato guadagnato e non si toglie a posteriori.
  if (day.syncAwarded) return 'SYNCED';
  if (day.status === 'GRACE') return 'GRACE';
  return knownSignals(day) > 0 ? 'PARTIAL' : 'EMPTY';
}

/* --- Date vere ---------------------------------------------------------------
   🔶 v1.9 §14.1 — il calendario mostra date, non numeri di giorno.

   Il prototipo conta i giorni da 1 perché la simulazione deve poterli far
   scorrere; ma «GIORNO 8» non è una data, e un calendario che non dice mai
   che giorno è non è un calendario. Quindi il giorno 1 si àncora a una data
   di partenza e da lì si conta davvero, mesi e settimane compresi.

   L'ancora è la data in cui la partita è cominciata, salvata nello store. Se
   manca — partite nate prima di questa versione — si ripiega su oggi meno i
   giorni passati, che è la ricostruzione più onesta possibile.
   -------------------------------------------------------------------------- */

export function dateForDay(day: number, startISO: string | null): Date {
  const start = startISO ? new Date(startISO) : new Date();
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + (day - 1));
  return d;
}

export const MONTH_NAMES = [
  'GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO',
  'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE',
] as const;

/** Lunedì primo, come ogni calendario italiano. */
export const WEEKDAY_NAMES = ['L', 'M', 'M', 'G', 'V', 'S', 'D'] as const;

export const WEEKDAY_LONG = [
  'DOMENICA', 'LUNEDÌ', 'MARTEDÌ', 'MERCOLEDÌ', 'GIOVEDÌ', 'VENERDÌ', 'SABATO',
] as const;

/** Indice 0–6 con lunedì in testa: `getDay()` mette domenica a 0. */
export function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/* --- Cadenza ---------------------------------------------------------------- */

export const PROGRESSION = {
  /** 🔶 v1.4: erano 28. «If a day is missing, incubation does NOT reset.» */
  incubationSyncDays: 7,
  /** Stessa forma, un dettaglio matura. */
  microGrowthEvery: 7,
  /** Forma nuova. Disponibile, non obbligatoria. */
  formEvolutionAt: 28,
} as const;

export interface SyncState {
  /** Giorni sincronizzati in tutta la vita di VINZ.MON. */
  lifetime: number;
  /** Giorni sincronizzati da quando è cominciata la forma corrente. */
  inForm: number;
  /** Giorni dall'ultimo micro-growth. */
  sinceGrowth: number;
}

export function emptySync(): SyncState {
  return { lifetime: 0, inForm: 0, sinceGrowth: 0 };
}

/* ============================================================================
   IL GRILLETTO NASCOSTO (§16)

   ⚠️ NON ESISTEVA. §16 elenca fra le componenti del punteggio di rarità un
   «special milestone/anniversary/rare pattern trigger», e §15 lo pretende
   come condizione di sblocco di SINGULAR — «Hidden trigger required». Ma nel
   codice `hiddenEvent` non veniva impostato da nessuna parte: era sempre
   falso. Quindi la componente valeva zero a ogni nascita, e soprattutto lo
   sblocco di SINGULAR non poteva passare MAI.

   Non era «SINGULAR è rarissimo»: era SINGULAR è impossibile. Una delle sei
   rarità esisteva solo nelle tabelle.

   🔒 Adesso il grilletto c'è, ed è fatto di cose che sono successe davvero —
   niente dadi. Sono tutte verificabili guardando il calendario, ed è la
   condizione perché quel giorno valga più degli altri.
   ========================================================================= */

/** Traguardi che rendono una nascita un evento (§16). */
export const HIDDEN_EVENT_FORMS = [10, 25, 50, 100] as const;

export interface HiddenEventInput {
  /** Giorno di gioco della nascita. */
  day: number;
  /** Quante forme ci saranno dopo questa. */
  formNumber: number;
  /** Giorni sincronizzati in tutta la vita. */
  activeDays: number;
}

/**
 * Vero quando la nascita cade su un traguardo. Funzione pura: due partite con
 * la stessa storia ottengono lo stesso risultato, e la traccia DEV può
 * spiegare perché.
 */
export function hiddenEventFor({ day, formNumber, activeDays }: HiddenEventInput): boolean {
  // Anniversario: un anno esatto dal primo giorno.
  if (day > 0 && day % 365 === 0) return true;

  // Una forma tonda: la decima, la venticinquesima, la cinquantesima…
  if ((HIDDEN_EVENT_FORMS as readonly number[]).includes(formNumber)) return true;

  // Un anno intero senza saltare un giorno. È il pattern raro di §16: non un
  // numero alto, ma un numero SENZA BUCHI, che è tutta un'altra cosa.
  if (activeDays >= 365 && activeDays === day) return true;

  return false;
}

/** Quanto manca al prossimo evento, e quale. */
export interface NextEvent {
  kind: 'hatch' | 'micro-growth' | 'form-evolution';
  have: number;
  need: number;
  ready: boolean;
}

export function nextEvent(sync: SyncState, hatched: boolean): NextEvent {
  if (!hatched) {
    const need = PROGRESSION.incubationSyncDays;
    return { kind: 'hatch', have: sync.lifetime, need, ready: sync.lifetime >= need };
  }

  // La Form Evolution è un traguardo che resta disponibile: una volta
  // raggiunto non scade, perché l'utente può rimandarla quanto vuole.
  if (sync.inForm >= PROGRESSION.formEvolutionAt) {
    return {
      kind: 'form-evolution',
      have: sync.inForm,
      need: PROGRESSION.formEvolutionAt,
      ready: true,
    };
  }

  // Il micro-growth arriva prima e non blocca il conteggio verso la forma.
  if (sync.sinceGrowth >= PROGRESSION.microGrowthEvery) {
    return {
      kind: 'micro-growth',
      have: sync.sinceGrowth,
      need: PROGRESSION.microGrowthEvery,
      ready: true,
    };
  }

  const toGrowth = PROGRESSION.microGrowthEvery - sync.sinceGrowth;
  const toForm = PROGRESSION.formEvolutionAt - sync.inForm;

  return toGrowth <= toForm
    ? {
        kind: 'micro-growth',
        have: sync.sinceGrowth,
        need: PROGRESSION.microGrowthEvery,
        ready: false,
      }
    : {
        kind: 'form-evolution',
        have: sync.inForm,
        need: PROGRESSION.formEvolutionAt,
        ready: false,
      };
}

/** 0–1 verso il prossimo evento, per l'unica barra della Home. */
export function progressToNext(sync: SyncState, hatched: boolean): number {
  const e = nextEvent(sync, hatched);
  return Math.min(1, e.have / e.need);
}

/* --- Ancora di continuità (Form Evolution) ----------------------------------

   🔒 MASTER SPEC v1.8 §9.1. Sostituisce il modello a tre ancore fisse che avevo
   scritto prima che il documento decidesse: quello copriva solo tre punti di
   uno spazio che la spec definisce molto più largo.

   Le due regole assolute, e sono simmetriche:

     ≥ 1 asse resta fermo.      (vietato: cambia tutto → sarebbe rigenerazione)
     ≥ 1 asse cambia.           (vietato: non cambia niente → non è una forma nuova)

   In mezzo ci stanno cinque schemi, dal quasi-niente al quasi-tutto.

   🔶 Questo supera GENERATION BIBLE §23, che per i branch imponeva ≥4 assi su 7
   cambiati. §23 descriveva la nascita di una creatura DIVERSA; qui è la stessa
   entità che si trasforma, e §9.1 lo dice esplicitamente: «Update the Bible
   accordingly.»
   -------------------------------------------------------------------------- */

/** Gli assi evolvibili. Sono nomi di campo di CharacterData. */
export const EVOLVABLE_AXES = [
  'family',
  'family_archetype',
  'affinity',
  'size',
  'role',
  'fashion',
  'mood_primary',
] as const;

export type ContinuityAxis = (typeof EVOLVABLE_AXES)[number];

export type EvolutionPattern =
  | 'MINIMAL'
  | 'FOCUSED'
  | 'MAJOR'
  | 'FAMILY-ANCHORED'
  | 'FAMILY-SHIFT';

export interface ContinuityPlan {
  pattern: EvolutionPattern;
  /** Assi che sopravvivono immutati alla trasformazione. */
  keeps: readonly ContinuityAxis[];
  /** Come si dice all'utente, in una riga. */
  it: string;
}

export const PATTERN_LABELS: Record<EvolutionPattern, { it: string; description: string }> = {
  MINIMAL: {
    it: 'cambia una cosa sola',
    description: 'Un asse si riconfigura. Tutto il resto resta com’è.',
  },
  FOCUSED: {
    it: 'cambia qualcosa',
    description: 'Due o tre assi si riconfigurano.',
  },
  MAJOR: {
    it: 'cambia quasi tutto',
    description: 'La maggior parte si riconfigura, ma qualcosa resta.',
  },
  'FAMILY-ANCHORED': {
    it: 'resta la famiglia',
    description: 'Stessa specie. Tutto il resto può cambiare.',
  },
  'FAMILY-SHIFT': {
    it: 'cambia solo la famiglia',
    description: 'Cambia il corpo, restano i modi.',
  },
};

/**
 * Un archetipo appartiene a UNA Family sola (GB §4). Quindi non si può tenere
 * fermo l'archetipo lasciando libera la Family, e se la Family cambia
 * l'archetipo cambia per forza. È l'unico vincolo strutturale fra due assi, e
 * vale anche sull'edge case B di §9.1 — «Family changes while every other
 * evolvable axis remains» — dove l'archetipo è l'eccezione obbligata.
 */
function legalise(keeps: ContinuityAxis[]): ContinuityAxis[] {
  return keeps.includes('family_archetype') && !keeps.includes('family')
    ? keeps.filter((a) => a !== 'family_archetype')
    : keeps;
}

/** Estrae n assi distinti, in ordine stabile per non dipendere dal caso. */
function sample(rng: Rng, pool: readonly ContinuityAxis[], n: number): ContinuityAxis[] {
  const rest = [...pool];
  const out: ContinuityAxis[] = [];
  for (let i = 0; i < n && rest.length > 0; i++) {
    out.push(rest.splice(Math.floor(rng() * rest.length), 1)[0]!);
  }
  return EVOLVABLE_AXES.filter((a) => out.includes(a));
}

/**
 * Sceglie lo schema della prossima trasformazione e quali assi tiene fermi.
 * Puro: stesso rng, stesso piano — così la schermata può dichiarare cosa resta
 * PRIMA che l'utente decida, senza che rientrare rimescoli tutto.
 */
export function planContinuity(rng: Rng, forced?: EvolutionPattern): ContinuityPlan {
  const patterns: EvolutionPattern[] = [
    'MINIMAL',
    'FOCUSED',
    'MAJOR',
    'FAMILY-ANCHORED',
    'FAMILY-SHIFT',
  ];
  const pattern = forced ?? patterns[Math.floor(rng() * patterns.length)]!;
  const all = EVOLVABLE_AXES;

  let keeps: ContinuityAxis[];
  switch (pattern) {
    case 'MINIMAL': {
      // Un asse cambia, gli altri sei restano.
      const changing = sample(rng, all, 1);
      keeps = all.filter((a) => !changing.includes(a));
      break;
    }
    case 'FOCUSED': {
      const changing = sample(rng, all, 2 + Math.floor(rng() * 2)); // 2–3
      keeps = all.filter((a) => !changing.includes(a));
      break;
    }
    case 'MAJOR': {
      // Resta poco: uno o due assi.
      keeps = sample(rng, all, 1 + Math.floor(rng() * 2));
      break;
    }
    case 'FAMILY-ANCHORED':
      // Edge case A di §9.1: resta la Family, tutto il resto può cambiare.
      keeps = ['family'];
      break;
    case 'FAMILY-SHIFT':
      // Edge case B: cambia la Family — e con lei l'archetipo, per forza.
      keeps = ['affinity', 'size', 'role', 'fashion', 'mood_primary'];
      break;
  }

  keeps = legalise(keeps);

  // Rete di sicurezza sulle due regole assolute. Non dovrebbe mai scattare —
  // `legalise` può togliere al massimo un asse — ma se scattasse, un'ancora
  // vuota o totale violerebbe §9.1 in silenzio.
  if (keeps.length === 0) keeps = ['size'];
  if (keeps.length === all.length) keeps = keeps.filter((a) => a !== 'mood_primary');

  return { pattern, keeps, it: PATTERN_LABELS[pattern].it };
}

/**
 * Etichette leggibili per gli assi, usate dalla schermata che dichiara cosa
 * resta prima di confermare. Non è una tassonomia: è solo come si chiamano in
 * italiano le cose che l'utente vede già altrove nel profilo.
 */
export const AXIS_LABELS: Record<ContinuityAxis, string> = {
  family: 'FAMIGLIA',
  family_archetype: 'ARCHETIPO',
  affinity: 'AFFINITÀ',
  size: 'TAGLIA',
  role: 'RUOLO',
  fashion: 'STILE',
  mood_primary: 'UMORE',
};
