# VINZ.MON — Final preflight audit (2026-09-06)

## Executive verdict

**Repository:** `Vincora12/VincoraPortfolio`  
**Branch:** `claude/project-prototype-jxjc3d`  
**HEAD at audit:** `267768997723c46c1d021add3b8e69c77faba9b1` (`feat: add read-only storage inspector`)  
**Working tree:** clean at capture; no staged, modified, or untracked files. No evidence of another unfinished production edit.

### 1. How complete is VINZ.MON today?

**Reasoned range: 45–60% of the stated final product; 75–85% of the prototype/game core.** The web prototype has a real deterministic character generator, progression, ME health surfaces, a working server AI boundary, tools, persistence and a Lab. The broader product definition (projects, cross-client identity, dependable agent execution, artifacts, connected services, automations and universal inbox) is mostly absent or only represented by hooks/specification.

### 2. Five biggest real gaps

1. Canonical cross-client state does not exist: the active Mon and much of ME/game state are browser-local (`src/state/store.ts`), while chat and ME Model are separate server stores.
2. Agent execution is a bounded tool loop, not a durable planner/executor with verification, retries, approvals and resumable jobs (`src/ai/client.ts`, `src/brain/stream.ts`).
3. Projects, second brains, connected-service permissions and artifact ownership are not implemented as product domains.
4. Memory is split between legacy `Memory[]`/custom ME Blob and optional Mem0; ME Model writes are not injected into chat or Mon context (`netlify/functions/_shared/meModel.ts`, `meChatMemory.ts`).
5. The narrative/world layer is deterministic and useful as a skeleton, but World identity, lived material and Narrator are not yet a fully integrated experience (`src/engine/world.ts`, `src/ai/narratorPrompt.ts`).

### 3. Preserve at all costs

- Deterministic, seeded Character Generator and closed taxonomy (`src/engine/characterGenerator.ts`, `generation-config.ts`).
- One VINZ.MON consciousness with forms linked by Mindline and heritage, rather than independent assistant personas (`src/engine/types.ts`, `mindline.ts`).
- Server-side auth, provider routing and cost cap before provider calls (`netlify/functions/ai.ts`, `_shared/routing.ts`, `_shared/spend.ts`).
- Explicit provenance/epistemic distinction in World canon and the existing visual pipeline.
- Best-effort storage behavior and the tested first-message/promotion safeguards; they protect the product from browser quota and cold-start regressions.

### 4. Consolidate/remove (recommendation only)

Consolidate future memory access behind the existing authenticated ME/Mem0 projection boundary; do not keep adding readers of `Memory[]`, custom ME and Mem0 independently. Consolidate future client hydration behind one canonical server operation. Leave old DEV/simulation paths and legacy fields in place until migration tests prove they are unused; no deletion is justified by this audit alone.

### 5. Is the current core multi-client ready?

**PARTIALLY.** `/api/ai`, `/api/brain`, auth and server ME Model are reusable boundaries, but the active Mon, Persona/Voice state, health/progression and much of conversation UI state are local or browser-bound. A second client cannot hydrate the same complete identity without reproducing browser state.

### 6. Can OpenClicky today be the same Mon?

**PARTIALLY.** The OpenAI-compatible ingress is not present in this checkout (no `netlify/functions/v1-*.ts` or `openaiIngress.ts` found), so an OpenClicky endpoint cannot currently receive the same canonical context. The existing `/api/ai` boundary can be reused, but identity, active form, memory and conversation ownership still need a server canonicalization pass.

### 7. How agentic is VINZ.MON today?

**TOOL-USING ASSISTANT.** It can select tools, run up to four rounds, inspect returned results and continue (`src/ai/client.ts:MAX_TOOL_ROUNDS`, `src/brain/stream.ts`). There is no durable plan, resumable execution, approval queue, systematic verification or autonomous continuation, so “reliable executor” would overstate the evidence.

### 8. Hermes verdict

**B — PORT HERMES PATTERNS. Confidence: 80%.** Hermes has strong patterns for tool registries, session persistence, skills, gateway surfaces, cron, approvals and sandboxed execution, but its SQLite/filesystem/Python persistent-runtime assumptions and its own memory/profile/session ownership make direct embedding or rebasing a poor fit for the current Netlify/browser core. Borrow patterns behind VINZ.MON-owned boundaries; do not install Hermes as a second brain.

