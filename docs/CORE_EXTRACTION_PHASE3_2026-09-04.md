# CORE EXTRACTION — PHASE 3 — MON STATE + WORLD + STORY LEDGER — 2026-09-04

Bounded third Core Extraction pass, scoped to one domain: Mon State, World,
and Story Ledger. Grounded in `docs/CORE_BOUNDARY.md` and Phase 1/2's
memory boundary — this document does not redo either, only the tracing
needed to design this domain's boundary honestly.

## Why this domain's boundary looks different from Memory's

Phase 1/2 built `netlify/functions/_shared/core/memory.ts` because there
was a real backend **choice** to hide from callers (ME Model vs Mem0), and
three server-side call sites each independently, inconsistently decided
it. Traced before writing anything here: **that situation does not exist
for Mon State/World/Ledger.**

- `netlify/functions/state.ts` (`/api/state`) stores `state: unknown` —
  read in full: it is genuinely opaque, never parsed server-side, by
  deliberate design (its own header comment explains why: the server is
  "the good copy, not the only one," and browser-vs-server conflict
  resolution is decided by game-day number, a field it never needs to
  know the meaning of).
- `src/ai/narratorPrompt.ts`'s `writeNarratorWithAi` imports `ask` from
  `src/ai/backend.ts` — the same client-side helper used everywhere else
  — and sends an **already-rendered prompt string** built client-side
  (`worldBlock`/`ledgerBlock`, both pure functions in `engine/world.ts`).
  The server never sees structured World/Ledger data, only text.

There is exactly one persistence path (the opaque blob) and zero
server-side domain logic to centralize. A new Netlify Function that
parses that blob would either duplicate `MonRecord`/`World`/`StoryLedger`
server-side (a second place to keep in sync with `src/engine/types.ts`)
or force a real schema onto a blob that is deliberately opaque —
"migrate persistence," explicitly out of scope this phase.

## What provides real ownership instead

The relationship logic — "what's the active Mon" — was **duplicated three
times** before this phase: `activeRecord()` (private, `store.ts`),
`useActiveMon()` (exported hook, `store.ts`), both independently
reimplementing `activeMonName ? mons[activeMonName] ?? null : null`. And
**nothing anywhere validated Mon/World coherence at all** — confirmed by a
repo-wide search for `.worldId` (see below).

New file: `src/engine/journey.ts` — same pure `engine/` layer as
`world.ts`/`progression.ts` (no React, no Zustand, no DOM/window/
localStorage — verified), the class of file `docs/CORE_BOUNDARY.md`
already treats as Core-eligible ("already correctly isolated," same as
`narratorPrompt.ts`). It exports:

- `resolveActiveMon(mons, activeMonName)` — the one implementation now,
  not three. `store.ts`'s `activeRecord()` and `useActiveMon()` both
  delegate to it.
- `validateJourneyCoherence(mons, activeMonName, world)` — genuinely new
  logic (nothing checked this before): reports whether `activeMonName`
  resolves, whether an active Mon exists without a World, and whether the
  active Mon's `worldId` (when present) matches the current World.
- `projectJourneyState({mons, activeMonName, world, ledger})` — the
  minimal `{activeMon, world, ledger}` shape, never the whole opaque
  AppState.

## JOURNEY CORE BOUNDARY

```
src/state/store.ts (activeRecord, useActiveMon)
  │
  ▼
src/engine/journey.ts — resolveActiveMon / validateJourneyCoherence / projectJourneyState
  │
  ▼
existing engine/world.ts, engine/types.ts data (unchanged, same fields, same persistence)
```

Deliberately **not** `netlify/functions/_shared/core/journey.ts` as the
task's own example suggested — that location is offered as an example,
conditioned on the module "providing real ownership," and for this domain
today the ownership that matters is the relationship logic, which is pure
and portable regardless of which process runs it. A future second real
client (Desktop, House.mon) that cannot share this TypeScript module is
the trigger for exposing this projection over an endpoint — not built
preemptively here, per `docs/CORE_BOUNDARY.md`'s own stated principle:
"Don't build CoreService/CoreManager/... ahead of a real second
consumer."

## ACTIVE MON

`resolveActiveMon`/`activeRecord`/`useActiveMon` now share one
implementation. Traced and confirmed: `activeMonName` and `mons` are
always written together in every mutation site (hatch, evolution reveal,
reset) — a dangling `activeMonName` (pointing at a name not in `mons`) was
never observed in the write paths, but `validateJourneyCoherence` now
detects it explicitly rather than silently returning `null` with no
signal, which is what happened before.

## WORLD

`AppState.world: World | null` is a single global field — **not** a map
keyed by Mon. `MonRecord.worldId?: string` is written at hatch
(`chooseEgg`) and at micro-growth (`doMicroGrowth`) but has **zero
readers anywhere in this codebase** (confirmed by a repo-wide search for
`.worldId` — every hit is a write site). This means "Mon/World
coherence" is structural by construction today (there's only one World
visible at a time, and it's definitionally the current one) rather than
an actively-enforced join — `validateJourneyCoherence` is the first code
that would ever notice a mismatch if one existed, and reports it as an
observation, not a hard failure, since nothing downstream depends on it
yet.

