import assert from "node:assert/strict";
import {
  discardLocalSession,
  isLocalUnsavedSession,
  promoteLocalSession,
  withLocalUnsavedSession,
} from "../src/assistant-original/conversation-lifecycle-adapter.ts";

let initializeCalls = 0;
const persistent = {
  initialize: async (threadId) => {
    initializeCalls += 1;
    return { remoteId: `saved:${threadId}` };
  },
};
const lifecycle = withLocalUnsavedSession(persistent);

const pending = lifecycle.initialize("local-a");
assert.equal(initializeCalls, 0, "procedural append must not initialize persistence");
assert.equal(isLocalUnsavedSession("local-a"), true);

const promoted = await promoteLocalSession("local-a");
assert.deepEqual(promoted, { remoteId: "saved:local-a" });
assert.deepEqual(await pending, promoted, "the same pending runtime becomes persistent");
assert.equal(initializeCalls, 1, "promotion initializes exactly once");
assert.equal(isLocalUnsavedSession("local-a"), false);
assert.deepEqual(await lifecycle.initialize("local-a"), promoted);
assert.equal(initializeCalls, 1, "post-promotion initialization reuses the canonical id");

void lifecycle.initialize("local-empty");
assert.equal(isLocalUnsavedSession("local-empty"), true);
discardLocalSession("local-empty");
assert.equal(isLocalUnsavedSession("local-empty"), false, "abandoned local chat is discarded");

console.log("Conversation lifecycle checks passed.");
