# VINZ.MON — Codex Rules

## Work
- Make the smallest correct change.
- Preserve existing UI and behavior unless explicitly requested.
- No unrelated refactors.
- No new dependencies unless necessary.
- Search relevant references, callers, consumers and persistence paths before changing shared code.
- Inspect additional files when required for correctness.
- Avoid unrelated repository exploration.
- If scope is materially larger than requested, stop before editing.

## Architecture
- VINZ.MON and VINZ.LAB are two interfaces of the same system.
- Shared runtime data must have one canonical server-side source.
- Local storage may be used as cache/fallback, not as competing truth for shared data.
- Do not invent architectural concepts that do not already exist unless explicitly requested.

## Safety
- Never overwrite or redesign existing UI unintentionally.
- Preserve working features.
- Run minimum relevant validation after changes.

## Output
Do not narrate work or explain reasoning.
Final response only:

DONE
files: [...]
validation: PASS/FAIL

If blocked:

BLOCKED
reason: one sentence
