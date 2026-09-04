# CORE BOUNDARY

**Status:** architectural framing document, not a refactor plan. Written before any Core
Extraction work. Every claim below was verified against the current code (file:line), not
against comments or intent — where a comment and the code disagreed, the code won.

## 1. What "VINZ.MON Core" means

VINZ.MON is the entity. The web app in this repo is one client — one body — of that entity.
Future clients (a desktop app, House.mon, a wearable) are other bodies of the same entity, not
separate products with their own copy of who VINZ.MON is.

**Core** is the state and logic that answers "who/what is VINZ.MON, independent of which screen
you're looking at it from": identity, memory, the Mon itself, its persona/voice, its world and
story, its history. Core must eventually be reachable and consistent from any client.

**Client** is everything that exists only because *this particular surface* (a browser tab, a
gesture, a window) needs to render something or remember how the user last left it. A client may
cache or project Core state locally, but a client's own state dying (clearing a browser, closing
an app) must never mean VINZ.MON forgot something real.

This document classifies today's actual code against that line. It does **not** move any state.
Extraction is a separate, later roadmap step (Core Extraction) and is explicitly out of scope
here — see §7.

## 2. Core Canonical

Verified server-persisted today, in Netlify Functions + Netlify Blobs (or, for Mem0, an external
service reached only from the server):

| Concept | Where it lives today | Evidence |
|---|---|---|
| Mon State (`CharacterData`, `mons`, `activeMonName`, persona/voice fields on the character: `voice_preset`, `voice_dna`, `character_dna`, `palette_dna`) | Netlify Blobs `vinzmon-state`, key `save` (+ daily copies `day-N`) | `netlify/functions/state.ts:29,57,127-139` |
| World / canon (`world`) | same blob | `src/state/store.ts:446`; `src/engine/world.ts:94-109` |
| Story Ledger (`ledger`: recurring motifs, open threads, setups, payoffs) | same blob | `src/state/store.ts:448`; `src/engine/world.ts:162-172` |
| In-game event memories (`memories: Memory[]`) | same blob | `src/engine/types.ts:342-350` |
| Mindline nodes (`nodes`) | same blob | `src/state/store.ts:461` |
| Resolver Lessons / "taught" resolver knowledge | **own** Blobs key `lessons` (same store, split out on purpose) | `netlify/functions/lessons.ts:39-42,81`; `src/state/store.ts:3984-4001` explicitly excludes it from the generic blob |
| `customMemory` (free-text taught to the resolver) | bundled with Lessons, same dedicated key | `src/state/store.ts:4159-4174` |
| ME model (`MeEntity`/`MeRelation`/`MeEpisode`/`MeSource`) — the closest thing today to "personal Memory" | own Blobs key `me-model-v1`, same store | `netlify/functions/_shared/meModel.ts`; `docs/ME_MODEL_V1.md` |
| Mem0 (optional alternate/future writer for the same ME concept) | external service (Qdrant + sqlite), reached only server-side | `services/mem0/server.ts`; `netlify/functions/_shared/mem0MemoryClient.ts` |
| Insight/Reflection/ME machines and their derived output (`pendingInsights`, `meSummary`) | Netlify Blobs `vinzmon-machines`, key `machine-state-v1` | `netlify/functions/_shared/machines.ts:53-54,79-86,217-231` |
| AI model routing table and capability resolution | server-only module, never imported by browser code | `netlify/functions/_shared/routing.ts` |
| Runtime Log (technical event log) | Netlify Blobs `vinzmon-runtime-log`, key `events` | `netlify/functions/_shared/runtimeLog.ts:38-41` |
| The bearer auth token concept | designed as a portable credential — proved by a *second*, independently-issued token already existing for iOS Shortcuts | `netlify/functions/_shared/auth.ts:14-19,74-89` |

These are correctly server-owned today. Nothing here needs to move for Core Boundary purposes —
the job of this document is to say so explicitly, so nobody "fixes" them by accident.

## 3. Client / Web

Verified client-only, or legitimately client-scoped even when it happens to travel inside a
server payload:

- Pull-down/drawer stage, Shadow DOM LAB embedding, gesture/touch/drag state, scroll position,
  loading/rendering flags — `src/App.tsx` `PullDownSystemSheet`, `src/lab/embed/*`. Zero of this
  is sent anywhere; it's `useState`/`useRef` local to the component tree.
