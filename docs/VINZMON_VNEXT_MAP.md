# VINZ.MON vNext — Current Reality Map (2026-09-26)

Companion to `docs/VINZMON_VNEXT_VALIDATION.md`. This file is the evidence
base: what exists **today**, where, and who calls it. Read-only audit; no
production code was changed.

Labels: **[FACT]** verified by reading the code at the ref below ·
**[INFERENCE]** reasoned from facts, not executed · **[UNKNOWN]** needs
runtime data (SQLite, `.env`, Mac state) that is not in the repository.

## 0. Which code is "current"

| Ref | Date | Role |
|---|---|---|
| `origin/codex/vinzmon-v2` @ `79e46f1` | 2026-09-21 | **Audited.** Newest code in the repo. Strict fast-forward of the branch below (+25 commits: V2 run spine, Memory V1 flag, life cycle, version selector removed). Not merged anywhere. |
| `claude/project-prototype-jxjc3d` @ `43f12e8` | 2026-09-12 | Production/deploy branch named in earlier audits. Same commit as this doc's branch before the doc commit. |

Where the two differ, the row is tagged **[v2-only]**.

### Inputs the task referenced that do not exist [FACT]

- `SYSTEM_ARCHITECTURE_AUDIT.md`, `SYSTEM_MAP.md`, `AI_COST_AUDIT.md`: not
  present on any branch or in git history. Nearest equivalents used:
  `docs/AUDIT_UNIFICATION_2026-09-06.md`, `docs/HERMES_ARCHITECTURE_AUDIT_2026-09-06.md`,
  `docs/VINZMON_FINAL_ARCHITECTURE_2026-09-06.md`, `docs/COSTI.md`,
  `docs/VINZ_CURRENT_SIMPLIFICATION.md`, `docs/VINZ_MON_V2_MIGRATION_REPORT.md` [v2-only],
  `experiments/memory-poc/REPORT.md` [v2-only].
- **Hermes integration**: no adapter, gateway, client, env var or import on any
  branch. `git grep -i hermes` over `src netlify server services` returns
  nothing. Hermes appears only in the three docs above and one sentence of the
  Mem0 POC report ("es. Hermes, se usa Ollama"). If a Hermes adapter exists, it
  is uncommitted work on the Mac. **[UNKNOWN]** beyond that.
- `CEREBRO`, `MON CORE`: no occurrence in code or docs.

## 1. Runtime topology [FACT]

```
iPhone / Mac browser ──HTTP(S)/Tailscale──► server/core-server.ts  (Node, :8787)
   │  Vite apps: / (app), /lab, /brain (legacy), /assistant-example   │
   │  Zustand store (src/state/store.ts, 5.8k LOC)                    ├─ hosts netlify/functions/* handlers as plain modules
   │  = computes Life/World/progression/ME journal                    ├─ SQLite blob store (_shared/localStore.ts → data/vinzmon.sqlite)
   │  → PUT /api/state (opaque save blob, etag-guarded)               ├─ scheduler every 60s: reminderTick → processAutomations
   │                                                                   │                        → processDueMachines → resumeIncompleteMemoryV1Captures
   │                                                                   ├─ optional Mem0 child process :8788 (only if VINZMON_MEMORY_WRITER_MODE=mem0)
   │                                                                   └─ Ollama at OLLAMA_BASE_URL (default 127.0.0.1:11434), external
```

- `docs/LOCAL_CORE_SERVER.md`: "Netlify, Railway, and Qdrant Cloud are not
  contacted by this runtime." `netlify/` is now a directory name, not a host.
- Auth: one bearer secret `VINZMON_TOKEN` (`_shared/auth.ts`), plus a separate
  Shortcut token.

## 2. Entry points that reach a model

