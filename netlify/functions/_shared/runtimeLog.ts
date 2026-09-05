import { getStore } from '@netlify/blobs';

export type RuntimeStatus = 'START' | 'PASS' | 'FAIL';
export type RuntimeScope = 'chat' | 'ai' | 'memory' | 'progression' | 'system' | 'agent-lab';
export interface RuntimeEvent {
  id: string;
  timestamp: string;
  eventType: string;
  status: RuntimeStatus;
  scope: RuntimeScope;
  action?: string;
  requestId?: string;
  conversationId?: string;
  messageId?: string;
  monId?: string;
  worldId?: string;
  capability?: string;
  provider?: string;
  model?: string;
  durationMs?: number;
  error?: string;
  errorName?: string;
  operation?: string;
  keyPrefix?: string;
  payloadBytes?: number;
  storage?: string;
  source?: string;
  errorMessage?: string;
  errorCode?: number;
  /** Il codice HTTP della risposta — distinto da `errorCode`, che è il
      `DOMException.code` di uno storage pieno, non uno status di rete. */
  statusCode?: number;
  /** Il tetto reale applicato dal server — mai un numero duplicato qui. */
  limitBytes?: number;
  metadata?: Record<string, string | number | boolean>;
}

const STORE = 'vinzmon-runtime-log';
const KEY = 'events';
const MAX_EVENTS = 500;
const RETENTION_MS = 48 * 60 * 60 * 1000;
const ALLOWED_META = new Set([
  'route', 'screen', 'reason', 'count', 'resultCount', 'source',
  /* FIRST TURN OBSERVABILITY ONLY — conteggi/id dell'albero messaggi e
     della chiave di storage che lo persiste, mai il loro contenuto. */
  'caller', 'beforeMessageCount', 'afterMessageCount', 'beforeHeadId', 'afterHeadId',
  'messageCount', 'headId', 'parentId', 'phase',
  /* REPOSITORY MUTATION WATCHER — 'operation' distingue APPEND_ENTER /
     APPEND_GREETING / IMPORT / START_RUN / UNATTRIBUTED_DROP; 'messageId'
     è l'id (mai il contenuto) del messaggio coinvolto, quando noto. */
  'operation', 'messageId',
  /* FIRST TURN — FINAL DISCRIMINATOR — id runtime-only di quale
     createOwnershipGatedHistoryAdapter() ha originato la lettura, mai
     inventato quando la lettura non è passata dal gate. */
  'gateId',
]);

const store = () => getStore(STORE);

function cleanText(value: unknown, max = 240): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/[\r\n\t]+/g, ' ').replace(/Bearer\s+\S+/gi, '[redacted]').replace(/(?:api[_-]?key|secret|token|password)\s*[:=]\s*\S+/gi, '[redacted]');
  return cleaned.slice(0, max);
}

