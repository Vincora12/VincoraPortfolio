/* ============================================================================
   QUANTO STA COSTANDO (MASTER SPEC v1.9 §18.1)

   §18 chiedeva già di «log cost by request/subsystem in DEV». Questo è quel
   registro.

   Vive fuori da zustand di proposito: è telemetria di sviluppo, non stato di
   prodotto. Se finisse nello store verrebbe persistito insieme alla partita,
   comparirebbe negli export e diventerebbe una cosa da migrare a ogni cambio
   di schema — per un dato che a fine sessione non interessa più a nessuno.

   ⚠️ I prezzi sono **stimati e cablati qui**. Sono l'unico numero del progetto
   che non posso verificare dal codice: cambiano quando vuole chi vende il
   modello, non quando cambia il repository. Vanno ricontrollati sul listino
   prima di dargli retta per qualsiasi decisione, ed è per questo che la
   schermata DEV li dichiara come stime invece di scrivere un totale in euro
   come se fosse una fattura.
   ========================================================================= */

/** Da dove è partita la chiamata. Serve a sapere COSA costa, non solo quanto. */
export type UsageSubsystem = 'introduction' | 'reply' | 'photo' | 'image';

export interface UsageEntry {
  subsystem: UsageSubsystem;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Stima in dollari, con i prezzi qui sotto. */
  cost: number;
  at: number;
}

/**
 * 🟡 Prezzi per milione di token. Da ricontrollare: sono una fotografia, non
 * una fonte di verità. La chiave `default` copre i modelli non elencati, così
 * un modello nuovo produce una stima approssimata invece di zero — che
 * sembrerebbe «gratis» ed è la bugia peggiore delle due.
 */
export const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  default: { input: 5, output: 25 },
};

function priceFor(model: string): { input: number; output: number } {
  const key = Object.keys(PRICES).find((k) => k !== 'default' && model.startsWith(k));
  return PRICES[key ?? 'default']!;
}

const entries: UsageEntry[] = [];
const listeners = new Set<() => void>();

export function recordUsageEntry(
  subsystem: UsageSubsystem,
  model: string,
  inputTokens: number,
  outputTokens: number,
): void {
  const p = priceFor(model);
  entries.push({
    subsystem,
    model,
    inputTokens,
    outputTokens,
    cost: (inputTokens / 1e6) * p.input + (outputTokens / 1e6) * p.output,
    at: Date.now(),
  });
  listeners.forEach((l) => l());
}

export function subscribeToUsage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface UsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  bySubsystem: { subsystem: UsageSubsystem; calls: number; cost: number }[];
}

export function usageTotals(): UsageTotals {
  const bySubsystem = new Map<UsageSubsystem, { calls: number; cost: number }>();
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;

  for (const e of entries) {
    inputTokens += e.inputTokens;
    outputTokens += e.outputTokens;
    cost += e.cost;
    const acc = bySubsystem.get(e.subsystem) ?? { calls: 0, cost: 0 };
    bySubsystem.set(e.subsystem, { calls: acc.calls + 1, cost: acc.cost + e.cost });
  }

  return {
    calls: entries.length,
    inputTokens,
    outputTokens,
    cost,
    bySubsystem: [...bySubsystem.entries()]
      .map(([subsystem, v]) => ({ subsystem, ...v }))
      .sort((a, b) => b.cost - a.cost),
  };
}

/** Le ultime chiamate, per vedere cosa è appena successo. */
export function recentUsage(n = 12): UsageEntry[] {
  return entries.slice(-n).reverse();
}

export function clearUsage(): void {
  entries.length = 0;
  listeners.forEach((l) => l());
}

/** In dollari, con abbastanza cifre da non leggere «0.00» su una chiamata sola. */
export function formatCost(usd: number): string {
  if (usd === 0) return '$0';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
