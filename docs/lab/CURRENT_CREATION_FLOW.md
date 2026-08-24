# CURRENT VINZ.MON CREATION FLOW

Legend:
- ⚙️ CODE
- 🧠 AI
- 🎨 IMAGE AI
- 🔀 CODE + AI
- ✅ automatic
- 🧪 optional
- 💬 runtime

## Automatic hatch today

```text
⚙️✅ hatch()
  → ⚙️✅ generateFirstMon()
  → ⚙️✅ CharacterData + Voice DNA
  → ⚙️✅ Bio base + Sigil + Reactions
  → ⚙️✅ MonRecord stored
  → ⚙️✅ queueRemoteGeneration()
  → ⚙️✅ promptFor(record, asset)
  → 🎨✅ Image AI, if token/backend are available
```

## Real but not automatic in hatch

```text
🔀🧪 Creative Resolver AI → record.resolution
🧠🧪 Written Bio AI → record.writtenBio
🧠🧪 Prompt Rewrite AI → record.compiledPrompts[asset]
```

## Runtime voice

```text
⚙️💬 Voice DNA → Voice Brief
+ Mood + selected Memory + Opinions + recent turns
→ 🧠💬 conversational AI
```

The Lab may expose all of these controls, but it must never imply that an optional AI call is already part of the automatic hatch.


## Lab A/B does not change production flow

The canonical Test Mon is a Lab fixture, not a production hatch rule.

It exists only to make controlled comparisons legible.
See `TEST_MON_SPEC.md`.
