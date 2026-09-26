# VINZ.MON Runtime Build vs Adopt Audit

## 1. EXECUTIVE VERDICT

VINZ.MON should stop trying to become a general-purpose agent runtime. The architecture with the highest probability of becoming a reliable daily system is a **thin VINZ.MON product core plus externally maintained execution, with specialist runtimes where the risk profile differs**.

Concretely:

- Keep V1 as the product baseline and preserve its UI, deterministic product domains, server-side stores, Projects, ME, MON/game state, calendar/reminder semantics, and existing working capabilities.
- Keep and harden V2's product-specific contracts, domain adapters, Context Assembler concept, Project working state, and coding-worker boundary.
- Stop investing in V2's custom generic run loop, terminal-only run store, coarse permission mapper, and generic workspace execution façade as the future runtime.
- Use an externally maintained general execution substrate for the model/tool loop, streaming, continuation, cancellation, approvals, skills/MCP, and execution isolation. **Vellum Assistant is the leading complete-runtime candidate, but its short public track record and intrinsic conversation/identity workspace require a bounded integration spike against Pydantic AI before adoption.**
- Use OpenCode only as a coding specialist, inside a disposable worktree and a real OS/container sandbox. Do not use it as the general personal-assistant runtime.

The strategic answer is therefore decided even though the final general-runtime package is not: **Option 3 as the core boundary, plus Option 4 for specialist execution.** The comparative spike is not permission to continue building V2's generic runtime; it is a short make-or-break test between a complete but young substrate and a mature embeddable SDK.

The V2 migration report is directionally accurate that V2 is not ready to replace V1. Its stronger claims about a “canonical run engine,” cancellation, permissions, and audit persistence describe interfaces and fixtures, not production-grade behavior. The code has no streamed run API, no durable in-progress state, no approval continuation, no provider abort propagation, no automatic retry/recovery policy, and no real coding-worker adapter.

## 2. WHAT VINZ.MON MUST OWN

VINZ.MON must permanently own the information and policies that define the product rather than the mechanics of agent execution:

- Identity, persona, Voice DNA, MON identity/evolution, and deterministic game/narrative state.
- ME and one canonical personal-memory truth, including correction, provenance, reconciliation, and retention policy.
- Projects, Project conversations, working state, decisions and rationale, constraints, files, artifacts, and Project/global retrieval policy.
- The Context Assembler and the rule that the active Project is a strong prior but not a hard retrieval boundary.
- Canonical conversation and long-term product history. An execution runtime may retain a rebuildable operational journal, but it must not become a second product truth.
- Calendar, reminder, and automation meaning: what exists, when it runs, what was approved, and what result belongs in the product.
- Product authorization decisions, including actor, scope, target, exact arguments, expiry, and approval record.
- Model/spend policy: local-first defaults, optional cloud escalation, budgets, and privacy routing.
- User-facing Vite UI and the stable VINZ.MON product API.
- Product tools and their domain semantics. The runtime may invoke them; it must not redefine what they mean.

These responsibilities should remain server-owned. Browser local storage may remain a cache or offline fallback, but never an independent authority for shared data.

## 3. WHAT VINZ.MON SHOULD PROBABLY STOP BUILDING

VINZ.MON should not own another bespoke implementation of:

- the generic model/tool iteration loop;
- provider wire-format normalization and streaming parsers;
- tool-call continuation protocols;
- generic run lifecycle, cancellation, retry, checkpointing, and crash recovery;
- MCP client/server plumbing and skill discovery;
- generic shell/file/browser execution;
- OS sandboxing and credential isolation;
- a general coding agent;
- generic risk classification for arbitrary commands;
- background-agent orchestration independent of VINZ.MON's product scheduler;
- general observability/tracing infrastructure.

VINZ.MON still needs thin adapters and product policy. The test is whether a module encodes a VINZ.MON decision or merely reimplements a runtime primitive. The former should stay; the latter should be bought/adopted unless an integration spike proves the adopted runtime more complex than the code it replaces.

## 4. V1 REALITY

V1 is neither a toy nor a clean runtime. It is the real product baseline.

**What is genuinely valuable and should survive**

- The existing Vite/React interface and its CHAT, MON, ME, TODAY, Projects, artifacts, and Agent.lab surfaces.
- Deterministic character generation, MON evolution, World/narrative, mood, progression, and the visual/product taxonomy.
- The local Node Core Server, its authenticated product endpoints, routing/spend controls, and local Ollama support.
- Server-side SQLite blob storage with WAL, `synchronous=FULL`, ETags, and conditional updates (`netlify/functions/_shared/localStore.ts:4-105`).
- The Project domain with revision checks, bounded mutations, protected GLOBAL behavior, artifacts, and uploaded files (`src/engine/projects.ts:16-164`).
- The canonical personal-memory adapter, which selects exactly one writer mode and normalizes reads across the ME Model, Mem0, or frozen mode (`netlify/functions/_shared/core/memory.ts:82-184`).
- Calendar/reminder/automation product semantics, current repo operations, connector behavior, and extensive targeted verification scripts.

**What is browser-owned**

- The primary chat loop and most product-tool execution. `src/brain/stream.ts` performs context preparation, tool exposure, special confirmation handling, up to four or eight model/tool rounds, and final streaming into the UI (`src/brain/stream.ts:437-1000`).
- A second implementation lives in `src/assistant-original/netlify-runtime.ts`, including duplicated confirmation and routing logic.
- assistant-ui thread lifecycle, optimistic local sessions, promotion, hydration, message repository import, and browser-to-server history synchronization are managed by bespoke adapters under `src/assistant-original/`.
- Local storage is still used immediately and as a fallback/cache by `src/system/serverStorage.ts`, with a memory queue for failed writes.

**What is server-owned**

- Canonical blob persistence, Projects, state saves, personal memory, calendar, reminders, automations, spend, routing, authentication, local-model proxying, and product endpoints.
- The Core Context compiler reads canonical state, current MON, ME projection, and personal memory (`netlify/functions/_shared/coreContext.ts:12-58`).
- The scheduler runs in the local Core Server process, while optional Mem0 is a managed child process (`server/core-server.ts:172-263`).

**Duplication and fragility**

- There are two large browser/runtime paths: `src/brain/stream.ts` (1,040 lines) and `src/assistant-original/netlify-runtime.ts` (1,114 lines), plus `src/ai/tools.ts` (1,553 lines) and `src/ai/toolLayer.ts` (540 lines).
- Confirmation is not a general approval protocol. It consists of intent-specific gates that hide write tools and append tailored instructions for meals, workouts, reminders, automations, plans, diet, and service restart (`src/brain/stream.ts:270-330`, `497-561`).
- Conversation persistence has needed custom ETag merge, promotion, cold-start, late-hydration, and live-thread ownership logic. The extensive incident-oriented comments in `conversation-lifecycle-adapter.ts` are evidence of real complexity, not theoretical debt.
- The same logical history appears across assistant-ui message repositories, server-backed browser keys, `/api/brain`, and legacy Zustand fields. Some are compatibility paths, but the ownership boundary is not simple.
- The 5,591-line Zustand store combines large portions of product state and browser persistence, increasing synchronization risk.
- ETag merge/retry is specialized for chat message and thread-list keys; many other server-backed keys still use blind replacement (`src/system/serverStorage.ts:38-54`, `141-230`).
- V1's active Project currently becomes a hard memory boundary: `resolveChatContext` sends an empty query to `/api/core-context` whenever `projectId` exists, preventing global memory retrieval, then appends only the selected Project (`src/ai/chatContext.ts:8-35`). This violates the required active-prior behavior.

