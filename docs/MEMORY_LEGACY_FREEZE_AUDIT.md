# VINZ.MON Legacy Memory Freeze Audit

**Branch audited:** `claude/project-prototype-jxjc3d`  
**HEAD audited:** `59b609a` (`Connect LAB memory model routing`)  
**Scope:** read-only inventory before a possible Mem0 integration.

No source code was changed by this audit.

## 1. Executive summary

VINZ.MON currently has a complete custom semantic-memory writer alongside the chat and ME surfaces. Its canonical persistence is one Netlify Blob JSON document. Chat capture and ME Seed both write this document; the Memory screen reads a projection of it; the inline `Memoria aggiornata` label and Memory Trace are client-side observability surfaces around the chat capture request.

The safest next step is a **writer freeze**, not deletion: stop new custom chat-memory writes behind one explicit adapter/feature gate while retaining the read projection, feedback contract, trace shape and all persisted data. A future Mem0 adapter should implement the same boundary and return the existing mutation result.

## 2. Legacy Memory Engine inventory

### Canonical model and persistence

`netlify/functions/_shared/meModel.ts`

- Types: `MeEntity`, `MeRelation`, `MeEpisode`, `MeSource`, `MeSummary`, `MeModelDocument`.
- Root: `entity_user` is created by `emptyDocument()`.
- Store: `createMeModelStore()` calls `getStore('vinzmon-state')`, reads key `me-model-v1` as JSON and writes with `setJSON`.
- Entity operations: `createEntity`, `createEntityInDocument`, `getEntity`, `updateEntity`, `archiveEntity`, `mergeEntities`, `resolveCanonicalEntityId`.
- Source operations: `createSource`, `getSource`.
- Relation operations: `createRelation`, `getRelation`, `updateRelation`, `archiveRelation`, `supersedeRelation`.
- Episode operations: `createEpisode`, `getEpisode`, `updateEpisode`, `archiveEpisode`.
- Summary: `setSummary`.
- Capture metadata: `chatCaptures` and `seedImports` are stored in the same document.

This is the legacy writer's storage and domain layer. It is not a separate database, graph service or browser store.

### Entity resolution

`netlify/functions/_shared/entityResolver.ts`

- `normalizeEntityLabel()` trims, folds case, normalizes simple punctuation and collapses whitespace.
- `findEntityCandidates()` checks canonical names and aliases, with optional type constraint.
- `resolveEntity()` returns `match`, `new` or `ambiguous` and does not mutate storage.
- Merged IDs are resolved by `resolveCanonicalEntityId()` in `meModel.ts`.

This is custom identity infrastructure. It must not remain active in parallel with a Mem0 identity decision for the same write unless one is explicitly authoritative.

### Chat capture / extraction

`netlify/functions/_shared/meChatMemory.ts`

- `shouldCaptureChatMessage()` performs the cheap deterministic acknowledgement/calculation filter.
- `assertExtraction()` validates the structured extraction contract.
- `captureChatMemory()` performs idempotency checks using message ID/content hash, resolves mentions, stages entities/relations/episodes in a cloned document, applies relation equivalence and single-value replacement rules, then writes one staged document.
- `sha256()` produces the content hash used by `chatCaptures`.
- The result is `ignored`, `updated`, `no_change` or `failed`.

The function contains custom extraction-output interpretation, entity materialization, relation reconciliation, supersession and episode insertion. It is the principal legacy chat-memory engine.

### Seed importer

`netlify/functions/_shared/meSeed.ts`

- `validateSeedExtraction()` validates entities, relations and episodes.
- `importMeSeed()` fingerprints input, checks `seedImports`, calls the supplied extractor, resolves entities through `entityResolver.ts`, stages mutations, creates a `me_seed` Source and commits once.

`netlify/functions/me-seed.ts` is the authenticated Netlify endpoint. It routes extraction through `text-cheap` and `preferredModel` but writes the custom ME Blob through `importMeSeed()`.

ME Seed is legacy relative to a Mem0 replacement, but it is explicitly out of scope for the chat writer freeze unless a later task chooses to migrate Seed ingestion too.

### Projection / read surface

