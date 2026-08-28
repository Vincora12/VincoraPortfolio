# ME Model V1

## 1. Purpose

ME Model V1 is a dormant, server-side semantic knowledge foundation for the persistent user model. It coexists with the current `Memory[]`, Health Journal, Mon, World, Opinions and lessons systems; it does not migrate or connect them yet.

## 2. Architecture

`netlify/functions/_shared/meModel.ts` defines the canonical document and server-side operations. The document is stored as JSON in the existing authenticated Netlify Blobs store `vinzmon-state`, key `me-model-v1`. This reuses the existing server persistence and auth boundary without adding a database, graph service or browser source of truth.

## 3. Entity

`MeEntity` has `id`, `type`, `name`, `aliases`, `status` (`active|archived`), `createdAt`, and `updatedAt`. Supported initial types are `user`, `person`, `project`, `organization`, `place`, `interest`, `concept`, and `other`. `createEntity` reuses an active entity with the same case-insensitive name or alias. The root user is created as the stable `entity_user` record by `emptyDocument`; it is not regenerated per operation.

## 4. Relation

`MeRelation` stores `subjectId`, free-form `predicate`, either `objectId` or scalar `value`, `status` (`active|superseded|disputed|archived`), optional `validFrom`/`validTo`, normalized `confidence` in `[0,1]`, `sourceIds`, and timestamps. Predicates intentionally remain extensible strings. `createRelation`, `updateRelation`, `archiveRelation` and `supersedeRelation` validate and persist records.

## Entity Resolution

`netlify/functions/_shared/entityResolver.ts` is the canonical entrance for future mention resolution and is separate from `createEntity`, which validates and creates records. `normalizeEntityLabel` performs only trimming, case folding, simple punctuation normalization and whitespace collapse. `findEntityCandidates` performs deterministic exact normalized canonical-name/alias matching, optionally constrained by entity type. `resolveEntity` returns typed `match`, `new`, or `ambiguous`; it never silently chooses among multiple candidates and does not create entities. The result is intentionally ready for a future semantic arbitration step, but V1 makes no AI call and uses no embeddings.

Entities support an explicit `merged` status and `mergedInto` pointer. `mergeEntities` preserves the source record, adds safe aliases to the active target, redirects relation subject/object IDs and episode entity references, and protects `entity_user`. `resolveCanonicalEntityId` follows merge pointers with cycle detection so old IDs remain traceable.

## 5. Episode

`MeEpisode` stores extensible `type`, `summary`, optional `startedAt`/`endedAt`, `entityIds`, `importance` in `[0,1]`, `sourceIds`, status (`active|archived`) and timestamps. `createEpisode`, `updateEpisode`, and `archiveEpisode` are deterministic.

## 6. Source

`MeSource` supports `chat`, `me_seed`, `manual`, `health`, `system`, and `derived`, with stable ID, optional `conversationId`, `messageId`, `referenceId`, `capturedAt`, and minimal optional description. It references existing conversations rather than copying them.

## 7. Temporal semantics

Relations preserve history. `supersedeRelation` marks the old record `superseded`, sets its `validTo` (replacement `validFrom` or operation time), creates a replacement, and preserves source references. No AI contradiction resolver is implemented.

## 8. Confidence

Confidence is a required normalized number for relations and is validated between 0 and 1. Episode importance uses the same bounded scale. No confidence algorithm is included.

## 9. User root entity

The canonical root ID is `entity_user`, created once in a new document. Entity creation never creates another user root. Authorization and per-user storage are inherited from Netlify’s existing `VINZMON_TOKEN` boundary.

## 10. Persistence

`createMeModelStore()` uses `getStore('vinzmon-state')`, key `me-model-v1`, and `get`/`setJSON`. It is server-side and authenticated by the hosting function context. Browser localStorage is not used by this module.

## 11. Core operations

Implemented exports: `createEntity`, `getEntity`, `updateEntity`, `archiveEntity`, `createSource`, `getSource`, `createRelation`, `getRelation`, `updateRelation`, `archiveRelation`, `supersedeRelation`, `createEpisode`, `getEpisode`, `updateEpisode`, `archiveEpisode`, and `setSummary`.

## 12. ME Summary placeholder