V1 should survive as the rollbackable product shell and data owner, not as the long-term agent-runtime implementation.

## 5. V2 REALITY

V2 is a useful architecture experiment, not a deployable runtime.

Relative to V1 baseline commit `3743636`, the branch adds or changes 27 files with 1,292 insertions and 117 deletions. The new V2 runtime core is small—roughly 824 lines across contracts, run engine/store, context assembler, domain/model/permission registries, workspace façade, and coding contract. That small size is a virtue for learning, but it also explains why production runtime behaviors are missing.

The best V2 work is product-specific:

- explicit Run/Profile/Context contracts;
- canonical domain adapters;
- a Context Assembler that attempts active-Project ranking, global memory escape, named cross-Project retrieval, working-state selection, and 16K/32K budgeting;
- optional compact Project working state;
- a memory reconciliation utility;
- a coding-worker contract requiring a separate worktree.

The generic runtime claims are ahead of the implementation:

- `runEngine` is a six-round blocking loop around the existing provider adapter.
- `runStore` writes only a terminal summary; it cannot resume a run.
- `/api/runs` supplies no tools and blocks until completion, so it is neither a streaming run API nor a useful generic tool-execution endpoint.
- permissions filter tools only by three mapped capability classes.
- “waiting-approval” and “queued” exist in types but not behavior.
- the OpenCode result is an availability check and interface, not an adapter.

The migration report correctly preserves V1 and admits that main chat is still on its compatibility path. It also records two baseline failures: `verify:reminders` and `verify:tool-runtime`. Its PASS statements for run, permission, 16K/32K, and context behavior are synthetic fixture acceptance, not real local-model, multi-turn, crash-recovery, or UI evidence.

## 6. CURRENT V2 GENERIC INFRASTRUCTURE INVENTORY

| Component | Actual implementation | Classification | Material gaps |
|---|---|---|---|
| `runEngine.ts` | Six blocking provider/tool rounds; sequential tools; in-memory AbortControllers; terminal events | Generic infrastructure | No stream, checkpoint/resume, approvals, provider abort signal, retry/backoff, parallelism, or crash recovery |
| Run contracts | Typed requests, profiles, context trace, events, results, tools | Mixed | Useful boundary; statuses overstate implemented lifecycle |
| `runStore.ts` | One terminal summary row per run | Generic audit skeleton | No queued/running checkpoints, messages, tool payloads, approval state, replay, or resume |
| `contextAssembler.ts` | VINZ-specific selection and budgeting | Product-specific and valuable | Lexical heuristics, named-project-only cross-project lookup, rough token estimation, full-block dedupe |
| `domainRegistry.ts` | Frozen documentation object | Product-specific intent | Does not enforce ownership or dependencies |
| `domains.ts` | Adapters to current identity, Projects, memory, and ME | Product-specific | Good bridge; retrieval quality depends on current backends |
| `permissions.ts` | Profile set plus `read`/`write`/`external` mapping | Generic skeleton | Declared workspace/git/shell/browser capabilities are never mapped; no target/argument/actor policy or approval |
| `modelRegistry.ts` | Profile-to-existing-routing lookup | Product-specific policy veneer | Provider execution still lives in existing custom adapters; no fallback/retry decision record |
| Server-tool interface | Definition, coarse risk, execute function | Generic | No durable call identity, idempotency, approval binding, scope, deadline, or compensation |
| Workspace/repository façade | Switch over existing V1 file/repo functions | Mostly generic | Published policy object is not consulted by dispatcher; broad operations exist but are not registered on `/api/runs` |
| Agent.lab profile | Existing lab tools adapted to shared loop | Useful product profile | Loop consolidation is real, but depends on incomplete runtime |
| Automation profile | Existing scheduler calls shared run engine | Useful product surface over generic loop | No background checkpoint/recovery; schedule remains the reliable product boundary |
| `/v1` integration | Existing ingress delegates to caller-mode run | Compatibility boundary | Caller still owns continuation; not a complete server execution path |
| Coding-worker contract | Immutable task/result interface and worktree preflight | Valuable boundary | No worker implementation, sandbox, OpenCode session, event stream, or cancellation integration |
| Caller/browser compatibility | Returns raw tool calls to external callers; main chat unchanged | Transitional compatibility | Maintains two ownership models and does not reduce main-chat complexity yet |

Specific code evidence:

- Cancellation only aborts an in-memory controller (`runEngine.ts:13`, `42-47`) and is checked between rounds (`91-94`). The signal is not passed to `callProvider` (`94-104`), so a blocked model request does not stop promptly and a process restart loses the cancellation registry.
- Tools execute sequentially without per-tool exception isolation (`115-125`). A thrown exception fails the whole run instead of becoming a model-visible tool error.
- Persistence happens only after completion/failure/cancellation (`131-145`).
- `/api/runs` calls `executeRun(runRequest)` without tools and returns only after the run finishes (`runs.ts:30-39`).
- `RunStatus` includes `queued` and `waiting-approval`, but no code emits an approval event (`contracts.ts:5`, `43-49`).
- Permission mapping collapses all tools into only `data-read`, `data-write`, or `network-allowlisted` (`permissions.ts:14-20`), leaving most declared capability vocabulary unenforced.

## 7. EXTERNAL CANDIDATES DISCOVERED

Candidates were classified by what they actually solve:

- **Vellum Assistant — A: personal-assistant runtime.** Local daemon/gateway/credential architecture, complete model/tool loop, SSE events, skills/plugins, MCP, permissions, host-vs-sandbox tools, memory, conversations, channels, and proactive work. It is the only candidate examined that resembles a complete daily-assistant substrate rather than a library.^1
- **Pydantic AI — C: agent SDK/framework.** Typed provider-independent loop, streaming, toolsets/MCP, deferred tools/approvals, external tool execution, local Ollama provider, and optional durable-execution integrations. It is a clean embed rather than a ready operational assistant.^2
- **OpenCode — D: coding agent.** Mature headless server/SDK/session/event surface, local providers, file/shell tools, MCP, permissions, and abort. It is optimized for repositories and coding, with no security sandbox of its own.^3
- **LangGraph — C/G: agent framework and workflow engine.** Strong graph state, checkpointers, interrupts, streaming, retry policy, and durable execution. It supplies powerful primitives but requires VINZ.MON to design most of the runtime product.^4
- **Mastra — C/G: TypeScript agent framework/workflow engine.** Agents, tools, memory, streaming, workflows, suspend/resume, MCP, and observability. It is a closer language fit but still an assembly framework; some code is under an enterprise license.^5
- **Letta — A/C: stateful-agent platform.** Strong identity/memory/conversation ownership and self-hosted server/SDK. Its defining value proposition conflicts with VINZ.MON's requirement to remain the canonical identity and memory owner.^6
- **OpenHands — D/F: coding agent plus sandbox/server stack.** Strong coding execution, a local Agent Server, remote conversation API, and Docker-backed sandboxes. It is heavier and coding-centric for a single 24 GB Mac.^7
- **ToolHive — E/F: MCP infrastructure and tool isolation.** Containerizes MCP servers and adds gateway policy, identity, audit, and observability. It does not provide the general agent loop or VINZ product semantics.^8

