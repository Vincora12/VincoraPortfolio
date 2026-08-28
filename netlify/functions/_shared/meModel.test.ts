import assert from 'node:assert/strict';
import test from 'node:test';
import { archiveEntity, archiveEpisode, createEntity, createEpisode, createRelation, createSource, emptyDocument, supersedeRelation, updateEntity, type MeModelDocument, type MeModelStore } from './meModel';

function fakeStore(): MeModelStore {
  let document: MeModelDocument = emptyDocument();
  return { read: async () => document, write: async (next) => { document = next; } };
}

test('ME Model core validates identity, provenance, lifecycle and supersede', async () => {
  const store = fakeStore();
  const user = (await store.read()).user;
  const same = await createEntity(store, { type: 'project', name: 'VINZ.MON', aliases: ['Vinz'] });
  assert.equal((await createEntity(store, { type: 'project', name: 'vinz.mon' })).id, same.id);
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
