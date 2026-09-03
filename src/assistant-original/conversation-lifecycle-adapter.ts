import { createContext } from "react";
import type {
  ExportedMessageRepository,
  RemoteThreadListAdapter,
  ThreadHistoryAdapter,
  ThreadMessage,
} from "@assistant-ui/react";
import { generateVinzChatTitle } from "./chat-title-generator";
import { postRuntimeEvent } from "@/system/runtimeLog";
import { markNextHistoryReadAsGated } from "@/system/chatLiveDebug";

type RemoteThreadInitializeResponse = Awaited<ReturnType<RemoteThreadListAdapter["initialize"]>>;

type LocalSession = {
  threadId: string;
  promise: Promise<RemoteThreadInitializeResponse>;
  resolve: (value: RemoteThreadInitializeResponse) => void;
  promoting: Promise<RemoteThreadInitializeResponse> | null;
};

const sessions = new Map<string, LocalSession>();
const initialized = new Map<string, RemoteThreadInitializeResponse>();
const handoffs = new Map<string, ExportedMessageRepository>();
let persistentAdapter: RemoteThreadListAdapter | null = null;
let persistSnapshot: ((remoteId: string, repository: ExportedMessageRepository) => Promise<void>) | null = null;

const localSession = (threadId: string): LocalSession => {
  const existing = sessions.get(threadId);
  if (existing) return existing;
  let resolve!: (value: RemoteThreadInitializeResponse) => void;
  const promise = new Promise<RemoteThreadInitializeResponse>((done) => { resolve = done; });
  const session = { threadId, promise, resolve, promoting: null };
  sessions.set(threadId, session);
  return session;
};

/**
 * Keeps assistant-ui's optimistic thread genuinely local. Procedural ENTER and
 * greeting appends may request initialization, but that request stays pending
 * until VINZ sees the first real user-authored message.
 */
export const withLocalUnsavedSession = (
  persistent: RemoteThreadListAdapter,
  saveSnapshot: (remoteId: string, repository: ExportedMessageRepository) => Promise<void>,
): RemoteThreadListAdapter => {
  persistentAdapter = persistent;
  persistSnapshot = saveSnapshot;
  return {
    ...persistent,
    initialize(threadId) {
      const existing = initialized.get(threadId);
      if (existing) return Promise.resolve(existing);
      postRuntimeEvent({ eventType: 'CHAT_THREAD_INITIALIZE_START', status: 'START', scope: 'chat', metadata: { threadId: threadId.slice(0, 100), local: true, initialized: false } });
      return localSession(threadId).promise;
    },
  };
};

export const isLocalUnsavedSession = (threadId: string): boolean => sessions.has(threadId);