### 9. Should the next Astra pass implement?

**YES, but only a focused V1 pass:** (1) canonical server hydration/context boundary while keeping existing stores readable; (2) harden chat/tool execution and observable file/artifact ToolResults; (3) bounded ME/Mem0 projection with provenance; (4) project/artifact/automation domains only where an end-to-end slice is testable. Keep BREED, BABY, full Journey, NPCs and World simulation parked.

### 10. Can a coherent V1 be completed in one large pass?

**PROBABLY, for a deliberately narrow V1.** It cannot honestly complete the entire brief in one pass. “Complete” should mean: one canonical identity, dependable chat + memory boundaries, a small verified tool/action slice, ME health correctness, and production gauntlet coverage—not every connector or game concept.

## Current implementation map (facts)

### Core and creation

`generateMon()` and `generateFirstMon()` in `src/engine/characterGenerator.ts` are deterministic functions over seeded RNG, user signals, cultural affinities, Mindline/novelty and optional continuity inputs. They resolve Family, family archetype, Affinity, Size, Narrative Archetype, Drive/Contradiction, Role, Fashion, Mood, rarity, Character Design DNA, Cultural DNA, palette, Heritage, Voice DNA and Name. Bio base, Sigil and Reactions are constructed immediately after CharacterData in the returned `MonRecord`; AI-written Bio, creative resolver and prompt rewrite are optional downstream calls. `docs/lab/CREATION_MODEL.md` and `CURRENT_CREATION_FLOW.md` accurately describe this split.

`CharacterData` is a closed schema in `src/engine/types.ts`; `MonRecord` adds `bio`, `sigil`, `reactions`, optional `writtenBio`, `resolution`, optional compiled prompts, assets and trace. The visual pipeline (resolver → prompt compiler → asset generation) is separate and must remain unchanged.

### Memory and ME

Legacy game memories are `Memory[]` in Zustand (`src/state/store.ts`) and are used by `memoryContext.ts`, Bio/narrative prompts and UI. The server ME Model is a separate JSON document in Netlify Blobs store `vinzmon-state`, key `me-model-v1` (`netlify/functions/_shared/meModel.ts`). `me-chat-capture.ts` performs conservative extraction and writes the custom document; the endpoint `me-memory.ts` returns a projection. Optional Mem0 is selected by `VINZMON_MEMORY_WRITER_MODE=mem0` through `memoryWriter.ts` and `mem0MemoryClient.ts`. The current code does not merge these stores into a single retrieval API or inject ME Model output into normal voice prompts.

### Chat

The primary assistant-ui surface is `src/assistant-original/IntegratedChat.tsx` plus `components/examples/chatgpt.tsx`. `conversation-lifecycle-adapter.ts` provides a local unsaved session, promotion and repository handoff. The model adapter is `netlify-runtime.ts`, which posts to `/api/ai` with capability `character-voice`; it emits chat runtime events and persists conversation through assistant-ui/local storage and the Brain path. The separate Brain surface (`src/brain/Brain.tsx`, `brain/store/client.ts`, `netlify/functions/brain.ts`) persists conversations in `vinzmon-brain/state` and also maintains a browser cache. The two chat implementations therefore coexist and are not one canonical conversation store.

### AI and routing

`netlify/functions/_shared/routing.ts` is the central catalog. Current default routes are: `character-voice → openai/gpt-5.6-terra`, `text-cheap → openai/gpt-5.6-luna`, `vision-quick → google/gemini-2.5-flash`, `image → openai/gpt-image-2`, `prompt-compile → openai/gpt-5.6-terra`. `ai.ts` authorizes, checks spend, validates bounded payloads, resolves the route and calls `_shared/providers.ts`; usage is recorded in `_shared/spend.ts`. This is a real provider abstraction, but there is no universal client capability registry or cross-client context hydration.

### Game, World and Mindline

`src/engine/progression.ts` implements SYNC, daily signals, day boundary, TUNE/RISE gates and deterministic date mapping. `src/engine/world.ts` supplies one persisted World, canonical events, StoryLedger, deterministic `resolveWorldCulturalDna()` and `seedWorld()`. `src/engine/narrativeContext.ts` is a runtime-only bounded builder, currently consuming current/previous Mon, World, ledger, transition, Wish, Mon/World Cultural DNA, Narrative DNA and Heritage. `mindline.ts` owns graph topology and layout; World is not part of its topology. The current World relation is mostly `world` in AppState plus `worldId` copied onto Mon records; there is no normalized World membership index.

