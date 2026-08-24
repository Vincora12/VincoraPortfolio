# DESIGN.LAB — CURRENT UI AUDIT

This file records the current UI structure audited from the VINZ.MON repository before building the DESIGN.LAB preview.

Repository / branch used for the audit:

```text
Vincora12/VincoraPortfolio
claude/project-prototype-jxjc3d
```

## Root HTML

`index.html` is a Vite shell only:

```text
#root
  → /src/main.tsx
```

The actual product UI is React.

Therefore DESIGN.LAB must reason about the React component tree and CSS, not treat the root `index.html` as the screen markup.

The current HTML shell declares:
- `viewport-fit=cover`
- dark color-scheme metadata
- black theme color
- PWA / standalone mobile metadata
- a black VINZ.MON boot screen

## Actual top-level live navigation

Current `App.tsx`:

```text
Tab = chat | mon | me
```

Persistent bottom navigation:

```text
CHAT
VINZ.MON
ME
```

Current `TabBar` behavior:
- black container
- three pill buttons
- inactive item: compact 48px pill, lower opacity
- active item: expands to about 148px
- active label appears only on current tab
- current character accent colors the active icon/text

This is defined in `src/system/system.css`.

## CHAT

Current live CHAT is **not** the old white VINZ chat.

It mounts:

```text
IntegratedChat
  → AssistantRuntimeProvider
  → ChatSurface
  → ChatGPT
```

Current ChatSurface:
- black background
- ChatGPT-like dark assistant UI
- model selector in the top-right
- dark portal/popover surfaces
- character accent used on send / recording actions
- assistant clone styles are intentionally isolated from the VINZ.MON global reset

Files:
- `src/assistant-original/IntegratedChat.tsx`
- `src/assistant-original/chat-surface.tsx`
- `src/assistant-original/styles.css`

## MON

MON is a top-level live tab.

Inside MON, `App.tsx` renders a `ViewSwitch` with:

```text
VINZ.MON
MIND.MAP
MIND.DEX
```

### VINZ.MON view

The current view is `SplashScreen`, not a generic profile dashboard.

First viewport:
- name at the top
- species / form under the name
- large current .mon on white
- expression stickers attached around the figure
- below the initial viewport, scrolling reveals the dossier

Dossier includes:
- Bio / doodle
- birth stats
- additional canonical identity material

File:
- `src/screens/Splash.tsx`

### MIND.MAP

Current Mindline is a technical network topology.

Visual grammar:
- ink field
- technical 16px grid
- metro / Git-like connections
- geometric nodes
- monospaced labels
- no fantasy overworld

File:
- `src/screens/MindlineMap.tsx`

### MIND.DEX

Current Dex is not a collector grid of unrelated monsters.

It is a shelf of previous forms of the same VINZ.MON entity.

Visual structure:
- ink field
- ScreenHead
- two-column form grid
- image / name / day-form metadata
- tap opens detailed data

File:
- `src/screens/Dex.tsx`

## ME

Current `MeTab` mounts `MeOverviewScreen`.

Internal views are:

```text
OGGI
DIETA
SPORT
```

There is no separate top-level CALENDAR nav item.

Calendar UI appears within DIETA and SPORT through `MeCalendar`.

Current ME visual skin:
- light optical / Y2K treatment
- white cards on `#fafbfc`
- character accent
- 7px card radius
- thin light borders
- display type + mono micro labels

OGGI includes:
- ProgressChart
- Nutrition
- Today recap
- VINZ.MON game stats
- sync/source
- AI actions

DIETA includes:
- diet calendar
- diet plan
- meal history

SPORT includes:
- sport calendar
- workout plan
- completed workouts

Files:
- `src/screens/MeOverview.tsx`
- `src/screens/MeCalendar.tsx`
- `src/screens/screens.css`

## STATUS BAR

Status bar is not shown everywhere.

Current `App.tsx` behavior:
- visible in non-live phases
- visible in live MON
- not visible over live CHAT
- not visible over live ME

It contains:
- current day
- sync progress bar
- count
- Activate chip when needed
- DEV trigger

## EVENT / PHASE SURFACES

Current `INK_PHASES`:

```text
scan
incubation
first-encounter
new-encounter
```

MIND.MAP and MIND.DEX also use the ink field in live mode.

### INCUBATION

Current Incubation has exactly three main product blocks:

```text
1 compact egg/day bar
2 chat, taking the remaining space
3 one state strip
+ composer below
```

The old dashboard-like incubation layout is obsolete.

File:
- `src/screens/Incubation.tsx`

### ENCOUNTER

Current encounter:
- ink field
- three-beat reveal
- name curtain
- hero art
- identity overlay with form / rarity / affinity / family / appearance
- no persistent bottom navigation because it is a phase, not live tab content

File:
- `src/screens/Encounter.tsx`

## Design tokens

Canonical global tokens are in:

`src/styles/tokens.css`

Key rules:
- white-first, black structural
- 4px base unit / 8pt grid
- 2px standard border
- 3px thick border
- 0px global radius
- 2px soft radius
- character accent is runtime-driven
- event ink field is an inversion, not general dark mode

Important exceptions in current UI:
- live bottom tab bar is intentionally rounded / pill-based
- assistant chat has its own dark rounded UI grammar
- ME has a later light optical/Y2K skin override with 7px cards

DESIGN AI must respect current ownership instead of flattening all three surfaces into one grammar.

## DESIGN.LAB implementation consequence

The static `design-lab/index.html` in this prototype now visually reflects the audited app structure.

However, production implementation must still replace the static representation with the actual React components mounted in a sandbox fixture.

The preview must not become a second app.
