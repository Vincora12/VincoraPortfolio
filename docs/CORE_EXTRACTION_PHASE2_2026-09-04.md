# CORE EXTRACTION — PHASE 2 — MEMORY BOUNDARY COMPLETION — 2026-09-04

Bounded completion pass over the Memory boundary Phase 1 created
(`docs/CORE_EXTRACTION_PHASE1_2026-09-04.md`). Not a new domain, not a
broad extraction — this closes the two edges Phase 1 explicitly deferred:
the Web client's remaining backend-shape inference, and ME Seed's
ownership.

## Goal A — unified Memory projection

### Traced first

- `MeOverview.tsx`'s `MemoryView` component was the only real consumer of
  `GET /api/me-memory`'s response body. It branched on
  `Array.isArray(memory.memories)` to tell which of two entirely different
  shapes it had received — Mem0's `{memories, counts:{memories}}`, or the
  ME Model's full `MemoryProjection`
  (`{counts:{knowledge,entities,episodes}, user, entities, relations,
  episodes, recent}`). That branch was reading the response shape to infer
  which backend produced it — the exact thing this boundary exists to
  prevent, just relocated from the endpoint (fixed in Phase 1) to the
  client that reads it.
- `SystemLab.tsx` (LAB diagnostics) had a second, independent instance of
  the same problem: it inferred "mem0 is active" from `'counts' in
  meMemoryJson` — but the ME Model shape *also* has a top-level `counts`
  key (just structured differently), so this check was true in **both**
  modes. In `custom` mode it silently reported `note: 'mem0'` with
  `memories: null` — not a crash, but a wrong diagnostic label shown to
  whoever opens LAB → SYSTEM to check which backend is live.

### What changed

`core/memory.ts`'s `readMeMemoryView()` now returns one shape on every
backend:

```ts
type MemoryView = {
  memories: Array<{ id?: string; text: string; score?: number; metadata?: Record<string, unknown> }>;
  counts: { memories: number };
  user: string;
  backend: 'custom' | 'mem0' | 'frozen';
};
```

Built from infrastructure Phase 1 already put in this file:
`flattenMeModelDocument` for the ME Model, `mem0RowsToItems` for Mem0 —
both already resolved to the same `{id?, text}` shape everywhere else in
the module (`listPersonalMemory`, `searchPersonalMemory`). This wasn't a
new unification design; it was noticing the unification already existed
one function away and reusing it for the read-projection too.

`backend` is included specifically for LAB diagnostics, per the task's own
allowance ("LAB diagnostics MAY expose the currently active backend if
useful") — `MeOverview.tsx` (the normal Web UI) never reads it;
`SystemLab.tsx` now does, replacing its shape-guessing with a direct,
honest read of the field.

**What was traded away:** the ME Model's richer per-mode breakdown
(`counts.knowledge` / `.entities` / `.episodes` separately, a distinct
`entities` list) collapses to a single `memories` count and flat list —
matching what Mem0 mode already showed. `MeOverview.tsx` never rendered
the `entities` list at all (confirmed by reading its full source before
editing), so nothing user-visible was actually removed; the header text
changes from "X conoscenze · Y entità · Z episodi" to "X memorie" (also
what Mem0 mode already showed). Judged an acceptable "smallest shape
needed by existing consumers," per the task's own instruction, not a
product regression.

### Consumers updated in the same change

- `MeOverview.tsx`'s `MemoryView` — rewritten to render the single shape,
  `Array.isArray` branch removed entirely, `item.createdAt` (dead code —
  neither backend shape has ever actually populated it, confirmed by
  reading both the old Mem0-mode mapping and the old `MemoryProjection`
  type) dropped along with it.
- `SystemLab.tsx`'s MEM0 diagnostic block — now reads `meMemoryJson.backend`
  directly instead of inferring from key presence.

### Compatibility

`GET /api/me-memory`'s endpoint contract (path, auth, method) is
unchanged — only the JSON body shape changed, and both real consumers
were updated in this same change, per the task's explicit compatibility
rule. No versioned endpoint was created; none was needed. `POST
/api/me-memory` (search) was already unified in Phase 1 and is untouched
here.

## Goal B — ME Seed ownership

### Traced

`netlify/functions/_shared/meSeed.ts` (`importMeSeed`) and
`netlify/functions/me-seed.ts` (`/api/me-seed`):

- **What it writes:** entities/relations/episodes into the exact same
  `MeModelDocument` (Blobs key `me-model-v1`) that chat capture writes to
  — same schema, same primitives (`createEntity`/`createRelation`/
  `createEpisode` from `meModel.ts`). **Not an independent truth.**
- **Persistence path:** called `createMeModelStore()` directly, imported
  straight from `meModel.ts` — bypassing `core/memory.ts` entirely. A
  fourth independent doorway into the ME Model, alongside the three Phase
  1 already closed (chat capture, ME memory reads, the machines).
- **Telemetry:** confirmed via a repo-wide grep for `recordSpend(` that
  every other LLM-calling endpoint in this codebase (`ai.ts`,
  `machines.ts`, `shortcut.ts`, `evolution-background.ts`,
  `lab-duel-background.ts`) records spend after its call; `me-seed.ts`
  never did. Neither, it turned out, did `core/memory.ts`'s own
  chat-capture extraction call (`writePersonalMemory`'s custom-mode
  branch) — the same gap, in the code Phase 1 had just written. Both LLM
  calls in this codebase's personal-memory domain were invisible to the
  USAGE ledger.
- **Backend assumption:** unconditionally ME Model. No mode check, no
  Mem0 equivalent exists.
- **Independent truth:** no — confirmed same store/schema as chat.

### What moved

`core/memory.ts` gained `importPersonalMemorySeed(seed, extract, store?)`
— a thin pass-through to the unchanged `importMeSeed`, defaulting `store`
to `createMeModelStore()` exactly like every other function in the file.
`me-seed.ts` now calls this instead of importing `createMeModelStore` and
`importMeSeed` directly. `meModel.ts` now has exactly one importer of
`createMeModelStore` across the whole Memory domain: `core/memory.ts`
(verified by grep after the change).

### What did not move, and why

- `importMeSeed`'s actual mechanics (entity resolution, staging, one
  commit, content-hash idempotency) — untouched in `meSeed.ts`. It is a
  fundamentally different shape of operation from `writePersonalMemory`
  (a whole onboarding transcript staged and committed once vs. one chat
  message), and folding it into that function would have been a real
  rewrite of working, tested logic for no boundary benefit — exactly the
  "materially larger scope" this task said to stop for, not attempt.
