/* ============================================================================
   CORE EXTRACTION PHASE 1 — personal Memory domain boundary.

   VINZ.MON has exactly one canonical personal-memory backend at a time,
   selected server-side by VINZMON_MEMORY_WRITER_MODE ('custom' → ME Model,
   'mem0' → Mem0, 'frozen' → no-op). Before this module, that choice was
   checked independently, with slightly different logic, in three places
   (me-chat-capture.ts, me-memory.ts, machines.ts) — and machines.ts never
   checked it at all, calling listMem0()/searchMem0() unconditionally even
   when the writer mode was 'custom'. That meant the Insight/Reflection/ME
   machines silently tried to read Mem0 regardless of which backend was
   actually canonical — exactly the "pretend Mem0 is active" failure this
   phase exists to remove.

   This module is the single place that knows which backend is active and
   how to read/write it. Everything outside this file — endpoints, the
   machines — asks for a personal-memory operation and gets an answer in a
   backend-neutral shape; it never branches on VINZMON_MEMORY_WRITER_MODE
   itself. No new storage was introduced: ME Model still lives in
   `meModel.ts`/Blobs key `me-model-v1`, Mem0 is still reached only through
   `mem0MemoryClient.ts`. This only centralizes the routing decision.
   ========================================================================= */

import { captureChatMemory, shouldCaptureChatMessage, type ChatMemoryResult } from '../meChatMemory';
import { createMeModelStore, type MeModelDocument, type MeModelStore } from '../meModel';
import { projectMeModel, type MemoryProjection } from '../meMemoryProjection';
import { addToMem0, listMem0, searchMem0 } from '../mem0MemoryClient';
import { callProvider } from '../providers';
import { resolveRoute } from '../routing';

export type MemoryWriterMode = 'custom' | 'mem0' | 'frozen';

export type PersonalMemoryItem = { id?: string; text: string; score?: number; metadata?: Record<string, unknown> };

export type WritePersonalMemoryInput = {
  text: string;
  conversationId?: string;
  messageId?: string;
  context?: Array<{ role: 'user' | 'assistant'; text: string }>;
  preferredModel?: string;
};

export type WritePersonalMemoryResult = { result: ChatMemoryResult; backend: MemoryWriterMode };

const EXTRACTION_INSTRUCTIONS = `You extract persistent personal knowledge from one user chat message. Precision over recall. Return JSON only: {"version":"1","memoryWorthy":boolean,"entities":[{"mention":"...","type":"user|person|project|organization|place|interest|concept|other","aliases":[]}],"relations":[{"subject":"USER or entity mention","predicate":"free string","object":"entity mention" OR "value":"scalar","objectType":"person|project|organization|place|interest|concept|other","confidence":0.0,"validFrom":"ISO if explicit","validTo":"ISO if explicit","explicitReplacement":false}],"episodes":[{"type":"free string","summary":"...","entities":["USER or entity mention"],"importance":0.0,"startedAt":"ISO if explicit","endedAt":"ISO if explicit"}]}. Extract only durable facts, relationships, projects, work, preferences, goals, plans, locations, history, or meaningful events explicitly stated. Ignore filler, one-off requests, transient emotion, calculations and generic opinions. Never infer psychology or write a response. Confidence must be below 1 unless unambiguous; omit unsupported keys.`;
const SEMANTIC_POLICY = `Decide whether the CURRENT USER MESSAGE contains information whose retention could materially improve future continuity, personalization, or understanding of the user and their world. Use RECENT CONTEXT only to interpret the current message. Do not extract old context again unless the current message adds, confirms, corrects or updates it. Judge from meaning, not keywords or predefined categories. Explicit requests to remember something are strong evidence of future relevance, but temporary reminders and tasks are not semantic ME memory. Return only the existing structured schema.`;

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? text;
  return JSON.parse(fenced.trim());
}

const emptyFrozenResult = (): ChatMemoryResult => ({
  status: 'no_change', updated: false, created: 0, updatedCount: 0,
  superseded: 0, episodesCreated: 0, skipped: 0, ambiguities: [],
  warnings: ['memory writer frozen'],
});

/** The single place that decides which personal-memory backend is canonical right now. */
export function memoryBackendMode(value: string | null | undefined = process.env.VINZMON_MEMORY_WRITER_MODE): MemoryWriterMode {
  if (!value || value === 'custom') return 'custom';
  if (value === 'mem0') return 'mem0';
  if (value === 'frozen') return 'frozen';
  throw new Error(`unknown memory writer mode: ${value}`);
}

export function shouldCapturePersonalMemory(text: string): boolean {
  return shouldCaptureChatMessage(text);
}

/** Turns an ME Model document into flat, provider-neutral memory statements (same shape Mem0 rows resolve to). */
export function flattenMeModelDocument(doc: MeModelDocument): PersonalMemoryItem[] {
  const projection: MemoryProjection = projectMeModel(doc);
  const relationItems = projection.relations.map((r) => ({ id: r.id, text: `${r.subject} ${r.predicateLabel} ${r.object || r.value || ''}`.trim() }));
  const episodeItems = projection.episodes.map((e) => ({ id: e.id, text: `${e.type}: ${e.summary}` }));
  return [...relationItems, ...episodeItems];
}