### Tools and action

`src/ai/tools.ts` defines ME read/write tools, pages, reminders, layout/skin and data operations. Tools run in the browser through `ToolContext`; the server receives names/results through `/api/ai`. `src/ai/client.ts` and `src/brain/stream.ts` implement bounded multi-round loops. Writes use validation in pages/state functions, but there is no durable plan/approval/undo/verification layer. File generation is currently page/download-oriented; no verified general artifact deployment domain is present.

The catalog contains 20 VINZ-native tools (health/ME, pages, reminders, skin/layout and memory reads). It does **not** contain the brief's `code_search`, `code_read`, Project, artifact, Gmail/Drive/GitHub or Instagram tools. Web search is provider-native (`webSearch`), not a VINZ tool. Tool exceptions become `ToolResult.isError`; generic retry and independent verification are absent. Meal/workout confirmation is a special-case UI policy, not a shared permission system.

### Agenticity and tool-result safety

The model can receive a goal, implicitly plan through tool calls, execute up to four rounds, inspect results and produce a final answer. It cannot resume after the request, maintain a durable plan, independently verify a claimed side effect or ask for a general approval. Result size is bounded indirectly by round/tool caps and per-endpoint limits, but no aggregate byte/token budget helper was found; large page/health outputs remain a fragile edge.

### File, artifact and Project reality

`engine/pages.ts` provides bounded in-app Markdown pages; asset export creates a client ZIP of Mon prompts/metadata; MemoryView and browser print provide downloads/PDF-like output. There is no stable standalone artifact deployment/update/version/archive/ownership model. “Project” appears as an ME entity type and extraction vocabulary only; there is no Project context, file scope, project memory or task store.

### Connected services, automation and social

Current external boundaries are Netlify Blobs, Mem0 HTTP, provider web search, iOS Shortcut ingress and Web Push. No Gmail, Calendar, Contacts, Drive, GitHub, Netlify-source or Meta/Instagram connector exists. Reminders are local state; push is used for machine insights/evolution, not a general server scheduler. There is no persistent cron/watch/approval queue or social account model.

### Daily Energy and unified calendar

Meals/macros and optional workout `burnedKcal` are stored in `healthJournal.ts`; `healthEstimate.ts` can ask AI for estimates. No deterministic BMR/TDEE/deficit-surplus calculator was found. The ME calendar is a DayPicker-based date surface for health records, not a unified event system for appointments/tasks/external calendars; planned and completed semantics are not generalized beyond current health data.

### UX, capability awareness and “alive” character

Composer behavior is implemented in `components/examples/chatgpt.tsx` and assistant-ui primitives; Enter/Shift+Enter, disabled/running and attachments are present, with custom typing/reveal behavior. `typingRhythm.ts` is a local rhythm helper, not a durable state. Effective capability awareness is assembled from tool definitions and routing but no single registry exists, so the model can under- or over-claim capabilities. Personality is strongest when `buildVoiceSystemPrompt()` receives Voice DNA, Mood, opinions, notes, memories and the active form; forms change the prompt and reactions, but persistent Core Character growth is explicitly standby. Some expression is constrained by prompt rules and generic fallback text.

### OpenAI ingress / OpenClicky

The requested `v1-models`, `v1-responses`, `v1-chat-completions` and `_shared/openaiIngress.ts` are absent from the current tree. Consequently there is no verified OpenClicky → VINZ ingress, shared conversation ownership or same-Mon context hydration. `/api/ai` is an authenticated app endpoint and is the reusable base, not an OpenAI-compatible public contract.

### Infrastructure and observability

Netlify Functions cover AI, Brain, state/user-data, assets, ME, machines, lessons, push and runtime log. `runtimeLog.ts` is a best-effort 48-hour/500-event technical log in Blob store `vinzmon-runtime-log`; `chatTrace.ts` is client trace plus a server-backed trace projection. Usage/cost is a separate Blob ledger and must stay separate. Storage Inspector is read-only in `src/lab/rooms/SystemLab.tsx`.

