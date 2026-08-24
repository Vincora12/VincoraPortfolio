# ⚠️ MASTER SPEC NOTICE

For final integration, `VINZ_LAB_FULL_INTEGRATION.md` is the source of truth. This document remains supporting detail.

# VINZ.LAB — DESIGN.LAB IMPLEMENTATION SPEC

## Purpose

DESIGN.LAB is the natural-language UI/UX editor for VINZ.MON.

It is a sibling of CREATION.LAB and SYSTEM.LAB.

- CREATION.LAB changes what a `.mon` is and how its canonical identity is created / represented.
- SYSTEM.LAB changes runtime infrastructure, models, APIs, simulation and operational state.
- DESIGN.LAB changes how the VINZ.MON product UI is structured, laid out, styled and experienced.

DESIGN.LAB must never become a second implementation of the product UI.

Its preview must render the **same real components and styles used by VINZ.MON**, mounted in an isolated Lab sandbox.

---

## Current application navigation to mirror

The current app shell defines:

```text
LIVE TOP LEVEL
CHAT
MON
ME

MON SUBVIEWS
MON
MIND.MAP
DEX

ME SUBVIEWS
ME
CALENDAR
```

The app also has full-screen phases and overlays.

Important phase surfaces include:

```text
Personality Scan
Protocol Setup
Incubation
First Encounter
Shift
Evolution
Form Evolution
New Encounter
```

Important consultation / overlay surfaces include:

```text
Specimen Profile
History
Heritage DNA
Universal Input
Daily Scan
Activate
Page Reader
DEV / LAB
```

DESIGN.LAB should discover these from the repository instead of maintaining a second hardcoded catalog forever.

---

## Design-system truth

The current canonical design tokens live in `src/styles/tokens.css`.

The implementation must read or import the real tokens rather than copy them into a second config.

Current design-system principles include:

```text
WHITE FIRST
BLACK STRUCTURAL
SIGNAL ALWAYS

4px base unit
8pt grid

rectangular geometry
2px standard border
3px thick border
0px default radius
2px limited soft radius

character Color DNA may replace character accent variables at runtime

black field is reserved for specific event surfaces
it is not the default dark mode
```

DESIGN.LAB may edit token proposals, but production tokens remain unchanged until an explicit promotion step.

---

# Core UX

## 1. Pick a real screen

The user opens DESIGN.LAB and chooses a real VINZ.MON screen.

Examples:

```text
💬 CHAT
👾 MON
🧍 ME
🧬 MIND.MAP
▦ DEX
▣ CALENDAR
🥚 INCUBATION
⚡ ENCOUNTER
```

The preview must mount the actual screen/component in a deterministic Lab fixture state.

Do not require the user to navigate the whole game just to inspect a screen.

DESIGN.LAB needs fixture states that can directly mount phases and live views.

---

## 2. Tap an element

The user taps the actual rendered UI.

DESIGN.LAB resolves the selected DOM/component back to useful implementation context:

```text
visible element
component name
source file
screen / parent component
design tokens used
CSS selectors / classes
layout ownership
whether the component is shared
where else it appears
```

Example:

```text
SELECTED
BottomNav

SOURCE
App / LiveShell

SCOPE
GLOBAL COMPONENT

USED BY
CHAT
MON
ME
```

The user must not need to know CSS selectors or React file names.

---

## 3. Talk to DESIGN AI

A contextual AI chat opens for the selected element or screen.

Example:

```text
USER
Vorrei che questa nav fosse più squadrata,
più grafica e più Y2K.
Non deve diventare sci-fi.
```

The AI receives only the relevant design context plus enough application context to understand impact.

It should inspect:

```text
selected screen
selected component
source code for the selected component
related CSS
computed styles
design tokens referenced
shared component usage
current Lab design overrides
recent Design Lab history
user request
```

It may read additional related files when needed.

---

## 4. Explain before changing

The AI must be able to answer questions without making a patch.

Examples:

```text
"cosa controlla questo?"
"questo è globale?"
"se lo cambio cambia anche ME?"
"da dove viene questo spazio?"
"perché questa schermata è nera?"
```

This is a core function, not a fallback.

---

## 5. Propose a design patch

When a change is requested, the AI returns a structured proposal.

Conceptually:

```text
DESIGN PATCH

TARGET
BottomNav

SCOPE
global shared component

FILES / TOKENS AFFECTED
...

CURRENT
...

PROPOSED
...

EXPECTED IMPACT
CHAT / MON / ME

BEHAVIOR CHANGE
none

DESIGN CHANGE
yes
```

The visible UI should translate that into a simple human diff.

The user should not be forced to read a code diff unless they explicitly open "technical details".

---

# Patch types

DESIGN AI should choose the smallest correct ownership level.

## TOKEN PATCH

Use when the request is genuinely global.

Examples:

```text
"tutti i bordi sono troppo sottili"
"voglio titoli leggermente più piccoli ovunque"
"lo spacing generale è troppo compresso"
```

Prefer changing the real design token over editing twenty component styles.

## COMPONENT PATCH

Use when a reusable component should change wherever it appears.

Example:

```text
"la bottom nav deve avere il tab attivo come blocco nero"
```

## SCREEN PATCH

Use when only one screen should change.

Example:

```text
"in ME voglio meno dati above the fold"
```

Do not mutate a global token to solve one local screen problem.

## LAYOUT PATCH

Use when the user asks to hide, move or reorder existing UI modules.

