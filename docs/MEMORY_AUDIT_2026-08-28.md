# VINZ.MON Memory Audit — 2026-08-28

## 1. Executive Summary

VINZ.MON has several active, overlapping persistence layers, but no general semantic-memory system. The main production “memory” is an append-oriented `Memory[]` event log in Zustand, mirrored in a whole-app Netlify Blob snapshot. Chat extraction is deterministic and narrow: food, workouts, mood, daily signals, meal slots and a few body/stat measures. Health logs live in a separate local journal and are copied into the remote state snapshot. A second, independent lessons/custom-memory book is stored through `/api/lessons` for resolver learning, not personal memory. Generic server-backed key/value storage is used for metadata and micro-state, not as a typed memory store.

Normal chat receives a bounded memory block (six ranked memories, up to five remembered details, truncated bio story), opinions, and the last eight conversational turns. Tool calls can selectively read health/daily records and recent memories, and can write health logs, plans, pages, reminders and memory-like events. There is no embeddings/vector retrieval, confidence model, structured provenance for `Memory`, general contradiction resolution, or user-facing memory editor/deletion path.

## 2. System Map

```text
Chat text / capture / egg / DEV
        │
        ├─ extractFromMessage() [deterministic]
        │       ├─ DailySync signals + moodHistory + meal slot
        │       └─ health/log updates
        ├─ explicit store actions / AI tools
        │       ├─ Memory[] event records
        │       ├─ HealthJournal (local)
        │       └─ Pages / reminders / protocol
        ├─ weekly reflection AI → Opinion[]
        └─ birth/continuity AI → writtenBio

AppState (Zustand local persist)
        └─ snapshotFor() → /api/state → Netlify Blob `vinzmon-state/save`

lessons/customMemory → /api/lessons → Netlify Blob `vinzmon-state/lessons`
generic serverBackedStorage → /api/user-data → Netlify Blob `vinzmon-user-data/data:*`
assistant-ui conversation/thread history → separate thread adapter/storage
```

Active production code is primarily under `src/engine`, `src/state`, `src/ai`, `src/system`, and `netlify/functions`. `src/dev`, `src/lab`, and `src/brain` are development/experimental surfaces unless explicitly imported by the production app.

## 3. Write Paths

### Deterministic chat extraction

- `src/engine/chatExtract.ts:extractFromMessage(text, diet, at)` parses keywords and clock context without an AI call. It returns `signals` (FOOD/WORKOUT/MOOD), `moods`, `measures`, `absence`, food/workout classifications, adherence, `meal`, and `mealFromClock`.
- `src/state/store.ts:applyExtraction` applies only unknown daily signals (manual values win), fills the inferred meal slot, and merges up to three mood inputs for the day. It does not create a general fact record and has no confidence field.
- `sendMessage`, `sendToEgg`, `captureEntry`, and `logInput` are the active triggers. `sendMessage` appends user + pending Mon messages, applies extraction, then requests AI. Egg/capture/input paths also append `Memory` records with deterministic IDs.

### `Memory[]` event records

- Schema: `src/engine/types.ts:Memory` = `{id, day, kind, title, text, monName}`; `MemoryKind` is `conversation | milestone | joke | event | gift | workout`.
- Writes occur in `src/state/store.ts` around `sendToEgg`, `captureEntry`, `logInput`, day/grace/evolution actions, and developer actions. They append with spread (`...s.memories`) and generated IDs based on day/array length.
- `src/state/store.ts:runMonTool` exposes `ToolContext.remember`; despite the name, the active tool `ricorda_di` writes a scheduled reminder (`reminders`), not a `Memory` record. Tool `registra_*` writes health journal state.
- No schema-level validation for `Memory` beyond caller construction; no deduplication, confidence, source, created-at timestamp, expiry, or general merge key. Deletion is not exposed as a normal memory operation. Some day/evolution records are removed by deterministic ID when grace is undone.

### Health and user-domain logs

- `src/engine/healthJournal.ts` persists `MealLog`, `WorkoutLog`, and `WeightLog`; entries contain `id`, ISO `at`, values, and source enum (`chat | manual | dev`). `addMeal`, `addWorkout`, `addWeight` append; fixed meal slots are converted to `extra` when occupied. There is no duplicate detection or confidence/provenance beyond the coarse source enum.
- `src/state/store.ts:runMonTool` provides `logMeal`, `updateMeal`, `logWorkout`, `updateWorkout`, `logWeight`, `updateWeight`, `saveDiet`, `saveWorkoutPlan`, `configureTargets`, `configureHealth`, and `manageMe`. These are deterministic writes initiated by AI tool calls after model selection.
- `src/engine/health.ts` and `src/engine/progression.ts` derive stats/daily state from logs and signals. These are structured runtime state, not semantic memory.

