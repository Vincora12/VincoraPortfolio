import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyDocument, type MeModelDocument, type MeModelStore } from './meModel';
import { memoryWriterMode, writeChatMemory } from './memoryWriter';

function store(initial: MeModelDocument = emptyDocument()): MeModelStore & { writes: number; document: MeModelDocument } {
  let document = structuredClone(initial); let writes = 0;
  return { get writes() { return writes; }, get document() { return document; }, async read() { return structuredClone(document); }, async write(next) { writes += 1; document = structuredClone(next); } };
}

const extraction = { version: '1', memoryWorthy: true, entities: [{ mention: 'FFUOCO', type: 'project' as const }], relations: [{ subject: 'USER', predicate: 'works_on', object: 'FFUOCO', confidence: 0.8 }], episodes: [] };

test('custom mode delegates to the existing writer and preserves its result', async () => {
  const target = store();
  const result = await writeChatMemory(target, { text: 'Sto lavorando a FFUOCO', messageId: 'writer-custom', extraction }, 'custom');
  assert.equal(result.updated, true);
  assert.equal(target.writes, 1);
  assert.equal(target.document.relations.length, 1);
});

test('frozen mode performs no mutation and keeps the client result contract', async () => {
  const target = store();
  const before = JSON.stringify(target.document);
  const result = await writeChatMemory(target, { text: 'Sto lavorando a FFUOCO', messageId: 'writer-frozen', extraction }, 'frozen');
  assert.equal(result.updated, false);
  assert.equal(result.status, 'no_change');
  assert.equal(target.writes, 0);
  assert.equal(JSON.stringify(target.document), before);
  assert.equal(result.created, 0);
  assert.equal(result.episodesCreated, 0);
});

test('unknown writer mode fails safely before any write', async () => {
  const target = store();
  await assert.rejects(() => writeChatMemory(target, { text: 'Sto lavorando a FFUOCO', messageId: 'writer-invalid', extraction }, 'future-engine'), /unknown memory writer mode/);
  assert.equal(target.writes, 0);
  assert.throws(() => memoryWriterMode('future-engine'), /unknown memory writer mode/);
});
