/* ============================================================================
   IL TETTO DI SPESA (MASTER SPEC v1.13 §19.2)

   🔷 Deciso insieme: **30 € al mese**. Circa il triplo della stima per l'uso
   quotidiano, così una settimana pesante non lascia mai il .mon muto, ma una
   cosa che parte da sola e non si ferma più si ferma qui.

   ⚠️ IL TETTO VIVE SUL SERVER, E NON È UN DETTAGLIO. Un limite nel browser lo
   aggira chiunque apra gli strumenti da sviluppatore — e soprattutto non
   protegge dall'unico scenario che conta davvero: qualcuno che ha trovato
   l'indirizzo delle funzioni e non passa dalla tua app per niente.

   🔒 E questo NON sostituisce il limite nella console del fornitore. Sono due
   reti a maglia diversa:

     questo        ferma l'app quando ha speso troppo, e sa dirti PERCHÉ
     la console    ferma tutto, anche una chiave finita in mano ad altri

   Quello della console è l'ultimo muro e va messo comunque. Questo è quello
   che ti fa scoprire il problema il giorno stesso invece che a fine mese.
   ========================================================================= */

import { getStore } from '@netlify/blobs';

/** Il tetto, in dollari: i listini sono in dollari, e convertire due volte
    introduce solo un errore. 30 € ≈ 34,6 $ al cambio di agosto 2026. */
export const MONTHLY_CAP_USD = 34.6;

/**
 * Sotto questa soglia si continua ma si avvisa: la UI lo mostra, così
 * il mese non finisce con una sorpresa.
 */
export const WARN_AT = 0.75;

/* --- Listini ---------------------------------------------------------------
   🟡 Stimati e cablati, come in `src/ai/usage.ts`. Cambiano quando vuole chi
   vende il modello, non quando cambia questo repository: vanno ricontrollati
   prima di prendere una decisione basata su questi numeri.
   -------------------------------------------------------------------------- */

interface Price {
  /** Dollari per milione di token in ingresso. */
  input: number;
  output: number;
  /** Dollari per immagine, per i modelli che generano immagini. */
  perImage?: number;
}

const PRICES: Record<string, Price> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  /* Moonshot sconta la cache del 90% come Anthropic, quindi la formula di
     `costOf` vale identica. ⚠️ Ma solo perché l'adattatore SOTTRAE i token in
     cache da quelli in ingresso: lì arrivano già sommati, e senza quella
     sottrazione questa riga conterebbe due volte lo stesso pezzo. */
  'kimi-k3': { input: 3, output: 15 },
  'gpt-image-1': { input: 0, output: 0, perImage: 0.04 },
};

/* Un modello sconosciuto non costa zero: costa come il più caro che
   conosciamo. Sembra pessimismo ed è l'unica scelta sicura — sottostimare un
   modello nuovo significa sfondare il tetto senza accorgersene, e «gratis» è
   la bugia peggiore che un contatore possa dire. */
const UNKNOWN: Price = { input: 5, output: 25, perImage: 0.08 };

function priceFor(model: string): Price {
  const key = Object.keys(PRICES).find((k) => model.startsWith(k));
  return key ? PRICES[key]! : UNKNOWN;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  images?: number;
  /** Ricerche sul web fatte dal fornitore dentro la richiesta. */
  webSearches?: number;
}

/* ⚠️ Le ricerche NON passano dal conteggio dei token: sono un costo a parte,
   dieci dollari ogni mille. Un tetto che guardasse solo i token le lascerebbe
   passare tutte, e sarebbe un buco proprio nello strumento che il modello ha
   più voglia di usare. */
export const COST_PER_WEB_SEARCH = 0.01;

export function costOf(model: string, usage: Usage): number {
  const p = priceFor(model);
  return (
    ((usage.inputTokens ?? 0) / 1e6) * p.input +
    ((usage.cacheReadTokens ?? 0) / 1e6) * p.input * 0.1 +
    ((usage.cacheWriteTokens ?? 0) / 1e6) * p.input * 1.25 +
    ((usage.outputTokens ?? 0) / 1e6) * p.output +
    (usage.images ?? 0) * (p.perImage ?? 0) +
    (usage.webSearches ?? 0) * COST_PER_WEB_SEARCH
  );
}

/* --- Il contatore ----------------------------------------------------------
   Una chiave per mese: il mese nuovo riparte da zero da solo, senza che
   nessuno debba ricordarsi di azzerare niente.
   -------------------------------------------------------------------------- */

export interface Ledger {
  month: string;
  usd: number;
  calls: number;
  /** Per capire DOVE sono finiti i soldi, non solo quanti. */
  byCapability: Record<string, number>;
}

const store = () => getStore('vinzmon-spend');

export function currentMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function readLedger(month = currentMonth()): Promise<Ledger> {
  const raw = await store().get(month, { type: 'json' });
  const l = raw as Ledger | null;
  return l ?? { month, usd: 0, calls: 0, byCapability: {} };
}

export interface CapState {
  ledger: Ledger;
  /** Ha sfondato: non si chiama più niente finché non cambia il mese. */
  blocked: boolean;
  /** Sopra la soglia d'avviso: si continua, ma lo si dice. */
  warning: boolean;
  remainingUsd: number;
}

export async function checkCap(): Promise<CapState> {
  const ledger = await readLedger();
  return {
    ledger,
    blocked: ledger.usd >= MONTHLY_CAP_USD,
    warning: ledger.usd >= MONTHLY_CAP_USD * WARN_AT,
    remainingUsd: Math.max(0, MONTHLY_CAP_USD - ledger.usd),
  };
}

/**
 * Aggiunge una spesa al registro del mese.
 *
 * ⚠️ Due richieste in volo insieme possono leggere lo stesso totale e
 * sovrascriversi, perdendo una delle due. È una corsa vera e la lascio: la
 * conseguenza è aver contato qualche centesimo in meno una volta ogni tanto,
 * su un tetto da trenta euro. Il rimedio serio sarebbe un contatore atomico o
 * una coda — cioè un pezzo di infrastruttura in più da mantenere, per un
 * errore che il controllo del mese successivo assorbe da solo.
 *
 * Se un giorno l'app diventa di più persone, questa nota va riletta: lì la
 * corsa smette di essere un centesimo e diventa il tetto di qualcun altro.
 */
export async function recordSpend(
  capability: string,
  model: string,
  usage: Usage,
): Promise<number> {
  const cost = costOf(model, usage);
  const ledger = await readLedger();

  ledger.usd += cost;
  ledger.calls += 1;
  ledger.byCapability[capability] = (ledger.byCapability[capability] ?? 0) + cost;

  await store().setJSON(ledger.month, ledger);
  return cost;
}
