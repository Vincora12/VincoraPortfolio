
# AI VISUAL PROPOSAL RULE — MANDATORY

Whenever an AI proposes or refines an expression, it must first inspect:

`soul-lab/reference/soul-master-sketch.png`

and treat it as the primary visual source of truth.

The AI must stay inside the user's character-design language. It must not redesign the Soul into a generic emoji, generic blob, cute assistant mascot, anime face, or corporate avatar.

Its role is to propose an editable starting point for:
- face geometry;
- sphere deformation;
- color response;
- emotional motion.

The user remains the final art director and manually approves or edits every proposal.

If uncertain, prefer less detail and stronger graphic simplicity.

# SOUL v1 — IMPLEMENTATION BRIEF
Version: 3.0
Status: CANONICAL DIRECTION

## 0. Decision

The new Soul is a **2D vector character** based on the user's hand-drawn reference:

```text
soul-lab/reference/soul-master-sketch.png
```

This image is the visual source of truth for Soul v1.

Do not redesign the concept into a generic emoji or generic blob mascot.

The Soul must preserve the visual idea from the sketch:

```text
round floating body
+
single upward flame / wisp tail
+
simple expressive eyes
+
simple graphic mouth
```

The Soul is radically simple.

---

# 1. Canonical visual construction

## BODY

- round / slightly imperfect circular body
- compact
- not a perfect geometric UI icon
- must feel hand-drawn / characterful rather than sterile
- no limbs
- no torso
- no clothing
- no accessories

## TOP WISP

The upper shape is essential.

It is not hair.

It is not a horn.

It is the Soul's flame / vapor / energy tail.

It should:
- emerge from the body;
- bend softly;
- have one main directional gesture;
- preserve the sketch's zig-zag / flame character;
- animate independently with subtle lag.

## FACE

Exactly:

```text
2 eyes
1 mouth
```

No nose.

No eyebrows unless an expression absolutely requires a temporary graphic mark.

Eyes and mouth are flat graphic strokes/shapes.

---

# 2. Color system

The Soul has two primary colors:

```text
BODY COLOR
FACE COLOR
```

BODY COLOR derives from the active `.mon`.

Recommended runtime source priority:

```text
1. Palette DNA primary
2. --char-primary
3. --char-accent
4. Soul fallback
```

FACE COLOR is a contrast color.

For v1, allow:

```text
AUTO CONTRAST
MANUAL TEST OVERRIDE
```

Do not permanently bind the Soul to purple/green from the sketch.

Those colors are only the reference example.

---

# 3. Mood system

Mood changes Soul color gently.

Do not replace the base identity color.

Allowed modulation:

```text
hue shift         ±8°
saturation        ±16%
lightness         ±8%
face contrast     ±10%
```

Examples:

```text
tired
→ slightly less saturated
→ slightly lower motion energy

excited
→ slightly more saturated
→ slightly higher motion energy

irritated
→ slightly darker / tighter
→ sharper expression timing
```

Do not use cliché fixed mappings like:
sad = blue
angry = red
happy = yellow

---

# 4. Expression system

Expressions are procedural states of the SAME face.

Initial set:

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

The first three canonical references already visible in the sketch:

```text
LEFT
sleepy / annoyed

CENTER
neutral / deadpan

RIGHT
angry
```

These should be treated as anchor expressions.

---

# 5. Face parameters

The renderer should not store separate images for each expression.

Use a small parameter model:

```ts
type SoulFaceState = {
  leftEyeOpen: number;
  rightEyeOpen: number;
  leftEyeTilt: number;
  rightEyeTilt: number;
  pupilVisible: boolean;
  mouthType:
    | 'flat'
    | 'zigzag'
    | 'down'
    | 'up'
    | 'open'
    | 'fang'
    | 'small';
  mouthWidth: number;
  mouthOpen: number;
  mouthTilt: number;
};
```

The exact API may change during implementation, but the principle must not.

---

# 6. Motion system

Soul motion is made of independent layers:

```text
FLOAT
WISP
BREATH
BLINK
REACTION
TALK
```

## FLOAT
slow vertical movement

## WISP
top flame/tail follows with small delay

## BREATH
tiny scale pulse

## BLINK
occasional eye compression

## REACTION
short squash/stretch / tilt for current reply cue

## TALK
tiny mouth pulse while text/audio is being emitted

Do not make the Soul constantly bouncy.

---

# 7. Reply expression cue

The conversational model should provide one small hidden metadata object with the reply.

Target:

```ts
type SoulCue = {
  expression: SoulExpression;
  intensity: number; // 0..1
  energy: number;    // 0..1
};
```

