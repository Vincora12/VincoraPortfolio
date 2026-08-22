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
import { resolveRoute, type Capability } from './_shared/routing';
import {
  callProvider,
  generateImage,
  streamAnthropic,
  type SystemBlock,
  type ToolDef,
  type Turn,
  IMAGE_SIZES,
  type ImageSize,
} from './_shared/providers';
import { checkCap, recordSpend, MONTHLY_CAP_USD } from './_shared/spend';

/* Tetti sulla richiesta. Non difendono da un attacco — chi ha il token può
   fare richieste legittime finché il budget regge — difendono dall'errore
   onesto: un ciclo nell'app che allega tutta la cronologia, una foto da otto
   megabyte. Sono la differenza fra «ho speso venti centesimi per sbaglio» e
   «ho finito il mese in un pomeriggio». */
const LIMITS = {
  /* Il compilatore di prompt manda le regole del master come sistema: sono
     lunghe di natura, e tagliarle produrrebbe un compilatore a cui manca
     proprio il capitolo che stava applicando. */
  systemChars: 40_000,
  userChars: 12_000,
  /**
   * ⚠️ NON È UN TETTO, È UN ALLARME.
   *
   * 🔷 «Ma perché un limite? Ti stai incastrando da solo.» — ed era
   * l'obiezione giusta.
   *
   * `userChars` protegge da una cosa vera: un messaggio scritto da una persona
   * può contenere qualunque cosa, e un ciclo che ci allega tutta la cronologia
   * è la differenza fra venti centesimi e un mese finito in un pomeriggio.
   *
   * Ma il PROMPT COMPILATO non lo scrive nessuno: lo produce questo stesso
   * progetto, da un catalogo chiuso, con un algoritmo deterministico. La sua
   * dimensione è nota — `verify:package` la misura a ogni build e la confronta
   * proprio con questo numero. Un tetto a runtime su una cosa che genero io
   * non protegge da niente: può solo scattare quando il MIO numero è
   * sbagliato. Ed è precisamente quello che è successo — 16636 contro 12000,
   * ogni chiamata respinta con 413, il compilatore mai partito una volta.
   *
   * 🔒 Quindi questo numero non serve più a difendere il budget: da quello
   * difende `MONTHLY_CAP_USD`, che è la difesa vera e non si può aggirare.
   * Serve a far scoppiare rumorosamente un caso che, se arriva, è un BUG del
   * compilatore — frammenti duplicati, un ciclo — non qualcosa che hai fatto
   * tu. È tarato dieci volte sopra il prompt più lungo che esista.
   */
  compilerUserChars: 200_000,
  turns: 24,
  imageBytes: 5 * 1024 * 1024,
  maxTokens: 4000,
  compilerTokens: 8000,
  /* Gli strumenti sono pochi e li scrive l'app, non l'utente: il tetto serve
     solo a fermare un ciclo che li duplica. */
  tools: 12,
  toolChars: 8_000,
};

interface Payload {
  capability?: string;
  /** Solo per `image`: la forma della tavola, decisa dal tipo di asset. */
  size?: string;
  system?: SystemBlock[];
  turns?: Turn[];
  user?: string;
  userBlocks?: Record<string, unknown>[];
  image?: { mediaType: string; data: string };
  thinking?: boolean;
  maxTokens?: number;
  tools?: ToolDef[];
  /** Nome di uno degli strumenti forniti da imporre in questo giro. */
  toolChoice?: string;
  webSearch?: boolean;
  /** Solo per `image`. */
  prompt?: string;
  /** Solo per `image`: il CHARACTER MASTER da allegare, in base64. */
  reference?: string;
  /**
   * Chi deve dare la voce, se non quello predefinito.
   *
   * 🔷 «Vorrei poter cambiare fornitore senza perdere quello che è l'AI.»
   *
   * ⚠️ Arriva dal browser, quindi NON è un ordine: `resolveRoute` lo accetta
   * solo se corrisponde a una voce di `VOICE_CHOICES`. Senza quel filtro, chi
   * ha il token potrebbe far chiamare un modello che non sappiamo prezzare —
   * e il tetto di spesa smetterebbe di sapere cosa sta contando, che è il modo
   * peggiore in cui questo file possa rompersi.
   */
  voiceModel?: string;
  /** Configurazione standard inviata dal runtime assistant-ui. */
  config?: {
    modelName?: string;
    reasoningEffort?: string;
  };
  /**
   * 🔷 «Voglio far funzionare l'app con Sol.»
   *
   * Fai partire il lavoro invece di aspettarlo. Torna un identificativo, e la
   * risposta si va a riprendere con `jobId`.
   */
  background?: boolean;
  /** L'identificativo di un lavoro già partito: questa richiesta lo ritira. */
  jobId?: string;
  /** Quanto deve ragionare, quando parte in background. */
  effort?: 'none' | 'low' | 'medium' | 'high';
  /** Risposta progressiva per la chat. */
  stream?: boolean;
}

