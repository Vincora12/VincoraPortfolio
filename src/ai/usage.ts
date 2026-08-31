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
export type UsageSubsystem = 'introduction' | 'reply' | 'photo' | 'image' | 'reflection' | 'notebook';

export interface UsageEntry {
  subsystem: UsageSubsystem;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /**
   * 🔷 v1.12 — token letti dalla cache e token scritti in cache. L'API li
   * conta SEPARATAMENTE da `inputTokens`: senza queste due righe, da quando
   * il briefing va in cache il pannello DEV mostrerebbe un conto più basso
   * del vero, perché la parte in cache sparirebbe dal totale invece di
   * costare un decimo. Un contatore che sottostima è peggio di nessun
   * contatore.
   */
  cacheReadTokens: number;
  cacheWriteTokens: number;
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
  'kimi-k3': { input: 3, output: 15 },
  'kimi-k2.6': { input: 0.95, output: 4 },
  /* 🔴 MANCAVANO TUTTI E TRE, e non era un buco innocuo.
     Senza queste righe i modelli OpenAI cadevano su `default`, cioè $5/$25 —
     e Luna costa $0,20/$1,20. Il pannello COSTI dichiarava venticinque volte
     il vero su ogni chiamata di BIO, NARRATORE, INSEGNA e PROMPT IMMAGINI,
     cioè su quasi tutto quello che gira durante una prova.

     ⚠️ Un contatore che sovrastima non è «prudente»: manda a risparmiare
     dove non serve. Guardando quei numeri la conclusione ovvia era «il testo
     mi sta prosciugando», mentre il testo costa centesimi e sono le immagini
     a pesare. Verificati sul listino di agosto 2026 — vedi `spend.ts`, che li
     aveva giusti da sempre: erano due tabelle della stessa cosa, e solo una
     era aggiornata. */
  'gpt-5.6-sol': { input: 5, output: 30 },
  'gpt-5.6-terra': { input: 2, output: 12 },
  'gpt-5.6-luna': { input: 0.2, output: 1.2 },
  'grok-4.6': { input: 2, output: 6 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  default: { input: 5, output: 25 },
};

export function priceFor(model: string): { input: number; output: number } {
  const key = Object.keys(PRICES).find((k) => k !== 'default' && model.startsWith(k));
  return PRICES[key ?? 'default']!;
}

const entries: UsageEntry[] = [];
const listeners = new Set<() => void>();

/**
 * Moltiplicatori di cache sul prezzo d'entrata. Sono listino, non stima:
 * una lettura dalla cache costa un decimo, una scrittura un quarto in più.
 */
const CACHE_READ = 0.1;
const CACHE_WRITE = 1.25;

export function recordUsageEntry(
  subsystem: UsageSubsystem,
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
): void {
  const p = priceFor(model);
  entries.push({
    subsystem,
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cost:
      (inputTokens / 1e6) * p.input +
      (cacheReadTokens / 1e6) * p.input * CACHE_READ +
      (cacheWriteTokens / 1e6) * p.input * CACHE_WRITE +
      (outputTokens / 1e6) * p.output,
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
    // I token di cache SONO token d'entrata: entrano nel conteggio, e il loro
    // prezzo diverso è già dentro `e.cost`. Tenerli fuori farebbe leggere
    // «1.150 token» a una conversazione che ne ha letti diecimila.
    inputTokens += e.inputTokens + e.cacheReadTokens + e.cacheWriteTokens;
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
