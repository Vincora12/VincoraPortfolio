# CORE EXTRACTION — PHASE 1 — 2026-09-04

Bounded first Core Extraction pass, scoped to exactly one domain: personal
Memory, and the two things that depend on it (ME, Insight/Reflection). Not
a redesign, not a storage migration. Grounded in `docs/CORE_BOUNDARY.md`,
`docs/MEMORY_CLEANUP_2026-09-04.md` and `docs/MEMORY_LEGACY_FREEZE_AUDIT.md` —
this document does not redo any of them, only the tracing needed to find
the minimum coupling that stood between today's code and a clean boundary.

**Continued same day in `docs/CORE_EXTRACTION_PHASE2_2026-09-04.md`:** this
phase's own "Web client impact: none" and "Deferred" sections named the
two edges left open — `MeOverview.tsx`'s `Array.isArray(memory.memories)`
backend-shape inference, and ME Seed's independent `meModel.ts` doorway.
Phase 2 closed both.

## What existed before this phase (traced, not assumed)

Three server-side places each independently decided which personal-memory
backend was active:

- `netlify/functions/me-chat-capture.ts` checked `memoryWriterMode()`
  itself and branched its own extraction pipeline around it.
- `netlify/functions/me-memory.ts` checked `process.env.VINZMON_MEMORY_WRITER_MODE`
  directly (not even through the shared helper) and branched its own read
  logic around it.
- `netlify/functions/_shared/machines.ts` — the Insight/Reflection/ME
  machines — **never checked it at all.** `runMachine()` called
  `listMem0()`/`searchMem0()` unconditionally, regardless of
  `VINZMON_MEMORY_WRITER_MODE`. Under today's default (`custom`, meaning
  ME Model is canonical — confirmed in the prior Memory Cleanup task), the
  machines were still trying to read Mem0. This is the exact failure mode
  the task brief named in advance: *"Do not pretend Mem0 is active if the
  environment still uses ME Model."* The machines were doing precisely
  that, silently, with no code path checking whether it was true.

`netlify/functions/_shared/memoryWriter.ts` already existed as a partial
attempt at this boundary (built in an earlier session), but it only
covered the write path, required every caller to construct a
`MeModelStore` even when writing to Mem0 (where it went unused — a
concrete symptom of backend leakage into call sites), and wasn't used by
`me-memory.ts` or `machines.ts` at all.

## Domain extracted

**Memory** — the only domain actually moved. **ME** and **Insights** were
traced and found to already be correctly isolated (`machines.ts`: pure
server module, no React/DOM import, single Blobs key
`vinzmon-machines`/`machine-state-v1`, thin endpoint at `/api/machines`
that only Web components fetch — verified via `App.tsx` and
`SystemLab.tsx`, neither of which touches machine internals). Their one
real defect — the hardwired Mem0 read — was a *Memory*-boundary leak
**into** them, not evidence that ME or Insights needed their own module.
Building a `core/me.ts` or `core/insights.ts` that just re-exported
`machines.ts` functions under new names would have been exactly the "fake
wrapper that renames one function with no architectural benefit" the task
said not to build, so neither was created.

## What moved

New file: `netlify/functions/_shared/core/memory.ts`. Domain operations:

- `memoryBackendMode()` — the one place `VINZMON_MEMORY_WRITER_MODE` is
  read and validated (same three modes as before: `custom`/`mem0`/`frozen`).
- `writePersonalMemory(input, mode?, store?)` — full write path for both
  backends, including the custom-mode LLM extraction step (moved here from
  `me-chat-capture.ts` verbatim — same `SEMANTIC_POLICY`/instructions,
  same `resolveRoute('text-cheap', ...)`/`callProvider` call). Returns
  `{ result, backend }` — `backend` is for the caller's own diagnostics
  (e.g. Runtime Log classification) and is never spread into the
  client-visible JSON response, so the backend choice still never reaches
  the browser.
- `listPersonalMemory(store?)` / `searchPersonalMemory(query, limit?, store?)`
  — flat, backend-neutral memory access. Mem0 mode uses Mem0's real
  list/search; custom mode reads the ME Model and, for search, runs a
  small deterministic keyword-overlap filter (`filterByQuery`) since the
  ME Model has no semantic index; frozen mode returns nothing. This is
  what `machines.ts` now calls instead of `listMem0`/`searchMem0` directly.
- `readMeMemoryView(store?)` / `searchMeMemoryView(query, store?)` — exact
  response shapes for `GET`/`POST /api/me-memory`.
