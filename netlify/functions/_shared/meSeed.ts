import { createEntity, createEpisode, createRelation, createSource, resolveCanonicalEntityId, type MeEntityType, type MeModelDocument, type MeModelStore } from './meModel';
import { resolveEntity, type EntityMention } from './entityResolver';

export interface SeedEntityCandidate { mention: string; type: MeEntityType; aliases?: string[] }
export interface SeedRelationCandidate { subject: string; predicate: string; object?: string; value?: string | number | boolean | null; confidence: number; validFrom?: string; validTo?: string }
export interface SeedEpisodeCandidate { type: string; summary: string; entities: string[]; importance: number; startedAt?: string; endedAt?: string }
export interface SeedExtraction { version: string; entities: SeedEntityCandidate[]; relations: SeedRelationCandidate[]; episodes: SeedEpisodeCandidate[] }
export interface SeedImportResult { status: 'imported' | 'already_imported' | 'failed'; sourceId?: string; entitiesCreated: number; entitiesReused: number; relationsCreated: number; episodesCreated: number; ambiguities: { mention: string; candidateIds: string[] }[]; skipped: string[]; warnings: string[]; error?: string }

const emptyResult = (status: SeedImportResult['status']): SeedImportResult => ({ status, entitiesCreated: 0, entitiesReused: 0, relationsCreated: 0, episodesCreated: 0, ambiguities: [], skipped: [], warnings: [] });

export function validateSeedExtraction(value: unknown): SeedExtraction {
  if (!value || typeof value !== 'object') throw new Error('extraction must be an object');
  const input = value as Record<string, unknown>;
  if (typeof input.version !== 'string' || !Array.isArray(input.entities) || !Array.isArray(input.relations) || !Array.isArray(input.episodes)) throw new Error('invalid extraction shape');
  const entities = input.entities.map((item) => { const e = item as Record<string, unknown>; if (typeof e.mention !== 'string' || typeof e.type !== 'string') throw new Error('invalid entity candidate'); return { mention: e.mention.trim(), type: e.type as MeEntityType, aliases: Array.isArray(e.aliases) ? e.aliases.filter((x): x is string => typeof x === 'string') : undefined }; });
  const relations = input.relations.map((item) => { const r = item as Record<string, unknown>; if (typeof r.subject !== 'string' || typeof r.predicate !== 'string' || typeof r.confidence !== 'number' || (r.object === undefined && r.value === undefined) || (r.object !== undefined && r.value !== undefined)) throw new Error('invalid relation candidate'); if (r.confidence < 0 || r.confidence > 1) throw new Error('relation confidence out of bounds'); return { subject: r.subject.trim(), predicate: r.predicate.trim(), ...(r.object !== undefined ? { object: String(r.object) } : { value: r.value as string | number | boolean | null }), confidence: r.confidence, ...(typeof r.validFrom === 'string' ? { validFrom: r.validFrom } : {}), ...(typeof r.validTo === 'string' ? { validTo: r.validTo } : {}) }; });
  const episodes = input.episodes.map((item) => { const e = item as Record<string, unknown>; if (typeof e.type !== 'string' || typeof e.summary !== 'string' || !Array.isArray(e.entities) || typeof e.importance !== 'number' || e.importance < 0 || e.importance > 1 || e.entities.some((x) => typeof x !== 'string')) throw new Error('invalid episode candidate'); return { type: e.type.trim(), summary: e.summary.trim(), entities: e.entities as string[], importance: e.importance, ...(typeof e.startedAt === 'string' ? { startedAt: e.startedAt } : {}), ...(typeof e.endedAt === 'string' ? { endedAt: e.endedAt } : {}) }; });
  return { version: input.version, entities, relations, episodes };
}

async function hashSeed(seed: string): Promise<string> { const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed)); return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join(''); }

export async function importMeSeed(store: MeModelStore, seed: string, extract: (seed: string) => Promise<unknown>): Promise<SeedImportResult> {
  const result = emptyResult('failed');
  try {
    const document = await store.read(); document.seedImports ??= [];
    const contentHash = await hashSeed(seed);
    const existing = document.seedImports.find((item) => item.contentHash === contentHash);
    if (existing) return { ...emptyResult('already_imported'), sourceId: existing.sourceId };
    const extraction = validateSeedExtraction(await extract(seed));
    const working = JSON.parse(JSON.stringify(document)) as MeModelDocument;
    const staged: MeModelStore = { read: async () => working, write: async (next) => { Object.assign(working, next); } };
    const entityIds = new Map<string, string>();
    const unresolved = new Set<string>();
    for (const candidate of extraction.entities) {
      const resolution = await resolveEntity(staged, candidate as EntityMention);
      if (resolution.status === 'ambiguous') { unresolved.add(candidate.mention); result.ambiguities.push({ mention: candidate.mention, candidateIds: resolution.candidateIds }); continue; }
      if (resolution.status === 'match') { entityIds.set(candidate.mention, await resolveCanonicalEntityId(staged, resolution.entityId)); result.entitiesReused++; continue; }
      const entity = await createEntity(staged, { name: candidate.mention, type: candidate.type, aliases: candidate.aliases }); entityIds.set(candidate.mention, entity.id); result.entitiesCreated++;
    }
    if (unresolved.size > 0) { result.warnings.push('ambiguous entities were not used'); }
    const source = await createSource(staged, { type: 'me_seed', capturedAt: new Date().toISOString(), description: `ME Seed ${extraction.version} (${contentHash.slice(0, 12)})` });
    result.sourceId = source.id;
    for (const relation of extraction.relations) {
      const subjectId = relation.subject === 'USER' ? working.user.id : entityIds.get(relation.subject);
      const objectId = relation.object ? entityIds.get(relation.object) : undefined;
      if (!subjectId || (relation.object && !objectId) || unresolved.has(relation.subject) || (relation.object && unresolved.has(relation.object))) { result.skipped.push(`relation:${relation.predicate}`); continue; }
      await createRelation(staged, { subjectId, predicate: relation.predicate, ...(objectId ? { objectId } : { value: relation.value }), status: 'active', confidence: relation.confidence, sourceIds: [source.id], ...(relation.validFrom ? { validFrom: relation.validFrom } : {}), ...(relation.validTo ? { validTo: relation.validTo } : {}) }); result.relationsCreated++;
    }
    for (const episode of extraction.episodes) {
      const ids = episode.entities.map((mention) => mention === 'USER' ? document.user.id : entityIds.get(mention)).filter((id): id is string => Boolean(id));
      if (ids.length !== episode.entities.length || episode.entities.some((mention) => unresolved.has(mention))) { result.skipped.push(`episode:${episode.type}`); continue; }
      await createEpisode(staged, { type: episode.type, summary: episode.summary, entityIds: ids, importance: episode.importance, sourceIds: [source.id], status: 'active', ...(episode.startedAt ? { startedAt: episode.startedAt } : {}), ...(episode.endedAt ? { endedAt: episode.endedAt } : {}) }); result.episodesCreated++;
    }
    working.seedImports ??= []; working.seedImports.push({ id: `seed_${contentHash.slice(0, 16)}`, version: extraction.version, importedAt: new Date().toISOString(), sourceId: source.id, contentHash }); await store.write(working);
    return { ...result, status: 'imported' };
  } catch (error) { return { ...result, error: error instanceof Error ? error.message : String(error) }; }
}
