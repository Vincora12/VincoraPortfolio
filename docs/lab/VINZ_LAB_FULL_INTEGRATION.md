
## SOUL v1 CANONICAL PIVOT

The active Soul direction is now 2D vector.

Read first:

`SOUL_V1_IMPLEMENTATION_BRIEF.md`

Canonical visual reference:

`soul-lab/reference/soul-master-sketch.png`

Soul v1 target:

```text
React + SVG + CSS/Web Animations
```

The user-drawn orb + top wisp + two eyes + mouth is the source of truth.


# VINZ.LAB — FULL INTEGRATION MASTER SPEC
Version: 3.1
Status: IMPLEMENTATION SOURCE OF TRUTH

## 0. Final target

VINZ.LAB is not a separate website, repository, deployment, or static copy. It is a private laboratory route inside the existing VINZ.MON React application.

```text
ONE REPOSITORY
ONE VINZ.MON APP
ONE BUILD
ONE DEPLOYMENT
ONE DOMAIN

normal entry
/
→ VINZ.MON

private Lab entry
/#/lab
→ VINZ.LAB
```

VINZ.MON remains the product. VINZ.LAB is the private room used to inspect, teach, test, simulate and redesign it.

The normal VINZ.MON UI must expose no visible link to VINZ.LAB. No LAB tab, settings row, header icon, footer link, or normal product shortcut. VINZ.LAB is entered only through its direct URL, intended to be added manually to the iPhone Home Screen.

Target shortcut:

```text
https://<VINZ.MON-DOMAIN>/#/lab
```

A hidden URL is not authentication. For the current prototype, the requirement is discoverability isolation. If the deployment later becomes public or security matters, add a real auth gate.

---

## 1. Exactly four sibling Labs

```text
🧬 CREATION.LAB
👻 SOUL.LAB
🖥 DESIGN.LAB
⚙️ SYSTEM.LAB
```

### 🧬 CREATION.LAB
Owns what a `.mon` is and how canonical identity is generated or represented:

- generator and Character Data
- Family / Archetype / Affinity / Size / Role / Fashion / Mood
- VINZ DNA, including eyewear and hair systems
- Appearance
- Character Design DNA
- Cultural DNA
- Character DNA
- Palette DNA
- Voice DNA
- rarity
- name
- Bio base
- Sigil
- Reactions
- prompt selection/compiler
- optional Creative Resolver
- optional Written Bio rewrite
- optional Prompt rewrite
- image asset generation
- Test Mon
- controlled A/B generation
- distribution checks
- learned creation rules
- Creation snapshots/history

If a change alters who the `.mon` is, how it is constructed, or its canonical representation, it belongs here.


### 👻 SOUL.LAB
Owns the real-time visual Soul of the intelligence:

- one floating orb topology
- procedural face
- expression presets
- current-reply SoulCue mapping
- runtime Mood → visual Mood adapter
- inherited current-mon color
- mood saturation / hue / lightness modulation
- float / breath / wobble / talk motion
- small squash/stretch deformation
- Soul A/B tests
- Soul visual-rule history

If a change alters how the AI Soul itself looks, emotes or moves, it belongs here.

Boundary examples:

```text
current runtime Mood value
→ SYSTEM

how Mood changes Soul saturation
→ SOUL

Soul eye/mouth expression
→ SOUL

where the Soul appears inside CHAT
→ DESIGN

current .mon identity/palette generation
→ CREATION

Soul inheriting the current .mon's resolved color
→ SOUL
```

The Soul is intentionally not a miniature `.mon`.
The `.mon` is identity/body/evolution.
The Soul is presence/emotion/voice.

Read `SOUL_LAB_SPEC.md`.

### 🖥 DESIGN.LAB
Owns the product interface:

- layout
- typography
- spacing
- borders/radius
- design tokens
- component presentation
- screen composition
- visual hierarchy
- motion language
- reusable UI components
- screen-specific UI
- UI A/B tests
- design patch history

If a change alters how VINZ.MON looks or is used, but not what the underlying domain means, it belongs here.

### ⚙️ SYSTEM.LAB
Owns runtime/infrastructure:

- setup/connectivity
- model routing
- providers
- simulation
- time
- daily-signal simulation
- progression simulation
- runtime memory inspection
- current runtime mood/opinions
- tools / Build Mode runtime inspection
- costs
- tokens
- latencies
- errors
- provider health

If a change alters how VINZ.MON runs, connects, simulates or spends, it belongs here.

---

## 2. No duplication rule

One responsibility, one owner.

```text
Rarity generation thresholds → CREATION only
Canonical Voice DNA → CREATION only
Asset generation/import → CREATION only
BottomNav styling → DESIGN only
Current runtime Mood → SYSTEM only
Model/provider routing → SYSTEM only
Day advancement → SYSTEM only
```

The old DEV panel is functionality to migrate, not a fifth Lab.

---

## 3. Access and routing

### Normal VINZ.MON
Normal entry remains `/` plus existing product hash shortcuts such as `#/p/<slug>`.

