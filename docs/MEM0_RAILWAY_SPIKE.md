# VINZ.MON Mem0 Railway spike

## Architecture

This isolated service runs Mem0 OSS in a Node 22 container on Railway. Mem0 owns memory operations, SQLite owns its history, and Qdrant Cloud is the remote vector store. It is not connected to VINZ.MON chat, ME UI, legacy MemoryWriter, or Netlify functions.

Mem0 version is pinned to **3.1.7** (`mem0ai`). The service imports `Memory` from `mem0ai/oss` and configures the documented SQLite history store explicitly.

```text
future VINZ.MON Memory API → Railway Mem0 → SQLite /data + Qdrant Cloud
```

## Railway configuration

### Railway Setup

Set the Railway service **Root Directory** to `services/mem0` (the included Dockerfile is also deployable from that directory). Add a persistent volume mounted at `/data`, then configure only these environment-variable names in Railway:

`VINZMON_MEMORY_SERVICE_SECRET`, `QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION_NAME`, `MEM0_LLM_PROVIDER`, `MEM0_LLM_MODEL`, `MEM0_LLM_API_KEY`, `MEM0_EMBEDDER_PROVIDER`, `MEM0_EMBEDDER_MODEL`, `MEM0_EMBEDDER_API_KEY`, `MEM0_EMBEDDING_DIMS`, `MEM0_HISTORY_DB_PATH`, `PORT`.

Set `MEM0_HISTORY_DB_PATH` to the mounted `/data` path. Generate a Railway public domain, configure the health check as `GET /health`, and deploy. The health response is deliberately non-sensitive and reports `status`, `mem0`, `qdrant`, and the pinned version only. No Netlify deploy is involved.

After deployment, run `npm run spike` from this directory with `MEMORY_SERVICE_URL` and `VINZMON_MEMORY_SERVICE_SECRET` set locally. For the volume test, run `npm run spike:persistence:create`, restart/redeploy the Railway service without deleting `/data`, then run `npm run spike:persistence:verify` with the same `MEMORY_SPIKE_USER` and `MEMORY_PERSISTENCE_MARKER`. A successful verify is required before calling the spike PASS.

Attach a Railway persistent volume mounted at `/data`. The history database must be `/data/mem0-history.db`; the service rejects another path so an accidental ephemeral database is not used.

Required environment variable names (values are never committed here):

- `VINZMON_MEMORY_SERVICE_SECRET`
- `QDRANT_URL`
- `QDRANT_API_KEY`
- `QDRANT_COLLECTION_NAME`
- `MEM0_LLM_PROVIDER`
- `MEM0_LLM_MODEL`
- `MEM0_LLM_API_KEY`
- `MEM0_EMBEDDER_PROVIDER`
- `MEM0_EMBEDDER_MODEL`
- `MEM0_EMBEDDER_API_KEY`
- `MEM0_EMBEDDING_DIMS`
- `MEM0_HISTORY_DB_PATH` (set to `/data/mem0-history.db`)
- `PORT` (Railway supplies this)

The container binds `0.0.0.0`, exposes the Railway `PORT`, and does not create a local Qdrant instance. Collection creation/destruction is left to Qdrant configuration and is never performed automatically by this service.

Build/deploy from the repository service directory:

```sh
cd services/mem0
npm install
npm run build
npm test
```

In Railway, configure the service root to `services/mem0` (or deploy with the included `Dockerfile`), attach the `/data` volume, set the variables above, and use `GET /health` as the healthcheck.

## Endpoints

Every endpoint except health requires `Authorization: Bearer $VINZMON_MEMORY_SERVICE_SECRET`. Every memory operation requires a non-empty `userId`; the value is passed to Mem0 as the scope.

- `GET /health`
- `POST /memory/add` body `{ "userId": "...", "text"|"messages": ..., "metadata"?: {...}, "infer"?: true }`
- `POST /memory/search` body `{ "userId": "...", "query": "...", "limit"?: number }`
- `GET /memory/list?userId=...`
- `POST /memory/update` body `{ "userId": "...", "memoryId": "...", "text": "..." }`
- `POST /memory/delete` body `{ "userId": "...", "memoryId": "..." }`
- `GET`/`POST /memory/history` with the corresponding `userId` and optional `memoryId`

The endpoint is intentionally a thin wrapper over Mem0 and does not create Entities/Relations/Episodes or copy the legacy ME document.

## Persistence smoke test

1. Set all required variables and mount a Railway volume at `/data`.
2. Add a memory for user A with the authenticated `/memory/add` endpoint.
3. Search it with `/memory/search`; list it with `/memory/list`.
4. Restart/redeploy the Railway service without removing the volume.
5. Search again. The memory must still be returned.
6. Repeat the same calls with user B and verify user B cannot retrieve user A’s scoped result.

The service-level tests verify missing configuration is rejected and non-`/data` history paths fail. They do not pretend to prove a live Qdrant/volume deployment; the restart test above is required for that proof.

## Limitations and version-sensitive findings

- This is a spike, not a production Memory API. There is no rate limiting, user-management UI, export, migration, or distributed transaction between SQLite and Qdrant.
- Mem0 OSS uses native SQLite history; the Railway volume is therefore mandatory. Do not run this container without the volume.
- Mem0 configuration/history behavior has been version-sensitive. Pinning 3.1.7 and explicit `historyStore.config.historyDbPath` is intentional; rerun the smoke test on upgrades.
- Qdrant credentials and model keys are server-only. Mem0 sends memory text to the configured LLM/embedder and stores vector data remotely in Qdrant.
- Update/delete/history method signatures are delegated to the installed Mem0 version. Validate them against the exact deployed package before exposing the service to Netlify.
