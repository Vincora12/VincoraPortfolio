# VINZ.MON — Mem0 OSS + Netlify + Qdrant compatibility audit

Date: 2026-08-28  
Branch audited: `claude/project-prototype-jxjc3d`  
Commit audited: `fa6df69`

This is a read-only compatibility audit. No package was installed, no Qdrant resource was created, and no runtime configuration was changed.

## Executive decision

**B — RECOMMENDED WITH EXTRA STORAGE.** Node/TypeScript Mem0 OSS is runtime-compatible with Netlify Functions and its Qdrant vector adapter is documented, but Qdrant alone is not the complete OSS persistence model. Mem0 OSS also uses a local SQLite history store (and some versions/configurations have reported filesystem/history-store bugs). Netlify’s function filesystem is not a durable source of truth. A safe V1 therefore needs one additional durable history component, or a small separately hosted Mem0 worker with writable persistent storage. Do not enable Mem0 directly in production until an isolated version-pinned spike proves history persistence, bundling, and concurrent-request behavior.

## 1. Verified facts from official documentation/source

### Mem0 package and API

- The official TypeScript OSS quickstart installs `mem0ai` and imports `Memory` from `mem0ai/oss`: [Mem0 Node OSS quickstart](https://github.com/mem0ai/mem0/blob/main/docs/open-source/node-quickstart.mdx).
- The quickstart requires Node.js 18 or newer and exposes configurable `llm`, `embedder`, and `vectorStore` components. Its defaults include an OpenAI LLM/embedder, an in-memory vector store, and SQLite history.
- The OSS client is local/self-managed; `MemoryClient`/Platform is a different managed product. The distinction is documented in [OSS Node reference](https://github.com/mem0ai/mem0/blob/main/integrations/mem0-plugin/skills/mem0/client/node.md) and [Platform vs OSS](https://docs.mem0.ai/platform/platform-vs-oss).
- The npm registry reported `mem0ai` latest `3.1.7` and beta `3.0.0-beta.2` on the audit date. This is an observation, not a recommendation to use an unpinned latest version. Pin the exact version after the spike.

### Vector storage and Qdrant

- Mem0’s TypeScript implementation lists Qdrant as a supported vector database and allows vector-store configuration; embedding dimensions must match the configured collection/model dimension: [Mem0 vector DB overview](https://docs.mem0.ai/components/vectordbs/overview).
- Official Mem0 examples configure Qdrant with URL, API key, collection name, and embedding dimensions while also configuring a history path: [Mem0 TypeScript example](https://github.com/mem0ai/mem0/blob/main/mem0-ts/src/oss/examples/basic.ts).
- Qdrant publishes an official TypeScript REST client and Cloud quickstart. A client can be constructed with a Cloud URL and API key: [Qdrant Cloud quickstart](https://qdrant.tech/documentation/cloud/quickstart-cloud/) and [Qdrant authentication](https://qdrant.tech/documentation/cloud/authentication/).
- Qdrant Cloud is therefore a technically suitable remote vector service for a serverless function, provided credentials remain server-side and the selected embedding dimension matches the collection.

### SQLite/history requirement

- Mem0 OSS documentation/source describes SQLite history tracking and a local history database. The OSS overview identifies the default history location as `~/.mem0/history.db`: [Mem0 OSS overview](https://github.com/mem0ai/mem0/blob/main/docs/open-source/overview.mdx).
- The TypeScript source README lists SQLite history tracking as an OSS feature: [mem0-ts OSS README](https://github.com/mem0ai/mem0/blob/main/mem0-ts/src/oss/README.md).
- The official example explicitly supplies `historyDbPath`, which confirms that Qdrant configuration does not eliminate the history-store concern.
- `disableHistory` exists in current OSS configurations/issues, but disabling history is a semantic reduction, not a durable replacement. It should not be assumed equivalent to normal Mem0 behavior.

### Current reported Mem0 implementation risks

These are official repository issue reports, not universal guarantees; they require reproduction against the exact pinned release:

- Node OSS 2.2.3 reports that `historyDbPath` could be ignored and SQLite could open a relative `memory.db`, failing when the working directory is not writable: [issue #4096](https://github.com/mem0ai/mem0/issues/4096).
- A configuration-precedence workaround using an explicit SQLite history-store config was reported: [issue #4080](https://github.com/mem0ai/mem0/issues/4080).
- A later report mentions ignored history paths and an in-memory vector store creating a local DB; `disableHistory` was suggested as a workaround: [issue #4290](https://github.com/mem0ai/mem0/issues/4290).
- Native `better-sqlite3` bundling/history-path problems have been reported in self-hosted/server deployments: [issue #4950](https://github.com/mem0ai/mem0/issues/4950).
- Qdrant Cloud use through the TS adapter in a serverless deployment has had an “Illegal host” report even though direct Qdrant client use worked; the issue is closed/linked to a later fix, so exact-version testing remains necessary: [issue #3915](https://github.com/mem0ai/mem0/issues/3915).

## 2. Repository observations

The audited repository is a Vite/React app deployed with Netlify Functions. `netlify.toml` uses `netlify/functions`, esbuild bundling, Node 22, and `dist` publishing. Node 22 satisfies Mem0’s documented Node 18+ prerequisite.

Current relevant files and behavior:

- `netlify/functions/_shared/memoryWriter.ts` defines the provider-neutral `MemoryWriterMode = 'custom' | 'frozen'`; default mode is `custom`, and custom delegates to `captureChatMemory`.
- `netlify/functions/me-chat-capture.ts` is the authenticated chat capture entrypoint. It currently reaches the existing custom extraction/reconciliation writer through `MemoryWriter`; it is not Mem0-enabled.
- `netlify/functions/_shared/meModel.ts` persists the current ME Model as one Netlify Blob document in store `vinzmon-state`, key `me-model-v1`.
- `netlify/functions/_shared/meChatMemory.ts`, `entityResolver.ts`, and `meSeed.ts` are the existing custom semantic-memory/extraction stack. They are not replaced by this audit.
- `package.json` contains no `mem0ai`, `@qdrant/js-client-rest`, `better-sqlite3`, `sqlite3`, or equivalent Mem0/Qdrant dependency today.
- The existing router exposes `text-cheap` and LAB-selected model routing. Mem0 would not automatically call VINZ.MON’s `resolveRoute`/`callProvider`; it has its own LLM/embedder configuration boundary.
- `docs/MEMORY_LEGACY_FREEZE_AUDIT.md` and `memoryWriter.ts` already provide the intended attachment point for a future `mem0` writer mode. This audit does not activate it.

## 3. Answers to the compatibility questions

### 3.1 Can official Mem0 OSS TypeScript run in Netlify Functions?

**The JavaScript portion can run in principle.** Netlify’s Node 22 runtime exceeds the Node 18+ prerequisite, and Qdrant access is ordinary outbound HTTPS. **A default, untested deployment is not safe**, because the full OSS behavior also touches local SQLite/native history persistence, while a function filesystem is ephemeral/non-authoritative and native SQLite bundling has reported serverless issues.

### 3.2 Which package/API/version?

Use the official `mem0ai` package and `Memory` from `mem0ai/oss`, not the managed Platform client. Pin a tested version (the registry currently reports 3.1.7; this must be rechecked immediately before implementation). Do not use a floating range in production.

### 3.3 Does it require SQLite/history here?

Normal OSS configuration includes SQLite history. Qdrant is the vector store, not a documented replacement for the history store. History supports Mem0’s update/audit behavior, so silently relying on an ephemeral local file is not correct for durable memory.

### 3.4 Can Qdrant alone be durable?

**Not for the complete documented OSS configuration.** Qdrant can be the durable vector index, but Qdrant alone does not satisfy Mem0’s SQLite history responsibility. A configuration with history disabled may avoid local writes, but it changes behavior and must be treated as a deliberate reduced mode, not as proof that Qdrant replaces history.

### 3.5 Can history be serverless-safe?

Only with an additional durable component or an explicitly supported remote history adapter. The reviewed official TS materials are SQLite-oriented; they do not establish a drop-in Netlify Blob/Postgres history adapter. The smallest safe choices are (a) a separately hosted Mem0 worker with writable persistent SQLite plus Qdrant, or (b) a durable SQLite-compatible/relational history service plus a tested adapter. The latter may require adapter work and is not yet verified for the TS package.

### 3.6 Qdrant Cloud/serverless limitations

Qdrant Cloud’s HTTPS API and official TypeScript client fit serverless execution. Keep a client/configuration outside user-visible bundles and use server-side API keys. Cold starts mean client construction and TLS setup can recur; module-scope reuse is an optimization, not a correctness guarantee. Functions can run concurrently, so updates must be idempotent and the Mem0 history/vector operations must be tested for races. The reported Mem0 “Illegal host” and Qdrant adapter issues make exact URL normalization and package pinning part of the spike.

## 4. Model stack and VINZ router compatibility

Mem0 OSS needs:

1. an LLM for memory judgment/fact extraction and update decisions;
2. an embedding model/provider for vector indexing and search;
3. optionally a reranker/graph component, depending on enabled features. A reranker is not required for a basic add/search configuration.

VINZ.MON’s current `text-cheap` route can conceptually choose Luna/OpenAI, but Mem0 does not consume `resolveRoute('text-cheap')` automatically. The minimum safe integration is an adapter that obtains the selected `memory` route and maps its provider/model/API base URL/credentials into Mem0’s LLM config, plus a separately configured embedder. Do not let Mem0 fall back to its OpenAI defaults: that could silently select a different model and provider. The embedder must be explicit and dimension-compatible with Qdrant. This mapping is an implementation task, not part of this audit.

## 5. Security and privacy

- Required secrets are the LLM API key, embedder API key (if separate), Qdrant endpoint, and Qdrant database API key. Mem0 OSS itself does not require a Mem0 Platform key.
- All of these secrets must remain in Netlify/server-side environment variables or the isolated worker. Never return them in Trace or client configuration.
- User text/context is sent to the configured LLM for extraction; text or derived payloads/embeddings are sent to the embedder and Qdrant according to the adapter. Sensitive health and relationship data therefore leaves VINZ.MON unless providers are self-hosted.
- TLS protects transit; provider encryption, retention, residency, backups, deletion, and admin access depend on the selected LLM/embedder/Qdrant plans. Review those policies before importing sensitive historical data.
- Use a stable user namespace/filter (even for one user) and ensure Qdrant payloads cannot cross that boundary. Plan export and deletion at the VINZ.MON API boundary rather than depending on a vendor dashboard.

## 6. Cost for one heavy user

Mem0 OSS has no software license fee (Apache 2.0); Qdrant and provider usage are the cost drivers. A realistic V1 can remain **approximately €0 to <€10/month for infrastructure** when a Qdrant free tier and existing provider accounts cover low/moderate volume, but free-tier limits and current pricing must be checked before launch. LLM extraction and embeddings are usage-based and can exceed infrastructure cost; a reranker adds another model cost. A durable history component/worker adds hosting cost and is the incremental item missing from “Netlify + Qdrant only.” Paid Qdrant capacity, a worker, or high-volume embeddings can move the total into €10–30+/month. These are qualitative tiers, not a quote.

## 7. Recommended V1 architecture

**Decision B:** keep the existing provider-neutral `MemoryWriter` boundary and add no production Mem0 writer yet. Run a version-pinned compatibility spike with:

```text
/api/me-chat-capture
        ↓
   MemoryWriter
        ↓
  Mem0 adapter (isolated)
        ├── explicit VINZ memory LLM route
        ├── explicit embedder + matching dimensions
        ├── Qdrant Cloud (durable vectors)
        └── durable history component (required for full OSS semantics)
```

The additional component should be the smallest operationally reliable history store. Given the current evidence, a tiny separately hosted Mem0 worker with persistent writable SQLite is lower-risk than pretending Netlify’s ephemeral filesystem is durable. If a tested remote history adapter becomes available, it can replace the worker without changing the MemoryWriter contract.

## 8. What remains VINZ.MON-owned

Mem0 may provide extraction/update mechanics and indexes, but VINZ.MON should retain the `MemoryWriter` boundary, user/tenant identity, ME synthesis, Memory UI, Trace, provenance/export policy, and integration semantics for Chat/Narrator/ME. Mem0 must not become the public meaning of ME or the only copy of personal knowledge.

## 9. Smallest next implementation task

Create a **non-production compatibility spike** (separate script/test, no live ME writes) that pins one `mem0ai` version, configures Qdrant Cloud and explicit LLM/embedder adapters, exercises add/update/search from a Netlify-like Node 22 bundle, and verifies where history is written under a writable/readonly filesystem and under two concurrent calls. Record whether history can be redirected durably. Only after this passes should a `mem0` `MemoryWriter` mode be considered.

## 10. Sources and evidence index

Primary Mem0 sources: [Node OSS quickstart](https://github.com/mem0ai/mem0/blob/main/docs/open-source/node-quickstart.mdx), [OSS overview](https://github.com/mem0ai/mem0/blob/main/docs/open-source/overview.mdx), [Node reference](https://github.com/mem0ai/mem0/blob/main/integrations/mem0-plugin/skills/mem0/client/node.md), [vector DB overview](https://docs.mem0.ai/components/vectordbs/overview), [LLM configuration](https://github.com/mem0ai/mem0/blob/main/docs/components/llms/config.mdx), [TypeScript example](https://github.com/mem0ai/mem0/blob/main/mem0-ts/src/oss/examples/basic.ts), [Platform vs OSS](https://docs.mem0.ai/platform/platform-vs-oss).

Primary Qdrant sources: [Cloud quickstart](https://qdrant.tech/documentation/cloud/quickstart-cloud/), [Cloud authentication](https://qdrant.tech/documentation/cloud/authentication/), [Cloud API](https://qdrant.tech/documentation/cloud-api/).

Reported implementation evidence: [Mem0 #4096](https://github.com/mem0ai/mem0/issues/4096), [#4080](https://github.com/mem0ai/mem0/issues/4080), [#4290](https://github.com/mem0ai/mem0/issues/4290), [#4950](https://github.com/mem0ai/mem0/issues/4950), [#3915](https://github.com/mem0ai/mem0/issues/3915). These reports are explicitly treated as version-sensitive evidence requiring reproduction.