export const promoteLocalSession = async (
  threadId: string,
  repository: ExportedMessageRepository,
): Promise<RemoteThreadInitializeResponse | null> => {
  const session = sessions.get(threadId);
  if (!session) return null;
  if (!persistentAdapter || !persistSnapshot) throw new Error("Persistent conversation adapter unavailable");
  if (!session.promoting) {
    const roles = repository.messages.map(({ message }) => message.role).join('/');
    postRuntimeEvent({ eventType: 'CHAT_PROMOTION_TIMELINE_BEFORE', status: 'START', scope: 'chat', metadata: { messageCount: repository.messages.length, roleSequence: roles, threadId: threadId.slice(0, 100), local: true, remoteId: threadId.slice(0, 100) } });
    postRuntimeEvent({ eventType: 'CHAT_THREAD_PROMOTE_START', status: 'START', scope: 'chat', metadata: { threadId: threadId.slice(0, 100), local: true, initialized: false } });
    // The local-storage adapter uses the local id as its persistent id. Start
    // its metadata mutation, but do not put that storage/network work in front
    // of assistant-ui's first model run.
    const initializePersistent = persistentAdapter.initialize(threadId);
    const result: RemoteThreadInitializeResponse = { remoteId: threadId };
    session.promoting = Promise.resolve(result).then((ready) => {
      // Resolve assistant-ui's initialization barrier as soon as ownership is
      // established. Persistence/title work must not sit in front of model.run.
      handoffs.set(ready.remoteId, repository);
      initialized.set(threadId, ready);
      session.resolve(ready);
      sessions.delete(threadId);
      postRuntimeEvent({ eventType: 'CHAT_THREAD_INITIALIZE_RESOLVED', status: 'PASS', scope: 'chat', metadata: { threadId: threadId.slice(0, 100), local: false, initialized: true } });
      postRuntimeEvent({ eventType: 'CHAT_THREAD_PROMOTE_OK', status: 'PASS', scope: 'chat', metadata: { threadId: threadId.slice(0, 100), local: false, initialized: true } });
      void initializePersistent.then(() => persistSnapshot!(ready.remoteId, repository)).then(async () => {
        postRuntimeEvent({ eventType: 'CHAT_PROMOTION_TIMELINE_PERSISTED', status: 'PASS', scope: 'chat', metadata: { messageCount: repository.messages.length, roleSequence: roles, threadId: threadId.slice(0, 100), local: false, remoteId: ready.remoteId.slice(0, 100) } });
        // Title generation is intentionally done only after promotion. The
        // assistant-ui automatic trigger can run on the Mon greeting before a
        // user message exists and would permanently save the empty fallback.
        const titleMessages = repository.messages.map((item) => item.message);
        await persistentAdapter!.rename(ready.remoteId, generateVinzChatTitle(titleMessages));
      }).catch((error: unknown) => {
        console.warn('[VINZ chat] persistenza post-promozione non riuscita', error instanceof Error ? error.message : 'errore sconosciuto');
      });
      postRuntimeEvent({ eventType: 'CHAT_PROMOTION_TIMELINE_AFTER', status: 'PASS', scope: 'chat', metadata: { messageCount: repository.messages.length, roleSequence: roles, threadId: threadId.slice(0, 100), local: false, remoteId: ready.remoteId.slice(0, 100) } });
      return ready;
    });
  }
  return session.promoting;
};

export const newLocalMessageId = (): string => {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `msg_${random}`;
};

/**
 * FIRST TURN — PARKED APPEND FIX. Adds a message to a repository snapshot as
 * the new tail and head, without going through the live runtime at all.
 *
 * This exists because `aui.thread.append()` is NOT safe on an un-promoted
 * local session. Inside assistant-ui's `_runAppend` the message is put in
 * the repository and the call then PARKS on
 * `await this._getInitializePromise?.()` — the initialize barrier that
 * `withLocalUnsavedSession` deliberately keeps pending until promotion.
 * When promotion finally resolves it, every parked call resumes and, for a
 * non-run append (`startRun: false`, which is what the presence messages
 * are), runs `this.repository.resetHead(itsOwnMessageId)`. By then that
 * message has children — the greeting, the user's first message, the
 * assistant's reply — and `resetHead` deletes every descendant. The
 * repository collapses to that one message: the lone SYSTEM root every
 * captured incident ended on.
 *
 * Importing instead reaches the same live result with no barrier to park on
 * and no deferred `resetHead` to fire later.
 */
export function repositoryWithMessage(
  repository: ExportedMessageRepository,
  message: ThreadMessage,
): ExportedMessageRepository {
  const parentId = repository.messages.at(-1)?.message.id ?? null;
  return {
    ...repository,
    headId: message.id,
    messages: [...repository.messages, { parentId, message }],
  };
}

export const repositoryWithPendingUser = (
  repository: ExportedMessageRepository,
  text: string,
): { repository: ExportedMessageRepository; userId: string } => {
  const userId = newLocalMessageId();
  const message: ThreadMessage = {
    id: userId,
    createdAt: new Date(),
    role: 'user',
    content: [{ type: 'text', text }],
    attachments: [],
    metadata: { custom: {} },
  };
  return { userId, repository: repositoryWithMessage(repository, message) };
};

