/* ============================================================================
   RARITÀ (§15, §16, §25, §26)

   Tre meccanismi distinti, che è facile confondere:

   1. SBLOCCO (§15/§25) — quali livelli sono in gioco, in base a Mindline
      Depth, Bond, Data Confidence, giorni attivi, branch e trigger nascosto.
   2. NORMALIZZAZIONE (§26) — la probabilità dei livelli bloccati viene
      RIDISTRIBUITA proporzionalmente su quelli sbloccati. Non va persa.
   3. PUNTEGGIO (§16) — le sette componenti danno 0–100, che è un **TETTO**,
      non una garanzia: il tiro pesato avviene comunque fra i livelli
      eleggibili.

   §15 — «Rarity is not power. A COMMON may be more visually appealing or
   emotionally important than a MYTHIC.»
   §15 — «The generator never exposes exact hidden trigger logic to the player.»
   ========================================================================= */

import {
  RARITY_SCORE_COMPONENTS,
  RARITY_TIERS,
  type Rarity,
  type RarityScoreComponentId,
  type RarityTierDef,
} from './generation-config';
import type { Rng } from './rng';
import { rarityThresholds } from './rarityTuning';

/* --- 1. Sblocco (§15, §25) ------------------------------------------------- */

export interface UnlockContext {
  mindlineDepth: number;
  bond: number;
  dataConfidence: number;
  activeDays: number;
  branchCount: number;
  /** §15 — trigger nascosto per SINGULAR. Mai esposto al giocatore. */
  hiddenTriggerFired: boolean;
  /** §25 DEV://UNLOCK_ALL — solo in dev mode; §29 lo vieta in produzione. */
  devUnlockAll?: boolean;
}

export function isTierUnlocked(tier: RarityTierDef, ctx: UnlockContext): boolean {
  if (ctx.devUnlockAll) return true;
  if (!tier.unlock) return true;

  const u = tier.unlock;

  // §15 UNCOMMON: «Mindline Depth ≥ 2 OR 7 verified active days» — è un OR,
  // ed è l'unico gate del documento che non sia una congiunzione.
  if (u.minDepth !== undefined && u.minActiveDays !== undefined) {
    return ctx.mindlineDepth >= u.minDepth || ctx.activeDays >= u.minActiveDays;
  }

  if (u.minDepth !== undefined && ctx.mindlineDepth < u.minDepth) return false;
  if (u.minBond !== undefined && ctx.bond < u.minBond) return false;
  if (u.minDataConfidence !== undefined && ctx.dataConfidence < u.minDataConfidence) return false;
  if (u.minBranches !== undefined && ctx.branchCount < u.minBranches) return false;
  if (u.hiddenTrigger && !ctx.hiddenTriggerFired) return false;

  return true;
}

export function unlockedTiers(ctx: UnlockContext): RarityTierDef[] {
  return RARITY_TIERS.filter((t) => isTierUnlocked(t, ctx));
}

/* --- 2. Normalizzazione (§26) ----------------------------------------------
   Funzione pura e verificabile: le tabelle di §26 sono il test.
   -------------------------------------------------------------------------- */

export interface PoolEntry {
  rarity: Rarity;
  /** Percentuale normalizzata 0–100. */
  chance: number;
}

/**
 * Ridistribuisce proporzionalmente la quota dei livelli bloccati.
 * §26: con COMMON + UNCOMMON si ottiene 64,0 / 36,0; aggiungendo RARE
 * 53,3 / 30,0 / 16,7; e così via fino a 48/27/15/7/2,5/0,5.
 */
export function normalizePool(tiers: readonly RarityTierDef[]): PoolEntry[] {
  const total = tiers.reduce((s, t) => s + t.baseChance, 0);
  if (total === 0) return [];
  return tiers.map((t) => ({ rarity: t.id, chance: (t.baseChance / total) * 100 }));
}

/* --- 3. Punteggio (§16) ----------------------------------------------------- */