## Product completeness snapshot

| Domain | Status | Evidence / reason |
|---|---|---|
| Identity + active Mon | WORKING locally | Zustand `mons`, `activeMonName`; no shared canonical server owner |
| Character generation | WORKING | deterministic generator and tests/scripts |
| Voice/persona | WORKING BUT NEEDS VALIDATION | `voicePrompt.ts`, `voiceDna.ts`, `/api/ai`; Core character growth not implemented |
| Legacy Memory[] | WORKING locally | state + memory context |
| ME Model | PARTIAL | server Blob document/projection; no prompt integration |
| Mem0 | PARTIAL/CONFIGURATION-DEPENDENT | optional writer, list/search; provider/deployment external |
| Main chat | WORKING BUT NEEDS VALIDATION | assistant-ui + promotion fixes; production iPhone validation still outstanding |
| Chat cold start/persistence | PARTIAL | bespoke lifecycle adapter and recent fixes; requires gauntlet |
| Tools | WORKING BUT NEEDS VALIDATION | catalog + browser dispatcher + four-round loop |
| Agenticity | TOOL-USING ASSISTANT | no durable plan/retry/verification |
| TUNE/RISE/SYNC | WORKING | progression/store canonical paths |
| World | PARTIAL | deterministic single World + ledger; weak multi-Mon association and identity consumer coverage |
| Narrator | PARTIAL | `narratorPrompt.ts`, triggered from store for selected events, deterministic fallback; not a general event system |
| Mindline | WORKING | graph, branch/lane/chapter layout; orthogonal to World |
| Projects | MISSING | no Project entity/context boundary in product code |
| Second Brains/connectors | MISSING | no GitHub/Drive/Netlify source domain |
| Artifacts/standalone apps | PARTIAL | pages and downloads exist; no stable owned artifact lifecycle/deploy/update |
| Automations | PARTIAL | reminders/push and app automations in Codex are not VINZ.MON domain; no user-owned scheduler |
| Social/Instagram | MISSING | no Meta integration |
| Universal inbox/search/approval | MISSING | no canonical domain |
| OpenAI-compatible ingress | MISSING in current checkout | no `v1-*` functions found |
| Multi-client identity | PARTIAL | server auth/AI boundaries reusable, state not canonical |

## Memory authority matrix (current)

| State | Current owner | Persistence | Main consumer | Risk |
|---|---|---|---|---|
| Active Mon/forms/game | Zustand `vinzmon.prototype.v4` | browser localStorage, compacted best-effort | Web UI, prompts, progression | high cross-device divergence |
| Legacy memories | Zustand `Memory[]` | same local snapshot | voice context, Bio, ME UI | duplicate with ME/Mem0 |
| Chat | assistant-ui thread storage and/or Brain Blob | browser + `vinzmon-brain` | chat surfaces | competing histories |
| ME entities/relations/episodes | `vinzmon-state/me-model-v1` | Netlify Blob | ME endpoint/UI | not used by voice/generator |
| Mem0 | external service via `mem0MemoryClient.ts` | external | memory writer/list/search | optional and separate |
| Reflection/ME machine outputs | `vinzmon-machines` | Netlify Blob | Lab/in-app insight | derived, not canonical memory |
| Usage | `_shared/spend.ts` ledger | Netlify Blob | Lab/cap | correctly isolated |
| Runtime diagnostics | `_shared/runtimeLog.ts` | Netlify Blob 48h | Lab | technical only |

## Target architecture (recommendation, not implementation)

Keep the deterministic generator and visual pipeline. Add one server-side **Canonical VINZ Context** read boundary that composes existing owners (active Mon/form, Persona/Voice, ME projection, bounded memory, structured health, World/progression and effective capabilities) without moving those domains into a new database. Web chat and a future OpenClicky ingress should call that boundary. Keep NarrativeContext runtime-only and use it for Bio/Narrator only.

Use one durable action envelope for future tools: goal, step, tool, target, permission, result, verification, audit. Reuse the current catalog/dispatcher; add persistence only when a multi-step action needs resumption. Projects should own context, files, artifacts and automations, but not a second VINZ.MON identity.

## Production gauntlet to execute in the implementation mission

