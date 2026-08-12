/* ============================================================================
   SEGNALI IN INGRESSO DEL GENERATORE (§2, §11, §22, §23)

   Il motore di §17 lavora su un vettore di segnali normalizzati 0–100. Questo
   modulo lo costruisce a partire da ciò che il prodotto misura davvero:
   salute, umori dichiarati, storia della Mindline, affinità culturali.

   §28 — nessun segnale è un giudizio morale. Un REC basso produce UNDEAD come
   esito estetico, mai come diagnosi o come punizione.
   ========================================================================= */

import {
  CULTURAL_TAGS,
  MOOD_INPUTS,
  MOOD_INPUT_RULES,
  SIGNAL_KEYS,
  type CulturalTagId,
  type MoodInputId,
  type SignalKey,
  type SignalVector,
} from './generation-config';
import { STAT_KEYS, isKnown, type HealthState, type MindlineNode } from './types';
import { overallConfidence } from './health';

/* --- Personality Seed (§2) -------------------------------------------------
   Vettori latenti stabili, seminati dalle risposte del Signal Scan e non
   ricalcolati ogni giorno: sono il temperamento, non l'umore.
   -------------------------------------------------------------------------- */

export const PERSONALITY_KEYS = [
  'curiosity', 'confidence', 'playfulness', 'social', 'discipline', 'vanity',
  'mystery', 'theatricality', 'impulsivity', 'novelty', 'patience', 'control',
  'precision', 'stoicism', 'adaptability', 'weirdness',
] as const satisfies readonly SignalKey[];

export type PersonalityKey = (typeof PERSONALITY_KEYS)[number];
export type PersonalitySeed = Record<PersonalityKey, number>;

/** Seme neutro: tutto a metà scala finché il Signal Scan non lo modella. */
export function neutralPersonality(): PersonalitySeed {
  return PERSONALITY_KEYS.reduce((acc, k) => {
    acc[k] = 50;
    return acc;
  }, {} as PersonalitySeed);
}

/* --- Mood latents (§11, §22) -----------------------------------------------
   Gli umori dichiarati NON assegnano mai direttamente il Mood della creatura:
   alimentano dimensioni latenti su finestra mobile.
   -------------------------------------------------------------------------- */

export const LATENT_KEYS = [
  'warmth', 'stress', 'irritability', 'melancholy', 'introspection', 'arousal',
  'vigilance', 'distance', 'energy', 'calm', 'affection', 'intensity',
] as const satisfies readonly SignalKey[];

export type LatentKey = (typeof LATENT_KEYS)[number];
export type MoodLatents = Record<LatentKey, number>;

/** Una giornata di umori dichiarati. §11: fino a 3 voci. */
export interface MoodDayEntry {
  day: number;
  inputs: MoodInputId[];
}

export function neutralLatents(): MoodLatents {
  return LATENT_KEYS.reduce((acc, k) => {
    acc[k] = 50;
    return acc;
  }, {} as MoodLatents);
}

/**
 * §22 — finestra di 14 giorni; gli ultimi 3 pesano il doppio; nessun singolo
 * giorno può contribuire oltre il 18% del risultato.
 *
 * Il tetto per giorno è la parte che conta: senza, una giornata isolata di
 * umore estremo determinerebbe da sola il Mood della creatura, che è
 * esattamente ciò che §11 vieta.
 */
export function computeMoodLatents(history: readonly MoodDayEntry[], today: number): MoodLatents {
  const { windowDays, recentDays, recentMultiplier, maxDayShare } = MOOD_INPUT_RULES;

  const window = history.filter((d) => today - d.day < windowDays && d.inputs.length > 0);
  if (window.length === 0) return neutralLatents();

  // Peso grezzo per giorno, poi tetto al 18% del totale.
  const raw = window.map((d) => ({
    entry: d,
    weight: today - d.day < recentDays ? recentMultiplier : 1,
  }));

  const rawTotal = raw.reduce((s, r) => s + r.weight, 0);
  const cap = rawTotal * maxDayShare;
  const capped = raw.map((r) => ({ ...r, weight: Math.min(r.weight, cap) }));
  const total = capped.reduce((s, r) => s + r.weight, 0);

  // Si parte dal neutro e ci si sposta verso i latenti dichiarati: un umore
  // mai dichiarato resta a 50, non va a zero.
  const acc = neutralLatents();
  const pull = LATENT_KEYS.reduce((m, k) => {
    m[k] = { sum: 0, weight: 0 };
    return m;
  }, {} as Record<LatentKey, { sum: number; weight: number }>);

  for (const { entry, weight } of capped) {
    // Più umori nello stesso giorno si dividono il peso di quel giorno.
    const share = weight / entry.inputs.length;
    for (const id of entry.inputs) {
      const def = MOOD_INPUTS.find((m) => m.id === id);
      if (!def) continue;
      for (const [k, v] of Object.entries(def.latents)) {
        const key = k as LatentKey;
        if (!(key in pull)) continue;
        pull[key].sum += v * share;
        pull[key].weight += share;
      }
    }
  }

  for (const k of LATENT_KEYS) {
    if (pull[k].weight === 0) continue;
    const declared = pull[k].sum / pull[k].weight;
    // La quota di finestra in cui quel latente è stato davvero toccato decide
    // quanto ci si sposta dal neutro.
    const coverage = Math.min(1, pull[k].weight / total);
    acc[k] = clamp(50 + (declared - 50) * coverage);
  }

  return acc;
}

