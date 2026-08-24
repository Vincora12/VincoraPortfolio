# VINZ.LAB integration package v3.3

This version removes the overlap between the previous Resolver/System split.

VINZ.LAB now has two sibling tools:

- `creation-lab/` → **CREATION.LAB**
- `system-lab/` → **SYSTEM.LAB**

Read:
1. `IMPLEMENTATION_INSTRUCTIONS.md`
2. `DEV_PARITY_MATRIX.md`
3. `CREATION_MODEL.md`

Core rule:

**CREATION.LAB controls everything that creates or canonically defines a .mon.**

**SYSTEM.LAB controls the infrastructure and runtime used to operate and test VINZ.MON.**

The visual Creative Resolver is one stage inside CREATION.LAB, not the umbrella for the whole creation system.

The HTML is a UX/product prototype. Production code remains the source of truth for actual data, catalogs and functions.


v1.8 correction:
- CREATION.LAB vertical order now follows the audited runtime execution order.
- canonical numeric IDs remain visible for provenance and may appear out of sequence.
- Voice Brief and Written Bio are marked as on-demand derivations.
- Creative Resolver / Prompt Compiler / Asset Output are marked as downstream visual pipeline.


## v1.9 truth labels

CREATION.LAB now distinguishes:
- ⚙️ CODE
- 🧠 AI
- 🎨 IMAGE AI
- 🔀 CODE + AI
- ✅ automatic hatch behavior
- 🧪 optional/manual AI tools
- 💬 runtime behavior

Important correction: the current `hatch()` creates the MonRecord with code and then starts remote asset generation. It does **not** automatically call `resolveWithAi()` first.


## v2.0 — canonical Test Mon

Added `TEST_MON_SPEC.md`.

This defines the frozen neutral fixture used by conversational `PROVA` / A-B tests.
The fixture uses only values that already exist in the current generation configuration.


## v2.1 — Test Mon styling lock

Canonical Lab Test Mon now uses:
- ROLE = SCOUT
- FASHION = STREET

All other non-target values remain frozen during controlled A/B tests.


## v2.2 — DESIGN.LAB

Added a third sibling Lab:

`🖥 DESIGN.LAB`

It is the natural-language UI/UX editor:
real-screen preview target, tappable elements, contextual Design AI, human-readable patch diff, preview, A/B and version history.

See `DESIGN_LAB_SPEC.md`.

Important: the included visual preview is a UX prototype. The real implementation must mount the actual VINZ.MON components rather than duplicating the UI.


## v2.3 — current UI audit

DESIGN.LAB static preview was rebuilt after auditing the current React app and CSS.

Added `CURRENT_UI_AUDIT.md`.

Main corrections: actual dark CHAT clone, actual expanding black bottom-nav pills, MON subviews, ME OGGI/DIETA/SPORT, ink-field MIND.* screens, current Incubation/Encounter structure.


## v2.4 — REAL COMPONENT MODE

DESIGN.LAB no longer treats a static recreation as the implementation target.

Added:
- `REAL_COMPONENT_INTEGRATION.md`
- `CODEX_IMPLEMENT_DESIGN_LAB.txt`
- `implementation/src/lab/design/`

The implementation scaffold uses same-origin preview iframes that mount the real VINZ.MON React components and capture selection through a postMessage inspector bridge.


## v2.5 — full VINZ.MON integration master

Canonical final brief: `VINZ_LAB_FULL_INTEGRATION.md`.

The final target is one VINZ.MON React app and one deployment. VINZ.LAB is a private route inside it at `/#/lab`, intended to be added separately to the iPhone Home Screen.

Added/updated:
- full route and iPhone/PWA strategy
- three-Lab ownership model
- Creation/Test Mon/A-B behavior
- real-component Design Lab architecture
- preview write guards
- System Lab scenario isolation
- DEV parity migration and cleanup order
- persistence/versioning/staleness/cost safety
- complete milestones, tests and definition of done
- `CODEX_IMPLEMENT_VINZ_LAB.txt`
- `implementation/src/lab/*` starter scaffold



## v3.0 — Soul 2D pivot

The Soul direction is the user's hand-drawn 2D vector character.

Canonical reference:
`soul-lab/reference/soul-master-sketch.png`

Canonical implementation brief:
`SOUL_V1_IMPLEMENTATION_BRIEF.md`

SOUL.LAB is now a live 2D vector editor for:
- shape
- face
- motion
- color
- snapshot export



## v3.1 — Soul cleanup

The package now contains only the active 2D Soul direction.

Removed:
- obsolete Soul experiment files;
- obsolete Soul assets;
- stale Soul implementation references;
- duplicate Soul scaffolds.

Canonical Soul files:
- `SOUL_LAB_SPEC.md`
- `SOUL_V1_IMPLEMENTATION_BRIEF.md`
- `soul-lab/reference/soul-master-sketch.png`
- `soul-lab/index.html`
- `implementation/src/soul/`


## v3.2 — Soul Expression Studio

Current Soul milestone:
- sphere only;
- no tail yet;
- manually authored expression library;
- per-expression body deformation;
- per-expression body motion;
- per-expression color response;
- intensity and energy runtime test;
- one JSON export for definitive handoff.

Read:
`SOUL_EXPRESSION_STUDIO_SPEC.md`


## v3.3 — AI proposals follow the master reference

The user's Soul sketch remains inside the project as the canonical visual reference:

`soul-lab/reference/soul-master-sketch.png`

Any AI used for expression proposals must:
- inspect that reference first;
- preserve the same character-design language;
- make its own editable proposal for the requested emotion;
- propose face, body, color and motion values;
- never replace the Soul with a generic mascot style;
- leave final approval to the user.

Dedicated AI brief:
`SOUL_EXPRESSION_AI_BRIEF.md`
