# CURRENT MILESTONE OVERRIDE

Read `SOUL_EXPRESSION_STUDIO_SPEC.md` first.

For the current milestone, render **sphere + face only**.
The top wisp/tail is intentionally deferred until the expression system is approved.

---

# SOUL.LAB — CANONICAL SPEC
Version: 3.3
Status: ACTIVE

## Purpose

SOUL.LAB owns the living visual Soul of VINZ.MON.

The canonical visual reference is:

```text
soul-lab/reference/soul-master-sketch.png
```

The Soul is a lightweight 2D vector character made of:

```text
round floating body
+
single upward wisp
+
two eyes
+
one mouth
```

This is the active and only Soul direction in the package.

---

# 1. Visual lock

Preserve the hand-drawn identity:

- compact circular body;
- one energetic wisp rising from the top;
- two graphic eyes;
- one graphic mouth;
- simple, bold, readable silhouette;
- no body parts beyond the orb/wisp construction.

The Soul should remain recognizable even at small UI sizes.

---

# 2. Rendering

Use:

```text
React
SVG
CSS / Web Animations
```

The Soul must be light enough to remain present during chat without becoming a performance burden.

---

# 3. Color

The Soul body inherits the active `.mon` color.

Priority:

```text
Palette DNA primary
→ --char-primary
→ --char-accent
→ Soul fallback
```

The face uses a contrasting color.

Mood may slightly adjust:

```text
hue
saturation
lightness
contrast
```

but must not replace the `.mon` color identity.

---

# 4. Expressions

Initial expressions:

```text
neutral
sleepy
annoyed
angry
amused
skeptical
happy
excited
sad
concerned
surprised
deadpan
```

Anchor expressions from the user's sketch:

```text
sleepy / annoyed
neutral / deadpan
angry
```

Expressions are procedural variations of the same face, not separate raster assets.

---

# 5. Face controls

Expose:

```text
expression
eye spacing
eye width
eye height
eye tilt
mouth type
mouth width
mouth tilt
```

Mouth types:

```text
flat
zigzag
up
down
open
fang
small
```

---

# 6. Shape controls

Expose:

```text
overall size
body width
body height
roundness
wisp height
wisp width
wisp lean
wisp bend
```

The body remains fundamentally circular.

The wisp is the main silhouette accent.

---

# 7. Motion

Motion layers:

```text
FLOAT
BREATH
WISP SWAY
BLINK
REACTION
TALK
```

Expose:

```text
float amplitude
float duration
breath amount
wisp sway amount
wisp sway duration
blink interval
blink duration
talk pulse
reaction squash
reaction tilt
```

Motion should feel alive but restrained.

---

# 8. Mood

SYSTEM.LAB owns the real runtime Mood.

SOUL.LAB owns only how Mood affects the Soul visually.

Use a normalized adapter such as:

```ts
type SoulMoodVector = {
  valence: number;
  arousal: number;
  tension: number;
  fatigue: number;
};
```

This is a rendering adapter, not a new canonical personality system.

---

# 9. Reply cue

The current reply may provide:

```ts
type SoulCue = {
  expression: SoulExpression;
  intensity: number;
  energy: number;
};
```

The preferred runtime architecture is:

```text
one conversational AI call
→ visible reply
+ SoulCue metadata
```

No additional model call is required only to choose the face.

---

# 10. SOUL.LAB navigation

Tabs:

```text
LIVE
SHAPE
FACE
MOTION
COLOR
HISTORY
```

LIVE is the main playground.

SHAPE edits body/wisp geometry.

FACE edits expression construction.

MOTION edits idle/reaction behavior.

COLOR edits inheritance and contrast behavior.

HISTORY stores Soul versions.

---

# 11. Manual editing

Every meaningful visual value should be manually adjustable.

The user must be able to:

- change a value;
- see it immediately;
- reset one area;
- reset all;
- compare states;
- save an approved snapshot.

---

# 12. Save Snapshot

SOUL.LAB must create:

```text
soul-v1-tuning.json
soul-v1-handoff.txt
```

The JSON is the complete technical state.

The handoff is a concise readable summary that can be sent back to ChatGPT or Codex for final implementation.

R0 remains the canonical starting point.

Every approved change can create:

```text
SOUL V1
SOUL V2
SOUL V3
...
```

---

# 13. Lab ownership

```text
CREATION.LAB
→ the `.mon`

SOUL.LAB
→ the Soul's own shape, face, color reaction and motion

DESIGN.LAB
→ where/how the Soul appears in product UI

SYSTEM.LAB
→ runtime Mood and model routing
```

Examples:

```text
wisp shape
→ SOUL

eye expression
→ SOUL

Soul float
→ SOUL

Soul position above composer
→ DESIGN

current runtime Mood
→ SYSTEM

Mood → Soul saturation response
→ SOUL
```

---

# 14. Definition of done

```text
✓ based on the user's master sketch
✓ vector Soul
✓ one body + one wisp
✓ procedural expressions
✓ small-size readability
✓ manual Soul Lab controls
✓ `.mon` color inheritance
✓ Mood visual modulation
✓ reply SoulCue support
✓ motion system
✓ Save Snapshot
✓ JSON handoff
✓ readable handoff brief
```


## AI character-design rule

Any AI used in SOUL.LAB must inspect and follow:

`soul-lab/reference/soul-master-sketch.png`

before proposing expression graphics.

The AI proposes within the user's visual language.
It does not redesign the Soul.
The user remains the final art director.

