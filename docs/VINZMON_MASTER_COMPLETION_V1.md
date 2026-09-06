# VINZ.MON — bounded production V1 completion

Baseline: `267768997723c46c1d021add3b8e69c77faba9b1`, branch
`claude/project-prototype-jxjc3d`. No later divergent implementation was found.
The four 2026-09-06 preflight documents remain historical evidence, not updated runtime truth.

## Implemented authority boundaries

- Existing `vinzmon-state/save` owns current form, progression, World and the
  synchronized HealthJournal snapshot. Revision/ETag conditional writes reject
  stale copies. The browser retains unacknowledged changes; explicit conflict
  choice replaces only the selected copy. There is no heuristic merge.
- Existing `vinzmon-user-data` owns chat repositories/index and server-backed
  settings. Per-key queues plus ETag receipts protect concurrent writes. Local
  cache quota cannot interrupt canonical writes or the running authenticated session.
  Old unversioned bundles must refresh before writing. Tombstones prevent stale
  cache resurrection after explicit deletion.
- Assistant-ui remains the sole chat runtime. Its actual first-user repository
  (including attachments and greeting) is saved before metadata publication and
  initialize resolution. No synthetic user message, repository reimport,
  second startRun or delayed stale snapshot. Empty chats remain ephemeral.
- `/api/core-context` is a runtime-only projection of those existing owners,
  current Voice/Persona and bounded memory. Web direct/tool chat and the new
  external ingress use the same compiler. No persistent mega-context was added.
- Memory owner still follows existing `memoryWriterMode`: Mem0 or existing
  custom ME owner, never both injected as competing truth. ME is a projection.
  Reflection and chat history do not become new memory owners. Project turns
  skip personal capture and retrieval; Project context cannot change within a
  populated conversation. Memory UI searches loaded facts and exposes actual
  source/unknown state; unsupported direct correction/deletion is not advertised.

## Operational V1

- Enter sends, Shift+Enter newline, IME guarded. History, reload, first message,
  new chat and mounted navigation are covered by real assistant-ui browser tests.
  Long buffered replies have a bounded reveal budget instead of per-word delay
  growing indefinitely. Per-chat AUTO/model choice lives in the existing drawer.
- One existing tool catalog/loop: async execution, explicit available-tool
  enforcement, four-round bound, stable call-ID dedupe and aggregate UTF-8 result
  budget. A failed action is not success; writes are not retried blindly.
  Visible activity contains tool names/status/timing, not hidden reasoning.
- Daily Energy is deterministic: food, workout, recorded net; unknown exercise
  energy stays unknown. BMR/TDEE requires real supplied inputs and remains an
  estimate. Natural-language correction uses existing record-update tools.
- ME has OGGI / CALENDARIO / MEMORY. Historical health uses the same checklist.
  Planned events use bounded `vinzmon-calendar` records; never completed health.
- Projects hold explicit bounded instructions/text sources and existing
  Markdown Page-shaped artifacts. Authenticated stable `#/artifact/id/slug`
  routes do not deploy the main app. Updates use revisions; TXT/MD download is
  a real Blob download. This is a private document slice, not arbitrary HTML/code
  execution or a separately hosted public microsite engine.
- One-time calendar reminders share those same events. `reminder-tick` runs
  approximately every five minutes on published Netlify deploys and uses existing
  push delivery. Accepted push is not proof of device delivery. Missing push
  stays visible in the app; interrupted attempts are explicitly unconfirmed.
  Recurring autonomous workflows are not claimed.
- Text-only OpenAI-compatible `vinzmon-core`: `/v1/models`, `/v1/responses`,
  `/v1/chat/completions`. Existing gateway/provider/cap/usage semantics retained.
  SSE is explicitly buffered. External tools/audio/stateful Responses are
  rejected, not falsely advertised. OpenClicky desktop end-to-end remains external.
- Bio now has nonphysical cultural taste/attitude inputs/fallback. Forty seeded
  generations are identical to baseline except Bio; visual DNA, assets, prompts,
  routing, sigil, reactions and RNG are unchanged. Historical Bio is not rewritten.
- TUNE stays in the current World. RISE archives old World+ledger and publishes
  a new World atomically with reveal. Costs 2/7/30 preserved. World AI, BABY,
  BREED, NUL, new narrator triggers and MindMap topology remain parked.

## Validation boundary

Targeted tests cover lifecycle handoff, actual assistant-ui browser interaction,
state/user-data CAS conflicts, health arithmetic/intents, calendar CRUD,
Project/artifact isolation, reminder claims, tool loop/results and ingress contracts.
Fixture provider responses are not production AI evidence. Local mobile/desktop
tests verify no overflow, readable controls, first user retained and real downloads.
Typecheck and build include both browser and Netlify functions.

Production results are recorded below only after real authenticated checks.

## Deliberately not claimed

- No connected Gmail/Google/Instagram/desktop capabilities without their actual
  authorization and adapter; no fake connector success.
- No new Skill registry, worker framework, global approval queue or second identity.
  Existing project instructions are reusable but are not called teachable Skills.
- Cross-device conflicts are detected and require explicit recovery, not CRDT merging.
- Health persistence still depends on existing local journal/cache before state sync;
  this pass does not replace the domain with a second database.
- Existing pre-reveal Bio/Narrator context is unchanged; new RISE World identity
  does not retroactively regenerate them. Legacy backup behavior is not a Journey redesign.
- Personal memory correction quality still depends on the configured owner/provider;
  no claim of complete memory mutation UX or proven external-client action parity.
