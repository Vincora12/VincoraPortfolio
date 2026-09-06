# VINZ.MON Local Core Server

This is the canonical runtime guide. The Mac runs one Node Core Server that serves the built Vite applications, preserves the existing `/api/*` and OpenAI-compatible `/v1/*` contracts, owns the reminder scheduler, and stores canonical records in local SQLite. Netlify, Railway, and Qdrant Cloud are not contacted by this runtime.

## Architecture

```text
iPhone / iPad / laptop (LAN or Tailscale)
                  |
          VINZ.MON Core :8787
          |       |       |
       Vite UI  API routes  reminder scheduler
                  |
          data/vinzmon.sqlite
                  |
       optional local Mem0 OSS :8788 (loopback only)
          |                    |
  mem0-history.sqlite   mem0-vectors.sqlite
```

The existing function modules remain as business-logic modules for compatibility; `server/core-server.ts` hosts them directly. They no longer import or call Netlify Blobs. The storage adapter uses SQLite WAL, synchronous durable commits, and atomic ETag/conditional writes. Browser storage remains a cache under the existing application rules.

## Install and run

Requires Node 22 or newer.

```sh
npm install
cp .env.example .env
# Set VINZMON_TOKEN to a random value of at least 24 characters.
npm run build
npm start
```

Open `http://localhost:8787`. The default port is `8787`; change it with `PORT`. `npm start` is foreground and stops cleanly with Control-C. Development uses `npm run dev`: Vite stays on port 5173 and proxies API calls to the Core Server.

## Commands

| Purpose | Command |
|---|---|
| install | `npm install` |
| development | `npm run dev` |
| production build | `npm run build` |
| start | `npm start` |
| stop | `npm run stop` |
| status | `npm run status` |
| install/start at login | `npm run install:service` |
| remove auto-start | `npm run uninstall:service` |
| backup | `npm run backup` |
| regression tests | `npm test` |

The launchd installer writes `~/Library/LaunchAgents/mon.vinz.core.plist`, uses the current portable repository and Node paths, restarts after failure, and writes service logs under `data/`. It does not copy secrets into the plist; the server reads `.env` from the repository.

## Environment

Required:

- `VINZMON_TOKEN`

Optional external services:

- `VINZMON_SHORTCUT_TOKEN`
- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY`
- `OPENAI_API_KEY`
- `MOONSHOT_API_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

Optional local runtime configuration:

- `PORT` (default `8787`)
- `VINZMON_DATA_DIR` (default `data/`)
- `VINZMON_SCHEDULER_INTERVAL_MS` (default `60000`)
- `VINZMON_MEMORY_WRITER_MODE` (`custom`, `frozen`, or `mem0`; existing default is `custom`)
- `VINZMON_MEMORY_SERVICE_SECRET`
- `MEM0_LLM_PROVIDER`, `MEM0_LLM_MODEL`, `MEM0_LLM_API_KEY`, `MEM0_LLM_BASE_URL`
- `MEM0_EMBEDDER_PROVIDER`, `MEM0_EMBEDDER_MODEL`, `MEM0_EMBEDDER_API_KEY`, `MEM0_EMBEDDER_BASE_URL`, `MEM0_EMBEDDING_DIMS`

When Mem0 mode is selected, `npm start` starts the pinned Mem0 OSS 3.1.7 worker on `127.0.0.1:8788`; it is not exposed to LAN/Tailscale. The service defaults its secret to `VINZMON_TOKEN`, and provider keys to `OPENAI_API_KEY` when the Mem0-specific values are omitted. Both history and vectors are durable local SQLite files. Missing provider configuration stops startup with a readable error; there is no Qdrant fallback.

Obsolete for the local runtime: Netlify Blob/context variables, `URL`, `DEPLOY_URL`, Railway variables, `QDRANT_URL`, `QDRANT_API_KEY`, and `QDRANT_COLLECTION_NAME`.

## Health and networking

`GET /health` returns only `status`, app/version, and non-sensitive storage/memory/scheduler states. The server listens on `0.0.0.0`.

- Mac: `http://localhost:8787`
- LAN: `http://<mac-lan-ip>:8787`
- Tailscale: `http://<mac-tailscale-ip>:8787` or `http://<mac-magicdns-name>:8787`

Install Tailscale on the Mac and client, sign both into the same tailnet, and use the Mac address shown by Tailscale. Do not open router ports. VINZ.MON bearer-token authentication remains required over Tailscale.

## Data, backup, and restore

Canonical application data is `data/vinzmon.sqlite`. Mem0 mode adds `data/mem0-history.sqlite` and `data/mem0-vectors.sqlite`. Data, backups, `.env`, PIDs, and logs are ignored by Git.

`npm run backup` creates `backups/<UTC timestamp>/` and uses SQLite's consistent `VACUUM INTO` snapshot for every database that exists. Secrets are excluded.

Restore:

1. Run `npm run stop` and confirm with `npm run status`.
2. Preserve the current `data/` directory rather than deleting it.
3. Copy the selected backup database files into the configured data directory, keeping the documented filenames.
4. Run `npm start` (or `npm run install:service`) and check `/health` plus representative records.

