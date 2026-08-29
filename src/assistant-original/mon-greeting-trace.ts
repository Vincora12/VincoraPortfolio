const entries: Array<Record<string, unknown>> = [];

export function traceMonGreeting(event: string, data: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const entry = { timestamp: new Date().toISOString(), event, ...data };
  entries.push(entry);
  if (entries.length > 200) entries.shift();
  console.log("[MON_GREETING_TRACE]", entry);
}

export function getMonGreetingTrace(): string {
  return entries.map((entry) => JSON.stringify(entry)).join("\n");
}
