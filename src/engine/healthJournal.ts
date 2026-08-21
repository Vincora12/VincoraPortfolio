export type MealLog = {
  id: string;
  at: string;
  slot: 'colazione' | 'pranzo' | 'cena' | 'spuntino';
  description: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  source: 'chat' | 'manual';
};

export type WorkoutLog = {
  id: string;
  at: string;
  title: string;
  details: string;
  minutes: number;
  source: 'chat' | 'manual';
};

export type WeightLog = { id: string; at: string; kg: number; source: 'chat' | 'manual' };
export type HealthJournal = {
  meals: MealLog[];
  workouts: WorkoutLog[];
  weights: WeightLog[];
  dietPlan: { title: string; text: string; updatedAt: string } | null;
  targets: { kcal: number; protein: number; carbs: number; fat: number };
};

const KEY = 'vinzmon.health.journal.v1';
export const HEALTH_JOURNAL_EVENT = 'vinzmon-health-journal';
const EMPTY: HealthJournal = {
  meals: [], workouts: [], weights: [], dietPlan: null,
  targets: { kcal: 2200, protein: 150, carbs: 275, fat: 73 },
};

export function readHealthJournal(): HealthJournal {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '') as Partial<HealthJournal>;
    return {
      ...EMPTY, ...saved,
      meals: Array.isArray(saved.meals) ? saved.meals : [],
      workouts: Array.isArray(saved.workouts) ? saved.workouts : [],
      weights: Array.isArray(saved.weights) ? saved.weights : [],
      targets: { ...EMPTY.targets, ...(saved.targets ?? {}) },
    };
  } catch { return EMPTY; }
}

function save(next: HealthJournal): HealthJournal {
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(HEALTH_JOURNAL_EVENT));
  return next;
}

const id = (kind: string) => `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function addMeal(input: Omit<MealLog, 'id' | 'at' | 'source'>, source: MealLog['source'] = 'chat') {
  const journal = readHealthJournal();
  return save({ ...journal, meals: [...journal.meals, { ...input, id: id('meal'), at: new Date().toISOString(), source }] });
}

export function addWorkout(input: Omit<WorkoutLog, 'id' | 'at' | 'source'>, source: WorkoutLog['source'] = 'chat') {
  const journal = readHealthJournal();
  return save({ ...journal, workouts: [...journal.workouts, { ...input, id: id('workout'), at: new Date().toISOString(), source }] });
}

export function addWeight(kg: number, source: WeightLog['source'] = 'chat') {
  const journal = readHealthJournal();
  return save({ ...journal, weights: [...journal.weights, { id: id('weight'), at: new Date().toISOString(), kg, source }] });
}

export function setDietPlan(title: string, text: string) {
  const journal = readHealthJournal();
  return save({ ...journal, dietPlan: { title, text, updatedAt: new Date().toISOString() } });
}

export function removeHealthEntry(kind: 'meal' | 'workout' | 'weight', entryId: string) {
  const journal = readHealthJournal();
  return save({
    ...journal,
    meals: kind === 'meal' ? journal.meals.filter((item) => item.id !== entryId) : journal.meals,
    workouts: kind === 'workout' ? journal.workouts.filter((item) => item.id !== entryId) : journal.workouts,
    weights: kind === 'weight' ? journal.weights.filter((item) => item.id !== entryId) : journal.weights,
  });
}
