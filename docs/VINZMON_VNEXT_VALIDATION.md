# VINZ.MON vNext — Architecture Validation & Simplification Audit (2026-09-26)

Read-only audit. No production code changed. Audited ref:
`origin/codex/vinzmon-v2` @ `79e46f1` (strict superset of the production
branch `claude/project-prototype-jxjc3d` @ `43f12e8`). Evidence and file-level
inventories are in **`docs/VINZMON_VNEXT_MAP.md`** (sections referenced as
MAP §n). Labels: **[FACT]**, **[INFERENCE]**, **[REC]** (recommendation),
**[UNKNOWN]**.

---

## Verdict in one screen

1. **The direction survives; four premises do not.**
   - Hermes is **not integrated anywhere** in this repository [FACT, MAP §0].
     "CEREBRO today = Hermes" has nothing to rename. The only Hermes decision
     on record (`HERMES_ARCHITECTURE_AUDIT_2026-09-06.md`) is "port patterns,
     do not run Hermes as the runtime".
   - There are **two** live agent loops, not five: browser
     `replyWithLocalTools` (every product action) and server `executeRun`
     (Agent Lab, automations, `/v1/*`) [FACT, MAP §2]. `ai/client.ts:speak`'s
     tool loop is unreachable; Agent Lab's own loop was already removed on v2.
   - A model router (`routing.ts` capabilities + `AI_STEPS` + `runStep`
     AUTO) and a personal-memory contract (`core/memory.ts`) **already exist**.
     They need consolidating, not inventing.
   - The three input audits (`SYSTEM_ARCHITECTURE_AUDIT.md`, `SYSTEM_MAP.md`,
     `AI_COST_AUDIT.md`) do not exist in the repository.
2. **The biggest mistake in the proposal** is placing the problem in the wrong
   layer. The duplication that matters is **where the orchestrator runs**: the
   only complete orchestrator (confirmations, ~20 intent rules, 47 product
   tools, life turns, skills) runs **in the browser** against
   browser-authoritative state. The server engine is cleaner but can't execute
   those tools. Adding MON CORE and CEREBRO as new layers before fixing that
   split adds architecture.
3. **The self-evolution safety boundary does not exist today** [FACT, MAP §4]:
   main chat can `repo_write`/`repo_edit` Core source (including
   `_shared/auth.ts`, `package.json`) and create enabled skills **without
   confirmation**. That needs fixing before any autonomy work.

---

## B. CURRENT → TARGET MAPPING

| Target | Existing candidates | Decision | Why |
|---|---|---|---|
| **MON** (identity) | `MonRecord` + game save (`vinzmon-state/save`), `voicePrompt.ts` `buildVoiceSystemPrompt`, `compileCoreContext`, lessons, voice notes, ME.MON reflections | **KEEP** | Identity is already data, separate from providers: `routing.ts` "cambiare fornitore senza perdere chi è" holds [FACT]. Violations: Agent Lab and restricted V2 profiles use a different persona by design (fine); `VOICE_MODEL` label ties identity UI to a model name (cosmetic). |
| **MON CORE** | browser `createNetlifyChatModel().run` (real decisions) + server `executeRun` (clean contract) | **MERGE** into `executeRun` + one pure `decideTurn()` | See §C. No new layer. |
| **ANSWER** | `createBaseNetlifyChatModel` (`ChatTrace.path='diretto'`) | **KEEP/ADAPT** | Already exists. |
| **ACTION** | `replyWithLocalTools` 4-round path (`'strumenti'`) + confirmation state machine | **KEEP/ADAPT** | Already exists; confirmations are the most valuable piece. |
| **WORK** | audit/project 8-round turns; `profile:'coding'`/`'inspection'`; `CodingWorker` contract | **ADAPT** | Only mode that is genuinely missing. |
| **CEREBRO** | `_shared/v2/codingWorker.ts` (`CodingTask`, `CodingWorker`, `runCodingWorker`, no implementation) | **ADAPT** (generalize) | It already is a replaceable-worker interface. Hermes: **UNKNOWN/absent**. |
| **CAPABILITIES** | — | concept only | Skills + Tools; no third primitive (§G, Q6). |
| **SKILLS** | `netlify/functions/skills.ts`, `SkillStore.tsx`, `leggi_skill`, `gestisci_skill_locale` | **ADAPT** | Works for flat Anthropic skills; can't consume Hermes layout; no provenance pinning; model-authored skills unapproved. |
| **TOOLS** | `tools.ts` TOOLS, `toolLayer.ts`, Agent Lab tools, V2 `ServerTool`/`permissions.ts` | **MERGE** definitions, keep executors | §G. |
| **WORKFLOWS** | automations (`crea_automazione`), reminders, skills | **REMOVE as a primitive** | Automations already = prompt + schedule + web tool; a skill already = procedure. |
| **MEMORY** | `core/memory.ts` (PersonalMemoryDomain), topics, machines, V2 `ContextDomains` | **ADAPT** into one read API | §H. Keep physical separation. |
| **LIFE/WORLD** | `engine/lifeCycle.ts`, `world.ts`, `progression.ts`, store actions | **KEEP** | Propose→validate→accept already correct. |
| **BACKGROUND MIND** | `_shared/machines.ts` (3 machines), memory capture, topics, `reflect.ts`, `notebook.ts` | **MERGE/REMOVE** | §I. |
| **MODEL ROUTER** | `routing.ts`, `runStep`, `v2/modelRegistry.ts`, `LOCAL_CHEAP_ROUND_*` | **MERGE** | §J. |
| **CORE** | `server/core-server.ts`, `localStore.ts`, `auth.ts`, `spend.ts`, `state.ts`, engine, Projects | **KEEP** | Stable; the Local Core *is* the Core. |
| Agent Lab | `agent-lab.ts` | **KEEP as a profile** (done on v2) | Pure client of `executeRun`. |
| `ai/client.ts` | `speak`, `generateReply` | **REMOVE** loop + `generateReply`; keep single-shot intro/photo | Dead code. |
| Brain page | `brain/Brain.tsx`, `/api/brain`, `brain/index.html` | **REMOVE** after data export | Legacy surface; move `stream.ts` out of `src/brain/`. |
| `/api/runs`, `/api/v2-lobehub` | — | **OPTIONAL/REMOVE** | 0 UI callers. |
| V2 `workspaceCapability.ts`, `domainRegistry.ts` | — | **REMOVE** or keep as docs | Unused / test-only. |

