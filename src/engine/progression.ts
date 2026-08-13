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

export type DayStatus = 'EMPTY' | 'PARTIAL' | 'SYNCED' | 'GRACE';

export interface DailySync {
  day: number;
  status: DayStatus;
  signals: Record<DailySignalKey, DailySignalEntry>;
  /** Una volta sola per giorno di calendario: è la regola anti-farming. */
  syncAwarded: boolean;
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
  if (day.status === 'GRACE') return 'GRACE';
  if (day.syncAwarded) return 'SYNCED';
  return knownSignals(day) > 0 ? 'PARTIAL' : 'EMPTY';
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

/* --- Ancora di continuità (Form Evolution) ---------------------------------- */

/**
 * 🔶 Regola decisa dopo la v1.6, che diceva solo che la nuova forma «can
 * substantially change Family, Archetype, Affinity, body plan, Fashion and
 * Mood» senza dire quanto deve restare.
 *
 * VINZ.MON è UNA entità: una Form Evolution non è una rigenerazione. Una
 * parte degli assi sopravvive e il resto cambia — «resta la Family e cambia
 * tutto il resto», oppure «resta tutto il resto e cambia solo la Family».
 *
 * Nota: questo è l'opposto della pressione di GENERATION BIBLE §23, che per i
 * branch imponeva di cambiare almeno 4 assi su 7. §23 descriveva la nascita
 * di una creatura diversa; qui è la stessa entità che si trasforma.
 */
/** Gli assi che un'ancora può tenere fermi. Sono nomi di campo di CharacterData. */
export type ContinuityAxis =
  | 'family'
  | 'family_archetype'
  | 'affinity'
  | 'size'
  | 'role'
  | 'fashion'
  | 'mood_primary';

export interface ContinuityAnchor {
  id: ContinuityAnchorId;
  /** Come si dice all'utente, in una riga. */
  it: string;
  /** Assi che sopravvivono immutati alla trasformazione. */
  keeps: readonly ContinuityAxis[];
  description: string;
}

export type ContinuityAnchorId = 'FAMILY' | 'EVERYTHING-ELSE' | 'PRESENCE';

export const CONTINUITY_ANCHORS: readonly ContinuityAnchor[] = [
  {
    id: 'FAMILY',
    it: 'resta la famiglia',
    keeps: ['family', 'family_archetype'],
    description: 'Stessa specie, tutto il resto si riconfigura.',
  },
  {
    id: 'EVERYTHING-ELSE',
    it: 'cambia solo la famiglia',
    keeps: ['affinity', 'size', 'role', 'fashion'],
    description: 'Cambia il corpo, restano i modi.',
  },
  {
    id: 'PRESENCE',
    it: 'restano presenza e ruolo',
    keeps: ['size', 'role', 'mood_primary'],
    description: 'Stessa taglia, stesso mestiere, stessa presenza.',
  },
];

export function anchorById(id: ContinuityAnchorId): ContinuityAnchor {
  return CONTINUITY_ANCHORS.find((a) => a.id === id) ?? CONTINUITY_ANCHORS[0]!;
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