type Effort = NonNullable<Payload['effort']>;

/** Traduce la configurazione assistant-ui mantenendo i campi legacy compatibili. */
export function assistantRequestPreferences(
  config: Payload['config'],
  legacyModel?: string,
  legacyEffort?: Effort,
): { modelName?: string; effort?: Effort } {
  const requestedEffort = config?.reasoningEffort;
  const effort: Effort | undefined =
    requestedEffort === 'low' || requestedEffort === 'medium' || requestedEffort === 'high'
      ? requestedEffort
      : legacyEffort;
  const modelName = config?.modelName ?? legacyModel;
  return {
    ...(modelName ? { modelName } : {}),
    ...(effort ? { effort } : {}),
  };
}

const KNOWN: Capability[] = ['character-voice', 'vision-quick', 'text-cheap', 'image', 'prompt-compile'];

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


  /* 🔶 Qui c'era `ROUTING[capability]` secco, e la testata di questo file
     diceva che «il browser non sa quale fornitore ha risposto». Non è più
     vero, ed è un cambio di premessa voluto: da quando la voce la scegli tu,
     tenerti all'oscuro di chi sta rispondendo sarebbe nascondere una cosa che
     hai deciso. Infatti la risposta lo dice, in fondo. */
  const preferences = assistantRequestPreferences(payload.config, payload.voiceModel, payload.effort);
  const route = resolveRoute(capability, preferences.modelName);
  const selectedEffort = preferences.effort;

  /* ════════════════════════════════════════════════════════════════════════
     IL RITIRO DI UN LAVORO PARTITO PRIMA

     ⚠️ Sta QUI, prima di tutti i controlli sulla lunghezza dei messaggi: una
     richiesta che ritira non porta nessun messaggio, e farla passare dai
     controlli del corpo la farebbe rifiutare per un campo vuoto che non
     doveva esserci.
     ════════════════════════════════════════════════════════════════════ */
  if (payload.jobId) {
    const { pollBackground } = await import('./_shared/background');
    const out = await pollBackground(payload.jobId);

    /* 🔒 Si registra la spesa SOLO quando è finito. Prima non c'è niente da
       contare, e contarlo a ogni domanda «è pronto?» moltiplicherebbe il conto
       per il numero di volte che abbiamo chiesto. */
    if (out.status === 'completed' && (out.usage.inputTokens || out.usage.outputTokens)) {
      await recordSpend(capability, route.model, out.usage);
    }

    if (out.status === 'completed') {
      return json({ text: out.text, status: out.status, model: route.model, usage: out.usage });
    }
    if (out.ok) return json({ status: out.status });
    return json({ error: 'lavoro non riuscito', reason: (out.error ?? '').slice(0, 300) }, 502);
  }


  /* --- Immagini: forma di risposta diversa, percorso diverso --- */

  if (capability === 'image') {
    const prompt = (payload.prompt ?? '').trim();
    if (prompt.length === 0 || prompt.length > LIMITS.systemChars) {
      return json({ error: 'prompt assente o troppo lungo' }, 400);
    }

    /* 🔒 Una misura che non conosciamo non è un errore da 400: è una
       richiesta di un client più vecchio, o più nuovo. Si torna al quadrato,
       che è quello che si faceva prima e che va sempre bene. */
    const asked = payload.size;
    const size = IMAGE_SIZES.includes(asked as ImageSize) ? (asked as ImageSize) : undefined;

    /* 🔒 Il riferimento passa dallo stesso tetto in byte dell'import a mano:
       è un PNG che arriva dal browser, e un tetto su una cosa che arriva da
       fuori non è mai una comodità. */
    const reference = payload.reference ?? null;
    if (reference && reference.length * 0.75 > LIMITS.imageBytes) {
      return json({ error: 'immagine di riferimento troppo grande' }, 413);
    }
    const result = await generateImage(route.model, prompt, size, reference);
    if (result.ok) await recordSpend(capability, route.model, result.usage);

    if (!result.ok) {
      console.warn('[ai] immagine non generata:', result.error);
      /* 🔶 Tornava «immagine non generata» e basta, e il motivo restava solo
         nei log della funzione — che vuol dire: per sapere perché non funziona
         devi aprire il pannello di Netlify e leggere i log, cosa che dal
         telefono non fai. «Un modello che non esiste» e «l'organizzazione non
         è verificata per le immagini» sono due problemi diversi con due
         rimedi diversi, e distinguerli è tutto.

         🔒 Non è una fuga di segreti: è la risposta del FORNITORE, che non
         contiene la chiave — le API non rimandano indietro la chiave con cui
         le hai chiamate. Tagliata comunque, perché un errore lungo in una
         schermata è un errore che nessuno legge. */
      return json(
        { error: 'immagine non generata', reason: (result.error ?? '').slice(0, 300) },
        502,
      );
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
  /* 🔒 Il tetto dice DI QUANTO si è sforato. «Messaggio troppo lungo» senza
     numeri è quello che ha fatto sembrare un guasto di rete un limite mio. */
  const userCap =
    capability === 'prompt-compile' ? LIMITS.compilerUserChars : LIMITS.userChars;
  if (user.length > userCap) {
    return json(
      {
        error: 'messaggio troppo lungo',
        /* Dice DI QUANTO, e da quale dei due tetti: «messaggio troppo lungo»
           senza numeri fa sembrare un limite mio un guasto di rete. */
        reason:
          capability === 'prompt-compile'
            ? `${user.length} caratteri: è un bug del compilatore, non una cosa che hai fatto tu (allarme a ${userCap})`
            : `${user.length} caratteri contro un tetto di ${userCap}`,
      },
      413,
    );
  }
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
  const toolChoice =
    typeof payload.toolChoice === 'string' && tools.some((tool) => tool.name === payload.toolChoice)
      ? payload.toolChoice
      : undefined;
  if (payload.toolChoice && !toolChoice) {
    return json({ error: 'strumento richiesto non disponibile' }, 400);
  }

  /* 🔒 La ricerca sul web si accende SOLO dove la conversazione è già di
     quel fornitore. Accenderla altrove vorrebbe dire mandare la domanda —
     che può contenere qualunque cosa tu abbia appena scritto — da qualcun
     altro, e la tabella delle capacità esiste apposta per non farlo di
     nascosto. */
  const webSearch =
    Boolean(payload.webSearch) &&
    (route.provider === 'anthropic' || route.provider === 'openai');

  if (payload.image) {
    // base64 gonfia di un terzo: si stima la dimensione vera prima di
    // spedirla, altrimenti il tetto lo scopre il fornitore al posto nostro.
    const bytes = Math.floor((payload.image.data?.length ?? 0) * 0.75);
    if (bytes > LIMITS.imageBytes) return json({ error: 'immagine troppo grande' }, 413);
  }

  /* Streaming della chat V1. Il contesto neutrale è ammesso, mentre strumenti,
     risultati di strumenti e immagini seguiranno il loop orchestrato. */
  if (payload.stream) {
    if (route.provider !== 'anthropic') {
      return json({ error: 'streaming non disponibile per questo modello' }, 400);
    }
    if (tools.length || userBlocks.length || payload.image) {
      return json({ error: 'lo streaming accetta testo e contesto' }, 400);
    }

    const streamed = await streamAnthropic(
      {
        model: route.model,
        system,
        turns,
        user,
        webSearch,
        ...(selectedEffort ? { effort: selectedEffort } : {}),
        maxTokens: Math.min(payload.maxTokens ?? 2000, LIMITS.maxTokens),
      },
      request.signal,
    );
    if (!streamed.ok) return json({ error: 'stream non disponibile', reason: streamed.error }, 502);

    void streamed.completed.then(async ({ model, usage }) => {
      if (usage.inputTokens || usage.outputTokens) await recordSpend(capability, model, usage);
    }).catch((error) => console.warn('[ai] spesa dello stream non registrata:', error));

    return new Response(streamed.body, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
     LA PARTENZA DI UN LAVORO LUNGO

     🔷 «Voglio far funzionare l'app con Sol.»

     ⚠️ Solo OpenAI, e solo perché è l'unico dei quattro che sa tenere il filo
     per conto suo. Se un giorno la rotta di questa capacità cambiasse
     fornitore, questa richiesta tornerebbe a essere una chiamata normale
     invece di fallire: `background` è una PREFERENZA, non un requisito.
     ════════════════════════════════════════════════════════════════════ */
  if (payload.background && route.provider === 'openai') {
    const { startBackground } = await import('./_shared/background');
    const out = await startBackground({
      model: route.model,
      /* Un blocco solo, nell'ordine dei pezzi: è lo stesso prefisso su cui
         poggia la cache dell'altra strada, e la memoria del resolver è
         identica a ogni chiamata. */
      instructions: system.map((b) => b.text).join('\n\n'),
      user,
      maxTokens: Math.min(payload.maxTokens ?? 2000, LIMITS.compilerTokens),
      /* 🔒 QUI IL RAGIONAMENTO SI PUÒ CHIEDERE SUL SERIO, ed è tutto il punto:
         sulla strada sincrona `medium` significava morire a dieci secondi, e
         per questo scegliere Sol costava il doppio senza dare niente. Qui non
         c'è nessun orologio, quindi il predefinito è `medium` e non `none`. */
      effort: selectedEffort ?? 'medium',
    });

    if (!out.ok) {
      console.warn('[ai] avvio in background non riuscito:', out.error);
      return json({ error: 'avvio non riuscito', reason: (out.error ?? '').slice(0, 300) }, 502);
    }
    return json({ jobId: out.jobId, status: 'queued', model: route.model });
  }

  const result = await callProvider(route.provider, {
    model: route.model,
    system,
    turns,
    user,
    userBlocks,
    image: payload.image,
    thinking: Boolean(payload.thinking),
    ...(selectedEffort ? { effort: selectedEffort } : {}),
    tools,
    ...(toolChoice ? { toolChoice } : {}),
    webSearch,
    /* Un prompt compilato è lungo per definizione — il riferimento che
       funziona sta sui 12k caratteri — quindi questa capacità ha un tetto
       suo, più alto. */
    maxTokens: Math.min(
      payload.maxTokens ?? 2000,
      capability === 'prompt-compile' ? LIMITS.compilerTokens : LIMITS.maxTokens,
    ),
  });

  /* Si registra anche quando la risposta è vuota o rifiutata: il fornitore ha
     comunque letto l'ingresso e lo fa pagare. Un contatore che segna solo i
     successi è un contatore che sottostima proprio nei giorni storti. */
  let costUsd = 0;
  if (result.usage.inputTokens || result.usage.outputTokens || result.usage.webSearches) {
    costUsd = await recordSpend(capability, result.model, result.usage);
  }

  if (!result.ok) {
    console.warn('[ai] risposta non utilizzabile:', result.error);
    /* 🔶 Come per le immagini: il motivo torna indietro. L'avevo sistemato di
       là e lasciato muto di qua, e il compilatore è finito esattamente in
       quel buco — «chiamata fallita (error)» per tre giri. */
    return json(
      { error: 'risposta non disponibile', reason: (result.error ?? '').slice(0, 300) },
      502,
    );
  }

  return json({
    text: result.text,
    /* Il server non esegue niente: dice quali strumenti il modello vuole e
       lascia fare al browser, che è l'unico posto dove i dati esistono. */
    toolUses: result.toolUses,
    sources: result.sources,
    stopReason: result.stopReason,
    model: result.model,
    /* Chi ha risposto davvero, e se la ricerca sul web era accesa. Serve
       all'app per non promettere in schermata una cosa che questo giro non
       aveva. */
    provider: route.provider,
    webSearchOn: webSearch,
    usage: result.usage,
    costUsd,
    warning: cap.warning,
    remainingUsd: cap.remainingUsd,
  });
}

export const config = { path: '/api/ai' };
