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
import { importMeSeed, type SeedImportResult } from '../meSeed';
import { addToMem0, listMem0, searchMem0 } from '../mem0MemoryClient';
import { callProvider } from '../providers';
import { resolveRoute } from '../routing';
import { recordSpend } from '../spend';

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

/* ⚠️ Found while tracing ME Seed (CORE EXTRACTION PHASE 2): neither this module's own chat
   extraction call nor me-seed.ts's extraction call ever recorded spend — unlike every other
   LLM call site in this codebase (ai.ts, machines.ts, shortcut.ts, evolution-background.ts,
   lab-duel-background.ts all call recordSpend). Their cost was real but invisible to the USAGE
   ledger, and — since other call sites check that same ledger against the monthly cap before
   spending — the cap they check against was itself computed from an incomplete picture.

   Fixed here as the smallest correct addition: record it. Deliberately NOT wrapped into also
   calling checkCap() before the call — that would be a real behavior change (memory capture
   could start being silently blocked once a user is over budget, which is a product decision
   about fallback UX, not a telemetry fix) and is reported as deferred, not decided here.

   Wrapped in try/catch: a spend-ledger write failure must never turn an otherwise-successful
   personal-memory write into a reported failure — telemetry is not allowed to be that load-bearing. */
async function recordExtractionSpendBestEffort(action: string, model: string, usage: { inputTokens?: number; outputTokens?: number }): Promise<void> {
  if (!usage.inputTokens && !usage.outputTokens) return;
  try {
    await recordSpend('text-cheap', model, usage, { action, subsystem: 'memory' });
  } catch { /* telemetry must not fail the write it is measuring */ }
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
  await recordExtractionSpendBestEffort('me_chat_capture', response.model, response.usage);
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

/* ⚠️ CORE EXTRACTION PHASE 2 — this used to return two entirely different shapes depending on
   the active backend: `{memories:[...], counts:{memories}}` for Mem0, or the full
   `MemoryProjection` (`{counts:{knowledge,entities,episodes}, user, entities, relations,
   episodes, recent}`) for the ME Model. The only real consumer, MeOverview.tsx, inferred which
   one it got with `Array.isArray(memory.memories)` — the Web client guessing the active backend
   from response shape, which is exactly what this boundary exists to prevent.

   Both backends already resolve to the same flat `{id?, text}` shape everywhere else in this
   module (`flattenMeModelDocument`, `mem0RowsToItems`) — reusing that here removes the
   inference entirely instead of adding a second, parallel unification. `backend` is included
   for LAB diagnostics only (SystemLab.tsx); the normal Web client (MeOverview.tsx) does not
   read it and must not need to. */
export type MemoryView = { memories: PersonalMemoryItem[]; counts: { memories: number }; user: string; backend: MemoryWriterMode };

/** Backend-neutral response shape for `GET /api/me-memory`. Same shape on every backend. */
export async function readMeMemoryView(store: MeModelStore = createMeModelStore()): Promise<MemoryView> {
  const backend = memoryBackendMode();
  if (backend === 'mem0') {
    const memories = mem0RowsToItems(await listMem0());
    return { memories, counts: { memories: memories.length }, user: 'Utente', backend };
  }
  const doc = await store.read();
  const memories = flattenMeModelDocument(doc);
  return { memories, counts: { memories: memories.length }, user: doc.user.name || 'Utente', backend };
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

/* ⚠️ CORE EXTRACTION PHASE 2 — ME Seed ownership, traced.

   me-seed.ts used to import `createMeModelStore` from `meModel.ts` directly — a second,
   independent doorway into the same store this module exists to own, alongside chat capture,
   ME memory reads and the Insight/Reflection/ME machines. This wrapper closes that doorway:
   `meModel.ts` should now have exactly one importer, this file.

   What did NOT change: `importMeSeed`'s actual bulk-import mechanics (entity resolution,
   staging, one commit) are untouched in `meSeed.ts` — Seed is a fundamentally different shape
   of operation than `writePersonalMemory` (one whole onboarding transcript staged and committed
   once, with its own content-hash idempotency, vs. one chat message). Folding it into
   `writePersonalMemory` would have been a real rewrite of working, tested logic for no benefit.

   What deliberately did NOT change: Seed still always targets the ME Model, regardless of
   `VINZMON_MEMORY_WRITER_MODE`. It has no Mem0 equivalent today, and gating it on the writer
   mode (e.g. silently no-op'ing in 'mem0' mode) would be a real onboarding behavior change, not
   a boundary cleanup — `docs/MEMORY_LEGACY_FREEZE_AUDIT.md` already named this as its own,
   separately-scoped migration decision. Left exactly as documented there. */
export async function importPersonalMemorySeed(
  seed: string,
  extract: (seed: string) => Promise<unknown>,
  store: MeModelStore = createMeModelStore(),
): Promise<SeedImportResult> {
  return importMeSeed(store, seed, extract);
}
