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
    postRuntimeEvent({ eventType: 'CHAT_THREAD_PROMOTE_START', status: 'START', scope: 'chat', metadata: { threadId: threadId.slice(0, 100), local: true, initialized: false } });
    session.promoting = persistentAdapter.initialize(threadId).then((result) => {
      // Resolve assistant-ui's initialization barrier as soon as ownership is
      // established. Persistence/title work must not sit in front of model.run.
      handoffs.set(result.remoteId, repository);
      initialized.set(threadId, result);
      session.resolve(result);
      sessions.delete(threadId);
      postRuntimeEvent({ eventType: 'CHAT_THREAD_INITIALIZE_RESOLVED', status: 'PASS', scope: 'chat', metadata: { threadId: threadId.slice(0, 100), local: false, initialized: true } });
      postRuntimeEvent({ eventType: 'CHAT_THREAD_PROMOTE_OK', status: 'PASS', scope: 'chat', metadata: { threadId: threadId.slice(0, 100), local: false, initialized: true } });
      void persistSnapshot!(result.remoteId, repository).then(async () => {
        // Title generation is intentionally done only after promotion. The
        // assistant-ui automatic trigger can run on the Mon greeting before a
        // user message exists and would permanently save the empty fallback.
        const titleMessages = repository.messages.map((item) => item.message);
        await persistentAdapter!.rename(result.remoteId, generateVinzChatTitle(titleMessages));
      }).catch((error: unknown) => {
        console.warn('[VINZ chat] persistenza post-promozione non riuscita', error instanceof Error ? error.message : 'errore sconosciuto');
      });
      return result;
    });
  }
  return session.promoting;
};

export const consumePromotedRepository = (
  remoteId: string,
): ExportedMessageRepository | null => {
  const repository = handoffs.get(remoteId) ?? null;
  if (repository) handoffs.delete(remoteId);
  return repository;
};

export const discardLocalSession = (threadId: string): void => {
  const session = sessions.get(threadId);
  if (!session) return;
  // Release assistant-ui's pending initialization so it can leave the local
  // runtime. The synthetic id is never written to the persistent adapter.
  session.resolve({ remoteId: threadId });
  sessions.delete(threadId);
};
