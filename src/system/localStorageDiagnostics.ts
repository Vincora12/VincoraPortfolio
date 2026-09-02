type StorageEventType = 'LOCAL_STORAGE_WRITE_START' | 'LOCAL_STORAGE_WRITE_OK' | 'LOCAL_STORAGE_WRITE_ERROR';

function token(): string | null {
  try {
    const raw = localStorage.getItem('vinzmon.prototype.v4');
    const parsed = raw ? JSON.parse(raw) as { state?: { token?: unknown } } : null;
    return typeof parsed?.state?.token === 'string' ? parsed.state.token : null;
  } catch { return null; }
}

function clean(value: unknown, max = 240): string {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/(api[_-]?key|authorization|bearer|token|secret|password)\s*[:=]\s*\S+/gi, '$1=[redacted]').slice(0, max);
}

function prefix(key: string): string {
  const known = [
    'assistant-ui-official-chatgpt:messages:',
    'assistant-ui-official-chatgpt:',
    'vinzmon.prototype.v4',
    'vinzmon.health.journal.v1',
  ].find((item) => key.startsWith(item));
  return known ?? key.split(':', 1)[0]?.slice(0, 100) ?? 'unknown';
}

function bytes(value: string): number {
  try { return new TextEncoder().encode(value).byteLength; } catch { return value.length; }
}

function report(eventType: StorageEventType, source: string, key: string, payloadBytes: number, error?: unknown): void {
  const auth = token();
  if (!auth) return;
  const body = {
    eventType,
    status: eventType === 'LOCAL_STORAGE_WRITE_ERROR' ? 'FAIL' : eventType.endsWith('_OK') ? 'PASS' : 'START',
    scope: 'system',
    action: 'localStorage.setItem',
    source: source.slice(0, 100),
    keyPrefix: prefix(key),
    payloadBytes: Math.max(0, Math.round(payloadBytes)),
    storage: 'localStorage',
    ...(error ? {
      errorName: error instanceof Error ? error.name : undefined,
      errorMessage: clean(error instanceof Error ? error.message : error),
      ...(error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'number'
        ? { errorCode: (error as { code: number }).code } : {}),
    } : {}),
  };
  void fetch('/api/runtime-log', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

export function setLocalStorageItem(source: string, key: string, value: string): void {
  const size = bytes(value);
  report('LOCAL_STORAGE_WRITE_START', source, key, size);
  try {
    localStorage.setItem(key, value);
    report('LOCAL_STORAGE_WRITE_OK', source, key, size);
  } catch (error) {
    report('LOCAL_STORAGE_WRITE_ERROR', source, key, size, error);
    throw error;
  }
}