| # | Entry | Where the loop runs | Loop | Tools | Context builder | Model selection | Status |
|---|---|---|---|---|---|---|---|
| E1 | **Main chat** (daily CHAT + LAB chat) | **Browser**: `assistant-original/netlify-runtime.ts` `createNetlifyChatModel().run` | tool path: `brain/stream.ts` `replyWithLocalTools` (4 rounds; 8 for audit/project); direct path: `createBaseNetlifyChatModel` | browser `TOOLS` + `toolLayer` (≤12 per turn) | `ai/chatContext.ts` `resolveChatContext` → `/api/core-context` (`loadCoreContext`) | client `voiceModel` → `/api/ai` `resolveRoute('character-voice')`; intermediate rounds `LOCAL_CHEAP_ROUND_SENTINEL` (Ollama `qwen2.5:14b`) with fallback `gpt-5.6-luna` | **LIVE — the real orchestrator** |
| E2 | `/api/ai` | Server | none (one provider call per request; SSE passthrough when `stream`) | forwards client-supplied tool defs | none (receives `system`) | `resolveRoute` + local-only guard + `checkCap` | LIVE (provider proxy) |
| E3 | **V2 run engine** `_shared/v2/runEngine.ts` `executeRun` | Server | 6 rounds, `ServerTool` + `permissions.ts` profile gate | server tools only; `toolMode:'caller'` returns calls | `v2/contextAssembler.ts` `assembleContext` (calls `loadCoreContext` for identity) | `v2/modelRegistry.ts` `resolveRunModel` | [v2-only] LIVE for E4/E5/E6 |
| E4 | Agent Lab `/api/agent-lab` | Server | v2: `executeRun(profile:'lab')`; prod: own 6-round loop | `list_files/read_file/search_files/export_report/propose_ui_change` (read-only) | own `BOUNDARY_RULES` + `contextBlock` | `resolveRoute('prompt-compile')` | LIVE |
| E5 | Automations `_shared/automations.ts` `runOne` | Server scheduler | v2: `executeRun(profile:'automation')`, no tools, provider web search | none | via run engine | `resolveRoute('character-voice')` passed as preference | LIVE |
| E6 | `/v1/chat/completions`, `/v1/responses` | Server | v2: `executeRun(profile:'chat', toolMode:'caller')` | caller's | via run engine | `resolveRoute('character-voice')` | LIVE |
| E7 | `/api/runs` | Server | `executeRun` | none registered | via run engine | profile default (chat → **forced Ollama**) | [v2-only] **no UI caller** |
| E8 | `ai/client.ts` `speak` | Browser → `/api/ai` | 4-round tool loop | `ToolRuntime` | `buildVoiceSystemPrompt` | `stepModel('voice')` | tool loop **unreachable**: only `generateReply` passes tools; `generateReply` ← `store.requestReply` ← `store.sendMessage`, which has **no caller outside `store.ts`**. Live use: `generateIntroduction` (single shot, no tools), `readPhotoSignals`. |
| E9 | Brain page `/brain` (`brain/Brain.tsx`, `/api/brain`) | Browser | reuses `replyWithLocalTools`/`streamReply` | same as E1 | fallback `characterVoiceBlock` | same as E1 | Legacy page, still built (vite input `brain`) and served by core-server; comment in `stream.ts` says "non più caricato". |
| E10 | Background: machines, memory capture, topics, life cycle, narrator, bio, teach, cultural discovery, image, transcribe, shortcut | Mixed | single-shot | none | per feature | see §7 | LIVE (see Background table) |

**Correction to the premise "five overlapping agent runtimes"** [FACT]: there
are **two live agent loops** — browser `replyWithLocalTools` (all product
actions) and server `executeRun` (secondary/headless surfaces). `speak`'s loop
is dead code; Agent Lab's loop is already merged into `executeRun` on v2;
Hermes does not exist in the repo.

## 3. The main-chat decision logic (the de-facto MON CORE) [FACT]

`netlify-runtime.ts` `createNetlifyChatModel().run`, per user turn:

1. fire-and-forget `captureChatMemoryForClient` (→ `/api/me-chat-capture`, cloud extraction).
2. Confirmation state machine from thread history: `pendingMealSlot`,
   `hasPendingWorkout`, `pendingWorkoutPlanProposal`, `pendingAction` + `confirms()` regex.
3. Special routes: `isV2IssueIntent` → issue capture; `isImageCreationIntent` → image.
4. `useTools = shouldUseLocalTools(user) || project (≠ World) || any confirmation`.
   `shouldUseLocalTools` = `TOOL_INTENT | CODE_INSPECTION_INTENT | AUDIT_INTENT | REPO_OPS_INTENT | …` regexes in `stream.ts`.