Normal product navigation remains:

```text
CHAT
VINZ.MON
ME
```

### VINZ.LAB
Use hash routes because current Netlify intentionally has no SPA redirect rule and the app already uses hash deep links.

```text
/#/lab
/#/lab/creation
/#/lab/soul
/#/lab/design
/#/lab/system
```

Do not introduce `/lab` as a real path unless SPA redirects are deliberately added later.

### Internal Design preview routes
These are implementation-only, never user-facing destinations:

```text
/?design-preview=chat
/?design-preview=mon
/?design-preview=mind-map
/?design-preview=mind-dex
/?design-preview=me
/?design-preview=incubation
/?design-preview=encounter
```

---

## 4. Route before `<App />` mounts

This is critical. Resolve Lab and Design-preview entry in `src/main.tsx` before normal `<App />` mounts.

Current `App.tsx` owns product effects such as sync, ingestion, asset resume/sync and runtime behavior. VINZ.LAB must not mount App and then visually hide it.

Correct topology:

```text
main.tsx
  ↓ inspect URL
  ├─ ?design-preview=...
  │    → DesignPreviewRoute
  ├─ #/lab...
  │    → LabApp
  └─ everything else
       → App
```

Target structure must also avoid statically importing the full product tree before preview guards are installed. A static `import { App } from './App'` can evaluate store modules before the preview branch has a chance to isolate them. Use an asynchronous boot with branch-specific dynamic imports.

```tsx
async function boot() {
  const entry = readEntrypoint();

  if (entry.kind === 'design-preview') {
    const { installPreviewGuards } = await import('./lab/design/installPreviewGuards');
    installPreviewGuards();
    const { DesignPreviewRoute } = await import('./lab/design/DesignPreviewRoute');
    render(<DesignPreviewRoute screen={entry.screen} />);
    return;
  }

  if (entry.kind === 'lab') {
    const { LabApp } = await import('./lab/LabApp');
    render(<LabApp initialLab={entry.lab} />);
    return;
  }

  const { App } = await import('./App');
  render(<App />);
}
```

This ordering is intentional: install preview guards **before importing any screen/store tree used by the preview**.

Never put Lab routing inside App.

Create `src/lab/entrypoint.ts` with an explicit `Entrypoint` union and exact parsing for `#/lab` child routes and `?design-preview=`.

---

## 5. iPhone Home Screen entry

The user must be able to have a separate VINZ.LAB icon on iPhone Home Screen while the normal VINZ.MON icon continues opening VINZ.MON.

Open in Safari:

```text
https://<VINZ.MON-DOMAIN>/#/lab
```

Then Add to Home Screen.

### Dedicated Lab manifest
Create `public/lab-manifest.webmanifest`:

```json
{
  "name": "VINZ.LAB",
  "short_name": "VINZ.LAB",
  "description": "Private VINZ.MON laboratory.",
  "start_url": "/#/lab",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#ffffff",
  "theme_color": "#ffffff",
  "icons": [
    {
      "src": "/icon-180.png?v=2",
      "sizes": "180x180",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icon-512.png?v=2",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    }
  ]
}
```

A distinct Lab icon can be added later. Do not block implementation on it.

### Switch document metadata by entrypoint
Create `src/lab/applyLabDocumentMeta.ts`.

When Lab entry is active:

```text
document.title → VINZ.LAB
manifest href → /lab-manifest.webmanifest
apple-mobile-web-app-title → VINZ.LAB
theme-color → #ffffff
```

Normal app keeps its existing VINZ.MON manifest/title/theme.

Do this before React mount.

### Real iPhone acceptance test
Do not mark integration done until tested on the actual iPhone:

1. open `/#/lab` in Safari
2. confirm VINZ.LAB loads
3. Share → Add to Home Screen
4. confirm suggested name is VINZ.LAB
5. launch shortcut
6. confirm it opens VINZ.LAB, not VINZ.MON
7. kill and reopen
8. confirm standalone mode and route persist
9. also verify normal VINZ.MON Home Screen icon still opens VINZ.MON

---

## 6. Service worker

Current service-worker registration lives inside App, so Lab would not register it if App never mounts.

Move registration to a shared boot helper or `main.tsx`, for example `src/system/registerServiceWorker.ts`, used by all entry modes.

Use the same service worker scope. Do not make a second Lab service worker for this milestone. Do not change existing push notification click behavior just for Lab.

---

## 7. Final source tree

Do not put final Lab code under `src/dev/`.

```text
src/lab/
  LabApp.tsx
  entrypoint.ts
  applyLabDocumentMeta.ts
  lab.css

  state/
    labStore.ts
    labPersistence.ts
    labVersioning.ts

  ai/
    labEditor.ts
    schemas.ts
    context.ts

  creation/
    CreationLab.tsx
    ...

  soul/
    SoulLab.tsx
    ...

  design/
    DesignLabShell.tsx
    DesignPreviewRoute.tsx
    DesignLabPreviewFrame.tsx
    DesignInspectorBridge.tsx
    DesignChatPreview.tsx
    installPreviewGuards.ts
    screenRegistry.ts
    ...

  system/
    SystemLab.tsx
    scenarioStore.ts
    ...
```