/* --- Affinità culturali (§2) ----------------------------------------------- */

export type CulturalAffinities = Partial<Record<CulturalTagId, number>>;

/* --- Memoria di novità (§23) -----------------------------------------------
   Finestra dei 6 nodi precedenti; la penalità più forte vale sui 3.
   -------------------------------------------------------------------------- */

export interface NoveltyMemory {
  /** Family dei nodi precedenti, dal più recente. */
  recentFamilies: string[];
  recentArchetypes: string[];
  recentAffinities: string[];
  recentEyewear: string[];
  recentFashion: string[];
}

export function buildNoveltyMemory(
  nodes: readonly MindlineNode[],
  lookup: (monName: string) => {
    family: string;
    archetype: string;
    affinity: string;
    eyewear: string | null;
    fashion: string;
  } | null,
): NoveltyMemory {
  const recent = [...nodes].sort((a, b) => b.day - a.day).slice(0, 6);
  const memory: NoveltyMemory = {
    recentFamilies: [],
    recentArchetypes: [],
    recentAffinities: [],
    recentEyewear: [],
    recentFashion: [],
  };

  for (const n of recent) {
    const d = lookup(n.monName);
    if (!d) continue;
    memory.recentFamilies.push(d.family);
    memory.recentArchetypes.push(`${d.family}/${d.archetype}`);
    memory.recentAffinities.push(d.affinity);
    memory.recentFashion.push(d.fashion);
    if (d.eyewear) memory.recentEyewear.push(d.eyewear);
  }

  return memory;
}

export const EMPTY_NOVELTY: NoveltyMemory = {
  recentFamilies: [],
  recentArchetypes: [],
  recentAffinities: [],
  recentEyewear: [],
  recentFashion: [],
};

/* --- Stato completo che il generatore consuma ------------------------------ */

export interface GeneratorInput {
  day: number;
  health: HealthState;
  personality: PersonalitySeed;
  moodHistory: MoodDayEntry[];
  cultural: CulturalAffinities;
  novelty: NoveltyMemory;
  /** §2 — numero di nodi .mon completati nella run corrente. */
  mindlineDepth: number;
  /** §2 — profondità della relazione col .mon attuale, 0–100. */
  bond: number;
  /** §2 — quanto è affidabile la finestra dati recente, 0–100. */
  dataConfidence: number;
  /** Giorni con dati registrati: alimenta lo sblocco UNCOMMON (§15). */
  activeDays: number;
  /** §25 — numero di branch già avvenuti, per lo sblocco SINGULAR. */
  branchCount: number;
  season?: string;
}

/* --- Costruzione del vettore di segnali (§17) ------------------------------ */

/**
 * Assembla il vettore che le formule di fit consumano.
 * Ogni chiave di §2 finisce qui; nessuna formula può leggere altro.
 */
export function buildSignalVector(input: GeneratorInput): SignalVector {
  const latents = computeMoodLatents(input.moodHistory, input.day);

  const vec = SIGNAL_KEYS.reduce((acc, k) => {
    acc[k] = 50;
    return acc;
  }, {} as SignalVector);

  // Salute: il dato mancante resta neutro a 50, non diventa 0 (§3 MASTER SPEC).
  for (const stat of STAT_KEYS) {
    const v = input.health.stats[stat].value;
    vec[stat] = isKnown(v) ? v : 50;
  }
  vec.DISC = isKnown(input.health.disc) ? input.health.disc : 50;

  // §3 — UNDEAD legge un ANDAMENTO di recupero basso, non un giudizio.
  vec.lowREC = 100 - vec.REC;

  for (const k of PERSONALITY_KEYS) vec[k] = input.personality[k];
  for (const k of LATENT_KEYS) vec[k] = latents[k];

  // Le affinità culturali spingono i segnali a cui sono associate.
  for (const tag of CULTURAL_TAGS) {
    const weight = input.cultural[tag.id];
    if (weight === undefined) continue;
    vec[tag.signal] = clamp(Math.max(vec[tag.signal], weight));
  }

  return vec;
}

/** §17 — una formula di fit è una somma pesata sul vettore, risultato 0–100. */
export function evaluateFit(
  formula: Partial<Record<SignalKey, number>>,
  signals: SignalVector,
): number {
  let sum = 0;
  for (const [k, w] of Object.entries(formula)) {
    sum += signals[k as SignalKey] * (w as number);
  }
  return clamp(sum);
}

/* --- Data confidence aggregata (§2) ---------------------------------------- */

/** `health.ts` tiene la confidenza per singola stat; §2 ne vuole una sola. */
export function aggregateDataConfidence(health: HealthState): number {
  return Math.round(overallConfidence(health) * 100);
}

/* --- Utilità --------------------------------------------------------------- */

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}
