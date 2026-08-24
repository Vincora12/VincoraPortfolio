# ⚠️ MASTER SPEC NOTICE

For final integration, `VINZ_LAB_FULL_INTEGRATION.md` is the source of truth. This document remains supporting detail.

# VINZ.LAB — IMPLEMENTATION INSTRUCTIONS
READ THIS FILE FIRST.

## FINAL RESPONSIBILITY SPLIT

VINZ.LAB lives inside the existing VINZ.MON repository and application.

It has two sibling internal tools:

```text
VINZ.LAB
├── CREATION.LAB
│   ├── FLOW
│   ├── BUILD
│   ├── LEARNED
│   ├── STATE
│   └── HISTORY
└── SYSTEM.LAB
    ├── SETUP
    ├── AI
    ├── SIMULATION
    ├── MEMORY
    └── USAGE
```

### One deciding rule

If the tool changes or inspects **what a .mon is, how it is created, or how its canonical identity is translated**, it belongs to CREATION.LAB.

If the tool changes or inspects **how VINZ.MON runs, connects, simulates time, stores runtime context or spends money**, it belongs to SYSTEM.LAB.

Do not put the same operational control in two places.

## CREATION.LAB

CREATION.LAB is the single workbench for the complete creation pipeline.

The current visual Creative Resolver is a stage inside this pipeline.

FLOW must be ONE continuous, clickable creation timeline.

Do not compress the pre-resolver creation into a summary card.

Every stage must use the same interaction grammar as the visual resolver steps:
- step number;
- title;
- what it does;
- production baseline R0;
- example output;
- inspectable output structure;
- direct prompt/rule fragment when one exists;
- downstream influence when it does not;
- Lab ON / LOCK / BYPASS where technically valid;
- natural-language EDIT;
- per-step version history;
- controlled testing.

The vertical timeline must follow **actual execution order**, not numeric sorting of canonical step IDs.

Current audited execution / dependency order:

```text
generateMon()
01 User State
02 Mindline State

04 Family
05 Archetype
06 Affinity
07 Size
08 Role
09 Fashion + VINZ Markers
10 Mood

Continuity guard
  - continuity anchors have already been applied while eligible axes resolve
  - after Mood, if every eligible axis is unchanged, force one free axis to change

11 Appearance
5.5 Humanoidity
11.5 Character Design DNA
11.7 Cultural DNA

12 Heritage
13 Character DNA
13.5 Palette DNA
14 Voice DNA

03 Rarity Eligibility     # canonical ID 03, physically evaluated here
15 Rarity Score
16 Rarity Roll
17 Name
18 Character Data
  - generation_reason_summary is assembled as a CharacterData field here

MonRecord construction
20 Bio
21 Sigil
22 Reactions
```

Then show two clearly separate branches:

```text
ON-DEMAND DERIVATIONS
14.5 Voice Brief   # derived from Voice DNA when building runtime voice
20.5 Written Bio   # optional one-write AI rewrite after deterministic Bio exists

VISUAL PIPELINE
23 Creative Resolver
24 Prompt Compiler
25 Asset Output
```

Do not sort the timeline by the numeric identifier.
The left-side identifier is canonical provenance, while the vertical position is execution order.


Voice DNA must be fully inspectable, including preset and all 12 axes.
Bio must expose its structured parts, not only a paragraph.
Character Data must be inspectable as the canonical identity record.
Creative Resolver remains a later stage, not the beginning of the timeline.

BUILD is the common controlled-testing harness.
It must support targets:
- FULL MON
- VISUAL
- BIO
- VOICE

The builder locks context once, then the target decides which creation subsystem changes.

LEARNED should support scoped lessons.
At minimum distinguish:
- VISUAL
- BIO
- VOICE
- GLOBAL CREATION

STATE remains the runtime visual-expression mapping editor:
progression unlocks generation; state changes appearance.
It belongs here because it controls how the canonical visual identity expresses current state.

HISTORY snapshots must cover the whole Creation Lab state, not only visual resolver overrides.

## SYSTEM.LAB

SYSTEM.LAB must be deliberately smaller.

### SETUP
Absorb current ActivateScreen:
- VINZMON_TOKEN;
- server token match;
- provider-key presence;
- live provider ping;
- readiness by capability;
- monthly app cap.

Never expose API-key values.

### AI
Only infrastructure/routing:
- which model serves each real AI step;
- quality/economy presets;
- last-run model/duration/failure.
Do not edit Bio, Voice DNA or visual rules here.

