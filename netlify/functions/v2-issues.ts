/* ============================================================================
   V2 ISSUES — conoscenza di prodotto per la ricostruzione pulita (V2)

   VINZ.MON PROTOTYPE V1 → V2 (docs/PROTOTYPE_V1_STATUS.md,
   docs/V2_ISSUES.md). L'utente dice a VINZ.MON cosa registrare per la
   versione finale; questo store è l'unica fonte di verità — non Mem0, non
   la cronologia della Chat, non il Runtime Log, non localStorage.

   🔒 Un unico blob JSON con `consistency: 'strong'`, esattamente come
   state.ts: un solo utente, un elenco che cresce lentamente (poche decine
   di voci, non migliaia), niente bisogno di un indice o di più chiavi.

   🔒 NIENTE scrittura su GitHub da qui. docs/V2_ISSUES.md resta un
   documento leggibile aggiornato a mano/periodicamente da questo store —
   mai il contrario, e mai una scrittura diretta al repository dal server
   di produzione. */

import { getStore } from './_shared/localStore';
import { authorize, denied, json } from './_shared/auth';

const KEY = 'issues';

const AREAS = new Set([
  'CHAT', 'MEMORY', 'ME', 'MON', 'WORLD', 'NARRATIVE', 'PROGRESSION',
  'STORAGE', 'AI', 'LAB', 'UI', 'PERFORMANCE', 'COST', 'OTHER',
]);
const TYPES = new Set(['BUG', 'UX', 'ARCHITECTURE', 'FEATURE', 'PERFORMANCE', 'COST', 'OTHER']);

export interface V2Issue {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  area: string;
  type: string;
  observation: string;
  expectedBehavior?: string;
  finalRequirement?: string;
  status: 'OPEN' | 'CLOSED';
}

interface V2IssuesFile {
  issues: V2Issue[];
}

const store = () => getStore({ name: 'vinzmon-v2-issues', consistency: 'strong' });

export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Conservativa apposta: se non è chiaro, meglio due voci separate che una
 * fusione sbagliata (MASTER SPEC di questo task — "creating a separate
 * issue is safer than incorrectly merging"). Stesso `area` richiesto: due
 * problemi con lo stesso titolo ma in aree diverse restano distinti. */
export function findDuplicate(issues: readonly V2Issue[], area: string, title: string): V2Issue | undefined {
  const normalized = normalizeTitle(title);
  if (normalized.length === 0) return undefined;
  return issues.find((issue) => {
    if (issue.area !== area) return false;
    const existingNormalized = normalizeTitle(issue.title);
    if (existingNormalized === normalized) return true;
    if (existingNormalized.length > 12 && normalized.length > 12) {
      return existingNormalized.includes(normalized) || normalized.includes(existingNormalized);
    }
    return false;
  });
}

export function nextId(issues: readonly V2Issue[]): string {
  const max = issues.reduce((highest, issue) => {
    const match = /^V2-(\d+)$/.exec(issue.id);
    const n = match ? Number(match[1]) : 0;
    return Number.isFinite(n) && n > highest ? n : highest;
  }, 0);
  return `V2-${String(max + 1).padStart(3, '0')}`;
}

export default async function handler(request: Request): Promise<Response> {
  const auth = authorize(request);
  if (!auth.ok) {
    console.warn('[v2-issues] richiesta rifiutata:', auth.reason);
    return denied();
  }

  if (request.method === 'GET') {
    const file = (await store().get(KEY, { type: 'json' })) as V2IssuesFile | null;
    return json({ issues: file?.issues ?? [] });
  }

  if (request.method !== 'POST') return json({ error: 'solo GET e POST' }, 405);

  let incoming: {
    title?: unknown; area?: unknown; type?: unknown; observation?: unknown;
    expectedBehavior?: unknown; finalRequirement?: unknown;
  };
  try {
    incoming = (await request.json()) as typeof incoming;
  } catch {
    return json({ error: 'body non leggibile' }, 400);
  }

  const title = typeof incoming.title === 'string' ? incoming.title.trim().slice(0, 200) : '';
  const observation = typeof incoming.observation === 'string' ? incoming.observation.trim().slice(0, 2000) : '';
  if (title.length === 0 || observation.length === 0) {
    return json({ error: 'titolo e osservazione sono obbligatori' }, 400);
  }
  const area = typeof incoming.area === 'string' && AREAS.has(incoming.area) ? incoming.area : 'OTHER';
  const type = typeof incoming.type === 'string' && TYPES.has(incoming.type) ? incoming.type : 'OTHER';
  const expectedBehavior = typeof incoming.expectedBehavior === 'string' ? incoming.expectedBehavior.trim().slice(0, 2000) : undefined;
  const finalRequirement = typeof incoming.finalRequirement === 'string' ? incoming.finalRequirement.trim().slice(0, 2000) : undefined;

  const file = (await store().get(KEY, { type: 'json' })) as V2IssuesFile | null;
  const issues = file?.issues ?? [];
  const now = new Date().toISOString();

  const duplicate = findDuplicate(issues, area, title);
  if (duplicate) {
    if (!duplicate.observation.includes(observation)) {
      duplicate.observation = `${duplicate.observation}\n\n— (${now.slice(0, 10)}) ${observation}`;
    }
    if (expectedBehavior && !duplicate.expectedBehavior) duplicate.expectedBehavior = expectedBehavior;
    if (finalRequirement && !duplicate.finalRequirement) duplicate.finalRequirement = finalRequirement;
    duplicate.updatedAt = now;
    await store().setJSON(KEY, { issues });
    return json({ issue: duplicate, merged: true });
  }

  const issue: V2Issue = {
    id: nextId(issues),
    createdAt: now,
    updatedAt: now,
    title,
    area,
    type,
    observation,
    ...(expectedBehavior ? { expectedBehavior } : {}),
    ...(finalRequirement ? { finalRequirement } : {}),
    status: 'OPEN',
  };
  issues.push(issue);
  await store().setJSON(KEY, { issues });
  return json({ issue, merged: false });
}

export const config = { path: '/api/v2-issues' };
