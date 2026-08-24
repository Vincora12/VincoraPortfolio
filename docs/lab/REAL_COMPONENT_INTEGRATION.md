# ⚠️ MASTER SPEC NOTICE

For final integration, `VINZ_LAB_FULL_INTEGRATION.md` is the source of truth. This document remains supporting detail.

# DESIGN.LAB v2.4 — REAL COMPONENT INTEGRATION

This folder is an implementation scaffold for the real VINZ.MON repository.

It is NOT a static reproduction of the app.

The central rule is:

> DESIGN.LAB previews the actual production React components inside a separate iframe document.

That iframe exists for isolation, not for visual imitation.

---

## Why iframe

Several VINZ.MON screens read from singleton Zustand state.

Rendering them directly beside the main app would share the same JS store instance and the same App effects.

A same-origin iframe gives DESIGN.LAB:

- a separate React tree;
- a separate Zustand module instance;
- the exact same CSS bundle;
- the exact same fonts;
- the exact same production components;
- clean selection geometry;
- CSS proposal injection without touching the parent app.

The iframe route must mount **instead of `<App />`**, so App-level sync / ingest / spontaneous-message effects do not run in the preview.

---

# Step 1 — add the preview route in `src/main.tsx`

Before rendering `<App />`, parse the query string.

Target architecture:

```tsx
import { DesignPreviewRoute } from './dev/design-lab/DesignPreviewRoute';
import type { DesignScreenId } from './dev/design-lab/types';

const params = new URLSearchParams(window.location.search);
const designPreview = params.get('design-preview') as DesignScreenId | null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {designPreview
        ? <DesignPreviewRoute screen={designPreview} />
        : <App />}
    </ErrorBoundary>
  </StrictMode>,
);
```

DO NOT put this check inside `App`.

If `<App />` mounts first, its effects have already run and preview isolation is lost.

---

# Step 2 — add DESIGN.LAB as a sibling Lab surface

Do not bury it under CREATION.LAB or SYSTEM.LAB.

The long-term structure is:

```text
CREATION.LAB
DESIGN.LAB
SYSTEM.LAB
```

In the current repository it may initially be exposed from DEV as one entry that mounts:

```tsx
<DesignLabShell onClose={...} />
```

The final information architecture can later replace the old DEV panel.

---

# Step 3 — preview real components only

`DesignPreviewRoute.tsx` imports production components directly.

It must NEVER contain hand-copied screen markup.

Allowed:

```tsx
<MeOverviewScreen ... />
<SplashScreen ... />
<MindlineMapScreen ... />
<DexScreen ... />
<IncubationScreen ... />
<EncounterScreen ... />
```

Forbidden:

```tsx
<div className="fake-me-card">...</div>
```

No duplicated product CSS in Design Lab.

`designLab.css` styles only the Lab shell.

---

# Step 4 — CHAT is a special case

The current product CHAT is:

```text
IntegratedChat
  → assistant-ui runtime
  → ChatSurface
  → ChatGPT
```

Do not mount `IntegratedChat` in the design iframe because it performs storage migration and uses server-backed thread storage.

Instead mount:

```text
AssistantRuntimeProvider
  → memory-only preview runtime
  → REAL ChatSurface
```

The actual chat JSX/CSS stays the same.

Only the data/runtime adapter is fake.

No model request is needed for a visual preview.

---

# Step 5 — inspection mode intercepts clicks

The preview iframe loads `DesignInspectorBridge`.

When INSPECT is ON:

- pointer hover draws an orange dashed outline;
- click is captured before the product receives it;
- the selected element is sent to the parent with `postMessage`;
- no production click handler runs.

When INTERACT is ON:

- selection overlay is disabled;
- the user can use local UI state such as:
  - ME OGGI / DIETA / SPORT;
  - node selection inside MIND.MAP;
  - Dex local selection;
- state-changing actions that touch global product data must still be disabled in preview mode.

---

# Step 6 — map DOM selection back to source

First use existing metadata:

```text
data-pezzo
data-slot
aria-label
className
```

Then enrich with a registry.

Do not ask the language model to guess ownership from pixels.

For each selected component provide:

```text
screen
component
source file
classes
computed styles
relevant tokens
reuse locations
current Design Lab patch stack
```

---

# Step 7 — proposals are CSS/structure patches, not arbitrary code execution

The Design AI backend returns a structured object.

Example:

```json
{
  "target": "TabBar",
  "scope": "component",
  "files": ["src/system/system.css"],
  "humanDiff": [
    "active pill border 1px → 2px",
    "pill geometry 22px radius → clipped rectangular form"
  ],
  "cssText": "...",
  "behaviorChange": false
}
```

Never `eval()` or execute model-generated JS inside the preview.

For purely visual changes, inject the proposed CSS into:

```html
<style id="vinz-design-lab-patch">
```

inside the iframe.

For structural proposals, create a typed Lab override layer or a real branch patch preview. Do not mutate production JSX on chat submit.

---

# Step 8 — A/B

A/B is two preview iframes:

```text
A
same screen
same snapshot
R0/current Design Lab state

B
same screen
same snapshot
+ proposed patch
```

Do not compare two independently generated app states.

---

# Step 9 — Design Lab versions

`APPLY TO LAB` stores:

```text
version id
parent version
screen
selection
user request
AI explanation
structured patch
human diff
affected files/tokens
timestamp
A/B feedback
```

This lives under a Design Lab storage key.

It does NOT edit GitHub.

---

# Step 10 — explicit production promotion only

Later:

```text
IMPLEMENT IN VINZ.MON
```

can hand the approved patch to Codex / an implementation agent.

That is a separate action.

DESIGN.LAB conversation itself never writes production code.

---

# Current repository facts used by this scaffold

- Root UI is React, mounted by `src/main.tsx`.
- Current live top-level tabs are CHAT / MON / ME.
- MON contains VINZ.MON / MIND.MAP / MIND.DEX.
- ME currently renders `MeOverviewScreen` with OGGI / DIETA / SPORT internally.
- CHAT uses the isolated assistant-ui clone.
- App-level effects include sync/ingest/runtime behaviors, so preview routing must happen before `<App />`.