5. `processLifeTurn` (World project only; LLM classifies, deterministic validator accepts).
6. `resolveChatContext` + topic archive + resumed topic + `buildCapabilitySummary` + life prompt + `loadEnabledSkillsSummary` + `connectorsSummaryForProject`.
7. `useTools` → `runWithLocalTools` → `replyWithLocalTools`; else `createBaseNetlifyChatModel`.

Inside `replyWithLocalTools`: ~20 regex triggers build the tool pool
(`basePool`), priority sort, confirmation filter (write tools withheld until
"sì"), `slice(0, 12)`, round cap, cheap local intermediate rounds.

**This is already ANSWER (`diretto`) vs ACTION (`strumenti`) routing**, recorded
as `ChatTrace.path` (`ai/chatTrace.ts`). There is no WORK mode; the nearest is
audit/project turns getting 8 rounds.

## 4. Tool registries and executors [FACT]

| Registry | File | Count | Executor | Runs in | Safety boundary |
|---|---|---|---|---|---|
| `TOOLS` | `src/ai/tools.ts` | 47 | `runTool` (sync, Zustand `ToolContext`) + `executeRuntimeTool` (async `/api/*`: reminders, automations, projects, workspace, connectors, skills, topics) | Browser | confirmation state machine in `stream.ts` (`CONFIRMABLE_ACTIONS`: peso, promemoria, automazione, piano, dieta, riavvio; meals/workouts separately) |
| `CODE_TOOL_DEFS` | `src/ai/toolLayer.ts` | 2 (`code_search`, `code_read`) | `/api/code-tools` → `agentLabFiles.ts` | Browser→server | read-only path allowlist |
| `REPO_OPS_TOOL_DEFS` | `src/ai/toolLayer.ts` | 15 (`git_*`, `repo_list/write/edit`, `esegui_*`, `leggi_log_vinzmon`, `stato_servizi_locali`, `riavvia_servizio_vinzmon`) | `/api/repo-ops` → `_shared/repoOps.ts` | Browser→Local Core | `isLocalCoreServer()`, fixed argv, path allowlist; **only restart is confirmation-gated** |
| `EXPORT_REPORT_TOOL_DEF` | `src/ai/toolLayer.ts` | 1 | browser Blob download | Browser | none needed |
| Agent Lab `TOOLS` | `netlify/functions/agent-lab.ts` | 5 | `executeTool` wrapped as `ServerTool{risk:'read'}` | Server | read-only + UI-only patch checker |
| V2 `ServerTool` + `mayExecuteTool` | `_shared/v2/contracts.ts`, `permissions.ts` | contract | `executeRun` | Server | profile → capability set |
| V2 `executeWorkspaceOperation` | `_shared/v2/workspaceCapability.ts` | 13 ops | — | — | **no caller** [v2-only] |
| Caller tools | `_shared/openaiIngress.ts` | passthrough | external client | — | returned, never executed |
| Provider web search | `webSearch: true` flag | — | provider | cloud | — |

Security facts that matter for consolidation:

- `/api/ai` accepts **client-supplied tool definitions** (≤12). The server
  cannot know whether a write tool will be executed; confirmations are
  enforced only in the browser.
- `repo_write` / `repo_edit` can create or overwrite any `.ts/.tsx/.css/.md/.json/.toml`
  under `src/`, `netlify/`, `docs/` and root files incl. `package.json`,
  `netlify.toml`, `AGENTS.md` (`agentLabFiles.ts` `resolveAllowedPath`,
  `ALLOWED_ROOTS`, `ALLOWED_ROOT_FILES`) — **including
  `netlify/functions/_shared/auth.ts`** — with no confirmation (only the
  restart tool is in `CONFIRMABLE_ACTIONS`).
- `gestisci_skill_locale` lets the model create/update/remove skills; created
  skills are **enabled immediately** (`skills.ts` `createLocalSkill`, `enabled: true`).
- `permissions.ts` `toolCapability()` only returns `data-read | data-write | network-allowlisted`,
  so the `coding` profile (`workspace-read`, `git-inspect`) can execute **no**
  tool at all [v2-only].

## 5. Context builders [FACT]