One runtime AI call should produce:

```text
visible reply
+
SoulCue
```

Do not create a second model call only to infer emotion.

---

# 8. Rendering technology

Active decision:

```text
React
+
SVG
+
CSS / Web Animations
```


The Soul should be ultra-light.

---

# 9. Canonical component structure

Recommended:

```text
src/soul/
  Soul.tsx
  SoulBody.tsx
  SoulFace.tsx
  SoulWisp.tsx
  SoulController.ts
  SoulMoodAdapter.ts
  soulExpressions.ts
  soulRules.ts
  soul.css
  types.ts
```

Separation:

```text
SoulController
→ resolves state

SoulBody
→ body shape only

SoulWisp
→ top wisp shape/motion

SoulFace
→ eyes + mouth

Soul
→ composition
```

---

# 10. SOUL.LAB

SOUL.LAB is now a 2D visual editor.

Tabs:

```text
LIVE
SHAPE
FACE
MOTION
COLOR
HISTORY
```

## LIVE

Large current Soul preview.

Controls:
- expression
- speaking
- mood
- current mon color
- intensity
- energy

## SHAPE

Controls:
- overall size
- roundness
- body width
- body height
- wisp height
- wisp width
- wisp bend
- wisp lean
- wisp tip sharpness
- body/wisp join softness

## FACE

Controls:
- expression
- eye spacing
- eye width
- eye height
- eye tilt
- asymmetry
- mouth type
- mouth width
- mouth height
- mouth tilt
- face vertical position

## MOTION

Controls:
- float amplitude
- float duration
- breath amount
- breath duration
- wisp sway amount
- wisp sway duration
- blink interval
- blink duration
- talk pulse
- reaction squash
- reaction tilt

## COLOR

Controls:
- body test color
- face color
- auto contrast
- hue mood shift
- saturation mood response
- lightness mood response

## HISTORY

R0 + V1/V2/V3...

---

# 11. Manual editor principle

The user wants to be able to manually tune the Soul like a small visual app.

Every meaningful visual parameter must be exposed.

The Lab should be optimized for experimentation.

Every control must update the SVG immediately.

The user must be able to reset:
- one section;
- all sections;
- current expression.

---

# 12. SAVE SNAPSHOT

SOUL.LAB must have:

```text
SAVE SNAPSHOT
```

It generates:

```text
soul-v1-tuning.json
soul-v1-handoff.txt
```

The JSON contains every active parameter.

The handoff text explains the approved visual result in human-readable language.

This is the data the user can send back to ChatGPT / Codex for definitive implementation.

---

# 13. Snapshot schema

Suggested:

```json
{
  "version": "SOUL_V1",
  "reference": "soul-master-sketch.png",
  "shape": {
    "size": 1,
    "bodyWidth": 1,
    "bodyHeight": 1,
    "roundness": 1,
    "wispHeight": 1,
    "wispWidth": 1,
    "wispBend": 0,
    "wispLean": 0
  },
  "face": {
    "expression": "neutral",
    "eyeSpacing": 1,
    "eyeWidth": 1,
    "eyeHeight": 1,
    "eyeTilt": 0,
    "mouthType": "flat",
    "mouthWidth": 1,
    "mouthTilt": 0
  },
  "motion": {
    "floatAmplitude": 4,
    "floatDurationMs": 4200,
    "breathAmount": 0.015,
    "wispSway": 0.08,
    "blinkIntervalMs": 4200,
    "talkPulse": 0.06,
    "reactionSquash": 0.08
  },
  "color": {
    "bodySource": "MON_PRIMARY",
    "bodyTest": "#8A00FF",
    "face": "#18F5B4",
    "autoContrast": false
  }
}
```

---

# 14. Boundary with other Labs

## CREATION.LAB
owns the `.mon`.

## SOUL.LAB
owns the Soul itself.

## DESIGN.LAB
owns where Soul appears in product UI.

## SYSTEM.LAB
owns actual runtime Mood and AI routing.

Examples:

```text
Soul wisp shape
→ SOUL

Soul eye style
→ SOUL

Soul float motion
→ SOUL

Soul position above chat composer
→ DESIGN

runtime Mood value
→ SYSTEM

Mood → Soul saturation mapping
→ SOUL
```

---

# 15. Definition of done for Soul v1

```text
✓ visually based on the user's sketch
✓ 2D SVG
✓ one body + one wisp
✓ procedural eyes/mouth
✓ anchor expressions match the sketch
✓ live manual controls
✓ color follows current .mon
✓ mood modulation
✓ float/wisp/blink/talk motion
✓ Save Snapshot
✓ JSON handoff
✓ text handoff
```
