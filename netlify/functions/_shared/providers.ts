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
import { costOf, type Usage } from './spend';

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

/** Una fonte realmente restituita dal fornitore, mai ricavata dal testo. */
export interface Source {
  title: string;
  url: string;
  domain?: string;
}

type AnthropicCitation = {
  type?: string;
  title?: string | null;
  url?: string;
  source?: string;
};

type AnthropicSearchResult = {
  type?: string;
  title?: string;
  url?: string;
};

type AnthropicContentBlock = {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  citations?: AnthropicCitation[];
  content?: AnthropicSearchResult[] | { type?: string; error_code?: string };
};

function domainOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function asSource(value: { title?: string | null; url?: string; source?: string }): Source | null {
  const url = value.url ?? value.source;
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const domain = domainOf(url);
  return {
    title: value.title?.trim() || domain || url,
    url,
    ...(domain ? { domain } : {}),
  };
}

function uniqueSources(sources: readonly Source[]): Source[] {
  return [...new Map(sources.map((source) => [source.url, source])).values()];
}

/** Estrae soltanto risultati/citazioni strutturati dell'API Anthropic. */
export function extractAnthropicSources(blocks: readonly AnthropicContentBlock[]): Source[] {
  const sources: Source[] = [];
  for (const block of blocks) {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const result of block.content) {
        if (result.type !== 'web_search_result') continue;
        const source = asSource(result);
        if (source) sources.push(source);
      }
    }
    for (const citation of block.citations ?? []) {
      if (citation.type !== 'web_search_result_location' && citation.type !== 'search_result_location') {
        continue;
      }
      const source = asSource(citation);
      if (source) sources.push(source);
    }
  }
  return uniqueSources(sources);
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
  /**
   * Quanto ragionare, quando lo step lo dice per esteso. Vince su `thinking`.
   *
   * 🔒 Comprende `high` anche se nessuno step lo usa oggi: il tipo qui deve
   * accettare tutto quello che il protocollo accetta, altrimenti il giorno che
   * uno step lo chiede si rompe la compilazione in un punto che non c'entra.
   */
  effort?: 'none' | 'low' | 'medium' | 'high';
  /** Strumenti che il modello può chiamare. Li esegue il browser. */
  tools?: ToolDef[];
  /** Impone uno strumento quando l'intento di scrittura è inequivocabile. */
  toolChoice?: string;
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
  /** Fonti strutturate restituite dal fornitore e realmente consultate. */
  sources: Source[];
  /** Perché si è fermato. `tool_use` significa «aspetto i risultati». */
  stopReason?: string;
  /** Solo per i log del server. */
  error?: string;
}