Never delete or silently replace a database in response to corruption/locking. Preserve it, restore a known backup, or repair a copy.

## Function migration map

| Function | Current path | Dependencies | Local handler | Status |
|---|---|---|---|---|
| agent-lab | `/api/agent-lab` | auth, providers, bounded repo tools | same module via Core | KEEP LOGIC |
| ai | `/api/ai` | auth, routing, providers, spend | same module via Core | KEEP LOGIC |
| assets | `/api/assets` | blob bytes | SQLite BLOB adapter | REPLACE INFRA ONLY |
| brain | `/api/brain` | state blob | SQLite adapter | REPLACE INFRA ONLY |
| calendar | `/api/calendar` | calendar blobs | SQLite adapter | REPLACE INFRA ONLY |
| code-tools | `/api/code-tools` | auth, bounded repo roots | same module via Core | KEEP LOGIC |
| core-context | `/api/core-context` | state + memory boundary | local stores | REPLACE INFRA ONLY |
| evolution-background | `/api/evolution-background` | providers, jobs/assets | Core background promise + SQLite | ADAPT |
| evolution-job | `/api/evolution-job` | jobs/assets | SQLite adapter | REPLACE INFRA ONLY |
| food | `/api/food` | Open Food Facts | same module via Core | KEEP LOGIC |
| ingest | `/api/ingest` | auth, day store | SQLite adapter | REPLACE INFRA ONLY |
| lab-duel-background | `/api/lab-duel-background` | provider, jobs/assets | Core background promise + SQLite | ADAPT |
| lab-duel-job | `/api/lab-duel-job` | jobs/assets | SQLite adapter | REPLACE INFRA ONLY |
| lessons | `/api/lessons` | lessons store | SQLite adapter | REPLACE INFRA ONLY |
| machines | `/api/machines` | machine state, memory, providers | local stores | REPLACE INFRA ONLY |
| me-chat-capture | `/api/me-chat-capture` | memory boundary/providers | local ME or local Mem0 | ADAPT |
| me-memory | `/api/me-memory` | memory boundary | local ME or local Mem0 | ADAPT |
| me-seed | `/api/me-seed` | ME model/providers | SQLite adapter | REPLACE INFRA ONLY |
| ping | `/api/ping` | external providers | same module via Core | KEEP LOGIC |
| projects | `/api/projects` | project blobs/CAS | SQLite adapter/CAS | REPLACE INFRA ONLY |
| push | `/api/push` | Web Push subscriptions | SQLite adapter | REPLACE INFRA ONLY |
| reminder-tick | internal scheduler | Netlify schedule, calendar/push | in-process restart-safe interval | ADAPT |
| runtime-log | `/api/runtime-log` | event blob | SQLite adapter | REPLACE INFRA ONLY |
| setup | `/api/setup` | environment inspection | same module via Core | KEEP LOGIC |
| shortcut | `/api/shortcut` | shortcut auth, queue/providers | SQLite adapter | REPLACE INFRA ONLY |
| shortcut-status | `/api/shortcut-status` | shortcut log | SQLite adapter | REPLACE INFRA ONLY |
| state | `/api/state` | canonical save/CAS/backups | SQLite adapter/CAS | REPLACE INFRA ONLY |
| transcribe | `/api/transcribe` | provider | same module via Core | KEEP LOGIC |
| usage | `/api/usage` | spend ledger | SQLite adapter | REPLACE INFRA ONLY |
| user-data | `/api/user-data` | generic values/CAS | SQLite adapter/CAS | REPLACE INFRA ONLY |
| v1-chat-completions | `/v1/chat/completions` | OpenAI-compatible ingress | same module via Core | KEEP LOGIC |
| v1-models | `/v1/models` | routing/auth | same module via Core | KEEP LOGIC |
| v1-responses | `/v1/responses` | OpenAI-compatible ingress | same module via Core | KEEP LOGIC |
| v2-issues | `/api/v2-issues` | issue store | SQLite adapter | REPLACE INFRA ONLY |

Nothing is deferred. Source paths retain the `netlify/functions` name to avoid a risky business-logic move and to preserve historical deploy compatibility, but the production local process imports them directly and contains no Netlify runtime package.

## Troubleshooting and portability

- Port in use: choose another `PORT`, or stop the process reported by `npm run status`.
- 401: make the browser token match `VINZMON_TOKEN`; the server fails closed when it is absent/short.
- Build missing: run `npm run build` before `npm start`.
- Database locked/corrupt: stop competing VINZ.MON processes; preserve the files and restore from backup. The server never auto-resets data.
- Mem0 will not start: provide the explicit LLM/embedder keys and models, then inspect the readable startup error. Qdrant/Railway configuration is neither needed nor used.
- launchd: inspect `data/service.log` and `data/service-error.log`.

To move the same server later, copy the repository, `.env`, and a stopped/consistent `data/` backup to the new host, install Node 22+, run install/build/start, and change only host/service networking. API contracts and application architecture do not change.
