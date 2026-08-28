export type Mem0Result = { updated: boolean; stored: number; raw?: unknown };
const userId = 'vinzmon-user';
function config() { const url = process.env.VINZMON_MEMORY_SERVICE_URL; const secret = process.env.VINZMON_MEMORY_SERVICE_SECRET; if (!url || !secret) throw new Error('Mem0 service is not configured'); return { url: url.replace(/\/$/, ''), secret }; }
async function call(path: string, init: RequestInit = {}) { const c = config(); const response = await fetch(`${c.url}${path}`, { ...init, headers: { authorization: `Bearer ${c.secret}`, 'content-type': 'application/json', ...(init.headers || {}) } }); if (!response.ok) throw new Error(`Mem0 service returned ${response.status}`); return response.json() as Promise<any>; }
export async function addToMem0(input: { text: string; conversationId?: string; messageId?: string }): Promise<Mem0Result> { const raw = await call('/memory/add', { method: 'POST', body: JSON.stringify({ userId, text: input.text, infer: true, metadata: { source: 'chat', conversationId: input.conversationId, messageId: input.messageId } }) }); const stored = Array.isArray(raw?.results) ? raw.results.length : Array.isArray(raw) ? raw.length : raw?.memory ? 1 : 0; return { updated: stored > 0, stored, raw }; }
export async function listMem0(): Promise<unknown> { return call(`/memory/list?userId=${encodeURIComponent(userId)}`); }
export async function searchMem0(query: string, limit = 5): Promise<Array<{ id?: string; text: string; score?: number; metadata?: Record<string, unknown> }>> {
  const raw = await call('/memory/search', { method: 'POST', body: JSON.stringify({ userId, query, limit }) });
  const rows = Array.isArray(raw?.results) ? raw.results : Array.isArray(raw) ? raw : [];
  return rows.flatMap((row: any) => typeof row?.memory === 'string' ? [{ id: row.id, text: row.memory, score: row.score, metadata: row.metadata }] : typeof row?.text === 'string' ? [{ id: row.id, text: row.text, score: row.score, metadata: row.metadata }] : []);
}
