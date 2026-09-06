/* ============================================================================
   OPENAI-COMPATIBLE INGRESS — un'entrata in più, non un secondo VINZ.MON

   🔷 AUDIT & UNIFICATION (§7) — OpenClicky ha un campo "OpenAI-compatible
   base URL". Questo file è l'unico posto in cui questo ingresso tocca il
   Core: prende una richiesta nel formato OpenAI e la trasforma nella STESSA
   `ProviderRequest` normalizzata che `netlify/functions/ai.ts` già usa per
   la chat vera — stesso `authorize`, stesso `checkCap`/`recordSpend`, stessa
   `resolveRoute`, stesso `callProvider`. Non esiste un secondo modo di
   parlare a un fornitore in questo progetto: ce n'è uno solo, ed è quello
   che questo file chiama.

   🔒 COSA QUESTO INGRESSO NON HA E NON AGGIUNGE:
   - nessuna memoria propria, nessuna Persona propria, nessun runtime
     parallelo — chiama `callProvider` come tutto il resto;
   - nessuna chiave lato client: la richiesta porta lo stesso VINZMON_TOKEN
     di ogni altra funzione, mai una chiave di un fornitore;
   - nessuna esecuzione di strumenti qui dentro: se il chiamante manda dei
     tool (function) OpenAI, li passiamo al modello e restituiamo le
     `tool_calls` che vuole fare — ESATTAMENTE come fa `ai.ts` col browser
     oggi: il server decide, chi ha chiamato esegue. Un client tipo
     Codex/OpenClicky ha già il proprio loop di esecuzione tool lato suo;
     duplicarlo qui sarebbe un secondo tool layer, vietato dal task.

   ⚠️ LIMITE DICHIARATO, NON NASCOSTO: Persona/ME/Memoria di VINZ.MON vivono
   nello stato del BROWSER (`state/store.ts`, Zustand) — un chiamante
   server-to-server come OpenClicky non ha quello stato. Questo ingresso
   instrada comunque per il Core vero (auth → budget → routing → provider),
   ma la voce che risponde è quella "neutra" (nessun .mon attivo), la stessa
   che VINZ.LAB usa già quando non c'è nessuna creatura selezionata — non una
   voce finta, la stessa condizione che il resto del progetto usa per lo
   stesso caso. Colmarlo del tutto (mandare qui lo stato salvato di un .mon)
   è un intervento più grande, fuori dal "minimo necessario" di questo task:
   vedi il report per il perché e il passo successivo.
   ========================================================================= */

import { authorize, type AuthResult } from './auth';
import { checkCap, recordSpend, looksLikeProviderQuota, INTERNAL_CAP_EXCEEDED, PROVIDER_QUOTA_EXCEEDED, type CapState } from './spend';
import { resolveRoute } from './routing';
import { callProvider, type ProviderResult, type SystemBlock, type ToolDef, type Turn } from './providers';
import { appendRuntimeEvent } from './runtimeLog';
import { loadCoreContext } from './coreContext';
import captureHandler from '../me-chat-capture';

export const INGRESS_MODEL_ID = 'vinzmon-core';

const LIMITS = { userChars: 12_000, systemChars: 12_000, maxMessages: 60 };

export function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
  };
}

export function jsonWithCors(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...corsHeaders() },
  });
}

/** Stesso confine di sempre (`_shared/auth.ts`, `VINZMON_TOKEN`) — nessun
    secondo sistema di identità per questo ingresso. */
export function authorizeIngress(request: Request): AuthResult {
  return authorize(request);
}

export interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool' | 'developer';
  content: string | Array<{ type?: string; text?: string }> | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
}

/** Un blocco di contenuto OpenAI (stringa o parti tipizzate) diventa testo
    semplice: questo ingresso non promette immagini/file in ingresso in
    questa fase — solo testo, dichiarato nei limiti del §19 del report. */
function flattenContent(content: OpenAiMessage['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

export interface MappedRequest {
  system: SystemBlock[];
  turns: Turn[];
  user: string;
}

/** OpenAI manda l'intera conversazione come `messages` (chat/completions) o
    `input` (responses) — stessa forma logica (`role`+`content`), quindi una
    sola funzione di mappatura serve a entrambi gli endpoint. */
export function mapMessagesToRequest(messages: OpenAiMessage[]): MappedRequest {
  const system: SystemBlock[] = [];
  const turns: Turn[] = [];
  let user = '';
  const capped = messages.slice(-LIMITS.maxMessages);
  for (let i = 0; i < capped.length; i++) {
    const m = capped[i];
    const text = flattenContent(m.content).slice(0, LIMITS.userChars);
    if (m.role === 'tool' && m.tool_call_id) {
      const block = { type: 'tool_result', tool_use_id: m.tool_call_id, content: text };
      const prior = turns.at(-1);
      if (prior?.role === 'user' && Array.isArray(prior.content)) prior.content.push(block);
      else turns.push({ role: 'user', content: [block] });
      continue;
    }
    if (m.role === 'assistant' && m.tool_calls?.length) {
      const content: Record<string, unknown>[] = text ? [{ type: 'text', text }] : [];
      for (const call of m.tool_calls) {
        let input: unknown;
        try { input = JSON.parse(call.function.arguments); } catch { throw new Error('INVALID_TOOL_ARGUMENTS'); }
        content.push({ type: 'tool_use', id: call.id, name: call.function.name, input });
      }
      turns.push({ role: 'assistant', content });
      continue;
    }
    if (m.role === 'system' || m.role === 'developer') {
      if (text.trim()) system.push({ text: text.slice(0, LIMITS.systemChars) });
      continue;
    }
    const isLast = i === capped.length - 1;
    if (isLast && m.role === 'user') {
      user = text;
      continue;
    }
    turns.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: text });
  }
  if (!system.length) {
    system.push({ text: 'You are VINZ.MON, a neutral high-quality personal AI assistant. Answer in the user language.' });
  }
  return { system, turns, user };
}