function fail(model: string, error: string): ProviderResult {
  return { ok: false, text: '', usage: {}, model, toolUses: [], sources: [], error };
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
        /* 🔴 ERA MURATO A `'low'`, E IGNORAVA CHI CHIAMAVA.
           `req.effort` esisteva, arrivava fin qui e non veniva letto: ogni
           chiamata Anthropic girava a sforzo basso qualunque cosa avesse
           chiesto il chiamante. Su una conversazione in personaggio non si
           notava; su un turno che deve DECIDERE di usare uno strumento sì —
           a sforzo basso il modello risponde e basta, che è la strada più
           corta. Il valore di prima resta il predefinito. */
        output_config: { effort: req.effort ?? 'low' },
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
        ...(req.toolChoice
          ? { tool_choice: { type: 'tool', name: req.toolChoice } }
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
      content?: AnthropicContentBlock[];
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
      sources: extractAnthropicSources(blocks),
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

export type StreamResult =
  | { ok: false; error: string }
  | {
      ok: true;
      body: ReadableStream<Uint8Array>;
      completed: Promise<{ model: string; usage: Usage }>;
    };

export type AiStreamEvent =
  | { type: 'search_started' }
  | { type: 'source_found'; source: Source }
  | { type: 'answer_started' }
  | { type: 'answer_delta'; delta: string }
  | { type: 'answer_completed'; model: string; usage: Usage; costUsd: number; sources: Source[] }
  | { type: 'error'; message: string };

/** Stream testuale della Chat V1, con contesto neutrale e ricerca web. */
export async function streamAnthropic(
  req: ProviderRequest,
  signal?: AbortSignal,
): Promise<StreamResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: 'ANTHROPIC_API_KEY mancante' };

  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens,
        stream: true,
        fallbacks: 'default',
        output_config: { effort: req.effort ?? 'low' },
        thinking: { type: 'disabled' },
        ...(req.webSearch
          ? { tools: [{ type: 'web_search_20260209', name: 'web_search' }] }
          : {}),
        system: req.system.map((block) => ({
          type: 'text',
          text: block.text,
          ...(block.cache ? { cache_control: { type: 'ephemeral' } } : {}),
        })),
        messages: [...req.turns, { role: 'user', content: req.user }],
      }),
    });
  } catch (error) {
    return { ok: false, error: String(error) };
  }

  if (!response.ok || !response.body) {
    return { ok: false, error: `anthropic ${response.status}: ${await response.text()}` };
  }

  let finish!: (value: { model: string; usage: Usage }) => void;
  const completed = new Promise<{ model: string; usage: Usage }>((resolve) => { finish = resolve; });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let model = req.model;
  const usage: Usage = {};
  const foundSources: Source[] = [];
  const foundUrls = new Set<string>();
  let answerStarted = false;

  const encode = (event: AiStreamEvent) =>
    encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

  const pushSource = (controller: ReadableStreamDefaultController<Uint8Array>, value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const source = asSource(value as AnthropicSearchResult);
    if (!source || foundUrls.has(source.url)) return;
    foundUrls.add(source.url);
    foundSources.push(source);
    controller.enqueue(encode({ type: 'source_found', source }));
  };

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';

          for (const event of events) {
            const data = event.split('\n').find((line) => line.startsWith('data: '))?.slice(6);
            if (!data) continue;
            const parsed = JSON.parse(data) as {
              type?: string;
              message?: { model?: string; usage?: Record<string, number> };
              content_block?: AnthropicContentBlock;
              delta?: { type?: string; text?: string; citation?: AnthropicCitation };
              usage?: Record<string, number> & {
                server_tool_use?: { web_search_requests?: number };
              };
            };
            if (parsed.message?.model) model = parsed.message.model;
            if (parsed.message?.usage) {
              usage.inputTokens = parsed.message.usage.input_tokens ?? 0;
              usage.cacheReadTokens = parsed.message.usage.cache_read_input_tokens ?? 0;
              usage.cacheWriteTokens = parsed.message.usage.cache_creation_input_tokens ?? 0;
            }
            if (parsed.usage) {
              usage.outputTokens = parsed.usage.output_tokens ?? usage.outputTokens ?? 0;
              usage.webSearches =
                parsed.usage.server_tool_use?.web_search_requests ?? usage.webSearches ?? 0;
            }
            if (parsed.type === 'content_block_start') {
              const block = parsed.content_block;
              if (block?.type === 'server_tool_use' && block.name === 'web_search') {
                controller.enqueue(encode({ type: 'search_started' }));
              }
              if (block?.type === 'web_search_tool_result' && Array.isArray(block.content)) {
                for (const result of block.content) {
                  if (result.type === 'web_search_result') pushSource(controller, result);
                }
              }
            }

            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'citations_delta') {
              const citation = parsed.delta.citation;
              if (
                citation?.type === 'web_search_result_location' ||
                citation?.type === 'search_result_location'
              ) {
                pushSource(controller, citation);
              }
            }

            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta' && parsed.delta.text) {
              if (!answerStarted) {
                answerStarted = true;
                controller.enqueue(encode({ type: 'answer_started' }));
              }
              controller.enqueue(encode({ type: 'answer_delta', delta: parsed.delta.text }));
            }
          }
          if (done) break;
        }
        controller.enqueue(encode({
          type: 'answer_completed',
          model,
          usage,
          costUsd: costOf(model, usage),
          sources: foundSources,
        }));
        finish({ model, usage });
        controller.close();
      } catch (error) {
        finish({ model, usage });
        controller.enqueue(encode({ type: 'error', message: String(error) }));
        controller.close();
      }
    },
    cancel() {
      void reader.cancel();
      finish({ model, usage });
    },
  });

  return { ok: true, body, completed };
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
      sources: [],
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

