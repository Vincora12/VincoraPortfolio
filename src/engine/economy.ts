/* ============================================================================
   ECONOMIA XP / ELEGGIBILITÀ MINDLINE

   ┌───────────────────────────────────────────────────────────────────────┐
   │  PROVISIONAL — NOT CANONICAL                                          │
   │  §18 marca 🟡 "Exact XP cost/economy for CONTINUE / EVOLVE and         │
   │  cadence/eligibility for BRANCH". Tutti i numeri di questo file sono   │
   │  parametri di lavoro, NON il canone. Sono raccolti in un unico         │
   │  oggetto e modificabili a runtime dal pannello DEV, così si possono    │
   │  tarare senza toccare il codice.                                      │
   └───────────────────────────────────────────────────────────────────────┘

   Regole che invece NON sono negoziabili:
   • §3 il livello non diminuisce mai.
   • §3 salute e punteggi di gioco restano separati.
   • §7.2 CONTINUE spende XP per restare con lo stesso .mon.
   • §7.3 BRANCH è un addio, non un reroll gratuito.
   ========================================================================= */

export interface EconomyConfig {
  /** XP base per il primo CONTINUE/EVOLVE. */
  evolveBaseCost: number;
  /** Moltiplicatore applicato a ogni stadio successivo. */
  evolveCostGrowth: number;
  /** XP guadagnati per un giorno con dati registrati. */
  xpPerLoggedDay: number;
  /** XP extra per un giorno con allenamento. */
  xpPerWorkout: number;
  /** XP per una memoria significativa. */
  xpPerMemory: number;
  /** XP necessari per salire di livello (soglia moltiplicata per il livello). */
  xpPerLevel: number;
  /** Giorni minimi con lo stesso .mon prima che un BRANCH sia possibile. */
  branchMinDaysWithMon: number;
  /** Bond minimo (0–1) sotto il quale il BRANCH è comunque consentito. */
  branchLowBondThreshold: number;
  /** Bond guadagnato per interazione. */
  bondPerInteraction: number;
  /** Evolution sync guadagnato per giorno registrato. */
  syncPerLoggedDay: number;
}

/** 🟡 PROVISIONAL — valori di partenza, da tarare col playtest (§18). */
export const DEFAULT_ECONOMY: EconomyConfig = {
  evolveBaseCost: 400,
  evolveCostGrowth: 1.6,
  xpPerLoggedDay: 35,
  xpPerWorkout: 45,
  xpPerMemory: 60,
  xpPerLevel: 500,
  branchMinDaysWithMon: 14,
  branchLowBondThreshold: 0.25,
  bondPerInteraction: 0.02,
  syncPerLoggedDay: 0.035,
};

/** Costo di CONTINUE/EVOLVE per il prossimo stadio. */
export function evolveCost(cfg: EconomyConfig, currentStage: number): number {
  return Math.round(cfg.evolveBaseCost * cfg.evolveCostGrowth ** currentStage);
}

/** Livello derivato dagli XP totali. Non scende mai: è funzione monotona. */
export function levelFromXp(cfg: EconomyConfig, totalXpEarned: number): number {
  return 1 + Math.floor(totalXpEarned / cfg.xpPerLevel);
}

export interface EligibilityResult {
  eligible: boolean;
  /** Motivo leggibile, mostrato nella schermata 11 MINDLINE SHIFT. */
  reason: string;
  /** Quanto manca, 0–1, per le barre segmentate. */
  progress: number;
}

/** §7.2 — CONTINUE/EVOLVE: serve XP sufficiente e sync completo. */
export function continueEligibility(
  cfg: EconomyConfig,
  xp: number,
  evolutionSync: number,
  currentStage: number,
  forced: boolean,
): EligibilityResult {
  const cost = evolveCost(cfg, currentStage);

  if (forced) {
    return { eligible: true, reason: 'Forzato da DEV', progress: 1 };
  }
  if (evolutionSync < 1) {
    return {
      eligible: false,
      reason: `Evolution sync al ${Math.round(evolutionSync * 100)}%. Serve il 100%.`,
      progress: evolutionSync,
    };
  }
  if (xp < cost) {
    return {
      eligible: false,
      reason: `Servono ${cost} XP, ne hai ${xp}.`,
      progress: xp / cost,
    };
  }
  return { eligible: true, reason: `Costo: ${cost} XP`, progress: 1 };
}

/**
 * §7.3 — BRANCH: è un addio. Va reso possibile ma non banale.
 * Due strade: aver passato abbastanza tempo insieme, oppure aver constatato
 * che il legame non è cresciuto (il percorso è finito prima).
 */
export function branchEligibility(
  cfg: EconomyConfig,
  daysWithMon: number,
  bond: number,
  forced: boolean,
): EligibilityResult {
  if (forced) {
    return { eligible: true, reason: 'Forzato da DEV', progress: 1 };
  }
  if (bond <= cfg.branchLowBondThreshold) {
    return {
      eligible: true,
      reason: 'Il legame non è cresciuto: la deviazione è già aperta.',
      progress: 1,
    };
  }
  if (daysWithMon < cfg.branchMinDaysWithMon) {
    return {
      eligible: false,
      reason: `${daysWithMon} giorni insieme su ${cfg.branchMinDaysWithMon}.`,
      progress: daysWithMon / cfg.branchMinDaysWithMon,
    };
  }
  return { eligible: true, reason: 'La Mindline mostra una deviazione.', progress: 1 };
}
