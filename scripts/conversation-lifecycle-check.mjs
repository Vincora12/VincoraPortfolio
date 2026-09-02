import assert from "node:assert/strict";
import {
  consumePromotedRepository,
  discardLocalSession,
  isLocalUnsavedSession,
  promoteLocalSession,
  resolvePromotionHandoff,
  withLocalUnsavedSession,
} from "../src/assistant-original/conversation-lifecycle-adapter.ts";

let initializeCalls = 0;
const persistent = {
  initialize: async (threadId) => {
    initializeCalls += 1;
    return { remoteId: `saved:${threadId}` };
  },
};
let savedSnapshot = null;
const lifecycle = withLocalUnsavedSession(persistent, async (_remoteId, repository) => {
  savedSnapshot = repository;
});

const pending = lifecycle.initialize("local-a");
assert.equal(initializeCalls, 0, "procedural append must not initialize persistence");
assert.equal(isLocalUnsavedSession("local-a"), true);

const snapshot = { messages: [{ message: { id: "enter" } }, { message: { id: "greeting" } }, { message: { id: "user" } }] };
const promoted = await promoteLocalSession("local-a", snapshot);
assert.deepEqual(promoted, { remoteId: "saved:local-a" });
assert.deepEqual(await pending, promoted, "the same pending runtime becomes persistent");
assert.equal(initializeCalls, 1, "promotion initializes exactly once");
assert.equal(savedSnapshot, snapshot, "complete local timeline is stored before handoff");
assert.equal(consumePromotedRepository("saved:local-a"), snapshot, "new runtime receives the complete timeline");
assert.equal(consumePromotedRepository("saved:local-a"), null, "handoff is consumed exactly once");
assert.equal(isLocalUnsavedSession("local-a"), false);
assert.deepEqual(await lifecycle.initialize("local-a"), promoted);
assert.equal(initializeCalls, 1, "post-promotion initialization reuses the canonical id");

void lifecycle.initialize("local-empty");
assert.equal(isLocalUnsavedSession("local-empty"), true);
discardLocalSession("local-empty");
assert.equal(isLocalUnsavedSession("local-empty"), false, "abandoned local chat is discarded");

// FIRST TURN INTEGRITY FIX — resolvePromotionHandoff must never let a stale
// handoff snapshot overwrite live data, and must never start a second run
// for a user message that already has a reply. CASE E (reload persists the
// timeline) and CASE F (Chat -> Mon -> Chat does not re-promote) are already
// covered above by the untouched promoteLocalSession/isLocalUnsavedSession
// assertions: this fix does not touch either mechanism.

const msg = (id, role, parentId = null) => ({ parentId, message: { id, role } });

// CASE A — opening already live before send: handoff and live agree.
{
  const handoff = {
    headId: "user-a",
    messages: [msg("enter"), msg("greeting", "assistant", "enter"), msg("user-a", "user", "greeting")],
  };
  const liveNoReplyYet = { headId: "user-a", messages: handoff.messages };
  const beforeRun = resolvePromotionHandoff(liveNoReplyYet, handoff);
  assert.equal(beforeRun.shouldImport, false, "CASE A: opening already live, no reimport needed");
  assert.equal(beforeRun.shouldStartRun, true, "CASE A: exactly one run must start when no reply exists yet");
  assert.equal(beforeRun.runParentId, "user-a");

  const liveWithReply = { headId: "reply-a", messages: [...handoff.messages, msg("reply-a", "assistant", "user-a")] };
  const afterRun = resolvePromotionHandoff(liveWithReply, handoff);
  assert.equal(afterRun.shouldImport, false, "CASE A: still no reimport once the real reply exists");
  assert.equal(afterRun.shouldStartRun, false, "CASE A: never a second run once one reply already exists");
}

// CASE B — the Mon's opening arrives during promotion: the handoff was
// captured before it landed, but it is already live by the time this runs.
{
  const handoff = { headId: "user-b", messages: [msg("enter"), msg("user-b", "user", "enter")] };
  const liveWithLateGreeting = {
    headId: "user-b",
    messages: [msg("enter"), msg("greeting", "assistant", "enter"), msg("user-b", "user", "greeting")],
  };
  const resolution = resolvePromotionHandoff(liveWithLateGreeting, handoff);
  assert.equal(resolution.shouldImport, false, "CASE B: live already has the user message; the late greeting must not be overwritten");
  assert.equal(resolution.shouldStartRun, true, "CASE B: exactly one run must still start");
}

// CASE C — the opening (and the real reply) arrive only after the handoff
// was captured: a stale reimport must never erase them.
{
  const handoff = { headId: "user-c", messages: [msg("enter"), msg("user-c", "user", "enter")] };
  const liveWithGreetingAfterReply = {
    headId: "greeting-late",
    messages: [
      msg("enter"),
      msg("user-c", "user", "enter"),
      msg("reply-c", "assistant", "user-c"),
      msg("greeting-late", "assistant", "reply-c"),
    ],
  };
  const resolution = resolvePromotionHandoff(liveWithGreetingAfterReply, handoff);
  assert.equal(resolution.shouldImport, false, "CASE C: a stale handoff must never overwrite messages that landed live after it");
  assert.equal(resolution.shouldStartRun, false, "CASE C: the reply already live must not be regenerated");
}

// CASE D — the first user message keeps one messageId end to end, and
// resolving the same handoff again (even if it somehow happened) must never
// duplicate the run.
{
  const handoff = { headId: "user-d", messages: [msg("user-d", "user")] };
  const first = resolvePromotionHandoff({ headId: "user-d", messages: handoff.messages }, handoff);
  assert.equal(first.runParentId, "user-d", "CASE D: the run must target the real first user message id, never a copy");
  const liveAfterFirstRun = { headId: "reply-d", messages: [...handoff.messages, msg("reply-d", "assistant", "user-d")] };
  const second = resolvePromotionHandoff(liveAfterFirstRun, handoff);
  assert.equal(second.shouldStartRun, false, "CASE D: resolving the same handoff again must never duplicate the run");
}

console.log("Conversation lifecycle checks passed.");