## STORY LEDGER

Traced precisely, because the code's own naming is misleading here.
**Two different things exist:**

1. `World.canon: CanonEvent[]` (written by `withCanon`) — the actual
   **chronology**: origin, evolution, mega-evolution, world-change
   (declared, never constructed — see RISE below), return, connection
   events, each with a day, an epistemic status, and text. This is what
   the task's brief means by "Story Ledger."
2. `AppState.ledger: StoryLedger` (`engine/world.ts`, written by
   `addSetup`/`payOff`) — recurring motifs, open threads, setups,
   past payoffs, "do not repeat" — **narrative craft-tracking metadata**
   (so the narrator doesn't repeat itself), not a chronology of events at
   all.

Both are legitimate, distinct concerns; the code's own name for #2
(`StoryLedger`) is what collides with the task's vocabulary for #1. This
document and `journey.ts`'s projection expose both, under their real
names, rather than merging them under one field or renaming either —
renaming `StoryLedger` was judged out of scope (touches `engine/world.ts`
call sites for no behavioral gain, purely cosmetic risk).

## APPSTATE.MEMORIES RELATION

Traced, not assumed. `AppState.memories: Memory[]`
(`{id, day, kind: 'conversation'|'milestone'|'joke'|'event'|'gift'|
'workout', title, text, monName}`) is written at exactly two sites:
pre-hatch egg conversation (`kind: 'conversation'`) and micro-growth
(`kind: 'milestone'`). Neither of these is the same moment `World.canon`
gets written — full evolution/mega-evolution (`revealFormEvolution`)
writes **only** to `world.canon`, never to `memories`; micro-growth
(`doMicroGrowth`) writes **only** to `memories`, never calls `withCanon`.
**They are not duplicates of the same events** — they're populated by
different mechanics, at different granularity, for different consumers
(`memories` feeds `reflectOnWeek()`/narrator context broadly; `canon`
feeds the World's own persistent record specifically). Not touched, not
merged, per the task's explicit instruction.

## TUNE VERIFIED

current behavior: "TUNE" does not exist as a term anywhere in this
codebase (confirmed by search — zero hits in code, comments, or docs).
Mapped it to the closest real mechanic: **evolution**
(`job.kind === 'evolution'` in `store.ts`'s `revealFormEvolution`). Real
code path: the Mon record changes (new form), a mindline node of kind
`'branch'` is added, and `withCanon(current.world, {kind:'evolution',...})`
appends a canon event — `withCanon` spreads `{...world, canon:[...]}`,
never touching `world.id` (read in full, `engine/world.ts:222-227`).

result: MATCHES the canonical rule ("TUNE → same World"). Verified
directly against the real `withCanon` function (not a reimplementation)
in `scripts/journey-check.mjs` Stage 4 — same `world.id` before/after,
canon length +1.

## RISE VERIFIED

current behavior: "RISE" also does not exist as a term anywhere in this
codebase. Mapped to **mega-evolution** (`job.kind === 'mega-evolution'`).
Traced the real code path in `revealFormEvolution`: it is the **exact
same branch** as evolution — same `withCanon(current.world, {kind:
'mega-evolution' ...})` call, same object, same `world.id` preserved. The
code's own comment at this exact call site (`store.ts` ~2114-2120) cites
the narrative spec directly: *"Evolution may change parts of the same
World. Mega Evolution may reveal deeper layers"* — i.e. the spec itself,
as understood by whoever wrote this code, does not define mega-evolution
as a World transition. `CanonKind` does declare a `'world-change'` value,
but it is never constructed anywhere in the codebase (confirmed by
search) — a planned mechanic that was never built, not a bug in an
existing one.

result: **DISCREPANCY, documented and deferred, not fixed.** The task's
own invariant #6 ("RISE means megaevolution + transition to a new World")
does not match current runtime behavior — mega-evolution keeps the same
`world.id`, verified directly against the real `withCanon` function in
`scripts/journey-check.mjs` Stage 5. Per the task's own instruction ("Fix
only if: the intended rule is already canonical in current specs/docs,
the change is bounded, no major Narrative work is required. Otherwise
document as deferred") — implementing a real World transition on
mega-evolution is real Narrative-system work (deciding when/how a new
World gets seeded, what happens to the old World's canon, what the
narrator says about it) that this phase's own DO-NOT-DO list rules out
("Do NOT start Narrative Phase 2," "Do not change lore or progression
implementation merely to satisfy tests"). Left exactly as is; flagged
here so it isn't silently rediscovered.

## Wish

`EvolutionWish` (`engine/syncRewards.ts`, Client/localStorage-primary)
influences **which** evolution/mega-evolution gets queued (family choice
via `wishNeedsMega()`), not World transitions — confirmed by reading its
only write/read sites. Matches the task's invariant #7 exactly as stated
("Wish may influence transition/form only where current code already
supports it") — no change needed.

## LEGACY WORLD FALLBACK

Already correct, verified not rebuilt: `worldBlock(world: World | null)`
(`engine/world.ts:262-274`) returns `"NESSUN MONDO ANCORA: quello che
scrivi adesso è la prima cosa che esiste."` when `world` is `null` — an
honest, already-existing fallback for any Mon-without-World state
(pre-hatch, or a save predating World). `validateJourneyCoherence` flags
this state for awareness (`activeMonWithoutWorld: true`) but does not
treat it as an error, matching how the rest of the codebase already
treats it. No new fallback mechanism was introduced.

## SAVE / RELOAD COHERENCE

`/api/state`'s persistence is a JSON round-trip of the opaque blob.
Verified domain coherence (not just byte equality) survives it: built a
`JourneyState` via `projectJourneyState`, ran it through
`JSON.parse(JSON.stringify(...))`, and confirmed the active Mon's name,
the World's id, and `validateJourneyCoherence`'s issue count are all
identical before and after (`scripts/journey-check.mjs` Stage 6). No
persistence code was touched to achieve this — it was already true, now
it's tested.

## NARRATIVE READINESS

`src/engine/narrativeContext.ts` was read and confirmed unchanged and
still unused (zero call sites, per Phase-1-era `CORE_BOUNDARY.md` §4,
re-verified). No type-level alignment was added to it this phase — its
existing shape (`{world, ledger}`-adjacent, pure) already matches what
`journey.ts`'s projection would feed it, and touching a currently-unused
file to "prepare" it further would be exactly the "fake future
abstraction" this phase was told not to build. The real readiness this
phase delivers is `journey.ts` itself: `NarrativeContext`'s future
`world`/`ledger` inputs can come from `projectJourneyState(...)` instead
of ad hoc `{world: s.world, ledger: s.ledger}` extraction scattered at
call sites — the same pure function, not a new one, whenever Narrative
work actually begins.

## WHAT MOVED

- The active-Mon-resolution logic — from two independent, duplicated
  inline implementations to one shared function.
- Nothing else. No data moved, no field renamed, no persistence touched.

## WHAT DID NOT MOVE

- `MonRecord`/`World`/`StoryLedger`/`CanonEvent` types — unchanged, still
  in `src/engine/types.ts` and `src/engine/world.ts`.
- `/api/state`'s opaque blob storage — unchanged, no new Blobs key.
- `seedWorld`, `withCanon`, `promoteConnection`, `payOff`, `worldBlock`,
  `ledgerBlock` — unchanged.
- `AppState.memories` — unchanged, not merged with `World.canon`.
- `narrativeContext.ts` — unchanged, still unused.
- Evolution/mega-evolution thresholds, Wish mechanics, mindline nodes —
  unchanged.

## Files changed

- `src/engine/journey.ts` — new, the Journey domain boundary.
- `src/state/store.ts` — `activeRecord()`/`useActiveMon()` now delegate
  to `resolveActiveMon`; no behavior change.
- `src/lab/rooms/SystemLab.tsx` — one new read-only "JOURNEY" diagnostic
  section in the existing SIMULATION room, showing active Mon/World/
  Ledger/coherence via the new projection. The only Web consumer
  converted this phase, per the task's own "one LAB diagnostic" example.
- `scripts/journey-check.mjs` — new, 24 assertions.
- `package.json` — `verify:journey` script added.
- `docs/CORE_EXTRACTION_PHASE3_2026-09-04.md` — this document.

No changes to `netlify/functions/state.ts`, any other Netlify function,
`engine/world.ts`, `engine/types.ts`, or `engine/progression.ts`.

## Deferred

- A real World-transition mechanic for mega-evolution ("RISE" as the task
  defines it) — real Narrative-system work, explicitly out of this
  phase's bound; documented above, not implemented.
- Exposing `projectJourneyState` over a server endpoint — no real second
  client exists yet to need it; `/api/state` remains the only persistence
  path, unchanged.
- Renaming `StoryLedger` to something that doesn't collide with "Story
  Ledger chronology" in casual conversation — cosmetic, touches call
  sites for no behavioral gain, not attempted.

## Next roadmap step

Given `world-change` is a declared-but-never-built `CanonKind` and this
phase found no other blocking Core-domain debt in Mon State/World/Ledger,
the two live options are: TRACE/Agent.lab preparation (a device-agnostic
tool-permission layer, per `CORE_BOUNDARY.md` §8's already-documented
gap), or Narrative System Phase 2 (which would be the natural place to
finally decide what mega-evolution's World transition should mean, now
that the discrepancy is documented rather than assumed). Neither was
started here.
