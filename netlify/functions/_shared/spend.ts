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

/** Il tetto di partenza, in dollari: i listini sono in dollari, e convertire
    due volte introduce solo un errore. 30 € ≈ 34,6 $ al cambio di agosto 2026.

    🔒 È il DEFAULT, non più la verità finale: se qualcuno ha scritto un tetto
    dal LAB, quello vince. La verità unica è `readMonthlyCap()`, e chiunque
    debba decidere se bloccare passa da `checkCap()`, mai da questa costante. */
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
  'kimi-k2.6': { input: 0.95, output: 4 },
  /* GPT-5.6: l'uscita costa esattamente sei volte l'ingresso su tutti i
     livelli. Terra è quello che compila i prompt. */
  'gpt-5.6-terra': { input: 2, output: 12 },
  'gpt-5.6-luna': { input: 0.2, output: 1.2 },
  'gpt-5.6-sol': { input: 5, output: 30 },
  'grok-4.6': { input: 2, output: 6 },
  /* ⚠️ Stimati e arrotondati PER ECCESSO: un contatore che sottostima è peggio
     di uno che non c'è. Dopo un giro vero, DEV → COSTI dice il numero giusto.

     🔶 `perImage` ERA 0.05 E ARROTONDAVA PER DIFETTO — il listino di agosto
     2026 dà ~$0,053 a 1024×1024 in qualità `medium`, cioè il default. La riga
     diceva «per eccesso» e faceva il contrario. Adesso il numero base è la
     qualità media e i tre livelli hanno un moltiplicatore loro. */
  'gpt-image-2': { input: 0, output: 0, perImage: 0.06 },
  'gpt-image-1': { input: 0, output: 0, perImage: 0.04 },
};

/**
 * Quanto costa un'immagine rispetto alla qualità media.
 *
 * A 1024×1024 il listino dà circa $0,006 / $0,053 / $0,211 per low / medium /
 * high. Rapportati alla media fanno un nono e quattro volte: sono i due numeri
 * che decidono se una giornata di prove costa tre euro o trenta centesimi.
 */
const QUALITY_FACTOR: Record<'low' | 'medium' | 'high', number> = {
  low: 0.12,
  medium: 1,
  high: 4,
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
  /**
   * 🔴 A QUALE QUALITÀ. Senza questa riga il tetto prezzava ogni immagine come
   * `medium`, e una bozza — che costa circa un nono — veniva contata nove
   * volte il vero. Un tetto che sovrastima si chiude con settimane di
   * anticipo, che è lo stesso danno di uno che sottostima solo dall'altro
   * lato: in tutti e due i casi il numero non descrive più la realtà.
   */
  imageQuality?: 'low' | 'medium' | 'high';
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
    (usage.images ?? 0) * (p.perImage ?? 0) * QUALITY_FACTOR[usage.imageQuality ?? 'medium'] +
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
  /** Dettaglio persistente delle stesse chiamate già incluse negli aggregati. */
  events: UsageEvent[];
}

export interface UsageEvent {
  id: string;
  timestamp: string;
  capability: string;
  action: string;
  subsystem: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  images: number;
  imageQuality?: 'low' | 'medium' | 'high';
  webSearches: number;
  estimatedCostUsd: number;
  /* 🔷 LAB INFORMATION ARCHITECTURE CLEANUP — «prefer a run/creation id if
     available; if none exists, implement the smallest safe correlation
     metadata for FUTURE runs; do not fabricate historical totals.»

     🔒 NESSUNA CORRELAZIONE ESISTEVA PRIMA DI QUESTO CAMPO — verificato: né
     `UsageEvent` né `SpendEventMeta` portavano un id di run o il nome del
     .mon. Gli eventi VECCHI restano senza `monName` per sempre — ed è
     onesto che sia così, non si inventa un raggruppamento che non c'era. Da
     adesso in poi, ogni chiamata che sa per quale creatura sta lavorando
     (resolver, bio, immagini) lo dichiara qui: basta a raggruppare il
     costo dell'ULTIMA creatura forgiata, senza una tabella di correlazione
     a parte. */
  monName?: string;
}

export interface SpendEventMeta {
  action?: string;
  subsystem?: string;
  provider?: string;
  monName?: string;
}

const store = () => getStore('vinzmon-spend');

export function currentMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function readLedger(month = currentMonth()): Promise<Ledger> {
  const raw = await store().get(month, { type: 'json' });
  const l = raw as Ledger | null;
  return l
    ? { ...l, events: Array.isArray(l.events) ? l.events : [] }
    : { month, usd: 0, calls: 0, byCapability: {}, events: [] };
}

/* --- Il tetto configurabile -------------------------------------------------
   🔴 IL TETTO ERA UNA COSTANTE, e cambiarlo voleva dire ripubblicare. Il LAB
   mostrava i costi ma non il muro che li ferma: si scopriva il muro solo
   sbattendoci contro, con un messaggio che per giunta somigliava a quello del
   fornitore.

   ⚠️ UNA VERITÀ SOLA. Il valore vive QUI, sul server, in uno store suo — non
   nel browser, che chiunque riscrive, e non dentro `vinzmon-spend`, che è il
   registro degli EVENTI ECONOMICI e non deve ospitare configurazione. Il LAB
   legge e scrive esattamente questo, e `checkCap()` legge esattamente questo.
   Se un giorno divergono, uno dei due sta mentendo — e non ci deve essere un
   secondo posto da cui possano divergere.
   -------------------------------------------------------------------------- */

const CONFIG_STORE = 'vinzmon-config';
const CAP_KEY = 'monthly-cap';

