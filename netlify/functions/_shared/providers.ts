/* ============================================================================
   I TRE FORNITORI, DIETRO UNA PORTA SOLA (MASTER SPEC v1.13 §19.4)

   Ogni adattatore prende la stessa richiesta normalizzata e restituisce la
   stessa risposta normalizzata. Chi chiama non sa e non deve sapere chi ha
   risposto — se lo sapesse, cambiare fornitore tornerebbe a essere una
   modifica al codice invece di una riga in `routing.ts`.

   ⚠️ La normalizzazione NON è un livellamento al minimo comune. La richiesta
   porta anche cose che non tutti sanno fare — i blocchi di sistema con la
   cache, il ragionamento — e ogni adattatore usa quello che il suo fornitore
   offre e ignora il resto. È `routing.ts` a garantire che una capacità non
   finisca su un fornitore che le serve a metà.

   🔒 Nessun adattatore lancia verso l'alto: restituiscono un esito con
   `ok: false`. La regola di §17 — «ogni superficie AI ha un fallback» — vale
   anche qui, e una funzione serverless che esplode restituisce un 500 opaco
   che nel browser diventa indistinguibile da «internet non va».
   ========================================================================= */

import type { Provider } from './routing';
import type { Usage } from './spend';

/* --- La forma comune -------------------------------------------------------- */

export interface SystemBlock {
  text: string;
  /** Metti in cache tutto quello che sta fin qui. Ignorato da chi non sa farlo. */
  cache?: boolean;
}

/* ----------------------------------------------------------------------------
   STRUMENTI (§21)

   ⚠️ QUESTO FILE NON SA COSA FANNO GLI STRUMENTI, E NON DEVE SAPERLO.

   Qui passano solo i loro NOMI e la forma degli argomenti. Chi li esegue è il
   browser, perché è lì che vivono i dati: la storia di salute, il protocollo,
   le pagine. Un server che sapesse eseguirli dovrebbe prima farsi mandare
   tutto quanto — e sarebbe il contrario di quello che questo progetto fa.

   L'unica eccezione è la ricerca sul web, che gira dal fornitore e si risolve
   dentro la stessa chiamata: il browser non la vede nemmeno passare.
   -------------------------------------------------------------------------- */

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema degli argomenti. Opaco per questo file. */
  schema: Record<string, unknown>;
}

export interface ToolUse {
  id: string;
  name: string;
  input: unknown;
}

/**
 * Il contenuto di un turno. Una stringa nel caso normale; una lista di blocchi
 * quando ci sono dentro chiamate di strumenti e i loro risultati — che è
 * l'unico modo che il fornitore accetta per raccontargli cosa è successo.
 */
export type TurnContent = string | Record<string, unknown>[];

export interface Turn {
  role: 'user' | 'assistant';
  content: TurnContent;
}

export interface ImageInput {
  mediaType: string;
  /** base64 senza il prefisso `data:`. */
  data: string;
}

export interface ProviderRequest {
  model: string;
  system: SystemBlock[];
  turns: Turn[];
  /** L'ultimo messaggio, quello a cui si risponde. */
  user: string;
  /**
   * L'ultimo messaggio come blocchi, quando invece di parole contiene i
   * risultati degli strumenti. Se c'è, sostituisce `user`: un giro di
   * strumenti non ha un testo da mandare, ha delle risposte.
   */
  userBlocks?: Record<string, unknown>[];
  image?: ImageInput;
  maxTokens: number;
  /** Ragiona prima di rispondere. Chi non sa farlo lo ignora. */
  thinking?: boolean;
  /** Strumenti che il modello può chiamare. Li esegue il browser. */
  tools?: ToolDef[];
  /** Accendi la ricerca sul web, che gira dal fornitore. */
  webSearch?: boolean;
}

export interface ProviderResult {
  ok: boolean;
  text: string;
  usage: Usage;
  /** Il modello che ha risposto davvero: con un fallback può differire. */
  model: string;
  /** Strumenti che il modello vuole far eseguire prima di continuare. */
  toolUses: ToolUse[];
  /** Perché si è fermato. `tool_use` significa «aspetto i risultati». */
  stopReason?: string;
  /** Solo per i log del server. */
  error?: string;
}

function fail(model: string, error: string): ProviderResult {
  return { ok: false, text: '', usage: {}, model, toolUses: [], error };
}

