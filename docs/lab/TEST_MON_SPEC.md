# VINZ.LAB — CANONICAL TEST MON v1

## Purpose

VINZ.LAB needs one deliberately boring, stable `.mon` fixture for controlled A/B tests.

This is **not** a production creature, not a new taxonomy, and not a new set of generation values.

The fixture exists only so a test can change ONE target while everything else stays visually and logically stable.

Example:

```text
TEST TARGET = VINZ DNA / EYEWEAR

A = current eyewear rule
B = proposed eyewear rule

EVERYTHING ELSE = identical
```

The goal is that if A and B look different, the difference can reasonably be attributed to the rule being tested.

---

## Hard rule: use existing canonical values only

Do not invent a new Family, Archetype, Affinity, Role, Fashion, Mood, Appearance,
Character Design DNA, Rarity or eyewear taxonomy for the fixture.

The current repository is the source of truth.

If any catalog value below is renamed or removed in production, the implementation must fail visibly and ask for the fixture to be updated. Do not silently substitute a different value.

---

## Neutral baseline

Use these values because they already exist in the current canonical generation config:

```text
FAMILY               ANGEL
ARCHETYPE            PUTTO
AFFINITY             ANGEL
SIZE                 TINY
ROLE                 SCOUT
FASHION              STREET
MOOD PRIMARY         CALM
MOOD SECONDARY       none
HUMANOIDITY          4
APPEARANCE           CEL
CHARACTER DESIGN DNA KEN SUGIMORI
RARITY               COMMON
HERITAGE             none
```

### Why these values

**ANGEL**
is the current test-phase Family and supports both hair and eyewear.

**PUTTO**
is the simplest current ANGEL Archetype:
simple small humanoid proportions, exactly two arms, two primary eyes, one short pair of wings, no extra anatomy.

**ANGEL affinity**
keeps the contamination inside the same celestial language rather than adding a second foreign anatomy.
The current Affinity rule also says additional anatomy may appear only when the selected Archetype permits it.
PUTTO does not permit extra anatomy, so this remains controlled.

**TINY**
is already the current test-phase size and keeps the character compact.

**SCOUT**
is an existing low-intrusion Role whose current translation is alert/lightweight/navigation behavior.
It does not intrinsically require a costume, weapon or large prop.

**STREET**
is the existing contemporary streetwear/skate Fashion.
It keeps the Test Mon visually close to VINZ.MON's everyday identity while remaining readable enough for controlled comparisons of eyewear, hair and styling.
The test harness must still lock every non-target styling value so STREET does not introduce uncontrolled differences between A and B.

**CALM**
is one of the current `NEUTRAL_MOODS`.
It gives low tension and steady openness, making face, eyewear and body changes easier to compare.

**Humanoidity 4**
is an existing canonical humanoidity level: clearly humanoid, readable head/face/torso/limbs, while still allowing selected non-human anatomy.
This keeps eyewear and facial changes easy to inspect.

**CEL**
is an existing canonical Appearance and the current Character Master language.

**KEN SUGIMORI**
is already the Character Design DNA locked by the current `TEST_PHASE`.
Do not create a new "neutral designer" value just for Lab.

**COMMON**
is an existing Rarity and is used to avoid unnecessary rarity-driven complexity in controlled tests.

**No Heritage**
prevents previous forms from contaminating the comparison.

---

## Generated fields: create once, then freeze

Do **not** hand-write fake Character DNA, Palette DNA, Voice DNA, name, generation reason, sigil, bio text, or reaction strings for this fixture.

Instead:

1. construct the baseline using the canonical existing values above;
2. use a stable Lab fixture seed, derived through the repository's existing seed helper from a stable string such as `VINZLAB_TEST_MON_V1`;
3. let the existing engine produce every remaining generated field;
4. save that result as the canonical Test Mon fixture;
5. clone that exact fixture for A and B.

This keeps the test realistic without allowing uncontrolled random differences between A and B.

The saved fixture should include at least:

```text
Character Data
Character DNA
Palette DNA
Voice DNA
name
generation reason
Bio base
Sigil
Reactions
```

A and B must share these byte-for-byte unless the test target explicitly owns one of them.

---

## Target override rule

A/B testing always works as:

```text
BASE TEST MON
        ↓ clone
      A     B
      │     │
 current   proposed
 target    target
      │     │
      └── all non-target state identical ──┘
```

Only the target being tested may change.

Examples:

### Testing VINZ DNA / EYEWEAR

Keep the entire Test Mon frozen.
Only the eyewear selection/configuration differs between A and B.

The visual generation should still follow the normal test pipeline for both sides.

### Testing HAIR

Same rule:
all fields identical except the hair-owned values.

### Testing VOICE DNA

Do not spend on images by default.
Use the same canonical Test Mon and same runtime context.
Only the Voice DNA proposal differs.
Generate paired text samples from the same user message/context.

### Testing a probability

A single visual A/B is insufficient to validate a probability such as
"prefer sunglasses over optical eyewear."

Run two checks:

1. **👁 VISUAL A/B**
   one controlled Test Mon, to verify that the intended visual direction was understood;

2. **📊 DISTRIBUTION CHECK**
   many cheap code-only samples with identical test conditions, to verify that the new weights actually change frequencies as intended.

The distribution check should not generate images.

---

## Important: eyewear example does not create a new taxonomy

The current repository has existing `EYEWEAR_CATEGORIES`, including values such as:

`SHIELD`, `WRAPAROUND`, `VISOR`, `ULTRA-NARROW`, `HIGH-FRAME`,
`OVERSIZED`, `MASK`, `RIMLESS`, `SCULPTURAL`, `SPORT PERFORMANCE`,
`OPTICAL EDITORIAL`, `TRANSPARENT/CRYSTAL`, `MIRRORED`, `TINTED`,
`ASYMMETRIC/MONO`, `INTEGRATED OPTICS`.

If the user says:

> "Voglio più occhiali da sole che da vista"

the Lab AI must inspect these existing values and the current selection logic.

It may propose changing weights or grouping existing categories for analysis,
but it must **not silently invent `SUNGLASSES` and `OPTICAL` as new generation outputs**.

If a new canonical axis is genuinely needed, the AI must present that as a schema/config change for explicit approval.

---

## Lab conversation behavior

When the user opens an editable step such as:

`VINZ DNA → EYEWEAR`

the Lab AI should receive scoped context containing:

- current canonical values for that step;
- current weights/rules;
- which other generation fields depend on it;
- relevant learned rules;
- recent test history for that step;
- the canonical Test Mon fixture;
- current generation-config version.

The AI may explain and propose.

It must not mutate config immediately.

Required interaction:

```text
USER
↓
AI EXPLAINS / PROPOSES
↓
SHOW DIFF
↓
🧪 PROVA
↓
A/B + optional distribution check
↓
USER FEEDBACK
↓
NEW PROPOSAL or APPLY
↓
explicit APPLY TO LAB
↓
new version of that config/step
```

No conversational message directly edits production.
