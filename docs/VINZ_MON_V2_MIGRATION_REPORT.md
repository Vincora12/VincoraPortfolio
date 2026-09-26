# VINZ.MON V2 — Safe Architecture Migration Report

Date: 2026-09-12

## 1. Executive result

V2 is implemented as an isolated, additive migration foundation. The current UI and production data were not changed. A canonical server-owned run engine now serves the OpenAI-compatible ingress, Agent.lab, automations, and the new `/api/runs` boundary. The main browser chat remains on its compatibility execution path until its browser-resident product tools can move without losing behavior. V2 is therefore not yet approved to replace the current installation.

## 2. Worktree and branch used

- Branch: `codex/vinzmon-v2`
- Final worktree: `/Users/ffuoco/Developer/VinzMon-v2`
- Baseline commit: `374363659686821a6ceda4be2484ea9aa70bb083`
- No push, merge, deploy, service restart, launchd change, or Tailscale change was performed.

## 3. Baseline state found

The active checkout was on `claude/project-prototype-jxjc3d`, four commits ahead of its remote. Baseline build passed. The baseline `npm test` stopped in `verify:reminders` at `scripts/reminders-check.mjs:31` with `0 !== 1`; preceding backend and Project checks passed.

## 4. Uncommitted current-source work preserved

The active checkout had no tracked modifications and no untracked application source, UI, styles, components, assets, or application configuration. Its only untracked path was `.claude/launch.json`, a local launch configuration. It was left untouched and was not copied. The V2 baseline therefore matched all committed current application source at `HEAD`.

## 5. Product / UI parity matrix

| Current feature | Current route/UI | Old backend path | V2 backend path | Validated | Notes |
|---|---|---|---|---|---|
| Boot and navigation | `/`, CHAT/MON/ME/TODAY | Vite + `/api/state` | unchanged | build PASS | No UI files redesigned. |
| Chat | CHAT | browser loop + `/api/ai` | compatibility path retained | type/build PASS | Final migration deferred pending server equivalents for browser-owned tools. |
| Project chat | Project pill/thread | `/api/core-context`, `/api/projects`, browser tools | `/api/runs` supports first-class `projectId`; old UI path retained | fixture acceptance PASS | Active Project is a ranking prior, not a retrieval wall. |
| Projects | Project workspace | `/api/projects` | same API + optional working state | PASS | Existing records remain compatible. |
| ME | ME | `/api/me-memory`, state/machines | same canonical memory boundary; ME marked derived | build PASS | No writer switch. |
| MON/game/narrative | MON and lifecycle screens | `/api/state`, narrative functions | unchanged domain owner | build PASS | Deterministic state untouched. |
| Artifacts | Project workspace/reader | Project records | bounded V2 retrieval; existing persistence retained | fixture PASS | No destructive byte migration. |
| Files | FILES/Project workspace | Project records + workspace connectors | fixture-gated filesystem migration tool | fixture PASS | Current storage remains active. |
| Calendar | TODAY/Calendar | `/api/calendar` | unchanged domain owner | baseline coverage partial | No data touched. |
| Reminders | reminders UI | calendar + scheduler | unchanged | pre-existing FAIL | Baseline failure reproduced before V2 changes. |
| Automations | automation UI | dedicated provider call | shared V2 run engine | type/build PASS | Schedule/store unchanged. |
| Settings/model controls | existing settings | `/api/ai`, `/api/user-data` | existing path + declarative run model registry | routing PASS | No UI copy changed. |
| Global memory | chat/ME | `core/memory` | context assembler always searches it on personal runs | fixture PASS | Mem0 remains optional backend pending reconciliation. |
| Cross-project retrieval | chat | active-project-only prompt | V2 ranked project resolution | fixture PASS | Does not switch UI Project. |
| Tools | chat/Lab | browser loop + code/repo endpoints | server tool contract + permission gate | fixture PASS | Browser product tools remain compatibility path. |
| Agent.lab | `/lab/agent` | dedicated provider/tool loop | shared V2 run engine with Lab profile | Agent.lab check PASS | Inspection UI unchanged. |
| `/v1/chat/completions` | external clients | shared ingress/provider call | shared ingress/V2 run | core-ingress PASS | Kept. |
| `/v1/responses` | external clients | shared ingress/provider call | shared ingress/V2 run | core-ingress PASS | Kept. |
| `/v1/models` | external clients | static compatibility response | unchanged | core-ingress PASS | Kept; run records provide usage evidence. |
| Mobile/responsive | existing CSS/layout | Vite | unchanged | build PASS | No visual-device E2E was available/run. |

## 6. Architecture implemented

