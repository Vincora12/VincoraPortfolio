import type { MeEntity, MeModelDocument } from './meModel';

export type MemoryProjection = {
  counts: { knowledge: number; entities: number; episodes: number };
  user: string;
  entities: Array<{ name: string; type: MeEntity['type'] }>;
  relations: Array<{ subject: string; predicate: string; predicateLabel: string; object: string; value?: string }>;
  episodes: Array<{ type: string; summary: string; date?: string; entities: string[] }>;
  recent: Array<{ marker: '+' | '~'; title: string; detail: string; at: string }>;
};

const labels: Record<string, string> = { works_on: 'Lavora su', married_to: 'Sposato con', lives_in: 'Vive a', works_at: 'Lavora presso', occupation: 'Professione', interested_in: 'Interessato a', prefers: 'Preferisce', likes: 'Apprezza', knows: 'Conosce' };
const human = (value: string) => value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const predicateLabel = (p: string) => labels[p] ?? human(p);

export function projectMeModel(doc: MeModelDocument): MemoryProjection {
  const byId = new Map(doc.entities.map((e) => [e.id, e]));
  const canonical = (id: string): string => { const seen = new Set<string>(); let current = id; while (byId.get(current)?.status === 'merged' && byId.get(current)?.mergedInto && !seen.has(current)) { seen.add(current); current = byId.get(current)!.mergedInto!; } return current; };
  const visible = (id: string) => byId.get(canonical(id));
  const activeEntities = doc.entities.filter((e) => e.status === 'active' && e.id !== 'entity_user');
  const relations = doc.relations.filter((r) => r.status === 'active').flatMap((r) => { const subject = visible(r.subjectId); const object = r.objectId ? visible(r.objectId) : undefined; if (!subject || subject.status !== 'active' || (r.objectId && (!object || object.status !== 'active'))) return []; return [{ subject: subject.name, predicate: r.predicate, predicateLabel: predicateLabel(r.predicate), object: object?.name ?? '', ...(r.value == null ? {} : { value: String(r.value) }) }]; });
  const episodes = doc.episodes.filter((e) => e.status === 'active').map((e) => ({ type: e.type, summary: e.summary, date: e.startedAt ?? e.createdAt, entities: e.entityIds.map((id) => visible(id)?.name).filter((x): x is string => Boolean(x)) }));
  const recent = relations.slice(-8).map((r) => ({ marker: '+' as const, title: r.object || r.value || r.subject, detail: r.predicateLabel, at: new Date().toISOString() }));
  return { counts: { knowledge: relations.length, entities: activeEntities.length, episodes: episodes.length }, user: byId.get('entity_user')?.name ?? 'Utente', entities: activeEntities.map((e) => ({ name: e.name, type: e.type })), relations, episodes, recent };
}