| Builder | File | Used by |
|---|---|---|
| `loadCoreContext` → `compileCoreContext` → `buildVoiceSystemPrompt` | `_shared/coreContext.ts`, `src/ai/coreContext.ts`, `src/ai/voicePrompt.ts` | `/api/core-context` (main chat), V2 `domains.identity()` |
| `resolveChatContext` (+ local-fallback `compileCoreContext`, + `buildProjectContext`) | `src/ai/chatContext.ts` | main chat |
| `assembleContext` (ranking, 16K/32K budgets, trace) | `_shared/v2/contextAssembler.ts` | run engine [v2-only] |
| `characterVoiceBlock` fallback | `src/brain/stream.ts` | legacy Brain page only |
| `buildVoiceSystemPrompt` direct | `src/ai/client.ts` | introductions |
| Agent Lab `BOUNDARY_RULES` + `contextBlock` | `agent-lab.ts` | Agent Lab |

Overlap [INFERENCE from code]: `assembleContext` gets identity from
`loadCoreContext`, which **always** injects the ME machine summary into
`meFacts`; `assembleContext` then adds `domains.me()` — the same summary — a
second time.

## 6. Memory: stores, indexes, derived data, consumers [FACT]

| Item | Store (SQLite blob store / other) | Kind | Writer | Consumers |
|---|---|---|---|---|
| ME Model (personal semantic memory) | `me-model-v1` via `meModel.ts` | **canonical** (default mode `custom`) | `core/memory.ts` `writePersonalMemory` ← `/api/me-chat-capture` (LLM extraction every message ≥5 chars) | `searchPersonalMemory` (keyword `filterByQuery`), machines, core context, narrative material |
| Mem0 + Memory V1 | `services/mem0` (:8788), `mem0-{history,vectors}.sqlite` | alt. canonical + vector index | same boundary when `VINZMON_MEMORY_WRITER_MODE=mem0` (off by default; boot refuses non-Ollama providers) | same boundary |
| ME journal (meals, workouts, weight, diet, plan, ME tabs) | browser store → `vinzmon-state/save` | **canonical (health)**, browser-authoritative | browser tools (`registra_*`, `imposta_*`, `gestisci_me`) | chat tools, deterministic energy/progression |
| Game/Life state (mons, world, canon, ledger, progression, `memories[]`, `opinions[]`, `voiceNotes[]`) | browser store → `vinzmon-state/save` | **canonical-deterministic**, browser-computed | engine + validated LLM proposals | everything |
| Conversations | assistant thread storage (`/api/user-data`) ; legacy `/api/brain` | canonical / legacy | chat runtime | chat, topics |
| Topics | `/api/topics` (`_shared/topics.ts`) | **derived index** (summaries of closed spans) | text-cheap LLM at 16 msgs / 3h | chat prompt archive, `cerca_conversazione`, ME.MON |
| Projects (+ working state, artifacts, base64 files, ME tabs) | `vinzmon-projects` | canonical | projects API/tools | chat, run engine |
| Workspace folders | `~/VinzMon/<project>` (`vinzWorkspace.ts`) | canonical files | workspace tools | chat |
| ME machine summary | `vinzmon-machines/machine-state-v1` | **derived** | `machines.ts` | **every chat** (`loadCoreContext` → `meFacts`), V2 `domains.me`, narrative material, ME.MON |
| Reflection observations | same blob | derived | `machines.ts` | ME machine (last 8), pending insights (UI + push) |
| ME.MON self-reflections | same blob | derived | `machines.ts` | **every chat** (`selfReflections`, last 24 via selection), life cycle narrative material |
| Opinions (weekly reflection) | game save | derived | `ai/reflect.ts` via `store.maybeReflect` | `opinionsBlock` → only `store.requestReply` → dead path ⇒ **ghost** |
| Voice notes (monthly review) | game save | derived | `ai/notebook.ts` via `store.maybeReview` | voice prompt (live); input `s.chat` only fed by dead `sendMessage` ⇒ **starved** [INFERENCE] |
| Lessons (TEACH) | `/api/lessons` | canonical | teach flow | voice |
| Skills | `data/skills/<source>__<id>/` | canonical (procedures) | `/api/skills` | prompt summary + `leggi_skill` |
| Runs, chat traces, runtime log | `vinzmon-runs`, user-data `chat-trace:*`, `vinzmon-runtime-log` (500 events / 48h) | telemetry | engine / browser | LAB TRACE, SYSTEM |