type OpenAIResponseItem = {
  type?: string;
  role?: string;
  content?: Array<{
    type?: string;
    text?: string;
    annotations?: Array<{ type?: string; title?: string; url?: string }>;
  }>;
  call_id?: string;
  name?: string;
  arguments?: string;
  action?: { sources?: Array<{ type?: string; title?: string; url?: string }> };
};

function openaiResponseInput(req: ProviderRequest): Record<string, unknown>[] {
  const input: Record<string, unknown>[] = [];
  const addBlocks = (content: Block[], role: 'user' | 'assistant') => {
    const text = content
      .filter((block) => block.type === 'text')
      .map((block) => String(block.text ?? ''))
      .join('');
    if (text) input.push({ role, content: text });
    for (const block of content.filter((item) => item.type === 'tool_use')) {
      input.push({
        type: 'function_call',
        call_id: String(block.id ?? ''),
        name: String(block.name ?? ''),
        arguments: JSON.stringify(block.input ?? {}),
      });
    }
    for (const block of content.filter((item) => item.type === 'tool_result')) {
      input.push({
        type: 'function_call_output',
        call_id: String(block.tool_use_id ?? ''),
        output: String(block.content ?? ''),
      });
    }
  };

  for (const turn of req.turns) {
    if (typeof turn.content === 'string') input.push({ role: turn.role, content: turn.content });
    else addBlocks(turn.content as Block[], turn.role);
  }
  if (req.userBlocks?.length) {
    addBlocks(req.userBlocks as Block[], 'user');
  } else if (req.user || req.image) {
    const content: Record<string, unknown>[] = [];
    if (req.user) content.push({ type: 'input_text', text: req.user });
    if (req.image) {
      content.push({
        type: 'input_image',
        detail: 'auto',
        image_url: `data:${req.image.mediaType};base64,${req.image.data}`,
      });
    }
    input.push({ role: 'user', content });
  }
  return input;
}

export function extractOpenAIResponseSources(output: readonly OpenAIResponseItem[]): Source[] {
  const sources: Source[] = [];
  for (const item of output) {
    for (const part of item.content ?? []) {
      for (const annotation of part.annotations ?? []) {
        if (annotation.type !== 'url_citation') continue;
        const source = asSource(annotation);
        if (source) sources.push(source);
      }
    }
    if (item.type !== 'web_search_call') continue;
    for (const found of item.action?.sources ?? []) {
      const source = asSource(found);
      if (source) sources.push(source);
    }
  }
  return uniqueSources(sources);
}

async function openAiResponses(key: string, req: ProviderRequest): Promise<ProviderResult> {
  try {
    const tools: Record<string, unknown>[] = [
      ...(req.tools ?? []).map((tool) => ({
        type: 'function',
        name: tool.name,
        description: tool.description,
        parameters: tool.schema,
        strict: false,
      })),
      ...(req.webSearch ? [{ type: 'web_search' }] : []),
    ];
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: req.model,
        instructions: req.system.map((block) => block.text).join('\n\n'),
        input: openaiResponseInput(req),
        max_output_tokens: req.maxTokens,
        reasoning: { effort: req.tools?.length ? 'none' : (req.effort ?? 'none') },
        store: false,
        ...(tools.length ? { tools } : {}),
        ...(req.toolChoice
          ? { tool_choice: { type: 'function', name: req.toolChoice } }
          : {}),
        ...(req.webSearch ? { include: ['web_search_call.action.sources'] } : {}),
      }),
    });
    if (!response.ok) {
      return fail(req.model, `openai ${response.status}: ${(await response.text()).slice(0, 500)}`);
    }
    const body = (await response.json()) as {
      model?: string;
      status?: string;
      output_text?: string;
      output?: OpenAIResponseItem[];
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        input_tokens_details?: { cached_tokens?: number };
      };
    };
    const output = body.output ?? [];
    const text = (body.output_text ?? output
      .filter((item) => item.type === 'message')
      .flatMap((item) => item.content ?? [])
      .filter((part) => part.type === 'output_text')
      .map((part) => part.text ?? '')
      .join('')).trim();
    const toolUses: ToolUse[] = output
      .filter((item) => item.type === 'function_call')
      .map((item) => ({
        id: item.call_id ?? '',
        name: item.name ?? '',
        input: safeJson(item.arguments),
      }));
    const cached = body.usage?.input_tokens_details?.cached_tokens ?? 0;
    return {
      ok: text.length > 0 || toolUses.length > 0,
      text,
      toolUses,
      sources: extractOpenAIResponseSources(output),
      stopReason: toolUses.length ? 'tool_use' : body.status,
      model: body.model ?? req.model,
      usage: {
        inputTokens: Math.max(0, (body.usage?.input_tokens ?? 0) - cached),
        cacheReadTokens: cached,
        outputTokens: body.usage?.output_tokens ?? 0,
        webSearches: output.filter((item) => item.type === 'web_search_call').length,
      },
    };
  } catch (error) {
    return fail(req.model, String(error));
  }
}

