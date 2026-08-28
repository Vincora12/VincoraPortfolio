import { getStore } from '@netlify/blobs';

export type MeEntityType = 'user' | 'person' | 'project' | 'organization' | 'place' | 'interest' | 'concept' | 'other';
export type MeStatus = 'active' | 'archived' | 'superseded' | 'disputed';
export type MeSourceType = 'chat' | 'me_seed' | 'manual' | 'health' | 'system' | 'derived';
export type MeRelationObject = { objectId: string } | { value: string | number | boolean | null };

export interface MeEntity {
  id: string;
  type: MeEntityType;
  name: string;
  aliases: string[];
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface MeSource {
  id: string;
  type: MeSourceType;
  conversationId?: string;
  messageId?: string;
  referenceId?: string;
  capturedAt: string;
  description?: string;
}

export interface MeRelation {
  id: string;
  subjectId: string;
  predicate: string;
  objectId?: string;
  value?: string | number | boolean | null;
  status: MeStatus;
  validFrom?: string;
  validTo?: string;
  confidence: number;
  sourceIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MeEpisode {
  id: string;
  type: string;
  summary: string;
  startedAt?: string;
  endedAt?: string;
  entityIds: string[];
  importance: number;
  sourceIds: string[];
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface MeSummary {
  version: 1;
  summary: string;
  generatedAt: string;
  sourceRefs: string[];
}

export interface MeModelDocument {
  version: 1;
  user: MeEntity;
  entities: MeEntity[];
  relations: MeRelation[];
  episodes: MeEpisode[];
  sources: MeSource[];
  summary: MeSummary | null;
}

export interface MeModelStore {
  read(): Promise<MeModelDocument>;
  write(document: MeModelDocument): Promise<void>;
}

const KEY = 'me-model-v1';
const STORE = 'vinzmon-state';
const now = (): string => new Date().toISOString();
const id = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

function assertText(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${field} is required`);
  return value.trim();
}

function assertConfidence(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('confidence must be between 0 and 1');
  return value;
}

function assertImportance(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('importance must be between 0 and 1');
  return value;
}

function emptyDocument(userName = 'User'): MeModelDocument {
  const at = now();
  const user: MeEntity = { id: 'entity_user', type: 'user', name: userName, aliases: [], status: 'active', createdAt: at, updatedAt: at };
  return { version: 1, user, entities: [], relations: [], episodes: [], sources: [], summary: null };
}

export function createMeModelStore(): MeModelStore {
  const store = getStore(STORE);
  return {
    async read() {
      const document = (await store.get(KEY, { type: 'json' })) as MeModelDocument | null;
      return document ?? emptyDocument();
    },
    async write(document) {
      await store.setJSON(KEY, document);
    },
  };
}

export async function createEntity(store: MeModelStore, input: Pick<MeEntity, 'type' | 'name'> & Partial<Pick<MeEntity, 'aliases'>>): Promise<MeEntity> {
  const document = await store.read();
  const name = assertText(input.name, 'name');
  const existing = document.entities.find((entity) => entity.status === 'active' && (entity.name.toLowerCase() === name.toLowerCase() || (input.aliases ?? []).some((alias) => entity.aliases.includes(alias))));
  if (existing) return existing;
  const at = now();
  const entity: MeEntity = { id: id('entity'), type: input.type, name, aliases: input.aliases ?? [], status: 'active', createdAt: at, updatedAt: at };
  document.entities.push(entity);
  await store.write(document);
  return entity;
}

export async function updateEntity(store: MeModelStore, entityId: string, patch: Partial<Pick<MeEntity, 'name' | 'aliases'>>): Promise<MeEntity> {
  const document = await store.read();
  const entity = document.entities.find((item) => item.id === entityId) ?? (document.user.id === entityId ? document.user : undefined);
  if (!entity) throw new Error('entity not found');
  if (patch.name !== undefined) entity.name = assertText(patch.name, 'name');
  if (patch.aliases !== undefined) entity.aliases = patch.aliases;
  entity.updatedAt = now();
  await store.write(document);
  return entity;
}

export async function getEntity(store: MeModelStore, entityId: string): Promise<MeEntity | null> {
  const document = await store.read();
  return document.entities.find((item) => item.id === entityId) ?? (document.user.id === entityId ? document.user : null);
}

export async function archiveEntity(store: MeModelStore, entityId: string): Promise<void> {
  const document = await store.read();
  const entity = document.entities.find((item) => item.id === entityId);
  if (!entity) throw new Error('entity not found');
  entity.status = 'archived'; entity.updatedAt = now();
  await store.write(document);
}

export async function createSource(store: MeModelStore, input: Omit<MeSource, 'id'>): Promise<MeSource> {
  const document = await store.read();
  const source: MeSource = { ...input, id: id('source'), capturedAt: input.capturedAt || now() };
  document.sources.push(source); await store.write(document); return source;
}

export async function getSource(store: MeModelStore, sourceId: string): Promise<MeSource | null> {
  return (await store.read()).sources.find((item) => item.id === sourceId) ?? null;
}

export async function createRelation(store: MeModelStore, input: Omit<MeRelation, 'id' | 'createdAt' | 'updatedAt'>): Promise<MeRelation> {
  const document = await store.read();
  if (!input.objectId && input.value === undefined) throw new Error('relation needs objectId or value');
  if (input.objectId && input.value !== undefined) throw new Error('relation cannot have both objectId and value');
  assertText(input.subjectId, 'subjectId'); assertText(input.predicate, 'predicate');
  const at = now(); const relation: MeRelation = { ...input, id: id('relation'), confidence: assertConfidence(input.confidence), sourceIds: [...input.sourceIds], createdAt: at, updatedAt: at };
  document.relations.push(relation); await store.write(document); return relation;
}

export async function updateRelation(store: MeModelStore, relationId: string, patch: Partial<Pick<MeRelation, 'predicate' | 'objectId' | 'value' | 'status' | 'validFrom' | 'validTo' | 'confidence' | 'sourceIds'>>): Promise<MeRelation> {
  const document = await store.read(); const relation = document.relations.find((item) => item.id === relationId);
  if (!relation) throw new Error('relation not found');
  Object.assign(relation, patch); if (patch.confidence !== undefined) relation.confidence = assertConfidence(patch.confidence); relation.updatedAt = now();
  await store.write(document); return relation;
}

export async function getRelation(store: MeModelStore, relationId: string): Promise<MeRelation | null> {
  return (await store.read()).relations.find((item) => item.id === relationId) ?? null;
}

export async function archiveRelation(store: MeModelStore, relationId: string): Promise<MeRelation> { return updateRelation(store, relationId, { status: 'archived' }); }

export async function supersedeRelation(store: MeModelStore, oldRelationId: string, replacement: Omit<MeRelation, 'id' | 'createdAt' | 'updatedAt'>): Promise<MeRelation> {
  const document = await store.read(); const old = document.relations.find((item) => item.id === oldRelationId);
  if (!old) throw new Error('relation not found');
  const at = now(); old.status = 'superseded'; old.validTo = replacement.validFrom ?? at; old.updatedAt = at;
  if (!replacement.sourceIds.length) replacement.sourceIds = [...old.sourceIds];
  if (!replacement.subjectId) replacement.subjectId = old.subjectId;
  const next: MeRelation = { ...replacement, id: id('relation'), confidence: assertConfidence(replacement.confidence), sourceIds: [...replacement.sourceIds], createdAt: at, updatedAt: at };
  document.relations.push(next); await store.write(document); return next;
}

export async function createEpisode(store: MeModelStore, input: Omit<MeEpisode, 'id' | 'createdAt' | 'updatedAt'>): Promise<MeEpisode> {
  const document = await store.read(); const at = now();
  const episode: MeEpisode = { ...input, id: id('episode'), summary: assertText(input.summary, 'summary'), importance: assertImportance(input.importance), entityIds: [...input.entityIds], sourceIds: [...input.sourceIds], createdAt: at, updatedAt: at };
  document.episodes.push(episode); await store.write(document); return episode;
}

export async function updateEpisode(store: MeModelStore, episodeId: string, patch: Partial<Pick<MeEpisode, 'type' | 'summary' | 'startedAt' | 'endedAt' | 'entityIds' | 'sourceIds' | 'importance' | 'status'>>): Promise<MeEpisode> {
  const document = await store.read(); const episode = document.episodes.find((item) => item.id === episodeId); if (!episode) throw new Error('episode not found');
  Object.assign(episode, patch); if (patch.summary !== undefined) episode.summary = assertText(patch.summary, 'summary'); if (patch.importance !== undefined) episode.importance = assertImportance(patch.importance); episode.updatedAt = now(); await store.write(document); return episode;
}

export async function getEpisode(store: MeModelStore, episodeId: string): Promise<MeEpisode | null> {
  return (await store.read()).episodes.find((item) => item.id === episodeId) ?? null;
}

export async function archiveEpisode(store: MeModelStore, episodeId: string): Promise<MeEpisode> { return updateEpisode(store, episodeId, { status: 'archived' }); }

export async function setSummary(store: MeModelStore, summary: Omit<MeSummary, 'version'>): Promise<MeSummary> {
  const document = await store.read(); const next: MeSummary = { version: 1, ...summary }; document.summary = next; await store.write(document); return next;
}

export { emptyDocument, KEY as ME_MODEL_KEY };
