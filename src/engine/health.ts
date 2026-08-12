/* ============================================================================
   MODELLO DI SALUTE (§3) — mantenuto da v0.9

   FORM  — trasformazione/composizione corporea
   ATK   — forza e performance muscolare
   SPD   — movimento e attività aerobica
   DEF   — mobilità, postura, qualità del movimento
   REC   — capacità di recupero
   CARE  — nutrizione e cura di sé

   🔒 Regole non negoziabili:
   • CONDITION è lo stato del giorno, NON una stat permanente.
   • DISC è costanza/collaborazione col sistema, tenuta separata.
   • XP/LEVEL sono progressione di gioco su azioni controllabili; il livello
     non scende mai.
   • Salute e punteggi di gioco restano concettualmente e tecnicamente separati.
   • Il dato mancante è UNKNOWN, non negativo.

   Questo modulo è codice normale e deterministico (§17): niente AI qui dentro.
   ========================================================================= */

import type { HealthSample, HealthState, Signal, StatEntry, StatKey } from './types';
import { STAT_KEYS, UNKNOWN, isKnown } from './types';
import type { Rng } from './rng';
import { chance } from './rng';

/** Etichette lunghe per la schermata ME (§9 di §12). */
export const STAT_LABELS: Record<StatKey, string> = {
  FORM: 'Composizione e trasformazione del corpo',
  ATK: 'Forza e performance muscolare',
  SPD: 'Movimento e attività aerobica',
  DEF: 'Mobilità, postura, qualità del movimento',
  REC: 'Capacità di recupero',
  CARE: 'Nutrizione e cura di sé',
};

/** Stato iniziale: tutto UNKNOWN. Il sistema non sa ancora niente (§3). */
export function initialHealthState(): HealthState {
  const stats = STAT_KEYS.reduce(
    (acc, k) => {
      acc[k] = { value: UNKNOWN, delta: UNKNOWN, confidence: 0 };
      return acc;
    },
    {} as Record<StatKey, StatEntry>,
  );

  return { stats, condition: UNKNOWN, disc: UNKNOWN, history: [] };
}

export interface DayInput {
  /** Stat toccate oggi. Le altre restano com'erano (o UNKNOWN). */
  touched: Partial<Record<StatKey, number>>;
  /** Vero se l'utente ha registrato qualcosa oggi: alimenta DISC. */
  logged: boolean;
  workout: boolean;
}

/**
 * Applica un giorno di dati. Una stat non toccata NON peggiora: resta al suo
 * valore con confidenza calante, oppure resta UNKNOWN. Il dato mancante non è
 * mai una penalità (§3).
 */
export function applyDay(state: HealthState, day: number, input: DayInput): HealthState {
  const stats = { ...state.stats };

  for (const key of STAT_KEYS) {
    const prev = stats[key];
    const incoming = input.touched[key];

    if (incoming === undefined) {
      // Nessun dato: il valore resta, ma la fiducia nel dato invecchia.
      stats[key] = {
        value: prev.value,
        delta: UNKNOWN,
        confidence: Math.max(0, prev.confidence - 0.06),
      };
      continue;
    }

    const value = clamp(incoming);
    stats[key] = {
      value,
      delta: isKnown(prev.value) ? round1(value - prev.value) : UNKNOWN,
      confidence: Math.min(1, prev.confidence + 0.25),
    };
  }

  const condition = computeCondition(stats);
  const disc = computeDisc(state, input.logged);

  const sample: HealthSample = {
    day,
    stats: STAT_KEYS.reduce(
      (acc, k) => {
        acc[k] = stats[k].value;
        return acc;
      },
      {} as Record<StatKey, Signal>,
    ),
    condition,
  };

  return {
    stats,
    condition,
    disc,
    history: [...state.history, sample].slice(-365),
  };
}

/**
 * CONDITION = stato del giorno. Pesa di più il recupero, perché è la metrica
 * che descrive come stai ADESSO. Se nessun dato è noto, resta UNKNOWN: non si
 * inventa una condizione media.
 */
