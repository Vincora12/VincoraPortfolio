import type {
  ExportedMessageRepository,
  RemoteThreadListAdapter,
  ThreadMessage,
} from "@assistant-ui/react";
import { generateVinzChatTitle } from "./chat-title-generator";
import { postRuntimeEvent } from "@/system/runtimeLog";

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

export const repositoryWithPendingUser = (
  repository: ExportedMessageRepository,
  text: string,
): { repository: ExportedMessageRepository; userId: string } => {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const userId = `msg_${random}`;
  const parentId = repository.messages.at(-1)?.message.id ?? null;
  const message: ThreadMessage = {
    id: userId,
    createdAt: new Date(),
    role: 'user',
    content: [{ type: 'text', text }],
    attachments: [],
    metadata: { custom: {} },
  };
  return {
    userId,
    repository: { ...repository, headId: userId, messages: [...repository.messages, { parentId, message }] },
  };
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
  shouldStartRun: boolean;
  runParentId: string | null;
  reason: "ALREADY_LIVE" | "REPLAYED_NO_RUN" | "REPLAYED_WITH_RUN" | "NO_USER_MESSAGE";
};

/**
 * FIRST TURN INTEGRITY FIX — decides what to do with a repository handed off
 * by promoteLocalSession, WITHOUT ever trusting it more than the live
 * thread. That handoff is captured once, at promotion time; blindly
 * reimporting it later discarded whatever had landed live since (the Mon's
 * opening line arriving asynchronously, or the reply from the run the
 * normal submit already started), and unconditionally starting a new run
 * duplicated that generation. Both risks collapse to the same question:
 * does the live thread already have this data?
 */
export function resolvePromotionHandoff(
  live: ExportedMessageRepository,
  handoff: ExportedMessageRepository,
): PromotionHandoffResolution {
  const alreadyLive = live.messages.some((item) => item.message.id === handoff.headId);
  const current = alreadyLive ? live : handoff;
  const firstUserMessage = handoff.messages.find((item) => item.message.role === "user");
  if (!firstUserMessage) {
    return { shouldImport: !alreadyLive, shouldStartRun: false, runParentId: null, reason: "NO_USER_MESSAGE" };
  }
  const hasReply = current.messages.some((item) => item.parentId === firstUserMessage.message.id);
  return {
    shouldImport: !alreadyLive,
    shouldStartRun: !hasReply,
    runParentId: hasReply ? null : firstUserMessage.message.id,
    reason: alreadyLive ? "ALREADY_LIVE" : hasReply ? "REPLAYED_NO_RUN" : "REPLAYED_WITH_RUN",
  };
}

export const discardLocalSession = (threadId: string): void => {
  const session = sessions.get(threadId);
  if (!session) return;
  // Release assistant-ui's pending initialization so it can leave the local
  // runtime. The synthetic id is never written to the persistent adapter.
  session.resolve({ remoteId: threadId });
  sessions.delete(threadId);
};