`MeSummary` is `{version: 1, summary, generatedAt, sourceRefs}` and is persisted only through `setSummary`. No automatic generation or model call exists.

## 13. Boundaries

- Health records remain in `healthJournal.ts` and existing Health state.
- Chat history and `Memory[]` remain unchanged.
- World/ledger, Mon records, Opinions, `writtenBio`, lessons and `customMemory` remain separate.
- No extraction, retrieval, prompt injection, UI, ME Seed import or chat feedback is connected.

## 14. Deferred functionality

Chat extraction, semantic retrieval/ranking, prompt integration, embeddings/vector search, reflections, pattern detection, background jobs, automatic summaries, export, user-facing editing/deletion, Mind Map and Mon generation integration are explicitly deferred.

## ME Seed V1

The authenticated `netlify/functions/me-seed.ts` endpoint accepts Markdown/plain text and uses the existing `text-cheap` route (`claude-haiku-4-5`) to extract only validated entity, relation and episode candidates. `netlify/functions/_shared/meSeed.ts:importMeSeed` fingerprints the exact content with Web Crypto SHA-256, returns `already_imported` before extraction when appropriate, resolves every entity through `entityResolver`, reports `ambiguous` candidates without forcing a match, and skips dependent records. It stages all mutations in a cloned document and performs one final Blob write, so validation/resolution failures do not leave a partial import. The created `me_seed` Source is referenced by every imported relation and episode, and minimal import metadata is stored in `seedImports`. It does not connect to chat, prompts, UI, Memory[], Health migration, summaries or semantic resolution.

## Chat Memory Capture V1

The authenticated `netlify/functions/me-chat-capture.ts` endpoint is invoked after real user messages by the assistant-ui runtime. A deterministic filter skips filler before the existing `text-cheap` (`claude-haiku-4-5`) route performs conservative structured extraction. `netlify/functions/_shared/meChatMemory.ts` validates the result, resolves mentions through the canonical Entity Resolver, plans CREATE/NO_CHANGE/SUPERSEDE decisions and writes one staged document only after validation. Chat Sources retain conversation/message provenance; hashes and message IDs make capture idempotent. Capture failures never block the normal reply. The only UI signal is the static `Memoria aggiornata` label under the originating user message after a real mutation. New ME knowledge is deliberately not retrieved or injected into prompts, and no Memory UI is connected.

## 15. File / function index

- `netlify/functions/_shared/meModel.ts` — types, `emptyDocument`, `createMeModelStore`, entity/source/relation/episode/summary operations, merge and canonical resolution.
- `netlify/functions/_shared/entityResolver.ts` — normalization, candidate retrieval and MATCH/NEW/AMBIGUOUS resolution.
- `netlify/functions/_shared/meModel.test.ts` — focused in-memory tests for root uniqueness, validation, provenance, lifecycle, supersession and resolution/merge safety.
- `netlify/functions/_shared/auth.ts` — existing authorization boundary used by future API callers.
- `netlify/functions/state.ts` — existing whole-app snapshot persistence, intentionally not modified or connected.
- `src/engine/types.ts`, `src/engine/chatExtract.ts`, `src/engine/healthJournal.ts`, `src/state/store.ts` — existing systems audited and intentionally unchanged.
## ME Memory Read-only UI V1

La vista MEMORY legge esclusivamente la proiezione autenticata di `/api/me-memory`, costruita dal documento server-side ME Model V1. Mostra conteggi semplici, entità e relazioni attive con predicati leggibili, episodi attivi e una lista compatta di conoscenze recenti. Gli ID, le fonti e i valori tecnici non sono esposti.

Le relazioni superseded e le entità archiviate/merged non sono presentate come conoscenza corrente; i riferimenti merged vengono risolti verso l'entità canonica. Il conteggio “conoscenze” è il numero di relazioni attive, “entità” esclude il nodo radice dell'utente, “episodi” conta gli episodi attivi. Gli aggiornamenti recenti sono una proiezione temporale best-effort, non un audit log: il modello attuale non conserva eventi di mutazione distinti.

La schermata è sola lettura, autenticata, senza database o stato persistente parallelo. Non abilita retrieval, prompt injection, ME Summary, modifica o cancellazione.