export function sanitizeRuntimeEvent(input: Partial<RuntimeEvent>): RuntimeEvent | null {
  const status = input.status;
  const scope = input.scope;
  if (!['START', 'PASS', 'FAIL'].includes(status ?? '') || !['chat', 'ai', 'memory', 'progression', 'system'].includes(scope ?? '')) return null;
  const metadata = input.metadata && typeof input.metadata === 'object'
    ? Object.fromEntries(Object.entries(input.metadata).filter(([key, value]) => ALLOWED_META.has(key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')).map(([key, value]) => [key, typeof value === 'string' ? cleanText(value, 120) : value]).filter(([, value]) => value !== undefined))
    : undefined;
  return {
    id: typeof input.id === 'string' && input.id.length < 100 ? input.id : (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`),
    timestamp: typeof input.timestamp === 'string' && !Number.isNaN(Date.parse(input.timestamp)) ? input.timestamp : new Date().toISOString(),
    eventType: cleanText(input.eventType, 80) ?? 'UNKNOWN',
    status: status as RuntimeStatus,
    scope: scope as RuntimeScope,
    ...(cleanText(input.action, 80) ? { action: cleanText(input.action, 80) } : {}),
    ...(cleanText(input.requestId, 100) ? { requestId: cleanText(input.requestId, 100) } : {}),
    ...(cleanText(input.conversationId, 120) ? { conversationId: cleanText(input.conversationId, 120) } : {}),
    ...(cleanText(input.messageId, 120) ? { messageId: cleanText(input.messageId, 120) } : {}),
    ...(cleanText(input.monId, 120) ? { monId: cleanText(input.monId, 120) } : {}),
    ...(cleanText(input.worldId, 120) ? { worldId: cleanText(input.worldId, 120) } : {}),
    ...(cleanText(input.capability, 80) ? { capability: cleanText(input.capability, 80) } : {}),
    ...(cleanText(input.provider, 40) ? { provider: cleanText(input.provider, 40) } : {}),
    ...(cleanText(input.model, 80) ? { model: cleanText(input.model, 80) } : {}),
    ...(typeof input.durationMs === 'number' && Number.isFinite(input.durationMs) ? { durationMs: Math.max(0, Math.round(input.durationMs)) } : {}),
    ...(cleanText(input.error, 240) ? { error: cleanText(input.error, 240) } : {}),
    ...(cleanText(input.errorName, 80) ? { errorName: cleanText(input.errorName, 80) } : {}),
    ...(cleanText(input.operation, 80) ? { operation: cleanText(input.operation, 80) } : {}),
    ...(cleanText(input.keyPrefix, 100) ? { keyPrefix: cleanText(input.keyPrefix, 100) } : {}),
    ...(typeof input.payloadBytes === 'number' && Number.isFinite(input.payloadBytes) ? { payloadBytes: Math.max(0, Math.round(input.payloadBytes)) } : {}),
    ...(cleanText(input.storage, 40) ? { storage: cleanText(input.storage, 40) } : {}),
    ...(cleanText(input.source, 100) ? { source: cleanText(input.source, 100) } : {}),
    ...(cleanText(input.errorMessage, 240) ? { errorMessage: cleanText(input.errorMessage, 240) } : {}),
    ...(typeof input.errorCode === 'number' && Number.isFinite(input.errorCode) ? { errorCode: Math.round(input.errorCode) } : {}),
    ...(typeof input.statusCode === 'number' && Number.isFinite(input.statusCode) ? { statusCode: Math.round(input.statusCode) } : {}),
    ...(typeof input.limitBytes === 'number' && Number.isFinite(input.limitBytes) ? { limitBytes: Math.max(0, Math.round(input.limitBytes)) } : {}),
    ...(metadata && Object.keys(metadata).length ? { metadata } : {}),
  };
}

export async function appendRuntimeEvent(input: Partial<RuntimeEvent>): Promise<void> {
  const event = sanitizeRuntimeEvent(input);
  if (!event) return;
  try {
    const current = await store().get(KEY, { type: 'json' }) as RuntimeEvent[] | null;
    const cutoff = Date.now() - RETENTION_MS;
    const events = (Array.isArray(current) ? current : []).filter((item) => item && Date.parse(item.timestamp) >= cutoff);
    events.push(event);
    await store().setJSON(KEY, events.slice(-MAX_EVENTS));
  } catch (error) {
    console.warn('[runtime-log] append failed', cleanText(error instanceof Error ? error.message : 'storage error'));
  }
}

export async function recentRuntimeEvents(): Promise<RuntimeEvent[]> {
  try {
    const current = await store().get(KEY, { type: 'json' }) as RuntimeEvent[] | null;
    const cutoff = Date.now() - RETENTION_MS;
    return (Array.isArray(current) ? current : []).filter((item) => item && Date.parse(item.timestamp) >= cutoff).slice(-MAX_EVENTS).reverse();
  } catch (error) {
    console.warn('[runtime-log] read failed', cleanText(error instanceof Error ? error.message : 'storage error'));
    return [];
  }
}