No serious candidate removes the need for VINZ.MON's product context and policy. The choice is how much generic execution it can safely absorb without becoming a competing product database.

## 8. CANDIDATES REJECTED EARLY

- **Letta:** rejected as the substrate because persistent agent identity, memory, and conversations are its core abstractions. Using them would create a second truth; disabling them discards its main advantage.
- **LangGraph:** rejected as the first choice because it provides excellent durability primitives but leaves VINZ.MON owning graph design, API, permission policy/enforcement, sandbox, provider operations, skills, and much observability. It is a sophisticated way to continue building infrastructure.
- **Mastra:** rejected versus Pydantic AI because it has the same framework-not-runtime gap, a mixed open-source/enterprise boundary, and less compelling evidence for VINZ.MON's specific durable/security needs.
- **OpenHands as general runtime:** rejected because it is coding-centric and operationally heavier; Docker-backed sandbox/server components are disproportionate for everyday personal tasks.
- **ToolHive:** rejected for initial adoption because it secures MCP servers but does not replace `runEngine`. It adds containers/gateway/registry before VINZ.MON has enough third-party MCP exposure to justify it.
- **Docker MCP Gateway and similar MCP catalogs:** rejected for the same reason: tool transport is only one layer, not the agent runtime, and Docker becomes an operational dependency.
- **Thin wrappers and new “agent OS” projects without documented lifecycle/security:** rejected because repository activity and demos do not establish recovery, permissions, or maintainability.

These may become useful later as bounded components. Rejection here means “not the minimum reliable architecture now,” not “technically incapable.”

## 9. FINALISTS

Three candidates survive, for different roles:

1. **Vellum Assistant** as the leading complete general-execution substrate. It removes the most custom infrastructure but creates the largest ownership-integration question.
2. **Pydantic AI** as the strongest cleanly embeddable alternative. It respects VINZ ownership but removes less operational work.
3. **OpenCode** as the coding specialist only. It complements either general-runtime choice and should never receive unrestricted host authority.

Vellum and Pydantic AI are not interchangeable. The former is an application/runtime whose generic machinery can potentially sit underneath VINZ.MON; the latter is a library from which VINZ.MON would still assemble a small runtime service. That is exactly why a spike is warranted.

## 10. FINALIST COMPARISON TABLE

| Candidate | category | maturity | license | maintenance | real adoption evidence | self-hosting | local-model support | Mac 24GB fit | tool loop | streaming | continuation | cancellation/retry | permissions | sandbox | MCP | skills | background work | context compatibility | external-memory compatibility | UI integration | coding capability | operational complexity | migration complexity | lock-in |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Vellum Assistant | A — personal-assistant runtime | Broad feature set, but short public OSS history | MIT | Very active; frequent releases | ~1K GitHub stars and active releases; weak long-production evidence | Yes, local mode | Ollama documented | Medium-high; several local processes/stores | Complete runtime loop | SSE text/tool deltas | Conversation/runtime continuation | Cancellation events; automatic retry/recovery evidence incomplete | Strong deterministic gateway/trust rules | OS sandbox plus host-tool broker | Yes | Native plugin skills | Heartbeats, schedules, watchers, subagents | Good through supported hooks | Memory can be off; conversation duplication remains | Local HTTP/SSE; custom VINZ path must be proven | General tools; can delegate | Medium | Medium-high | Medium |
| Pydantic AI | C — agent SDK/framework | Production/stable SDK classification; mature maintainers | MIT | Very active; frequent releases | ~20K GitHub stars and broad Pydantic ecosystem | Yes, embedded library | Ollama provider documented | High; one small service plus Ollama | Complete library loop | Async streams/UI protocols | History plus deferred-tool continuation | Async cancellation/retry primitives; durable backend optional | Approval/deferred primitives; VINZ implements authorization | No universal OS sandbox | Yes | Composable capabilities/toolsets | Requires VINZ scheduler/durable integration | Excellent; direct dependency/system injection | Excellent; no required memory owner | VINZ builds thin endpoint/SSE adapter | Coder capability, less proven than specialist | Low-medium; higher with durability | Medium | Low-medium |
| OpenCode | D — coding agent | Mature, fast-moving coding product | MIT | Very active; high change velocity | ~190K GitHub stars and large coding user/contributor volume | Yes, local CLI/server | Ollama documented | High on demand; model dominates RAM | Complete coding loop | Server events/SSE | Persistent sessions | Abort endpoint; retry is agent/config dependent | UX permission rules, not containment | Explicitly none; external isolation required | Yes | Native agents/skills/plugins | Async sessions/subagents, not personal scheduling | Good for scoped coding context | Good by prompt/tools; no personal memory needed | Headless server/SDK/events | Excellent | Low-medium; higher with sandbox | Low-medium as worker, very high as general runtime | Low-medium |

Star counts are adoption signals, not reliability proof. Counts and release activity are volatile; the linked repositories are the authoritative current source.^1,^2,^3

## 11. VELLUM ASSISTANT VERDICT

**Verdict: promising substrate, not yet an evidence-backed automatic adoption.**

What Vellum fundamentally owns:

- the agent loop and conversation execution;
- model/provider integration;
- conversation and attachment persistence;
- workspace identity files and default memory/context behavior;
- tools, plugins, skills, MCP, channels, schedules/heartbeats/watchers;
- deterministic permission classification, approval prompts, trust rules, credentials, sandbox, and host-tool boundary;
- HTTP/API events and client delivery.

What can remain VINZ-owned:

- Vellum memory can be turned off.^9
- Plugins can hook lifecycle boundaries without forking the core loop; the supported plugin API can transform the pre-model system prompt/messages and broadcast progress.^10
- VINZ.MON can expose product tools through a plugin or MCP/API bridge.
- Projects can remain opaque VINZ concepts: the hook receives a signed run envelope containing `conversationId`, active `projectId`, profile, and context-package reference, then injects VINZ's assembled context.
- Vellum's risk mechanics can enforce decisions made by VINZ, provided the adapter cannot mint its own authority.

The clean boundary would be:

1. VINZ authenticates the user, chooses the profile/model policy, resolves Project/global context, and issues a short-lived signed execution envelope.
2. A small Vellum plugin validates that envelope, injects the VINZ context package in a pre-model hook, and registers VINZ product tools.
3. Vellum runs the loop, streams typed SSE events, requests approvals, and executes sandboxed mechanics.
4. VINZ tools revalidate scope and arguments server-side. Approval is bound to the exact proposed action, not trusted merely because Vellum says “approved.”
5. VINZ records canonical conversation, Project, memory, schedule, artifact, and authorization outcomes.

The hard problem is Vellum's own workspace/conversation state. Identity can be neutralized and memory disabled, but no documented stateless one-shot agent endpoint was found. Its conversation database therefore risks becoming a duplicate. The acceptable design is to classify it as a rebuildable execution journal/cache with an explicit VINZ conversation mapping and retention policy. If the spike shows Vellum cannot run reliably with this noncanonical status—or cannot render the current UI's streaming/approval lifecycle without using Vellum-owned history—it should be rejected in favor of Pydantic AI.

No fork should be accepted. Integration must use the documented HTTP/SSE and plugin APIs. A fork would replace V2 maintenance with a larger upstream-merge burden and defeat the goal.

