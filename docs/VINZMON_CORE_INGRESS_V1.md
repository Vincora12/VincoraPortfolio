# VINZ.MON core ingress V1

## Authority

`vinzmon-state/save` remains the current-form authority. `/api/core-context` is
a runtime projection, not another store. It compiles the existing Mon Voice
DNA/personality using the same `buildVoiceSystemPrompt` as the web body, plus
saved Voice Notes, rating, current mood and bounded relevant personal memory.
Mem0 mode reads Mem0; custom/frozen modes read the existing custom ME projection.
Frozen remains read-only. No stale custom ME facts are mixed into Mem0 mode.

The web client and external ingress consume this projection. A failed canonical
read returns 503 to an external client; it never quietly substitutes a generic
assistant. The web body may explicitly identify its offline/local fallback.
No context dump, prompt, memory text or response is added to runtime telemetry.

## Authenticated endpoints

All use the existing `Authorization: Bearer <VINZMON_TOKEN>` credential. The token
must be entered through the external client's secure configuration, never URLs.

- `POST /api/core-context`: `{ query?, toolsAvailable? }` → `{ context, systemPrompt }`.
- `GET /v1/models`: exposes exactly `vinzmon-core`.
- `POST /v1/chat/completions`: text `messages`, `model: "vinzmon-core"`.
- `POST /v1/responses`: text `input`, `model: "vinzmon-core"`, optional `instructions`.

The ingress delegates to the **existing** `/api/ai` handler in-process, preserving
its authorization, cap check, selected route/default, provider adapter and usage
ledger. It does not expose arbitrary provider/model selection. Memory capture is
scheduled through Netlify `waitUntil` using the existing capture handler, so it
does not block the text response or create a second memory owner.

## Deliberately bounded protocol

- At most 24 messages, 12,000 characters per message, 64,000 characters per request.
- Output 1–4,000 tokens; `n=1` only.
- Text only. Images, audio, files, arbitrary tools, stateful `previous_response_id`,
  stored Responses conversations and structured output formats are rejected.
- Clients supply their bounded conversation history; no second thread database.
- `stream:true` emits valid **buffered SSE**, with `x-vinz-stream-mode: buffered`.
  This is compatibility framing after generation, not live upstream token streaming.
- External tools, server mutation tools and Mac-local capabilities are **not**
  advertised as available. Full external action parity is not claimed by V1.

OpenClicky configuration: base URL `<production>/v1`, model `vinzmon-core`, the
same existing app token. Real OpenClicky behavior still requires a connected
client test; protocol fixtures are not evidence of desktop end-to-end success.

## State synchronization

The existing save now has a revision. GET returns it; PUT requires `baseRevision`.
Writes use Blob ETag compare-and-swap and verified read-back. Stale clients get
409 instead of overwriting newer work. Old unversioned clients can read but must
refresh before writing. Existing save keys/day backups are retained.

The browser stores only a small SHA-256 acknowledgement receipt, not another state
copy. Clean same-day caches may hydrate; divergent unsynced or unknown legacy
copies require an explicit choice. Quota failure keeps the receipt in memory;
after reload the decision is conservative. DEV-future days never auto-rewind.
User-requested reset keeps its existing explicit boundary and requires a known
server revision. A malformed local health cache withholds remote writes rather
than replacing valid remote health records with null.

Validation commands: `node scripts/core-ingress-check.mjs`,
`node scripts/state-sync-check.mjs`. Fixtures validate contracts and concurrency,
not production provider reachability or a real multi-device session.
