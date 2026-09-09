/** Runtime-only selection. No new memory owner, model call or persistent prompt. */
export type ContextSource = 'memory' | 'me' | 'self' | 'culture' | 'world';
export interface ContextCandidate { source: ContextSource; id: string; text: string; }
export interface ContextDecision {
  source: ContextSource;
  id: string;
  chars: number;
  reason: 'selected' | 'duplicate' | 'already-in-turn' | 'unrelated' | 'limit' | 'empty' | 'world-mismatch';
}
export interface ContextSelection { items: ContextCandidate[]; decisions: ContextDecision[]; }
export const CONTEXT_CHARACTER_BUDGET = 3600;
const STOP = new Set('sono come cosa quando quale quali perché perche questo questa quello quella della delle degli dalla nello nella anche ancora sempre molto posso potrei vorrei puoi vuole stato stata essere avere fatto fare solo tutto tutti niente senza prima dopo have what when with your that this about from they them been would could should myself yourself'.split(' '));
export function normalizeContext(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
const words = (text: string) => new Set(normalizeContext(text).split(' ').filter(w => w.length >= 4 && !STOP.has(w)));
export function relevantToTurn(query: string, text: string): boolean {
  const q = words(query); const t = words(text);
  return [...q].some(w => t.has(w));
}
export function asksAboutSelf(query: string): boolean {
  return /\b(chi sei|come (ti senti|sei cambiato)|su di te|te stesso|tuoi pensieri|tue riflessioni|cosa (pensi|hai imparato) di te)\b/i.test(query);
}
export function asksAboutWorld(query: string, name?: string): boolean {
  const q = normalizeContext(query); const n = normalizeContext(name ?? '');
  return /\b(world|mondo|luogo|viaggio|tune|rise|evoluzione|trasformazione|backup|nul)\b/.test(q)
    || Boolean(n.length > 3 && q.includes(n));
}
export function selectContext(candidates: ContextCandidate[], query: string, recentText = ''): ContextSelection {
  const items: ContextCandidate[] = []; const decisions: ContextDecision[] = [];
  const seen = new Set<string>(); const counts = { memory: 0, me: 0, self: 0, culture: 0, world: 0 };
  const caps = { memory: 5, me: 4, self: 1, culture: 1, world: 3 };
  const turn = normalizeContext(`${recentText}\n${query}`);
  let used = 0;
  for (const candidate of candidates) {
    const text = candidate.text.trim().slice(0, 700); const key = normalizeContext(text);
    let reason: ContextDecision['reason'] = 'selected';
    if (!key) reason = 'empty';
    else if (seen.has(key)) reason = 'duplicate';
    else if (key.length >= 25 && turn.includes(key)) reason = 'already-in-turn';
    else if ((candidate.source === 'self' || candidate.source === 'culture') && !asksAboutSelf(query) && !relevantToTurn(query, text)) reason = 'unrelated';
    else if (counts[candidate.source] >= caps[candidate.source] || used + text.length > CONTEXT_CHARACTER_BUDGET) reason = 'limit';
    decisions.push({ source: candidate.source, id: candidate.id, chars: reason === 'selected' ? text.length : 0, reason });
    if (reason !== 'selected') continue;
    seen.add(key); counts[candidate.source]++; used += text.length;
    items.push({ ...candidate, text });
  }
  return { items, decisions };
}
