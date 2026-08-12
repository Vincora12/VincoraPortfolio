/* ============================================================================
   RARITÀ (§4, §18)

   ┌───────────────────────────────────────────────────────────────────────┐
   │  PROVISIONAL — NOT CANONICAL                                          │
   │  §18 marca 🟡 "rarity weighting". Pesi e soglie qui sotto sono una     │
   │  proposta di lavoro, regolabile a runtime dal pannello DEV.           │
   └───────────────────────────────────────────────────────────────────────┘

   §4: la rarità è "rarity of the specific generated CONFIGURATION/OUTCOME",
   non una proprietà appiccicata a una Family. Quindi non si estrae: si
   CALCOLA da quanto è improbabile la combinazione uscita.
   Il calcolo è ispezionabile in DEV (§20.1: "expose ... rarity math").
   ========================================================================= */

import { RARITY_THRESHOLDS, type Rarity } from './taxonomy';
import type { CharacterData } from './types';

/** Contributo di un singolo fattore al punteggio, mostrato in DEV. */
export interface RarityFactor {
  label: string;
  /** Contributo 0–1, già pesato. */
  contribution: number;
  /** Spiegazione leggibile per la vista di QA. */
  detail: string;
}

export interface RarityBreakdown {
  score: number;
  rarity: Rarity;
  factors: RarityFactor[];
}

/* Coppie Family × Affinity che chiedono una trasformazione anatomica insolita:
   più il materiale contraddice l'anatomia, più la configurazione è rara. */
const TENSION_PAIRS: Record<string, string[]> = {
  ANGEL: ['CHROME', 'BONE', 'CERAMIC'],
  BEAST: ['GLASS', 'PAPER', 'NEON'],
  INSECT: ['VELVET', 'LIQUID'],
  AQUATIC: ['PAPER', 'SMOKE', 'CERAMIC'],
  REPTILE: ['GLASS', 'VELVET'],
  AVIAN: ['CHROME', 'MAGNETIC'],
  CONSTRUCT: ['LIQUID', 'SMOKE', 'VELVET'],
  PLANT: ['CHROME', 'STATIC', 'NEON'],
  SPECTRE: ['CERAMIC', 'BONE'],
  AMORPHOUS: ['BONE', 'PAPER'],
};

/** Ruoli che contraddicono la taglia: un GIANT SCOUT è una configurazione strana. */
const SIZE_ROLE_TENSION: Record<string, string[]> = {
  TINY: ['GUARD', 'BUILDER'],
  GIANT: ['SCOUT', 'TRICKSTER'],
  MEDIUM: [],
};

export function computeRarity(
  data: Omit<CharacterData, 'rarity' | 'name'> & Partial<Pick<CharacterData, 'name'>>,
): RarityBreakdown {
  const factors: RarityFactor[] = [];

  // 1. Tensione Family × Affinity — il fattore più pesante: è l'asse che
  //    trasforma davvero l'anatomia (§4).
  const tense = TENSION_PAIRS[data.family]?.includes(data.affinity) ?? false;
  factors.push({
    label: 'FAMILY × AFFINITY',
    contribution: tense ? 0.3 : 0.06,
    detail: tense
      ? `${data.affinity} contraddice l'anatomia ${data.family}: trasformazione insolita`
      : `${data.affinity} è compatibile con l'anatomia ${data.family}`,
  });

  // 2. Tensione SIZE × ROLE.
  const sizeTense = SIZE_ROLE_TENSION[data.size]?.includes(data.role) ?? false;
  factors.push({
    label: 'SIZE × ROLE',
    contribution: sizeTense ? 0.18 : 0.05,
    detail: sizeTense
      ? `un ${data.role} di taglia ${data.size} è una combinazione controcorrente`
      : `${data.role} è coerente con la taglia ${data.size}`,
  });

  // 3. Appearance: TOY ed ELASTIC sono più costosi da tenere coerenti in
  //    rotazione, quindi la configurazione è più rara (§24.2).
  const appearanceWeight: Record<string, number> = { TOY: 0.14, ELASTIC: 0.12, CEL: 0.07, INK: 0.05 };
  factors.push({
    label: 'APPEARANCE',
    contribution: appearanceWeight[data.appearance] ?? 0.05,
    detail: `resa ${data.appearance}`,
  });

  // 4. Heritage: più tratti sopravvivono al branch, più il nodo è denso (§7.3).
  const h = data.heritage.length;
  factors.push({
    label: 'HERITAGE',
    contribution: h === 0 ? 0.04 : h === 1 ? 0.08 : h === 2 ? 0.14 : 0.2,
    detail: h === 0 ? 'nodo di origine, nessuna eredità' : `${h} tratti ereditati e tradotti`,
  });

  // 5. Accessori e occhiali insoliti: contributo minore, è styling (§4 priorità).
  const acc = data.fashion.accessories.length;
  factors.push({
    label: 'FASHION',
    contribution: Math.min(0.1, 0.02 + acc * 0.03),
    detail: `${data.fashion.attitude}, ${acc} accessori`,
  });

  // 6. Season presente: contesto extra sulla configurazione.
  factors.push({
    label: 'SEASON',
    contribution: data.season ? 0.07 : 0.02,
    detail: data.season ? `influenza stagionale ${data.season}` : 'nessuna influenza stagionale',
  });

  // 7. Stadio evolutivo: una forma avanzata è una configurazione più rara.
  const stage = data.evolutionState?.stage ?? 0;
  factors.push({
    label: 'EVOLUTION',
    contribution: Math.min(0.14, stage * 0.045),
    detail: stage === 0 ? 'forma iniziale' : `stadio evolutivo ${stage}`,
  });

  const score = Math.max(0, Math.min(1, factors.reduce((s, f) => s + f.contribution, 0)));
  const rarity =
    RARITY_THRESHOLDS.find((t) => score >= t.min)?.rarity ?? ('COMMON' as Rarity);

  return { score, rarity, factors };
}
