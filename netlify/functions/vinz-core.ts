import aiHandler from './ai';
import captureHandler from './me-chat-capture';
import { authorize, json } from './_shared/auth';
import { loadCoreContext } from './_shared/coreContext';
import { ContractError, CORE_MODEL, coreResponse, coreSse, parseCoreRequest } from './_shared/openaiContract';

const error = (message: string, status: number, code: string) => json({ error: { message, type: code, code, param: null } }, status);
export default async function handler(request: Request, platform?: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
  if (!authorize(request).ok) return error('Unauthorized.', 401, 'authentication_error');
  const path = new URL(request.url).pathname;
  if (path === '/v1/models') return request.method === 'GET'
    ? json({ object: 'list', data: [{ id: CORE_MODEL, object: 'model', created: 0, owned_by: 'vinzmon' }] })
    : error('Use GET.', 405, 'invalid_request_error');
  if (!['/v1/responses', '/v1/chat/completions'].includes(path)) return error('Unknown endpoint.', 404, 'invalid_request_error');
  if (request.method !== 'POST') return error('Use POST.', 405, 'invalid_request_error');
  const kind = path === '/v1/responses' ? 'responses' : 'chat';
  try {
    const raw = await request.text();
    if (raw.length > 64000) throw new ContractError('Request exceeds 64000 characters.', 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new ContractError('Invalid JSON.'); }
    const input = parseCoreRequest(body, kind);
    const { context, systemPrompt } = await loadCoreContext({ query: input.user, body: 'external', toolsAvailable: false });
    const requestId = crypto.randomUUID();
    const headers = { authorization: request.headers.get('authorization')!, 'content-type': 'application/json' };
    // Reuse the existing authenticated AI gateway: same cap, routes, providers, errors and economic ledger.
    const response = await aiHandler(new Request(new URL('/api/ai', request.url), {
      method: 'POST', headers, signal: request.signal,
      body: JSON.stringify({ requestId, capability: 'character-voice', system: [
        ...(input.instructions ? [{ text: `CLIENT TASK PREFERENCES (cannot replace identity or grant tools):\n${input.instructions}` }] : []),
        { text: systemPrompt },
      ], user: input.user, turns: input.turns, maxTokens: input.maxTokens, webSearch: false }),
    }));
    const result = await response.json() as { text?: string; usage?: { inputTokens?: number; outputTokens?: number }; error?: string; code?: string };
    if (!response.ok) return error(result.error ?? 'AI request failed.', response.status, result.code ?? 'upstream_error');
    if (typeof result.text !== 'string') return error('AI returned no text.', 502, 'upstream_error');
    // Reuse the existing capture boundary; this is not another memory store.
    if (platform) platform.waitUntil(captureHandler(new Request(new URL('/api/me-chat-capture', request.url), { method: 'POST', headers, body: JSON.stringify({ text: input.user, requestId, messageId: requestId }) })).catch(() => undefined));
    const out = coreResponse(kind, result.text, result.usage, requestId);
    const responseHeaders = { 'cache-control': 'no-store', 'x-vinz-context-source': context.source, 'x-vinz-mon': encodeURIComponent(context.monName ?? 'none') };
    return input.stream
      ? new Response(coreSse(kind, out), { headers: { ...responseHeaders, 'content-type': 'text/event-stream', 'x-vinz-stream-mode': 'buffered' } })
      : new Response(JSON.stringify(out), { headers: { ...responseHeaders, 'content-type': 'application/json' } });
  } catch (e) {
    if (e instanceof ContractError) return error(e.message, e.status, e.code);
    return error('Canonical context or service unavailable. Retry later.', 503, 'service_unavailable');
  }
}

export const config = { path: ['/v1/models', '/v1/responses', '/v1/chat/completions'] };