## 7. Background Mind — end-to-end [FACT unless tagged]

| Process | Trigger | Input | Model (default) | Cloud? | Output → store | Consumer | Local-first possible |
|---|---|---|---|---|---|---|---|
| **Reflection machine** | manual (`MindPanel`, SYSTEM LAB) or `autoDaily` (off until toggled) via scheduler | last 20 personal memories + ≤12 semantically related + ≤6 prior reflections | `resolveRoute('text-cheap', preferred)`; MindPanel/scheduler send **no** preference → `gpt-5.6-luna`; SYSTEM LAB sends the RIFLESSIONE step choice | yes | observations appended to `machine-state-v1` (**never trimmed**); ≤1 in-app insight/day (+ push) | ME machine, insight UI/push | yes (JSON, short) |
| **ME machine** | same | previous summary + last 8 reflections + last 60 memories | same | yes | `meSummary` (≤1000 chars, overwritten) | **every chat prompt** | yes, quality to measure |
| **ME.MON machine** | same | save blob (DNA, bio, traits, **full per-day history — grows linearly**), topics, ME summary, own insight stats, last 12 questions | same | yes | observations (grounded source labels only) + insight | **every chat prompt**, life cycle | yes |
| Memory capture | every user chat message ≥5 chars (`shouldCaptureChatMessage`) | message + ≤4 prior turns | `stepModel('memory','everyday')` = `claude-haiku-4-5`; **not** via `runStep` ⇒ no AUTO local-first | yes | ME Model | all memory readers | yes, best candidate |
| Topic summaries | span closes (16 msgs or 3h silence) | span messages | `resolveRoute('text-cheap')` = `gpt-5.6-luna` | yes | topics store | chat, search, ME.MON | yes |
| Weekly reflection (`reflect.ts`) | game day advance, every 7 days | `s.memories` (browser) | `stepModel('reflection')` = `claude-haiku-4-5`, not `runStep` | yes, when the week has content | `opinions` | dead path ⇒ **ghost** | moot — remove or rewire |
| Monthly voice review (`notebook.ts`) | every 30 days if `worthReviewing` | `s.chat` (starved) | same | rarely | `voiceNotes` (proposals) | voice prompt after user accepts | moot |
| Life cycle | chat entry (`startLifeEventIfDue`) / World-project turns | world, ledger, curated personal facts | `runStep('narrator')` AUTO local-first, 60s local timeout | fallback | World canon + ledger, after deterministic `validateLifeEvent`/`acceptLifeEvent` | chat, World | already local-first |

Cross-cutting facts:

- **Local-only mode** (`spend.ts` `readLocalOnlyMode`) is enforced **only in
  `/api/ai`**. `machines.ts`, `core/memory.ts`, `topics.ts`, `me-seed.ts`,
  `shortcut.ts`, `cultural-discovery.ts` and the run engine call
  `callProvider` directly and bypass it.
- **Monthly cap** `checkCap()` is not called by `machines.ts`, `me-seed.ts`,
  `cultural-discovery.ts`, the run engine itself, or memory capture (the last
  one by documented choice). They only `recordSpend`.
- `machines.ts` records `usage.provider` as `model.includes('claude') ? 'anthropic' : 'openai'` —
  wrong for Ollama, Gemini, Moonshot, xAI.
- Reflection is **not idempotent**: re-running over the same memories appends
  new observations (dedupe exists only for notifications).
- Whether `autoDaily` is enabled on the real install: **[UNKNOWN]** (runtime data).

## 8. Model routing inventory [FACT]

Canonical registry: `_shared/routing.ts` — `Capability` (5 classes:
`character-voice`, `vision-quick`, `text-cheap`, `image`, `prompt-compile`),
`ROUTING` defaults, `*_CHOICES` catalogs, `AI_STEPS` (per-feature step with
`fallback`, `everyday`, `qualityCritical`), `resolveRoute`, `modelForStep`.
Browser `store.ts` `runStep` implements AUTO local-first for `text-cheap`
non-critical steps only.

