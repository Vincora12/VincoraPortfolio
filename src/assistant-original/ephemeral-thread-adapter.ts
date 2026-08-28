import { useEffect, useMemo, useRef, useState } from "react";
import {
  useAui,
  type ExportedMessageRepositoryItem,
  type RemoteThreadListAdapter,
  type ThreadHistoryAdapter,
} from "@assistant-ui/react";
import type {
  RuntimeAdapters,
} from "@assistant-ui/core/react";

type Repository = Awaited<ReturnType<ThreadHistoryAdapter["load"]>>;

const ephemeralRepositories = new Map<string, Repository>();
const promotionTasks = new Map<string, Promise<void>>();

const emptyRepository = (): Repository => ({ messages: [] });

const upsert = (repository: Repository, item: ExportedMessageRepositoryItem) => {
  const messages = [...repository.messages];
  const index = messages.findIndex((entry) => entry.message.id === item.message.id);
  if (index === -1) messages.push(item);
  else messages[index] = item;
  return { ...repository, messages, headId: item.message.id };
};

const removeItems = (
  repository: Repository,
  items: ExportedMessageRepositoryItem[],
) => {
  const removed = new Set(items.map((item) => item.message.id));
  const messages = repository.messages.filter((item) => !removed.has(item.message.id));
  return { ...repository, messages, headId: messages.at(-1)?.message.id ?? null };
};

/**
 * The local runtime may append procedural ENTER/opening messages before the
 * user writes. Keep those records in memory. The first real user message
 * initializes the canonical thread and flushes the complete timeline.
 */
const useEphemeralHistory = (
  baseAdapters: RuntimeAdapters | null | undefined,
): RuntimeAdapters | null | undefined => {
  const aui = useAui();
  const auiRef = useRef(aui);
  const baseHistoryRef = useRef(baseAdapters?.history);
  useEffect(() => {
    auiRef.current = aui;
    baseHistoryRef.current = baseAdapters?.history;
  }, [aui, baseAdapters?.history]);

  const [history] = useState<ThreadHistoryAdapter>(() => ({
    async load() {
      const state = auiRef.current.threadListItem.getState();
      if (state.status === "new") {
        // Establish the repository before returning the first snapshot. The
        // runtime may finish its own hydration after this promise resolves;
        // keeping one shared entry lets later procedural appends survive that
        // reconciliation instead of being replaced by an empty snapshot.
        const repository = ephemeralRepositories.get(state.id) ?? emptyRepository();
        ephemeralRepositories.set(state.id, repository);
        return repository;
      }
      return baseHistoryRef.current?.load() ?? emptyRepository();
    },
    async append(item) {
      const state = auiRef.current.threadListItem.getState();
      const base = baseHistoryRef.current;
      if (!base) return;
      // During initial hydration assistant-ui can briefly report the thread as
      // restoring before switching it to `new`. Once our local repository has
      // seen a procedural item, keep routing writes to that repository so a
      // later empty history snapshot cannot overwrite the greeting.
      const ephemeral = state.status === "new" || ephemeralRepositories.has(state.id);
      if (!ephemeral) {
        await base.append(item);
        return;
      }

      const threadId = state.id;
      const current = ephemeralRepositories.get(threadId) ?? emptyRepository();
      ephemeralRepositories.set(threadId, upsert(current, item));
      if (item.message.role !== "user") return;

      const existingTask = promotionTasks.get(threadId);
      if (existingTask) return existingTask;
      const task = (async () => {
        await auiRef.current.threadListItem.initialize();
        const repository = ephemeralRepositories.get(threadId) ?? emptyRepository();
        for (const buffered of repository.messages) await base.append(buffered);
        ephemeralRepositories.delete(threadId);
      })().finally(() => promotionTasks.delete(threadId));
      promotionTasks.set(threadId, task);
      await task;
    },
    async update(item) {
      const state = auiRef.current.threadListItem.getState();
      if (state.status === "new") {
        const current = ephemeralRepositories.get(state.id) ?? emptyRepository();
        ephemeralRepositories.set(state.id, upsert(current, item));
        return;
      }
      const base = baseHistoryRef.current;
      if (base?.update) await base.update(item);
      else if (base) await base.append(item);
    },
    async delete(items) {
      const state = auiRef.current.threadListItem.getState();
      if (state.status === "new") {
        const current = ephemeralRepositories.get(state.id) ?? emptyRepository();
        ephemeralRepositories.set(state.id, removeItems(current, items));
        return;
      }
      await baseHistoryRef.current?.delete?.(items);
    },
  }));

  return useMemo(
    () => (baseAdapters ? { ...baseAdapters, history } : { history }),
    [baseAdapters, history],
  );
};

export const withEphemeralThreads = (
  base: RemoteThreadListAdapter,
): RemoteThreadListAdapter => {
  const useBaseAdapters = base.unstable_useAdapters;

  return {
    ...base,
    unstable_Provider: undefined,
    unstable_useAdapters: function useDeferredPersistenceAdapters() {
      const baseAdapters = useBaseAdapters?.();
      return useEphemeralHistory(baseAdapters);
    },
  };
};

export const discardEphemeralThread = (threadId: string) => {
  ephemeralRepositories.delete(threadId);
  promotionTasks.delete(threadId);
};