### Opinions, bio and resolver learning

- `src/state/store.ts:maybeReflect` calls `src/ai/reflect.ts:reflectOnWeek` weekly. The AI receives recent `Memory[]` (last seven days), current record and opinions; returned opinions are merged by their IDs/status rules in store. This is derived Mon opinion state, not a user-fact store.
- `src/state/store.ts:writeBio` selects memories from the active Mon’s birth window (born day through seven prior days, max eight) and calls `src/ai/bioWriter.ts:writeBioWithAi`; result is stored as `MonRecord.writtenBio`. It is an overwrite of the generated bio, not an append-only fact ledger.
- `src/state/store.ts:pushLessons` syncs `lessons`, `forgottenLessons`, `customMemory`; `src/netlify/functions/lessons.ts` merges lessons by ID and maintains tombstones in `forgotten`. `customMemory` is a latest-document field with `memoryAt`, not structured personal memory.

### Birth/onboarding writes

First Sync/onboarding actions write protocol, user answers, health baselines, world/ledger and pre-hatch `Memory` records (`monName: UOVO`) through the store. These records are later eligible for bio/memory context and remote snapshot persistence. Exact UI collection is in onboarding/first-sync screen modules; no separate user-profile database was found.

## 4. Storage

| Store | Technology / key | Important data | Ownership / lifetime | Production use |
|---|---|---|---|---|
| Zustand AppState | browser `localStorage`, key `vinzmon.prototype.v4` | `memories`, `chat`, `mons`, `health`, `days`, `moodHistory`, `opinions`, protocol, world, ledger, active Mon | per browser token; survives reload/new chats locally | Yes |
| Remote game snapshot | Netlify Blobs, store `vinzmon-state`, key `save` plus day backups | `snapshotFor()` whole AppState, with `__healthJournal`; excludes token/traces/lessons/customMemory | authorized user; day arbitration rejects older saves | Yes |
| Health journal | browser localStorage key `vinzmon.health.journal.v1` | meals/workouts/weights/plans/targets/display blocks | local; copied into remote snapshot, restored from snapshot | Yes |
| Lessons book | Netlify Blobs store `vinzmon-state`, key `lessons` | lessons, forgotten IDs, latest custom memory text/time | authorized user; survives reset/device; merge-by-id | Yes for resolver learning |
| Generic user KV | Netlify Blobs store `vinzmon-user-data`, `data:${key}` via `/api/user-data` | runtime config, thread metadata, micro-memory/trace and other arbitrary JSON/text | authorized user; key/value, no domain schema | Yes, but not canonical personal memory |
| Assistant-ui threads | server-backed/local thread adapter and metadata keys | conversation messages, thread IDs and metadata | conversation persistence separate from `Memory[]` | Yes for Chat UI |
| Brain stores | `src/brain/store/client.ts` local experimental keys | brain/resolver state | dev/experimental; not shown as production dependency | Legacy/conditional |

`netlify/functions/_shared/auth.ts` authorizes all remote stores with `VINZMON_TOKEN`; Blobs are therefore user-scoped by the authenticated deployment contract, not by a typed user-profile schema.

## 5. Retrieval / Read Paths

- `src/engine/memoryContext.ts:buildMemoryBlock` ranks `Memory[]` by fixed kind/day weights, slices six, reorders chronologically, includes up to five `bio.rememberedDetails`, and truncates `bio.story` to 400 characters. No semantic relevance, embeddings, contradiction handling or expiry exists.
- `recentTurns(chat, limit=8)` keeps the last eight non-empty/non-pending turns, maps `vinz` to user and `mon` to assistant, removes the initial assistant and merges adjacent same-role turns. This is short-term conversation context, not semantic memory.
- `src/state/store.ts:requestReply` builds memory from `buildMemoryBlock` plus `opinionsBlock`, and turns from `recentTurns` excluding current user/pending response. It passes this to `src/ai/client.ts:generateReply`.
- `src/ai/tools.ts:memoriesReport` selectively reads memories from the requested recent-day window (then max 30 lines); `leggi_i_miei_dati` reads health, protocol, daily signals or memories on demand. Health `readMe`/journal readers return current structured data, with no ranking.
- `src/state/store.ts` loads local state first, then `syncWithServer`/`applyRemoteSave` can replace it when server `day` is newer. `serverBackedStorage` reads local first and remote KV as fallback. Failures generally fall back to local state and log warnings.
- `src/ai/reflect.ts` reads last seven days of memories for weekly reflection. `bioWriter` reads only birth-window memories supplied by the caller.

## 6. Prompt Injection

