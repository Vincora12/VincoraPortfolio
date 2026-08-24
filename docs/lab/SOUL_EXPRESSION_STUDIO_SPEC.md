# SOUL.LAB v3.3 — EXPRESSION STUDIO

## Scope

This milestone deliberately excludes the top tail / wisp.

The active object is:

```text
ONE SPHERE
+
FACE
```

The user and ChatGPT will finish:
- the graphic construction of every expression;
- the emotional deformation of the sphere;
- the emotional color modulation;
- the motion behavior attached to each expression.

The tail will be attached later as an independent visual layer.

## Core idea

An emotion is not only a face.

```text
EMOTION PRESET
=
FACE
+
BODY DEFORMATION
+
BODY MOTION
+
COLOR RESPONSE
```

## Initial editable expression library

```text
neutral
happy
annoyed
angry
sleepy
sad
excited
amused
```

Each expression stores its own:

### FACE
- left eye openness
- right eye openness
- eye spacing
- eye width
- eye height
- independent left/right tilt
- mouth type
- mouth width
- mouth vertical position
- mouth tilt
- overall face vertical offset
- stroke width

### BODY
- scale X
- scale Y
- vertical offset
- body tilt
- bounce amplitude
- bounce duration
- pulse amount
- pulse duration

### COLOR
- saturation multiplier
- brightness multiplier

Global test palette:
- body color
- face color

## Runtime test

The studio exposes:

```text
expression
intensity 0..1
energy 0..1
```

`intensity` blends the selected preset from NEUTRAL.

`energy` modulates the strength / speed of motion.

This mirrors the future chat contract:

```ts
type SoulCue = {
  expression: SoulExpression;
  intensity: number;
  energy: number;
}
```

## Save

`SAVE SNAPSHOT` exports the full expression system as:

```text
soul-expression-system-v1.json
```

This JSON is the handoff for definitive implementation.

## Important

Do not add the tail in this milestone.
Do not replace the sphere with another silhouette.
Do not make the AI invent facial graphics at runtime.

The visual language of every expression is manually approved in SOUL.LAB.


## AI proposal mode

For each expression, the AI may propose the first visual solution.

Mandatory context:
- master reference: `soul-lab/reference/soul-master-sketch.png`
- target emotion
- current preset, if one exists

Required flow:

SELECT EXPRESSION
→ ASK AI FOR PROPOSAL
→ AI READS MASTER REFERENCE
→ AI PROPOSES FACE + BODY + COLOR + MOTION PARAMETERS
→ PREVIEW
→ USER ART-DIRECTS / CORRECTS
→ SAVE EXPRESSION

The proposal must remain visibly inside the reference's character-design language.
It is always editable before save.
