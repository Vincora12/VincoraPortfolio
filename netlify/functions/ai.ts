/* ============================================================================
   LA PORTA (MASTER SPEC v1.13 §19)

   Tutto quello che l'app chiede a un'AI passa da qui. Il browser non vede mai
   una chiave, non sa quale fornitore ha risposto, e non può spendere più del
   tetto — perché il tetto sta prima della chiamata, non dopo.

   L'ordine dei controlli non è casuale, ed è la parte che conta di questo
   file:

     1. sei autorizzato?      ← prima di tutto: chi non lo è non deve nemmeno
                                far fare al server il lavoro di leggere il body
     2. c'è ancora budget?    ← prima di chiamare, non dopo aver speso
     3. la richiesta è sana?  ← tetti sulla dimensione, contro l'errore onesto
     4. allora si chiama

   ⚠️ Il passo 2 va prima del 3 di proposito. Un mese sfondato deve rispondere
   «no» nel modo più economico possibile: non c'è motivo di validare bene una
   richiesta che comunque non partirà.
   ========================================================================= */

import { authorize, denied, json } from './_shared/auth';
import { ROUTING, type Capability } from './_shared/routing';
import {
  callProvider,
  generateImage,
  type SystemBlock,
  type ToolDef,
  type Turn,
} from './_shared/providers';
import { checkCap, recordSpend, MONTHLY_CAP_USD } from './_shared/spend';

/* Tetti sulla richiesta. Non difendono da un attacco — chi ha il token può
   fare richieste legittime finché il budget regge — difendono dall'errore
   onesto: un ciclo nell'app che allega tutta la cronologia, una foto da otto
   megabyte. Sono la differenza fra «ho speso venti centesimi per sbaglio» e
   «ho finito il mese in un pomeriggio». */
const LIMITS = {
  systemChars: 24_000,
  userChars: 12_000,
  turns: 24,
  imageBytes: 5 * 1024 * 1024,
  maxTokens: 4000,
  /* Gli strumenti sono pochi e li scrive l'app, non l'utente: il tetto serve
     solo a fermare un ciclo che li duplica. */
  tools: 12,
  toolChars: 8_000,
};

interface Payload {
  capability?: string;
  system?: SystemBlock[];
  turns?: Turn[];
  user?: string;
  userBlocks?: Record<string, unknown>[];
  image?: { mediaType: string; data: string };
  thinking?: boolean;
  maxTokens?: number;
  tools?: ToolDef[];
  webSearch?: boolean;
  /** Solo per `image`. */
  prompt?: string;
}

const KNOWN: Capability[] = ['character-voice', 'vision-quick', 'text-cheap', 'image'];

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'solo POST' }, 405);

  const auth = authorize(request);
  if (!auth.ok) {
    // Il motivo va nei log del server, dove lo leggi tu. Mai nella risposta.
    console.warn('[ai] richiesta rifiutata:', auth.reason);
    return denied();
  }

  const cap = await checkCap();
  if (cap.blocked) {
    /* 402 e non 500: non è un guasto, è una decisione. L'app deve poterla
       distinguere da un errore vero e dirti cosa è successo, invece di
       ripiegare in silenzio sulla voce deterministica e lasciarti pensare
       che il modello sia rotto. */
    return json(
      {
        error: 'tetto mensile raggiunto',
        spentUsd: cap.ledger.usd,
        capUsd: MONTHLY_CAP_USD,
        month: cap.ledger.month,
      },
      402,
    );
  }

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return json({ error: 'body non leggibile' }, 400);
  }

  const capability = payload.capability as Capability;
  if (!KNOWN.includes(capability)) return json({ error: 'capacità sconosciuta' }, 400);

  const route = ROUTING[capability];

  /* --- Immagini: forma di risposta diversa, percorso diverso --- */

  if (capability === 'image') {
    const prompt = (payload.prompt ?? '').trim();
    if (prompt.length === 0 || prompt.length > LIMITS.systemChars) {
      return json({ error: 'prompt assente o troppo lungo' }, 400);
    }

    const result = await generateImage(route.model, prompt);
    if (result.ok) await recordSpend(capability, route.model, result.usage);

    if (!result.ok) {
      console.warn('[ai] immagine non generata:', result.error);
      return json({ error: 'immagine non generata' }, 502);
    }
    return json({ image: result.data, warning: cap.warning });
  }

  /* --- Testo --- */

  const system = payload.system ?? [];
  const turns = (payload.turns ?? []).slice(-LIMITS.turns);
  const user = payload.user ?? '';
  const userBlocks = payload.userBlocks ?? [];

  const systemChars = system.reduce((n, b) => n + (b.text?.length ?? 0), 0);
  if (systemChars > LIMITS.systemChars) return json({ error: 'system troppo lungo' }, 413);
  if (user.length > LIMITS.userChars) return json({ error: 'messaggio troppo lungo' }, 413);
  if (user.trim().length === 0 && userBlocks.length === 0) {
    return json({ error: 'messaggio vuoto' }, 400);
  }
  if (JSON.stringify(userBlocks).length > LIMITS.userChars) {
    return json({ error: 'risultati degli strumenti troppo lunghi' }, 413);
  }

  const tools = payload.tools ?? [];
  if (tools.length > LIMITS.tools) return json({ error: 'troppi strumenti' }, 413);
  if (JSON.stringify(tools).length > LIMITS.toolChars) {
    return json({ error: 'strumenti troppo lunghi' }, 413);
  }

  /* 🔒 La ricerca sul web si accende SOLO dove la conversazione è già di
     quel fornitore. Accenderla altrove vorrebbe dire mandare la domanda —
     che può contenere qualunque cosa tu abbia appena scritto — da qualcun
     altro, e la tabella delle capacità esiste apposta per non farlo di
     nascosto. */
  const webSearch = Boolean(payload.webSearch) && route.provider === 'anthropic';

  if (payload.image) {
    // base64 gonfia di un terzo: si stima la dimensione vera prima di
    // spedirla, altrimenti il tetto lo scopre il fornitore al posto nostro.
    const bytes = Math.floor((payload.image.data?.length ?? 0) * 0.75);
    if (bytes > LIMITS.imageBytes) return json({ error: 'immagine troppo grande' }, 413);
  }

  const result = await callProvider(route.provider, {
    model: route.model,
    system,
    turns,
    user,
    userBlocks,
    image: payload.image,
    thinking: Boolean(payload.thinking),
    tools,
    webSearch,
    maxTokens: Math.min(payload.maxTokens ?? 2000, LIMITS.maxTokens),
  });

  /* Si registra anche quando la risposta è vuota o rifiutata: il fornitore ha
     comunque letto l'ingresso e lo fa pagare. Un contatore che segna solo i
     successi è un contatore che sottostima proprio nei giorni storti. */
  if (result.usage.inputTokens || result.usage.outputTokens || result.usage.webSearches) {
    await recordSpend(capability, result.model, result.usage);
  }

  if (!result.ok) {
    console.warn('[ai] risposta non utilizzabile:', result.error);
    return json({ error: 'risposta non disponibile' }, 502);
  }

  return json({
    text: result.text,
    /* Il server non esegue niente: dice quali strumenti il modello vuole e
       lascia fare al browser, che è l'unico posto dove i dati esistono. */
    toolUses: result.toolUses,
    stopReason: result.stopReason,
    model: result.model,
    usage: result.usage,
    warning: cap.warning,
    remainingUsd: cap.remainingUsd,
  });
}

export const config = { path: '/api/ai' };
