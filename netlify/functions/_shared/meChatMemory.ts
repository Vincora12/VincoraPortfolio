import { createEntityInDocument, type MeEntity, type MeModelDocument, type MeModelStore, type MeRelation } from './meModel';
import { normalizeEntityLabel, resolveEntity } from './entityResolver';

export type ChatMemoryExtraction = {
  version?: string;
  memoryWorthy: boolean;
  entities?: Array<{ mention: string; type: MeEntity['type']; aliases?: string[] }>;
  relations?: Array<{
    subject: string;
    predicate: string;
    object?: string;
    value?: string | number | boolean | null;
    objectType?: MeEntity['type'];
    confidence: number;
    validFrom?: string;
    validTo?: string;
    explicitReplacement?: boolean;
  }>;
  episodes?: Array<{
    type: string;
    summary: string;
    entities?: string[];
    importance: number;
    startedAt?: string;
    endedAt?: string;
  }>;
};

export type ChatMemoryResult = {
  status: 'ignored' | 'updated' | 'no_change' | 'failed';
  updated: boolean;
  created: number;
  updatedCount: number;
  superseded: number;
  episodesCreated: number;
  skipped: number;
  ambiguities: Array<{ mention: string; candidateIds: string[] }>;
  warnings: string[];
};

const emptyResult = (status: ChatMemoryResult['status']): ChatMemoryResult => ({
  status, updated: false, created: 0, updatedCount: 0, superseded: 0,
  episodesCreated: 0, skipped: 0, ambiguities: [], warnings: [],
});

const ACK = /^(ok(ay)?|va bene|bene|s[iì]|no|perfetto|grazie|capito|riprova|continua|lol|haha|👍|👌)[!.… ]*$/iu;
const CALC = /^(quanto fa|calcola|risolvi|converti)\b[\s\d+*/().,%:-]+\??$/iu;

export function shouldCaptureChatMessage(text: string): boolean {
  const value = text.trim();
  if (value.length < 5 || ACK.test(value) || CALC.test(value)) return false;
  // Commands can still contain durable facts ("ricorda che..."); ignore only
  // obvious one-shot formatting requests.
  return true;
}

function assertExtraction(input: unknown): ChatMemoryExtraction {
  if (!input || typeof input !== 'object') throw new Error('extraction must be an object');
  const value = input as Partial<ChatMemoryExtraction>;
  if (typeof value.memoryWorthy !== 'boolean') throw new Error('memoryWorthy is required');
  const entities = value.entities ?? [];
  const relations = value.relations ?? [];
  const episodes = value.episodes ?? [];
  if (!Array.isArray(entities) || !Array.isArray(relations) || !Array.isArray(episodes)) throw new Error('invalid extraction arrays');
  for (const item of entities) {
    if (!item || typeof item.mention !== 'string' || !item.mention.trim() || !item.type) throw new Error('invalid entity candidate');
  }
  for (const item of relations) {
    if (!item || typeof item.subject !== 'string' || !item.subject.trim() || typeof item.predicate !== 'string' || !item.predicate.trim() || typeof item.confidence !== 'number' || item.confidence < 0 || item.confidence > 1) throw new Error('invalid relation candidate');
    if (item.object === undefined && item.value === undefined) throw new Error('relation needs object or value');
  }
  for (const item of episodes) {
    if (!item || typeof item.type !== 'string' || !item.type.trim() || typeof item.summary !== 'string' || !item.summary.trim() || typeof item.importance !== 'number' || item.importance < 0 || item.importance > 1) throw new Error('invalid episode candidate');
  }
  return { version: value.version, memoryWorthy: value.memoryWorthy, entities, relations, episodes };
}

const SINGLE_VALUE = new Set(['lives_in', 'works_at', 'occupation']);
const sameScalar = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const relationEquivalent = (a: MeRelation, subjectId: string, predicate: string, objectId: string | undefined, value: unknown) =>
  a.status === 'active' && a.subjectId === subjectId && a.predicate === predicate && a.objectId === objectId && sameScalar(a.value, value);

