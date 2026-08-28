# Mem0 OSS history on Netlify Blobs: compatibility audit

Date: 2026-08-28  
Branch: `claude/project-prototype-jxjc3d`  
Audited commit: `b9c30c5`

Audit only. No Mem0 package, dependency, Blob data, Qdrant resource, or runtime configuration was changed.

## Decision

**C — NOT RECOMMENDED.** Netlify Blobs is a useful VINZ-owned persistence API, but it is not a clean drop-in Mem0 TypeScript history provider. Mem0 OSS currently constructs a history manager through its provider factory and documents SQLite as the history implementation. A Blobs adapter would require a maintained fork/extension of Mem0 internals, while preserving atomic/concurrent semantics that Blobs does not provide as a general compare-and-swap transaction. Use a separately hosted Mem0 process with ordinary writable SQLite for the first Mem0 experiment; keep Netlify Blobs behind VINZ.MON’s outer `MemoryWriter`, not inside Mem0’s private history contract.

## Verified Mem0 behavior

The official OSS Node API is `Memory` from `mem0ai/oss`: [Node quickstart](https://github.com/mem0ai/mem0/blob/main/docs/open-source/node-quickstart.mdx). The current OSS configuration includes `historyStore`; the documented/default provider is SQLite and the OSS overview describes history at `~/.mem0/history.db`: [OSS overview](https://github.com/mem0ai/mem0/blob/main/docs/open-source/overview.mdx).

The current TypeScript source initializes the history manager with `HistoryManagerFactory.create(this.config.historyStore.provider, this.config.historyStore)`, or a dummy manager when `disableHistory` is enabled: [memory/index.ts](https://github.com/mem0ai/mem0/blob/main/mem0-ts/src/oss/src/memory/index.ts). Configuration merging materializes the default history store, and the source exposes SQLite-specific `historyDbPath` configuration: [config/manager.ts](https://github.com/mem0ai/mem0/blob/main/mem0-ts/src/oss/src/config/manager.ts).

The TypeScript OSS README describes SQLite history tracking and an extensible implementation with interfaces, but the reviewed public configuration does not document a Netlify Blob, HTTP, or generic object-store history provider: [mem0-ts OSS README](https://github.com/mem0ai/mem0/blob/main/mem0-ts/src/oss/README.md). The official Qdrant example still supplies `historyDbPath`, demonstrating that configuring Qdrant does not remove history: [Qdrant example](https://github.com/mem0ai/mem0/blob/main/mem0-ts/src/oss/examples/basic.ts).

## What history is for

History is not merely an optional audit display. Mem0’s public operations include add, update, delete, get, search, and history; the history manager records memory-operation changes and supports the update/deduplication workflow. Qdrant stores vector points for retrieval, but it is not the documented source for the complete operation history. `disableHistory` avoids the SQLite manager, but it intentionally removes that history behavior and is not an equivalent durable replacement.

Therefore:

- **Required for full, correct OSS semantics:** a functioning history manager during add/update/delete flows, together with the configured vector store and embedder.
- **Optional:** calling the user-facing `history()` inspection method and any UI audit presentation.
- **Not a substitute:** Qdrant alone. It can persist vectors and payloads, but it does not implement Mem0’s history-manager contract.

## Is there a pluggable adapter point?

There is an internal abstraction boundary: `HistoryManagerFactory` receives a provider name and provider configuration, and the source describes extensible interfaces. This is more than hard-coded SQL, but it is not a documented “pass any object implementing X” public API. A Netlify provider would need to be added to the factory/registry and remain compatible with Mem0’s internal history manager interface for the exact pinned release.

At minimum, an adapter would need the history-manager operations exercised by `Memory`: record memory mutations (create/update/delete and their before/after metadata), retrieve history for a memory, and support the identifiers/filters expected by the manager. It would also need initialization/close behavior and the same error semantics. Exact method names and serialization are release-internal and must be read from the pinned package source; they must not be guessed from the public `Memory` API.

Consequently this is not a small configuration-only change. It is a maintained Mem0 extension (or fork/patch), plus tests against every Mem0 upgrade. The adapter would be roughly one provider implementation and factory registration, but the difficult work is correctness: ordering, retries, idempotency, concurrent updates, and compatibility with schema changes.

## Netlify Blobs fit

VINZ.MON already uses `getStore('vinzmon-state')`, reads JSON key `me-model-v1`, and writes with `setJSON` in `netlify/functions/_shared/meModel.ts`. This is appropriate for a small serverless application document, but it is not evidence of transactional row-level storage.

Blobs can hold immutable-ish JSON objects and can be called from Functions, but a history adapter would need to solve:

- **Concurrent writes:** two invocations reading and rewriting the same key can lose updates without a compare-and-swap/version primitive. A per-memory key reduces contention but does not automatically provide atomic index updates.
- **Atomicity:** a multi-record history operation cannot be assumed atomic across several Blob keys. Partial success needs a journal/retry protocol.
- **Queries/indexes:** listing/filtering many history records is application work; Blobs is not a relational query engine.
- **Latency/cold starts:** each function invocation may pay network latency; a read-modify-write round trip is materially slower than local SQLite.
- **Consistency:** the adapter must verify the current Netlify Blobs consistency and conditional-write guarantees for the deployed plan. The existing code does not implement optimistic concurrency.
- **Size/scaling:** separate objects avoid a giant document, but long-term history still needs listing/index design and cleanup/backup policies.

The smallest plausible data layout would be one object per history event, for example `mem0-history/{userId}/{eventId}`, plus a small per-user index only if Mem0 requires listing. That is a custom persistence design, not a transparent replacement. Do not place all history in one JSON Blob: it recreates the existing full-document contention problem.

## Failure and consistency cases

If Qdrant succeeds and Blob history fails, vector memory may exist without an operation record; if Blob succeeds and Qdrant fails, history may describe a mutation that is not searchable. Mem0’s public OSS API does not document a distributed transaction spanning Qdrant and an arbitrary object store. Two concurrent updates can similarly diverge unless the adapter supplies idempotency keys, conditional writes, retry/reconciliation, and a repair process. Netlify Blobs alone does not provide this cross-system transaction.

## Comparison

### A. Mem0 + custom Netlify Blobs adapter

Pros: one existing serverless storage technology, no separate database bill, VINZ-controlled data.  
Cons: internal Mem0 provider/factory patch; native history contract is release-sensitive; concurrency/atomicity/reconciliation become VINZ code; every Mem0 upgrade requires adapter tests; Qdrant/Blob partial failure remains. This is **high maintenance and medium-to-high correctness risk**.

### B. Separate Mem0 service with persistent SQLite

Pros: follows the documented OSS path, preserves SQLite transaction semantics and history behavior, isolates native module/filesystem concerns from Netlify Functions, and makes Mem0 upgrades testable in one worker.  
Cons: one small always-on/containerized process or durable volume; additional operational cost (potentially the first paid component). Qdrant can remain the remote vector store. This is **lower implementation risk and clearer supportability**.

## Responsibility split

```text
VINZ.MON MemoryWriter (server boundary)
        ↓
Mem0 service/worker
        ├── persistent SQLite history (Mem0 operation state)
        └── Qdrant Cloud (embeddings/vector index)
```

Some duplication between SQLite history and Qdrant payloads is normal: the vector index is optimized for retrieval while history records mutations. Netlify Blobs should remain VINZ-owned application state/export/audit storage only if a later design explicitly needs it; it should not be presented to Mem0 as a transactional history database without the adapter work above.

## Maintenance and cost

Mem0 OSS has no software fee. Qdrant Cloud and LLM/embedder calls remain usage costs. The adapter option appears cheaper on infrastructure but shifts cost into engineering and reliability work. A separate worker adds a small hosting/volume cost (roughly the difference between the existing near-zero setup and a low single-digit-to-tens-of-euros monthly service), but avoids shipping native SQLite into Netlify’s ephemeral function bundle. Exact Qdrant and hosting prices depend on current plans and usage.

## Recommended next step

Run an isolated, no-production-write compatibility spike using one pinned `mem0ai` version and a writable persistent SQLite volume, Qdrant Cloud, and the same Node major version as Netlify. Exercise concurrent add/update/delete/history calls and inspect the actual history-manager source. Only if this proves unacceptable should a Blobs adapter be designed; that adapter must first be a tested Mem0 provider extension, not a change to `meModel.ts`.

## Repository files inspected

- `AGENTS.md`
- `docs/MEMORY_LEGACY_FREEZE_AUDIT.md`
- `docs/MEM0_NETLIFY_QDRANT_AUDIT.md`
- `netlify/functions/_shared/memoryWriter.ts`
- `netlify/functions/_shared/meModel.ts`
- `netlify/functions/me-chat-capture.ts`
- `netlify.toml`
- `package.json`

The current `MemoryWriter` boundary remains the correct future attachment point. No legacy ME Model, Blob data, Memory UI, or chat behavior was changed by this audit.