Added one server run spine, central context assembler, explicit domain registry, run audit store, permission profile, declarative model registry, server tool interface, workspace capability façade, memory reconciliation comparator, project-file migration mechanism, and replaceable coding-worker contract.

## 7. V2 run model

`RunRequest`, `RunProfile`, `RunContext`, `RunEvent`, and `RunResult` represent chat, Project chat, Lab/inspection, automation, and future coding runs. `projectId` is a typed top-level field. Runs expose context selection metadata, model, tools, events, status, cancellation, error, sources, usage, and audit records.

## 8. Domain boundaries

`domainRegistry.ts` records the existing canonical owners for identity, persona, memory, ME, Projects, files, artifacts, conversations, calendar, automations, game/narrative, approvals, and audit/run history. The orchestrator reads these domains; it does not own their product data.

## 9. Context assembler

The assembler ranks explicit Project references, relevant active Project state, recent conversation, global memory, derived ME context, cross-Project evidence, artifacts, text files, and tools. Selection is bounded, deduplicated, and traced without copying private text into trace metadata.

## 10. Project context behavior

An active Project receives a relevance boost. It is omitted from model context when unrelated, while its UI selection is unchanged. Explicitly named Projects can be resolved with or without an active Project.

## 11. FFuoco → Canada test result

PASS with synthetic data: while FFuoco is active, the Montréal question selects global Canada/travel memory and excludes unrelated FFuoco content. No active Project mutation occurs.

## 12. Cross-project test result

PASS with synthetic data: while FFuoco is active, an explicit Sanbitter request retrieves the Sanbitter working state without switching the UI Project.

## 13. Project working state

Projects now optionally persist compact goal, decisions with rationale/source, requirements, constraints, open questions, next steps, recent state, and update time. The existing schema is backward compatible and mutation validation is bounded.

## 14. File / artifact model

The assembler performs bounded automatic artifact and small text-file retrieval. The migration tool produces filesystem bytes plus metadata containing Project mapping, revision, provenance, checksum, and migration time. It requires a fixture marker before writes and supports exact rollback. Current production file ownership is unchanged.

## 15. Memory reconciliation

Added a read-only comparator for copied custom-memory and Mem0 exports. It reports counts, exact duplicates, possible conflicts, source-only records, IDs, and whether writer switching is safe. It never chooses a winner or mutates either source.

## 16. Mem0 role

Mem0 remains an optional semantic backend/index. `VINZMON_MEMORY_WRITER_MODE` was not changed. The known independent ME seed path was not rewritten. A canonical-writer switch remains blocked on a real copied-data reconciliation and migration rehearsal.

## 17. 16K context result

PASS: a 4K output reserve is enforced; identity, request, bounded recent turns, Project snapshot, ranked memories/ME, evidence, and tool descriptions remain within a 12K estimated input budget.

## 18. 32K context result

PASS: a 6K output reserve is enforced; evidence allocations expand selectively while total estimated input remains within 26K.

## 19. Chat migration result

The OpenAI-compatible chat entry points use the V2 run spine. The primary web chat still uses its established browser tool loop; replacing it now would remove health, UI, local connector, confirmation, and other browser-resident capabilities.

## 20. Tools consolidation

The run spine has one server-tool contract, risk classification, permission gate, and combined result budget. A typed façade covers repository/workspace operations. Existing browser tools and compatibility endpoints remain until their callers can migrate with parity.

## 21. Agent.lab migration

The duplicate Agent.lab model/tool loop was removed. Its existing tools, tool trace, export behavior, provider quota errors, spend display, boundary prompt, and UI contract now run through the shared engine under the restricted Lab profile.

## 22. Workspace / repository capability

The shared façade reuses existing path confinement, extension restrictions, fixed Git operations, allowed npm scripts, and local-only server guards. Arbitrary shell, secrets, dependency install, push, and service control are denied by the V2 policy.

## 23. Coding worker / OpenCode result

A replaceable immutable coding-task/worker contract requires a separate existing worktree and returns structured diff/test status. OpenCode was not installed on this host, so no unsafe substitute agent, shell wrapper, dependency installation, or execution was added.

## 24. Automations result

Automation schedule, inbox, notification, and SQLite-backed state remain unchanged. Model work now executes as an `automation` profile through the shared run spine with the same selected route and web-search policy.

## 25. Model routing result

The V2 registry is local-first for ordinary chat, Project chat, and automation when no explicit compatibility model is supplied. Lab/inspection/coding use the stronger configured route. Existing migrated callers pass their current model explicitly to preserve current behavior.

## 26. `/v1` compatibility result

All three endpoints remain. `/v1/chat/completions` and `/v1/responses` share the V2 run pipeline in caller-tool mode; `/v1/models` remains compatible. The core-ingress fixture suite passed, including auth, Persona/memory context, SSE envelopes, tool association, and fail-closed storage behavior.