/* --- Anthropic --------------------------------------------------------------
   L'unico che usa i blocchi di sistema separati con la cache, ed è il motivo
   per cui la voce sta qui: il briefing del personaggio non cambia mai e dal
   secondo messaggio in poi costa un decimo.
   -------------------------------------------------------------------------- */

async function anthropic(req: ProviderRequest): Promise<ProviderResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return fail(req.model, 'ANTHROPIC_API_KEY mancante');

  const content: unknown[] = [];
  if (req.userBlocks?.length) {
    content.push(...req.userBlocks);
  } else {
    if (req.image) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: req.image.mediaType, data: req.image.data },
      });
    }
    content.push({ type: 'text', text: req.user });
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens,
        fallbacks: 'default',
        output_config: { effort: 'low' },
        // Il ragionamento si spegne dove non serve: su due frasi in
        // personaggio non aggiunge niente e l'uscita si paga cinque volte
        // l'entrata. Lo decide chi chiama, non questo file.
        ...(req.thinking ? {} : { thinking: { type: 'disabled' } }),
        ...(req.tools?.length || req.webSearch
          ? {
              tools: [
                ...(req.tools ?? []).map((t) => ({
                  name: t.name,
                  description: t.description,
                  input_schema: t.schema,
                })),
                /* La ricerca gira dal fornitore: si dichiara e basta, i
                   risultati arrivano già dentro questa stessa risposta. La
                   versione con la data è quella che filtra i risultati prima
                   che entrino nel contesto — su una domanda tipo «quante
                   proteine ha X» è la differenza fra tre righe e tre pagine. */
                ...(req.webSearch ? [{ type: 'web_search_20260209', name: 'web_search' }] : []),
              ],
            }
          : {}),
        system: req.system.map((b) => ({
          type: 'text',
          text: b.text,
          ...(b.cache ? { cache_control: { type: 'ephemeral' } } : {}),
        })),
        messages: [...req.turns, { role: 'user', content }],
      }),
    });

    if (!res.ok) return fail(req.model, `anthropic ${res.status}: ${await res.text()}`);

    const body = (await res.json()) as {
      model?: string;
      stop_reason?: string;
      content?: { type: string; text?: string; id?: string; name?: string; input?: unknown }[];
      usage?: Record<string, number> & {
        server_tool_use?: { web_search_requests?: number };
      };
    };

    if (body.stop_reason === 'refusal') return fail(req.model, 'rifiuto del modello');

    const blocks = body.content ?? [];

    const text = blocks
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
      .trim();

    const toolUses: ToolUse[] = blocks
      .filter((b) => b.type === 'tool_use')
      .map((b) => ({ id: b.id ?? '', name: b.name ?? '', input: b.input ?? {} }));

    return {
      /* ⚠️ Con gli strumenti una risposta SENZA testo è normale, non un
         guasto: il modello ha chiesto di leggere una cosa prima di parlare.
         Trattarla come vuota — com'era prima — farebbe fallire ogni giro in
         cui decide di guardare i dati, che è proprio quello per cui esiste. */
      ok: text.length > 0 || toolUses.length > 0,
      text,
      toolUses,
      stopReason: body.stop_reason,
      model: body.model ?? req.model,
      usage: {
        inputTokens: body.usage?.input_tokens ?? 0,
        outputTokens: body.usage?.output_tokens ?? 0,
        cacheReadTokens: body.usage?.cache_read_input_tokens ?? 0,
        cacheWriteTokens: body.usage?.cache_creation_input_tokens ?? 0,
        webSearches: body.usage?.server_tool_use?.web_search_requests ?? 0,
      },
    };
  } catch (err) {
    return fail(req.model, String(err));
  }
}

/* --- Google -----------------------------------------------------------------
   Serve solo la lettura delle foto. I blocchi di sistema qui diventano una
   sola istruzione: Gemini non ha il concetto di più blocchi con cache, e
   fingere il contrario produrrebbe una richiesta che sembra ottimizzata e non
   lo è.
   -------------------------------------------------------------------------- */

