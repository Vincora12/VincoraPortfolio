# MEMORY CLEANUP — 2026-09-04

Bounded Prototype V1 cleanup task, scoped by `docs/CORE_BOUNDARY.md`'s
`## 6. Memory Cleanup implications` section and grounded in
`docs/MEMORY_LEGACY_FREEZE_AUDIT.md`. This document does not redo either —
it records what was verified against current code, what changed, and what
is explicitly deferred.

## Canonical model (verified against current code, not assumed)

| Concept | Canonical store | Status |
|---|---|---|
| Chat History | `AppState.chat` (incubation-only) + assistant-ui thread (live) | see CHAT HISTORY OWNERSHIP below — two representations, disjoint scopes, not competing |
| Personal long-term memory | Mem0 (`mem0MemoryClient.ts`) when `VINZMON_MEMORY_WRITER_MODE=mem0`; ME Model (`meModel.ts`) when unset/`custom` | single write boundary (`memoryWriter.ts`) already routes correctly — see ME below |
| Structured data | Health Journal (`healthJournal.ts`), Days/progression (`store.ts`) | unchanged, out of scope |
| Insight Machine | `machines.ts` `reflection` machine (server) | process, not a store |
| Insights | `pendingInsights` / `meSummary` (`vinzmon-machines` Blobs) | derived output |
| ME | `meModel.ts` document + `/api/me-memory` projection | derived/read projection, not a second canonical truth — see ME below |
| Story Ledger | game-domain `storyLedger` state | separate from personal memory, untouched |

### `/api/me-memory` is mode-dependent — confirmed, not assumed

Read `netlify/functions/me-memory.ts` directly. When
`VINZMON_MEMORY_WRITER_MODE === 'mem0'` it searches/lists **Mem0**
(`searchMem0`/`listMem0`); otherwise it projects the **ME Model** document
(`projectMeModel(await createMeModelStore().read())`). No repo-level
`.toml`/`.md`/`.env*` sets this var, and the code's own fallback
(`if (!value || value === 'custom') return 'custom'`) means the **ME
Model is the operative backend today**, not Mem0. This confirms the task's
own warning was correct and specific — "ME MEMORY" is not a fixed label
for one store, it is a label for whichever store the writer mode currently
selects. The write boundary (`memoryWriter.ts`) already routes both
`writeChatMemory` and `me-memory`'s read consistently by the same mode, so
there is exactly one active write path and one active read path at any
time — no competing writes. This is architecture already in place from a
prior pass (see `MEMORY_LEGACY_FREEZE_AUDIT.md`'s own trailing
"NEXT IMPLEMENTATION TASK" note, confirming `memoryWriter.ts` was the
target it asked for and it now exists).

No code change was needed here: the boundary is correct. What was missing
was honesty at the edge where a user explicitly asks to be remembered —
see EXPLICIT REMEMBER below.

## EXPLICIT REMEMBER — implemented (smallest safe version)

**Investigated first, before writing code:** whether a new AI tool
(mirroring `ricorda_di`) could let the model *await* persistence and
confirm only after a real write — the architecturally cleanest match for
"write to canonical personal memory, await persistence result, confirm
success only after persistence." Ruled out: `runTool` (`src/ai/tools.ts:433`)
and `runMonTool` (`src/state/store.ts:854`) are both fully synchronous —
no `Promise`, no `await` — and `replyWithLocalTools`
(`src/brain/stream.ts:388-449`) drives them synchronously too. Making one
tool call awaitable would mean threading async through the entire local
tool pipeline: a materially larger Chat rewrite, explicitly out of scope
per the task's own exception clause. Decided against it and did not
attempt it — no rollback, just upfront research ruling out the
"purer" path.

**What was implemented instead:** the existing write path
(`me-chat-capture.ts` → `writeChatMemory`) was already correct — the
`SEMANTIC_POLICY` prompt already tells the model an explicit request is
"strong evidence" of durable relevance, and that decision is unchanged.
What was missing was **honesty about the result**, specifically for
messages that look like an explicit "ricordati che…" / "remember that…"
request:

- Before: the client (`chat-memory-feedback.ts`) showed "Memoria
  aggiornata" only on a successful write, and stayed silent in every
  other case — including a failed write. For an ordinary message silence
  is fine (most messages aren't memory-worthy). For an explicit request,
  silence on failure is a lie by omission: the user asked and has no way
  to know it didn't happen.
- Now: `me-chat-capture.ts` classifies the incoming text with a
  deterministic, additive regex (`looksLikeExplicitRemember`, exported)
  covering Italian ("ricorda/ricordati che", "non dimenticare che",
  "tieni a mente che", "memorizza che") and English ("remember
  that/this/to", "don't forget"). This flag is threaded through every
  response branch (ignored, mem0-mode, custom-mode, failure) as
  `explicitRequest` — **it never changes what gets written**, only which
  feedback the client is told to show.
- The client (`chat-memory-feedback.ts`) now exposes a four-state
  `MemoryFeedback`: `none` / `updated` / `explicit-updated` /
  `explicit-failed`. On a failed HTTP response, or on a successful
  response where the model decided not to write anything, if
  `explicitRequest` was true the message is marked `explicit-failed` and
  listeners are notified — this is the concrete fix for the "silent
  failure" gap.
- `chatgpt.tsx` renders three distinct labels under the user's message:
  "Memoria aggiornata" (ordinary write), "Ricordato ✓" (explicit request,
  succeeded), "Non sono riuscito a ricordarlo — riprova" (explicit
  request, failed) — in `text-red-600 dark:text-red-400` so failure reads
  as failure, not as the same neutral gray.
- A genuine network error (the `fetch` itself throws) stays silent by
  design: the client never learned whether the server thought the message
  looked explicit, and duplicating the regex client-side just to guess
  would be a second, drifting copy of the same heuristic.

Behavior verified by `scripts/memory-cleanup-check.mjs`
(`npm run verify:memory-cleanup`): 11 explicit-remember phrasings
(Italian + English) detected, 9 ordinary conversational messages
(including "mi ricordo", "che ricordo bellissimo", "I remember when we
met" — sentences that use the same words without being a remember
*request*) correctly not flagged. This satisfies Gauntlet Stage 2's
requirement that ordinary conversation not become an explicit-remember
event by accident.

**No new store was created.** `explicitRequest` is a UI-feedback flag on
the response of the one existing write endpoint, not a parallel write
path or a second success/failure record.

## CHAT HISTORY OWNERSHIP

Two representations exist and were traced to their actual consumers
rather than assumed equivalent:

- **`AppState.chat: ChatMessage[]`** (legacy) — written by
  `sendMessage`/hatch-time `openingMessage` push. Real, wired consumer:
  `IncubationScreen` (pre-hatch egg-talking). Also read by
  `dev/MemorySection.tsx` (DEV tool) and by `maybeReview()` /
  `gatherEvidence()` — the monthly voice-review ("Taccuino") mechanism.
- **assistant-ui thread system** (`IntegratedChat`/`chatgpt.tsx`) — the
  real live-phase Chat. Confirmed via grep across
  `src/assistant-original/`: zero writes to `AppState.chat` from this
  system.

`src/screens/CompanionHome.tsx` was the **only** reachable call site of
the live-style `sendMessage` action, and had **zero importers anywhere in
the repo** (confirmed via repeated greps before and after deletion). It
was dead code whose mere presence made "does live chat write to
`AppState.chat`?" look like an open question when it wasn't. Deleted.
`npx tsc --noEmit` clean after removal.

**Finding, not fixed in this pass:** with `CompanionHome.tsx` gone, it's
now explicit that `AppState.chat` only grows during incubation. The
monthly Taccuino review (`gatherEvidence(s.chat, s.opinions)`,
`src/state/store.ts` ~4631) reads `s.chat` during the **live** phase,
where nothing is appending to it — meaning that mechanism likely operates
on stale, pre-hatch data once a Mon has hatched. This is a real
architectural finding, but fixing it means deciding whether/how to bridge
assistant-ui's live thread data into the store — exactly the "materially
larger Chat rewrite" / product decision this task's DO-NOT-DO list rules
out. **Deferred to V2 / Core Extraction**, flagged here rather than
silently left for someone to rediscover.

No third chat representation was introduced. No historical first-turn/
reload bug was reopened or investigated.

## LEGACY CLASSIFICATION

| Item | Classification | Notes |
|---|---|---|
| `AppState.chat` | **LEGACY BUT STILL USED** | Incubation UI + DEV tool + Taccuino input; not a personal-memory store; scope now unambiguous after `CompanionHome.tsx` removal |
| `AppState.memories: Memory[]` | **ACTIVE CANONICAL (different domain)** | In-game/journey events tied to a Mon (`{day, kind, title, text, monName}`), feeds `reflectOnWeek`/narrator; NOT personal Mem0-style facts; not migrated |
| ME Model (`meModel.ts`) | **ACTIVE CANONICAL, conditionally** | Operative personal-memory backend when `VINZMON_MEMORY_WRITER_MODE` is unset/`custom` (today's default); becomes a read-only-in-practice legacy path only once `mem0` mode is turned on; its own docs (`ME_MODEL_V1.md`) call it "dormant," which is aspirational, not yet true given the env default |
| Reflection (client `src/ai/reflect.ts`) | **ACTIVE DERIVED** | Weekly, client-triggered, produces `Opinion[]` from `AppState.memories`; Mon-persona belief evolution only, explicitly forbids body/health judgments |
| Reflection (server `machines.ts`) | **ACTIVE DERIVED (process)** | Name-collides with the client one but writes to a different destination (`pendingInsights`/`meSummary` in `vinzmon-machines`); not a competing store despite the shared name |
| Taccuino / Notebook (`ai/notebook.ts`, `engine/notebook.ts`) | **ACTIVE DERIVED, narrow domain** | Voice/style proposals only ("non applica niente da solo"), fed by `gatherEvidence(s.chat, ...)`; distinct from personal memory; see the `AppState.chat` staleness finding above |
| Pensieri / Thoughts | **UI LABEL ONLY** | Confirmed to be the Italian label for the Insight count chip (`MachineInsightChip`, `App.tsx:1345`), not a separate store or concept |
| `src/screens/CompanionHome.tsx` | **SAFE TO REMOVE — REMOVED** | Zero importers repo-wide; sole reachable caller of live-style `sendMessage` |

## FILES CHANGED

- `netlify/functions/me-chat-capture.ts` — added `looksLikeExplicitRemember` (exported), threaded `explicitRequest` through every response branch. Write decision unchanged.
- `src/assistant-original/chat-memory-feedback.ts` — replaced binary `hasMemoryUpdated` with four-state `memoryFeedbackFor` (`none`/`updated`/`explicit-updated`/`explicit-failed`); explicit requests that fail or produce no write now notify listeners instead of staying silent.
- `src/assistant-original/components/examples/chatgpt.tsx` — three-state feedback label under user messages, including a visibly-red failure state for explicit requests.
- `src/screens/CompanionHome.tsx` — deleted (dead code, zero consumers, sole caller of legacy live-style chat write).
- `scripts/memory-cleanup-check.mjs` — new regression script for `looksLikeExplicitRemember` (11 positive / 9 negative cases).
- `package.json` — added `verify:memory-cleanup` script, following the existing `verify:*` convention.

## DEFERRED TO V2 / CORE EXTRACTION

- `AppState.chat` / Taccuino staleness during live phase (see CHAT HISTORY OWNERSHIP above) — needs a product decision on whether/how to bridge assistant-ui thread data into the store; explicitly not attempted here.
- ME Model → Mem0 migration path (switching `VINZMON_MEMORY_WRITER_MODE` to `mem0` in production) — an operational/product decision, not a code gap; the write boundary already supports it.
- A tool-based (awaitable) Explicit Remember implementation — blocked on making `runTool`/`runMonTool`/`replyWithLocalTools` async, which is Core Extraction-scale work.
- Extending Mem0 semantic extraction beyond chat-derived text (e.g. from structured Health/Days data) was not in scope and not touched.

## Related

See `docs/CORE_BOUNDARY.md` `## 6. Memory Cleanup implications` for the boundary this task operated under, and `docs/MEMORY_LEGACY_FREEZE_AUDIT.md` for the underlying system map this task built on rather than redid.
