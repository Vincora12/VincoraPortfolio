import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* Stessa strada di scripts/backend-check.mjs, e per la stessa ragione: il
   modulo sotto esame è TypeScript e importa senza estensione
   (`./chat-title-generator`, aggiunto da a596bf9), cosa che
   `node --experimental-strip-types` non sa risolvere. Il controllo non
   partiva PROPRIO — falliva al caricamento del modulo, prima di eseguire
   una sola asserzione — e per tutto quel tempo le invarianti del primo
   turno sono rimaste senza rete di protezione automatica. esbuild
   risolve e impacchetta, Node esegue: nessuna modifica al sorgente,
   nessuna modifica al tsconfig. */
const cwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), "vinz-lifecycle-"));
const entry = join(dir, "entry.ts");
const out = join(cwd, "node_modules", ".vinz-chat-lifecycle.mjs");

writeFileSync(
  entry,
  `export { acquireRunOwnership, consumePromotedRepository, createOwnershipGatedHistoryAdapter, discardLocalSession, hasRunOwnership, isLocalUnsavedSession, notifyLiveSessionImportAcquired, openingStillWelcome, promoteLocalSession, resolvePromotionHandoff, withLocalUnsavedSession } from '${cwd}/src/assistant-original/conversation-lifecycle-adapter.ts';\n`,
);

await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: out,
  logLevel: "error",
  alias: { "@": join(cwd, "src") },
});

const {
  acquireRunOwnership,
  consumePromotedRepository,
  createOwnershipGatedHistoryAdapter,
  discardLocalSession,
  hasRunOwnership,
  isLocalUnsavedSession,
  notifyLiveSessionImportAcquired,
  openingStillWelcome,
  promoteLocalSession,
  resolvePromotionHandoff,
  withLocalUnsavedSession,
} = await import(`file://${out}`);

