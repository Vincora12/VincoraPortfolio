# VINZ.MON — CREATION MODEL

## Important distinction

The current code has more than one thing that can casually be called "resolver".

The authoritative `characterGenerator.ts` creates the canonical **CharacterData**.
That already includes identity decisions such as Family, Archetype, Affinity, Size, Role, Fashion, Mood, Appearance, Character Design DNA, Cultural DNA, Heritage, Character DNA, palette, Voice DNA, rarity and name.

After CharacterData exists, the visual **Creative Resolver** resolves how that canonical creature should be translated into visual construction decisions.

So:

```text
USER / MINDLINE STATE
        ↓
CHARACTER GENERATOR
        ↓
CHARACTER DATA
        ├── Voice DNA
        ├── rarity
        ├── name
        ├── Character DNA
        └── identity fields
        ↓
MON RECORD DERIVATIONS
        ├── deterministic Bio
        ├── Sigil
        └── text Reactions
        ↓
CREATIVE RESOLVER
        ↓
saved Creative Resolution
        ↓
PROMPT COMPILER
        ↓
ASSETS
  CEL MASTER
  TOY
  BIO DOODLE
  EXPRESSION SHEET
```

Optional AI-written Bio sits beside the deterministic Bio rather than deleting it.

Voice has two layers:

```text
CREATION TIME
Voice DNA → deterministic Voice Brief

RUNTIME
Voice Brief
+ current Mood
+ selected Memories
+ Opinions / accepted Voice Notebook notes
+ current conversation
→ actual reply
```

This means Voice DNA belongs to CREATION.LAB.
Current Mood and Memory inspection belong to SYSTEM.LAB.

## Canonical MonRecord

The current `MonRecord` contains, among other things:

- `data: CharacterData`
- `bio`
- `sigil`
- `reactions`
- optional `writtenBio`
- optional `resolution`
- optional `compiledPrompts`
- asset manifest status

CREATION.LAB should be designed around this complete record rather than around images alone.


## UX rule for CREATION.LAB

The UI must not summarize everything before the Creative Resolver into one "Character Data" block.

The complete creation journey is the timeline.

A user must be able to click `Voice DNA`, `Palette DNA`, `Bio`, `Sigil`, `Creative Resolver`, etc. with the same level of detail and control.

This is important because the Lab is not merely a visual debugger. It is the control surface for the whole .mon creation system.


## Audited execution-order correction

The Lab must display **physical execution order**, even when canonical step IDs look out of sequence.

Important examples from the current generator:

- Humanoidity has canonical ID `5.5`, but is calculated after Appearance.
- Rarity Eligibility is canonically step `03`, but unlock context is actually evaluated after Voice DNA inside the rarity block.
- Character DNA and Palette DNA are generated back-to-back in the same generator block.
- `generation_reason_summary` is assembled as a CharacterData field.
- Bio, Sigil and Reactions are constructed immediately after CharacterData when the MonRecord is returned.
- Voice Brief is a deterministic on-demand translation of Voice DNA, not part of `generateMon()`.
- Written Bio is optional and created later, beside the deterministic Bio.
- Creative Resolver, Prompt Compiler and Assets are downstream visual pipeline stages, not part of the CharacterData generator.


## Current automatic hatch vs optional creation tools

The current production path does not automatically run the Creative Resolver.

Automatic:
`generateFirstMon/generateMon → MonRecord → promptFor → background image generation`.

Optional:
`resolveWithAi → CreativeResolution`,
`writeBio → writtenBio`,
`compileAssetPrompt → AI-written asset prompt`.

Runtime:
`Voice DNA → Voice Brief → current Mood/Memory/Opinions → conversational AI`.


## Controlled Lab testing

Conversational editing must not validate proposals on two independently generated creatures.

Use the canonical frozen Test Mon described in `TEST_MON_SPEC.md`.

The fixture is intentionally simple and uses existing values only.
A/B clones differ exclusively at the ownership boundary of the target under test.
