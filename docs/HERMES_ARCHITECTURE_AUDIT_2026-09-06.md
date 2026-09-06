# Hermes Agent architecture audit — 2026-09-06

**Sources accessed:** official Nous Research repository, release page and documentation on 2026-09-06. Current release identified as **v0.21.0**, released 2026-08-31, commit `29112be`; license MIT. Primary sources: [repository](https://github.com/NousResearch/hermes-agent), [release](https://github.com/NousResearch/hermes-agent/releases), [architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture), [provider runtime](https://hermes-agent.nousresearch.com/docs/developer-guide/provider-runtime), [programmatic integration](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration), [memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory), [MCP](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp), [quickstart](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/getting-started/quickstart.md).

## What Hermes provides

Hermes has one `AIAgent` core behind CLI, gateway, cron, ACP/API surfaces and desktop. Its loop includes prompt assembly, provider resolution, tool dispatch, retries/fallback, callbacks, compression and persistence. It advertises 70+ tools across roughly 28 toolsets, MCP local/remote integration, on-demand and self-improving skills, persistent SQLite/FTS5 sessions, cron, subagents, programmatic APIs, approvals and multiple terminal backends (local, Docker, SSH, Daytona, Singularity, Modal and Vercel Sandbox). The gateway is a long-lived multi-client process.

## Collision with VINZ.MON

Hermes enables built-in memory by default (`MEMORY.md` and `USER.md` under `~/.hermes/memories/`), owns session history in `~/.hermes/state.db`, and uses `SOUL.md`/profiles for persona. Official configuration can disable built-in memory and user profile, but external memory providers and Hermes session persistence are still independent concerns. Therefore direct embedding creates **HIGH collision risk / BLOCKER** unless VINZ.MON remains authoritative and Hermes is isolated with memory/profile/session persistence disabled or treated as disposable.

## Deployment reality

Hermes is a Python 3.11/uv application with filesystem-backed state and a persistent gateway. This does not map directly to the current Vite + Netlify Functions architecture. A real Hermes runtime would require a separately hosted process/container/VPS or equivalent, network auth, lifecycle monitoring, filesystem/SQLite backup and an explicit adapter. “Serverless-capable terminal backends” do not make the core Netlify-function-native.

## Comparison with the whole product

| Area | Hermes value | VINZ.MON decision |
|---|---|---|
| Agent loop/tool execution | Solves most lower-runtime infrastructure | port patterns first |
| MCP/tool registry | Strong reusable pattern | study/adapter later |
| Skills/procedural learning | Strong pattern | keep VINZ ownership of meaning |
| Provider routing/fallback | Infrastructure and reference | retain VINZ routing/cost authority |
| Sessions/search | Conflicts with canonical VINZ chat | do not make canonical |
| Memory/profile | Conflicts directly | disable/isolate |
| Gateway/multi-client | Solves transport plumbing | useful only with separate service |
| Cron/background | Mature pattern | defer until VINZ scheduler boundary exists |
| Identity/Mon/lore/World/ME | irrelevant or conflicting | custom VINZ systems |
| Visual pipeline | irrelevant | preserve exactly |
| Netlify fit | poor for core runtime | do not rebase |

## Four options (0–10 qualitative)

| Option | Fit | Migration | Memory risk | Deployment fit | Reversibility | Verdict |
|---|---:|---:|---:|---:|---:|---|
| A Keep custom | 9 | 10 | 10 | 9 | 10 | safe, slower lower-runtime work |
| B Port patterns | 9 | 8 | 9 | 10 | 9 | **recommended** |
| C Hermes as runtime | 6 | 4 | 3 | 2 | 5 | possible only as isolated service |
| D Rebase on Hermes | 2 | 1 | 1 | 1 | 1 | reject |

Expanded scorecard (0–10; higher is better except migration complexity/risk rows):

| Criterion | A Custom | B Patterns | C Runtime | D Rebase |
|---|---:|---:|---:|---:|
| Architectural fit | 9 | 9 | 6 | 2 |
| Migration simplicity | 10 | 8 | 4 | 1 |
| Memory safety | 10 | 9 | 3 | 1 |
| Identity safety | 10 | 9 | 3 | 1 |
| Deployment fit | 9 | 10 | 2 | 1 |
| Netlify fit | 9 | 10 | 2 | 1 |
| Multi-client fit | 5 | 7 | 8 | 6 |
| Security/control | 8 | 8 | 6 | 4 |
| Maintenance | 8 | 8 | 5 | 3 |
| Upgrade risk | 9 | 8 | 4 | 2 |
| Development velocity | 6 | 8 | 7 | 5 |
| Product work saved | 3 | 6 | 7 | 8 |
| Reversibility | 10 | 9 | 5 | 1 |
| Six-month outcome | 7 | 9 | 6 | 3 |
| Two-year outcome | 8 | 9 | 6 | 2 |

The apparent product-work advantage of D is illusory: it saves lower-runtime code while forcing a rewrite of VINZ-specific identity, lore, World, ME, memory and visual boundaries.

## Red-team and reconciliation

Moving to Hermes would import a second identity, memory, profile and session owner, add a persistent service and high upgrade surface, and risk generic assumptions replacing VINZ semantics. Not studying it would waste proven patterns for tool registries, bounded context, MCP, fallback, approvals, session lineage and gateway protocols. The coherent answer is **B — port Hermes patterns**, with VINZ owning identity, memory, World, policy and canonical state. Confidence: **88%**.

## Break-even and reversible POC

Infrastructure work saved is LOW–REALISTIC when porting patterns, HIGH only if VINZ accepts a separate Hermes service. Total VINZ product work saved is LOW because Hermes does not implement VINZ identity, lore, ME semantics, World autonomy, Heritage, Wish or visual generation. If uncertainty later exceeds ~20%, run one disposable POC: isolated Hermes profile/container, memory/profile disabled, one synthetic tool and bounded VINZ context, no production data or canonical persistence. Success means one streamed tool run with no Hermes-owned data entering VINZ; failure means implicit ownership or unstable service lifecycle.