First launch and activation; first message and cold-start; long conversation; reload/new chat/multi-thread; second device; explicit remember and ME projection; meals/rest/workout/calories; TUNE/RISE/World history; tool read/write/confirmation/error; grounded repo audit; real TXT/file ToolResult; project context; artifact deployment/update; automation and notification; provider routing/cap; Web ↔ OpenClicky same identity; storage quota/degraded mode; backup/export/undo; production deploy. Mark parked/absent domains as NOT APPLICABLE rather than pretending they pass.

## Universal-assistant readiness

| Capability | Status | Evidence / reusable infrastructure |
|---|---|---|
| Universal inbox | MISSING | no destination proposal domain |
| Global search | PARTIAL | provider web search only |
| Voice input | PARTIAL | `/api/transcribe`, `DictationComposer` |
| Notification center | PARTIAL | push + machine insight UI |
| Approval queue | MISSING | only meal/workout special cases |
| File intelligence | PARTIAL | assets/pages/downloads |
| Universal action language | PARTIAL | current tool schemas |
| Backup/export | PARTIAL | state/assets export fragments; no full restore contract |
| Permissions/privacy | PARTIAL | auth and narrow confirmations |
| Degraded/offline mode | PARTIAL | local fallback, no explicit mode |
| Cost-aware AUTO | PARTIAL | routing, cap and usage exist |
| Undo/versioning | MISSING | page history is not action history |
| Project collaboration | MISSING | no Project domain |
| Proactive briefing | MISSING/PARTIAL | machines and push are narrow prerequisites |

## Evidence labels and legacy inventory

**FACT** = directly observed in code. **INFERENCE** = architectural consequence. **RECOMMENDATION** = target planning. **NOT VERIFIED** = needs a real-device/provider/deployment test. Leave the following legacy or duplicated paths in place until migration evidence exists: `src/brain/*` and `/api/brain`, `AppState.chat` beside assistant-ui history, legacy `Memory[]` beside ME/Mem0, old parked progression phases, DEV simulation and older docs. Do not delete them in the next pass merely to make the tree look simpler.

## Evidence and conflicts

- `README.md` and `docs/lab/*` accurately describe the deterministic prototype and optional AI stages, but they predate the broader “persistent companion / projects / multi-client” target.
- `docs/ME_MODEL_V1.md` explicitly calls the ME Model dormant and disconnected; that is consistent with code.
- `docs/LORE.md` parks Narrator and larger game systems, while current code contains a partial narrator and World implementation: code is ahead of that documentation in those narrow areas.
- The prompt’s OpenClicky/v1-ingress report conflicts with this checkout: no `netlify/functions/v1-*.ts` or `_shared/openaiIngress.ts` exists; this is **not verified**, not assumed implemented.
- Current `World` comments say one World belongs to the Mon history; the target brief requires multiple forms in one World. The current store can carry a `worldId`, but no complete membership/visit model is present.

## Final answers

**A.** Today a Mon is genuinely born from deterministic user/day/health/signal/personality/cultural/continuity inputs plus seeded closed catalogs; AI is optional for written Bio, resolver, prompt rewrite, image and selected narrative lines.  
**B.** Narrative Archetype affects Role and is copied into Voice/Bio/Narrator prompts, but is weakly visible in product experience; Story Function is largely creation metadata.  
**C.** Cultural DNA materially affects visual prompt fragments; narrative consumers are limited.  
**D.** The base Bio is an attribute/fact-oriented deterministic file; optional AI Bio is prose but not a consistently lived story.  
**E.** World is a real partial deterministic subsystem (record + canon + ledger), not yet an autonomous cross-form World domain.  
**F.** A partial Narrator exists (`src/ai/narratorPrompt.ts`) with selected store triggers and fallback, not a complete narrator service.  
**G.** The Mon uses a small part of Mem0/ME/Reflection; most personal knowledge remains in chat/legacy local state.  
**H.** Underused data includes Narrative DNA function, World Cultural DNA, ME Model output, Creation Trace detail, reflection/ME machine projections and many provenance fields.  
**I.** The five richest-on-paper areas are multi-client identity, agent execution, Projects/Second Brains, World/Narrator continuity and ME/Mem0 integration.  
**J.** Save the deterministic generator/taxonomies, central routing/cap checks, assistant-ui lifecycle/persistence safeguards, ME provenance model and World epistemic ledger.