export interface RarityScoreInput {
  /** Quanti assi sono cambiati rispetto ai nodi recenti, su 5 osservati. */
  freshAxes: number;
  /** L'Affinity coincide con la Family: ridondanza, non tensione (§19). */
  affinityEqualsFamily: boolean;
  /** Combinazione taglia/ruolo controcorrente. */
  sizeRoleTension: boolean;
  /** Archetipo raro dentro la sua Family. */
  rareArchetype: boolean;
  /** 0–100: quanto i segnali recenti sono un pattern e non rumore. */
  dataConfidence: number;
  /** Varianza dei segnali: un profilo piatto non è distintivo. */
  signalSpread: number;
  heritageCount: number;
  /** Tratti ereditati davvero tradotti, non copiati. */
  heritageTranslated: number;
  /** Assi di voce che deviano dal preset di partenza (§14). */
  voiceDeviations: number;
  /** Categoria di ottica non usata di recente. */
  freshEyewear: boolean;
  freshSilhouette: boolean;
  /** §16 — traguardo, ricorrenza o pattern raro. */
  hiddenEvent: boolean;
}

export type RarityScoreBreakdown = {
  component: RarityScoreComponentId;
  points: number;
  max: number;
  it: string;
};

export interface RarityScoreResult {
  score: number;
  breakdown: RarityScoreBreakdown[];
}

export function computeRarityScore(input: RarityScoreInput): RarityScoreResult {
  const max = (id: RarityScoreComponentId) =>
    RARITY_SCORE_COMPONENTS.find((c) => c.id === id)!.max;
  const label = (id: RarityScoreComponentId) =>
    RARITY_SCORE_COMPONENTS.find((c) => c.id === id)!.it;

  // §16 novelty 0–25 — distanza dalle ripetizioni recenti.
  const novelty = (Math.min(5, input.freshAxes) / 5) * max('novelty');

  // §16 cross-axis synergy 0–20 — la ridondanza Affinity=Family toglie punti,
  // la tensione fra assi ne aggiunge (§19).
  let synergy = max('crossAxisSynergy') * 0.35;
  if (input.affinityEqualsFamily) synergy -= max('crossAxisSynergy') * 0.25;
  else synergy += max('crossAxisSynergy') * 0.25;
  if (input.sizeRoleTension) synergy += max('crossAxisSynergy') * 0.2;
  if (input.rareArchetype) synergy += max('crossAxisSynergy') * 0.2;
  synergy = clamp(synergy, 0, max('crossAxisSynergy'));

  // §16 data specificity 0–15 — serve sia fiducia nel dato sia un profilo
  // che abbia una forma: dati affidabili ma piatti non sono distintivi.
  const specificity =
    ((input.dataConfidence / 100) * 0.6 + Math.min(1, input.signalSpread / 30) * 0.4) *
    max('dataSpecificity');

  // §16 heritage transformation 0–15 — conta la traduzione, non l'eredità.
  const heritage =
    input.heritageCount === 0
      ? 0
      : (input.heritageTranslated / input.heritageCount) *
        (Math.min(3, input.heritageCount) / 3) *
        max('heritageTransformation');

  // §16 voice distinctiveness 0–10 — quante deviazioni dal preset (§14).
  const voice = (Math.min(6, input.voiceDeviations) / 6) * max('voiceDistinctiveness');

  // §16 visual distinctiveness 0–10.
  const visual =
    ((input.freshEyewear ? 0.5 : 0) + (input.freshSilhouette ? 0.5 : 0)) *
    max('visualDistinctiveness');

  // §16 hidden-event modifier 0–5.
  const hidden = input.hiddenEvent ? max('hiddenEvent') : 0;

  const breakdown: RarityScoreBreakdown[] = [
    { component: 'novelty', points: novelty, max: max('novelty'), it: label('novelty') },
    { component: 'crossAxisSynergy', points: synergy, max: max('crossAxisSynergy'), it: label('crossAxisSynergy') },
    { component: 'dataSpecificity', points: specificity, max: max('dataSpecificity'), it: label('dataSpecificity') },
    { component: 'heritageTransformation', points: heritage, max: max('heritageTransformation'), it: label('heritageTransformation') },
    { component: 'voiceDistinctiveness', points: voice, max: max('voiceDistinctiveness'), it: label('voiceDistinctiveness') },
    { component: 'visualDistinctiveness', points: visual, max: max('visualDistinctiveness'), it: label('visualDistinctiveness') },
    { component: 'hiddenEvent', points: hidden, max: max('hiddenEvent'), it: label('hiddenEvent') },
  ];

  const score = Math.round(breakdown.reduce((s, b) => s + b.points, 0));
  return { score: clamp(score, 0, 100), breakdown };
}