export const consumePromotedRepository = (
  remoteId: string,
): ExportedMessageRepository | null => {
  const repository = handoffs.get(remoteId) ?? null;
  if (repository) handoffs.delete(remoteId);
  return repository;
};

export type PromotionHandoffResolution = {
  shouldImport: boolean;
  reason: "ALREADY_LIVE" | "HANDOFF_APPLIED";
};

/**
 * FIRST TURN — ARCHITECTURAL FIX: promotion is state transfer, not
 * generation. This used to also decide whether to start a run for the
 * handoff's first user message (`shouldStartRun`/`runParentId`) — that
 * responsibility overlapped with the composer submission path
 * (`ComposerPrimaryAction`/`insertAndSend`) and was the confirmed source
 * of the observed DUPLICATE RUN: both this reconciliation and the
 * composer could independently decide "no reply yet, start one." Removed
 * entirely, not guarded — the single owner of generation for a real user
 * message is now `acquireRunOwnership()` below, called only from the
 * composer submission path.
 *
 * What's left is exactly the reconciliation question this handoff
 * mechanism exists for: does the live thread already have this data?
 * Blindly reimporting it discarded whatever had landed live since (the
 * Mon's opening line arriving asynchronously, or the reply from the run
 * the composer already started).
 */
export function resolvePromotionHandoff(
  live: ExportedMessageRepository,
  handoff: ExportedMessageRepository,
): PromotionHandoffResolution {
  const alreadyLive = handoff.headId != null && live.messages.some((item) => item.message.id === handoff.headId);
  return {
    shouldImport: !alreadyLive,
    reason: alreadyLive ? "ALREADY_LIVE" : "HANDOFF_APPLIED",
  };
}

/**
 * FIRST TURN — SINGLE RUN OWNER. The composer submission path
 * (`ComposerPrimaryAction`/`insertAndSend`) owns generation for a real
 * user message. This is the one place that invariant is enforced, so it
 * holds regardless of which caller reaches it or how fast either runs —
 * explicit ownership, not a timing guard: `acquireRunOwnership(id)`
 * returns `true` exactly once per message id, ever, for the life of this
 * module (a real message id is globally unique — this Set never needs
 * clearing, same pattern as `sessions`/`initialized`/`handoffs` above).
 * Any later caller for the SAME id — most notably a promotion-handoff
 * reconciliation racing the composer's own call — gets `false` and must
 * treat that as a no-op.
 */
const ownedRuns = new Set<string>();

export function acquireRunOwnership(parentId: string): boolean {
  if (ownedRuns.has(parentId)) return false;
  ownedRuns.add(parentId);
  return true;
}

export function hasRunOwnership(parentId: string): boolean {
  return ownedRuns.has(parentId);
}

/**
 * FIRST TURN — OPENING MUST NEVER RACE THE USER. `MonPresenceEvents`'
 * automatic greeting is asynchronous (`buildOpening()`); by the time it
 * resolves, a real user message may already exist. A delayed automatic
 * greeting must not insert itself into a conversation the user has
 * already started — existence, not count or timing: this is a semantic
 * rule, not a race fixed by checking "fast enough".
 */
export function openingStillWelcome(
  liveMessages: readonly { message: { role: string } }[],
): boolean {
  return !liveMessages.some((item) => item.message.role === "user");
}

