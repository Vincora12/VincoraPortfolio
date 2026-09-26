# VINZ.MON V2 — Hermes orchestration migration

Date: 2026-09-13  
Runtime: Hermes Agent v0.21.2 (`f364c19`)  
Status: active in the local V2 development runtime

## Result

Hermes is now the generic agentic core behind normal conversations inside a VINZ.MON Project. It owns model execution, the agent loop, tool choice, session recall, durable agent memory and procedural skills. VINZ.MON remains the product: it owns the UI, Project identity and workspace selection, canonical structured data, ME/Sync, Mon evolution, lore, narrator, action confirmation and audit boundaries.

This is a deliberate product/runtime boundary, not two competing agents. VINZ.MON asks Hermes to reason and act; Hermes reaches VINZ-owned state only through explicit authenticated tools.

## What is connected

| Capability | Current owner | Status |
|---|---|---|
| Normal Project conversation | Hermes | Active |
| Agent loop and file/tool execution | Hermes | Active |
| Selected VINZ model/provider | Hermes per run | Active |
| Agent memory and user profile | Hermes | Active |
| Session search/recall | Hermes | Active |
| Hermes built-in skills | Hermes | Active |
| Existing VINZ skill directory | Hermes external skill source | Active, read-only under the runtime sandbox |
| Read canonical ME state | VINZ MCP tool used by Hermes | Active |
| Register meal/workout/weight | VINZ MCP tools used by Hermes | Active after one explicit confirmation |
| Apply ME change and Sync | Existing VINZ shortcut/state path | Active; no duplicate datastore |
| Images | Local OCR, then Hermes | Active |
| XLSX | Saved to Project workspace and extracted locally, then Hermes | Active without blocking the attachment UI |
| Streaming text and individual tool steps | Hermes events projected into VINZ UI | Active; user-visible narration is Italian |
| Cancellation | VINZ forwards stop to Hermes | Active |
| Existing Google/Obsidian/iCloud/custom browser connectors | Existing VINZ browser tools | Preserved on the legacy product-tool path |
| Reminders, automations, other structured ME/UI actions | Existing VINZ product tools | Preserved until dedicated Hermes adapters exist |

The running profile exposes Hermes toolsets for terminal, files, memory, session search, skills, connections and `vinzmon`. Hermes-native `connections` is enabled, but no Hermes-native connector account is currently configured. VINZ.MON therefore does not pretend those external accounts are available to Hermes: requests for the already-working browser-bound connectors continue through their existing VINZ path.

## VINZ.MON tool bridge

Hermes loads a local stdio MCP server that exposes four tools:

- `mcp__vinzmon__vinz_leggi_me`
- `mcp__vinzmon__vinz_registra_pasto`
- `mcp__vinzmon__vinz_registra_allenamento`
- `mcp__vinzmon__vinz_registra_peso`

The bridge calls Local Core over loopback with the existing VINZ bearer token. It does not access browser storage directly.

Writes are fail-closed. The browser recognizes a proposed health action and asks the existing exact confirmation question. On the following affirmative turn, Local Core independently verifies the current answer, the prior assistant question and the structured action hint. It then issues a five-minute, one-use permit tied to that run and action. The matching MCP tool consumes the permit; a missing, expired, wrong or repeated permit is rejected. A successful tool call enters the existing shortcut queue, and the browser drains that queue through the existing ME/Sync functions.

## Models

The model selected in the VINZ.MON UI is passed to Hermes on every run. The adapter maps the configured OpenAI, Anthropic, xAI and Moonshot choices to their Hermes providers and supports the configured local Ollama choices. The configured cloud-cost ledger is updated from Hermes usage events. An invalid or unconfigured selection fails instead of silently choosing another model.

The local profile default remains `gpt-oss:20b`; it is only the fallback when no valid per-run selection is sent. A real end-to-end local run took about 32 seconds before completion, confirming that the observed delay is primarily local-model inference and agent startup rather than missing browser streaming. For daily work, a cloud model selected in the UI is the practical default; small local models remain appropriate for simple, low-risk jobs.

## Skills and memory

Hermes memory, user-profile memory, session search and skills are enabled. The live loader found 67 effective skills after combining the installed Hermes set with VINZ's external skill directory and resolving one duplicate. VINZ's original skill files were not copied, changed or deleted.

