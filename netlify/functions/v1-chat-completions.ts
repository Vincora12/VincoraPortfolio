/* ============================================================================
   /v1/chat/completions — l'ingresso OpenAI-compatibile "classico".

   🔒 §7 del task: NON assumere che questo sia il protocollo giusto per
   OpenClicky senza verificarlo. La ricerca fatta per questo intervento
   (Codex CLI, febbraio 2026) dice che i client basati su Codex hanno RIMOSSO
   il supporto a `wire_api = "chat"` — oggi serve `/v1/responses`
   (`v1-responses.ts`, l'endpoint primario). Questo file resta per la
   compatibilità più larga (molti altri client "OpenAI-compatible" parlano
   ancora Chat Completions), non perché sia la strada raccomandata per
   OpenClicky/Codex — vedi il report per la configurazione esatta.

   Nessuna logica propria: `mapMessagesToRequest`/`runIngress` sono la STESSA
   funzione condivisa che `v1-responses.ts` chiama — un solo punto d'ingresso
   nel Core, due formati di risposta sopra.
   ========================================================================= */

import { corsHeaders, jsonWithCors, mapMessagesToRequest, mapToolsIn, newId, runIngress, INGRESS_MODEL_ID, type OpenAiMessage } from './_shared/openaiIngress';

interface ChatCompletionsPayload {
  model?: string;
  messages?: OpenAiMessage[];
  tools?: unknown;
  stream?: boolean;
}

function sseChunk(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export default async function handler(request: Request, platform?: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  if (request.method !== 'POST') return jsonWithCors({ error: { message: 'solo POST', type: 'invalid_request_error' } }, 405);

  let payload: ChatCompletionsPayload;
  try {
    payload = (await request.json()) as ChatCompletionsPayload;
  } catch {
    return jsonWithCors({ error: { message: 'body non leggibile', type: 'invalid_request_error' } }, 400);
  }

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  if (!messages.length) return jsonWithCors({ error: { message: 'messages mancante o vuoto', type: 'invalid_request_error' } }, 400);

  let mapped;
  try { mapped = mapMessagesToRequest(messages); } catch { return jsonWithCors({ error: { message: 'Tool arguments non validi.', type: 'invalid_request_error' } }, 400); }
  const tools = mapToolsIn(payload.tools);
  const outcome = await runIngress(request, mapped, tools, platform);
  if (!outcome.ok) return outcome.response;

  const { result } = outcome;
  const id = newId('chatcmpl');
  const created = Math.floor(Date.now() / 1000);
  const model = INGRESS_MODEL_ID;
  const toolCalls = result.toolUses.length
    ? result.toolUses.map((u) => ({ id: u.id, type: 'function' as const, function: { name: u.name, arguments: JSON.stringify(u.input ?? {}) } }))
    : undefined;
  const finishReason = toolCalls ? 'tool_calls' : 'stop';

  if (!payload.stream) {
    return jsonWithCors({
      id,
      object: 'chat.completion',
      created,
      model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: result.text || null, ...(toolCalls ? { tool_calls: toolCalls } : {}) },
        finish_reason: finishReason,
      }],
      usage: {
        prompt_tokens: result.usage.inputTokens ?? 0,
        completion_tokens: result.usage.outputTokens ?? 0,
        total_tokens: (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0),
      },
    });
  }

  /* STREAMING — "finto", dichiarato: nessun adattatore in questo progetto
     produce oggi token incrementali veri (`callProvider` è one-shot, vedi
     `_shared/providers.ts`) — lo stesso vale per la chat reale dell'app, che
     ottiene l'effetto "sta scrivendo" lato client su una risposta già
     arrivata intera (`assistant-original/components/assistant-ui/markdown-text.tsx`,
     opzione `smooth`). Un unico blocco di testo dentro l'inviluppo SSE
     corretto non è una regressione rispetto a oggi: è la stessa cosa, nel
     formato che il protocollo si aspetta. */
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(enc.encode(sseChunk({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })));
      if (result.text) {
        controller.enqueue(enc.encode(sseChunk({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { content: result.text }, finish_reason: null }] })));
      }
      if (toolCalls) {
        controller.enqueue(enc.encode(sseChunk({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { tool_calls: toolCalls.map((c, i) => ({ index: i, ...c })) }, finish_reason: null }] })));
      }
      controller.enqueue(enc.encode(sseChunk({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: {}, finish_reason: finishReason }] })));
      controller.enqueue(enc.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', ...corsHeaders() },
  });
}

export const config = { path: '/v1/chat/completions' };
