import assert from 'node:assert/strict';
import test from 'node:test';
import { archiveEntity, archiveEpisode, createEntity, createEpisode, createRelation, createSource, emptyDocument, mergeEntities, resolveCanonicalEntityId, supersedeRelation, updateEntity, type MeModelDocument, type MeModelStore } from './meModel';
import { findEntityCandidates, normalizeEntityLabel, resolveEntity } from './entityResolver';
import { importMeSeed, validateSeedExtraction } from './meSeed';

function fakeStore(): MeModelStore {
  let document: MeModelDocument = emptyDocument();
  return { read: async () => document, write: async (next) => { document = next; } };
}

test('ME Model core validates identity, provenance, lifecycle and supersede', async () => {
  const store = fakeStore();
  const user = (await store.read()).user;
  const same = await createEntity(store, { type: 'project', name: 'VINZ.MON', aliases: ['Vinz'] });
  assert.equal(normalizeEntityLabel(' FFUOCO '), normalizeEntityLabel('ffuoco'));
  assert.equal((await resolveEntity(store, { mention: 'vinz.mon', type: 'project' })).status, 'match');
  await updateEntity(store, same.id, { aliases: ['Vinz', 'VINZ'] });
  await archiveEntity(store, same.id);
  const source = await createSource(store, { type: 'manual', capturedAt: new Date().toISOString(), description: 'test' });
  const relation = await createRelation(store, { subjectId: user.id, predicate: 'works_on', objectId: same.id, status: 'active', confidence: 0.8, sourceIds: [source.id] });
  await assert.rejects(() => createRelation(store, { subjectId: user.id, predicate: 'bad', value: 'x', status: 'active', confidence: 1.1, sourceIds: [] }));
  const replacement = await supersedeRelation(store, relation.id, { subjectId: user.id, predicate: 'works_on', value: 'another project', status: 'active', validFrom: new Date().toISOString(), confidence: 0.9, sourceIds: [source.id] });
  const after = await store.read();
  assert.equal(after.relations.find((item) => item.id === relation.id)?.status, 'superseded');
  assert.equal(after.relations.some((item) => item.id === replacement.id), true);
  const episode = await createEpisode(store, { type: 'travel', summary: 'Canada trip', entityIds: [user.id], sourceIds: [source.id], importance: 0.75, status: 'active' });
  await archiveEpisode(store, episode.id);
  assert.equal((await store.read()).episodes[0]?.status, 'archived');
});

test('entity resolution distinguishes type and preserves explicit merges', async () => {
  const store = fakeStore();
  const person = await createEntity(store, { type: 'person', name: 'Jordan' });
  const place = await createEntity(store, { type: 'place', name: 'Jordan' });
  assert.equal((await resolveEntity(store, { mention: 'Jordan', type: 'person' })).status, 'match');
  assert.equal((await resolveEntity(store, { mention: 'Jordan' })).status, 'ambiguous');
  assert.equal((await resolveEntity(store, { mention: 'Unknown' })).status, 'new');
  await mergeEntities(store, person.id, place.id);
  assert.equal((await resolveCanonicalEntityId(store, person.id)), place.id);
  assert.equal(findEntityCandidates(await store.read(), { mention: 'Jordan', type: 'person' }).length, 0);
  await assert.rejects(() => mergeEntities(store, 'entity_user', place.id));
});

test('ME Seed validates, resolves, persists provenance atomically and is idempotent', async () => {
  const store = fakeStore();
  const existing = await createEntity(store, { type: 'project', name: 'FFUOCO', aliases: ['Fuoco'] });
  const extraction = { version: '1', entities: [{ mention: 'Fuoco', type: 'project' }, { mention: 'Alberto', type: 'person' }], relations: [{ subject: 'USER', predicate: 'works_on', object: 'Fuoco', confidence: 0.85 }], episodes: [{ type: 'travel', summary: 'Canada trip', entities: ['USER', 'Alberto'], importance: 0.7 }] };
  assert.equal(validateSeedExtraction(extraction).version, '1');
  const first = await importMeSeed(store, 'I work on FFUOCO and travelled to Canada with Alberto.', async () => extraction);
  assert.equal(first.status, 'imported'); assert.equal(first.entitiesReused, 1); assert.equal(first.relationsCreated, 1); assert.equal(first.episodesCreated, 1);
  const doc = await store.read(); assert.equal(doc.relations[0]?.sourceIds[0], first.sourceId); assert.equal(doc.episodes[0]?.sourceIds[0], first.sourceId); assert.equal(doc.entities.some((e) => e.id === existing.id), true);
  const second = await importMeSeed(store, 'I work on FFUOCO and travelled to Canada with Alberto.', async () => { throw new Error('extract called twice'); });
  assert.equal(second.status, 'already_imported');
});

test('ME Seed skips ambiguous dependencies and leaves model unchanged on extraction failure', async () => {
  const store = fakeStore(); await createEntity(store, { type: 'person', name: 'Jordan' }); await createEntity(store, { type: 'person', name: 'Jordan Two', aliases: ['Jordan'] }); await createEntity(store, { type: 'place', name: 'Jordan' });
  const before = JSON.stringify(await store.read());
  const out = await importMeSeed(store, 'Jordan', async () => ({ version: '1', entities: [{ mention: 'Jordan', type: 'person' }], relations: [], episodes: [] }));
  assert.equal(out.status, 'imported'); assert.equal(out.ambiguities.length, 1);
  const after = JSON.stringify(await store.read());
  const failed = await importMeSeed(store, 'bad', async () => ({ nope: true })); assert.equal(failed.status, 'failed');
  assert.equal(JSON.stringify(await store.read()), after); assert.notEqual(before, after);
});