/** Il minimo è zero — «chiudi tutto» è una scelta legittima, non un errore. */
export const CAP_MIN_USD = 0;
/** Il massimo NON è una comodità: è la rete contro il dito che scivola. Un
    tetto da cinquemila dollari non è un tetto, è l'assenza di un tetto. */
export const CAP_MAX_USD = 500;

export interface MonthlyCap {
  usd: number;
  /** `runtime` = scritto dal LAB · `default` = la costante qui sopra. */
  source: 'runtime' | 'default';
  updatedAt?: string;
}

/* `strong`: il tetto cambiato dal LAB deve valere alla chiamata SUCCESSIVA,
   non fra qualche secondo. Un limite che entra in vigore quando gli pare non
   è un limite di cui ci si può fidare. */
const configStore = () => getStore({ name: CONFIG_STORE, consistency: 'strong' });

/** Il numero è valido? Stessa domanda per il server e per la UI, una risposta
    sola: così il LAB non può proporre un valore che il server rifiuta. */
export function validMonthlyCap(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= CAP_MIN_USD
    && value <= CAP_MAX_USD;
}

export async function readMonthlyCap(): Promise<MonthlyCap> {
  try {
    const raw = await configStore().get(CAP_KEY, { type: 'json' }) as
      { monthlyCapUsd?: unknown; updatedAt?: unknown } | null;
    if (validMonthlyCap(raw?.monthlyCapUsd)) {
      return {
        usd: raw!.monthlyCapUsd as number,
        source: 'runtime',
        ...(typeof raw!.updatedAt === 'string' ? { updatedAt: raw!.updatedAt } : {}),
      };
    }
  } catch (error) {
    /* Se lo store non risponde si torna al default, che è il valore PRUDENTE.
       Mai «nessun tetto»: un guasto della configurazione non deve diventare
       un permesso di spendere. */
    console.warn('[spend] tetto configurato non leggibile, uso il default:', error);
  }
  return { usd: MONTHLY_CAP_USD, source: 'default' };
}

export async function writeMonthlyCap(value: number): Promise<MonthlyCap> {
  if (!validMonthlyCap(value)) throw new Error('tetto non valido');
  const updatedAt = new Date().toISOString();
  await configStore().setJSON(CAP_KEY, { monthlyCapUsd: value, updatedAt });
  return { usd: value, source: 'runtime', updatedAt };
}

export interface CapState {
  ledger: Ledger;
  /** Il tetto EFFETTIVO applicato a questa decisione, non il default. */
  capUsd: number;
  capSource: MonthlyCap['source'];
  /** Ha sfondato: non si chiama più niente finché non cambia il mese. */
  blocked: boolean;
  /** Sopra la soglia d'avviso: si continua, ma lo si dice. */
  warning: boolean;
  remainingUsd: number;
}

export async function checkCap(): Promise<CapState> {
  const [ledger, cap] = await Promise.all([readLedger(), readMonthlyCap()]);
  return {
    ledger,
    capUsd: cap.usd,
    capSource: cap.source,
    blocked: ledger.usd >= cap.usd,
    warning: ledger.usd >= cap.usd * WARN_AT,
    remainingUsd: Math.max(0, cap.usd - ledger.usd),
  };
}

/* --- Due muri diversi con lo stesso rumore -----------------------------------
   🔴 «The quota has been exceeded.» — questa frase NON è mai stata nostra: è
   il fornitore che ha finito il credito. Ma dallo schermo somigliava
   esattamente al nostro tetto, e i due si riparano in due modi opposti:

     INTERNAL_CAP_EXCEEDED   l'abbiamo deciso noi → si alza il tetto dal LAB
     PROVIDER_QUOTA_EXCEEDED l'ha deciso il fornitore → si ricarica il credito

   Alzare il nostro tetto quando è il fornitore a essere a secco non serve a
   niente, e viceversa. Da qui in poi il codice tecnico lo dice, e finisce nel
   Runtime Log dove si può leggere dopo.
   -------------------------------------------------------------------------- */

export const INTERNAL_CAP_EXCEEDED = 'INTERNAL_CAP_EXCEEDED';
export const PROVIDER_QUOTA_EXCEEDED = 'PROVIDER_QUOTA_EXCEEDED';

/**
 * Riconosce nella risposta del fornitore un esaurimento di credito o di
 * frequenza. 🔒 Guarda SOLO il testo dell'errore: non tocca chiavi, non
 * registra nulla, non porta segreti in giro.
 */
export function looksLikeProviderQuota(error: string | undefined): boolean {
  if (!error) return false;
  return /quota|insufficient_quota|billing|rate.?limit|credit balance|exceeded your current/i.test(error);
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
  meta: SpendEventMeta = {},
): Promise<number> {
  const cost = costOf(model, usage);
  const ledger = await readLedger();

  ledger.usd += cost;
  ledger.calls += 1;
  ledger.byCapability[capability] = (ledger.byCapability[capability] ?? 0) + cost;
  const provider = meta.provider ?? (
    model.startsWith('claude-') ? 'anthropic' :
      model.startsWith('gemini-') ? 'google' :
        model.startsWith('kimi-') ? 'moonshot' :
          model.startsWith('grok-') ? 'xai' : 'openai'
  );
  ledger.events.push({
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    capability,
    action: meta.action ?? capability,
    subsystem: meta.subsystem ?? capability,
    provider,
    model,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    cacheReadTokens: usage.cacheReadTokens ?? 0,
    cacheWriteTokens: usage.cacheWriteTokens ?? 0,
    images: usage.images ?? 0,
    ...(usage.imageQuality ? { imageQuality: usage.imageQuality } : {}),
    webSearches: usage.webSearches ?? 0,
    estimatedCostUsd: cost,
    ...(meta.monName ? { monName: meta.monName } : {}),
  });

  await store().setJSON(ledger.month, ledger);
  return cost;
}
