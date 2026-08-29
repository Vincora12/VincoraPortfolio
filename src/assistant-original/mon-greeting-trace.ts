export function traceMonGreeting(event: string, data: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  console.log('[MON_GREETING_TRACE]', { timestamp: new Date().toISOString(), event, ...data });
}
