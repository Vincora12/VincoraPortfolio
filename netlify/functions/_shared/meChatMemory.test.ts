import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyDocument, type MeModelDocument, type MeModelStore } from './meModel';
import { captureChatMemory, shouldCaptureChatMessage } from './meChatMemory';

function store(initial: MeModelDocument = emptyDocument()): MeModelStore & { document: MeModelDocument } {
  let document = structuredClone(initial);
  return { get document() { return document; }, async read() { return structuredClone(document); }, async write(next) { document = structuredClone(next); } };
}

const extraction = (overrides: Record<string, unknown> = {}) => ({
  version: '1', memoryWorthy: true,
  entities: [{ mention: 'FFUOCO', type: 'project', aliases: [] }],
  relations: [{ subject: 'USER', predicate: 'works_on', object: 'FFUOCO', objectType: 'project', confidence: 0.8 }],
  episodes: [], ...overrides,
});

test('ignores trivial acknowledgements without mutation', async () => {
  assert.equal(shouldCaptureChatMessage('Ok'), false);
  const target = store();
  const result = await captureChatMemory(target, { text: 'Ok', messageId: 'm1' });
  assert.equal(result.status, 'ignored');
  assert.equal(target.document.relations.length, 0);
});

test('creates relation with chat provenance and is idempotent', async () => {
  const target = store();
  const first = await captureChatMemory(target, { text: 'Sto lavorando al progetto FFUOCO.', messageId: 'm1', conversationId: 'c1', extraction: extraction() });
  assert.equal(first.updated, true);
  assert.equal(target.document.relations.length, 1);
  assert.equal(target.document.sources[0]?.type, 'chat');
  const second = await captureChatMemory(target, { text: 'Sto lavorando al progetto FFUOCO.', messageId: 'm1', conversationId: 'c1', extraction: extraction() });
  assert.equal(second.status, 'no_change');
  assert.equal(target.document.relations.length, 1);
});

test('invalid extraction is atomic', async () => {
  const target = store();
  const result = await captureChatMemory(target, { text: 'Mio progetto FFUOCO', messageId: 'm2', extraction: { memoryWorthy: true, relations: [{ subject: 'USER' }] } });
  assert.equal(result.status, 'failed');
  assert.equal(target.document.entities.length, 0);
  assert.equal(target.document.sources.length, 0);
});
