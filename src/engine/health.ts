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

/* ----------------------------------------------------------------------------
   ⚠️ DISC ERA UN CRICCHETTO. Saliva di 3,5 quando registravi e scendeva di 2
   quando no: con una frequenza di registrazione normale — anche solo 4 giorni
   su 5 — la somma dei passi è sempre positiva, quindi DISC arrivava a 100 e ci
   restava per sempre. Un indicatore di costanza che dice 100 a chiunque non
   sparisca per un mese non misura niente.

   Non era un difetto cosmetico: DISC pesa 0,22 nella formula di fit di MACHINE
   (§17), e valere 100 invece di ~78 regalava a quella Family una decina di
   punti di vantaggio a ogni nascita. Era la ragione per cui MACHINE usciva il
   13% delle volte contro il 3,5% di UNDEAD.

   🔒 Adesso è una MEDIA MOBILE: DISC insegue la percentuale di giorni in cui
   hai davvero registrato qualcosa. Registri tutti i giorni → tende a 100 e te
   lo sei guadagnato. Registri 5 giorni su 7 → si assesta attorno a 71, e
   risale se cambi passo. Non c'è più un valore da cui non si torna indietro.
   -------------------------------------------------------------------------- */

/** Quanto pesa il giorno di oggi sulla media. 0,06 ≈ due settimane di memoria. */
const DISC_ALPHA = 0.06;

/**
 * DISC = costanza. È la quota di giorni registrati negli ultimi ~16, non un
 * punteggio che si accumula. Non è una stat di salute e non entra mai in
 * CONDITION.
 */
export function computeDisc(state: HealthState, loggedToday: boolean): Signal {
  const prev = isKnown(state.disc) ? state.disc : loggedToday ? 50 : UNKNOWN;
  if (!isKnown(prev)) return UNKNOWN;

  const today = loggedToday ? 100 : 0;
  return clamp(round1(prev + (today - prev) * DISC_ALPHA));
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

/* 🔒 `drift` a 0,05 e non 0,15: adesso che indica DOVE si assestano le stat
   invece di quanto salgono ogni giorno, 0,15 vorrebbe dire «l'utente simulato
   sta stabilmente sopra la media», e una simulazione non deve dare per
   scontato che tu stia bene. A 0,05 l'equilibrio è 51,5 — una persona
   normale, che alcuni giorni va meglio e altri peggio. */
export const DEFAULT_BIAS: SimulationBias = {
  drift: 0.05,
  logProbability: 0.78,
  workoutProbability: 0.45,
};

/* ⚠️ ERA UNA SALITA SENZA FINE. Ogni giorno faceva `ieri + rumore + spinta`:
   il rumore è a media zero, la spinta è sempre positiva, quindi le stat
   salivano e basta. Dopo quaranta giorni simulati stavano già attorno a 63,
   e chi usa DEV → TEMPO per mesi le trova tutte a 100.

   Non era solo brutto da vedere: FORM, ATK e DEF pesano il 76% del punteggio
   di taglia (§21), quindi un corpo simulato che migliora all'infinito faceva
   uscire il 30% di creature GIANT e quasi nessuna TINY. Stesso difetto di DISC
   qui sopra — un contatore che sale e non torna — nel terzo posto in cui l'ho
   trovato.

   🔒 Adesso è una passeggiata attorno a un PUNTO DI EQUILIBRIO, e il `drift`
   dice DOVE sta quell'equilibrio invece di quanto si spinge ogni giorno. Le
   stat oscillano, rispondono agli allenamenti, e non scappano mai verso l'alto
   per il solo fatto che il tempo passa. */

/** Quanto ogni giorno avvicina la stat al suo equilibrio. 0,12 ≈ una settimana. */
const SIM_PULL = 0.12;

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

    // L'allenamento sposta l'equilibrio di ATK e SPD, non ci somma un bonus:
    // così una settimana di palestra li alza davvero e una di riposo li
    // riporta giù, invece di lasciare un credito acquisito.
    const trained = workout && (key === 'ATK' || key === 'SPD');
    const target = 50 + bias.drift * 30 + (trained ? 9 : 0);
    const noise = (rng() - 0.5) * 7;

    touched[key] = clamp(base + (target - base) * SIM_PULL + noise);
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