/* ============================================================================
   IL PROTOCOLLO DI OPENAI, USATO DA DUE FORNITORI

   Moonshot parla la lingua di OpenAI, e da quando anche OpenAI serve del testo
   (§10 — il compilatore di prompt) i due adattatori erano diventati lo stesso
   codice scritto due volte. Uno solo, con l'indirizzo e la chiave come
   parametri.

   ⚠️ IL NOME DEL TETTO DI USCITA CAMBIA FRA LE FAMIGLIE DI MODELLI: i modelli
   che ragionano vogliono `max_completion_tokens`, i più vecchi `max_tokens`.
   Da questa macchina non ho rete per verificarlo contro l'API vera, quindi
   NON tiro a indovinare: si prova il primo e, se l'errore parla proprio di
   quel parametro, si riprova con l'altro. Dieci righe che tolgono un modo di
   fallire che sarebbe stato invisibile fino alla prima creatura.
   ========================================================================= */

async function openAiProtocol(
  label: string,
  url: string,
  key: string,
  req: ProviderRequest,
): Promise<ProviderResult> {
  /* ⚠️ QUANTO DEVE RAGIONARE, DETTO.
     🔷 «Il prompt carica ma non va.»

     Questo campo non veniva mandato affatto, quindi GPT-5.6 girava al suo
     predefinito — `medium` — e su un briefing di millesei token ci mette
     decine di secondi: molto oltre i dieci delle funzioni.

     ⚠️ E la mia stima era sbagliata in un modo che conta: avevo detto «~800
     token in uscita» contando solo il JSON. I token di RAGIONAMENTO sono
     anch'essi token in uscita, e sono quelli che fanno il tempo. Non contarli
     è il motivo per cui pensavo che la chiamata ci stesse.

     Il resolver è un lavoro vincolato — i fatti sono dati, il formato è
     dettato — quindi `low` gli basta. La voce, che deve pensare davvero,
     chiede `thinking` e riceve `medium`. */
  /* ⚠️ `none`, NON `low`, ed è la correzione di un mio mezzo passo.
     🔷 «Dice chiamata fallita offline. Adesso ha detto timeout.»

     Sono LO STESSO EVENTO: Netlify uccide la funzione a dieci secondi e a
     volte risponde 502, a volte chiude il collegamento e basta. Due parole,
     un muro solo. `low` non bastava a starci dentro.

     🔒 E CON GLI STRUMENTI `none` NON È UN'OTTIMIZZAZIONE, È L'UNICO VALORE
     CHE PASSA: su /v1/chat/completions GPT-5.6 rifiuta con 400 una richiesta
     che ha funzioni e uno sforzo di ragionamento diverso da `none` — e la
     rifiuta anche se non lo mandi affatto, perché il suo predefinito è
     `medium`. Era un modo di fallire che non avevamo nemmeno visto, perché la
     voce sta su Anthropic finché non scegli GPT.

     Resta `medium` per un caso solo: chi chiede di PENSARE e non ha strumenti
     per farlo. */
  const effort = req.tools?.length
    ? /* Con gli strumenti resta l'unico valore che passa, e vince su tutto:
         non è una preferenza, è un requisito dell'API. */
      'none'
    : (req.effort ?? (req.thinking ? 'medium' : 'none'));

  const body = (tokensField: 'max_completion_tokens' | 'max_tokens', reasoning: boolean) => ({
    model: req.model,
    messages: openaiMessages(req),
    [tokensField]: req.maxTokens,
    ...(reasoning ? { reasoning_effort: effort } : {}),
    ...(req.tools?.length
      ? {
          tools: req.tools.map((t) => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.schema },
          })),
          ...(req.toolChoice
            ? {
                tool_choice: {
                  type: 'function',
                  function: { name: req.toolChoice },
                },
              }
            : {}),
        }
      : {}),
  });

  const send = (tokensField: 'max_completion_tokens' | 'max_tokens', reasoning: boolean) =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(body(tokensField, reasoning)),
    });

  try {
    let res = await send('max_completion_tokens', true);

    if (!res.ok) {
      const detail = await res.text();
      /* Solo se l'errore parla DI UN PARAMETRO: un 401 o un tetto di spesa non
         si riprovano, si riportano. E si riprova togliendo QUELLO nominato —
         prima il nome del campo dei token, poi lo sforzo di ragionamento, che
         non tutti i modelli accettano. */
      if (/max_completion_tokens|max_tokens|unsupported parameter|unknown parameter/i.test(detail)) {
        res = await send('max_tokens', true);
        if (!res.ok) res = await send('max_completion_tokens', false);
        if (!res.ok) res = await send('max_tokens', false);
        if (!res.ok) return fail(req.model, `${label} ${res.status}: ${await res.text()}`);
      } else if (/reasoning/i.test(detail)) {
        res = await send('max_completion_tokens', false);
        if (!res.ok) return fail(req.model, `${label} ${res.status}: ${await res.text()}`);
      } else {
        return fail(req.model, `${label} ${res.status}: ${detail}`);
      }
    }

    const out = (await res.json()) as {
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

    const message = out.choices?.[0]?.message;
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

    const cached = out.usage?.prompt_tokens_details?.cached_tokens ?? 0;

    return {
      ok: text.length > 0 || toolUses.length > 0,
      text,
      toolUses,
      sources: [],
      stopReason: out.choices?.[0]?.finish_reason,
      model: out.model ?? req.model,
      usage: {
        // ⚠️ I token in cache sono GIÀ dentro `prompt_tokens`.
        inputTokens: Math.max(0, (out.usage?.prompt_tokens ?? 0) - cached),
        cacheReadTokens: cached,
        outputTokens: out.usage?.completion_tokens ?? 0,
      },
    };
  } catch (err) {
    return fail(req.model, String(err));
  }
}

