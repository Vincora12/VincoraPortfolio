import type { MeEntity, MeEntityType, MeModelDocument, MeModelStore } from './meModel';

export type EntityResolution =
  | { status: 'match'; entityId: string; confidence: number; reason: string }
  | { status: 'new'; confidence: number; reason: string }
  | { status: 'ambiguous'; candidateIds: string[]; reason: string };

export interface EntityMention { mention: string; type?: MeEntityType; aliases?: string[] }

export function normalizeEntityLabel(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[.,;:!?()[\]{}]+/g, ' ').replace(/\s+/g, ' ');
}

export function findEntityCandidates(document: MeModelDocument, input: EntityMention): MeEntity[] {
  const query = normalizeEntityLabel(input.mention);
  if (!query) return [];
  const labels = [query, ...(input.aliases ?? []).map(normalizeEntityLabel)];
  const entities = input.type === 'user' ? [document.user] : document.entities;
  return entities.filter((entity) => {
    if (entity.status !== 'active' || (input.type && entity.type !== input.type)) return false;
    const entityLabels = [entity.name, ...entity.aliases].map(normalizeEntityLabel);
    return entityLabels.some((label) => labels.includes(label));
  });
}

export async function resolveEntity(store: MeModelStore, input: EntityMention): Promise<EntityResolution> {
  const mention = normalizeEntityLabel(input.mention);
  if (!mention) return { status: 'new', confidence: 0, reason: 'empty mention' };
  const candidates = findEntityCandidates(await store.read(), input);
  if (candidates.length === 1) return { status: 'match', entityId: candidates[0]!.id, confidence: 1, reason: 'exact normalized name or alias' };
  if (candidates.length > 1) return { status: 'ambiguous', candidateIds: candidates.map((candidate) => candidate.id), reason: 'multiple exact candidates remain' };
  return { status: 'new', confidence: 0, reason: 'no exact normalized candidate' };
}
