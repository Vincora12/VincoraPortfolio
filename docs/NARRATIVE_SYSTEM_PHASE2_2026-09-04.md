# NARRATIVE SYSTEM — PHASE 2 — WORLD TRANSITIONS + NARRATIVE CONTEXT + RISE — 2026-09-04

Bounded narrative-systems pass, scoped to the canonical product decision issued
for this phase: **TUNE (evolution) stays in the same World; RISE
(mega-evolution) opens a new one.** This resolves, by explicit human decision,
the discrepancy CORE EXTRACTION PHASE 3 traced and deliberately left
undecided (`docs/CORE_EXTRACTION_PHASE3_2026-09-04.md`, "RISE VERIFIED").

## The decision, and why it doesn't contradict the existing lore comment

`engine/world.ts`'s own header (citing the narrative spec) says a World
belongs to the Mon's whole history and does not restart on evolution, mega,
or branch — "il mondo non riparte, si stratifica." That comment is still
literally true for **TUNE**: unchanged this phase, still the same
`withCanon` call, same `world.id`, canon just grows. RISE is now a
**declared exception**, not a rewrite of that rule: the old World is never
deleted or overwritten — its canon receives one last `world-change` closing
event and it moves into `worldHistory`, append-only, byte-identical from
that point on. "Doesn't restart" and "doesn't disappear" are both still
true; what changed is only which World is *active*.

## JOURNEY CORE BOUNDARY — how RISE fits without duplicating it

`src/engine/journey.ts` (Phase 3) resolves the **committed** Mon/World
relationship — `activeMonName`, `world`. A RISE candidate, before the user
taps to reveal it, is deliberately *not* committed: `activeMonName` still
points at the previous form, exactly as `evolutionJob.candidateName` isn't
yet `activeMonName` either. Forcing the pending World through
`projectJourneyState` would mean lying to that boundary about what's
actually true yet. Instead, the pending World lives on the job itself
(`EvolutionJob.pendingWorld?: World`) — the same class of "not yet active"
state `pendingHeritage`/`pendingPlan`/`candidateName` already are. Every
other call site (hatch, TUNE, DEV-triggered narrator/bio) is now routed
through `journey.ts`'s `projectJourneyState` instead of reading `s.world`
directly — the one behavior-preserving cleanup this phase makes to the
existing boundary.

## WORLD TRANSITION — what actually happens, in order

1. **`beginFormEvolution('mega-evolution')`** (`store.ts`): once the
   candidate `MonRecord` exists, `riseWorld(s.world, record, s.day)`
   (`engine/world.ts`, new) builds the candidate World **deterministically**
   — same guarantee as `seedWorld`: it exists even with no AI key. The
   candidate record's `worldId` is set to *this* new World's id, not the
   current one. `AppState.world` itself is **not** touched yet — it still
   answers "what World is VINZ.MON in" correctly for the still-active
   previous form.
2. **`resumeFormEvolution` → `writeBio`/`writeNarrator`**: both resolve the
   right World via the same path (`resolveWorldIdentity`, new) — the
   deterministic candidate, optionally enriched once by a cheap AI call.
3. **`revealFormEvolution`** (the user's tap): performs the actual
   transition — `AppState.world` becomes the (possibly enriched) candidate;
   the old World receives a closing `world-change` `CanonEvent` and is
   pushed onto `AppState.worldHistory`.

Nothing about steps 1–2 is visible to the rest of the app until step 3 —
same discipline the codebase already uses for the candidate Mon record
itself.

## WORLD-CHANGE CANON EVENT

Two, not one, and deliberately symmetric — the "answer from which World? to
which World? which Mon? why?" requirement:

- **Opening**, written by `riseWorld()` at candidate-creation time, inside
  the new World's own `canon` (so `worldBlock()` already has something to
  show a narrator/bio call during generation, before reveal): *"X è
  arrivato qui lasciandosi dietro Y."*
- **Closing**, written by `revealFormEvolution()` at reveal time, appended
  to the *old* World before it's archived: *"X lascia Y... con Z si apre
  W."*

