import type {
  ExportedMessageRepository,
  RemoteThreadListAdapter,
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
    const adapter = persistentAdapter;
    const save = persistSnapshot;
    // createLocalStorageAdapter's documented implementation uses threadId as
    // remoteId. Seed its repository BEFORE publishing thread metadata. Pending
    // history appends and model.run remain behind the same initialize barrier;
    // no later snapshot can overwrite an assistant response.
    session.promoting = (async () => {
      await save(threadId, repository);
      const ready = await adapter.initialize(threadId);
      if (ready.remoteId !== threadId) throw new Error('Unexpected conversation storage identity');
      initialized.set(threadId, ready);
      session.resolve(ready);
      sessions.delete(threadId);
      postRuntimeEvent({ eventType: 'CHAT_THREAD_INITIALIZE_RESOLVED', status: 'PASS', scope: 'chat', metadata: { threadId: threadId.slice(0, 100), local: false, initialized: true } });
      postRuntimeEvent({ eventType: 'CHAT_THREAD_PROMOTE_OK', status: 'PASS', scope: 'chat', metadata: { threadId: threadId.slice(0, 100), local: false, initialized: true } });
      void Promise.resolve().then(async () => {
        postRuntimeEvent({ eventType: 'CHAT_PROMOTION_TIMELINE_PERSISTED', status: 'PASS', scope: 'chat', metadata: { messageCount: repository.messages.length, roleSequence: roles, threadId: threadId.slice(0, 100), local: false, remoteId: ready.remoteId.slice(0, 100) } });
        // Title generation is intentionally done only after promotion. The
        // assistant-ui automatic trigger can run on the Mon greeting before a
        // user message exists and would permanently save the empty fallback.
        const titleMessages = repository.messages.map((item) => item.message);
        await adapter.rename(ready.remoteId, generateVinzChatTitle(titleMessages));
      }).catch((error: unknown) => {
        console.warn('[VINZ chat] persistenza post-promozione non riuscita', error instanceof Error ? error.message : 'errore sconosciuto');
      });
      postRuntimeEvent({ eventType: 'CHAT_PROMOTION_TIMELINE_AFTER', status: 'PASS', scope: 'chat', metadata: { messageCount: repository.messages.length, roleSequence: roles, threadId: threadId.slice(0, 100), local: false, remoteId: ready.remoteId.slice(0, 100) } });
      return ready;
    })().catch((error: unknown) => {
      session.promoting = null;
      throw error;
    });
  }
  return session.promoting;
};

export const discardLocalSession = (threadId: string): void => {
  const session = sessions.get(threadId);
  if (!session) return;
  // Release assistant-ui's pending initialization so it can leave the local
  // runtime. The synthetic id is never written to the persistent adapter.
  session.resolve({ remoteId: threadId });
  sessions.delete(threadId);
};