1. `src/state/store.ts:requestReply` → `src/ai/client.ts:generateReply`: injects the bounded `buildMemoryBlock`, derived opinions, and up to eight recent turns. Raw memory titles/text and bio details are summarized only by fixed formatting; no relevance filter beyond kind/day limits.
2. `src/ai/client.ts:speak` adds the memory string to the voice system prompt path, alongside voice/personality instructions from `src/ai/voicePrompt.ts`. The same response also receives `mood`, notes and awareness (rating, face redos, skipped time). This can expose health/event memory to unrelated chat requests because selection is generic, not task-aware.
3. `src/ai/reflect.ts:reflectOnWeek` receives recent memories as reflection input and produces opinions; this is a separate AI task and can turn event text into persistent derived opinions.
4. `src/ai/bioWriter.ts` receives selected birth memories to generate `writtenBio`; the resulting bio is later available through the active Mon record and memory block.
5. Tools are not pre-injected wholesale as user memory: tool definitions are supplied to the model, and results from `leggi_i_miei_dati`/health tools are returned into the tool loop. Tool results can therefore enter the final model context only when invoked.

There is no evidence of vector retrieval or a second semantic prompt layer. Duplicate context is possible between remembered details/story, event memories, opinions, and recent turns when the same fact is represented in multiple places.

## 7. Birth / Initial Data

Onboarding/First Sync collects user answers and initial protocol/health values into `AppState`. Pre-hatch memories are labeled `UOVO` rather than a Mon name. Birth-related memories are persisted with the rest of the snapshot and can later be selected by `writeBio` from a seven-day window. The generated `writtenBio` is stored on the Mon record. There is no separate long-term user profile or explicit consent/retention layer discovered in code. Birth data therefore behaves similarly to post-birth `Memory[]` once in AppState, but its bio-generation window and `UOVO` label differ.

## 8. Conversation History vs Long-Term Memory vs Runtime Context

- **Conversation persistence:** Chat UI threads and the store’s `ChatMessage[]` preserve timeline messages. They are keyed/threaded conversation data and may include assistant/user/procedural content. They are not automatically a fact database.
- **Long-term memory:** `AppState.memories` is the reusable event log; `opinions`, `writtenBio`, lessons/customMemory and health journal are adjacent derived/domain stores. These have different schemas and lifetimes.
- **Runtime context:** `buildMemoryBlock`, `opinionsBlock`, `recentTurns`, current mood, notes, awareness and on-demand tool results are assembled per response. The model normally sees only bounded recent chat plus the generic memory/opinion block. Thus VINZ.MON currently relies on recent conversation history plus a small recency/kind event list as a substitute for semantic memory.

## 9. Capability Matrix

| Category | Status | Evidence |
|---|---|---|
| Identity/basic facts | PARTIAL | onboarding/bio text, no typed fact store |
| Preferences | PARTIAL | protocol/opinions/custom memory, not normalized |
| Dislikes | PARTIAL | possible free text/opinion, no dedicated schema |
| Health facts | YES | HealthState/HealthJournal and tools |
| Food information | YES | deterministic extraction + MealLog |
| Workout information | YES | extraction + WorkoutLog |
| Mood | YES | mood + moodHistory, bounded daily inputs |
| Body metrics | PARTIAL | measures/weights, limited schemas |
| Relationships | PARTIAL | free-text Memory/opinions only |
| Important life events | PARTIAL | event Memory kind, no typed lifecycle |
| Projects | PARTIAL | pages/protocol, not general memory |
| Work context | PARTIAL | free text only |
| Travel | PARTIAL | free text only |
| Goals | YES | protocol/targets/pages and ME tools |
| Recurring patterns | PARTIAL | weekly reflection/opinions, no pattern model |
| Opinions/taste | YES | Opinion[] and prompt block |
| Corrections to previous facts | PARTIAL | health “update latest”; no general fact correction |
| Temporal facts | PARTIAL | day/`at` fields, no temporal validity intervals |
| Source/provenance | PARTIAL | health source enum; `Memory` lacks it |
| Confidence | NO | no confidence field/calculation |
| Contradictory facts | PARTIAL | opinion status/tombstones only; no general resolver |
| Deleted/forgotten facts | PARTIAL | lesson tombstones; no general Memory delete/forget |
| Mon relationship history | PARTIAL | Mon-tagged Memory/events, not a dedicated relationship timeline |
| Narrative/world history | YES | world/ledger/canon and narrative prompts |

## 10. Current Limitations / Risks