Parallel or hardcoded selections outside that registry:

| Location | Hardcode | Problem |
|---|---|---|
| `routing.ts` `LOCAL_CHEAP_ROUND_MODEL = 'qwen2.5:14b'` | single local model for every local use (chat rounds, `runStep`, V2 profiles, life) | no tiny/main/strong distinction |
| `v2/modelRegistry.ts` `resolveRunModel` | `chat`/`project-chat`/`automation` without preference → Ollama | second policy; `/api/runs` chat fails without Ollama |
| `brain/stream.ts` `CHEAP_ROUND_FALLBACK_MODEL = 'gpt-5.6-luna'` | provider/model literal in client | bypasses step catalog |
| `ai/voicePrompt.ts` `VOICE_MODEL = 'claude-opus-5'`, `PHOTO_MODEL` | stale labels (DEV shows Opus; real default is `gpt-5.6-terra`; `PHOTO_MODEL` unused) | misleading |
| `netlify/functions/transcribe.ts` | `'gpt-4o-mini-transcribe'` | no capability class |
| `services/mem0/server.ts` | defaults `gpt-5-mini`, `text-embedding-3-small` | guarded by core-server refusing non-Ollama |
| `assistant-original/models.ts` | UI model list duplicating `VOICE_CHOICES` | two lists |
| `_shared/spend.ts`, `src/ai/usage.ts`, `src/engine/costEstimate.ts` | three price tables | drift risk |
| `ai.ts` streaming | `anthropic | openai | ollama` only | provider-specific branch |
| `machines.ts` usage label | provider guessed from model string | wrong telemetry |
| `core/memory.ts`, `machines.ts`, `topics.ts`, `automations.ts`, `shortcut.ts`, `agent-lab.ts`, `openaiIngress.ts` | `resolveRoute(<capability>)` without step or class | fine as registry use, but bypass AUTO/local-first/cap/local-only |

`docs/COSTI.md` is **outdated** [FACT]: it prices the voice on Opus 5 (default
is now `gpt-5.6-terra`) and ignores per-message memory extraction, topic
summaries, tool rounds and machines.

## 9. Skills [FACT]

- Source registry `SOURCES` in `netlify/functions/skills.ts`: one entry,
  `anthropics/skills` @ `main`.
- Catalog: GitHub tree API; regex `^<path>/([^/]+)/(.+)$` ⇒ assumes
  `<path>/<id>/SKILL.md` (flat).
- Install: copies ≤40 files / 2 MB into `data/skills/<source>__<id>/` +
  `metadata.json` (repo, `ref` = branch name, no commit SHA, no hash). Born disabled.
- Runtime: enabled skills' name+description appended to every chat system
  prompt (`loadEnabledSkillsSummary`); full text via `leggi_skill`, which
  returns **`SKILL.md` only** (≤20k chars). Supporting files are stored but
  unreadable; scripts never executed.
- Model-authored skills (`gestisci_skill_locale`): source `local`, max 20,
  enabled immediately.
- Only the browser main chat can use skills; the run engine, automations,
  machines and Agent Lab never see them.

## 10. Life / World determinism [FACT]

- Canon is append-only (`world.ts` `withCanon` ignores existing ids).
- Life cycle: LLM proposes → `validateLifeEvent` / `validateLifeConsequence`
  → `acceptLifeEvent` / `acceptLifeConsequence` apply (pure, in `engine/lifeCycle.ts`),
  with a baseline re-check before `setState`. Good pattern.
- `returnToWorld`: narrator line checked only for format + Mon name, then
  written as `WORLD_CANON` (`store.recordCanon`). Narrative text, not stats.
- Stats/HP/progression: computed by deterministic engine code; tools cannot
  write them (`gestisci_me` prompt forbids it; no tool exposes them).
- `registra_scoperta` (Curiosity First) writes a learning via a typed store
  action with enum validation.
- **Authority is the browser.** `/api/state` PUT stores the whole save with
  optimistic concurrency and day-monotonicity checks, but **no semantic
  validation** — any token holder can write any state. Not an LLM bypass, but
  the deterministic validators are client-side only.
