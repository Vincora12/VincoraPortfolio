import type { HealthJournal, WorkoutLog } from './healthJournal';

/** Actual supplied inputs only. Activity factor excludes separately logged workouts. */
export interface EnergyProfile {
  ageYears?: number;
  heightCm?: number;
  weightKg?: number;
  formulaSex?: 'male' | 'female';
  nonWorkoutActivityFactor?: number;
}

const valid = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const positive = (value: number | undefined) => valid(value, 0, 100000) ? value : 0;

export function workoutEnergyLabel(workout: WorkoutLog): string {
  if (!valid(workout.burnedKcal, 0, 100000)) return 'KCAL NON REGISTRATE';
  return `${Math.round(workout.burnedKcal)} kcal · ${workout.energySource === 'measured' ? 'MEASURED' : 'ESTIMATE'}`;
}

/**
 * Mifflin–St Jeor resting expenditure, adult estimate, not a measurement or
 * prescription. Original formula: https://pubmed.ncbi.nlm.nih.gov/2305711/
 * No activity factor, personal demographics or workout energy are inferred.
 * TDEE uses an explicitly supplied non-workout factor to avoid double counting.
 */
export function calculateDailyEnergy(journal: Pick<HealthJournal, 'meals' | 'workouts' | 'weights'>, date: Date, profile: EnergyProfile = {}) {
  const day = dayKey(date);
  const meals = journal.meals.filter((item) => dayKey(new Date(item.at)) === day);
  const workouts = journal.workouts.filter((item) => dayKey(new Date(item.at)) === day);
  const foodKcal = Math.round(meals.reduce((sum, meal) => sum + positive(meal.kcal), 0));
  const workoutKcal = Math.round(workouts.reduce((sum, workout) => sum + positive(workout.burnedKcal), 0));
  const unknownWorkoutCount = workouts.filter((item) => !valid(item.burnedKcal, 0, 100000)).length;
  const endOfDay = new Date(date); endOfDay.setHours(23, 59, 59, 999);
  const latestWeight = [...journal.weights].filter((item) => new Date(item.at).getTime() <= endOfDay.getTime() && valid(item.kg, 20, 400))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];
  const weightKg = profile.weightKg ?? latestWeight?.kg;
  const missing: string[] = [];
  if (!valid(profile.ageYears, 18, 100)) missing.push('ageYears (adult 18–100)');
  if (!valid(profile.heightCm, 100, 250)) missing.push('heightCm');
  if (!valid(weightKg, 20, 400)) missing.push('weightKg');
  if (profile.formulaSex !== 'male' && profile.formulaSex !== 'female') missing.push('formulaSex');
  const restingKcal = missing.length === 0
    ? Math.round(10 * weightKg! + 6.25 * profile.heightCm! - 5 * profile.ageYears! + (profile.formulaSex === 'male' ? 5 : -161))
    : null;
  if (!valid(profile.nonWorkoutActivityFactor, 1, 2.5)) missing.push('nonWorkoutActivityFactor (excludes logged workouts)');
  if (unknownWorkoutCount) missing.push(`workoutKcal (${unknownWorkoutCount} records missing)`);
  const tdeeKcal = restingKcal !== null && valid(profile.nonWorkoutActivityFactor, 1, 2.5) && unknownWorkoutCount === 0
    ? Math.round(restingKcal * profile.nonWorkoutActivityFactor + workoutKcal) : null;
  return {
    foodKcal, workoutKcal, recordedNetKcal: foodKcal - workoutKcal,
    mealCount: meals.length, workoutCount: workouts.length, unknownWorkoutCount,
    workoutReliability: workouts.length && workouts.every((item) => item.energySource === 'measured' && valid(item.burnedKcal, 0, 100000)) ? 'MEASURED' : 'ESTIMATED',
    restingKcal, tdeeKcal, formula: 'Mifflin–St Jeor (adult resting expenditure estimate)',
    estimateReliability: 'ESTIMATED', missing,
    weightSource: profile.weightKg !== undefined ? 'supplied' : latestWeight ? 'health-journal' : 'missing',
    weightRecordedAt: profile.weightKg === undefined ? latestWeight?.at ?? null : null,
    caveat: 'Recorded net is only food minus recorded workout energy, not actual deficit/surplus or remaining calories. Logs can be incomplete. TDEE is an estimate, not a dietary prescription.',
  };
}