async function moonshot(req: ProviderRequest): Promise<ProviderResult> {
  const key = process.env.MOONSHOT_API_KEY;
  if (!key) return fail(req.model, 'MOONSHOT_API_KEY mancante');
  return openAiProtocol('moonshot', 'https://api.moonshot.ai/v1/chat/completions', key, req);
}

/**
 * 🔷 §10 — OpenAI serve anche del TESTO, da quando il prompt lo scrive un
 * modello. Le immagini continuano a passare da `generateImage`: hanno una
 * forma di risposta diversa, e fingere che sia la stessa produrrebbe un tipo
 * che mente.
 */
async function openaiText(req: ProviderRequest): Promise<ProviderResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return fail(req.model, 'OPENAI_API_KEY mancante');
  if (req.webSearch || req.image) return openAiResponses(key, req);
  return openAiProtocol('openai', 'https://api.openai.com/v1/chat/completions', key, req);
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

/**
 * Le misure che OpenAI accetta.
 *
 * 🔒 Elenco CHIUSO e controllato qui, non nel browser. La misura arriva da
 * fuori — la decide il tipo di asset — e tutto ciò che arriva da fuori si
 * verifica dove non si può aggirare. Una misura inventata farebbe fallire la
 * chiamata dopo averla pagata in attesa.
 */