`netlify/functions/_shared/meMemoryProjection.ts`

- `projectMeModel()` filters active entities and relations.
- It resolves merged IDs and hides superseded/archived/malformed relation references.
- It maps internal predicates to display labels such as `Lavora su`, `Sposato con` and `Vive a`.
- It returns counts, entities, relations, episodes and a best-effort `recent` list.

`netlify/functions/me-memory.ts` is the authenticated `GET /api/me-memory` endpoint. It reads the custom Blob and returns this projection.

`src/screens/MeOverview.tsx` fetches `/api/me-memory` on entering/loading the Memory view and renders the read-only ME → MEMORY UI.

### Trace and inline feedback

`src/assistant-original/chat-memory-feedback.ts`

- `captureChatMemoryForClient()` sends the user message to `/api/me-chat-capture` with `messageId`, optional `conversationId`, recent context and LAB-selected `preferredModel`.
- It stores a client-side `traces` map keyed by the originating user message ID.
- It stores successful IDs in session storage key `vinzmon.chat.memory-updated.v1`.
- `hasMemoryUpdated()` drives the inline label.
- The label is rendered as `Memoria aggiornata` under the user message in `src/assistant-original/components/examples/chatgpt.tsx`.

`src/ai/chatTrace.ts` defines/persists the general assistant Trace through `/api/user-data` keys `chat-trace:<id>`.

`src/assistant-original/components/examples/chatgpt.tsx` opens Trace from the assistant message. It displays the Memory Trace lookup for `trace.originatingUserMessageId`, while ownership remains with the user message ID.

Important distinction: the Memory Trace metadata is currently a lightweight client map. It is not the ME Blob and is not a second semantic-memory store.

## 3. Exact current call chain

```text
user message
  ↓
src/assistant-original/netlify-runtime.ts
  ↓ fire-and-forget
captureChatMemoryForClient()
  ↓ POST /api/me-chat-capture
netlify/functions/me-chat-capture.ts
  ↓ authorize()
  ↓ shouldCaptureChatMessage()
  ↓ resolveRoute('text-cheap', preferredModel)
  ↓ callProvider(route.provider, ...)
  ↓ extractJson(response.text)
  ↓ captureChatMemory(createMeModelStore(), ...)
  ↓ sha256/idempotency
  ↓ assertExtraction()
  ↓ entityResolver.resolveEntity()
  ↓ createEntityInDocument() for NEW mentions
  ↓ relation reconciliation / supersession
  ↓ episode insertion
  ↓ store.write(staged)
  ↓ JSON result
captureChatMemoryForClient()
  ↓ traces.set(messageId, result summary)
  ↓ updatedIds/sessionStorage when updated=true
  ↓ React subscription
Memoria aggiornata under originating USER message
```

The response generation does not wait for capture: `netlify-runtime.ts` invokes the client capture with `void`. Capture failure is caught and does not fail the assistant response.

The Memory view is a separate read path:

```text
ME → MEMORY
  ↓
GET /api/me-memory
  ↓ authorize()
  ↓ createMeModelStore().read()
  ↓ projectMeModel()
  ↓ MeOverview MemoryView
```

## 4. Dependencies of the product UX

| UX surface | Current dependency | What a Mem0 migration must preserve |
|---|---|---|
| `Memoria aggiornata` | `captureChatMemoryForClient()` response `updated`, originating user `messageId`, session feedback map | Same boolean contract and originating-message association |
| ME → MEMORY | `/api/me-memory` → `createMeModelStore()` → `projectMeModel()` | Same authenticated read boundary, or an equivalent projection API |
| Memory Trace | capture result summary in `traces`, general assistant Trace association through `originatingUserMessageId` | Same Trace section and diagnostic fields; provider may change |
| Conversation persistence | Existing chat/thread system | Must not be changed by memory-engine replacement |
| LAB routing | `stepModel('memory')` and `preferredModel` | May continue selecting the extraction model for a future adapter |

## 5. Classification

### KEEP

