import type {
  ExportedMessageRepository,
  RemoteThreadListAdapter,
} from "@assistant-ui/react";

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
    session.promoting = persistentAdapter.initialize(threadId).then(async (result) => {
      await persistSnapshot!(result.remoteId, repository);
      initialized.set(threadId, result);
      session.resolve(result);
      sessions.delete(threadId);
      return result;
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