/** Mem0's `/memory/list` and `/memory/search` both resolve to this same row shape. */
export function mem0RowsToItems(raw: unknown): PersonalMemoryItem[] {
  const rows = Array.isArray((raw as { results?: unknown[] })?.results) ? (raw as { results: unknown[] }).results : Array.isArray(raw) ? raw : [];
  return rows.flatMap((row) => {
    const item = row as { id?: string; memory?: unknown; text?: unknown; score?: number; metadata?: Record<string, unknown> };
    const text = typeof item.memory === 'string' ? item.memory : typeof item.text === 'string' ? item.text : '';
    return text ? [{ id: item.id, text, score: item.score, metadata: item.metadata }] : [];
  });
}

function queryTerms(query: string): string[] {
  return (query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
}

/** Deterministic keyword-overlap search, used only when the active backend has no native search (ME Model). */
export function filterByQuery(items: PersonalMemoryItem[], query: string, limit: number): PersonalMemoryItem[] {
  const words = queryTerms(query);
  if (!words.length) return items.slice(0, limit);
  const lower = (text: string) => text.toLowerCase();
  return items.filter((item) => words.some((word) => lower(item.text).includes(word))).slice(0, limit);
}

/** Write one chat message to whichever backend is canonical. Never leaks the backend choice into the result the client sees. */
export async function writePersonalMemory(
  input: WritePersonalMemoryInput,
  mode: string | null | undefined = process.env.VINZMON_MEMORY_WRITER_MODE,
  store: MeModelStore = createMeModelStore(),
): Promise<WritePersonalMemoryResult> {
  const backend = memoryBackendMode(mode);
  if (backend === 'frozen') return { result: emptyFrozenResult(), backend };
  if (backend === 'mem0') {
    const written = await addToMem0({ text: input.text, conversationId: input.conversationId, messageId: input.messageId });
    return {
      result: { ...emptyFrozenResult(), status: written.updated ? 'updated' : 'no_change', updated: written.updated, created: written.stored, warnings: [] },
      backend,
    };
  }
  const route = resolveRoute('text-cheap', input.preferredModel);
  const context = input.context ?? [];
  const response = await callProvider(route.provider, {
    model: route.model,
    system: [{ text: `${SEMANTIC_POLICY}\n\n${EXTRACTION_INSTRUCTIONS}` }],
    turns: [],
    user: `RECENT CONTEXT (interpretive only):\n${context.map((item) => `${item.role}: ${item.text}`).join('\n')}\n\nCURRENT USER MESSAGE (source of any mutation):\n${input.text}`,
    maxTokens: 1800,
  });
  if (!response.ok) throw new Error(response.error ?? 'estrazione non disponibile');
  const result = await captureChatMemory(store, {
    text: input.text,
    conversationId: input.conversationId,
    messageId: input.messageId,
    extraction: extractJson(response.text),
    context,
  });
  return { result, backend };
}

/** Flat, provider-neutral personal-memory list — used by the Insight/Reflection/ME machines. */
export async function listPersonalMemory(store: MeModelStore = createMeModelStore()): Promise<PersonalMemoryItem[]> {
  const backend = memoryBackendMode();
  if (backend === 'frozen') return [];
  if (backend === 'mem0') return mem0RowsToItems(await listMem0());
  return flattenMeModelDocument(await store.read());
}

/** Semantic search where the backend supports it (Mem0); a bounded keyword search over the same list otherwise. */
export async function searchPersonalMemory(query: string, limit = 5, store: MeModelStore = createMeModelStore()): Promise<PersonalMemoryItem[]> {
  const backend = memoryBackendMode();
  if (backend === 'frozen') return [];
  if (backend === 'mem0') return searchMem0(query, limit);
  return filterByQuery(await listPersonalMemory(store), query, limit);
}

/** Exact response shape for `GET /api/me-memory`, whichever backend is active. */
export async function readMeMemoryView(store: MeModelStore = createMeModelStore()): Promise<unknown> {
  const backend = memoryBackendMode();
  if (backend === 'mem0') {
    const memories = mem0RowsToItems(await listMem0());
    return { memories, counts: { memories: memories.length } };
  }
  return projectMeModel(await store.read());
}

/* ⚠️ Found while tracing this domain, fixed as part of it: `POST /api/me-memory` is how the
   live Chat pulls "LONG-TERM MEMORY" into the system prompt on every user message
   (src/assistant-original/netlify-runtime.ts). It only ever called Mem0's real search — in
   'custom' mode (today's default), it always fell through to a 405 and the live Chat silently
   never saw any personal memory at all. That is the exact "pretend Mem0 is active" failure this
   phase exists to remove, and this is the one search-shaped case of it. */
/** Exact response shape for `POST /api/me-memory` (search), on whichever backend is active. */
export async function searchMeMemoryView(query: string, store: MeModelStore = createMeModelStore()): Promise<unknown> {
  return { memories: await searchPersonalMemory(query, 5, store) };
}