Hermes memory is the agent's learning and recall layer. Canonical product facts that drive ME, Sync, Project records, Mon state or other deterministic UI behavior remain in VINZ.MON. This avoids two writable sources of truth while still letting Hermes learn about Vincenzo and about successful procedures.

Hermes v0.21.2 currently has an upstream error in its standalone `/v1/skills` listing endpoint (`include_editorial` argument mismatch). This does not disable the agent's skill toolset or loader; the runtime loaded and exposed skills successfully. It should be rechecked when upgrading Hermes.

## Safety and isolation

- Hermes accepts API traffic only on loopback and requires its own bearer key.
- VINZ accepts MCP bridge calls only with the VINZ token.
- Project identity and workspace paths are resolved again on the server; client paths are not trusted.
- Hermes is confined to the authorized FFuoco workspace by the active macOS sandbox and `HERMES_WRITE_SAFE_ROOT`.
- V1 skill files are readable but not writable by the Hermes sandbox.
- Dependency installation, deployment, service restart, Git-history changes and writes outside the workspace are denied.
- Structured writes require VINZ's one-shot confirmation permit.
- If Hermes is disabled or the Project workspace does not match, the existing runtime remains available.

## Files introduced or extended

| File | Purpose |
|---|---|
| `netlify/functions/_shared/v2/hermesAdapter.ts` | Hermes Runs API boundary, session/model propagation, Italian instructions, event translation and cancellation |
| `netlify/functions/runs.ts` | Authenticated Project ingress, canonical context/workspace selection, provider mapping and confirmation permits |
| `netlify/functions/_shared/v2/hermesActionPermit.ts` | Expiring one-use authorization for a single structured write |
| `netlify/functions/hermes-tools.ts` | Authenticated canonical ME read/write endpoints |
| `netlify/functions/shortcut.ts` | Reuses the existing queued ME action path |
| `scripts/hermes-vinz-mcp-server.mjs` | Dependency-free MCP stdio bridge loaded by Hermes |
| `scripts/hermes-vinz-mcp-check.mjs` | MCP discovery, read and rejected-unconfirmed-write acceptance check |
| `src/assistant-original/hermes-project-runtime.ts` | Browser-side Hermes stream client |
| `src/assistant-original/netlify-runtime.ts` | Routes Project conversation, attachments and confirmed health actions; projects Hermes activity into the current UI |
| `src/assistant-original/image-attachment.ts` | Makes XLSX workspace persistence non-blocking |
| `server/core-server.ts` | Registers the bridge endpoint and propagates cancellation |
| `docs/hermes-vinzmon-profile.example.yaml` | Reproducible dedicated Hermes profile |

## Validation evidence

| Check | Result |
|---|---|
| Browser TypeScript | PASS |
| Functions TypeScript | PASS |
| Production build | PASS |
| Hermes adapter boundary check | PASS |
| MCP initialize and four-tool discovery | PASS |
| Canonical ME read with the real token | PASS |
| Unconfirmed write rejection | PASS |
| End-to-end V2 `/api/runs` → live Hermes stream | PASS (`HERMES_OK`) |
| Hermes detailed health | PASS |
| Active runs after test | 0 |

The end-to-end acceptance used a non-writing instruction. It observed the VINZ SSE lifecycle and final Hermes answer through the same server route used by the V2 chat.

## Remaining migration boundary

Hermes is the heart of reasoning and generic execution now; it is not yet the direct caller of every old browser connector. Moving those connectors requires explicit authenticated adapters for Google Calendar/Drive/Gmail, Obsidian, iCloud and custom connectors, plus equivalent confirmation and audit behavior for reminders, automations, diet/workout plans, UI changes and service operations. Until each adapter proves parity, routing those intents through the working VINZ product tools is safer than removing them or exposing browser credentials to Hermes.

The code to stop investing in is the generic model/tool orchestration inside VINZ's legacy browser loop and generic V2 run engine. Keep it only as a compatibility path while adapters are migrated. Do not rebuild Hermes memory, session management, skill loading, provider routing, retries, continuation or generic agent execution inside VINZ.MON.