Vellum's permission model is materially stronger than V2's current mapper: checks run in a deterministic gateway; shell commands are parsed; workspace execution is OS-sandboxed; host access goes through a separate process; and trust rules are scoped.^11 This is documented architecture, not proof that every implementation path is vulnerability-free.

## 12. OPENCODE AS GENERAL RUNTIME VERDICT

**Verdict: reject.**

OpenCode has a real loop, excellent file/shell operations, headless sessions, event streaming, abort, permissions, plugins, MCP, and local-provider support. Technically, it can run non-code prompts. That does not make it a good general personal-assistant substrate.

Using it broadly would require VINZ.MON to suppress or wrap its coding-centric built-ins, build durable personal scheduling, bind every tool to product authorization, inject all identity/project/memory context, map histories, and add a real sandbox. OpenCode's security policy is explicit: its agent is not sandboxed, and permissions are a UX feature rather than isolation; true isolation requires Docker or a VM.^12

This is unacceptable for a system that may eventually access email, messages, calendar, personal files, browser state, and smart-home controls. Stretching OpenCode into Role B would preserve the same generic integration burden while starting from a toolset with broader host authority than desired.

## 13. OPENCODE AS CODING SPECIALIST VERDICT

**Verdict: adopt behind the V2 coding-worker contract after sandboxing.**

OpenCode is a strong fit for “Modifica questi file,” “Sistema questa parte del sito,” and “Modifica te stesso” because:

- sessions, status, diffs, permission responses, abort, and event streams are exposed by its server API;^3
- repository, file, shell, test, and MCP workflows are its core product;
- Ollama is supported;
- the enormous active user/contributor footprint gives far more coding-specific field exposure than a bespoke VINZ worker.

Required boundary:

- VINZ creates a disposable Git worktree and a task contract containing objective, allowed paths, test commands, budget, and deadline.
- The worker runs inside an actual OS/container sandbox with no secrets, no general home-directory access, no production data, and restricted network.
- VINZ remains the only authority that can accept a diff, merge, restart, deploy, or mutate runtime data.
- The worker returns structured events, diff, tests, and failure evidence. It never edits the live checkout directly.
- OpenCode server mode must be authenticated and bound locally. Historical advisories affected unauthenticated command-capable server paths and were patched, reinforcing the need to pin a fixed version and verify configuration.^13

## 14. STRONGEST OTHER ALTERNATIVE

**Pydantic AI is the strongest alternative.**

It is less turnkey than Vellum but cleaner architecturally:

- VINZ supplies its own context, dependencies, tools, and history without disabling a competing identity system.
- The SDK owns provider normalization, the agent/tool loop, structured results, streaming, retries, MCP, and model-specific behavior.
- Deferred tools provide a real pause/approve/externally-execute/continue shape. The documentation correctly warns that UI approval alone is not an authorization boundary; sensitive tools must enforce authorization server-side.^14
- Optional durable execution integrates with DBOS, Temporal, Prefect, Restate, or similar systems, but VINZ should not add one until a real background workload requires it.^2
- Ollama support is explicit.^15

The tradeoff is that VINZ.MON still owns a small execution service: HTTP/SSE adaptation, run persistence, approval records, cancellation plumbing, process supervision, and sandbox selection. This removes the loop but not the operational runtime. It is therefore the fallback if Vellum's complete runtime cannot be cleanly subordinated to VINZ ownership.

## 15. OPTION 1 — CUSTOM V2

**Probability of daily success: low. Recommendation: reject.**

Benefits:

- maximum control;
- perfect alignment with existing TypeScript server and product data;
- no external runtime state or upgrade semantics;
- V2 is small and understandable today.

Costs:

- the apparently small loop is the beginning, not the end: approvals, streams, provider cancellation, idempotency, checkpoints, crash recovery, retries, sandboxing, credentials, MCP, skills, tool schemas, background lifecycle, coding, observability, and migrations remain;
- each local/cloud provider edge case becomes VINZ maintenance;
- browser/runtime duplication continues during migration;
- the synthetic tests do not predict day-to-day recovery with local models;
- Vincenzo remains the maintainer of generic infrastructure instead of its user.

Even a correct implementation would consume the time the architecture is meant to save.

## 16. OPTION 2 — EXTERNAL RUNTIME

**Probability: medium. Recommendation: do not adopt as a wholesale replacement.**

A complete external runtime removes the most infrastructure. But allowing it to own identity, memory, Projects, long-term history, schedules, and permission decisions would hollow out VINZ.MON and create migration/lock-in risk.

Vellum is the closest candidate, but “VINZ.MON becomes a Vellum workspace” is the wrong architecture. It duplicates concepts and makes the current UI/data model subordinate to another personal-assistant product. A pure external-runtime choice is acceptable only if “external” means execution substrate, not product owner—which becomes Option 3.

## 17. OPTION 3 — THIN VINZ.MON + EXTERNAL EXECUTION

**Probability: high. Recommendation: adopt as the primary boundary.**

VINZ.MON keeps:

- authenticated product API;
- canonical domains and history;
- context assembly;
- product permission decisions and signed capability envelopes;
- model/spend policy;
- schedule semantics and UI.

The runtime keeps:

- model/tool loop;
- provider protocol and streaming;
- tool continuation and approval pause/resume;
- cancellation/retry mechanics;
- generic skill/MCP lifecycle;
- execution events and sandbox mechanics.

This is clean only if three invariants hold:

1. The runtime cannot write VINZ product state except through scoped VINZ tools.
2. Runtime memory is off or explicitly noncanonical.
3. A runtime conversation/log is either the canonical execution record linked to a VINZ conversation or a rebuildable cache—not an ambiguously synchronized second history.

Vellum can potentially meet these through supported hooks/API without a fork. Pydantic AI meets them by construction but requires more thin runtime code.

## 18. OPTION 4 — SPECIALIST RUNTIMES

**Probability: highest when layered on Option 3. Recommendation: adopt selectively.**

The general substrate should not receive every dangerous capability. Coding, browser control, and future media operations have different containment and observability needs.

Recommended routing:

- Ordinary chat, Project work, memory queries, planning, reminders, calendar, and safe product tools → general external execution substrate.
- Repository changes and self-modification → OpenCode worker in a disposable, sandboxed worktree.
- Browser control → a separately permissioned browser capability with explicit host boundary; do not expose arbitrary computer use to the general loop by default.
- Media generation → provider/tool adapters with narrow file outputs and no broad filesystem authority.
- Deterministic product updates → direct VINZ domain APIs after approval, not an autonomous shell.

The coordination layer remains small because it routes by declared capability class and creates scoped envelopes; it does not itself run agent loops.

## 19. MODULE-BY-MODULE V2 KEEP / ADAPT / REPLACE / DELETE TABLE

The table maps each serious option. `ADAPT` means preserve the product concept while changing its runtime boundary.