The current `implementation/src/lab/` folder in this package is a starter scaffold, not a substitute for re-reading current source before integration.

---

## 8. Lab shell UX

VINZ.LAB is mobile-first and should feel like a private editorial tool, not a compressed developer cockpit.

Home:

```text
VINZ.LAB
PRIVATE LAB

🧬 CREATION.LAB
👻 SOUL.LAB
🖥 DESIGN.LAB
⚙️ SYSTEM.LAB
```

Use child hashes when opening a Lab:

```text
#/lab/creation
#/lab/soul
#/lab/design
#/lab/system
```

Requirements:

- large readable labels
- black/white editorial structure
- mono microcopy only for metadata
- semantic emoji for executor/status
- iPhone safe areas
- 44px minimum touch targets
- no clipped horizontal nav
- chat inputs at least 16px on iPhone
- A/B stacks vertically on phone when side-by-side would become unreadable
- desktop may use preview + inspector side-by-side

No fourth top-level Lab.

---

## 9. R0 and Lab versioning

Each Lab has an immutable R0:

```text
CREATION R0 = current production generation behavior/config
DESIGN R0 = current real product UI
SYSTEM R0 = current production runtime configuration
```

Lab changes create versions:

```text
V1
V2
V3
...
```

Every version stores at minimum:

- schema version
- Lab id
- version id
- parent version
- app/build SHA
- user request
- AI explanation
- structured diff/patch
- timestamp
- tests/evidence

R0 cannot be overwritten.

The user can inspect, restore, compare and reset working changes to R0 without deleting history.

---

## 10. Lab persistence is separate

Never reuse production persistence keys for Lab edits.

Recommended namespaces:

```text
vinzlab:creation:...
vinzlab:design:...
vinzlab:system:...
vinzlab:history:...
vinzlab:settings:...
vinzlab:chat:...
```

Use existing browser persistence infrastructure where practical. The repository already includes `idb-keyval`.

Recommended split:

- small current selections in localStorage
- version histories / larger patch payloads in IndexedDB

All stored records need a schema version and migration path.

---

## 11. Two different meanings of Apply

This wording must be explicit everywhere.

### APPLY TO LAB
Means:

```text
save proposal as active Lab override/version
```

It changes Lab tests/previews/simulations only.

### IMPLEMENT IN VINZ.MON
Means:

```text
turn an approved Lab version into a real source-code implementation
```

This is separate and later. Do not collapse the two.

The runtime browser Lab does not rewrite its own deployed bundle and redeploy itself.

---

## 12. Common AI editing contract

Every conversational editor follows:

```text
USER
↓
SCOPED LAB AI
↓
EXPLANATION
↓
STRUCTURED PROPOSAL
↓
HUMAN-READABLE DIFF
↓
TEST / PREVIEW
↓
USER FEEDBACK
↓
REVISED PROPOSAL
↓
APPLY TO LAB
```

A chat message alone never mutates config.

The AI proposes. The user approves.

---

## 13. Scoped AI context

Do not hand the AI the entire repository on every message.

Example `CREATION → VINZ DNA → EYEWEAR` context:

- existing eyewear catalogs
- current weights
- current selection logic
- relevant learned rules
- current Creation Lab override
- canonical Test Mon
- recent eyewear tests
- generation config version

Example `DESIGN → BottomNav` context:

- selected DOM metadata
- owning component
- source file
- relevant CSS
- computed styles
- referenced tokens
- reuse locations
- current Design Lab patch stack

Example `SYSTEM → model routing` context:

- current routing config
- capability IDs
- current models
- cost/latency data
- Lab-only proposed override

If context becomes stale after source changes, re-read source before proposing.

---

## 14. AI backend

Reuse VINZ.MON's existing AI backend abstraction. Provider keys remain server-side.

Create `src/lab/ai/labEditor.ts` and structured schemas in `src/lab/ai/schemas.ts`.

If current routing supports named steps, use Lab-specific step IDs such as:

```text
labCreationEdit
labDesignEdit
labSystemExplain
```

If not, route through the existing suitable text/reasoning capability. Do not create a second provider stack.

Never call provider secrets from the browser.

---

## 15. Structured AI output only

Do not execute free-form model text.

Generic shape:

```ts
type LabProposal = {
  id: string;
  lab: 'creation' | 'design' | 'system';
  target: string;
  summary: string;
  reason: string;
  impact: string[];
  warnings: string[];
  changes: LabChange[];
};
```

Validate/parse before applying.

Never use `eval()` or `new Function()`.

---

# 🧬 CREATION.LAB

## 16. Creation tabs

Exactly:

```text
FLOW
BUILD
LEARNED
STATE
HISTORY
```

Creative Resolver is an optional stage inside Creation, not its own Lab.

---

