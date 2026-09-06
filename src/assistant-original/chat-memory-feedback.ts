import { savedToken } from '@/brain/stream';
import { stepModel } from '@/state/store';
import { postRuntimeEvent } from '@/system/runtimeLog';

/* MEMORY CLEANUP — "ricordati che..." merita di sapere se ha funzionato.

   🔒 Fino a qui il segnale era binario: SHOWN quando la scrittura riesce,
   silenzio in ogni altro caso — incluso quando fallisce. Per un messaggio
   qualsiasi va bene: la maggior parte non è materiale da ricordare, e un
   silenzio non promette niente. Per una richiesta ESPLICITA il silenzio è
   una bugia per omissione: chi ha chiesto di ricordare non sa se è successo.

   `explicitFailedIds` esiste solo per questo — non cambia MAI cosa si
   scrive (quella decisione resta del modello, vedi SEMANTIC_POLICY sul
   server), solo quale riscontro mostrare quando il server dice esplicitamente
   che la richiesta sembrava un "ricordati che" e non è stata salvata. */
export type MemoryFeedback = 'none' | 'updated' | 'explicit-updated' | 'explicit-failed';

const updatedIds = new Set<string>();
const explicitUpdatedIds = new Set<string>();
const explicitFailedIds = new Set<string>();
const listeners = new Set<() => void>();
const traces = new Map<string, any>();

try {
  const saved = JSON.parse(sessionStorage.getItem('vinzmon.chat.memory-updated.v1') ?? '[]') as unknown;
  if (Array.isArray(saved)) saved.filter((id): id is string => typeof id === 'string').forEach((id) => updatedIds.add(id));
} catch { /* storage is an optional UI cache */ }

/** Stato completo per un messaggio: quale etichetta (se una) mostrare. */
export function memoryFeedbackFor(messageId: string): MemoryFeedback {
  if (explicitFailedIds.has(messageId)) return 'explicit-failed';
  if (explicitUpdatedIds.has(messageId)) return 'explicit-updated';
  if (updatedIds.has(messageId)) return 'updated';
  return 'none';
}
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
    const result = await response.json().catch(() => ({ status: 'failed' })) as { updated?: boolean; status?: string; warnings?: string[]; explicitRequest?: boolean };
    traces.set(input.messageId, { status: result.updated ? 'UPDATED' : String(result.status ?? (response.ok ? 'NO_CHANGE' : 'FAILED')).toUpperCase(), candidate: 'YES', context: input.context?.length ?? 0, feedback: result.updated ? 'SHOWN' : 'NOT_SHOWN', explicitRequest: result.explicitRequest ?? false, ...(result.warnings?.[0] ? { reason: result.warnings[0] } : {}) });
    if (!response.ok) {
      postRuntimeEvent({ eventType: 'MEMORY_CAPTURE_ERROR', status: 'FAIL', scope: 'memory', statusCode: response.status });
      if (result.explicitRequest) { explicitFailedIds.add(input.messageId); listeners.forEach((listener) => listener()); }
      return;
    }
    postRuntimeEvent({ eventType: 'MEMORY_CAPTURE_OK', status: 'PASS', scope: 'memory', statusCode: response.status });
    if (result.updated) {
      updatedIds.add(input.messageId);
      if (result.explicitRequest) explicitUpdatedIds.add(input.messageId);
      try { sessionStorage.setItem('vinzmon.chat.memory-updated.v1', JSON.stringify([...updatedIds].slice(-200))); } catch { /* optional */ }
      listeners.forEach((listener) => listener());
    } else if (result.explicitRequest) {
      /* Richiesta esplicita, ma niente è stato salvato — il modello ha deciso
         che non c'era un fatto durevole da scrivere, o la scrittura è fallita.
         In entrambi i casi è onesto dirlo: la promessa era "ricordati", non
         "provo a ricordarmi". */
      explicitFailedIds.add(input.messageId);
      listeners.forEach((listener) => listener());
    }
  } catch (error) {
    postRuntimeEvent({ eventType: 'MEMORY_CAPTURE_ERROR', status: 'FAIL', scope: 'memory', errorName: error instanceof Error ? error.name : 'UnknownError' });
    /* Non sappiamo se il testo sembrava un "ricordati che" (non abbiamo
       raggiunto il server): restare in silenzio qui è onesto quanto dirlo,
       e non richiede di duplicare la stessa euristica lato client. */
  }
}
