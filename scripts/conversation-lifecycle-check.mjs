import assert from "node:assert/strict";
import {
  consumePromotedRepository,
  createOwnershipGatedHistoryAdapter,
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

// FIRST TURN — STALE HISTORY RACE FIX. createOwnershipGatedHistoryAdapter
// must decide purely on ownership/timing (has THIS mount's live repository
// been written to?), never on message count — CASE E is the case that
// proves it: five stale messages must still lose to one live-current one.

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

// HISTORY OWNERSHIP CASE A — history arrives before live state: hydration
// is allowed, the genuine initial load path.
{
  const real = {
    load: async () => ({ headId: "m1", messages: [msg("m1", "user")] }),
    append: async () => {},
  };
  const gated = createOwnershipGatedHistoryAdapter(real);
  const result = await gated.load();
  assert.deepEqual(result, { headId: "m1", messages: [msg("m1", "user")] }, "HISTORY A: genuine initial load hydrates normally");
}

// HISTORY OWNERSHIP CASE B — live state exists already; a load arriving
// late must be skipped, and must not even touch storage.
{
  let loadCalls = 0;
  const real = {
    load: async () => { loadCalls += 1; return { headId: "old", messages: [msg("old", "user")] }; },
    append: async () => {},
  };
  const gated = createOwnershipGatedHistoryAdapter(real);
  await gated.append(msg("live-1"));
  const result = await gated.load();
  assert.equal(result, undefined, "HISTORY B: a load arriving after live state must be skipped");
  assert.equal(loadCalls, 0, "HISTORY B: the underlying storage read must not even be attempted once live state exists");
}

// HISTORY OWNERSHIP CASE C — local -> persistent promotion while a history
// read is still in flight: the promoted (live) repository must survive.
{
  const gate = deferred();
  const real = {
    load: async () => { await gate.promise; return { headId: "stale", messages: [msg("stale", "user")] }; },
    append: async () => {},
  };
  const gated = createOwnershipGatedHistoryAdapter(real);
  const loadPromise = gated.load(); // dispatched while the thread was still empty — legitimate at call time
  await gated.append(msg("promoted-1")); // promotion's live append lands mid-flight
  gate.resolve();
  const result = await loadPromise;
  assert.equal(result, undefined, "HISTORY C: a load in flight during promotion must not resurrect the pre-promotion snapshot");
}

// HISTORY OWNERSHIP CASE D — reload of a persistent thread: on a fresh
// mount (nothing live yet), history still loads normally.
{
  const real = {
    load: async () => ({ headId: "d2", messages: [msg("d1", "user"), msg("d2", "assistant", "d1")] }),
    append: async () => {},
  };
  const gated = createOwnershipGatedHistoryAdapter(real);
  const result = await gated.load();
  assert.equal(result.messages.length, 2, "HISTORY D: a fresh mount (reload) still loads its persisted history");
}

// HISTORY OWNERSHIP CASE E — history numerically larger but older must NOT
// win just because it has more messages: count is not freshness.
{
  const gate = deferred();
  const real = {
    load: async () => {
      await gate.promise;
      return { headId: "old-5", messages: [msg("m1"), msg("m2"), msg("m3"), msg("m4"), msg("m5")] };
    },
    append: async () => {},
  };
  const gated = createOwnershipGatedHistoryAdapter(real);
  const loadPromise = gated.load();
  await gated.append(msg("live-1")); // one live-current message
  gate.resolve();
  const result = await loadPromise;
  assert.equal(result, undefined, "HISTORY E: five stale messages must not outrank one live-current message");
}

// HISTORY OWNERSHIP CASE F — history smaller but legitimate on an empty
// thread must still be allowed to load.
{
  const real = {
    load: async () => ({ headId: "f1", messages: [msg("f1", "user")] }),
    append: async () => {},
  };
  const gated = createOwnershipGatedHistoryAdapter(real);
  const result = await gated.load();
  assert.equal(result.messages.length, 1, "HISTORY F: one legitimate message on an empty thread must still load");
}

console.log("Conversation lifecycle checks passed.");