### SIMULATION
There must be ONE canonical time-control area.

The prototype uses:
- RUN 1 COMPLETE DAY
- RUN 7 COMPLETE DAYS
- NEXT MINDLINE EVENT

No second copy of day-advance buttons in another System section.

Below it:
- current-day signals;
- ME signal overrides;
- simulation bias;
- SYNC/BOND test overrides;
- Mindline eligibility overrides.

Rarity threshold tuning belongs to CREATION.LAB because it changes how future .mon are created.
SYSTEM may keep only an unlock-all rarity test override.

### MEMORY
Runtime only:
- archive inspection;
- selected memory block;
- current mood;
- opinions;
- Voice Notebook;
- generic Tools / Build Mode.

Do not put Voice DNA creation controls here.

### USAGE
Read-only operational telemetry:
- costs;
- token use;
- timings;
- errors;
- selected model;
- provider health;
- image-generation accounting.

Do not duplicate asset-generation controls here.

## MIGRATION FROM OLD DEV

Do not delete old DEV until parity is reached.

Move each feature according to `DEV_PARITY_MATRIX.md`.

Prefer reusing existing functions/components and moving their UI responsibility rather than rewriting business logic.

## IMPORTANT CURRENT CODE FACTS

Current CharacterData generation already includes Voice DNA before final rarity/name freeze.

Current `MonRecord` stores:
- CharacterData
- Bio
- Sigil
- Reactions
- optional written Bio
- optional Creative Resolution
- optional compiled prompts
- asset status

Current automatic canonical asset pipeline:
- CHARACTER MASTER CEL
- CHARACTER MASTER TOY
- BIO DOODLE
- EXPRESSION SHEET

Current Voice DNA is a preset baseline plus 12 mutated axes.
The deterministic Voice Brief translates those axes into tendencies and explicitly warns that they are not obligations.

The repository is the implementation source of truth.
The ZIP is the product/UX architecture reference.


## IMPORTANT: TRACE NUMBER ≠ EXECUTION POSITION

`5.5 HUMANOIDITY` is intentionally displayed after `11 APPEARANCE` because that is where the current generator computes it.

`03 RARITY ELIGIBILITY` is intentionally displayed after `14 VOICE DNA` because the current implementation evaluates unlock context inside the rarity block together with score and roll.

`generation_reason_summary` is not a standalone pre-freeze step. It is computed while assembling `CharacterData`.

`Voice Brief` and `Written Bio` must remain clickable, but visually marked as ON-DEMAND DERIVATIONS rather than pretending to block `generateMon()`.

Continuity is cross-cutting control logic: anchored values are substituted while the corresponding axes resolve, and the unchanged-form guard runs after Mood. A trace line may be emitted later, but the Lab should show the behavior where it actually happens.


# CURRENT HATCH TRUTH — DO NOT BLUR WITH DEV

The Lab must distinguish what is **available in DEV** from what happens **automatically when a new .mon is born**.

Current audited `hatch()` behavior:

```text
hatch()
  ↓
generateFirstMon(...)                     ⚙️ CODE
  ↓
CharacterData                             ⚙️ CODE
Bio base + Sigil + Reactions              ⚙️ CODE
  ↓
record saved in store
  ↓
resumeFormEvolution()
  ↓
queueRemoteGeneration(...)
  ↓
promptFor(record, assetType)              ⚙️ CODE
  ↓
/api/evolution-background
  ↓
image generation                          🎨 IMAGE AI
```

Today `hatch()` does **not** call `resolveWithAi()` before queuing the images.

Therefore:

- Creative Resolver = 🔀 CODE + AI, **real but optional/manual today**.
- Written Bio = 🧠 AI, **optional/manual**.
- Prompt Rewrite = 🧠 AI, **optional/manual**.
- Voice DNA = ⚙️ CODE, **automatic during CharacterData generation**.
- Voice Brief = ⚙️ CODE, **runtime/on-demand derivation**.
- Conversational Voice = 🧠 AI, **runtime**, not canonical creation.
- Asset generation = 🎨 IMAGE AI, **automatic when token/backend are available**.
- deterministic prompt compilation = ⚙️ CODE and remains the fallback.

Do not change production architecture merely to make the diagram prettier.
If Product later decides that every new .mon must pass through Creative Resolver AI, treat that as a separate explicit implementation decision.

## UI LEGEND

Every Creation timeline row must state both:
1. WHO executes it;
2. WHEN it runs.