- ME Seed still always targets the ME Model, regardless of
  `VINZMON_MEMORY_WRITER_MODE`. **Deliberately not gated on the writer
  mode.** Making it check the mode (e.g. silently no-op'ing in `mem0`
  mode) would be a real onboarding-behavior change, not a boundary
  cleanup, and `docs/MEMORY_LEGACY_FREEZE_AUDIT.md` already named this
  exact question as its own, separately-scoped migration decision ("ME
  Seed endpoint: adapt only in a separately scoped migration task if Seed
  should use Mem0"). Left exactly as that document already decided.

### Telemetry fix applied

Both LLM extraction calls in the Memory domain now call `recordSpend`
after a successful response (`'text-cheap'` capability, `action:
'me_chat_capture'` / `'me_seed'`, `subsystem: 'memory'`) — matching the
pattern already used by `machines.ts`, `shortcut.ts`, etc. Both are
wrapped in `try/catch`: a spend-ledger write failure must not turn an
otherwise-successful memory write into a reported failure. This is
deliberately narrower than adding `checkCap()` pre-flight gating (which
`ai.ts`/`setup.ts`/`shortcut.ts`/etc. also do) — gating personal-memory
writes on the monthly budget is a real product decision (what should
happen when a user is over budget — silent skip? visible failure?) that
this task's own boundary ("do not expand into a Usage/telemetry project")
put out of scope. **Flagged as deferred, not decided.**

## Invariants checked after this phase

1. Web consumers do not infer personal-memory backend from data shape —
   confirmed: `MeOverview.tsx`'s `Array.isArray` branch is gone;
   `SystemLab.tsx` reads the explicit `backend` field.
2. Active backend decision remains server-side — unchanged, still only
   `core/memory.ts`.
3. `VINZMON_MEMORY_WRITER_MODE` remains the canonical switch — unchanged.
4. ME remains derived/synthesized — untouched this phase (machines.ts not
   modified).
5. Mem0 remains canonical target personal memory — unchanged; still not
   forced as the default.
6. Default ME Model mode continues functioning — verified via
   `verify:core-memory`'s custom-mode assertions (34/34 pass) and
   `verify:memory-cleanup`/`verify:backend`/`verify:assistant`/
   `verify:chat-me` all green.
7. No migration occurred — `me-model-v1` schema, seed-import mechanics
   and idempotency all unchanged; verified by an explicit
   already-imported test in `verify:core-memory`.
8. No new storage created — confirmed, same two backends.
9. No personal-memory Core code depends on React/DOM/window/localStorage
   — `core/memory.ts`'s new code is plain async functions over
   `_shared/` server modules only.

## Files changed

- `netlify/functions/_shared/core/memory.ts` — unified `MemoryView` type
  and `readMeMemoryView`; `importPersonalMemorySeed`; `recordSpend` added
  to `writePersonalMemory`'s custom-mode extraction (try/catch).
- `netlify/functions/me-seed.ts` — routes through
  `importPersonalMemorySeed` instead of `createMeModelStore`/
  `importMeSeed` directly; `recordSpend` added to its extraction call
  (try/catch).
- `src/screens/MeOverview.tsx` — `MemoryView` renders the unified shape;
  no backend-shape inference.
- `src/lab/rooms/SystemLab.tsx` — MEM0 diagnostic block reads the honest
  `backend` field instead of guessing from key presence.
- `scripts/core-memory-check.mjs` — extended: unified-view assertions for
  both modes, seed-import + seed-idempotency assertions, and an explicit
  assertion that the (deliberately unmeasurable, in this offline
  environment) spend-recording failure does not fail the underlying
  write.

No changes to `meModel.ts`, `meChatMemory.ts`, `meSeed.ts`,
`mem0MemoryClient.ts`, `machines.ts`, `me-chat-capture.ts`,
`me-memory.ts`'s endpoint logic, or any Blobs key/schema.

## Deferred

- `checkCap()` pre-flight budget gating for the two Memory-domain LLM
  calls — a real product decision (fallback UX when over budget), not
  attempted here.
- Everything Phase 1 already deferred and this phase's brief explicitly
  excluded: Chat History bridging, Story Ledger, `AppState.memories`,
  Health Journal, Context Builder, TRACE, tool permission routing,
  Narrative, Zustand split, Desktop/Clicky, forcing the ME Model → Mem0
  production cutover.

## Next roadmap step

CORE EXTRACTION PHASE 3 — the Memory boundary is now closed end to end
(write, list, search, read-projection, seed import, all through one
module, one unified client-facing shape). Next candidate per
`docs/CORE_BOUNDARY.md` §7: Mon State, the largest remaining domain still
sharing the generic `/api/state` blob with Client config.