export const IMAGE_SIZES = ['1024x1024', '1536x1024', '1024x1536'] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];

export async function generateImage(
  model: string,
  prompt: string,
  /* ⚠️ Prima era murata a `1024x1024` proprio qui, cioè nell'unico posto che
     non sa quale asset sta disegnando: l'EXPRESSION SHEET è una griglia 3×2 e
     il ciclo di riposo è una striscia di frame, e li chiedevamo tutti e due
     quadrati. Il quadrato non è neutro: è una scelta di composizione, e
     prenderla qui vuol dire prenderla alla cieca. */
  size: ImageSize = '1024x1024',
  /**
   * ⚠️ IL CHARACTER MASTER DA ALLEGARE, in base64. Quando c'è, la richiesta
   * NON va su `/v1/images/generations` — che accetta solo testo — ma su
   * `/v1/images/edits`, che accetta immagini di riferimento.
   *
   * 🔴 Dal Profile Portrait in poi il prompt diceva già «allega il CHARACTER
   * MASTER e trattalo come l'unica fonte di verità visiva; dove testo e
   * immagine non concordano vince l'immagine». Nessuna immagine è mai stata
   * allegata: il modello riceveva l'ordine di consultare un riferimento
   * assente E il testo dichiarato non autorevole. È il motivo per cui le sei
   * immagini non si somigliavano, e non era il modello a sbagliare.
   */
  reference?: string | null,
): Promise<ImageResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, data: '', usage: {}, error: 'OPENAI_API_KEY mancante' };

  /* ⚠️ `background: 'transparent'` è un extra: fa comodo (il .mon si ritaglia
     da solo sullo sfondo dell'app) ma non è indispensabile, e i parametri
     accettati cambiano da un modello di immagini all'altro. Se il modello lo
     rifiuta si riprova senza, invece di restituire «non ha funzionato» per una
     comodità.

     🔒 Solo se l'errore parla DI QUEL parametro: un 401, un tetto di spesa o
     un'organizzazione non verificata non si riprovano, si riportano. Stessa
     regola del ripiego `max_completion_tokens` → `max_tokens`. */
  /* Senza riferimento: la strada di sempre, testo e basta. */
  const sendText = (extras: Record<string, unknown>) =>
    fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, prompt, size, n: 1, ...extras }),
    });

  /* Con riferimento: multipart, perché l'immagine è un file e non un campo
     JSON. Le intestazioni NON si scrivono a mano — il confine del multipart lo
     genera `FormData` e va dichiarato nel content-type: metterlo a mano è il
     modo classico di far fallire questa chiamata con un 400 illeggibile. */
  const sendWithReference = (extras: Record<string, unknown>) => {
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    form.append('size', size);
    form.append('n', '1');
    for (const [k, v] of Object.entries(extras)) form.append(k, String(v));
    const bytes = Uint8Array.from(atob(reference as string), (c) => c.charCodeAt(0));
    /* 🔒 `image[]` e non `image`: è la forma che accetta più riferimenti, ed è
       quella giusta anche con uno solo — il giorno che alleghiamo anche il
       ritratto non cambia niente qui. */
    form.append('image[]', new Blob([bytes], { type: 'image/png' }), 'master.png');
    return fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}` },
      body: form,
    });
  };

  const send = reference ? sendWithReference : sendText;

  try {
    let res = await send({ background: 'transparent' });

    if (!res.ok) {
      const detail = await res.text();
      if (/background|unsupported parameter|unknown parameter|invalid_request/i.test(detail)) {
        res = await send({});
        if (!res.ok) {
          return { ok: false, data: '', usage: {}, error: `openai ${res.status}: ${await res.text()}` };
        }
      } else {
        return { ok: false, data: '', usage: {}, error: `openai ${res.status}: ${detail}` };
      }
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
  openai: openaiText,
};

export function callProvider(provider: Provider, req: ProviderRequest): Promise<ProviderResult> {
  return ADAPTERS[provider](req);
}
