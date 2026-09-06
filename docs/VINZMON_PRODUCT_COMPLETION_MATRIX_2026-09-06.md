# VINZ.MON — Product completion matrix (2026-09-06)

Statuses are evidence-based: **DONE**, **WORKING BUT NEEDS VALIDATION**, **PARTIAL**, **BROKEN**, **MISSING**, **DUPLICATED**, **OBSOLETE**, **PARKED**, **NOT VERIFIED**.

| Domain | Feature | Current status | Evidence | Target / action | Dependencies | Priority | Complexity | Risk |
|---|---|---|---|---|---|---|---|---|
| Core | canonical identity | PARTIAL | Zustand token/active Mon in `src/state/store.ts`; server auth only | One server-readable identity/context boundary | state, auth | P0 | M | high |
| Core | active `.mon` and forms | WORKING BUT NEEDS VALIDATION | `mons`, `activeMonName`, `MonRecord` | preserve; expose via canonical hydration | generator | P0 | S | medium |
| Core | character generator | DONE for prototype | `characterGenerator.ts`, seeded RNG/config | preserve exactly | none | P0 | — | low |
| Core | persona/voice | WORKING BUT NEEDS VALIDATION | `voicePrompt.ts`, `voiceDna.ts`, `/api/ai` | shared core context | identity, memory | P0 | M | medium |
| Core | character growth | PARKED | comments/store note standby | defer | — | P2 | L | high |
| Memory | legacy `Memory[]` | WORKING | state + `memoryContext.ts` | keep as gameplay history, define boundary | state | P0 | S | duplication |
| Memory | ME Model | PARTIAL | `meModel.ts`, `me-memory.ts`, Blob `me-model-v1` | connect via projection/retrieval | auth, policy | P0 | M | medium |
| Memory | Mem0 | PARTIAL | optional mode in `memoryWriter.ts` | one provider-neutral read/write boundary | external service | P1 | M | privacy |
| Memory | provenance/correction | PARTIAL | ME sources/confidence/status | expose inspect/correct/forget | ME UI | P1 | M | medium |
| Chat | main chat | WORKING BUT NEEDS VALIDATION | assistant-ui IntegratedChat + Netlify runtime | production gauntlet | lifecycle | P0 | S | high |
| Chat | ME chat | DUPLICATED/SHARED | Lab panel reuses IntegratedChat; health tools local | keep one runtime; distinguish context | health | P0 | S | medium |
| Chat | Brain chat | LEGACY / DUPLICATED | `src/brain/Brain.tsx`, `/api/brain`, `vinzmon-brain` | freeze, migrate only with proof | chat ownership | P1 | M | high |
| Chat | persistence/reload | PARTIAL | assistant-ui local/server cache + Brain Blob | one canonical conversation owner | identity | P0 | M | high |
| Chat | first-message lifecycle | WORKING BUT NEEDS VALIDATION | `conversation-lifecycle-adapter.ts`; recent fixes | real-device verification | storage/auth | P0 | S | high |
| AI | central routing | DONE for current catalog | `_shared/routing.ts` | preserve | providers | P0 | — | low |
| AI | cost cap/ledger | DONE | `_shared/spend.ts`, `/api/usage` | preserve isolated semantics | Blob | P0 | — | low |
| AI | fallback/error semantics | WORKING BUT NEEDS VALIDATION | `/api/ai`, `BackendResult` | add only observed fixes | runtime | P0 | S | medium |
| AI | capability awareness | PARTIAL | tool catalog + provider routes, no effective registry | derive effective capability view | connectors | P1 | M | medium |
| Tools | native tool catalog | WORKING | 20 tools in `src/ai/tools.ts` | preserve; add bounded actions | state | P0 | S | medium |
| Tools | loop | WORKING BUT NEEDS VALIDATION | max four rounds, result reinsertion | add explicit budget/verification later | model | P1 | M | high |
| Tools | approvals/permissions | PARTIAL | special meal/workout confirmations only | shared policy envelope | tools | P1 | M | high |
| Tools | retries/verification | MISSING | no durable verifier | implement for high-risk writes first | action log | P1 | M | high |
| Agenticity | planning | PARTIAL | implicit provider tool calls | optional explicit plan state | tasks | P1 | M | medium |
| Agenticity | durable execution | MISSING | no resumable goal/job for tools | add only for actions needing it | storage/queue | P2 | L | high |
| Agenticity | maturity | TOOL-USING ASSISTANT | code evidence above | evolve incrementally | — | P0 | — | — |
| Game | SYNC/day state | DONE prototype | `progression.ts`, store actions | preserve | health | P0 | — | low |
| Game | TUNE | WORKING | generation/evolution paths | production test | world | P0 | S | medium |
| Game | RISE | WORKING BUT NEEDS VALIDATION | evolution + world paths | production test | world | P0 | S | medium |
| Game | World | PARTIAL | singleton World + canon/ledger + World Cultural DNA | strengthen autonomous identity without new DB | state, narrative | P1 | M | high |
| Game | Mindline | WORKING | `mindline.ts` graph/layout | preserve topology | generator | P0 | — | low |
| Game | Narrator | PARTIAL | `narratorPrompt.ts`, store triggers/fallback | rare event narrator | world/context | P1 | M | medium |
| Game | BREED/BABY/NUL | PARKED | phases/legacy code but no complete flow | defer | progression | P2 | L | high |
| ME health | meals/workouts/weight | WORKING | `healthJournal.ts`, `MeOverview.tsx` | deterministic correctness tests | — | P0 | S | medium |
| ME health | BMR/TDEE/deficit | PARTIAL/MISSING | no deterministic calculator; AI estimates exist | add calculator before claiming physiology | health inputs | P1 | M | medium |
| Projects | Project entity/context | MISSING | only ME entity type `project` | implement domain later | identity, files | P1 | L | high |
| Second brains | repo/Drive/Docs | MISSING | no connectors | defer until project boundary | connectors | P2 | L | high |
| Artifacts | pages/downloads | PARTIAL | `engine/pages.ts`, ZIP/export, print PDF | stable artifact ownership/deploy | projects, Netlify | P1 | L | high |
| Automations | reminders | PARTIAL | local reminders + push | server-owned scheduler | auth, notifications | P1 | M | medium |
| Automations | cron/watches | MISSING | no VINZ runner | defer | scheduler | P2 | L | high |
| Connected | Web search | WORKING | provider-native webSearch | retain as capability | provider | P0 | — | low |
| Connected | Gmail/Calendar/Drive/GitHub | MISSING | no source modules | defer | OAuth/permissions | P2 | XL | high |
| Connected | Instagram | MISSING | no Meta code | defer | project/provider | P2 | XL | high |
| Files | TXT/markdown | PARTIAL | page/download primitives | verified ToolResult artifact path | tools | P1 | M | medium |
| Files | images/assets | WORKING | IndexedDB/assets Blob pipeline | preserve visual lock | — | P0 | — | low |
| Control | runtime log | WORKING | `runtimeLog.ts`, Lab UI | preserve | Blob | P0 | — | low |
| Control | undo/audit/export | PARTIAL | trace/log/export fragments | define action history later | tools | P1 | M | high |
| Clients | Web | WORKING | Vite app/Netlify | canonical hydration | identity | P0 | — | medium |
| Clients | OpenAI ingress | NOT VERIFIED / MISSING | no `v1-*` functions in checkout | implement only after contract decision | auth/context | P1 | M | high |
| Clients | OpenClicky same Mon | PARTIAL | external client only; no current ingress | use canonical context endpoint | ingress | P1 | M | high |
| Clients | wearable/House.mon | MISSING | no client | parked | — | P2 | XL | high |

## Recommended sequence

1. Stabilize and test main/ME chat lifecycle, storage and canonical conversation ownership.
2. Add a read-only canonical VINZ context boundary for Web and future ingress.
3. Consolidate memory projection and provenance without deleting legacy stores.
4. Harden tool result budgets, confirmations, action audit and verification.
5. Deliver one end-to-end artifact/project slice; only then expand connectors/automations.
6. Add deterministic Daily Energy calculations.
7. Strengthen World/Narrator as an event-driven layer; keep parked game systems parked.

