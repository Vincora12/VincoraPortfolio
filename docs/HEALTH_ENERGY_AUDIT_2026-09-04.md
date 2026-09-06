# HEALTH ENERGY AUDIT — 2026-09-04

Companion to the "relax" workout-classification fix (same task). Traced
what data actually exists for a Daily Energy model, before implementing
anything — per the task's own instruction not to invent a calorie model
just because it was asked about.

## What exists, verified against `src/engine/healthJournal.ts`

| Field | Status | Evidence |
|---|---|---|
| Food intake (kcal/protein/carbs/fat) | **AVAILABLE** | `MealLog.kcal/protein/carbs/fat`, summed per game-day in `MeOverview.tsx` |
| Workout burn (kcal) | **AVAILABLE, DERIVED** | `WorkoutLog.burnedKcal?` — an AI *estimate* (`healthEstimate.ts`), not a measurement; explicitly optional in the type; was never summed or displayed anywhere before this task |
| Weight | **AVAILABLE** | `WeightLog.kg`, latest reading read via `journal.weights.at(-1)` |
| Height | **MISSING** | No field anywhere in `HealthJournal` or any other engine/store type. Confirmed by a repo-wide search — the only `height`/`altezza` hits are SVG element attributes, unrelated. |
| Age | **MISSING** | Same search, no hits. |
| Sex / physiological profile | **MISSING** | Same search, no hits. |
| Activity baseline (non-workout daily activity, NEAT) | **MISSING** | No concept of this exists in the app at all. |
| Calorie target | **AVAILABLE, but NOT APPROPRIATE as TDEE** | `HealthJournal.targets.kcal` (default 2200, user-configurable via `configureHealthTargets`). This is a **food intake target** the user sets for their diet — it is not derived from BMR/activity and the code never claims it is. Using it as a stand-in for TDEE would be inventing a definition the codebase doesn't have. |
| BMR (basal metabolic rate) | **MISSING** | No formula exists; computing one would need height+age+sex, all missing. |
| TDEE (total daily energy expenditure) | **MISSING** | Depends on BMR + activity baseline, both missing. |
| Energy balance (intake − TDEE) | **MISSING** | Depends on TDEE, which is missing. Cannot be computed honestly today. |

## Why this stops here

Per the task's own explicit rule: don't invent BMR/TDEE from data the app
doesn't have, and don't equate the food-intake target with TDEE unless the
code already defines them as the same thing (it doesn't — `targets.kcal`
is documented and used purely as a diet goal, never as an expenditure
estimate). The missing inputs (height, age, sex, activity baseline) are
"personal inputs required for a valid Daily Energy model" — one of this
task's own explicit stop conditions. There is no reversible technical
decision that produces a real TDEE from data that isn't collected.

## What was implemented instead (the smallest honest step)

Today's estimated workout kcal burned is now summed and shown in
`MeOverview.tsx`'s "OGGI" tab, as its own row — **"ALLENAMENTO · STIMA,
NON MISURA"** — visually separate from and never combined with the
existing "ENERGIA" (food intake vs. target) figure. Both numbers already
had an honest calculation basis (a straight sum of stored, per-entry
values); showing them side by side, unmerged, doesn't invent anything
that wasn't already true — it just makes visible a number
(`burnedKcal`) that was already being stored and estimated but never
surfaced anywhere.

No "deficit," "surplus," "balance," or "total daily expenditure" label
was added anywhere. None would be honest with today's data.

## What a real Daily Energy model would need (not built here)

If this becomes a real feature later, the minimum new inputs are:

1. Height, age, sex (or an equivalent physiological profile) — needed for
   any standard BMR formula (e.g. Mifflin-St Jeor).
2. An activity-level baseline (sedentary/light/moderate/active, or
   similar) — needed to turn BMR into TDEE for a non-measured day.
3. An explicit UI/data-model decision about where this profile lives
   (likely alongside `HealthJournal.targets`, still Client/Web-primary per
   `docs/CORE_BOUNDARY.md` §6 — Health Journal is not a Core concept yet).
4. A clearly-labeled estimate contract: BMR/TDEE must always render with
   an "estimated" qualifier, matching the existing convention already set
   by `WorkoutLog.burnedKcal`'s own doc comment ("non sostituisce una
   misura da wearable").

None of this was built in this task — collecting new personal
physiological data is a real product decision, correctly out of scope
here.