async function google(req: ProviderRequest): Promise<ProviderResult> {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return fail(req.model, 'GOOGLE_API_KEY mancante');

  const parts: unknown[] = [];
  if (req.image) {
    parts.push({ inline_data: { mime_type: req.image.mediaType, data: req.image.data } });
  }
  parts.push({ text: req.user });

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system.map((b) => b.text).join('\n\n') }] },
          contents: [
            ...req.turns.map((t) => ({
              role: t.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: t.content }],
            })),
            { role: 'user', parts },
          ],
          generationConfig: { maxOutputTokens: req.maxTokens },
        }),
      },
    );

    if (!res.ok) return fail(req.model, `google ${res.status}: ${await res.text()}`);

    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: Record<string, number>;
    };

    const text = (body.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim();

    return {
      ok: text.length > 0,
      text,
      toolUses: [],
      model: req.model,
      usage: {
        inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  } catch (err) {
    return fail(req.model, String(err));
  }
}

/* --- Moonshot (Kimi) --------------------------------------------------------
   🔷 «Vorrei poter cambiare fornitore senza perdere quello che è l'AI.»

   L'API di Moonshot parla la lingua di OpenAI, quindi il grosso di questo
   adattatore è una TRADUZIONE: la forma normalizzata che gira in questo
   progetto è modellata su Anthropic — blocchi `tool_use` e `tool_result` — e
   qui va convertita in `tool_calls` e messaggi `role: 'tool'`.

   ⚠️ TRE TRAPPOLE, E NESSUNA DELLE TRE DÀ ERRORE QUANDO CI CASCHI.

   1. LA CACHE È IMPLICITA. Non si marca: la riconosce lui, se il prefisso è
      identico e primo. Quindi i blocchi di sistema si concatenano NELL'ORDINE
      e senza aggiungere niente in cima — il primo è il briefing, che non
      cambia mai. Metterci davanti una data e il risparmio sparisce in
      silenzio.

   2. I TOKEN IN CACHE SONO GIÀ DENTRO `prompt_tokens`. Su Anthropic sono un
      campo a parte e si sommano; qui sono compresi. Riportarli entrambi come
      arrivano vorrebbe dire contare due volte lo stesso pezzo e credere di
      spendere di più di quanto spendi — un tetto che sbaglia in questa
      direzione ti blocca l'app prima del tempo. Si sottraggono.

   3. LA RICERCA SUL WEB QUI NON C'È. `req.webSearch` viene ignorato di
      proposito invece di essere tradotto a caso: uno strumento che sembra
      esserci e non fa niente è peggio di uno che manca. `CAN.moonshot` lo
      dichiara, e la schermata che ti fa scegliere te lo dice prima.
   -------------------------------------------------------------------------- */

/** Un blocco della forma normalizzata, guardato senza fidarsi del tipo. */
type Block = Record<string, unknown>;

/** I messaggi in stile OpenAI che nascono da un turno in stile Anthropic. */
function openaiMessages(req: ProviderRequest): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [
    /* 🔒 Un solo messaggio di sistema, nell'ordine dei blocchi: è il prefisso
       su cui poggia la cache implicita. */
    { role: 'system', content: req.system.map((b) => b.text).join('\n\n') },
  ];

  const fromBlocks = (content: Block[], role: 'user' | 'assistant') => {
    const text = content
      .filter((b) => b.type === 'text')
      .map((b) => String(b.text ?? ''))
      .join('');

    const calls = content.filter((b) => b.type === 'tool_use');
    const results = content.filter((b) => b.type === 'tool_result');

    if (role === 'assistant' && calls.length > 0) {
      out.push({
        role: 'assistant',
        // `null` e non stringa vuota: con i tool_calls è la forma che l'API accetta.
        content: text.length > 0 ? text : null,
        tool_calls: calls.map((c) => ({
          id: String(c.id ?? ''),
          type: 'function',
          function: { name: String(c.name ?? ''), arguments: JSON.stringify(c.input ?? {}) },
        })),
      });
      return;
    }

    /* Ogni risultato è un messaggio a sé — non un blocco dentro a uno di
       utente, come su Anthropic. Sbagliarlo non dà errore: il modello
       semplicemente non collega mai la risposta alla domanda. */
    for (const r of results) {
      out.push({
        role: 'tool',
        tool_call_id: String(r.tool_use_id ?? ''),
        content: String(r.content ?? ''),
      });
    }

    if (results.length === 0 && text.length > 0) out.push({ role, content: text });
  };

  for (const t of req.turns) {
    if (typeof t.content === 'string') out.push({ role: t.role, content: t.content });
    else fromBlocks(t.content as Block[], t.role);
  }

  if (req.userBlocks?.length) fromBlocks(req.userBlocks as Block[], 'user');
  else if (req.user.length > 0) out.push({ role: 'user', content: req.user });

  return out;
}

