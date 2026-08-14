/* ============================================================================
   TARATURA DELLE RARITÀ (§15/§16 + §20.1)

   🔷 «Vedo ancora che SINGULAR è una volta su tremila. Ribilancia in modo che
   quelli rari siano molto meno rari. E nel DEV mettimi un tool per modificare
   questa cosa, così posso anche io modificare un po' di valori.»

   ════════════════════════════════════════════════════════════════════════════
   ⚠️ PERCHÉ ESISTE QUESTO FILE, VISTO CHE §29 DICE «TUTTI I NUMERI IN CONFIG».

   I numeri di partenza continuano a stare in `generation-config.ts`, e sono
   loro la verità del prodotto. Questo modulo è uno STRATO DI TARATURA che vive
   solo in DEV: tiene i valori attivi, che di norma sono esattamente quelli del
   config, e li lascia spostare a mano per vedere cosa cambia.

   🔒 Due regole che non si toccano:
   • Senza pannello DEV questo modulo restituisce il config e basta. Il gioco
     vero non ha modo di finire con soglie diverse per caso.
   • Una taratura cambia le creature CHE DEVONO ANCORA NASCERE. Quelle già
     nate portano scritta la versione con cui sono venute al mondo e non si
     rileggono mai (§29).
   ════════════════════════════════════════════════════════════════════════════ */

import { RARITIES, RARITY_TIERS, type Rarity } from './generation-config';

/** La soglia di punteggio sotto cui un livello non è possibile. */
export type RarityThresholds = Record<Rarity, number>;

export const DEFAULT_THRESHOLDS: RarityThresholds = RARITIES.reduce((acc, id) => {
  acc[id] = RARITY_TIERS.find((t) => t.id === id)!.scoreMin;
  return acc;
}, {} as RarityThresholds);

let active: RarityThresholds = { ...DEFAULT_THRESHOLDS };

/** Le soglie in vigore adesso. Il motore legge SEMPRE da qui. */
export function rarityThresholds(): RarityThresholds {
  return active;
}

/** Vero se qualcuno ha spostato qualcosa: serve a marcare la traccia in DEV. */
export function isRarityTuned(): boolean {
  return RARITIES.some((id) => active[id] !== DEFAULT_THRESHOLDS[id]);
}

/**
 * Sposta una o più soglie. Rifiuta in blocco una configurazione incoerente
 * invece di applicarne metà: una scala in cui MYTHIC chiede meno di EPIC non
 * è una taratura aggressiva, è una scala rotta.
 */
export function setRarityThresholds(next: Partial<RarityThresholds>): string[] {
  const candidate = { ...active, ...next };
  const problems = thresholdProblems(candidate);
  if (problems.length === 0) active = candidate;
  return problems;
}

export function resetRarityThresholds(): void {
  active = { ...DEFAULT_THRESHOLDS };
}

/** Che cosa c'è che non va, in italiano, o lista vuota. */
export function thresholdProblems(t: RarityThresholds): string[] {
  const out: string[] = [];

  if (t.COMMON !== 0) out.push('COMMON deve restare a 0: è il livello che c’è sempre.');

  for (const id of RARITIES) {
    const v = t[id];
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      out.push(`${id}: la soglia deve stare fra 0 e 100.`);
    }
  }

  for (let i = 1; i < RARITIES.length; i++) {
    const lower = RARITIES[i - 1]!;
    const upper = RARITIES[i]!;
    if (t[upper] <= t[lower]) {
      out.push(`${upper} deve chiedere più di ${lower} (${t[upper]} contro ${t[lower]}).`);
    }
  }

  return out;
}

/* ----------------------------------------------------------------------------
   STIMA DELLA FREQUENZA

   Il pannello deve poter dire «con queste soglie MYTHIC esce così spesso»
   PRIMA che tu abbia giocato tre anni. Serve la distribuzione dei punteggi:
   la si campiona generando, non la si indovina con una formula.
   -------------------------------------------------------------------------- */

/**
 * Quante volte cade in ogni banda un campione di punteggi già misurati.
 * Prende i punteggi dall'esterno perché chi chiama sa già come procurarseli —
 * questo modulo non deve dipendere dal generatore, o si morde la coda.
 */
export function bandShares(
  scores: readonly number[],
  t: RarityThresholds = active,
): Record<Rarity, number> {
  const out = RARITIES.reduce((acc, id) => {
    acc[id] = 0;
    return acc;
  }, {} as Record<Rarity, number>);

  if (scores.length === 0) return out;

  for (const s of scores) {
    // La banda più alta la cui soglia il punteggio raggiunge.
    let band: Rarity = 'COMMON';
    for (const id of RARITIES) if (s >= t[id]) band = id;
    out[band] += 1;
  }

  for (const id of RARITIES) out[id] = out[id] / scores.length;
  return out;
}