let initializeCalls = 0;
let renamedTo = null;
const persistent = {
  initialize: async (threadId) => {
    initializeCalls += 1;
    // Deliberately NOT the id promotion resolves on — see below.
    return { remoteId: `saved:${threadId}` };
  },
  rename: async (_remoteId, title) => { renamedTo = title; },
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
/* Since 2f79df0 ("resolve local promotion before storage completion") the
   local id IS the persistent id: promotion resolves on it immediately and
   does NOT wait for the adapter's own initialize to settle, so the first
   model run never queues behind storage/network. This assertion used to
   expect the adapter's returned id ("saved:local-a") and went stale in
   that same commit — unnoticed, because the check could not even load
   its module (see the esbuild note at the top of this file). */
assert.deepEqual(promoted, { remoteId: "local-a" }, "promotion resolves on the local id, without waiting for storage");
assert.deepEqual(await pending, promoted, "the same pending runtime becomes persistent");
assert.equal(initializeCalls, 1, "promotion initializes exactly once");
assert.equal(consumePromotedRepository("local-a"), snapshot, "new runtime receives the complete timeline");
assert.equal(consumePromotedRepository("local-a"), null, "handoff is consumed exactly once");
assert.equal(isLocalUnsavedSession("local-a"), false);
assert.deepEqual(await lifecycle.initialize("local-a"), promoted);
assert.equal(initializeCalls, 1, "post-promotion initialization reuses the canonical id");

// Storage and title work land after the handoff, off the first run's path.
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(savedSnapshot, snapshot, "the complete local timeline is stored once promotion has already resolved");
assert.equal(typeof renamedTo, "string", "the title is generated only after promotion, never before a user message exists");

void lifecycle.initialize("local-empty");
assert.equal(isLocalUnsavedSession("local-empty"), true);
discardLocalSession("local-empty");
assert.equal(isLocalUnsavedSession("local-empty"), false, "abandoned local chat is discarded");

// FIRST TURN — ARCHITECTURAL FIX. resolvePromotionHandoff no longer
// decides run-starting at all (that responsibility moved entirely to
// acquireRunOwnership, tested further below) — it only decides whether a
// stale handoff snapshot may overwrite live data. CASE E (reload persists
// the timeline) and CASE F (Chat -> Mon -> Chat does not re-promote) are
// already covered above by the untouched promoteLocalSession/
// isLocalUnsavedSession assertions: this fix does not touch either
// mechanism.

const msg = (id, role, parentId = null) => ({ parentId, message: { id, role } });

// PROMOTION HANDOFF CASE A — opening already live before send: handoff
// and live agree, whether or not a reply has landed yet — reply presence
// is no longer this function's concern.
{
  const handoff = {
    headId: "user-a",
    messages: [msg("enter"), msg("greeting", "assistant", "enter"), msg("user-a", "user", "greeting")],
  };
  const liveNoReplyYet = { headId: "user-a", messages: handoff.messages };
  const beforeRun = resolvePromotionHandoff(liveNoReplyYet, handoff);
  assert.equal(beforeRun.shouldImport, false, "PROMOTION A: opening already live, no reimport needed");

  const liveWithReply = { headId: "reply-a", messages: [...handoff.messages, msg("reply-a", "assistant", "user-a")] };
  const afterRun = resolvePromotionHandoff(liveWithReply, handoff);
  assert.equal(afterRun.shouldImport, false, "PROMOTION A: still no reimport once the real reply exists");
}

// PROMOTION HANDOFF CASE B — the Mon's opening arrives during promotion:
// the handoff was captured before it landed, but the user message is
// already live by the time this runs.
{
  const handoff = { headId: "user-b", messages: [msg("enter"), msg("user-b", "user", "enter")] };
  const liveWithLateGreeting = {
    headId: "user-b",
    messages: [msg("enter"), msg("greeting", "assistant", "enter"), msg("user-b", "user", "greeting")],
  };
  const resolution = resolvePromotionHandoff(liveWithLateGreeting, handoff);
  assert.equal(resolution.shouldImport, false, "PROMOTION B: live already has the user message; the late greeting must not be overwritten");
}

// PROMOTION HANDOFF CASE C — the opening (and the real reply) arrive only
// after the handoff was captured: a stale reimport must never erase them.
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
  assert.equal(resolution.shouldImport, false, "PROMOTION C: a stale handoff must never overwrite messages that landed live after it");
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

// FIRST TURN — ARCHITECTURAL FIX. Targeted tests for the new single-owner
// pipeline: ownership/state transitions, never message counts or timing.

// CASE 1 — first user send acquires run ownership exactly once.
{
  assert.equal(acquireRunOwnership("case1-user"), true, "CASE 1: the first call for a user id acquires ownership");
  assert.equal(acquireRunOwnership("case1-user"), false, "CASE 1: a second call for the SAME user id must not acquire ownership again");
  assert.equal(hasRunOwnership("case1-user"), true, "CASE 1: ownership, once acquired, stays acquired");
}

// CASE 2 — Composer submission + ConversationLifecycle handoff racing for
// the same user id: the second attempt must not launch a second run.
{
  const composerOwns = acquireRunOwnership("case2-user");
  const lifecycleAttempt = acquireRunOwnership("case2-user");
  assert.equal(composerOwns, true, "CASE 2: the composer submission owns generation for this user id");
  assert.equal(lifecycleAttempt, false, "CASE 2: ConversationLifecycle's later attempt for the same id must be a no-op, not a second run");
}

// CASE 3 — history load in flight, then a live IMPORT (not append) lands:
// the confirmed import() ownership blind spot, now closed — the stale
// read must still be discarded.
{
  const gate = deferred();
  const real = {
    load: async () => { await gate.promise; return { headId: "stale-import", messages: [msg("stale-import", "user")] }; },
    append: async () => {},
  };
  const gated = createOwnershipGatedHistoryAdapter(real);
  const loadPromise = gated.load(); // legitimate at call time — nothing live yet
  notifyLiveSessionImportAcquired(); // simulates promoteBeforeSend's/ConversationLifecycle's aui.thread.import()
  gate.resolve();
  const result = await loadPromise;
  assert.equal(result, undefined, "CASE 3: a live import must protect the thread exactly like append/update does");
}

// CASE 4 — legitimate history load on an untouched runtime: accepted.
{
  const real = {
    load: async () => ({ headId: "case4", messages: [msg("case4", "user")] }),
    append: async () => {},
  };
  const gated = createOwnershipGatedHistoryAdapter(real);
  const result = await gated.load();
  assert.deepEqual(result, { headId: "case4", messages: [msg("case4", "user")] }, "CASE 4: an untouched runtime may still hydrate from history");
}

// CASE 5 — opening resolves before any user message: still welcome.
{
  assert.equal(openingStillWelcome([msg("enter", "system")]), true, "CASE 5: no user message yet — the opening may append");
}

// CASE 6 — opening resolves after a user message already exists: dropped.
{
  assert.equal(
    openingStillWelcome([msg("enter", "system"), msg("case6-user", "user")]),
    false,
    "CASE 6: a real user message already exists — the delayed opening must be dropped",
  );
}

// CASE 7 — fast first send + promotion: live has already grown past the
// handoff (the assistant reply arrived before the handoff was resolved).
// The full timeline — user AND assistant — must be preserved, not
// reimported over.
{
  const handoff = { headId: "case7-user", messages: [msg("enter"), msg("case7-user", "user", "enter")] };
  const liveWithReply = { headId: "case7-reply", messages: [...handoff.messages, msg("case7-reply", "assistant", "case7-user")] };
  const resolution = resolvePromotionHandoff(liveWithReply, handoff);
  assert.equal(resolution.shouldImport, false, "CASE 7: fast first send — user and assistant already live must survive promotion's handoff resolution");
}

// CASE 8 — persistent thread reload: history is loaded normally on a
// fresh, untouched mount (same shape as HISTORY D/CASE 4, stated
// explicitly for the reload scenario the task calls out).
{
  const real = {
    load: async () => ({ headId: "case8-b", messages: [msg("case8-a", "user"), msg("case8-b", "assistant", "case8-a")] }),
    append: async () => {},
  };
  const gated = createOwnershipGatedHistoryAdapter(real);
  const result = await gated.load();
  assert.equal(result.messages.length, 2, "CASE 8: reloading an existing persistent thread still loads its full history");
}

// FIRST TURN — NEW-CHAT WIPE. The confirmed cause of "the first message
// disappears", and why it only ever reproduced on a NEW chat.

// CASE 9 — a brand-new chat has no stored repository, so the read resolves
// to { messages: [] }: an OBJECT, so truthy, so assistant-ui applies it,
// and import([]) ends in resetHead(null) -> clear(). Nothing can be
// hydrated from an empty result: it must never be applied.
{
  let loadCalls = 0;
  const real = {
    load: async () => { loadCalls += 1; return { messages: [] }; },
    append: async () => {},
  };
  const gated = createOwnershipGatedHistoryAdapter(real);
  const result = await gated.load();
  assert.equal(loadCalls, 1, "CASE 9: the read still happens — this is about what we do with it");
  assert.equal(result, undefined, "CASE 9: an empty stored repository must never be applied to a live thread");
}

// CASE 10 — the same, with a headId present but still no messages. Also
// nothing to hydrate, and importing it would still resetHead away.
{
  const real = { load: async () => ({ headId: null, messages: [] }), append: async () => {} };
  const gated = createOwnershipGatedHistoryAdapter(real);
  assert.equal(await gated.load(), undefined, "CASE 10: a headId with no messages is still nothing to hydrate");
}

// CASE 11 — the new-chat ownership blind spot itself: on an un-promoted
// local session history.append() is never reached (in _runAppend it sits
// after the initialize barrier that withLocalUnsavedSession keeps pending
// until promotion), so the gate is NEVER marked. A live thread must
// survive the read anyway — this is the case ownership alone could not
// cover, and the one the device reproduced every time.
{
  const gate = deferred();
  const real = {
    load: async () => { await gate.promise; return { messages: [] }; },
    append: async () => {},
  };
  const gated = createOwnershipGatedHistoryAdapter(real);
  const loadPromise = gated.load();
  // deliberately NO append() and NO import notification: exactly the
  // new-chat situation, where neither can reach this adapter.
  gate.resolve();
  assert.equal(await loadPromise, undefined, "CASE 11: an unowned new chat must still not be wiped by an empty read");
}

// CASE 12 — the guard must not become an excuse to drop real history: a
// non-empty stored repository on an untouched thread still hydrates.
{
  const real = {
    load: async () => ({ headId: "c12-b", messages: [msg("c12-a", "user"), msg("c12-b", "assistant", "c12-a")] }),
    append: async () => {},
  };
  const gated = createOwnershipGatedHistoryAdapter(real);
  const result = await gated.load();
  assert.equal(result.messages.length, 2, "CASE 12: real stored history must still load — the rule is about EMPTY, not about small");
}

console.log("Conversation lifecycle checks passed.");