Preserve data and product behavior unless the user explicitly requests a behavior change.

## STRUCTURE PATCH

Use when markup/component composition genuinely needs to change.

This is higher-risk and must state which shared surfaces may be affected.

---

# Preview and approval

Natural-language conversation must never immediately mutate production.

Required flow:

```text
USER REQUEST
↓
AI EXPLAINS / PROPOSES
↓
HUMAN-READABLE DIFF
↓
👁 PREVIEW IN DESIGN.LAB
↓
optional A/B
↓
USER FEEDBACK
↓
✓ APPLY TO LAB
↓
new DESIGN.LAB version
```

`APPLY TO LAB` changes only the Design Lab working state.

It does not change production.

---

# A/B for UI

UI A/B uses the exact same screen, data and viewport.

```text
A = current UI
B = proposed Design Lab patch
```

Nothing except the proposed UI patch may differ.

Useful ratings:

```text
A BETTER
B BETTER
B, BUT...
NO DIFFERENCE
RESET
```

Free-text feedback goes back into the same design conversation.

---

# Real component preview

This is the most important implementation rule.

Do not build mock HTML versions of CHAT, MON, ME etc. inside DESIGN.LAB.

The static prototype included in this ZIP is only a UX wireframe.

Production implementation should render the actual source components using a Lab fixture state.

Possible architecture:

```text
DESIGN.LAB shell
  ↓
SandboxPreview
  ↓
real App / screen component
  ↓
LabFixtureProvider
  ↓
DesignOverrideProvider
```

The preview should never alter the real persisted user state.

---

# Fixture state

DESIGN.LAB needs deterministic fixtures for UI work.

Examples:

```text
LIVE CHAT fixture
MON fixture with resolved assets / fallback
ME fixture with realistic but fixed health data
MINDLINE fixture with 3 nodes
DEX fixture with several records
CALENDAR fixture
INCUBATION fixture
ENCOUNTER fixture
```

These fixtures are UI test data only.

They must not become production user data.

---

# DESIGN AI safety / scope

DESIGN AI is a Lab tool, not the conversational personality of the `.mon`.

It must not modify:

```text
Character Data generation rules
Family / Archetype / Affinity probabilities
Voice DNA
Rarity
Mindline domain logic
health calculations
AI routing
provider credentials
runtime memories
```

If the user request crosses into those domains, DESIGN AI should say which Lab owns the change and hand off conceptually:

```text
"Questo non è un cambiamento di UI.
Va modificato in CREATION.LAB."
```

or:

```text
"Questo è comportamento runtime.
Va modificato in SYSTEM.LAB."
```

It may of course redesign the visual UI used to display those systems.

---

# Versioning

R0 = current real app UI.

Immutable inside the Lab.

Each approved Lab patch creates:

```text
DESIGN V1
DESIGN V2
DESIGN V3
...
```

Every version stores:

```text
parent version
user request
AI proposal
affected scope
affected files / tokens
structured patch
timestamp
screens impacted
optional A/B feedback
```

The user can restore any Design Lab version.

---

# Promotion to real app

Promotion is separate from `APPLY TO LAB`.

A future explicit action may be:

```text
IMPLEMENT IN VINZ.MON
```

Only then should an implementation agent turn the approved Design Lab state into a repository patch.

Before that moment DESIGN.LAB is a sandbox.

No automatic promotion.

No silent GitHub writes.

No production deploy from chat experimentation.

---

# Current prototype

`design-lab/index.html` is a mobile UX prototype showing:

- screen picker
- phone preview
- tappable elements
- contextual Design AI
- proposal diff
- preview
- A/B
- Apply to Lab
- tokens
- components
- history

Its mock preview is intentionally not production code.

The implementation agent must replace the mock preview with the real VINZ.MON component tree.


# Audited current UI correction

Read `CURRENT_UI_AUDIT.md`.

The initial DESIGN.LAB wireframe was intentionally generic and is no longer a reliable description of current VINZ.MON UI.

The current app audit establishes:

```text
CHAT = dark assistant-ui / ChatGPT clone
BOTTOM NAV = 3 expanding dark pills: CHAT / VINZ.MON / ME
MON = VINZ.MON / MIND.MAP / MIND.DEX
ME = OGGI / DIETA / SPORT
CALENDAR = inside DIETA and SPORT, not a top-level view
MIND.MAP + MIND.DEX = ink field
INCUBATION = egg bar + chat + strip + composer
ENCOUNTER = phase reveal, no bottom nav
```

The implementation agent must treat these as current source truth unless the repository has changed again.

Before implementing DESIGN.LAB for real, re-read:
- `src/App.tsx`
- `src/styles/tokens.css`
- `src/styles/base.css`
- `src/system/system.css`
- `src/screens/screens.css`
- relevant screen component
- relevant assistant-original files for CHAT

Do not use screenshots or old Lab mocks as the primary implementation source when current code is available.


# v2.4 hard implementation boundary

Static screen recreations are now explicitly deprecated.

The next implementation MUST use the files under:

`implementation/src/lab/design/`

as the architecture scaffold.

The required preview topology is:

```text
DESIGN.LAB parent
  ↓
same-origin iframe
  ↓
?design-preview=<screen>
  ↓
DesignPreviewRoute
  ↓
REAL VINZ.MON component
  +
DesignInspectorBridge
```

The parent and preview communicate only through typed `postMessage` messages.

The Design AI edits a Lab patch layer.

It does not rewrite production code during ordinary chat.
