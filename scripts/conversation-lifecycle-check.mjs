import assert from "node:assert/strict";
import { build } from 'esbuild';
const { outputFiles } = await build({ entryPoints: ['src/assistant-original/conversation-lifecycle-adapter.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { withLocalUnsavedSession, promoteLocalSession, isLocalUnsavedSession, discardLocalSession } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);

let initializeCalls = 0;
const persistent = {
  initialize: async (threadId) => {
    initializeCalls += 1;
    assert.ok(savedSnapshot, 'initial timeline must precede metadata publication');
    return { remoteId: threadId };
  },
  rename: async () => {},
};
let savedSnapshot = null;
const lifecycle = withLocalUnsavedSession(persistent, async (_remoteId, repository) => {
  savedSnapshot = repository;
});

const pending = lifecycle.initialize("local-a");
assert.equal(initializeCalls, 0, "procedural append must not initialize persistence");
assert.equal(isLocalUnsavedSession("local-a"), true);

const snapshot = { headId: 'user', messages: [{ parentId: null, message: { id: "enter", role: 'system' } }, { parentId: 'enter', message: { id: "greeting", role: 'assistant' } }, { parentId: 'greeting', message: { id: "user", role: 'user', attachments: [{ id: 'attachment' }] } }] };
snapshot.messages.forEach(({message}) => { message.content = [{type:'text', text:'Synthetic title fixture'}]; });
const promoted = await promoteLocalSession("local-a", snapshot);
assert.deepEqual(promoted, { remoteId: "local-a" });
assert.deepEqual(await pending, promoted, "the same pending runtime becomes persistent");
assert.equal(initializeCalls, 1, "promotion initializes exactly once");
assert.equal(savedSnapshot, snapshot, "complete local timeline is stored before handoff");
assert.equal(savedSnapshot.messages[2].message.attachments.length, 1, 'attachments are handed off unchanged');
assert.equal(isLocalUnsavedSession("local-a"), false);
assert.deepEqual(await lifecycle.initialize("local-a"), promoted);
assert.equal(initializeCalls, 1, "post-promotion initialization reuses the canonical id");

void lifecycle.initialize("local-empty");
assert.equal(isLocalUnsavedSession("local-empty"), true);
discardLocalSession("local-empty");
assert.equal(isLocalUnsavedSession("local-empty"), false, "abandoned local chat is discarded");

console.log("Conversation lifecycle checks passed.");