/**
 * FIRST TURN — STALE HISTORY RACE FIX.
 *
 * INVARIANT: history may hydrate an empty/uninitialized thread. Once the
 * current thread has acquired live session state, a late history load must
 * not replace that live session state.
 *
 * Confirmed mechanism (device evidence, 08:11:34 incident): assistant-ui's
 * `useLocalThreadRuntime` calls `LocalThreadRuntimeCore.__internal_load()`
 * unconditionally on mount (`useLocalRuntime.ts`, effect with `[runtime]`
 * deps). `__internal_load()` dispatches `adapters.history.load()` — our
 * `AsyncStorageHistoryAdapter`, an async network read via serverBackedStorage
 * — and, whenever that read resolves, calls `this.repository.import(repo)`
 * unconditionally (`local-thread-runtime-core.ts`). `MessageRepository.import()`
 * always ends in `resetHead(repo.headId ?? …)` (`message-repository.ts`),
 * which DELETES every descendant of that head — genuine deletion from the
 * Map, not a branch switch. If the live thread has already grown past what
 * the read found (ENTER/opening/first exchange appended while the read was
 * still in flight over the network), that growth is a descendant of the
 * read's (older) head and gets deleted the moment the read resolves. This
 * is exactly the observed 2→1 (and separately, 3→1) repository collapse.
 *
 * Root cause is NOT the message count — a `count` comparison was explicitly
 * rejected (CASE E below): a numerically larger but older read must still
 * lose to a smaller but live-current thread. The fix is ownership/lifecycle:
 * once this thread's live repository has acquired live session state — by
 * ANY append (ours or assistant-ui's own composer-submit path, both go
 * through `ThreadHistoryAdapter.append`/`.update`, called synchronously
 * *after* the in-memory repository already mutated) OR by an explicit live
 * `aui.thread.import()` (see `GateMarkLiveContext` below — the confirmed
 * blind spot this left open) — no history read may still
 * resolve into an import. A read already in flight when that happens is
 * checked a second time at resolution and discarded rather than trusted.
 *
 * This wraps the ADAPTER, not `node_modules`: `__internal_load()`'s own
 * `.then((repo) => { if (!repo) return; … })` already tolerates a falsy
 * `load()` result as "nothing to hydrate" — we rely on that documented
 * tolerance, we do not invent it.
 *
 * One gate instance must live exactly as long as one thread's live
 * runtime mount (see `IntegratedChat.tsx`'s `HistoryOwnershipGate`, keyed by
 * `unstable_Provider`'s per-thread remount) — a fresh mount starts
 * un-acquired, so CASE A/D (genuine initial/reload hydration) still load.
 *
 * FIRST TURN — FINAL DISCRIMINATOR (observability only, no gating logic
 * changed here): each instance gets a short runtime-only `gateId`,
 * marked via `markNextHistoryReadAsGated()` immediately before calling
 * `real.load()` so `serverBackedStorage.getItem()` can attach it to the
 * matching `CHAT_STORAGE_READ`/`CHAT_HISTORY_LOAD` event — proving
 * on-device whether a given stale read passed through this gate at all,
 * without changing what the gate decides to do with the result.
 */
function generateGateId(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `hg_${random.replace(/-/g, '').slice(0, 8)}`;
}

/**
 * FIRST TURN — HISTORY OWNERSHIP BLIND SPOT, CLOSED (and, below, re-scoped
 * after being caught wrong on-device). `liveAcquired` used to be set only
 * by `.append()`/`.update()`. The forensic audit confirmed
 * `aui.thread.import()` (`BaseThreadRuntimeCore.import()`) establishes/
 * replaces live session state exactly the same way but never touches the
 * history adapter at all — invisible to the gate. This context is the
 * missing third path: whoever calls `aui.thread.import()` reads the
 * gate's own `markLive` through it and calls it directly.
 *
 * PROVEN WRONG BY DEVICE EVIDENCE (2026-09-03, C · DUPLICATE RUN incident:
 * a real run ending at messageCount=1 with detector E — the live
 * subscribe-diff watcher — blind to it). This used to be a single
 * module-level `currentGateMarkLive` pointer, reasoned safe because
 * "there is only ever one live thread's gate at a time." That premise is
 * false: `RemoteThreadListHookInstanceManager` mounts one
 * `_OuterActiveThreadProvider` — hence one `HistoryOwnershipGate`, hence
 * one gate — per instance it keeps, and it keeps more than the one on
 * screen. Every later gate's creation silently overwrote the pointer, so
 * an import for thread A's own gate could mark thread B's gate live
 * instead, leaving A's own already-in-flight `real.load()` free to
 * resolve later and reimport a stale snapshot over live content — with
 * no count-based detector able to catch it, because a freshly mounted
 * gate/watcher starts with no baseline to compare against.
 *
 * The fix scopes `markLive` the way `RuntimeAdapterProvider` already
 * scopes `adapters.history` itself: as a value provided by
 * `HistoryOwnershipGate` down ITS OWN subtree. A caller anywhere inside
 * that subtree — the only place that specific thread's `aui.thread` is
 * reachable at all — reads the matching gate through `useContext`,
 * regardless of how many sibling gates exist alongside it. */
