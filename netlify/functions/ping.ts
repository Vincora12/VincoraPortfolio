/* ============================================================================
   LA RICHIESTA ARRIVA DAVVERO? (§19.5)

   🔷 «Non arriva proprio la richiesta su ChatGPT API.»

   ⚠️ E FINORA NON C'ERA MODO DI SAPERLO. Quando `DAMMI IL PROMPT` falliva,
   tutte queste cose davano lo stesso schermo che gira:

     • la chiave non è configurata          → non parte niente
     • la chiave è configurata ma sbagliata → parte e torna 401
     • il NOME DEL MODELLO non esiste       → parte, torna 400, e sul cruscotto
                                              di OpenAI non compare NIENTE,
                                              perché una richiesta rifiutata
                                              non è una richiesta pagata
     • il fornitore ci mette troppo         → parte, arriva, e Netlify uccide
                                              la funzione prima della risposta

   La terza è la più cattiva delle quattro, ed è quella che assomiglia di più a
   «non arriva proprio»: da fuori si vede un errore e un cruscotto vuoto.

   🔒 QUESTA FUNZIONE CHIEDE L'ELENCO DEI MODELLI, e con una domanda sola le
   separa tutte. L'elenco non consuma token, non costa niente, e risponde in un
   secondo — quindi non può fallire per il motivo che stiamo indagando.

   ⚠️ E c'è un motivo per cui i nomi vanno chiesti invece che controllati da
   me: i modelli escono dopo il codice che li chiama. Un nome che ho scritto io
   guardando una tabella è una cosa che CREDO; l'elenco che torna dal tuo
   account è una cosa che è vera in questo momento, per la tua chiave.

   🔒 Non torna mai una chiave, né un pezzo. Torna: risponde sì o no, la
   accetta sì o no, il nome c'è o non c'è.
   ========================================================================= */

import { authorize, denied, json } from './_shared/auth';
import {
  COMPILER_CHOICES,
  IMAGE_CHOICES,
  ROUTING,
  VOICE_CHOICES,
  type Provider,
} from './_shared/routing';

/* Quattro secondi a fornitore, tutti in parallelo. Il tetto della piattaforma
   è dieci: una diagnosi che si fa uccidere dallo stesso limite che sta
   diagnosticando non serve a niente. */
const TIMEOUT_MS = 4000;

interface Probe {
  provider: Provider;
  /** Il nome della variabile d'ambiente, per poterlo dire senza indovinare. */
  envVar: string;
  /** L'indirizzo che elenca i modelli. */
  url: string;
  headers: (key: string) => Record<string, string>;
  /** Dal corpo della risposta ai nomi dei modelli. */
  ids: (body: unknown) => string[];
}

/* ⚠️ LO STESSO HOST DELLE CHIAMATE VERE. Se questa prova andasse su un
   indirizzo diverso da quello di `providers.ts`, un esito verde non direbbe
   niente sul percorso che poi fallisce. */
