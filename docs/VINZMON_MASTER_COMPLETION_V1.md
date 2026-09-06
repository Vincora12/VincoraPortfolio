# VINZ.MON — Master Completion integration record

## Baselines and reconciliation

Local work began at 267768997723c46c1d021add3b8e69c77faba9b1 and was committed
as 39307c33b5f07d555bf5c97804acfb8c427b6592. The first push was rejected:
the remote branch had advanced to 2e5a9a6. The integration preserves that
newer branch's chat ownership gates, remote-history merge/CAS, central memory
boundary, Journey/RISE, Agent.lab, code tools and existing OpenAI ingress.
No force push. The four preflight documents are historical, not current truth.

## Authority and delivered V1

- Existing vinzmon-state/save remains the state owner. Revision+ETag+readback
  reject stale writes. Same-day freshness uses a small acknowledgement hash;
  unknown divergent legacy copies require an explicit choice. DEV future days
  never auto-rewind. Explicit reset keeps its pre-reset backup.
- Existing user-data chat history uses its deterministic remote merge, not a
  second conflict-resolution model. Per-key write queues preserve order; full
  browser cache cannot stop authenticated writes. Unconfirmed values remain
  in memory with retry UI. Offline reload cannot recover data which never reached
  either server or browser: this limitation is visible, not a durability promise.
- Existing assistant-ui gates and single run owner stay in place. Native composer
  first-user submission releases the same promotion barrier as the send button;
  it no longer waits for a response. Empty sessions stay ephemeral. Handoff preserves
  attachments, first message and existing history. Existing remote merge protects
  delayed snapshot writes.
- Runtime-only core-context compiles the same current Mon/Voice/mood/notes and
  bounded memory through existing core/memory for web direct/tool chat and external
  ingress. No second memory owner or persistent prompt/context store.
- One bounded tool loop with async results, available-tool enforcement, same-call
  dedupe, truthful failure, four normal/six audit rounds, final tool-free answer.
  Aggregate UTF-8 budget preserves short action receipts. Code inspection/export
  remain the existing toolLayer; project tools access only selected project data.
- Per-thread AUTO/model and frozen project scope live in the existing drawer.
  Conversation tabs reuse the current visual language. Enter/newline/IME behavior,
  real tool activity and buffered-reply reveal are bounded.
- ME: OGGI / CALENDARIO / MEMORY; historical records use the same checklist.
  Daily Energy is deterministic. BMR/TDEE requires explicit real inputs; unknown
  exercise energy is not silently zero. Planned events are separate from completed
  health. Memory is a read-only searchable projection with provenance when supplied.
- Bounded private Projects: instructions/text sources and Page-shaped artifacts.
  Stable authenticated artifact URL, versioned update and real TXT/MD download;
  independent of main app deployments. No arbitrary hosted executable site engine.
- Calendar reminders reuse existing push, with due claims and bounded scheduled
  attempts. Accepted push is not proof of device delivery. Missing push is visible.
- Bio adds nonphysical cultural taste/attitude only; visual generator, RNG, assets
  and routing are unchanged by this completion. Historic Bio is not rewritten.
- Existing remote Journey/RISE implementation remains canonical: TUNE same World,
  RISE new World with archived predecessor. No duplicate World transition helper.

## Explicitly not claimed

Baby/Breed/new game taxonomy, workers/skills marketplace, general approval queue,
NPC/quest simulation and autonomous recurring workflows are deferred. No fake
connector support. OpenClicky actual desktop behavior requires that client;
server contract tests alone are not external-client end-to-end verification.
Direct personal-memory correction/deletion UX remains limited by existing APIs.
Server user-data deletion/legacy nonchat settings retain their prior semantics;
this integration does not claim tombstones or revision protection for every key.

## Validation

Integrated typechecks (client/functions), build and diff check pass.
Synthetic I/O tests pass for lifecycle, remote chat merge/CAS, cache quota/retry,
state CAS/reset, tool-loop, aggregate results/export, health intent/energy,
calendar, projects, reminders, core identity ingress and seeded nonvisual Bio.
Real Chrome with synthetic API records verifies first message/one response,
history/reload/new chat/mounted navigation/IME/quota, mobile and desktop;
ME verifies planned create/edit/cancel, same-day energy, memory search and overflow.
These are NOT production data tests.

Production authenticated gauntlet is pending a usable session. Netlify env:get's
resolved token was rejected (401); no credential was changed, no auth guard relaxed.
Anonymous availability, deployment revision and authenticated actions must be
reported separately. See subsequent execution evidence before calling completion.