export function computeCondition(stats: Record<StatKey, StatEntry>): Signal {
  const weights: Record<StatKey, number> = {
    REC: 0.35,
    CARE: 0.2,
    FORM: 0.15,
    SPD: 0.12,
    DEF: 0.1,
    ATK: 0.08,
  };

  let sum = 0;
  let weight = 0;
  for (const k of STAT_KEYS) {
    const v = stats[k].value;
    if (isKnown(v)) {
      sum += v * weights[k];
      weight += weights[k];
    }
  }

  return weight === 0 ? UNKNOWN : round1(sum / weight);
}

/**
 * DISC = costanza. Sale quando registri, scende piano quando sparisci.
 * Non è una stat di salute e non entra mai in CONDITION.
 */
export function computeDisc(state: HealthState, loggedToday: boolean): Signal {
  const prev = isKnown(state.disc) ? state.disc : loggedToday ? 50 : UNKNOWN;
  if (!isKnown(prev)) return UNKNOWN;
  return clamp(round1(loggedToday ? prev + 3.5 : prev - 2));
}

/** Trend su una finestra di giorni: differenza fra prima e ultima lettura nota. */
export function trend(state: HealthState, key: StatKey, days = 7): Signal {
  const window = state.history.slice(-days).map((s) => s.stats[key]).filter(isKnown);
  if (window.length < 2) return UNKNOWN;
  return round1(window[window.length - 1]! - window[0]!);
}

/** Confidenza media sul dato, mostrata in ME (§9 di §12). */
export function overallConfidence(state: HealthState): number {
  const total = STAT_KEYS.reduce((s, k) => s + state.stats[k].confidence, 0);
  return total / STAT_KEYS.length;
}

/* --- Generazione di segnali simulati (§20.1) -------------------------------
   Serve al pannello DEV per far passare settimane senza integrazioni reali.
   È un cheat di prototipo dichiarato (§25): sostituirlo con Health/fitness
   reali non cambia nulla a valle.
   -------------------------------------------------------------------------- */

export interface SimulationBias {
  /** Spinta generale, da -1 (peggioramento) a +1 (miglioramento). */
  drift: number;
  /** Probabilità che l'utente registri qualcosa in un dato giorno. */
  logProbability: number;
  /** Probabilità di allenamento in un giorno registrato. */
  workoutProbability: number;
}

export const DEFAULT_BIAS: SimulationBias = {
  drift: 0.15,
  logProbability: 0.78,
  workoutProbability: 0.45,
};

/** Produce l'input di un giorno simulato a partire dallo stato corrente. */
export function simulateDayInput(rng: Rng, state: HealthState, bias: SimulationBias): DayInput {
  const logged = chance(rng, bias.logProbability);
  if (!logged) return { touched: {}, logged: false, workout: false };

  const workout = chance(rng, bias.workoutProbability);
  const touched: Partial<Record<StatKey, number>> = {};

  for (const key of STAT_KEYS) {
    // Non tutte le metriche vengono rilevate ogni giorno: è realistico e
    // mantiene vivi gli stati UNKNOWN.
    const measured = chance(rng, key === 'REC' || key === 'CARE' ? 0.85 : 0.6);
    if (!measured) continue;

    const base = isKnown(state.stats[key].value) ? state.stats[key].value : 45 + rng() * 15;
    const noise = (rng() - 0.5) * 7;
    const push = bias.drift * (key === 'ATK' || key === 'SPD' ? (workout ? 2.2 : 0.4) : 1);

    touched[key] = clamp(base + noise + push);
  }

  return { touched, logged, workout };
}

/* --- Utilità --------------------------------------------------------------- */

function clamp(v: number): number {
  return Math.max(0, Math.min(100, round1(v)));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Formattazione sicura per la UI: UNKNOWN non diventa mai "0". */
export function formatSignal(s: Signal, unit = ''): string {
  return isKnown(s) ? `${Math.round(s)}${unit}` : '—';
}

/** Segno del delta, con etichetta testuale: il colore non basta (§17). */
export function formatDelta(s: Signal): string {
  if (!isKnown(s)) return 'n.d.';
  if (Math.abs(s) < 0.5) return 'stabile';
  return s > 0 ? `+${Math.abs(Math.round(s))}` : `−${Math.abs(Math.round(s))}`;
}