- `Memoria aggiornata` label and its user-message ownership.
- `captureChatMemoryForClient()` public/client contract, including fire-and-forget behavior.
- Memory Trace section, originating-user association and privacy limits.
- `GET /api/me-memory` route shape as a product boundary, even if its backend projection later changes.
- `MeOverview` Memory UI and its loading/error/empty states.
- ME as a product concept and future synthesis boundary.
- `MeEntity`/`MeRelation`/`MeEpisode`/`MeSource` concepts as the VINZ.MON-facing projection contract, even if Mem0 becomes the underlying engine.
- Authentication via `_shared/auth.ts`.
- Conversation history, Persona, Voice, Mon generation, Narrator, LAB and chat lifecycle.

### ADAPT

- `/api/me-chat-capture`: retain endpoint and result contract, replace its internal writer with a Mem0 adapter later.
- `chat-memory-feedback.ts`: retain API call and feedback logic; add only any provider-neutral diagnostic fields required by the new adapter.
- `me-memory.ts` and `meMemoryProjection.ts`: adapt to read a provider-neutral Memory API projection rather than the Blob document.
- Trace model: keep section and statuses, adapt provider/model details to actual Mem0 operations.
- ME Seed endpoint: adapt only in a separately scoped migration task if Seed should use Mem0.

### FREEZE

- `meModel.ts` custom write operations.
- `entityResolver.ts`.
- `meChatMemory.ts` custom relation reconciliation.
- `meSeed.ts` custom importer.
- `me-model-v1` Blob schema and `chatCaptures`/`seedImports` mutation behavior.

Freeze means no new feature growth while evaluating Mem0; it does not mean deleting or disabling reads immediately.

### REMOVE LATER

Only after a verified Mem0 migration, export check and rollback plan:

- custom chat extraction interpretation in `meChatMemory.ts`;
- custom entity creation/resolution for the migrated write path;
- custom relation supersession/reconciliation if Mem0 demonstrably replaces it;
- Blob writes for newly captured chat memories;
- projection code that depends exclusively on `MeModelDocument` internals;
- duplicated `chatCaptures` idempotency if the replacement API supplies equivalent guarantees.

## 6. Conflicts if the legacy engine remains active

The following must not run in parallel for the same chat message:

1. Custom `captureChatMemory()` and a Mem0 `add()`/memory write, or duplicate knowledge will be created.
2. Custom `entityResolver.ts` plus Mem0 entity linking as two authorities, or identity conflicts will become possible.
3. Custom supersession plus Mem0 update/delete decisions, or temporal history can diverge.
4. Custom Blob persistence plus Mem0 persistence while both are presented as canonical.
5. Custom `/api/me-memory` data mixed with Mem0 data without an explicit merge/projection policy.

The feedback and Trace are not conflicts: they are presentation/observability contracts and should remain engine-neutral.

ME Seed is a separate writer. It must either remain explicitly custom/frozen or be migrated deliberately; it must not silently write a different canonical store from chat.

## 7. Smallest safe freeze implementation for the next task

1. Introduce one explicit server-side writer boundary, for example `captureMemory(input)`, used by `/api/me-chat-capture`.
2. Add a server-side feature/config gate whose default keeps the current custom writer available but makes the selected writer unambiguous (`custom` now, `mem0` later).
3. Route only chat capture through that boundary; do not alter `meModel.ts`, `meMemoryProjection.ts`, UI or Trace contracts yet.
4. When the gate is set to frozen/no-op for testing, return a truthful `no_change`/`not_available` result and do not create entities, relations or sources.
5. Keep `/api/me-memory` reading the existing Blob until a separately validated Mem0 read projection exists.
6. Preserve a rollback path to the current custom writer and do not delete or rewrite `me-model-v1`.

This is intentionally a routing/freeze boundary, not a Mem0 implementation.

## 8. Must not be deleted

Do not delete the following because the future integration will reuse them or they are required for rollback/product continuity:

- `src/assistant-original/chat-memory-feedback.ts` and the `Memoria aggiornata` rendering in `chatgpt.tsx`.
- General Trace types/persistence in `src/ai/chatTrace.ts` and Trace UI in `chatgpt.tsx`.
- `netlify/functions/me-chat-capture.ts` endpoint/auth/result contract.
- `netlify/functions/me-memory.ts` endpoint/auth boundary.
- `src/screens/MeOverview.tsx` Memory UI.
- ME-facing concepts and display projection contract.
- `_shared/auth.ts` authorization boundary.
- Existing `me-model-v1` data, export/access needed for migration and rollback.
- `meModel.ts` types until all historical data has been exported and the replacement projection is proven.
- `meSeed.ts` and `/api/me-seed` until Seed ownership is explicitly decided.
- LAB `memory` routing and `preferredModel` plumbing.
- Conversation IDs/message IDs used for provenance and Trace association.

## 9. Current architectural risks to carry into migration

- Blob is a single-document store; reads/writes and projection are not query-indexed.
- `meChatMemory.ts` can materialize entities before all dependent relation decisions are known, creating orphan risk.
- `MeMemoryProjection.recent` is best-effort rather than a mutation log.
- Client Memory Trace is not durable server-side capture telemetry.
- The current model and provider can be changed independently through LAB; a future adapter must report the actual provider/model.
- Existing documentation says some ME features are dormant even though Memory UI and Chat Memory Capture are now connected; migration work should use code as authority.

## 10. Files/functions index

### Legacy engine

- `netlify/functions/_shared/meModel.ts`: `createMeModelStore`, `createEntity*`, relation/episode/source operations, merge/canonical functions.
- `netlify/functions/_shared/entityResolver.ts`: `normalizeEntityLabel`, `findEntityCandidates`, `resolveEntity`.
- `netlify/functions/_shared/meChatMemory.ts`: `shouldCaptureChatMessage`, `assertExtraction`, `captureChatMemory`, `sha256`.
- `netlify/functions/_shared/meSeed.ts`: `validateSeedExtraction`, `importMeSeed`.
- `netlify/functions/me-chat-capture.ts`: authenticated chat capture endpoint and provider call.
- `netlify/functions/me-seed.ts`: authenticated Seed endpoint.
- `netlify/functions/me-memory.ts`: authenticated custom-model projection endpoint.
- `netlify/functions/_shared/meMemoryProjection.ts`: `projectMeModel`.

### UX and coupling

- `src/assistant-original/netlify-runtime.ts`: calls `captureChatMemoryForClient()` after a user message, fire-and-forget.
- `src/assistant-original/chat-memory-feedback.ts`: client request, feedback IDs and lightweight Memory Trace map.
- `src/assistant-original/components/examples/chatgpt.tsx`: user feedback label and assistant Trace modal/Memory section.
- `src/ai/chatTrace.ts`: `ChatTrace`, persistence and `originatingUserMessageId`.
- `src/screens/MeOverview.tsx`: Memory UI fetch and rendering.
- `netlify/functions/_shared/auth.ts`: authentication used by all relevant endpoints.
- `netlify/functions/_shared/routing.ts`: `AiStepId.memory`, `stepModel`/route selection and `text-cheap` capability.

### Tests

- `netlify/functions/_shared/meModel.test.ts`: model lifecycle, provenance, merge and temporal operations.
- `netlify/functions/_shared/meChatMemory.test.ts`: filter, capture, idempotency and failure behavior.

# NEXT IMPLEMENTATION TASK

Implemented in `netlify/functions/_shared/memoryWriter.ts`: `/api/me-chat-capture` now reaches chat memory through one provider-neutral boundary. `custom` (default) delegates unchanged to `captureChatMemory`; `frozen` returns the compatible non-updated result without reading or writing the ME Blob. The mode is selected by `VINZMON_MEMORY_WRITER_MODE`; unknown modes fail before mutation. A future `mem0` adapter can be added beside these modes without changing the endpoint, `Memoria aggiornata`, Trace or Memory UI contracts.

**Superseded 2026-09-04 (CORE EXTRACTION PHASE 1):** `memoryWriter.ts` is gone. Its job — and the equivalent decision that `me-memory.ts` and `machines.ts` were each making independently, `machines.ts` incorrectly always assuming Mem0 — now lives in one place, `netlify/functions/_shared/core/memory.ts`. See `docs/CORE_EXTRACTION_PHASE1_2026-09-04.md`. The endpoint/result contracts named above are unchanged.