---

## C. MON CORE FEASIBILITY

**What each candidate actually does** [FACT]:

| Capability | Browser orchestrator (`netlify-runtime` + `stream.ts`) | `executeRun` (v2) | `speak` | Agent Lab |
|---|---|---|---|---|
| Serves main chat | yes | no | no (dead) | no |
| Product tools (ME journal, pages, look, reminders, files, connectors, skills) | yes | no | would, but dead | no |
| Confirmation state machine | yes | no ("waiting-approval" status unused) | no | n/a |
| Life turn, image, issue routes | yes | no | no | no |
| Headless callers (scheduler, `/v1`) | no | yes | no | — |
| Permissions model | implicit (pool regex + confirmation filter) | explicit profile→capability | none | read-only |
| Context trace | `ChatTrace` (post-hoc from real marks) | `RunContext.trace`, `RunEvent[]`, stored run | none | tool trace |
| Streaming | provider SSE via `/api/ai` | none | none | none |
| Cap/local-only | via `/api/ai` | no `checkCap`, no local-only | via `/api/ai` | `checkCap` |

**Strategies compared**

| | S1 Browser stays canonical | S2 `executeRun` canonical, split executors | S3 Everything server-side |
|---|---|---|---|
| Idea | Make headless callers use the browser logic | Server loop; server tools run inline; browser tools returned as calls (existing `toolMode:'caller'`) and resumed | Move ME journal/game state authority to server, all tools server-side |
| Feasible | **No** — needs Zustand state; scheduler has no browser | Yes; needs a continuation protocol (V2 report §36 already lists it) | Yes, but a rewrite of state authority |
| Behavior risk | low | medium, stage-able per tool family | high |
| Matches `AGENTS.md` "one canonical server-side source" | no | partially | yes |
| Verdict | reject | **recommended** | per-domain, later (ME journal first) |

**Answer** [REC]: one canonical orchestrator is feasible **without a new
layer**: MON CORE = `executeRun` + a pure, shared `decideTurn()` extracted
from `createNetlifyChatModel().run`/`replyWithLocalTools`. `runEngine` is not
the automatic winner — today it lacks the product's most valuable logic — but
it has the right shape (typed request/result, profiles, permissions, events,
audit). The browser orchestrator is the **source of behavior**, `executeRun`
is the **destination shape**. `speak` is deleted, not merged. Agent Lab is
already merged on v2.

---

## D. ANSWER / ACTION / WORK ROUTING

**Modes are an execution concept first, a UI concept second** (Q2). The user
toggle should exist only as an *override*; AUTO is the product.

Minimal contract [REC]:

```ts
type ExecutionMode = 'ANSWER' | 'ACTION' | 'WORK';
type ModeRequest = 'AUTO' | ExecutionMode;          // from UI; absent ⇒ AUTO

interface TurnDecision {
  turnId: string;
  requested: ModeRequest;
  mode: ExecutionMode;
  source: 'pending-confirmation' | 'override' | 'special-route' | 'rule' | 'classifier' | 'default';
  rules: string[];                 // ids of matched rules, e.g. 'TOOL_INTENT', 'meal-log', 'REPO_OPS'
  confidence?: number;             // only when source === 'classifier'
  toolPool: string[];              // names, after confirmation filter and cap
  writeToolsWithheld: string[];    // confirmation gate
  escalation?: { to: 'ACTION' | 'WORK'; reason: string; needsApproval: boolean };
}
```

Precedence (all deterministic except step 5):

1. **Pending confirmation** decides first (existing `pendingMealSlot` /
   `pendingAction` + `confirms()`). A user override can never bypass it.
2. **Override** from UI: ANSWER ⇒ read-only tools only (context/memory/skills
   still loaded); ACTION ⇒ current tool path; WORK ⇒ requires Local Core and
   an approval for any write grant.
3. **Special routes**: image creation, issue capture, World life turn
   (existing checks) ⇒ ACTION subtypes.
4. **Rules**: the existing regexes. Tool/health/reminder/file intents ⇒
   ACTION; `CODE_INSPECTION`/`AUDIT` ⇒ ACTION read-only; `REPO_OPS` with a
   write verb ⇒ WORK candidate.
5. **Tiny local classifier** only when rules are silent *and* the message is
   imperative/long (gray zone). Uncertain ⇒ **ANSWER with read-only tools**
   (safe default) plus an offered "do it" chip — never a silent write.
6. Default ⇒ ANSWER.

Escalation: ANSWER→ACTION inside a turn only for read tools; any write goes
through the existing confirmation. ACTION→WORK is **proposed**, not automatic,
when the round cap is hit or the plan needs >N tool steps; WORK never starts
writes without approval.

Where it enters and is validated [REC]:
- Enters as `runConfig.custom.mode` (assistant-ui already carries
  `projectId` there) → `createNetlifyChatModel().run`. Absent ⇒ AUTO, so all
  existing clients remain compatible.