export const GateMarkLiveContext = createContext<(() => void) | null>(null);

export function createOwnershipGatedHistoryAdapter(
  real: ThreadHistoryAdapter,
): { adapter: ThreadHistoryAdapter; markLive: () => void } {
  let liveAcquired = false;
  const gateId = generateGateId();
  const markLive = () => { liveAcquired = true; };

  const gated: ThreadHistoryAdapter = {
    ...real,
    async load() {
      if (liveAcquired) return undefined as unknown as Awaited<ReturnType<ThreadHistoryAdapter["load"]>>;
      markNextHistoryReadAsGated(gateId);
      const repo = await real.load();
      // A live append or import may have landed while this read was in
      // flight — recheck at resolution, not just at call time.
      if (liveAcquired) return undefined as unknown as Awaited<ReturnType<ThreadHistoryAdapter["load"]>>;
      /* NEW-CHAT WIPE — the confirmed cause of "the first message
         disappears", and why it only ever happened on a NEW chat.
         A brand-new local thread has no stored repository at all, so the
         read resolves to `{ messages: [] }` (parseStoredMessageRepository
         returns that for a missing key — an OBJECT, not null). It is
         therefore truthy, so `__internal_load()`'s own `if (!repo) return;`
         does not skip it, and `MessageRepository.import([])` ends in
         `resetHead(headId ?? messages.at(-1) ?? null)` = `resetHead(null)`
         = `clear()`: the whole live repository is wiped, and the ENTER
         that MonPresenceEvents re-appends right after is the lone SYSTEM
         root every captured incident ended on.

         Ownership could not catch this one: on an un-promoted local
         session `history.append()` is never reached at all, because
         `_runAppend` awaits the initialize barrier that
         `withLocalUnsavedSession` deliberately keeps pending until
         promotion — so ENTER and the greeting live in the repository
         while this adapter has heard nothing. On an already-persistent
         thread the barrier resolves immediately, append marks ownership,
         and the thread is protected — which is exactly why old chats
         always worked.

         The rule is semantic, not a timing guard: an empty stored
         repository carries no information, so applying it can only
         destroy and never add. There is nothing to hydrate FROM it. */
      if (!repo || repo.messages.length === 0) {
        return undefined as unknown as Awaited<ReturnType<ThreadHistoryAdapter["load"]>>;
      }
      return repo;
    },
    async append(item) {
      markLive();
      return real.append(item);
    },
  };
  if (real.update) {
    const update = real.update.bind(real);
    gated.update = async (item) => {
      markLive();
      return update(item);
    };
  }
  return { adapter: gated, markLive };
}

export const discardLocalSession = (threadId: string): void => {
  const session = sessions.get(threadId);
  if (!session) return;
  // Release assistant-ui's pending initialization so it can leave the local
  // runtime. The synthetic id is never written to the persistent adapter.
  session.resolve({ remoteId: threadId });
  sessions.delete(threadId);
};