| V2 module | Option 1 custom | Option 2 wholesale runtime | Recommended Option 3+4 | Concrete recommended action |
|---|---|---|---|---|
| `runEngine` | KEEP/HARDEN | DELETE | REPLACE | Stop feature work; replace with thin Vellum or Pydantic adapter after spike |
| contracts | KEEP | ADAPT | ADAPT | Keep VINZ-facing `RunRequest`, context, capability, result, and coding task; map external events rather than mirror engine internals |
| `runStore` / audit | REPLACE | DELETE/ADAPT | REPLACE | VINZ stores product run summary, authorization decisions, domain mutations, and runtime correlation; external runtime stores execution checkpoints |
| `contextAssembler` | KEEP/HARDEN | KEEP | KEEP/HARDEN | Remains VINZ-owned; improve retrieval and token accounting |
| `domainRegistry` | ADAPT | KEEP as documentation | ADAPT | Convert passive declarations into tested adapters/ownership assertions; avoid a second registry framework |
| `domains.ts` | KEEP | ADAPT | KEEP/ADAPT | Preserve canonical adapters; expose them to the context service and product tools |
| `permissions` | REPLACE | DELETE | REPLACE | VINZ policy decision + signed capability; runtime deterministic enforcement; tool revalidation |
| `modelRegistry` | KEEP/HARDEN | DELETE | ADAPT | VINZ owns local/cloud/spend decision; runtime owns provider adapter and execution retry |
| server tools | KEEP/HARDEN | ADAPT | ADAPT | Keep product domain operations; expose through runtime plugin/MCP/API with scoped auth |
| workspace/repository façade | HARDEN | DELETE | REPLACE | Keep narrow Project-file domain APIs; use sandboxed specialist for generic repository/shell work |
| Agent.lab profile | KEEP | ADAPT | ADAPT | Keep UI/profile/read-only scope; run through external substrate |
| automation profile | KEEP | ADAPT | ADAPT | VINZ schedule remains canonical; external substrate executes each occurrence |
| `/v1` ingress | KEEP | ADAPT | KEEP/ADAPT | Preserve public compatibility; translate into the external runtime and VINZ event schema |
| coding-worker contract | KEEP | ADAPT | KEEP/ADAPT | Implement an OpenCode adapter behind it; retain worker replaceability and worktree requirement |
| `memoryReconciliation` | KEEP | KEEP | KEEP | One-off safety/migration utility, independent of runtime choice |
| `projectFileMigration` | UNCLEAR | UNCLEAR | DEFER | Not required for runtime adoption; run only when a separately justified file migration exists |

Modules that become unnecessary under the recommended architecture: the model/tool iteration in `runEngine`, its in-memory active-run map, terminal-only `runStore` as execution persistence, current coarse `permissions.ts`, generic workspace dispatcher, and any future custom MCP/skill/provider/coding-loop work.

## 20. CONTEXT ASSEMBLER DECISION

**Keep it VINZ-owned and harden it.** This is product intelligence, not generic runtime work.

The V2 concept correctly encodes the desired policy:

- active Project can receive a relevance/continuation boost;
- global memory is still queried;
- an explicitly named other Project can be selected without changing active UI state;
- Project working state, artifacts, files, and tools are budgeted and traced;
- 16K and 32K windows reserve output budget.

The current implementation is insufficient for production retrieval:

- Cross-Project retrieval only loads the active Project and Projects whose exact title appears in the query (`contextAssembler.ts:62-86`). “Use the visual direction we developed” cannot find Sanbitter unless “Sanbitter” is named or external memory already bridges it.
- Ranking is token overlap, not semantic or hybrid retrieval (`30-35`, `99-117`).
- Files/artifacts are searched only after their Project is already selected (`104-114`).
- Token count is `characters / 4`, which is a rough estimate across Italian, code, and structured data (`6`).
- Small files are fully base64-decoded before character clipping rather than indexed/chunked (`70-72`, `109-112`).
- Deduplication catches only normalized whole-block identity (`134-154`).
- Structured recent turns become `[structured content]` in `runEngine.ts:65`, losing tool context.
- The current request is included as both a fixed system block and the provider user message, consuming tokens and potentially changing instruction priority (`contextAssembler.ts:122-125`; `runEngine.ts:96-100`).

Harden by indexing Project summaries, decisions, artifacts, and file chunks server-side; run hybrid semantic+lexical retrieval across global memory and all Projects; then apply deterministic VINZ ranking and budgeting. The external runtime receives the finished context package and trace. It never decides which Project memories are canonical.

## 21. MEMORY OWNERSHIP DECISION

VINZ.MON remains the sole canonical memory owner.

- Keep the existing server-side memory adapter and reconciliation gate.
- Choose one writer mode at a time. Fix or explicitly retire the documented seed exception that always writes the ME Model (`core/memory.ts:224-248`) before switching to Mem0.
- Treat Vellum memory as disabled if Vellum is selected. Its documentation confirms memory can be turned off.^9
- Do not copy VINZ memories into a runtime-owned long-term store. Retrieve through VINZ and inject compact context, or expose read/write memory tools that enforce VINZ policy.
- A runtime may retain turn-local context, tool results, or a rebuildable execution journal. Those are not personal memory.
- Memory writes should be explicit domain outcomes with provenance, idempotency, correction semantics, and a visible audit trail—not an automatic side effect hidden in a runtime hook.

This prevents two competing facts, two correction paths, and provider lock-in.

## 22. PERMISSION OWNERSHIP DECISION

Use **VINZ.MON decides; external runtime enforces; VINZ tool revalidates**.

The policy decision must include:

- authenticated actor and execution profile;
- exact capability and tool;
- normalized target/resource/path/account;
- proposed arguments or a safe bounded predicate;
- risk level and whether interactive approval occurred;
- issue time, expiry, one-time/reusable status, and correlation IDs;
- Project and conversation scope;
- network/credential constraints.

The runtime receives a signed, short-lived capability envelope. It cannot mint or widen it. The runtime's deterministic gateway/sandbox blocks mechanics outside the envelope. The VINZ tool verifies the signature and exact scope again before mutation. The model never interprets “yes” as authorization and never writes approval state.

Vellum already provides stronger enforcement mechanics than V2, but its trust rules cannot be the sole product policy database. Pydantic AI provides approval/deferred flow, not authorization; its own documentation makes this distinction.^14 OpenCode permissions are insufficient without a sandbox.^12

## 23. LOCAL-FIRST ANALYSIS

On Apple Silicon with 24 GB RAM and 16K–32K practical context:

- Retrieval quality and tool discipline matter more than huge prompt capacity. Keep identity compact and cacheable; retrieve only relevant Project/global evidence; reserve model output and tool-result space.
- Vellum local mode is plausible without Kubernetes and supports Ollama, but its daemon, gateway, credential executor, local stores, optional vector components, and VINZ Core add operational/resource overhead. Measure idle and peak memory in the spike.^1
- Pydantic AI is the lightest general option: one Python process can coexist with the current Node Core and Ollama. Avoid adding Temporal/Postgres merely to claim durability; the existing scheduler and SQLite are sufficient until a real resumable workload demands more.
- OpenCode is practical as an on-demand specialist. The local model, not the OpenCode process, dominates memory. A 7B–14B quantized coding model is the realistic starting class; exact quality must be measured on the actual repository.
- OpenHands' Docker/server stack is heavier and competes with Ollama for RAM; reserve it for a later security/reliability comparison if OpenCode containment is inadequate.
- ToolHive/Kubernetes is disproportionate for one user.

Cloud models may be explicit upgrades for hard coding or reasoning, but no identity, Project, memory, or continuity path should depend on them.

## 24. SECURITY ANALYSIS

Primary threats are prompt injection, confused-deputy authorization, sandbox escape, secret exposure, unintended cross-Project disclosure, and a local HTTP service that grants shell authority.

Required controls:

- Bind local runtime APIs to loopback or authenticated private interfaces; use strong per-client tokens and narrow CORS.
- Put credentials outside model-visible context and inject them only into allowlisted requests.
- Default to no host shell. Use sandboxed workspace tools; promote specific host actions through a deterministic broker.
- Validate symlink/path traversal at the final execution boundary, not only in the model-facing adapter.
- Separate personal data tools from technical Lab/coding profiles, as V2 already attempts.
- Bind approval to exact arguments and invalidate it after use or timeout.
- Log policy decision, runtime call, tool result, and domain mutation with shared correlation IDs while excluding secret/context content.
- Use a disposable worktree for coding; never mount the live data directory or credential stores.
- Pin external runtime versions; review release/security notes before upgrades; test rollback.

Vellum's documented gateway, separate credential executor, OS sandbox, and host-tool distinction are strong architectural fits.^11 OpenCode's explicit no-sandbox threat model is the reason it must be isolated.^12 Pydantic AI must be paired with VINZ authorization and an external sandbox for dangerous tools.

## 25. RELIABILITY EVIDENCE

**Documented facts**

- V1 builds a real local product with server persistence, targeted checks, provider streaming, Project APIs, and active daily-facing UI. Its full test script is not green: V2's migration report records baseline failures in reminders and tool runtime.
- V2 fixture checks exercise a two-round tool call, caller handoff, restricted profiles, coarse tool filtering, six synthetic context scenarios, and budget assertions. They do not call a real provider, crash a process, resume an approval, or operate through the current UI.
- Vellum documents SSE events for token/tool streams, confirmation requests, handoff, and cancellation; deterministic gateway permissions; OS sandboxing; local self-hosting; Ollama; skills/plugins; and memory-off behavior.^9,^10,^11,^16
- Pydantic AI documents typed agent loops, streaming, MCP, deferred approvals/external tools, model/tool retry results, Ollama, and optional durable-execution integrations.^2,^14,^15
- OpenCode documents headless session APIs including abort and permission responses, while its security policy says it has no sandbox.^3,^12
- LangGraph documents checkpointed state, interrupt/resume, stream modes, retry policy, and durability modes.^4

**Inference**

- Vellum is likely to remove the most custom code, but its short public history makes upgrade and edge-case reliability less certain than the breadth of documentation suggests.
- Pydantic AI is more likely to preserve clean ownership and be debuggable inside VINZ.MON, but it will leave meaningful execution-service code for one maintainer.
- OpenCode is likely to outperform a bespoke coding worker, but local-model success on VINZ.MON changes depends heavily on model choice and context budget.
- V2's current implementation will accumulate edge-case machinery similar to V1 if promoted without adopting a runtime.

**Marketing claims, not accepted as evidence**

- Statements that an assistant works “24/7,” “evolves,” or is “enterprise-grade” do not prove crash recovery, safe upgrades, or reliable local-model behavior.
- GitHub stars measure awareness/adoption, not task success.
- A passing synthetic context fixture proves the specified fixture, not semantic retrieval over real Project history.

Evidence is sufficient to reject a custom V2 runtime and OpenCode-as-general-runtime. It is not sufficient to choose Vellum over Pydantic AI without the small integration spike in section 35.

## 26. COMPLEXITY REMOVED VS INTRODUCED

| Choice | Custom complexity removed | New complexity introduced | Net assessment |
|---|---|---|---|
| Custom V2 | Almost none; may eventually remove duplicate V1 Lab loop | Every missing runtime feature and its tests/operations | Strongly negative |
| Vellum substrate | Loop, streams, approvals mechanics, permissions classifier, sandbox/host split, credentials, skills, MCP, background primitives, provider adapters | Local runtime processes, plugin/tool bridge, context hook, event translation, conversation mapping, version upgrades | Positive only if spike proves clean noncanonical runtime state |
| Pydantic AI service | Provider/model loop, tool schemas/execution, streaming primitives, MCP, deferred continuation, retries | Python service, VINZ run store, API/SSE, auth, permission decisions/enforcement, scheduler integration, sandbox, supervision | Moderately positive; cleanest ownership |
| OpenCode specialist | Coding loop, repo exploration/edit/test behavior, session/diff events | Worker adapter, version pinning, worktree lifecycle, sandbox, resource limits | Strongly positive for coding only |
| LangGraph/Mastra | Graph/workflow loop, checkpoints/interrupts | Graph design, product runtime service, permissions, sandbox, provider/tool integration, operations | Weak versus Pydantic AI |

The winning design is not the one with the fewest VINZ lines. It is the one with the smallest number of independent authorities and the fewest runtime failure modes that Vincenzo must debug.

## 27. MIGRATION IMPACT ON V1

**Behavior that survives**

- Entire current UI and navigation.
- All canonical data and product domains.
- Current direct/deterministic product operations.
- Existing provider path and browser loop as rollback until each migrated surface reaches parity.
- Project records, artifacts/files, ME/memory, calendar, reminders, automations, game state, and current authentication.

**Migration path**

1. Add no schema migration for the runtime spike.
2. Put the external execution adapter behind an internal feature flag, initially on a synthetic/inspection route.
3. Feed the same VINZ context package and three read-only tools to both candidates.
4. After selecting a runtime, migrate Agent.lab first because its tool boundary is already server-side and restricted.
5. Migrate Project chat with read-only tools, then approvals/writes, then general chat.
6. Keep the V1 browser loop available per profile until parity and telemetry show reliable daily use.
7. Move browser-owned tools behind server domain APIs incrementally; do not redesign the UI.
8. Delete the old loop only after a rollback window and real usage.

**UI impact:** transport/event adaptation and a consistent approval card; no visual replacement.  
**Data impact:** none initially.  
**Memory impact:** canonical backend unchanged.  
**Project impact:** improves retrieval after Context Assembler hardening; active UI Project never changes implicitly.  
**Rollback:** flip per-profile feature flag to V1 loop; no data downgrade required.

## 28. MIGRATION IMPACT ON V2

**Survives**

- Context Assembler concept and acceptance scenarios.
- Run/context/tool/coding contracts after simplification.
- Canonical domain adapters and explicit ownership map.
- Project working-state schema if independently approved and backward compatible.
- Memory reconciliation utility.
- Agent.lab migration lessons and restricted-personal-context profile.
- `/v1` compatibility behavior.

**Abandoned**

- `runEngine` as the future generic loop.
- `runStore` as execution durability.
- current `permissions.ts` as an authorization system.
- generic workspace/repository dispatcher as a coding runtime.
- any plan to add home-grown streaming, checkpointing, MCP, skills, provider retry, or coding autonomy to these modules.

**Main-chat migration:** easier after selecting a substrate because streaming, continuation, and approvals have stable runtime semantics; still requires exposing browser product tools as authenticated server operations.  
**Data/Project/memory:** no runtime migration should move ownership.  
**Rollback:** V2 components are adapters and retrieval code behind existing APIs, not an irreversible branch-wide replacement.

## 29. RECOMMENDED FINAL ARCHITECTURE

```text
Current VINZ.MON Vite UI
        |
        v
VINZ.MON Product Core (canonical, local)
  - identity / persona / MON / ME
  - Projects / conversations / working state / artifacts / files
  - personal memory / calendar / reminders / automations / narrative
  - Context Assembler
  - authorization decision + capability envelope
  - model/spend/routing policy
        |
        v
General Execution Adapter
  - first candidate: Vellum Assistant via supported HTTP/SSE + plugin hooks
  - fallback: thin Pydantic AI local service
  - owns loop/stream/continuation/cancel/retry mechanics
  - owns execution checkpoints only, never VINZ product truth
        |
        +--> Narrow VINZ product tools (server revalidation)
        +--> Sandboxed browser capability
        +--> Sandboxed OpenCode coding worker in disposable worktree
        +--> Narrow media/network capabilities
```