async function moonshot(req: ProviderRequest): Promise<ProviderResult> {
  const key = process.env.MOONSHOT_API_KEY;
  if (!key) return fail(req.model, 'MOONSHOT_API_KEY mancante');

  try {
    const res = await fetch('https://api.moonshot.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: req.model,
        messages: openaiMessages(req),
        max_tokens: req.maxTokens,
        ...(req.tools?.length
          ? {
              tools: req.tools.map((t) => ({
                type: 'function',
                function: { name: t.name, description: t.description, parameters: t.schema },
              })),
            }
          : {}),
      }),
    });

    if (!res.ok) return fail(req.model, `moonshot ${res.status}: ${await res.text()}`);

    const body = (await res.json()) as {
      model?: string;
      choices?: {
        message?: {
          content?: string | null;
          tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
        };
        finish_reason?: string;
      }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
    };

    const message = body.choices?.[0]?.message;
    const text = (message?.content ?? '').trim();

    const toolUses: ToolUse[] = (message?.tool_calls ?? []).map((c) => ({
      id: c.id ?? '',
      name: c.function?.name ?? '',
      /* Gli argomenti arrivano come STRINGA JSON, non come oggetto. Un modello
         che tronca la risposta lascia un JSON monco: qui si preferisce uno
         strumento chiamato senza argomenti a una funzione che esplode e
         trasforma un turno in un 500. */
      input: safeJson(c.function?.arguments),
    }));

    const cached = body.usage?.prompt_tokens_details?.cached_tokens ?? 0;

    return {
      ok: text.length > 0 || toolUses.length > 0,
      text,
      toolUses,
      stopReason: body.choices?.[0]?.finish_reason,
      model: body.model ?? req.model,
      usage: {
        // ⚠️ Trappola 2: i token in cache sono GIÀ dentro `prompt_tokens`.
        inputTokens: Math.max(0, (body.usage?.prompt_tokens ?? 0) - cached),
        cacheReadTokens: cached,
        outputTokens: body.usage?.completion_tokens ?? 0,
      },
    };
  } catch (err) {
    return fail(req.model, String(err));
  }
}

function safeJson(raw: string | undefined): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/* --- OpenAI: immagini -------------------------------------------------------
   L'unica capacità che passa da qui, ed è quella su cui le prove sono già
   state fatte. Restituisce base64, non un URL: un URL scadrebbe prima che
   l'immagine sia stata importata, e ci ritroveremmo con uno slot vuoto e
   nessun errore.
   -------------------------------------------------------------------------- */

export interface ImageResult {
  ok: boolean;
  /** base64 PNG. */
  data: string;
  usage: Usage;
  error?: string;
}

export async function generateImage(model: string, prompt: string): Promise<ImageResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, data: '', usage: {}, error: 'OPENAI_API_KEY mancante' };

  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        prompt,
        size: '1024x1024',
        background: 'transparent',
        n: 1,
      }),
    });

    if (!res.ok) {
      return { ok: false, data: '', usage: {}, error: `openai ${res.status}: ${await res.text()}` };
    }

    const body = (await res.json()) as { data?: { b64_json?: string }[] };
    const data = body.data?.[0]?.b64_json ?? '';

    return { ok: data.length > 0, data, usage: { images: 1 } };
  } catch (err) {
    return { ok: false, data: '', usage: {}, error: String(err) };
  }
}

/* --- Il dispacciatore -------------------------------------------------------- */

const ADAPTERS: Record<Provider, (r: ProviderRequest) => Promise<ProviderResult>> = {
  anthropic,
  google,
  moonshot,
  // Le immagini non passano da qui: hanno una forma di risposta diversa e
  // fingere che sia la stessa produrrebbe un tipo che mente.
  openai: async (r) => fail(r.model, 'openai serve solo le immagini, via generateImage'),
};

export function callProvider(provider: Provider, req: ProviderRequest): Promise<ProviderResult> {
  return ADAPTERS[provider](req);
}