- Multiple overlapping stores (AppState, local health journal, remote snapshot, generic KV, lessons book, assistant-ui threads) can diverge.
- `Memory` is narrow, append-oriented and lacks confidence, provenance, source timestamp, validity, sensitivity or ownership metadata.
- Fixed kind/day ranking is not semantic retrieval; unrelated health/event details may enter generic prompts.
- Duplicate representations (chat text, Memory, health log, opinion, bio) can produce repeated or contradictory context.
- No general contradiction, correction, expiry or forgotten-fact policy; only specialized lesson tombstones and latest-opinion behavior exist.
- Array-length IDs and append behavior create collision/duplicate risk across devices/merges.
- Health journal is local-first and only indirectly synchronized through snapshots; failures can leave device/server divergence.
- Remote state is an opaque whole snapshot with day arbitration, making partial updates and concurrent merges difficult.
- Generic user-data KV has arbitrary keys and no schema/version governance.
- No user-facing export, inspection, editing or deletion for general memories was found.
- Sensitive health and lifestyle data can be included in broad chat prompts even when unrelated.
- `writtenBio` and opinions are AI-derived summaries with no explicit provenance or confidence back to source records.
- Experimental/dev brain and memory screens risk architectural confusion but are not established as production paths.

## 11. Active vs Legacy / Dead Code

**Active production:** `src/state/store.ts`, `src/engine/chatExtract.ts`, `memoryContext.ts`, `healthJournal.ts`, `types.ts`, `health.ts`, `progression.ts`, `opinions.ts`, `src/ai/client.ts`, `tools.ts`, `reflect.ts`, `bioWriter.ts`, `voicePrompt.ts`, `src/system/serverStorage.ts`, and Netlify `state.ts`, `user-data.ts`, `lessons.ts`, `_shared/auth.ts`.

**Development/lab or conditional:** `src/dev/MemoryView.tsx`, `MemorySection.tsx`, `TeachSection.tsx`, `src/lab/rooms/SystemLab.tsx`, `src/screens/UniversalInput.tsx` (preview/input surface), and `src/brain/store/client.ts` / `src/brain/stream.ts` (experimental brain/resolver state). These should not be treated as canonical memory persistence without confirming imports from the production route.

## 12. Implications for Memory Architecture V1

- Establish one canonical user-memory model instead of overlapping event, health, lesson and arbitrary-KV representations.
- Separate typed facts, episodic events, preferences, goals and Mon-derived narrative state.
- Add provenance, confidence, source, timestamps and validity/expiry semantics.
- Implement relevance retrieval rather than fixed kind/day slices.
- Define contradiction, correction, deletion and forgetting behavior explicitly.
- Keep health journal writes transactional with canonical server persistence.
- Treat conversation history as source material, not semantic memory by default.
- Make prompt injection task-aware and minimize sensitive unrelated data.
- Version and migrate schemas for cross-device synchronization.
- Provide user inspection/export/edit/delete controls before expanding retention.

## 13. File / Function Index

- `src/engine/types.ts` — `Memory`, `MemoryKind`, `BioFile`, `Lesson`, `MonRecord`, `AppState`, `ChatMessage`.
- `src/engine/chatExtract.ts` — `extractFromMessage`, meal/food/workout/mood classifiers.
- `src/engine/memoryContext.ts` — `buildMemoryBlock`, `recentTurns`.
- `src/engine/healthJournal.ts` — journal schemas, `readHealthJournal`, `addMeal`, `addWorkout`, `addWeight`, plan/target/block mutators.
- `src/state/store.ts` — initial state/persist, `applyExtraction`, chat/capture/egg writes, `snapshotFor`, `syncWithServer`, `runMonTool`, `writeBio`, `maybeReflect`, `pushLessons`, `pullLessons`, `requestReply`.
- `src/ai/client.ts` — `generateReply`, `generateIntroduction`, `speak`, runtime prompt request.
- `src/ai/tools.ts` — `ToolContext`, `memoriesReport`, `runTool`, health/ME/page/reminder tool schemas.
- `src/ai/reflect.ts` — `reflectOnWeek`.
- `src/ai/bioWriter.ts` — `writeBioWithAi` and birth-memory prompt context.
- `src/ai/voicePrompt.ts` — personality/voice prompt composition.
- `src/engine/opinions.ts` — opinion schema/format and `opinionsBlock`.
- `src/engine/world.ts` — `World`, `StoryLedger`, world/ledger context.
- `src/system/serverStorage.ts` — generic KV `getItem`/`setItem`/`removeItem`, migration and fallback.
- `netlify/functions/state.ts` — whole-state Netlify Blob GET/PUT and day arbitration.
- `netlify/functions/user-data.ts` — arbitrary per-user KV API.
- `netlify/functions/lessons.ts` — lessons/custom-memory schema, merge and tombstones.
- `netlify/functions/_shared/auth.ts` — `authorize`, token ownership gate.
- `src/dev/MemoryView.tsx`, `src/dev/MemorySection.tsx`, `src/dev/TeachSection.tsx`, `src/lab/rooms/SystemLab.tsx`, `src/brain/store/client.ts`, `src/brain/stream.ts` — non-canonical/dev or experimental memory-like surfaces.