The runtime adapter must be replaceable. VINZ events should use a small product schema: text delta, tool proposed, approval required, tool started/result, status, source, final message, and error. Runtime-specific events remain behind the adapter.

If Vellum wins the spike, disable its default memory and identity evolution, use hooks only through the supported plugin API, classify its conversation store as a bounded execution journal, and avoid a fork. If Pydantic AI wins, do not add a heavyweight durable engine initially; use the current Core process, SQLite product audit summaries, and existing scheduler while keeping dangerous execution in specialists.

## 30. WHY THIS HAS THE HIGHEST PROBABILITY OF ACTUALLY WORKING

- It preserves the product that already exists instead of attempting a branch-wide rewrite.
- It keeps one canonical source for identity, memory, Projects, conversations, schedules, and product state.
- It retains the most valuable V2 insight—context and domain ownership—without committing to its weakest implementation—the generic runtime.
- It delegates widely solved, high-edge-case mechanics to projects maintained by larger communities.
- It contains coding risk in a specialist environment instead of granting a general personal assistant an unsandboxed shell.
- It supports local Ollama and compact 16K–32K contexts by keeping retrieval in VINZ.MON.
- It allows incremental migration and per-profile rollback with no initial data conversion.
- It gives Vincenzo a stopping rule: after the two-day spike, choose a substrate and integrate only thin boundaries; do not resume runtime framework construction.

## 31. WHAT WE SHOULD STOP BUILDING IMMEDIATELY

- New features in `netlify/functions/_shared/v2/runEngine.ts` beyond what is needed to keep the branch reviewable.
- Durable lifecycle additions to `runStore.ts`.
- General approval, retry, cancellation, streaming, MCP, skills, or checkpoint protocols in V2.
- Expansion of `permissions.ts` into a generic command classifier.
- A home-grown general workspace/shell/coding agent.
- More provider-specific loop and tool-continuation logic.
- Browser/client caller-continuation variants as a permanent architecture.
- A custom OpenCode-like worker.

Continue only product-domain work that is valuable regardless of runtime choice.

## 32. WHAT EXISTING V2 WORK WE SHOULD KEEP

- Context Assembler policy and its FFuoco/global/Sanbitter acceptance cases.
- Compact Project working state with decisions, rationale/source, requirements, constraints, open questions, and next steps, subject to normal data review.
- `ContextDomains` and canonical adapters.
- Simplified run/context/capability/result contracts as external boundaries.
- Restricted Lab/inspection/coding profile principle.
- Coding task/result interface and disposable-worktree invariant.
- Read-only memory reconciliation.
- Context-selection trace that stores identifiers/scores/reasons rather than private text.
- The local-first profile/model policy decision, separated from provider execution.
- `/v1` compatibility surface.

## 33. WHAT EXISTING V2 WORK WE SHOULD ABANDON

- The claim that `runEngine` is the canonical production execution spine.
- The six-round loop as a foundation for future reliability.
- In-memory cancellation as adequate cancellation.
- Terminal-only `runStore` as persistent runs/audit.
- The current permission mapping as product authorization.
- The passive domain registry as enforcement.
- The workspace policy constant as protection when the dispatcher does not consult it.
- `/api/runs` as a generic tool runtime in its current no-tools, blocking form.
- The idea that caller mode unifies server and browser execution.
- The coding-worker availability check as evidence of coding execution.
- Synthetic 16K/32K fixtures as proof of real retrieval quality.

“Abandon” means stop investing and replace behind stable contracts, not delete immediately or disrupt current behavior.

## 34. SMALLEST NEXT STEP

Run the two-day read-only comparative spike in section 35. Use a copied/synthetic Project, no personal data, three non-mutating tools, the same Ollama model, and the current UI only as an SSE consumer. Produce one decision record with measured results. Do not merge V2, migrate data, or build missing runtime features before that result.

The success gate is binary:

- Choose Vellum if it can accept VINZ context, keep memory/identity noncanonical, stream the full lifecycle to the current UI, enforce a scoped approval, cancel promptly, recover a paused run, and operate within acceptable Mac resources without a fork.
- Otherwise choose Pydantic AI and accept the explicitly bounded thin service work.

## 35. COMPARATIVE SPIKE, ONLY IF STILL NECESSARY

**It is necessary because the architecture class is clear but Vellum-versus-Pydantic ownership/operations evidence is not.**

Run identical workloads against Vellum and Pydantic AI:

**Environment**

- Same Mac, Ollama version, local model, temperature, 16K context, and output limit.
- Same signed synthetic VINZ context package.
- Same synthetic active Project `FFuoco`, global Montréal fact, and cross-Project `Sanbitter` decision.
- Same three tools: read Project decision, read global memory, and propose a write that always requires approval.

**Scenarios**

1. Active-Project question: “What did we decide about the creators?”
2. Global escape: “What was the name of that place in Montréal?” while FFuoco remains active.
3. Cross-Project: “Use the visual direction we developed for Sanbitter.”
4. Three-step tool task with the second tool returning a structured transient failure.
5. Approval pause, process wait, and continuation with exact-argument approval.
6. Denial followed by model recovery without retrying the denied action.
7. Cancellation during model generation and during a slow tool.
8. Kill/restart the runtime after an approval checkpoint; observe recovery.
9. Simulate malformed runtime event and disconnected UI; verify resubscription/final state.
10. Repeat 30 times to expose intermittent loop/protocol failures.

**Measurements**

- final-answer correctness and source selection;
- successful completion rate and duplicate side-effect count;
- p50/p95 latency and time-to-first-token;
- input/output tokens and prompt composition;
- cancellation latency;
- recovery behavior and manual intervention count;
- lines/configuration of VINZ adapter code;
- idle and peak RAM/CPU with Ollama;
- quality of logs/event correlation;
- upgrade/fork requirement;
- whether any runtime database becomes an unavoidable second canonical history.

**Decision rule**

Vellum wins only if it passes all ownership/security gates, at least 29/30 ordinary runs, all approval/cancellation cases, and the adapter remains supported/no-fork. Pydantic AI wins if Vellum fails a gate or if its operational/duplicate-state burden is materially higher. If both fail, reconsider LangGraph only for durable execution—not as a reason to resume V2's ad hoc loop.

## 36. CONFIDENCE LEVEL

**High (0.90)** that VINZ.MON should stop building the generic V2 runtime. The missing features and duplicated V1 history are directly visible in code, while multiple maintained external projects already own the generic loop and protocols.

**High (0.85)** that the right architecture is thin VINZ product core plus specialist execution.

**High (0.90)** that OpenCode should be coding-only and sandboxed.

**Moderate (0.65)** that Vellum will beat Pydantic AI in the spike. Vellum is the feature-fit leader, but its public history is short and the clean conversation/identity boundary is not proven. This uncertainty is narrow enough for a two-day spike and too material to hide behind a confident documentation-only choice.

## 37. OPEN QUESTIONS

