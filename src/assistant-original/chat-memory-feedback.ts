import { savedToken } from '@/brain/stream';
import { stepModel } from '@/state/store';
import { postRuntimeEvent } from '@/system/runtimeLog';

const updatedIds = new Set<string>();
const listeners = new Set<() => void>();
const traces = new Map<string, any>();

try {
  const saved = JSON.parse(sessionStorage.getItem('vinzmon.chat.memory-updated.v1') ?? '[]') as unknown;
  if (Array.isArray(saved)) saved.filter((id): id is string => typeof id === 'string').forEach((id) => updatedIds.add(id));
} catch { /* storage is an optional UI cache */ }

export function hasMemoryUpdated(messageId: string): boolean { return updatedIds.has(messageId); }
export function subscribeMemoryFeedback(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
export function memoryTrace(messageId: string): any { return traces.get(messageId); }

export async function captureChatMemoryForClient(input: { text: string; messageId: string; requestId?: string; conversationId?: string; context?: Array<{ role: 'user' | 'assistant'; text: string }> }): Promise<void> {
  const token = savedToken();
  if (!token) {
    /* postRuntimeEvent stesso richiede un token per raggiungere il server, quindi
       questo evento non può arrivare al Runtime Log proprio nel caso che descrive —
       resta emesso per coerenza con la specifica e per il caso in cui un token
       arrivi più tardi nella stessa sessione. */
    postRuntimeEvent({ eventType: 'MEMORY_CAPTURE_SKIPPED', status: 'PASS', scope: 'memory', metadata: { reason: 'TOKEN_MISSING' } });
    return;
  }
  postRuntimeEvent({ eventType: 'MEMORY_CAPTURE_START', status: 'START', scope: 'memory' });
  try {
    const response = await fetch('/api/me-chat-capture', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ ...input, preferredModel: stepModel('memory', 'everyday') }) });
    const result = await response.json().catch(() => ({ status: 'failed' })) as { updated?: boolean; status?: string; warnings?: string[] };
    traces.set(input.messageId, { status: result.updated ? 'UPDATED' : String(result.status ?? (response.ok ? 'NO_CHANGE' : 'FAILED')).toUpperCase(), candidate: 'YES', context: input.context?.length ?? 0, feedback: result.updated ? 'SHOWN' : 'NOT_SHOWN', ...(result.warnings?.[0] ? { reason: result.warnings[0] } : {}) });
    if (!response.ok) {
      postRuntimeEvent({ eventType: 'MEMORY_CAPTURE_ERROR', status: 'FAIL', scope: 'memory', statusCode: response.status });
      return;
    }
    postRuntimeEvent({ eventType: 'MEMORY_CAPTURE_OK', status: 'PASS', scope: 'memory', statusCode: response.status });
    if (result.updated) {
      updatedIds.add(input.messageId);
      try { sessionStorage.setItem('vinzmon.chat.memory-updated.v1', JSON.stringify([...updatedIds].slice(-200))); } catch { /* optional */ }
      listeners.forEach((listener) => listener());
    }
  } catch (error) {
    postRuntimeEvent({ eventType: 'MEMORY_CAPTURE_ERROR', status: 'FAIL', scope: 'memory', errorName: error instanceof Error ? error.name : 'UnknownError' });
    /* capture failure never interrupts chat */
  }
}