export interface OpenAiFunctionTool {
  type: 'function';
  function: { name: string; description?: string; parameters?: Record<string, unknown> };
}

/** Il chiamante (OpenClicky/Codex) porta i propri tool — questo ingresso non
    ne conosce il significato, li passa solo al modello: mai una seconda
    definizione degli strumenti veri di VINZ.MON, mai un'esecuzione qui. */
export function mapToolsIn(tools: unknown): ToolDef[] | undefined {
  if (!Array.isArray(tools)) return undefined;
  const defs: ToolDef[] = [];
  for (const t of tools as OpenAiFunctionTool[]) {
    if (t?.type !== 'function' || !t.function?.name) continue;
    defs.push({ name: t.function.name, description: t.function.description ?? '', schema: t.function.parameters ?? { type: 'object', properties: {} } });
  }
  return defs.length ? defs : undefined;
}

export type IngressOutcome =
  | { ok: true; result: ProviderResult; cap: CapState }
  | { ok: false; response: Response };

/**
 * Il percorso unico verso il Core: authorize → budget → resolveRoute →
 * callProvider → recordSpend. Ogni endpoint OpenAI-compatibile (models a
 * parte, che non chiama nessun modello) passa da qui — mai una seconda
 * implementazione di questo giro, per nessuno dei tre endpoint.
 */
export async function runIngress(
  request: Request,
  mapped: MappedRequest,
  tools: ToolDef[] | undefined,
  platform?: { waitUntil(promise: Promise<unknown>): void },
): Promise<IngressOutcome> {
  const auth = authorizeIngress(request);
  if (!auth.ok) {
    console.warn('[openai-ingress] richiesta rifiutata:', auth.reason);
    return { ok: false, response: jsonWithCors({ error: { message: 'non autorizzato', type: 'invalid_request_error' } }, 401) };
  }

  const cap = await checkCap();
  if (cap.blocked) {
    await appendRuntimeEvent({
      eventType: INTERNAL_CAP_EXCEEDED,
      status: 'FAIL',
      scope: 'openai-ingress',
      error: `spesa ${cap.ledger.usd.toFixed(4)} $ su un tetto di ${cap.capUsd.toFixed(2)} $ (${cap.capSource})`,
    });
    return {
      ok: false,
      response: jsonWithCors({ error: { message: 'tetto mensile raggiunto', type: 'insufficient_quota', code: INTERNAL_CAP_EXCEEDED } }, 402),
    };
  }

  const route = resolveRoute('character-voice');
  let systemPrompt: string;
  try {
    ({ systemPrompt } = await loadCoreContext({ query: mapped.user, body: 'external', toolsAvailable: Boolean(tools?.length) }));
  } catch {
    return { ok: false, response: jsonWithCors({ error: { message: 'Contesto canonico non disponibile.', type: 'server_error' } }, 503) };
  }
  const result = await callProvider(route.provider, {
    model: route.model,
    system: [...mapped.system, { text: systemPrompt }],
    turns: mapped.turns,
    user: mapped.user,
    tools,
    maxTokens: 2000,
    effort: 'low',
  });

  if (result.usage.inputTokens || result.usage.outputTokens) {
    await recordSpend('character-voice', result.model, result.usage, { action: 'openai-ingress', subsystem: 'openai-ingress' });
  }

  if (!result.ok) {
    const providerQuota = looksLikeProviderQuota(result.error);
    await appendRuntimeEvent({
      eventType: providerQuota ? PROVIDER_QUOTA_EXCEEDED : 'AI_CALL_ERROR',
      status: 'FAIL',
      scope: 'openai-ingress',
      capability: 'character-voice',
      provider: route.provider,
      model: result.model,
      error: result.error,
    });
    return {
      ok: false,
      response: jsonWithCors({ error: { message: (result.error ?? 'risposta non disponibile').slice(0, 300), type: providerQuota ? 'insufficient_quota' : 'server_error' } }, 502),
    };
  }

  if (platform && mapped.user.trim()) {
    const requestId = crypto.randomUUID();
    platform.waitUntil(captureHandler(new Request(new URL('/api/me-chat-capture', request.url), {
      method: 'POST',
      headers: { authorization: request.headers.get('authorization') ?? '', 'content-type': 'application/json' },
      body: JSON.stringify({ text: mapped.user, requestId, messageId: requestId }),
    })).catch(() => undefined));
  }
  return { ok: true, result, cap };
}

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