- `isAssetsSynced`/`useAssetsSynced` — an in-memory module flag scoped to one browser tab's asset
  cache hydration UI. `src/assets-pipeline/assetStore.ts`, `src/system/AssetSlot.tsx`.
- `DevFlags` (`dev`) and `SimulationBias` (`bias`) — LAB/DEV tooling configuration, not product
  state. `src/state/store.ts:296-323`; `src/engine/health.ts:192`.
- `skin`, `layout` — this browser's visual customization of the app shell.
- `voiceModel`, `compilerModel`, `imageModel`, `stepModels` — **the code already says this
  itself**: "è un pezzetto di configurazione perso in mezzo a `memories`, `nodes`, `mons`, `mood`
  e `opinions` — che sono il .mon... è configurazione di questo browser, non un pezzo della
  partita" (`src/state/store.ts:544-573`). Correctly identified as client config by whoever wrote
  it; incorrectly *stored* (see §5).
- Health Journal (`localStorage['vinzmon.health.journal.v1']`) — meals/workouts/weights/plans.
  Client-primary today. `src/engine/healthJournal.ts:8-53`. This is real-world health data, not
  yet a Core concept (roadmap item "Collegare i dati di salute veri" is still pending) — see §6.
- Legacy chat message mirror (`chat: ChatMessage[]`) — a seeded/deterministic simplified chat log
  kept in `AppState`, distinct from the assistant-ui thread/repository system that actually drives
  the live Chat UI. `src/state/store.ts:463,975,2154-2172`. Needs a decision, not an assumption —
  see §5.

## 4. Mixed / Legacy (current V1 reality — do not force a fix)

**The single biggest fact this document has to name:** `/api/state` persists `state: unknown` —
one opaque JSON blob (`netlify/functions/state.ts:34-55,127-139`). The client builds that blob
with `snapshotFor()` (`src/state/store.ts:3984-4008`), which sends **the entire `AppState`**
minus a handful of explicitly-excluded fields (`token`, `batch`, `lastTrace`, `lessons`,
`forgottenLessons`, `customMemory`, `customMemoryAt` — those have their own canonical keys).
Everything else — Mon State, World, Ledger, Memories *and* `skin`/`layout`/`dev`/`bias`/
`voiceModel`/`compilerModel`/`imageModel`/`stepModels` — travels together in one write.

This is real, working, and not to be split in this task (per the mission brief). It is debt that
Core Extraction will need to address by moving Core fields to their own canonical
endpoints/keys — the same pattern already proven safe for Lessons and the ME model — while
leaving Client config either purely local or in its own separate, non-canonical sync.

Other mixed/legacy findings:

- **`NarrativeContext`** (`src/engine/narrativeContext.ts:6-42`) already exists, is already pure
  (no React/Zustand import), and is already designed for exactly the target shape — "Runtime-only
  context shared by future narrative consumers... deliberately contains no persistence or
  retrieval logic" per its own header. It has **zero call sites** anywhere in the repo. This is
  not a coupling problem to fix; it's a ready-made piece nobody has wired in yet. Today's real
  narrator call path already does the right *shape* of thing ad hoc — `src/state/store.ts:2642`
  extracts plain `{ world: s.world, ledger: s.ledger }` out of the store and passes it into the
  pure `writeNarratorWithAi()` (`src/ai/narratorPrompt.ts:130-170`, which itself imports no
  React/Zustand). The gap is centralization, not decoupling.
- **Runtime Log** is correctly server-persisted but its schema has no `deviceId`/`clientId`/
  `sessionId`/correlation field today (`netlify/functions/_shared/runtimeLog.ts:5-56`) — fine for
  a single-client prototype, a real gap once a second client exists. See §9.
- **Legacy `chat: ChatMessage[]`** vs. the assistant-ui thread system: two representations of
  "what was said" appear to coexist. This document flags it; resolving which one (if either) is
  canonical is explicit Memory Cleanup work, not decided here — see §6.
- **Health Journal**: real primary data, currently client-only, opportunistically mirrored as an
  opaque `__healthJournal` field inside the same generic blob (`src/state/store.ts:4005-4007`) —
  a backup, not a structured server record. Becoming Core is future work, not assumed here.
- **Mem0 vs. the custom ME model**: both exist today; `docs/MEMORY_LEGACY_FREEZE_AUDIT.md` is the
  authoritative account of the writer boundary (`VINZMON_MEMORY_WRITER_MODE`) already built for
  this. This document defers to that one rather than re-stating it.