Use:
- `⚙️ CODE`
- `🧠 AI`
- `🎨 IMAGE AI`
- `🔀 CODE + AI`
- `✅ AUTO`
- `🧪 OPTIONAL`
- `💬 RUNTIME`

A user should never need to infer whether a step costs an AI call.


# CANONICAL TEST MON FOR A/B

Before implementing conversational editing or the `PROVA` action, read `TEST_MON_SPEC.md`.

There must be ONE canonical frozen Test Mon fixture used by controlled Lab tests.

Do not generate a fresh random creature for A and another fresh random creature for B.

A and B begin from the same frozen record and differ only in the target under test.

The baseline uses current repository values:

```text
ANGEL
PUTTO
ANGEL affinity
TINY
SCOUT
STREET
CALM
Humanoidity 4
CEL
KEN SUGIMORI
COMMON
no Heritage
```

All remaining generated fields must come from the real engine once and then be frozen in the fixture.

Do not invent fake neutral enums.

For probability changes, `PROVA` must combine:
- a controlled visual A/B when useful;
- a code-only distribution check, with no image spend.

The conversational editor must always show a diff and require explicit Lab approval before applying a change.


# DESIGN.LAB — THIRD SIBLING LAB

VINZ.LAB now has three sibling responsibilities:

```text
🧬 CREATION.LAB
who the .mon is / how it is created

🖥 DESIGN.LAB
how the product UI looks / is structured / is experienced

⚙️ SYSTEM.LAB
how the product runs / connects / simulates / stores runtime state
```

Read `DESIGN_LAB_SPEC.md` before implementing UI editing.

## Critical implementation rule

The current `design-lab/index.html` is only a UX prototype.

The real DESIGN.LAB must mount VINZ.MON's actual screen/components and current styles inside an isolated Lab fixture environment.

Do NOT build and maintain a second fake version of the app UI.

## Contextual Design AI

A tap on a rendered screen/component opens a scoped natural-language Design AI.

The AI can:
- explain how the selected UI works;
- identify whether a property is global, component-scoped or screen-local;
- inspect relevant React/CSS/tokens;
- propose a structured design patch;
- preview the patch in the Lab;
- compare A/B using the same screen/data/viewport;
- save an approved patch as a Design Lab version.

The AI must not immediately modify production code from ordinary conversation.

`APPLY TO LAB` means Lab state only.

Production implementation/promotion is a separate explicit action.

## Design boundaries

DESIGN.LAB may change:
- design tokens;
- spacing;
- typography;
- borders/radius;
- component presentation;
- layout;
- module order/visibility;
- visual hierarchy;
- motion language;
- screen composition.

DESIGN.LAB must not silently change:
- Character Data generation;
- progression;
- health calculations;
- rarity;
- Voice DNA;
- AI routing;
- provider credentials;
- runtime memory semantics.

If the request is actually a creation or runtime rule, route conceptually to the correct Lab.


# DESIGN.LAB CURRENT UI AUDIT

The DESIGN.LAB preview was re-audited against the current app source.

Read `CURRENT_UI_AUDIT.md`.

Critical corrections:
- CHAT is currently the dark assistant-ui ChatGPT-style clone.
- persistent nav is the current black 3-pill `TabBar`, not a white rectangular nav.
- MON owns MIND.MAP and MIND.DEX as subviews.
- ME owns OGGI / DIETA / SPORT.
- ME calendars live inside DIETA / SPORT.
- MIND.MAP and MIND.DEX use the ink field.
- Incubation and Encounter are non-live phases and have no persistent bottom nav.

These are implementation facts, not future design proposals.


# v2.4 — DO NOT COPY THE UI

The static HTML preview is no longer an implementation target.

Use `REAL_COMPONENT_INTEGRATION.md` and the scaffold under
`implementation/src/lab/design/`.

The real implementation must mount the actual production components.


# SOUL.LAB v2.6

VINZ.LAB now has four sibling Labs:

```text
CREATION
SOUL
DESIGN
SYSTEM
```

Read `SOUL_LAB_SPEC.md`.

SOUL.LAB owns the runtime visual Soul only.

Hard visual lock:

```text
one floating orb
two eyes
one mouth
```

Soul inherits the current active `.mon` color and changes only slightly with Mood.

The reply itself can temporarily change facial expression through `SoulCue`.

Do not create a second model call solely for Soul emotion.

Initial renderer:
React + SVG + CSS.

Use the vector Soul renderer defined in `SOUL_LAB_SPEC.md`.

Do not decide final product placement in SOUL.LAB.
Placement belongs to DESIGN.LAB.
