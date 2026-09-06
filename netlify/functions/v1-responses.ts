/* ============================================================================
   /v1/responses — l'ENDPOINT PRIMARIO per OpenClicky (§7 del task).

   🔒 PERCHÉ QUESTO E NON /v1/chat/completions PER PRIMO. Il task chiedeva
   esplicitamente di NON assumere `/v1/chat/completions` senza verificare.
   Verificato (ricerca web, stato a inizio 2026): Codex CLI ha RIMOSSO il
   supporto a `wire_api = "chat"` — da febbraio 2026 l'unico `wire_api`
   supportato è `"responses"`, ed è il default per un provider personalizzato.
   Se OpenClicky punta a un target "Codex", questo è l'endpoint che userà
   davvero. `/v1/chat/completions` resta come fallback di compatibilità più
   larga (vedi quel file), non come strada raccomandata qui.

   Stessa regola di `v1-chat-completions.ts`: zero logica propria oltre alla
   forma della richiesta/risposta — `mapMessagesToRequest`/`runIngress` sono
   la stessa funzione condivisa, quindi un solo punto d'ingresso nel Core.
   ========================================================================= */

import { corsHeaders, jsonWithCors, mapMessagesToRequest, newId, runIngress, INGRESS_MODEL_ID, type OpenAiMessage } from './_shared/openaiIngress';
import type { ToolDef } from './_shared/providers';

type ResponsesInputItem = { role?: string; content?: unknown; type?: string; call_id?: string; name?: string; arguments?: string; output?: string } | string;

interface ResponsesPayload {
  model?: string;
  input?: ResponsesInputItem[] | string;
  instructions?: string;
  tools?: unknown;
  stream?: boolean;
}

function flattenPart(part: unknown): string {
  if (typeof part === 'string') return part;
  if (part && typeof part === 'object') {
    const p = part as { text?: string };
    if (typeof p.text === 'string') return p.text;
  }
  return '';
}

/** L'`input` di Responses accetta una stringa, o una lista di item
    {role, content} dove `content` può essere testo o parti tipizzate
    (`input_text`/`output_text`) — normalizzato negli stessi `OpenAiMessage`
    che `mapMessagesToRequest` già sa leggere, per non duplicare quella logica. */
function normalizeInput(input: ResponsesPayload['input'], instructions?: string): OpenAiMessage[] {
  const messages: OpenAiMessage[] = [];
  if (instructions?.trim()) messages.push({ role: 'system', content: instructions });
  if (typeof input === 'string') {
    messages.push({ role: 'user', content: input });
    return messages;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === 'string') { messages.push({ role: 'user', content: item }); continue; }
      if (item.type === 'function_call' && item.call_id && item.name && typeof item.arguments === 'string') {
        messages.push({ role: 'assistant', content: null, tool_calls: [{ id: item.call_id, type: 'function', function: { name: item.name, arguments: item.arguments } }] });
        continue;
      }
      if (item.type === 'function_call_output' && item.call_id && typeof item.output === 'string') {
        messages.push({ role: 'tool', tool_call_id: item.call_id, content: item.output });
        continue;
      }
      const role = item.role === 'system' || item.role === 'assistant' || item.role === 'developer' ? item.role : 'user';
      const content = Array.isArray(item.content)
        ? item.content.map(flattenPart).filter(Boolean).join('\n')
        : flattenPart(item.content);
      if (content) messages.push({ role, content });
    }
  }
  return messages;
}

/** Responses accetta i tool sia "piatti" (`{type:'function', name, ...}`)
    sia annidati come Chat Completions (`{type:'function', function:{...}}`)
    — entrambi i client reali in giro usano l'una o l'altra forma. */
function mapResponsesTools(tools: unknown): ToolDef[] | undefined {
  if (!Array.isArray(tools)) return undefined;
  const defs: ToolDef[] = [];
  for (const t of tools as Array<Record<string, unknown>>) {
    if (t?.type !== 'function') continue;
    const nested = t.function as { name?: string; description?: string; parameters?: Record<string, unknown> } | undefined;
    const name = nested?.name ?? (t.name as string | undefined);
    if (!name) continue;
    const description = nested?.description ?? (t.description as string | undefined) ?? '';
    const parameters = nested?.parameters ?? (t.parameters as Record<string, unknown> | undefined) ?? { type: 'object', properties: {} };
    defs.push({ name, description, schema: parameters });
  }
  return defs.length ? defs : undefined;
}

export default async function handler(request: Request, platform?: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  if (request.method !== 'POST') return jsonWithCors({ error: { message: 'solo POST', type: 'invalid_request_error' } }, 405);

  let payload: ResponsesPayload;
  try {
    payload = (await request.json()) as ResponsesPayload;
  } catch {
    return jsonWithCors({ error: { message: 'body non leggibile', type: 'invalid_request_error' } }, 400);
  }

  const messages = normalizeInput(payload.input, payload.instructions);
  if (!messages.length) return jsonWithCors({ error: { message: '"input" mancante o vuoto', type: 'invalid_request_error' } }, 400);

  let mapped;
  try { mapped = mapMessagesToRequest(messages); } catch { return jsonWithCors({ error: { message: 'Tool arguments non validi.', type: 'invalid_request_error' } }, 400); }
  const tools = mapResponsesTools(payload.tools);
  const outcome = await runIngress(request, mapped, tools, platform);
  if (!outcome.ok) return outcome.response;

  const { result } = outcome;
  const id = newId('resp');
  const createdAt = Math.floor(Date.now() / 1000);
  const model = INGRESS_MODEL_ID;

  const output: Record<string, unknown>[] = [];
  if (result.text) {
    output.push({
      id: newId('msg'),
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: result.text, annotations: [] }],
    });
  }
  for (const u of result.toolUses) {
    output.push({ id: newId('fc'), type: 'function_call', call_id: u.id, name: u.name, arguments: JSON.stringify(u.input ?? {}) });
  }

  const usage = {
    input_tokens: result.usage.inputTokens ?? 0,
    output_tokens: result.usage.outputTokens ?? 0,
    total_tokens: (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0),
  };
  const responseObject = {
    id,
    object: 'response',
    created_at: createdAt,
    model,
    status: 'completed',
    output,
    output_text: result.text,
    usage,
  };

  if (!payload.stream) return jsonWithCors(responseObject);

  /* STREAMING "finto" — stesso limite dichiarato di `v1-chat-completions.ts`:
     nessun provider di questo progetto emette oggi token incrementali veri.
     L'inviluppo di eventi è quello vero della Responses API (`response.
     created` → `response.output_text.delta` → `response.completed`), solo
     con UN delta che porta il testo intero invece di N piccoli. */
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send('response.created', { type: 'response.created', response: { ...responseObject, status: 'in_progress', output: [] } });
      if (result.text) {
        send('response.output_text.delta', { type: 'response.output_text.delta', delta: result.text });
        send('response.output_text.done', { type: 'response.output_text.done', text: result.text });
      }
      send('response.completed', { type: 'response.completed', response: responseObject });
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', ...corsHeaders() },
  });
}

export const config = { path: '/v1/responses' };