## 27. Legacy code removed

Removed the separate Agent.lab orchestration loop. No other legacy implementation was deleted because main-chat and tool parity is not yet demonstrated.

## 28. Files created / modified / deleted

Created V2 modules under `netlify/functions/_shared/v2`, the `/api/runs` handler, three V2 validation scripts, a memory reconciliation CLI, two synthetic memory fixtures, and this report. Modified Agent.lab, automations, OpenAI ingress, Core routing, Projects, package scripts, and the ingress fixture test. Deleted no files.

## 29. Migration tools created

- Read-only memory reconciliation for explicit copied JSON inputs.
- Fixture-marker-gated Project file planner/apply/rollback with SHA-256 verification.
- Run/context acceptance harnesses using synthetic domain data.

## 30. Tests / builds / validations run

- Baseline and final build.
- Main and function TypeScript checks.
- V2 context acceptance for scenarios A–F and 16K/32K.
- V2 run/tool/permission/coding-worker acceptance.
- V2 file migration and rollback on a temporary fixture directory.
- Memory reconciliation on copied fixtures.
- Projects, Agent.lab, routing/local-first, and Core ingress compatibility checks.
- Full `npm test` baseline/final attempt.

## 31. Pre-existing failures

`verify:reminders` fails at `scripts/reminders-check.mjs:31` because the synthetic due count is `0` rather than `1`. `verify:tool-runtime` fails at `scripts/tool-runtime-check.mjs:76` because the synthetic persisted artifact result is an error. The latter was reproduced directly in the untouched active checkout; neither failure was introduced by V2. No production reminder, Project, or tool state was inspected or modified.

## 32. New failures / blockers

No new failure is accepted as passing. Remaining blockers are incomplete main-chat/server-tool migration, copied real-data memory reconciliation, production-like file migration rehearsal, unavailable OpenCode, and missing full visual/mobile E2E coverage.

## 33. Security / permission review

No secrets or `.env` files entered the worktree. No production SQLite/Mem0/Project/conversation/game/workspace data was read or written. Lab personal-memory retrieval is disabled. Write tools are not exposed to chat/coding profiles without a future approval path. Run traces store IDs/counts/reasons rather than context text.

## 34. Local checkpoint commits created

- `0e3360f` — baseline checkpoint.
- `ba02bfc` — canonical V2 run spine and context domains.
- `2a98cf3` — ingress hardening, fixture file migration, and exact rollback validation.
- `b9e05c0` — restricted Lab/coding profiles cannot load personal identity, Projects, memory, or ME.
- A final report checkpoint follows.

## 35. Exact diff summary

Before this report commit, the branch changed 26 source/test files with 1,084 insertions and 117 deletions relative to `3743636`; this report is the 27th file. The final source of truth remains `git diff --stat 3743636..codex/vinzmon-v2` in the isolated worktree. There are no changes in the active checkout from this migration.

## 36. What still remains before V2 can replace current VINZ.MON

Migrate the main browser chat tools into server capabilities without feature loss; add an approval continuation protocol; reconcile copied real memory stores; rehearse file metadata migration on a complete copy; connect conversation domains cleanly; exercise local and selected cloud models; complete mobile/visual parity; then remove compatibility code only after tests prove parity.

## 37. Safe merge procedure

1. Keep the production checkout and services running.
2. Fetch/review `codex/vinzmon-v2` locally without pushing.
3. Rebase or merge the latest canonical branch into the V2 branch inside its worktree.
4. Resolve only reviewed source conflicts; do not copy `.env`, `data`, caches, or runtime stores.
5. Run the full validation matrix on isolated ports and copied data.
6. Review the branch diff and checkpoint history.
7. Merge only during an explicit maintenance decision; do not restart production automatically.

## 38. Safe data-migration procedure

1. Stop before production writes.
2. Create timestamped, verified copies of SQLite, Mem0, Project records, and filesystem workspaces.
3. Run memory reconciliation and resolve every conflict manually.
4. Run file planning/apply against a marker-protected copy and verify checksums/metadata.
5. Exercise the V2 server against copied data on isolated ports.
6. Produce a migration manifest and rollback manifest.
7. Obtain explicit approval before any production maintenance window or writer switch.

## 39. Complete rollback procedure

Before merge: remove the isolated worktree and delete only `codex/vinzmon-v2`; the active checkout and production data are already unchanged. After an eventual approved merge: stop the new isolated service, restore the prior application revision, restore the verified SQLite/Mem0/filesystem snapshots, reset the memory writer configuration to its captured value, verify checksums and health on an isolated port, then restart production only with explicit approval. The fixture Project-file tool can delete only exact files from its prior plan under the fixture marker.
