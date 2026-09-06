# VINZ.MON — Final target architecture (2026-09-06)

This is a target plan grounded in the current code audit, not an implementation.

## Non-negotiable ownership

**One VINZ.MON, multiple bodies.** The deterministic generator decides what form exists; the narrative layer explains why it matters; World supplies place/context. No client, provider, Hermes instance or generated form becomes a second identity.

```
VINZ.MON CORE
├─ Identity / auth
├─ Active Mon + form history
├─ Persona / Voice
├─ Canonical Memory projection
├─ ME + structured health
├─ Game state (SYNC/TUNE/RISE)
└─ Policy / permissions
     │
     ├─ CONTEXT: conversations, projects, files, search, second brains, inbox
     ├─ INTELLIGENCE: routing, models, context assembly, skills
     ├─ ACTION: existing tools, connected services, desktop, files, artifacts
     ├─ AUTONOMY: bounded jobs, approvals, notifications, verification
     ├─ BODIES: Web, OpenClicky, future clients
     └─ GAME: World, Mindline, parked systems
```

## Canonical boundaries

| Domain | Canonical owner | Persistence | Boundary | Reused current code | New work |
|---|---|---|---|---|---|
| Identity/active form | server canonical context (migration target) | existing state Blob + browser cache | authenticated read/write | `state.ts`, `store.ts` | context adapter |
| Chat | one conversation repository | existing user-data/Brain path after decision | assistant runtime + API | IntegratedChat, `netlify-runtime.ts` | consolidate ownership |
| Personal memory | ME projection with Mem0 adapter | existing ME Blob/Mem0 | `/api/me-memory` + bounded retrieval | `meModel.ts`, `memoryWriter.ts` | merge policy |
| Structured health | health journal | local + state snapshot | health tools/API | `healthJournal.ts`, `tools.ts` | deterministic energy |
| Character/visual | generator + MonRecord | state/server backup | generator and asset APIs | `characterGenerator.ts`, pipeline | none for V1 |
| World | World record + ledger | AppState/server snapshot | progression/narrative events | `world.ts`, `narrativeContext.ts` | multi-form membership only if needed |
| Tools/actions | catalog + dispatcher | action audit only when required | tool envelope | `tools.ts`, `runTool` | budget/approval/verify |
| Projects/artifacts | future Project domain | server-owned | scoped context/artifact API | pages/export primitives | new vertical slice |
| Automation | future scheduler | server-owned | job/notification API | push/reminders | new domain |

No new database is implied by this table; the first migration should compose existing stores and preserve legacy reads.

### Core and persistence

Keep `src/state/store.ts` as the readable legacy/browser state during migration. Add a server-read canonical context operation only when a second client needs it; it should compose existing `state.ts`/`user-data.ts`, ME projection, chat ownership, health and World rather than duplicate them. LocalStorage remains cache/offline state, never the authority for cross-device identity.

### Memory

Keep three semantic layers distinct: chronological chat history; structured ME facts with provenance/confidence; derived Reflection/ME projections. Keep Mem0 behind `memoryWriter.ts`/`me-memory.ts`. Retrieval is bounded and event-specific. Do not inject the entire memory archive into the generator or create a Diary.

### Character and visual pipeline

`characterGenerator.ts`, `generation-config.ts`, `CharacterData`, `MonRecord`, resolver, prompt compiler, assets and image routing remain authoritative and unchanged. Character growth is a later modifier, not a new database. `narrativeDNA` remains form-origin data; current Story Function is not a second permanent field until a journey context is justified.

### Narrative and World

Use `narrativeContext.ts` as runtime-only composition for Bio/Narrator. World remains a small persisted entity: stable identity and World Cultural DNA at creation; canon and StoryLedger append over time. RISE can create/enter a World; TUNE stays in the current World. Do not add simulation, NPCs, quests or geography. Keep Mindline topology orthogonal.

### Tools and agent runtime

Retain `TOOLS`, `runTool`, local `ToolContext`, provider tool loop and four-round cap. Add an action envelope only for operations requiring confirmation, retries, resumability or verification. Tool results need an explicit aggregate byte/token budget. A future plan/job store should be introduced only with a real resumable use case.

### Projects, artifacts and connected services

Project should own context, files, tasks, artifacts and automations; it must not own another Mon. Artifacts are separate from the main app: stable URL, owner Project, version/update/archive and deployment result. Connected providers expose capability, account, scope, READ/WRITE and confirmation policy. None of these domains are present today; implement one vertical slice before broad connector work.

## Canonical context contract (future)

The boundary should return a bounded, provenance-aware snapshot:

```ts
type CanonicalVinzContext = {
  identity: { subjectId: string };
  activeMon?: MonRecord;
  persona?: PersonalityCard;
  voice?: { preset: string; dna: VoiceDna };
  me?: MemoryProjection;
  structuredHealth?: unknown;
  world?: World;
  progression?: unknown;
  conversation?: { id: string; recent: unknown[] };
  capabilities: { name: string; provider?: string; available: boolean }[];
};
```

This is a read model, not a replacement database. Each field points to an existing owner and must carry a freshness/provenance policy. OpenClicky and Web then hydrate the same identity without sharing browser localStorage.

## Implementation phases

### V1 — finish a coherent companion

Canonical context read boundary; stable main/ME chat and one conversation store; ME/Mem0 projection with provenance; bounded tool actions with confirmation/error/verification; deterministic Daily Energy; production gauntlet and runtime log.

### V1 nice-to-have

One Project with files and one verified artifact type; server-owned reminder slice; read-only connector proof of concept.

### Later

Cross-device OpenClicky ingress, multiple connectors, artifact versioning, automation watches, approval queue, global search, controlled proactivity and richer World/Narrator consumers.

### Parked canon

BREED, BABY, NUL expansion, full Journey, World entities, NPCs, quest engine, geography and character-growth system.