## 5. Multi-client invariants

These are rules, not yet all enforced by code — the point of naming them now is so nothing new
violates them before enforcement exists:

1. One VINZ.MON identity across clients.
2. One canonical personal Memory (today: the ME model / Mem0 boundary described in
   `docs/MEMORY_LEGACY_FREEZE_AUDIT.md` — not the legacy `Memory[]` event log, which is Mon-scoped
   game history, not personal memory).
3. One canonical Mon State.
4. One canonical Story Ledger / Narrative State.
5. **ME is a derived/synthesized view, not a competing user database** — already true today:
   `machines.ts`'s `me` machine reads Mem0/the ME model and writes a derived `meSummary`; it does
   not hold its own primary facts (`netlify/functions/_shared/machines.ts:176,217-220`).
6. Clients may cache/project Core state but must not silently become a second canonical store for
   it. (`AGENTS.md` already states the general form of this rule: "Shared runtime data must have
   one canonical server-side source. Local storage may be used as cache/fallback, not as
   competing truth.")
7. New Core-domain logic should avoid unnecessary React/DOM/`window`/`localStorage`/component-
   lifecycle dependency. Already true for the AI routing table, `narratorPrompt.ts`, and every
   `netlify/functions/_shared/*` module inspected for this document — none import React or touch
   the DOM. The place this rule is currently *not* honored is tool execution (§8).
8. Browser-only UI state (§3) stays in the Web client.
9. Model providers are implementation details, not VINZ.MON identity — already enforced:
   `CharacterData` has no model/provider field; the only place a model string is persisted next to
   a conversation is `ChatTrace.model`, explicitly a diagnostics record
   (`src/ai/chatTrace.ts:25-36`), not persona content.
10. Tools must eventually route through a permission/capability layer to whichever client/device
    can actually execute them. Not built yet — see §8.
11. Narrative target is `Core Context Builder → NarrativeContext → Narrator`, not
    `React component state → Narrator`. See §4 — the pure half of this already exists.
12. TRACE target is a cross-client technical history carrying client/device/session/correlation
    metadata. Today's Runtime Log has the log, not the correlation fields. See §9.

## 6. Memory Cleanup implications — addressed 2026-09-04

Bounded cleanup done; full result, rationale, and classification in
`docs/MEMORY_CLEANUP_2026-09-04.md`. Summary of ownership as it stands now:

- **Chat History** — Mixed/Legacy (§4), and this is now a documented, verified split rather than
  an open question: `AppState.chat` is incubation + DEV-tool scoped (its only live-phase writer,
  `CompanionHome.tsx`, was dead code and has been removed); the assistant-ui thread system is the
  real live Chat and never writes to `AppState.chat`. Cross-client continuity is still not solved —
  that remains a real Core Extraction question — but the two representations no longer look like
  competing sources of the same thing.
- **Mem0** — Core (server, external service). Already isolated behind
  `netlify/functions/_shared/mem0MemoryClient.ts` and the writer-mode gate in
  `docs/MEMORY_LEGACY_FREEZE_AUDIT.md`. No web-only path exists or should exist. Confirmed
  `/api/me-memory` is genuinely mode-dependent (Mem0 vs. ME Model) — see the cleanup doc.
- **Explicit Remember writes** — still one pipeline, not a separate store (unchanged, correctly).
  What was missing was honest client-side feedback when an explicit request's write failed or
  produced nothing; that gap is now closed (`me-chat-capture.ts` + `chat-memory-feedback.ts` +
  `chatgpt.tsx`) without adding a second write path. A tool-based awaitable version was
  investigated and ruled out — the local tool pipeline is fully synchronous — and is deferred to
  Core Extraction.
- **Insight Machine** — Core (server, `vinzmon-machines`). Already correctly isolated; triggers
  are client-*initiated* HTTP calls today (no scheduled function), which is a legitimate client
  responsibility ("ask Core to run a reflection") as long as the machine's own state and output
  stay server-owned, which they do.
- **Insights** (the pending-insight records themselves) — Core, same store as the machine that
  produces them. Correct today.
- **ME** — Core, derived/synthesized (§5.5). Must stay a projection, never a second primary store.
- **Health / Days** — Mixed/Legacy. `s.day`/`s.days` (game-day counters) are already Core
  (server-persisted with the rest of Mon state). The Health Journal (real-world meals/workouts) is
  still Client-primary and not yet a Core concept — becoming one is new work, not a cleanup of
  something already there.
- **Story Ledger** — Core. Already server-persisted; only mixed in the sense of sharing one blob
  with Client config (§4), not in the sense of being client-owned.
- **Context Builder** — does not exist yet under that name; `NarrativeContext`/
  `buildNarrativeContext()` (§4) is the closest existing piece and is unused. Memory Cleanup / the
  later Narrative step should wire consumers through it rather than inventing a second context
  shape.

## 7. Migration principle

Core Extraction, when it happens, should follow the pattern already proven twice in this
codebase — Lessons and the ME model each got their **own** Blobs key instead of joining the
generic `/api/state` blob. That is the template: give each Core concept its own canonical
endpoint/key, let the generic state blob shrink toward "the fields that are genuinely just this
save file," and never introduce a second store that competes with an existing canonical one.

Nothing is extracted in this task. This section documents the shape of the move, not a plan with
dates.

## 8. Tool / Permission implications

**Current, verified:** tool execution happens entirely in the browser, by explicit design —
`src/ai/tools.ts:20-25` states this outright ("GLI STRUMENTI GIRANO QUI, NEL BROWSER... Il server
vede passare i NOMI degli strumenti e i risultati... mai l'archivio"). The server
(`netlify/functions/ai.ts`) returns the model's requested tool calls; `src/brain/stream.ts`
dispatches them to `runMonTool` in the client store (`src/App.tsx:75`); results go back to the
server as plain text/JSON on the next turn. No permission or capability registry exists — every
declared tool assumes it can run wherever the chat UI happens to be mounted.

**Future invariant (not built now):**

```
VINZ.MON Core → Tool / Permission Layer → capable client/device → execution
```

Potential future capable clients: Web, VINZ.MON Desktop, House.mon. Claude/Codex/other model
providers are specialist tools *behind* VINZ.MON, not separate identities (§5.9) — this already
matches how routing.ts treats providers today ("the pen," never "what's in the notebook").

Not redesigned here. The only relevant guardrail for this task: nothing added in this pass gives
tool execution a *deeper* browser-only assumption than it already has.

## 9. TRACE implications

**Current, verified:** the Runtime Log (`netlify/functions/_shared/runtimeLog.ts`) is real,
server-persisted, and already used from both client and server call sites. Its schema
(`RuntimeEvent`, `runtimeLog.ts:5-56`) has no `deviceId`, `clientId`, `sessionId`, or correlation
field — only app-domain ids (`monId`, `worldId`, `conversationId`, `messageId`, `requestId`).

**Future invariant (not built now):** cross-client TRACE needs those fields added when a second
client actually exists to populate them meaningfully. Adding empty/always-`"web"` fields now would
be exactly the kind of premature abstraction this task is told not to build.

## 10. Rules for future changes

- Before adding a new field to `AppState`, ask: does this describe VINZ.MON, or does it describe
  this browser tab? If VINZ.MON, prefer a dedicated server endpoint/key (§7's pattern) over adding
  it to the generic save blob — the generic blob is accepted debt, not a template to keep filling.
- Don't add new Core-domain logic (Memory, ME, Persona, Mon State, Story Ledger, Narrative, TRACE,
  Tools) that imports React, touches `window`/`document`/`localStorage`, or depends on component
  lifecycle, when the same logic could be a plain function over plain data — the pattern already
  used by `narratorPrompt.ts` and every `_shared/` server module.
- Don't build CoreService/CoreManager/CoreBus/generic event bus/fake repository abstractions
  ahead of a real second consumer. This document is the boundary; the code for it comes with Core
  Extraction, when there's an actual second client to serve.
- Model/provider identifiers stay routing metadata; never let one become part of persona or
  identity content (§5.9).

## 11. Device-agnostic constraints this document does not relax

- Prototype V1 must keep working exactly as it does today. Nothing in §2–§9 changes any runtime
  behavior.
- `src/state/store.ts` is not split by this document. It stays one file with mixed ownership,
  now explicitly labeled, until Core Extraction.
- No new abstraction was introduced to "prepare" for multi-client support. The preparation is
  this document plus one inline pointer at the exact place future contributors would add a new
  mixed field (see the code change below).