- `decideTurn()` lives in a shared module importable by browser and server
  (same pattern `stream.ts` already uses to import `routing.ts`).
- **Enforcement must be server-side**: `/api/ai` today forwards any
  client-sent tool definitions. It should receive `mode` and reject tools
  whose manifest risk exceeds the mode (§G). `/api/ai` stays a provider proxy;
  it is not the orchestration contract. The orchestration contract is
  `RunRequest` (add `mode`).
- Visible in the event stream as the first event of every turn (§4 below).

### Observable execution stream

Existing infrastructure [FACT]: `/api/ai` SSE (tokens + real provider
thinking), `RunEvent[]` (returned at end, persisted, not streamed),
`ChatTrace` (steps from real `clock.mark` calls, persisted at end, LAB
TRACE), `runtimeLog` (500 events/48h), assistant-ui tool parts ("Attività · N")
and the ✓ line (`updateLabel`). None of them is a unified live stream; all of
them are emitted by code at real branch points, which is the property we need.

Schema [REC] — extend `RunEvent`, don't invent a second one:

```ts
interface MonEvent {
  v: 1; turnId: string; seq: number; at: string;
  kind: 'decision' | 'context' | 'skill' | 'tools' | 'model' | 'tool' | 'confirm'
      | 'delegate' | 'worker' | 'result' | 'error';
  mode?: ExecutionMode; source?: TurnDecision['source'];
  name?: string;            // tool / skill / worker id / model id
  status?: 'start' | 'ok' | 'fail' | 'held';
  count?: number;           // e.g. context items selected
  ref?: string;             // runId, taskId, sourceId
}
```

Rules: text is rendered by the UI from fixed templates (`MON CORE → WORK`,
`skill loaded: coding`); events carry ids/names/counts only, never model
prose; emitted where the branch happens. Transport: assistant-ui data parts in
the browser path; `event: mon` SSE frames from the server path; persisted into
`ChatTrace`/`vinzmon-runs`. Kept separate from the provider "thinking" stream.

---

## E. CEREBRO CONTRACT

Is it necessary (Q3)? **Only at the process boundary.** Inside VINZ.MON, WORK
is `executeRun` with a `work` profile, more rounds, workspace tools and an
approval continuation. A CEREBRO interface is justified when the worker is
**out of process** (Hermes, OpenCode, Claude Code, a container) — and the repo
already has that seam: `CodingWorker` [FACT, unused].

Smallest runtime-agnostic interface [REC] (generalizing `codingWorker.ts`):

```ts
interface WorkTask {
  id: string; goal: string; projectId?: string;
  context: { brief: string; memory: Array<{ id: string; text: string; scope: string }>; project?: string };
  skills: Array<{ id: string; source: string; commit: string; manifest: string; files?: string[] }>;
  tools: Array<{ name: string; risk: 'read' | 'write' | 'external' | 'destructive' }>;
  permissions: { roots: string[]; worktree?: string; network: boolean; shell: false | 'allowlisted'; approvalFor: Array<'write' | 'external' | 'destructive'> };
  budget: { maxSteps: number; maxCostUsd: number; deadlineMs: number };
  modelClass: 'strong-local' | 'cloud-strong';
}
interface WorkerEvent { taskId: string; seq: number; kind: 'plan' | 'step' | 'tool' | 'observe' | 'retry' | 'verify' | 'approval-needed' | 'result' | 'error'; name?: string; ref?: string }
interface WorkResult { taskId: string; status: 'completed' | 'failed' | 'blocked' | 'cancelled'; summary: string; outputs: Array<{ kind: 'diff' | 'file' | 'artifact'; ref: string }>; verification: Array<{ check: string; ok: boolean }>; usage: { costUsd?: number } }
interface Cerebro {
  id: string;
  start(task: Readonly<WorkTask>, signal: AbortSignal): AsyncIterable<WorkerEvent>;
  approve(taskId: string, stepRef: string, allow: boolean): Promise<void>;
  result(taskId: string): Promise<WorkResult>;
}
```

The worker never receives the token, never writes VINZ stores directly, and
returns outputs for MON CORE to apply.

**Hermes mapped onto it** (from the Hermes repo, since no adapter exists):

| Concern | Belongs to Hermes | Already owned by VINZ.MON | Must stay VINZ-side / be disabled in Hermes |
|---|---|---|---|
| Plan/execute/observe/retry loop, subagents (`delegate_task`), terminal backends, browser tools | ✓ | partial (`executeRun`) | — |
| Persona (`SOUL.md`), memory (`MEMORY.md`/`USER.md`), user modeling (Honcho) | leaks | ✓ identity, ME, memory | **disable** |
| Session store (`state.db`, FTS) | leaks | ✓ conversations, topics | treat as disposable scratch |
| Skills self-creation/self-improvement | leaks | ✓ skills registry | **disable writes**; VINZ passes skill snapshots in |
| Provider keys / routing | leaks | ✓ `routing.ts`, spend cap, local-only | route via VINZ (OpenAI-compatible `/v1` ingress already exists) |
| Cron, messaging gateway | leaks | ✓ automations, push | disable |
| Approvals | Hermes has its own | ✓ confirmations | map `approval-needed` → VINZ confirmation |

Hermes-specific leaks in VINZ.MON code today: **none** [FACT]. Could Hermes be
the first implementation with minimal changes (Q4)? **Not recommended** [REC]:
it needs a separate Python service, isolation of memory/persona/sessions, a
new adapter, and Hermes' own model routing would bypass VINZ's spend cap —
all for a WORK use case not yet demonstrated. First implementation: in-process
`executeRun` `work` profile on a disposable worktree. Hermes (or OpenCode) is a
second adapter behind the same interface, following the disposable POC already
defined in the Hermes audit. If Hermes were later replaced: only
Hermes-runtime-dependent skills (class C below) and anything using Hermes tool
names would break; VINZ Core would not, provided the above leaks were never
connected.