## 17. Real execution truth

Creation Flow must show what the current source actually does and distinguish:

```text
⚙️ CODE
🧠 AI
🎨 IMAGE AI
🔀 CODE + AI
✅ AUTO
🧪 OPTIONAL
💬 RUNTIME
```

Do not confuse “exists in DEV” with “runs automatically during hatch”.

At the last audited source state:

```text
generator / Character Data → ⚙️ CODE
Creative Resolver → 🔀 CODE + AI · 🧪 OPTIONAL
Written Bio rewrite → 🧠 AI · 🧪 OPTIONAL
Prompt Rewrite → 🧠 AI · 🧪 OPTIONAL
Prompt selection/compiler → ⚙️ CODE · ✅ AUTO
background asset generation → 🎨 IMAGE AI · ✅ AUTO when backend/token available
runtime voice → 🧠 AI · 💬 RUNTIME
```

Re-audit current source during implementation. If source changed, source wins.

---

## 18. Conversational Creation editor

Every editable step can open a contextual AI chat.

Example:

```text
VINZ DNA
→ EYEWEAR
```

User:

```text
Voglio che tendano molto di più
agli occhiali da sole che da vista.
```

AI must:

1. inspect existing eyewear values
2. inspect current weights/selection logic
3. explain what really exists
4. avoid silently inventing new enums
5. propose exact changes
6. show human diff
7. offer 🧪 TEST
8. only apply after explicit Apply to Lab

If the user expresses a concept that is not a current enum, the AI can group current values analytically. If a new canonical axis is truly needed, explicitly label it `SCHEMA CHANGE` and require approval.

---

## 19. Canonical Test Mon

Controlled creation tests use one frozen canonical fixture.

Baseline:

```text
FAMILY               ANGEL
ARCHETYPE            PUTTO
AFFINITY             ANGEL
SIZE                  TINY
ROLE                  SCOUT
FASHION               STREET
MOOD                  CALM
HUMANOIDITY           4
APPEARANCE            CEL
CHARACTER DESIGN DNA  KEN SUGIMORI
RARITY                COMMON
HERITAGE              NONE
```

Before implementation, verify every value still exists in current source. If one was removed/renamed, fail visibly and update the fixture intentionally. Never silently substitute.

Do not hand-write fake Character DNA, Palette DNA, Voice DNA, name, generation reason, Bio, Sigil or Reactions.

Fixture creation:

1. construct baseline from canonical values
2. use stable Lab seed
3. run real engine once
4. capture generated remaining fields
5. save/freeze result
6. clone exact record for A and B

A/B sides share all non-target state byte-for-byte where practical.

---

## 20. Creation A/B

For a visual rule:

```text
A = current rule
B = proposed rule
```

Everything else remains identical.

If the target affects image generation, use the real relevant prompt/image pipeline. Do not fake the test by pasting visual accessories onto a finished image.

### Probability changes
A single visual pair cannot validate a probability.

Always combine when relevant:

```text
👁 VISUAL A/B
```

and

```text
📊 DISTRIBUTION CHECK
```

Distribution check:

- many code-only generations
- same stable seed set for A and B
- no images
- report observed frequencies

Never generate dozens of paid images to validate a probability.

---

## 21. BUILD

BUILD is controlled experimentation, not an unrelated manual creature builder.

Supports:

- canonical Test Mon
- same-seed A/B
- target-only overrides
- batch code-only generation
- real asset generation only when useful
- side-by-side result review
- feedback loop back to scoped AI

---

## 22. LEARNED

Scopes:

```text
VISUAL
BIO
VOICE
GLOBAL CREATION
```

Rules:

- repeated evidence matters
- comments are richer than likes
- controlled same-seed A/B is strong evidence
- one vote is not permanent law
- user can inspect/revoke learned rules

Principles:

```text
BIO = FACTS FIRST
VOICE = TENDENCIES, NOT OBLIGATIONS
VOICE PRESET = BASELINE ONLY
```

---

## 23. STATE

Rule:

```text
Progression unlocks generation.
State changes appearance.
```

State may alter expression, posture, tension, eyes, wing/ring movement, line energy, aura, and small morphology.

State must not replace Family/Character DNA, punish a form, beautify it as a reward, or turn health into morality.

---

## 24. Creation history

Every Apply to Lab stores:

- parent version
- target
- user request
- AI explanation
- exact structured diff
- Test Mon result
- distribution result if relevant
- base build SHA
- timestamp

R0 stays immutable.

---

# 🖥 DESIGN.LAB

## 25. Hard rule: real components only

DESIGN.LAB must display the real VINZ.MON UI.

Never rebuild product screens as fake static HTML/JSX for the final implementation.

Earlier static prototypes are UX references only.

Final topology:

```text
DESIGN.LAB parent
  ↓
same-origin iframe
  ↓
?design-preview=<screen>
  ↓
DesignPreviewRoute
  ↓
REAL production component
  +
DesignInspectorBridge
```

---

## 26. Initial real-screen registry