- Pure, independently-tested helpers: `flattenMeModelDocument`,
  `mem0RowsToItems`, `filterByQuery`.

Every function takes its `MeModelStore` as an optional trailing parameter
defaulting to `createMeModelStore()` — production call sites never pass
one (so they never see the store), but it makes every mode path testable
with a plain in-memory store, matching the convention already used by
`meModel.test.ts`.

`netlify/functions/_shared/memoryWriter.ts` and its test file are deleted
— superseded, not duplicated. `docs/MEMORY_LEGACY_FREEZE_AUDIT.md` and
`docs/MEMORY_CLEANUP_2026-09-04.md` both carry a pointer to this document
where they used to name it.

## What did not move

- ME Model persistence (`meModel.ts`, Blobs key `me-model-v1`) — untouched,
  same store, same schema.
- Mem0 client (`mem0MemoryClient.ts`) — untouched, same HTTP calls.
- `meChatMemory.ts` (extraction-result interpretation, entity/relation
  reconciliation) — untouched, still the custom-mode write engine,
  unchanged behavior.
- `meSeed.ts`/`/api/me-seed` — explicitly out of scope per the freeze
  audit ("a separate writer... until Seed ownership is explicitly
  decided"); not touched.
- Mon State, World, Story Ledger, Days/progression, Chat History, Health
  Journal, Tool execution, TRACE, Narrative — none of these were opened.
- `machines.ts`'s own persistence, machine loop, insight lifecycle
  (open/discuss/push) — untouched except the two call sites now reading
  through the Memory boundary.
- The `/api/machines` endpoint and its request/response contract —
  untouched.

## Server Core boundary

```
me-chat-capture.ts ─┐
me-memory.ts        ├─→ core/memory.ts ─┬─→ meModel.ts (ME Model, Blobs)
machines.ts ─────────┘                  └─→ mem0MemoryClient.ts (Mem0)
```

Before this phase, all three left-hand boxes each drew their own arrow
straight to one or both right-hand boxes, independently deciding which.
Now only `core/memory.ts` knows both destinations exist; everything else
asks it for an operation and gets a backend-neutral answer.

## Web client impact

None. No `src/` file changed in this phase. `MeOverview.tsx`,
`chat-memory-feedback.ts`, `netlify-runtime.ts`, `SystemLab.tsx` all still
call the same two endpoints (`/api/me-chat-capture`, `/api/me-memory`) the
same way; their response-shape branching (`Array.isArray(memory.memories)`
in `MeOverview.tsx`) is pre-existing and out of scope for this phase —
noted here, not fixed, per "avoid unnecessary endpoint churn."

## Data/persistence impact

None. No new Blobs key, no schema change to `me-model-v1`, no migration.
The only data-shape change is additive: `MemoryProjection.relations[]` and
`.episodes[]` now each carry their own `id` (previously absent — added so
`flattenMeModelDocument` can cite a stable source id back to the
Insight/Reflection machines, the same way Mem0 rows already do). Existing
clients ignore fields they don't read; `MeOverview.tsx` doesn't read `id`
on these arrays today.

## A pre-existing bug found and fixed while building this boundary

`projectMeModel()` (`meMemoryProjection.ts`) built its entity lookup map
only from `doc.entities` — but the root user entity (`entity_user`) lives
in `doc.user`, a separate field, not inside `doc.entities`. Since most
relations use the user as their subject ("USER works_on X" — see
`meChatMemory.ts`'s `resolved` map, which maps the literal string `"USER"`
to `staged.user.id`), every user-subject relation resolved its subject to
`undefined` and was silently dropped from the entire ME → MEMORY
projection. The `user` display name in the same projection had the same
bug — it always fell back to the generic `"Utente"` placeholder instead of
the real configured name.

This is unrelated to backend routing — it would have been wrong under
`custom` mode regardless of this phase — but it directly feeds the new
`core/memory.ts` boundary (`flattenMeModelDocument`, `readMeMemoryView`),
so it was fixed here rather than left to silently undercount memory again
inside the very module built to make memory correct. One-line fix: the
lookup map now seeds from `doc.user` first. Covered by
`scripts/core-memory-check.mjs`'s custom-mode assertions.

## A real functional gap found and fixed: live Chat's long-term memory was silently off by default

`src/assistant-original/netlify-runtime.ts` POSTs `/api/me-memory` with
`{query}` on every user message and injects the result into the system
prompt as `LONG-TERM MEMORY`. Before this phase, `me-memory.ts` only
answered POST requests when `VINZMON_MEMORY_WRITER_MODE === 'mem0'`; in
`custom` mode (today's default), POST always returned 405, silently
parsed by the client as "no memories," and the live Chat never saw any
personal memory at all — regardless of how much was actually stored in
the ME Model.

Fixed as part of this phase, since the infrastructure needed to fix it
correctly (`searchPersonalMemory`'s backend-neutral search, including the
custom-mode keyword fallback) is exactly what this boundary exists to
provide. `searchMeMemoryView` now calls `searchPersonalMemory` for every
mode; `me-memory.ts`'s handler no longer checks the writer mode for HTTP
routing at all — `POST` is now always a supported method, `GET` is always
the projection read. This is a deliberate, in-scope behavior change (not
merely an internal refactor): the external contract's *shape* is
unchanged (`{memories: [...]}`), but `custom`-mode POST now returns real
results instead of an unconditional 405. Covered by
`scripts/core-memory-check.mjs`.

## ME Model / Mem0 mode result

Unchanged in effect, clarified in mechanism: `VINZMON_MEMORY_WRITER_MODE`
remains the single switch (`custom` default → ME Model, `mem0`, `frozen`).
No production cutover was made or attempted. What changed is that flipping
this one environment variable now correctly changes the behavior of *all
three* consumers (chat capture, the ME → MEMORY view, and the
Insight/Reflection/ME machines) — before this phase, flipping it left
`machines.ts` on Mem0 regardless.

## Files changed

- `netlify/functions/_shared/core/memory.ts` — new, the Memory domain boundary.
- `netlify/functions/me-chat-capture.ts` — now calls `writePersonalMemory`/`shouldCapturePersonalMemory`; no backend knowledge left.
- `netlify/functions/me-memory.ts` — now calls `readMeMemoryView`/`searchMeMemoryView`; no backend knowledge left, POST supported unconditionally.
- `netlify/functions/_shared/machines.ts` — reads through `listPersonalMemory`/`searchPersonalMemory` instead of `listMem0`/`searchMem0` directly; `MACHINE_DEFINITIONS` wording no longer hardcodes "Mem0" when the active backend may be the ME Model.
- `netlify/functions/_shared/meMemoryProjection.ts` — `id` added to relation/episode projections (additive); `entity_user` lookup bug fixed.
- `netlify/functions/_shared/memoryWriter.ts`, `memoryWriter.test.ts` — deleted, superseded.
- `scripts/core-memory-check.mjs` — new, 30 assertions covering both mode paths end-to-end (fake store for ME Model, faked `fetch` for Mem0 — no real credentials).
- `package.json` — `verify:core-memory` script added.
- `docs/MEMORY_LEGACY_FREEZE_AUDIT.md`, `docs/MEMORY_CLEANUP_2026-09-04.md` — pointer notes added, no content rewritten.

## Device-agnostic notes

`core/memory.ts` imports only other `_shared/` server modules
(`meChatMemory`, `meModel`, `meMemoryProjection`, `mem0MemoryClient`,
`providers`, `routing`) — no React, no DOM, no `window`, no
`localStorage`, no component lifecycle. Same for the two endpoint files
and `machines.ts` (unchanged in this respect — already true before this
phase, reconfirmed).

## Deferred to next Core Extraction phase

- Chat History ownership (`AppState.chat` vs. assistant-ui threads) —
  explicitly left alone per this task's own instruction; the boundary is
  already documented in `docs/MEMORY_CLEANUP_2026-09-04.md` and not
  reopened here.
- `MeOverview.tsx`'s `Array.isArray(memory.memories)` branching — the one
  remaining place the Web client infers backend shape from response
  content. Small, but changing it means picking one unified projection
  shape for both backends, which is a real design decision (what does a
  Mem0 row's "relation/episode" structure become?) and was judged
  out of this phase's bound.
- `meSeed.ts`/ME Seed ownership — still explicitly deferred per the freeze
  audit.
- Mon State / World / Story Ledger / Chat History / Health Journal — next
  domains, not started.

## Next roadmap step

CORE EXTRACTION PHASE 2 — likely candidates, not decided here: Mon State
(the largest remaining Core-Canonical domain sharing the generic
`/api/state` blob per `CORE_BOUNDARY.md` §4), or Chat History ownership
now that its boundary is documented but not yet load-bearing anywhere.
