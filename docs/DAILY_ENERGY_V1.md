# Daily Energy and personal calendar V1

`src/engine/dailyEnergy.ts` is the deterministic calculation owner for UI and chat tools. It is pure and does not write health data, call AI, infer demographic values, or prescribe intake.

- FOOD KCAL: sum of recorded meals for the selected local day.
- WORKOUT KCAL: sum of available recorded workout energy for that day.
- RECORDED NET: food minus recorded workouts. This is not actual deficit/surplus or remaining calories; logs can be incomplete.
- Workout energy defaults to ESTIMATE, including legacy rows. MEASURED requires explicit `energySource: measured`; missing calories are counted and shown as unknown, not invented.
- Adult resting expenditure uses the simplified Mifflin–St Jeor formula: 10×kg + 6.25×cm − 5×age + sex coefficient (+5/-161). Source: https://pubmed.ncbi.nlm.nih.gov/2305711/
- An estimated TDEE is returned only with valid supplied adult age, height, formula sex, weight and non-workout activity factor, and no unknown workout energy. Weight alone can be read from the most recent eligible journal row and its date/source are exposed. No personal defaults are inserted.
- The activity factor must exclude separately logged exercise. TDEE = estimated resting expenditure × supplied non-workout factor + recorded workout energy. Neither BMR nor TDEE is a measurement. Unsupported/missing inputs return `missing` and null estimates; no dietary target or deficit is manufactured.

## Calendar ownership

ME's top-level tabs are OGGI, CALENDARIO and MEMORY. Diet/workout plans remain available under CALENDARIO. Completed health rows remain in the existing health journal; historical selected-day registration uses the same TodayChecklist editor and IDs, not copied history.

Planned calendar events are a separate domain in `src/engine/calendarEvents.ts`. `/api/calendar` uses existing shared authorization and site-scoped `vinzmon-calendar` Blobs. Each event has one `event:<id>` key and conditional writes; stale edits return 409 instead of overwriting another client's revision. Create retries reuse their ID. Cancellation retains the record. A planned meal/workout never changes health totals or SYNC. No Google/Gmail adapter, recurrence scheduler or external notification is claimed.

Memory UI only projects the existing `/api/me-memory` service: bounded rendering, search within fetched records, explicit unknown provenance/confirmation, separate empty/error/auth states. It does not introduce another memory store or pretend that the current API exposes mutation/forget capabilities.

## Checks

- `node scripts/health-energy-check.mjs`: deterministic arithmetic, bounds, missing fields, source labels, selected-day isolation, calendar input validation.
- `node scripts/calendar-check.mjs`: function contract with fixture Blob; authentication, conditional update conflicts, duplicate prevention, cancel/read-back, failures.
- `node scripts/health-ui-check.mjs`: local Vite on port 5181 and installed Chrome; isolated real ME component, fixture endpoints, mobile/desktop screenshots under `/tmp`. Not a claim about authenticated production or real personal records.

Production data/provider verification is separate from these local fixture checks.
