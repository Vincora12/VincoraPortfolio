import { authorize, denied, json } from './_shared/auth';
import { shouldCapturePersonalMemory, writePersonalMemory } from './_shared/core/memory';
import { appendRuntimeEvent } from './_shared/runtimeLog';

/* ============================================================================
   MEMORY CLEANUP — "ricordati che..." merita una risposta onesta.

   🔒 QUESTO NON DECIDE COSA SI SCRIVE. Il modulo Core (`_shared/core/memory.ts`)
   già istruisce il modello a trattare una richiesta esplicita come prova
   forte — quella decisione resta sua, invariata. Questo flag serve SOLO a
   scegliere quale riscontro mostrare in chat: oggi un "ricordati che..." e un
   messaggio qualsiasi ricevono lo STESSO trattamento silenzioso se la
   scrittura fallisce — nessun segnale, né positivo né negativo. Chi ha
   chiesto esplicitamente di ricordare merita di sapere se è successo davvero.

   ⚠️ Deterministico e a basso rischio per costruzione: un falso positivo
   mostra solo un'etichetta più sicura di quella generica quando la memoria
   comunque si aggiorna — non scrive niente in più e non ne impedisce niente.
   Un falso negativo lascia semplicemente il comportamento di oggi (silenzio).
   ========================================================================= */
const EXPLICIT_REMEMBER = /\b(ricorda(ti)?|non\s+dimenticare|tieni\s+a\s+mente|memorizza)\b[^.!?]{0,40}\bche\b|\bremember\s+(that|this|to)\b|\bdon'?t\s+forget\b/i;

/** Esportata per `scripts/memory-cleanup-check.mjs`. */
export function looksLikeExplicitRemember(text: string): boolean {
  return EXPLICIT_REMEMBER.test(text);
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'solo POST' }, 405);
  if (!authorize(request).ok) return denied();
  let body: { text?: string; conversationId?: string; messageId?: string; requestId?: string; preferredModel?: string; context?: Array<{ role?: string; text?: string }> };
  try { body = await request.json() as typeof body; } catch { return json({ error: 'body non leggibile' }, 400); }
  if (typeof body.text !== 'string' || body.text.trim().length === 0 || body.text.length > 20_000) return json({ error: 'messaggio non valido' }, 400);
  const context = Array.isArray(body.context) ? body.context.filter((item): item is { role: 'user' | 'assistant'; text: string } => (item.role === 'user' || item.role === 'assistant') && typeof item.text === 'string').slice(-8).map((item) => ({ ...item, text: item.text.slice(0, 4000) })) : [];
  const explicitRequest = looksLikeExplicitRemember(body.text);
  if (!shouldCapturePersonalMemory(body.text)) return json({ status: 'ignored', updated: false, created: 0, updatedCount: 0, superseded: 0, episodesCreated: 0, skipped: 0, ambiguities: [], warnings: [], explicitRequest });
  const startedAt = Date.now();
  try {
    const { result, backend } = await writePersonalMemory({ text: body.text, conversationId: body.conversationId, messageId: body.messageId, context, preferredModel: body.preferredModel });
    const failed = backend === 'mem0' ? !result.updated : result.status === 'failed';
    await appendRuntimeEvent({
      eventType: failed ? 'MEMORY_WRITE_ERROR' : 'MEMORY_WRITE_OK',
      status: failed ? 'FAIL' : 'PASS',
      scope: 'memory',
      requestId: body.requestId,
      conversationId: body.conversationId,
      messageId: body.messageId,
      durationMs: Date.now() - startedAt,
      ...(backend === 'mem0' ? { metadata: { count: result.created ?? 0 } } : {}),
    });
    return json({ ...result, explicitRequest }, result.status === 'failed' ? 422 : 200);
  } catch (error) {
    await appendRuntimeEvent({ eventType: 'MEMORY_WRITE_ERROR', status: 'FAIL', scope: 'memory', requestId: body.requestId, conversationId: body.conversationId, messageId: body.messageId, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : 'memory capture failed' });
    return json({ status: 'failed', updated: false, created: 0, updatedCount: 0, superseded: 0, episodesCreated: 0, skipped: 0, ambiguities: [], warnings: [error instanceof Error ? error.message : 'memory capture failed'], explicitRequest }, 200);
  }
}

export const config = { path: '/api/me-chat-capture' };