export async function captureChatMemory(
  store: MeModelStore,
  input: { text: string; conversationId?: string; messageId?: string; capturedAt?: string; extraction?: unknown; context?: Array<{ role: 'user' | 'assistant'; text: string }> },
): Promise<ChatMemoryResult> {
  if (!shouldCaptureChatMessage(input.text)) return emptyResult('ignored');
  try {
    const document = await store.read();
    const hash = await sha256(input.text.trim());
    const captures = ((document as MeModelDocument & { chatCaptures?: Array<{ messageId?: string; conversationId?: string; contentHash: string }> }).chatCaptures ?? []);
    if (captures.some((item) => (input.messageId && item.messageId === input.messageId) || item.contentHash === hash)) return emptyResult('no_change');
    const extraction = assertExtraction(input.extraction);
    if (!extraction.memoryWorthy) return emptyResult('no_change');

    const staged: MeModelDocument = structuredClone(document);
    const ambiguities: ChatMemoryResult['ambiguities'] = [];
    const skipped: string[] = [];
    const resolved = new Map<string, string>([['USER', staged.user.id], ['user', staged.user.id]]);
    const resolveMention = async (mention: string, type?: MeEntity['type']): Promise<string | null> => {
      const key = normalizeEntityLabel(mention);
      if (resolved.has(key)) return resolved.get(key)!;
      const answer = await resolveEntity({ read: async () => staged, write: async () => {} }, { mention, type });
      if (answer.status === 'ambiguous') { ambiguities.push({ mention, candidateIds: answer.candidateIds }); return null; }
      if (answer.status === 'match') { resolved.set(key, answer.entityId); return answer.entityId; }
      const entity = createEntityInDocument(staged, { type: type ?? 'other', name: mention.trim() });
      resolved.set(key, entity.id); return entity.id;
      
    };
    // Resolve all mentions before planning relations/episodes.
    for (const item of extraction.entities ?? []) await resolveMention(item.mention, item.type);
    for (const item of extraction.relations ?? []) {
      await resolveMention(item.subject, item.subject.toUpperCase() === 'USER' ? 'user' : undefined);
      if (item.object !== undefined) await resolveMention(item.object, item.objectType);
    }
    for (const item of extraction.episodes ?? []) for (const mention of item.entities ?? []) await resolveMention(mention);
    const result = emptyResult('updated');
    result.ambiguities.push(...ambiguities);
    let sourceId: string | undefined;
    const ensureSource = () => {
      if (!sourceId) {
        sourceId = `source_${crypto.randomUUID()}`;
        staged.sources.push({ id: sourceId, type: 'chat', conversationId: input.conversationId, messageId: input.messageId, capturedAt: input.capturedAt ?? new Date().toISOString(), description: input.text.trim().slice(0, 180) });
      }
      return sourceId;
    };
    for (const item of extraction.relations ?? []) {
      const subjectId = resolved.get(normalizeEntityLabel(item.subject));
      const objectId = item.object === undefined ? undefined : resolved.get(normalizeEntityLabel(item.object));
      if (!subjectId || (item.object !== undefined && !objectId) || ambiguities.some((a) => a.mention === item.subject || a.mention === item.object)) { result.skipped += 1; skipped.push(item.predicate); continue; }
      const predicate = item.predicate.trim().toLowerCase();
      const existing = staged.relations.filter((relation) => relation.subjectId === subjectId && relation.predicate === predicate && relation.status === 'active');
      if (existing.some((relation) => relationEquivalent(relation, subjectId, predicate, objectId, item.value))) { continue; }
      if (SINGLE_VALUE.has(predicate) && existing.length && !item.explicitReplacement) { result.skipped += 1; skipped.push(`conflict:${predicate}`); continue; }
      const at = new Date().toISOString();
      if (SINGLE_VALUE.has(predicate) && existing.length && item.explicitReplacement) {
        for (const old of existing) { old.status = 'superseded'; old.validTo = item.validFrom ?? at; old.updatedAt = at; result.superseded += 1; }
      }
      staged.relations.push({ id: `relation_${crypto.randomUUID()}`, subjectId, predicate, ...(objectId ? { objectId } : { value: item.value }), status: 'active', ...(item.validFrom ? { validFrom: item.validFrom } : {}), ...(item.validTo ? { validTo: item.validTo } : {}), confidence: item.confidence, sourceIds: [ensureSource()], createdAt: at, updatedAt: at });
      result.created += 1;
    }
    for (const item of extraction.episodes ?? []) {
      const ids = (item.entities ?? []).map((mention) => resolved.get(normalizeEntityLabel(mention))).filter((id): id is string => Boolean(id));
      if ((item.entities ?? []).some((mention) => !resolved.get(normalizeEntityLabel(mention))) || ambiguities.some((a) => (item.entities ?? []).includes(a.mention))) { result.skipped += 1; continue; }
      const duplicate = staged.episodes.some((episode) => episode.type === item.type.trim() && normalizeEntityLabel(episode.summary) === normalizeEntityLabel(item.summary) && sameScalar(episode.entityIds, ids));
      if (duplicate) continue;
      const at = new Date().toISOString();
      staged.episodes.push({ id: `episode_${crypto.randomUUID()}`, type: item.type.trim(), summary: item.summary.trim(), entityIds: ids, importance: item.importance, sourceIds: [ensureSource()], status: 'active', ...(item.startedAt ? { startedAt: item.startedAt } : {}), ...(item.endedAt ? { endedAt: item.endedAt } : {}), createdAt: at, updatedAt: at });
      result.episodesCreated += 1;
    }
    result.updated = result.created > 0 || result.superseded > 0 || result.episodesCreated > 0;
    result.status = result.updated ? 'updated' : 'no_change';
    if (!result.updated) return result;
    staged.chatCaptures = [...captures, { id: `capture_${crypto.randomUUID()}`, messageId: input.messageId, conversationId: input.conversationId, contentHash: hash, capturedAt: input.capturedAt ?? new Date().toISOString(), result: { ...result, ambiguities, skipped } }];
    await store.write(staged);
    return result;
  } catch (error) {
    const result = emptyResult('failed');
    result.warnings.push(error instanceof Error ? error.message : 'memory capture failed');
    return result;
  }
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export { assertExtraction };