const PROBES: Probe[] = [
  {
    provider: 'openai',
    envVar: 'OPENAI_API_KEY',
    url: 'https://api.openai.com/v1/models',
    headers: (key) => ({ authorization: `Bearer ${key}` }),
    ids: (b) => dataIds(b),
  },
  {
    provider: 'anthropic',
    envVar: 'ANTHROPIC_API_KEY',
    /* `limit=100`: l'elenco è paginato e il predefinito ne dà venti. Con venti,
       un modello esistente ma fuori dalla prima pagina risulterebbe assente —
       cioè la diagnosi direbbe la bugia peggiore che potesse dire. */
    url: 'https://api.anthropic.com/v1/models?limit=100',
    headers: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
    ids: (b) => dataIds(b),
  },
  {
    provider: 'moonshot',
    envVar: 'MOONSHOT_API_KEY',
    url: 'https://api.moonshot.ai/v1/models',
    headers: (key) => ({ authorization: `Bearer ${key}` }),
    ids: (b) => dataIds(b),
  },
  {
    provider: 'xai',
    envVar: 'XAI_API_KEY',
    url: 'https://api.x.ai/v1/models',
    headers: (key) => ({ authorization: `Bearer ${key}` }),
    ids: (b) => dataIds(b),
  },
  {
    provider: 'google',
    envVar: 'GOOGLE_API_KEY',
    /* Google la chiave la vuole nell'URL. È la stessa forma che usa
       `providers.ts`, e resta dentro il server. */
    url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
    headers: () => ({}),
    ids: (b) => {
      const models = (b as { models?: { name?: string }[] } | null)?.models ?? [];
      return models.map((m) => (m.name ?? '').replace(/^models\//, '')).filter(Boolean);
    },
  },
];

function dataIds(body: unknown): string[] {
  const data = (body as { data?: { id?: string }[] } | null)?.data ?? [];
  return data.map((m) => m.id ?? '').filter(Boolean);
}

/** Tutti i nomi di modello che questo progetto può chiedere a un fornitore. */
function modelsWeUse(provider: Provider): string[] {
  const all = [
    ...Object.values(ROUTING).map((r) => ({ provider: r.provider, model: r.model })),
    ...VOICE_CHOICES.map((c) => ({ provider: c.provider, model: c.model })),
    ...COMPILER_CHOICES.map((c) => ({ provider: c.provider, model: c.model })),
    ...IMAGE_CHOICES.map((c) => ({ provider: c.provider, model: c.model })),
  ];
  return [...new Set(all.filter((x) => x.provider === provider).map((x) => x.model))].sort();
}

export interface ProviderProbe {
  provider: Provider;
  envVar: string;
  /** La chiave è configurata sul server. */
  configured: boolean;
  /** Abbiamo ottenuto una risposta HTTP: la richiesta è PARTITA ed è ARRIVATA. */
  reachable: boolean;
  /** Il fornitore ha accettato la chiave. */
  authorized: boolean;
  status: number | null;
  ms: number;
  /** Cosa è andato storto, con parole sue e senza chiavi dentro. */
  error?: string;
  /** I nostri nomi di modello, e se il tuo account li conosce. */
  models: { model: string; known: boolean }[];
}

async function probe(p: Probe): Promise<ProviderProbe> {
  const key = process.env[p.envVar];
  const models = modelsWeUse(p.provider);
  const base = {
    provider: p.provider,
    envVar: p.envVar,
    configured: Boolean(key),
    models: models.map((model) => ({ model, known: false })),
  };

  if (!key) {
    return { ...base, reachable: false, authorized: false, status: null, ms: 0 };
  }

  const from = Date.now();
  try {
    const res = await fetch(p.url, {
      headers: p.headers(key),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const ms = Date.now() - from;

    if (!res.ok) {
      /* 🔒 Il testo dell'errore torna al browser, quindi si taglia. Un
         messaggio di errore non contiene la chiave, ma può contenere l'ID
         dell'organizzazione e altre cose che non c'è motivo di pubblicare. */
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      return {
        ...base,
        reachable: true,
        authorized: false,
        status: res.status,
        ms,
        error: detail || `${res.status}`,
      };
    }

    const body = (await res.json().catch(() => null)) as unknown;
    const known = new Set(p.ids(body));
    return {
      ...base,
      reachable: true,
      authorized: true,
      status: res.status,
      ms,
      models: models.map((model) => ({ model, known: known.has(model) })),
    };
  } catch (e) {
    /* Qui NON siamo arrivati: rete, DNS, o i quattro secondi scaduti. È
       l'unico esito che significa davvero «la richiesta non parte». */
    const why = e instanceof Error ? e.name : 'errore';
    return {
      ...base,
      reachable: false,
      authorized: false,
      status: null,
      ms: Date.now() - from,
      error:
        why === 'TimeoutError'
          ? `nessuna risposta in ${TIMEOUT_MS / 1000}s`
          : `non raggiungibile (${why})`,
    };
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'solo GET' }, 405);

  const auth = authorize(request);
  if (!auth.ok) {
    console.warn('[ping] richiesta rifiutata:', auth.reason);
    return denied();
  }

  const providers = await Promise.all(PROBES.map(probe));

  return json({
    providers,
    /* La riga che risponde alla domanda vera, calcolata qui e non nel browser:
       c'è almeno un fornitore configurato che ci ha risposto e ci ha accettati.
       Se questa è falsa, non è il muro dei dieci secondi — è prima. */
    anyAlive: providers.some((p) => p.configured && p.authorized),
    /* I modelli che chiediamo e che il fornitore non conosce. È la causa che
       da fuori sembra «non arriva niente», perché una richiesta rifiutata non
       compare fra quelle pagate. */
    unknownModels: providers
      .filter((p) => p.authorized)
      .flatMap((p) => p.models.filter((m) => !m.known).map((m) => `${p.provider}/${m.model}`)),
  });
}

export const config = { path: '/api/ping' };