---

## F. SKILL PORTABILITY

Current VINZ implementation: MAP §9. Real Hermes skills inspected:
`NousResearch/hermes-agent` @ `8afaab3` (2026-09-26), 208 `SKILL.md`
(79 in `skills/`, 129 in `optional-skills/`).

Facts about Hermes skills [FACT, from the repo's `skills/AGENTS.md`]:
- Same agentskills.io frontmatter core (`name`, `description`) as
  `anthropics/skills`, plus `platforms`, `metadata.hermes.{tags,category,related_skills,config}`.
- The authoring standard **requires** prose to reference native Hermes tools
  (`terminal`, `read_file`, `patch`, `search_files`, `delegate_task`,
  `browser_*`) instead of shell utilities, and to ship `scripts/`,
  `references/`, `templates/`.
- Layout is nested: `skills/<category>/<id>/SKILL.md`.

Heuristic scan (keyword-based; treat as bounds, spot-checked):

| Class | Criterion | Count | Examples |
|---|---|---:|---|
| A portable as-is | no scripts, no shell blocks, no execution tools, no Hermes paths | ~11 (5%) | `weekly-review-planning`, `claude-design`, `email-inbox-triage` |
| B portable via adapter | needs file/web/terminal/browser tools or scripts, mappable to VINZ tools or a WORK executor | ~108 (52%) | `pdf`, `docx`, `arxiv`, `systematic-debugging`, `humanizer` (really A) |
| C Hermes-runtime-dependent | `delegate_task`, `cronjob`, `send_message`, `skill_manage`, `memory`, `~/.hermes`/`HERMES_HOME`, `hermes <cli>`, config injection | ~89 (43%, **overestimate**: e.g. `simplify-code` only mentions `delegate_task` optionally) | `obsidian`, `google-workspace`, `claude-code`, `codex` |

Other counts: 141/208 contain shell code blocks, 60 ship scripts, 128 have
files beyond `SKILL.md`.

Blockers in VINZ today [FACT]:
1. `buildCatalog` regex assumes `<path>/<id>/`; on Hermes' nested layout it
   would emit one bogus entry per **category**.
2. `leggi_skill` returns only `SKILL.md`; references/templates are
   unreadable, scripts never runnable.
3. VINZ tool names differ (Italian, product-specific); no shell or browser tools.
4. No provenance pinning: `ref: 'main'`, no commit SHA or hash ⇒ an installed
   skill is not a reproducible snapshot, while Hermes skills self-modify upstream.
5. Frontmatter `platforms`/`config`/prerequisites are ignored.
6. Skills reach only the browser main chat — not the run engine, automations,
   machines or Agent Lab.

Realistic? **Yes for A and most B, no for C without Hermes** [INFERENCE].
Installed-skill record [REC]: `{source, repo, commit, sha256, files, requires:
{tools: canonical capability names, platforms, config}, compat: 'A'|'B'|'C',
enabled, approvedBy}`, plus a tool-alias map (`read_file` → workspace read,
`web_extract` → web fetch, `terminal` → only inside WORK with a shell grant).
C skills stay installable as **reference text** and executable only by a
Hermes CEREBRO adapter. Access to the Hermes repository survives Hermes'
removal because it is just another `SOURCES` row.

---

## G. TOOL CONSOLIDATION

Registries/executors: MAP §4 (4 definition sets, 3 executors, 2 boundaries).
Don't merge executors — they sit on different security boundaries: browser
(Zustand state, confirmation state machine), Local Core (filesystem, git,
fixed argv), read-only file inspection, caller passthrough.

Canonical contract [REC] — one declarative manifest, importable by browser and
server, executors unchanged:

```ts
interface ToolSpec {
  name: string; aliases?: string[];               // e.g. Hermes 'read_file'
  description: string; schema: JSONSchema;
  risk: 'read' | 'write' | 'external' | 'destructive';
  domain: 'me-journal' | 'pages' | 'project' | 'workspace' | 'repo' | 'connector' | 'skills' | 'system' | 'web';
  executor: 'browser' | 'server' | 'local-core';
  confirmation: 'none' | 'app-question' | 'explicit';
  modes: ExecutionMode[];                         // where it may appear
  profiles: RunProfile[];
  triggers?: string[];                            // replaces ad-hoc pool regexes
  resultBudgetChars?: number;
  protectedPaths?: string[];                      // for write tools
}
```

Security invariants to keep explicit:
- Server re-validates every client-sent tool name against the manifest and the
  turn's mode (today it cannot).
- `write`/`destructive` ⇒ confirmation, enforced where the executor runs.
- `repo_write`/`repo_edit` deny-list: `_shared/auth.ts`, `secrets.ts`,
  `spend.ts`, `routing.ts` policy tables, `package.json`, `netlify.toml`,
  `AGENTS.md`, `server/`.
- One result-budget implementation (today three: `tools.ts`
  `budgetToolResults`, Agent Lab twin, `runEngine` `resultBlocks`).
- Merge the three code-reading tool sets (`code_search/code_read`,
  `repo_list`, Agent Lab `list/read/search_files`) — same backend
  `agentLabFiles.ts`.

---

## H. MEMORY CONSOLIDATION

Map: MAP §6. Canonical stores: ME Model (or Mem0), ME journal, game save,
conversations, projects/workspace, lessons, skills. Indexes: Mem0 vectors,
topics, keyword `filterByQuery`. Derived: ME summary, Reflection
observations, ME.MON reflections, opinions (ghost), voice notes.

Must stay separate for semantic reasons [REC]: personal facts (ME Model) vs
structured health (journal) vs World canon (deterministic, append-only) vs
derived interpretations (machines) vs conversation history. Knowledge ("ffuoco
glasses cost €99") needs **no new store**: it's a relation in the ME Model
with a `scope`/topic tag, or Project working state.

One conceptual API [REC] (read-heavy, write-narrow):

```ts
type MemoryScope = 'personal' | 'mon' | 'project' | 'world' | 'conversation';
interface MemoryItem { id: string; scope: MemoryScope; kind: 'fact' | 'episode' | 'summary' | 'reflection' | 'canon';
  text: string; derived: boolean; provenance: string; sourceIds?: string[]; score?: number }
interface MemoryApi {
  recall(q: { query: string; scopes: MemoryScope[]; projectId?: string; limit: number;
    purpose: 'answer' | 'action' | 'work' | 'background' }): Promise<MemoryItem[]>;
  remember(w: { text: string; scope: 'personal'; messageId: string; conversationId?: string }): Promise<{ status: string }>;
}
```

- `recall` fronts `core/memory.ts` + topics + machine projections + World
  canon (read-only) + project state; it is what `assembleContext`'s
  `ContextDomains` already half-is. `derived: true` items can never be quoted
  as user facts.
- Writes stay with their owners: personal ⇒ `core/memory.ts`; World ⇒
  `lifeCycle` validators; health ⇒ journal tools; derived ⇒ machines.
- Mem0 stays a backend of `personal` only (already true: `memoryBackendMode`).
- Can disappear: opinions + weekly reflection, legacy `/api/brain` store,
  duplicate ME injection in `assembleContext`.

Is one contract realistic without hiding differences (Q7)? **Yes, if it is a
read contract with typed provenance and a narrow write surface.** A single
write API or single store would hide them.

---

## I. BACKGROUND MIND HEALTH CHECK

Full table: MAP §7. Per-run cost estimates [INFERENCE, from `spend.ts`
prices and prompt sizes; not measured]:

| Process | Runs? | Est. tokens in/out | Cost/run (luna / haiku) | Materially influences MON? | Idempotent | Pollution risk |
|---|---|---|---|---|---|---|
| Reflection machine | only manual or if `autoDaily` toggled [UNKNOWN on device] | 2–4k / ≤900 | ~$0.001–0.002 / ~$0.005–0.009 | indirectly (feeds ME) + notifications | **no** (duplicates observations) | **yes**: `observations` never trimmed |
| ME machine | same | 3–5k / ≤700 | ~$0.001–0.002 / ~$0.005–0.009 | **yes**, every chat prompt | mostly (overwrite) | low |
| ME.MON machine | same | 3–7k, grows with days / ≤900 | ~$0.002 / ~$0.01 | **yes**, chat + life | tries (last 12 questions) | medium; input history grows linearly |
| Memory capture | **every user message ≥5 chars** | 1–2.5k / 0.15–0.6k | — / ~$0.002–0.006 per message ⇒ ~$2–10/month at 30–60 msgs/day | **yes** | per message id | medium (LLM judgement) |
| Topic summaries | every 16 msgs / 3h | 1–3k / small | < $0.001 | yes | per span | low |
| Weekly reflection (`reflect.ts`) | triggers weekly; usually skips (no fresh input) | — | ~$0.002 when it runs | **no — ghost** | n/a | output unread |
| Monthly voice review | triggers monthly; input starved | — | rare | via accepted notes only | n/a | — |

Findings:
- **Never runs by default**: all three machines until the user toggles
  `autoDaily` (default `null`) [FACT]; actual device state [UNKNOWN].
- **Runs but output unused**: weekly reflection → `opinions` (consumed only by
  dead `requestReply`) [FACT].
- **Calls cloud unnecessarily**: machines default to `gpt-5.6-luna`
  server-side, memory capture to `claude-haiku-4-5`, topics to `gpt-5.6-luna`;
  none uses the AUTO local-first path, which exists only in the browser's
  `runStep` [FACT].
- **Duplicates**: weekly reflection vs Reflection machine (same purpose, two
  stores); ME summary injected twice in V2 context [INFERENCE].
- **Low-value / growing data**: unbounded Reflection observations and
  pendingInsights in one JSON blob; ME.MON's per-day history.
- **Bypasses controls**: local-only mode and monthly cap not enforced on these
  paths.
- **Safe to move local**: all of them are short structured-JSON tasks with a
  validator (JSON parse + schema/grounding checks already exist) — the exact
  shape `runStep`'s local-first-then-verify pattern was built for.
- **When Ollama is down**: machines/topics/memory don't use Ollama today, so
  nothing changes; after migration, fallback must be "skip and retry next
  tick" for background (not cloud), "escalate to cloud" only for interactive.

Answer (Q10): ME and ME.MON are operational **and** consumed on every chat
turn; Reflection works but is mostly an input to ME plus notifications, and
grows without bound; the legacy weekly reflection is a ghost.

---

## J. MODEL ROUTING CONTRACT

Contract before models [REC]:

```ts
type ModelClass = 'tiny-local' | 'main-local' | 'strong-local' | 'cloud-fast' | 'cloud-strong'
                | 'vision' | 'image' | 'transcribe';
interface ModelRequest {
  step: AiStepId | 'chat-round' | 'chat-final' | 'work';   // feature identity (existing AI_STEPS)
  class: ModelClass;                                        // what it needs, not who
  needs?: Needs;                                            // existing: promptCache, thinking, vision…
  privacy: 'personal' | 'public';
  onLocalFailure: 'escalate' | 'skip' | 'fail';            // background ⇒ 'skip'
  latencyBudgetMs?: number;
  userChoice?: string;                                      // explicit MANUAL choice always wins
}
// one server entry point, used by every server caller:
callModel(req: ModelRequest, call: ProviderRequest): Promise<ProviderResult & { route: Route; decision: string }>
// = resolve (policy + availability) → local-only guard → checkCap → callProvider → recordSpend → telemetry
```

- `routing.ts` stays the registry (it already maps capability → choices);
  `ModelClass` becomes the new key; `AI_STEPS` maps step → class.
- `runStep`'s AUTO semantics move into `callModel` so background paths get
  them too.
- Violations to remove: MAP §8 table (V2 `resolveRunModel` second policy,
  `qwen2.5:14b` for every local class, `CHEAP_ROUND_FALLBACK_MODEL` literal,
  stale `VOICE_MODEL`/`PHOTO_MODEL`, transcribe literal, duplicate model and
  price lists, per-endpoint cap/local-only checks, usage provider guessing).

What prevents local-first normal chat (Q12) [FACT + INFERENCE]:
`VOICE_CHOICES` excludes Ollama by design (`voiceChoiceProblems` requires
prompt caching + thinking); the voice system prompt is ~16k chars plus up to
12 tool schemas; one 14B model (`qwen2.5:14b`, 14.3 GB RSS per the Mem0 POC)
shared with Mem0 extraction; tool-calling reliability on Italian typed tools
and confirmation "hold" instructions is unmeasured; no quality harness
comparing local vs cloud answers.

What prevents local-first Background Mind (Q11) [FACT]: server paths call
`resolveRoute('text-cheap')` whose default is cloud; memory capture sends an
explicit cloud step model; AUTO local-first exists only client-side; no
server-side "skip when local unavailable" policy; local-only mode not
enforced there, so local operation can't be verified.

---

## K. DELETE TESTS

| Removed | What survives | What breaks |
|---|---|---|
| **Hermes** | everything | nothing (not integrated); docs only |
| **Ollama** | chat (intermediate rounds fall back to `gpt-5.6-luna`), `runStep` steps (cloud fallback on local error, or after the 8s timeout; 60s for life cycle) | V2 `chat`/`project-chat`/`automation` profiles without explicit model (`/api/runs`); local-only mode (everything 403); Mem0 mode if enabled (boot refuses/throws); Local LLM LAB page |
| **Mem0** | everything in default `custom` mode | nothing by default; if `mode=mem0`, Local Core boot fails (`startLocalMem0` throws) [INFERENCE] — replaceable at `core/memory.ts` |
| **runEngine** [v2] | main chat, machines, memory, life | Agent Lab, automations, `/v1/chat/completions`, `/v1/responses`, `/api/runs` |
| **Brain tool loop** (`replyWithLocalTools`) | direct answers (`createBaseNetlifyChatModel`) | every chat action: meal/workout/weight logging, diet/plan, reminders, automations creation, ME blocks, pages, files, connectors, skills, code audit, repo ops, TXT export, confirmation buttons |
| **`ai/client` speak** | chat (not used) | birth introductions in Activate/LAB/DEV → deterministic fallback voice (§17 contract returns `null`) |
| **Agent Lab** | main chat code tools | LAB AGENT room, `propose_ui_change` |
| **Skills system** | everything else | SkillStore, skill summary in prompt, `leggi_skill`, `gestisci_skill_locale` |
| **Cloud providers** | local text-cheap steps; life cycle; intermediate rounds | main chat final answers (no Ollama voice choice), images, transcription, vision, web search, machines/topics/memory capture (cloud defaults), automations |
| **Local Core** | nothing usable | all `/api/*`, SQLite persistence, scheduler (reminders, automations, machines), repo/workspace ops. `localStore.ts` uses `node:sqlite` ⇒ a Netlify redeploy would run on an ephemeral disk [INFERENCE]. **It is the Core.** |

---

## L. SIMPLIFICATION SCORECARD

| Subsystem | Class | Justification |
|---|---|---|
| Local Core server + SQLite store | KEEP | canonical runtime |
| Auth / spend / state endpoints | KEEP | stable boundaries; centralize cap/local-only in `callModel` |
| Game engine, Life cycle, World | KEEP | deterministic, validated |
| Browser orchestrator (`netlify-runtime` run) | ADAPT | source of behavior; extract `decideTurn()` |
| `replyWithLocalTools` | MERGE → `executeRun` | second loop; stage per tool family |
| `executeRun` + contracts/permissions | ADAPT | becomes MON CORE executor; fix `toolCapability` mapping |
| `/api/ai` | KEEP (as provider proxy) + ADAPT (server tool validation) | |
| `ai/client.ts` speak loop, `generateReply`, store `sendMessage`/`requestReply` | REMOVE | unreachable |
| Weekly `reflect.ts` + opinions | REMOVE (or rewire to Reflection machine) | ghost |
| Monthly `notebook.ts` review | ADAPT (feed from thread storage) or REMOVE | starved input |
| Brain page + `/api/brain` | REMOVE after export | legacy |
| Agent Lab | KEEP as profile | already a client of `executeRun` on v2 |
| `TOOLS` / `toolLayer` / Agent Lab tool defs | MERGE into `ToolSpec` manifest | executors stay |
| V2 `workspaceCapability`, `domainRegistry` | REMOVE | unused |
| V2 `codingWorker` | ADAPT → CEREBRO | the seam we need |
| V2 `projectFileMigration`, `memoryReconciliation` | OPTIONAL | one-off migration tools |
| `/api/runs` | OPTIONAL | keep only as WORK entry later |
| `/api/v2-lobehub` | REMOVE | 0 callers, UI deleted |
| Context builders (5) | MERGE → 1 (`loadCoreContext` pieces + `assembleContext` ranking) | |
| `routing.ts` | KEEP as registry | |
| `v2/modelRegistry`, `LOCAL_CHEAP_ROUND_*`, `runStep` AUTO | MERGE → `callModel` | |
| Price tables ×3, model lists ×2 | MERGE | drift |
| Machines ×3 | KEEP ME + ME.MON; ADAPT Reflection (bounded, idempotent) | |
| Memory capture per message | ADAPT (local tiny/main class) | biggest background spend |
| Topics | KEEP | cheap, consumed |
| Mem0 / Memory V1 | OPTIONAL | off; replaceable |
| Skills | ADAPT | provenance, nested sources, all executors |
| Automations | KEEP | = the only "workflow" needed |
| `COSTI.md` | REPLACE with measured costs | outdated |

---

## M. MIGRATION PLAN

Every stage leaves the app usable and is one revertible commit series.

| # | Goal | Affected | Compatibility | Tests (existing scripts first) | Rollback | Telemetry | Success |
|---|---|---|---|---|---|---|---|
| 0 | **Safety gate** (independent, do first) | `stream.ts` `CONFIRMABLE_ACTIONS`, `toolLayer.ts`, `repoOps.ts` deny-list, `skills.ts` local skills born disabled or confirmed | UI unchanged except a confirm button | `repo-ops-check.mjs`, `tool-loop-check.mjs`, `save-control-check.mjs` | revert | runtime events `REPO_WRITE_HELD/CONFIRMED` | no Core write without an explicit "sì" |
| 1 | **Turn decision record** (first slice, §N) | `netlify-runtime.ts`, `chatTrace.ts` | additive | `chat-v1-ui-check`, `tool-loop-check`, `context-selection-check` | revert | `TurnDecision` per turn | 100% of turns have a decision; distribution of modes/rules known |
| 2 | **Converge branches**: merge `codex/vinzmon-v2` into production per its own §37 procedure | whole repo | v2 already preserves UI | full suite + `v2-run-check`, `v2-context-check`, `core-ingress-check`, `agent-lab-check` | revert merge | V2_RUN_* events | one runtime tree, Agent Lab single loop in prod |
| 3 | **Delete dead paths** | `ai/client.ts`, `store.ts` chain, `reflect.ts`, Brain page, `/api/brain`, `/api/v2-lobehub`, V2 unused modules, stale labels | export Brain data first | build, typecheck, `assistant-check`, `lab-check` | revert | none | LOC down, no caller lost (grep proof in PR) |
| 4 | **One model gateway** `callModel` | all server `callProvider` callers, `modelRegistry`, `runStep` | same defaults initially | `routing-local-first-check`, `backend-check` | revert | route decision + local/cloud per step | cap + local-only enforced on 100% of server calls |
| 5 | **Background local-first** | memory capture, topics, machines | skip-on-local-failure for background | `core-memory-check`, `memory-cleanup-check`, new JSON-validity fixtures | per-step flag | local success rate, validity rate, cost | cloud spend of background ≈ 0 with quality parity on fixtures |
| 6 | **Bound Background data** | `machines.ts` | keep last N observations; idempotency key per memory set | new fixture | revert | blob size | stable blob size |
| 7 | **One tool manifest** | `ToolSpec` file; `tools.ts`/`toolLayer`/Agent Lab read defs from it; `/api/ai` validates | defs byte-identical to today | `tool-layer-check`, `tool-runtime-check`, `agent-lab-check` | revert | rejected-tool events | one source of tool truth; server rejects unknown/over-risk tools |
| 8 | **One context builder** | `assembleContext` uses `compileCoreContext` selection; remove double ME | prompts diffed on fixtures | `context-selection-check`, `v2-context-check`, `chat-me-check` | revert | context trace | same selections, no duplicates |
| 9 | **Mode contract** | `decideTurn()` shared; `runConfig.custom.mode`; `RunRequest.mode` | absent ⇒ AUTO | new unit fixtures from Stage-1 logs | revert | override usage, escalations | AUTO decisions match Stage-1 baseline |
| 10 | **Server loop for server tools** (S2) | `executeRun` streams `MonEvent`s; code/repo/workspace/connectors move first; browser tools via caller-suspension | per tool family flag | tool family checks | flag off | per-family parity | main chat runs through `executeRun` for migrated families |
| 11 | **CEREBRO interface** | generalize `codingWorker.ts`; in-process `work` profile on worktree | WORK opt-in | new worker fixture | disable profile | WorkerEvents | one WORK task end-to-end with approvals |
| 12 | **Skills v2** | provenance (commit+hash), nested sources, compat class, alias map, all executors see skills | existing installs migrated read-only | new catalog fixture (flat + nested) | revert | install/compat events | Hermes source browsable; A/B skills usable |
| 13 | **Memory read API** | `recall()` over existing stores | read-only facade | `core-memory-check`, `narrative-phase2-check` | revert | recall trace | all context builders use `recall` |

Deliberately **not** in the plan: a workflow engine, a new memory database,
Hermes as default runtime, moving game state authority server-side (do it per
domain only after Stage 10 proves the continuation protocol).

---

## N. FIRST IMPLEMENTATION SLICE (not implemented)

**"Turn Decision Record"** — make the orchestrator's existing decision
observable, change nothing else.

- **Where**: `src/assistant-original/netlify-runtime.ts`
  `createNetlifyChatModel().run`, right before the branch into
  `runWithLocalTools` / `createBaseNetlifyChatModel` / image / issue routes;
  plus the pool computation inside `replyWithLocalTools` (`availableTools`,
  `maxRounds`, `forcedWrite`).
- **What**: build one `TurnDecision` (§D) from values already computed:
  `mode` = `diretto`→ANSWER, `strumenti`→ACTION, image/issue/life→ACTION
  subtype; `source` (pending-confirmation / special-route / rule / default);
  `rules` = names of the regexes that matched (`TOOL_INTENT`, `AUDIT_INTENT`,
  `REPO_OPS_INTENT`, meal/workout/action proposals, `projectId`); tool pool
  names; withheld write tools; `maxRounds`; context selection count; enabled
  skills count; route model.
- **Persistence**: attach to the existing `ChatTrace` (new optional field) and
  one `postRuntimeEvent({eventType:'TURN_DECISION', metadata:{mode, source, count}})`.
  No new store, no new endpoint, no prompt change, no content stored.
- **UI**: none required; optionally one line in LAB TRACE "SCAMBIO".
- **Reversible**: optional fields only; revert is one commit.
- **Telemetry gained**: real ANSWER/ACTION distribution, how often rules
  miss, how often the 12-tool cap cuts needed tools, how many turns hit the
  round cap (future WORK candidates) — the data needed to decide whether a
  tiny classifier or a WORK mode is worth building.
- **Validation**: `npm run typecheck`, `build`, `scripts/chat-v1-ui-check.mjs`,
  `scripts/tool-loop-check.mjs`, `scripts/context-selection-check.mjs`.

Stage 0 (safety gate) is independent and should ship first or alongside.

---

## The 15 questions

1. **Is MON CORE necessary?** As a responsibility, yes; as a new layer, no.
   `executeRun` + a shared `decideTurn()` is MON CORE.
2. **Modes: architecture or UI?** Architecture (`TurnDecision.mode`,
   server-enforced tool risk). UI only as an optional override; ANSWER vs
   ACTION is already decided reliably by rules + confirmations.
3. **Is CEREBRO necessary?** Only as the out-of-process worker seam — and
   that seam already exists (`CodingWorker`). Don't build more.
4. **Hermes as first CEREBRO?** No. In-process `executeRun` `work` profile
   first; Hermes as an isolated second adapter via the disposable POC.
5. **Hermes Skills runtime-independent?** A and most B yes (with provenance
   snapshots + tool alias map + reading supporting files); C (~a third, bound
   overestimated at 43%) only through a Hermes adapter.
6. **Workflows as a primitive?** No. Automations (prompt + schedule + web)
   and skills cover it; add `skills` to automation runs instead.
7. **One Memory contract?** Yes as a typed read API with provenance and
   `derived` flags; no as one store or one write path.
8. **Delete rather than migrate**: `speak` loop/`generateReply`/store
   `sendMessage` chain, weekly reflection + opinions, Brain page +
   `/api/brain`, `/api/v2-lobehub`, V2 `workspaceCapability`/`domainRegistry`,
   stale `VOICE_MODEL`/`PHOTO_MODEL`, duplicate price/model lists.
9. **Closest to target**: `executeRun` (shape), `core/memory.ts` (memory
   contract), `routing.ts` `AI_STEPS` + `runStep` (router), `lifeCycle.ts`
   (deterministic pattern), `CodingWorker` (CEREBRO seam).
10. **Reflection/ME/ME.MON useful?** ME and ME.MON yes (every chat prompt);
    Reflection partly (feeds ME, notifications; unbounded, non-idempotent);
    legacy weekly reflection no (ghost).
11. **Local-first Background Mind blocked by**: server paths default to cloud
    via `resolveRoute`; AUTO local-first is browser-only; memory capture pins a
    cloud step model; no skip-on-failure policy; local-only unenforced there.
12. **Local-first chat blocked by**: no Ollama voice choice by design, ~16k
    char prompt + 12 tool schemas, one shared 14B model, unmeasured local tool
    reliability, no local-vs-cloud quality harness.
13. **Safest capability evolution**: capabilities as **data with provenance**
    (skills pinned by commit+hash, tools in a manifest with risk), approval
    enforced server-side by risk class, protected-path deny-list for Core,
    existing `scripts/*-check.mjs` as the gate before enable. Proposed split:
    SAFE = draft skills (disabled), benchmark, retrieval tuning; APPROVAL =
    enable/install/modify skills, new tool grants, routing policy, project
    writes, automations; PROTECTED = auth, secrets, spend/local-only policy,
    permission manifest, memory isolation, canonical validators, the policy
    itself. The current code puts Core writes and skill self-creation in SAFE
    — that's the first thing to change.
14. **Overengineering**: a user-facing 4-way mode switch; CEREBRO before a
    WORK use case; Workflows; one-store memory; five model classes before any
    measurement; V2's speculative modules (domain registry, workspace façade,
    16K/32K windows with no 32K caller); three reflection-style machines plus
    two legacy reflections; ~20 hand-grown pool regexes instead of manifest
    triggers.
15. **A 30–50% cut of the intelligence layer** (behavior-preserving):
    agent loops 2→1 (after Stage 10), dead loop in `ai/client` removed;
    context builders 5→1; tool definition sets 4→1 manifest (executors stay
    3); model-selection paths 4 (`resolveRoute`, `runStep`, `resolveRunModel`,
    local sentinel) → 1 `callModel`; reflection processes 5→3 (ME, ME.MON,
    bounded Reflection); legacy surfaces (Brain page, `/api/brain`,
    `/v2-lobehub`, unused V2 modules) removed; price/model tables 5→2. The
    product layer (store, engine, UI) is not the problem and should not be cut.