Both use the existing `CanonKind = 'world-change'` — declared since Phase
1-era code, never constructed until now (confirmed by Phase 3's trace).

## WORLD IDENTITY

`riseWorld()` guarantees a valid World unconditionally (name, description,
identity, World Cultural DNA — reusing `resolveWorldCulturalDna`, the exact
function `seedWorld` already uses; not a second generator). A single
optional enrichment, `writeWorldIdentityWithAi` (`src/ai/worldIdentity.ts`,
new), may replace `name`/`identity`/`description` with a less catalog-like
version — never required, never blocking. Routed through the same
`AI_STEPS`/`runStep`/telemetry machinery as every other narrative AI call
(new `worldIdentity` step, `capability: 'text-cheap'`, same tier as
REFLECTION/MEMORY — confirmed cheapest available, `claude-haiku-4-5`
fallback).

## AI COST — verified, not assumed

- **TUNE**: zero new AI calls. `resolveWorldIdentity` returns immediately
  for any job that isn't a mega-evolution with a `pendingWorld`.
- **RISE**: at most one `worldIdentity` call. Guarded two ways: a
  module-level `worldIdentityRequested` Set (both `writeBio` and
  `writeNarrator` call `resolveWorldIdentity` for the same candidate, near-
  simultaneously — the Set's synchronous check-before-await prevents both
  from firing the network call) and a no-token early return (no key, no
  call, the deterministic identity is already valid).
- Verified directly in `scripts/narrative-phase2-check.mjs` Stage 1 (the
  step exists, capability `text-cheap`) and by inspection of
  `resolveWorldIdentity`'s guards — no test can observe network calls in
  this offline suite, so this is a structural/code-path guarantee, not a
  mocked-call count.

## WORLD CULTURAL DNA — now actually read

`World.worldCulturalDna` existed since Phase-1-era `world.ts` but
**`worldBlock()` never surfaced it to any prompt** — confirmed by reading
the function before this phase. One line added to `worldBlock()`:
`RIFERIMENTI CULTURALI DEL LUOGO`. This is the single change that makes
GOAL 5 real for every World, not only RISE-created ones — narrator, bio,
and `returnBlock` (which calls `worldBlock` internally) all gained this
context for free. Verified never to touch the image/asset pipeline:
`worldBlock`/`riseWorld`/`resolveWorldCulturalDna` have no import path into
`assets-pipeline/`, `compiler.ts`, or the Resolver — confirmed by the same
grep discipline Phase 3 used for `worldId`.

## MON CULTURAL DNA SEPARATION

Unchanged, and structurally guaranteed distinct: `MonRecord.data.cultural_dna`
(anatomy/visual reference pool, consumed only by the compiler/Resolver
paths this phase doesn't touch) vs. `World.worldCulturalDna` (tone/vocabulary,
consumed only by `worldBlock`). `scripts/narrative-phase2-check.mjs` Stage 2
asserts the two arrays are never the same list for a real RISE fixture.

## NARRATIVE CONTEXT

`src/engine/narrativeContext.ts` gained one field: `previousWorld?: World`
(alongside the pre-existing `previousMon?`/`transitionType?`, which were
declared but never populated by any real call site before this phase). It
remains runtime-only — no persistence, no new store field of its own type,
built fresh on every `writeBio`/`writeNarrator` call from already-persisted
state (`journey.ts`'s projection or the job's `pendingWorld`). This is the
real Core Journey → NarrativeContext → Narrator flow, not a type that only
exists for a unit test: `writeNarrator`'s call site in `store.ts` builds a
`NarrativeContext` via `buildNarrativeContext(...)` and reads `world`/
`ledger` back out of it for the actual `writeNarratorWithAi` call.

## NARRATOR/BIO CONSUMER

**Narrator** (`writeNarrator` in `store.ts`) is the primary, mandatory
consumer: it now always resolves its World through the boundary described
above (RISE → resolved pending World; everything else → `journey.ts`'s
projection) instead of reading `s.world` unconditionally, and constructs a
real `NarrativeContext` to get there. `writeNarratorWithAi`'s own signature
and `NARRATOR_RULES` (voice/personality) are **untouched** — the transition
reaches the model through content (`worldBlock` on the new World, which
already contains the opening `world-change` canon line naming the World
left behind, plus its Cultural DNA), not through a rewritten prompt.

**Bio** (`writeBio`) is the optional second consumer, wired because it was
genuinely clean: it already accepted a pre-rendered `world?: string` block
(`BioMemoryContext`) — the one-line change is which World gets resolved
before rendering it, identical resolution logic to Narrator's. `bioWriter.ts`
itself (its `BIO_RULES`, its own prompt construction) is untouched.

## WISH

Unchanged mechanism (`engine/syncRewards.ts`, `record.data.user_wish`),
newly reachable: `resolveWorldIdentity` passes `record.data.user_wish` into
`writeWorldIdentityWithAi`'s context when present, and `writeNarrator`
passes the same field into `NarrativeContext.wish`. No new Wish system, no
change to `wishNeedsMega`/`saveEvolutionWish` — exactly the task's own
instruction ("Wish may influence... only where current code already
supports it").

## JOURNEY CORE COHERENCE

`validateJourneyCoherence`/`resolveActiveMon`/`projectJourneyState`
(`engine/journey.ts`) are **unchanged** this phase — no duplicate resolver
logic was introduced. They automatically reflect a post-RISE World because
`AppState.world`/the active Mon's `worldId` are simply the values they
already read; the RISE-specific "candidate not yet committed" case is
handled entirely outside `journey.ts`, as designed above.

## LEGACY COMPATIBILITY

- A `World` with no `previousWorldId` (every World from `seedWorld`, and
  every World from before this phase) is fully valid — the field is
  optional, `worldBlock`/`validateJourneyCoherence` never require it.
- A save with a historical mega-evolution recorded the old way (a
  same-World `mega-evolution` canon event, no `world-change`, no
  `worldHistory` entry) is not retroactively rewritten into a fake
  transition — `scripts/narrative-phase2-check.mjs` Stage 7 constructs
  exactly this case and asserts nothing about it changes or crashes.
- `AppState.worldHistory` is a new top-level field (default `[]`), riding
  along in the same opaque `/api/state` blob via `snapshotFor`'s existing
  `...rest` spread — **no new Blobs key**. A remote save predating this
  field simply lacks the key; `applyRemoteSave`'s `useApp.setState({
  ...appState, ... })` leaves the local (already-`[]`-initialized) value
  untouched in that case — verified by reading the actual merge code, not
  assumed.

## VISUAL PIPELINE

Not touched. No file under `assets-pipeline/`, `compiler.ts`,
`resolver/`, or any prompt/asset-generation path was modified. The one
place this phase adds AI-generated text that could theoretically leak into
a visual prompt (`WorldIdentity.descriptor`) is explicitly instructed
("non descrivere il corpo, l'aspetto o l'anatomia della creatura") and
never wired into any image call — `writeWorldIdentityWithAi` is only ever
consumed by `resolveWorldIdentity`, which only ever feeds `worldBlock`
(text-only, narrator/bio).

## WHAT MOVED

- The "which World applies to this narrator/bio call" resolution — from an
  unconditional `s.world` read, to a boundary-aware resolution
  (`journey.ts` for committed state, job-local `pendingWorld` for an
  in-flight RISE candidate).
- Mega-evolution's World relationship: from "same World, always" to "same
  World for TUNE, a real new World for RISE" — the canonical decision this
  phase implements.

## WHAT DID NOT MOVE

- `TUNE`'s mechanics, thresholds, and World relationship — byte-identical
  behavior, refactored into a named branch rather than rewritten.
- `AppState.memories`, `StoryLedger` (`engine/world.ts`'s craft-tracking
  type) — untouched, still distinct from `World.canon`, per Phase 3's
  classification.
- `seedWorld`, `withCanon`, `promoteConnection`, `payOff`, `returnBlock`,
  `ledgerBlock` — unchanged (`worldBlock` gained one line; every caller of
  it, including these, benefits without any of them being touched).
- `EvolutionWish`/`saveEvolutionWish`/`wishNeedsMega` — unchanged.
- The visual/asset pipeline, the Resolver, image prompts — untouched.
- `/api/state`'s opaque blob storage mechanism — unchanged; `worldHistory`
  rides along automatically, no migration, no new endpoint.

## Files changed

- `src/engine/world.ts` — `World.previousWorldId?`, `riseWorld()`,
  `worldBlock()` now surfaces `worldCulturalDna`.
- `src/engine/narrativeContext.ts` — `previousWorld?: World` field, wired
  through `buildNarrativeContext`.
- `src/ai/worldIdentity.ts` — new: the one optional cheap enrichment call.
- `netlify/functions/_shared/routing.ts` — new `worldIdentity` AI step
  (`capability: 'text-cheap'`), added to `AI_STEP_ORDER`.
- `src/state/store.ts` — `EvolutionJob.pendingWorld?`, `AppState.worldHistory`,
  `beginFormEvolution` creates the candidate World for RISE,
  `revealFormEvolution` performs the real transition (or the unchanged TUNE
  path), `resolveWorldIdentity` (new module-level helper),
  `writeBio`/`writeNarrator` resolve the correct World and (narrator) build
  a real `NarrativeContext`.
- `src/lab/rooms/SystemLab.tsx` — JOURNEY diagnostic section extended with
  `WORLD ORIGIN` and `WORLD HISTORY` rows (read-only, same Section as
  Phase 3 added).
- `scripts/narrative-phase2-check.mjs` — new, 34 assertions.
- `package.json` — `verify:narrative-phase2` script added.
- `docs/NARRATIVE_SYSTEM_PHASE2_2026-09-04.md` — this document.

No changes to `netlify/functions/state.ts`, any asset/visual pipeline file,
`engine/progression.ts`, `engine/syncRewards.ts`, or TUNE/RISE day
thresholds.

## Deferred

- Extending `NarrativeContext.previousWorld` into `writeNarratorWithAi`'s
  own function signature as an explicit separate parameter — judged
  unnecessary: the transition already reaches the prompt honestly through
  `worldBlock`'s canon + Cultural DNA content, and adding a redundant
  parameter that duplicates information already in `context.world` would be
  exactly the "fake future abstraction" earlier phases were told to avoid.
- A UI surface for browsing `worldHistory` (a "past Worlds" screen/list) —
  the data exists and is diagnosable in SYSTEM.LAB, but no product surface
  was requested and building one would be scope beyond "connect one real
  consumer."
- Extending the RISE World-identity call to also consider
  `AppState.memories`/personal Memory as context — explicitly out of scope
  ("Do not query all personal memory indiscriminately").

## Next roadmap step

TRACE / AGENT.LAB PREPARATION — the device-agnostic Tool/Permission layer
gap `docs/CORE_BOUNDARY.md` §8 already documents is now the clearest
remaining structural gap; this phase closed the other live candidate named
at the end of Phase 3 (the RISE/World-transition decision) by implementing
it.