/**
 * §16 — il livello massimo consentito dal punteggio.
 *
 * Legge le soglie da `rarityTuning` e non da `RARITY_TIERS`: di norma sono gli
 * stessi numeri, ma il pannello DEV può spostarli per vedere cosa succede.
 */
export function tierCapFromScore(score: number): Rarity {
  const t = rarityThresholds();
  const eligible = [...RARITY_TIERS].reverse().find((tier) => score >= t[tier.id]);
  return eligible?.id ?? 'COMMON';
}

/* --- Tiro finale ------------------------------------------------------------ */

export interface RarityRoll {
  rarity: Rarity;
  score: number;
  breakdown: RarityScoreBreakdown[];
  /** Pool normalizzato dei soli livelli sbloccati (§26). */
  unlockedPool: PoolEntry[];
  /** Pool effettivo dopo il tetto di punteggio, su cui si tira davvero. */
  eligiblePool: PoolEntry[];
  cap: Rarity;
}

/* ============================================================================
   ⚠️ IL SECONDO DADO NON C'È PIÙ, PER NESSUN LIVELLO.

   C'erano DUE porte in fila e si moltiplicavano. La prima era il punteggio: la
   configurazione doveva essere abbastanza insolita da arrivare nella banda. La
   seconda era un'estrazione con le probabilità di §26 su tutti i livelli fino
   a quella banda — 48% COMMON, 27% UNCOMMON, e così via.

   Il conto era spietato. Per MYTHIC servivano un punteggio da 99° percentile E
   POI un dado da 2,5%: due volte su diecimila. Per SINGULAR, in più, il
   grilletto nascosto e un dado da 0,5%: una volta su parecchie centinaia di
   migliaia. Misurato: zero su ventimila nascite.

   E soprattutto rendeva il sistema impossibile da tarare, perché muovere una
   soglia non produceva un effetto prevedibile: veniva diluito da un'estrazione
   che ignorava quanto ti eri avvicinato.

   🔒 Adesso la rarità È la banda in cui cade il punteggio, limitata da quello
   che hai sbloccato. Una regola sola, in una riga, che si può spiegare a
   qualcuno e che risponde in modo prevedibile quando sposti una soglia — che
   è la condizione perché il pannello DEV serva a qualcosa.

   La casualità non è sparita: sta dov'era sempre stata, dentro il punteggio.
   Novità, contraddizioni di voce, freschezza della sagoma sono tutte estratte.
   Quello che è sparito è il dado tirato DOPO, che cancellava il risultato.

   🔶 Scostamento dichiarato da §26. `normalizePool` resta esportata e resta il
   riferimento delle tabelle — è la risposta alla domanda «quanto sarebbe
   probabile ciascun livello se contassero solo gli sblocchi» — e il pannello
   DEV la mostra ancora. Non decide più il risultato.
   ========================================================================= */

export function rollRarity(
  _rng: Rng,
  ctx: UnlockContext,
  scoreInput: RarityScoreInput,
): RarityRoll {
  const { score, breakdown } = computeRarityScore(scoreInput);
  const cap = tierCapFromScore(score);
  const capIndex = RARITY_TIERS.findIndex((t) => t.id === cap);

  const unlocked = unlockedTiers(ctx);
  const unlockedPool = normalizePool(unlocked);

  // §16 — «If the score reaches a tier that is not yet unlocked … the result is
  // capped at the highest unlocked tier.» E viceversa: uno sblocco senza
  // punteggio non basta. Vale l'intersezione, e ne esce il livello più alto.
  const eligible = unlocked.filter((t) => RARITY_TIERS.findIndex((x) => x.id === t.id) <= capIndex);
  const pool = normalizePool(eligible.length > 0 ? eligible : [RARITY_TIERS[0]!]);
  const rarity = eligible.at(-1)?.id ?? 'COMMON';

  return { rarity, score, breakdown, unlockedPool, eligiblePool: pool, cap };
}

export function rarityDef(id: Rarity): RarityTierDef {
  const t = RARITY_TIERS.find((x) => x.id === id);
  if (!t) throw new Error(`Rarità sconosciuta: ${id}`);
  return t;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