```text
CHAT
VINZ.MON
MIND.MAP
MIND.DEX
ME
INCUBATION
ENCOUNTER
```

At the last audit:

```text
CHAT → real ChatSurface / assistant-ui clone
VINZ.MON → SplashScreen
MIND.MAP → MindlineMapScreen
MIND.DEX → DexScreen
ME → MeOverviewScreen
INCUBATION → IncubationScreen
ENCOUNTER → EncounterScreen
```

Current product top-level navigation:

```text
CHAT
VINZ.MON
ME
```

MON internal views:

```text
VINZ.MON
MIND.MAP
MIND.DEX
```

ME internal views:

```text
OGGI
DIETA
SPORT
```

Re-audit current source before coding.

---

## 27. Why iframe

The iframe is runtime isolation, not visual imitation.

It provides:

- separate React tree
- separate module/store instance
- exact CSS bundle
- exact fonts
- exact production components
- clean DOM geometry for selection

The preview iframe mounts `DesignPreviewRoute` instead of App so App-level sync/ingest/runtime effects do not run.

---

## 28. Preview write guard

A same-origin iframe can still see normal browser persistence. Design preview must never persist or remote-save production changes.

Create `src/lab/design/installPreviewGuards.ts`, installed before preview components render.

Durable preferred solution: production storage and Lab preview storage use separate namespaces.

First-mile defensive guard may block production storage writes:

```text
localStorage.setItem
localStorage.removeItem
localStorage.clear
```

while still permitting required reads.

Also block browser network mutation from preview:

```text
POST
PUT
PATCH
DELETE
```

unless explicitly targeting a Lab-only endpoint.

GET/HEAD for assets may continue.

In-memory iframe Zustand changes may occur and disappear when iframe is destroyed. They must never persist to normal state or server.

---

## 29. Inspect mode

Default:

```text
INSPECT ON
```

Hover outlines target. Tap selects target. Click is captured before product handler so the product action does not execute.

Send to parent via typed `postMessage`:

- screen
- element id
- tag
- classes
- data-pezzo
- data-slot
- aria-label
- short text excerpt
- bounding rect

Do not identify source ownership from pixels alone.

---

## 30. Map DOM selection to source

Use stable metadata and a registry:

- `data-pezzo`
- `data-slot`
- aria-label
- stable component classes
- screen registry
- explicit component/source mapping

Design AI context should include:

- selected screen
- selected component
- source file
- parent component
- CSS selectors
- computed styles
- relevant tokens
- reuse locations
- current Lab patch stack

---

## 31. Design AI behavior

Example user request after selecting BottomNav:

```text
Vorrei che fosse più squadrata e Y2K,
ma senza perdere la logica delle tre pill.
```

AI response must distinguish:

```text
CURRENT
PROPOSED
SCOPE
AFFECTS
BEHAVIOR CHANGE
VISUAL CHANGE
```

Then offer:

```text
PREVIEW
A/B
APPLY TO LAB
```

---

## 32. Design patch ownership levels

Choose the smallest correct level:

```text
TOKEN PATCH
COMPONENT PATCH
SCREEN PATCH
LAYOUT PATCH
STRUCTURE PATCH
```

Do not change a global token to solve a local screen issue.

Structure patches are higher-risk and must state every impacted screen.

---

## 33. Design patch safety

For visual CSS changes, inject validated CSS into a preview-only style element:

```html
<style id="vinz-design-lab-patch"></style>
```

For structural changes, use typed Lab overrides or generate an implementation handoff specification. Do not execute model-generated JS.

Never eval.

---

## 34. UI A/B

Use two real preview iframes:

```text
A = same real component + same state + current Lab version
B = same real component + same state + proposed patch
```

Nothing else differs.

Feedback:

```text
A BETTER
B BETTER
B, BUT...
NO DIFFERENCE
```

Free-text feedback goes back into the same Design AI thread.

---

## 35. Chat preview special case

Do not mount the full storage-owning `IntegratedChat` if it migrates/stores server-backed threads.

Use:

```text
REAL ChatSurface
+
memory-only assistant runtime
```

No real model call is needed for visual preview.

If assistant-ui API changes, adapt only the runtime adapter while keeping the real UI component.

---

## 36. Real assets and data

Design preview uses actual application asset components. Do not replace `.mon` art with emoji just because it is Lab. If an asset is missing, show the real application fallback.

ME should offer explicit preview data mode:

```text
FIXTURE
REAL READ-ONLY
```

Default to deterministic fixture for repeatable A/B. If real data is displayed, preview guards still prevent writes.

Recommended deterministic fixtures:

- Chat with several messages
- current Mon with real/fallback assets
- Mindline with multiple nodes
- Dex with several forms
- ME OGGI populated
- ME DIETA
- ME SPORT
- Incubation day 5
- Encounter final reveal beat

Fixtures are data adapters only. Components remain production components.

---

## 37. Never duplicate product CSS

`src/lab/lab.css` and Design Lab CSS style the Lab shell only.

Never copy into Lab:

- BottomNav CSS
- ME CSS
- Chat CSS
- Screen CSS
- tokens

The preview loads the real application styles.

---

## 38. Design history

Every Apply to Lab stores:

- version / parent
- screen
- selection
- user request
- AI proposal
- human diff
- affected source files
- affected tokens
- patch payload
- A/B feedback
- base build SHA
- timestamp

R0 is the current real UI.

---

# ⚙️ SYSTEM.LAB

## 39. System tabs

Exactly:

```text
SETUP
AI
SIMULATION
MEMORY
USAGE
```

No MON tab. No creation controls.

---

## 40. SETUP

Absorb relevant current activation/setup diagnostics:

- VINZMON_TOKEN presence
- server token match
- provider presence
- live ping
- capability readiness
- monthly cap

Provider secrets stay server-side. Never render secret provider keys in the browser.

---

## 41. AI

Infrastructure/routing only:

- capability/step
- current model
- quality/economy preset
- last-run model
- duration
- failure
- provider health

Do not edit Bio content, Voice DNA or visual creation rules here.

Historical internal IDs may have misleading names. Show human conceptual labels while preserving internal ids as metadata. Re-audit current source before asserting exact mappings.

---

## 42. SIMULATION

One canonical simulation area:

```text
RUN 1 COMPLETE DAY
RUN 7 COMPLETE DAYS
NEXT MINDLINE EVENT
```

Daily inputs:

```text
FOOD
WORKOUT
MOOD
```

Test overrides may include sync, bond, force growth/evolution, rarity unlock and clone scenario. Overrides do not advance time by themselves.

### Hard isolation
Simulation operates on a Lab scenario clone, not the real product store.

Create `src/lab/system/scenarioStore.ts` seeded from a serializable current snapshot or deterministic fixture.

Simulation must not:

- close the user's real day
- alter real health journal
- create a real Mon
- save remote state

---

## 43. MEMORY

Runtime inspection only:

- memory archive
- selected memory block
- current mood
- opinions
- Voice Notebook
- tools / Build Mode

Canonical Voice DNA belongs to Creation.

---

## 44. Voice separation

Keep this model:

```text
CREATION TIME
Voice DNA

ON DEMAND / RUNTIME
Voice Brief (code)

RUNTIME
Voice Brief
+ current Mood
+ selected Memories
+ Opinions
+ accepted Voice Notebook
+ conversation
→ AI response
```

Do not merge canonical voice identity and runtime state into one editor.

---

## 45. USAGE

Read-only telemetry:

- cost
- tokens
- timings
- errors
- model
- provider health
- image accounting

Usage is not another model settings screen.

---

# DEV MIGRATION

## 46. Map old DEV into Labs

Migrate capability, not the old cockpit UI.

```text
generator trace / CharacterData → CREATION / FLOW
ResolverSection → CREATION / FLOW optional AI stage
TeachSection → CREATION / LEARNED
DesignTest → CREATION / BUILD
BioSection → CREATION / FLOW / BIO
VoiceSection canonical → CREATION / FLOW
PromptPreview → CREATION / FLOW / PROMPT
AssetImport / ForgePanel → CREATION / FLOW / ASSETS
BatchGenerator → CREATION / BUILD
CatalogSection → CREATION
RaritySection → CREATION

Activate diagnostics → SYSTEM / SETUP
ModelsSection → SYSTEM / AI
Time / Signals / Progression / Mindline dev controls → SYSTEM / SIMULATION
MemorySection → SYSTEM / MEMORY
Mood runtime / opinions / notebook → SYSTEM / MEMORY
Tools → SYSTEM / MEMORY
CostSection → SYSTEM / USAGE
```

---

## 47. Legacy DEV cleanup

During migration, `?dev=1` may remain only for parity verification.

Do not remove it until every capability has a verified Lab destination.

After parity:

1. remove visible DEV trigger from normal product
2. stop exposing DevPanel as normal overlay
3. retain underlying engine/testing functions used by Lab
4. optionally redirect legacy `?dev=1` to `/#/lab` for one transition version
5. later remove legacy entry

Final state:

```text
VINZ.MON normal UI → no Lab/DEV entry
VINZ.LAB → direct iPhone/Home URL only
```

---

# SAFETY, COST, STALENESS

## 48. Build SHA / stale versions

Every Lab R0/version records the current build identifier.

If source changes after a Lab version was created, show:

```text
⚠️ BASE BUILD CHANGED
```

Do not silently apply an old patch to a changed DOM/config.

Offer REBASE / RECHECK. Preserve history.

On Lab open:

```text
read build info
compare active Lab baseBuild
mark stale if different
```

---

## 49. Error boundaries

Root ErrorBoundary remains. Add a Lab-local boundary so a broken experimental panel does not break normal app entry.

Design iframe errors should message parent:

```text
VINZ_DESIGN_ERROR
```

Show screen, error, source context and Reset Preview.

---

## 50. Cost safety

Every paid action must show:

- executor
- model
- cost class / known estimate
- number of calls

Prefer code-only tests whenever images/models are unnecessary.

Distribution checks are code-only.

---

## 51. Creation test assets

Use the existing image pipeline where possible. Do not create a second image stack.

Lab test assets must be marked/separated from canonical assets and disposable.

Suggested namespace:

```text
vinzlab/test-assets/<test-id>/...
```

If remote storage is used, add a Lab prefix and cleanup policy.

---

## 52. Lab AI thread storage

Lab AI conversations must not pollute normal VINZ.MON chat history.

Suggested keys:

```text
vinzlab:chat:creation:<target>
vinzlab:chat:design:<target>
vinzlab:chat:system:<target>
```

Examples:

```text
creation / eyewear
design / BottomNav
system / image-routing
```

---

## 53. Implementation pack export

Every approved Lab version should be exportable as an implementation-ready description:

```json
{
  "lab": "design",
  "version": "DESIGN_V8",
  "baseBuild": "abc1234",
  "request": "...",
  "target": "BottomNav",
  "files": ["src/system/system.css"],
  "humanDiff": ["..."],
  "structuredPatch": {},
  "tests": {}
}
```

This is the handoff to Codex for the separate `IMPLEMENT IN VINZ.MON` operation.

Do not require GitHub writes to use the Lab.

---

# NETLIFY / DEPLOYMENT

## 54. One deployment

Final architecture uses one VINZ.MON Netlify deployment.

No separate final VINZ.LAB site is required.

Because Lab uses `/#/lab`, no new SPA redirect is required.

Do not alter Netlify routing just to make this route work.

Keep existing noindex/nofollow behavior.

The previous static Netlify Lab was a sandbox/reference only and is not the final architecture.

---

# PERFORMANCE / ACCESSIBILITY

## 55. Lazy-load Lab UI

Normal VINZ.MON users should not pay the Lab UI bundle cost.

Lazy-load `LabApp` and Lab-heavy modules.

Normal product may share engine modules, but should not eagerly load:

- Design inspector
- Lab AI editor
- Lab histories
- simulation tooling
- batch test UI

---

## 56. Accessibility/mobile

Requirements:

- safe-area top/bottom
- 44px touch targets
- no state communicated only by color
- labels/aria-current
- keyboard focus on desktop
- reduced-motion support
- no horizontal clipping
- input font >=16px on iPhone
- keyboard must not permanently cover primary Test/Apply controls
- Design inspect overlay must not trap focus

---

# IMPLEMENTATION ORDER

## 57. Milestones

### M1 — Entry
- `/#/lab` opens LabApp
- `/` still opens App
- no normal App link to Lab
- dedicated Lab manifest/title works
- iPhone shortcut opens Lab

### M2 — Shell
- four sibling Labs
- child hashes work
- Lab persistence/versioning foundation
- R0 + build info

### M3 — Design real preview
- real MON / MIND.MAP / MIND.DEX / ME / Incubation / Encounter
- real ChatSurface with memory-only runtime
- preview write guards
- inspector bridge
- CSS proposal injection
- A/B

### M4 — Creation
- real creation timeline
- real current config reading
- canonical Test Mon
- same-seed A/B
- code-only distribution check
- scoped Creation AI proposal
- Apply to Lab versioning

### M5 — System
- Setup
- AI routing
- isolated Simulation
- Memory
- Usage

### M6 — DEV parity
- migrate all old DEV capability
- verify parity
- only then remove old product DEV entry

### M7 — Hardening
- build staleness/rebase
- cost labels
- persistence migrations
- error handling
- iPhone QA
- regression tests

Keep the project buildable after each milestone.

---

# TESTS

## 58. Required existing checks

Before reporting completion:

```text
npm run typecheck
npm run typecheck:functions
npm run build
```

Run relevant existing verification scripts:

```text
npm run verify
npm run verify:backend
npm run verify:assistant
npm run verify:chat-me
npm run verify:features
npm run verify:package
```

If a script tests a legacy DEV entry, update the test while preserving the underlying guarantee.

---

## 59. New Lab tests

### Routing

```text
/ → normal App
/#/lab → LabApp
/#/lab/design → Design Lab
?design-preview=mon → preview only
```

### Isolation
Opening Lab must not:

- advance day
- remote-save product state
- start a model call just by opening
- mutate normal chat threads

Design preview must not persist production store changes or send product mutation requests.

### Design

- selection postMessage arrives
- proposal CSS affects B only
- A remains baseline
- component rendered is production component, not copied markup

### Creation

- Test Mon values validate against current catalogs
- A/B uses same stable seed/record
- distribution test deterministic for the seed set
- Apply to Lab creates a Lab version
- production generation config remains unchanged

### System

- simulation uses scenario clone
- real product day/state remains unchanged

---

## 60. Real iPhone acceptance

Mandatory:

```text
1. open /#/lab in Safari
2. add to Home Screen
3. launch icon
4. confirm standalone VINZ.LAB
5. switch Creation / Design / System
6. open Design preview
7. select an element
8. type a Lab AI request
9. see proposal
10. preview B / A-B
11. kill app
12. reopen shortcut
13. confirm VINZ.LAB still opens
14. confirm normal VINZ.MON shortcut still opens VINZ.MON
```

---

# DEFINITION OF DONE

## 61. Complete when all are true

```text
✓ same repo
✓ same VINZ.MON application
✓ same deployment
✓ private direct /#/lab entry
✓ no visible Lab link in normal product
✓ dedicated VINZ.LAB Home Screen metadata/manifest
✓ iPhone shortcut tested
✓ exactly four sibling Labs
✓ Creation reads/uses real engine/config
✓ canonical Test Mon + A/B + distribution checks
✓ Design mounts real product components
✓ Design inspector works
✓ Design proposals are structured/reversible
✓ Design preview cannot persist production mutations
✓ System simulation is isolated
✓ DEV parity verified
✓ R0 immutable
✓ Apply to Lab != Implement in VINZ.MON
✓ build SHA staleness handled
✓ normal VINZ.MON behavior unchanged
✓ typecheck/build/tests pass
```

---

## 62. Never do these things

```text
DO NOT create a second VINZ.LAB repository.
DO NOT deploy final VINZ.LAB as a separate static product.
DO NOT copy VINZ.MON screens into fake Lab HTML.
DO NOT add LAB to normal BottomNav.
DO NOT let AI chat text immediately mutate config.
DO NOT let Design preview write production state.
DO NOT let System simulation advance real state.
DO NOT silently invent schema values.
DO NOT compare random A/B seeds.
DO NOT generate expensive images for probability validation.
DO NOT merge Creation and System ownership.
DO NOT simply embed the old huge DEV panel as VINZ.LAB.
DO NOT delete DEV before parity is verified.
DO NOT silently promote Lab versions to production.
DO NOT deploy without explicit authorization.
```

---

## 63. Files Codex must read before coding

At minimum, re-read current versions of:

```text
src/main.tsx
src/App.tsx
src/state/store.ts
src/styles/tokens.css
src/styles/base.css
src/system/system.css
src/screens/screens.css
src/dev/DevPanel.tsx
src/dev/* relevant sections
src/screens/Splash.tsx
src/screens/MindlineMap.tsx
src/screens/Dex.tsx
src/screens/MeOverview.tsx
src/screens/MeCalendar.tsx
src/screens/Incubation.tsx
src/screens/Encounter.tsx
src/assistant-original/IntegratedChat.tsx
src/assistant-original/chat-surface.tsx
src/assistant-original/styles.css
src/engine/generator.ts
src/engine/generationConfig.ts
src/assets-pipeline/*
src/ai/*
src/engine/healthJournal.ts
public/manifest.webmanifest
public/sw.js
netlify.toml
package.json
```

If filenames changed, search current repository. Do not infer that functionality is gone.

---

## 64. Mental model

```text
VINZ.MON
what I live with

VINZ.LAB
where I inspect, teach, test and redesign it
```

The user should not need to understand source code to use VINZ.LAB. They should be able to say things like:

```text
"voglio più occhiali da sole"
"questa nav la voglio più Y2K"
"fammi vedere perché questo modello costa così tanto"
"proviamo 7 giorni"
"questa regola mi piace, tienila"
```

and VINZ.LAB turns that intent into explicit, inspectable, testable, reversible changes.

---


## SOUL.LAB — runtime visual soul

SOUL.LAB is a fourth sibling Lab with a narrow responsibility.

It owns the procedural visual avatar of the intelligence itself.

Hard visual lock:

```text
one floating orb
two eyes
one mouth
```

The Soul stays orb-like in every state.
No limbs, wings, clothes, hair, eyewear, horns, extra eyes or creature anatomy.

The current active `.mon` supplies the Soul base color.
The actual runtime Mood is owned by SYSTEM.LAB.
SOUL.LAB owns the visual mapping of that Mood.

Runtime composition:

```text
active mon color
+
normalized Mood vector
+
current reply SoulCue
↓
SoulController
↓
SoulVisualState
↓
SoulOrb
```

The reply model should provide SoulCue metadata in the same inference that produces the visible reply, so Soul expression does not require a second AI call.

SOUL.LAB tabs:

```text
LIVE
FACE
COLOR
MOTION
HISTORY
```

SOUL.LAB AI translates natural-language art direction into explicit visual-rule proposals.

Example:

```text
"quando è stanco voglio che perda saturazione
ma non sembri triste"
```

Flow:

```text
USER
↓
SOUL AI explanation
↓
structured rule diff
↓
preview
↓
A/B
↓
APPLY TO SOUL LAB
```

Placement of the Soul in product UI is a DESIGN.LAB decision, not a SOUL.LAB decision.

The first implementation should use React + SVG + CSS transforms.
Use the lightweight vector rendering architecture defined in `SOUL_LAB_SPEC.md`.

Full specification:
`SOUL_LAB_SPEC.md`