- Can Vellum accept an externally assembled per-turn system/context package and current VINZ history without making its conversation store authoritative?
- Can Vellum default memory, identity evolution, and proactive writes be fully disabled by supported configuration rather than patches?
- Can its current API create/correlate executions independently of its own UI and expose approval resume to the VINZ UI?
- What state survives a real local daemon crash during approval/tool execution?
- Does Vellum's macOS sandbox model remain supported given Apple's deprecation history around `sandbox-exec`, and what is the upstream fallback?
- How much RAM do Vellum's local components consume alongside the chosen Ollama model?
- Which V1 conversation store becomes the single canonical history after main-chat migration, and which compatibility stores can then be retired?
- What is the smallest server-side product-tool set required for daily Project chat parity?
- Which write actions require exact one-shot approval versus reusable scoped policy?
- Which local model reliably performs VINZ's real multi-tool tasks at 16K/32K, and when should model/spend policy escalate to cloud?
- Should Project files remain embedded in Project records or move to filesystem bytes plus canonical metadata? This is independent of runtime choice.
- What retention policy applies to external runtime execution journals and prompts containing retrieved personal context?

### Explicit strategic answers

**A. If Vincenzo wants to stop building agent infrastructure and start using VINZ.MON every day for real work, what architecture gives him the highest probability of success?**

A thin, server-owned VINZ.MON product core over an external general execution substrate, plus sandboxed specialist runtimes—OpenCode for coding—while retaining the current V1 UI/data baseline and V2's product-specific context/domain work. Vellum is the leading complete-substrate candidate; Pydantic AI is the fallback, selected by the bounded spike.

**B. If VINZ.MON were restarted from zero today, which generic infrastructure would you absolutely refuse to build ourselves?**

The provider/model tool loop, streaming protocol, run continuation, cancellation/retry/checkpoint engine, generic approvals mechanics, MCP/skills runtime, credential broker, OS sandbox, arbitrary shell/file executor, and coding agent. VINZ would build only product context, policy, domain APIs, canonical data, and replaceable adapters.

**C. Are we currently building something in V2 that a mature external runtime already solves better?**

Yes. V2 is rebuilding the agent loop, lifecycle/event model, tool continuation, cancellation concept, audit/run persistence, generic permission categories, workspace execution façade, model routing adapter, and future coding-worker mechanics. Mature frameworks and specialist agents solve most of these more completely; Vellum specifically packages nearly the whole general-runtime layer, though its own maturity/fit still requires the spike.

**D. If yes, what exact code or subsystem should we stop investing in now?**

Stop investing in `netlify/functions/_shared/v2/runEngine.ts`, `runStore.ts` as execution durability, `permissions.ts` as a generic authorization engine, `workspaceCapability.ts` as a general execution runtime, and any expansion of `/api/runs` into a custom streaming/approval/MCP/skills/coding platform. Preserve their useful boundary ideas in contracts and adapters; replace their mechanics.

### Sources

1. Vellum AI. “[Vellum Assistant repository](https://github.com/vellum-ai/vellum-assistant).” Accessed September 12, 2026. Repository, license, local mode, Ollama, components, releases, and adoption signal.
2. Pydantic. “[Pydantic AI repository](https://github.com/pydantic/pydantic-ai).” Accessed September 12, 2026; and “[Durable execution overview](https://github.com/pydantic/pydantic-ai/blob/main/docs/durable_execution/overview.md).” Agent loop, license, maintenance, UI protocols, capabilities, and durable integrations.
3. OpenCode. “[Server API](https://dev.opencode.ai/docs/server/).” Accessed September 12, 2026; and “[OpenCode repository](https://github.com/anomalyco/opencode).” Sessions, events, abort, permissions responses, license, maintenance, and adoption signal.
4. LangChain. “[LangGraph persistence](https://github.com/langchain-ai/docs/blob/main/src/oss/langgraph/persistence.mdx)” and “[LangGraph runtime types](https://github.com/langchain-ai/langgraph/blob/main/libs/langgraph/langgraph/types.py).” Accessed September 12, 2026. Checkpoints, memory/store distinction, interrupts, streams, retries, and durability modes.
5. Mastra. “[Mastra README](https://github.com/mastra-ai/mastra/blob/main/README.md).” Accessed September 12, 2026. Agents, workflows, suspension, memory, MCP, UI integration, and mixed licensing.
6. Letta. “[Letta repository](https://github.com/letta-ai/letta)” and “[Letta Code identity prompt](https://github.com/letta-ai/letta-code/blob/main/src/agent/prompts/letta_local_memfs.md).” Accessed September 12, 2026. Stateful-agent positioning and identity/memory ownership.
7. OpenHands. “[Local Agent Server](https://docs.openhands.dev/sdk/guides/agent-server/local-server)” and “[OpenHands Sandbox Server](https://github.com/OpenHands/sandbox-server).” Accessed September 12, 2026. Client-server architecture and Docker-backed sandbox operations.
8. Stacklok. “[ToolHive repository](https://github.com/stacklok/toolhive).” Accessed September 12, 2026. MCP isolation, authorization, audit, self-hosting, license, releases, and adoption signal.
9. Vellum AI. “[Memory & Context](https://www.vellum.ai/docs/key-concepts/memory-and-context).” Accessed September 12, 2026. Memory/context distinction and memory-off behavior.
10. Vellum AI. “[Hooks](https://www.vellum.ai/docs/extensibility/hooks).” Accessed September 12, 2026. Supported lifecycle extension and pre-model integration.
11. Vellum AI. “[The Permissions Model](https://www.vellum.ai/docs/trust-security/the-permissions-model)” and “[Privacy & Data](https://www.vellum.ai/docs/trust-security/privacy-and-data).” Accessed September 12, 2026. Deterministic gateway decisions, risk levels, sandbox/host split, credentials, and local Ollama.
12. OpenCode. “[Security policy](https://github.com/anomalyco/opencode/security).” Accessed September 12, 2026. Explicit no-sandbox threat model and server-mode responsibilities.
13. GitHub Advisory Database. “[GHSA-vxw4-wv6m-9hhh: Unauthenticated HTTP Server Allows Arbitrary Command Execution](https://github.com/anomalyco/opencode/security/advisories/GHSA-vxw4-wv6m-9hhh).” Published January 12, 2026; patched in `1.0.216`.
14. Pydantic. “[Deferred Tools](https://github.com/pydantic/pydantic-ai/blob/main/docs/deferred-tools.md).” Accessed September 12, 2026. Approval, external execution, continuation, retry results, and authorization warning.
15. Pydantic. “[Providers API](https://pydantic.dev/docs/ai/api/pydantic-ai/providers/).” Accessed September 12, 2026. Local or remote Ollama provider.
16. Vellum AI. “[API & Communication](https://www.vellum.ai/docs/developer-guide/api).” Accessed September 12, 2026. SSE event types, authentication scope, tool streams, confirmation, handoff, and cancellation events.

### Local evidence reviewed

- V1 worktree `/Users/ffuoco/Developer/VinzMon`, branch `claude/project-prototype-jxjc3d`, commit `3743636`.
- V2 worktree `/Users/ffuoco/Developer/VinzMon-v2`, branch `codex/vinzmon-v2`, commit `e0aa64f` before this uncommitted audit report.
- V2 migration report `docs/VINZ_MON_V2_MIGRATION_REPORT.md`, verified against the modules and callers cited above.
- No services, dependencies, databases, production data, Git branches, commits, or existing source/configuration files were changed during this audit.
