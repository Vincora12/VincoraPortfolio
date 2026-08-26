/* 🔒 `'dev'` NON È `'manual'`. `manual` dice che sei stato tu a scriverlo;
   `dev` dice che è stato il pannello DEV a dichiararlo al posto tuo, per
   simulare un giorno vissuto — la stessa onestà con cui `advanceOneDay`
   lascia UNKNOWN l'umore invece di indovinarlo. Confonderli vorrebbe dire
   che un giorno finto sembra un giorno che hai raccontato davvero tu. */
export type MealLog = {
  id: string;
  at: string;
  slot: 'colazione' | 'spuntino' | 'pranzo' | 'merenda' | 'cena' | 'extra';
  description: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  source: 'chat' | 'manual' | 'dev';
};

export type WorkoutLog = {
  id: string;
  at: string;
  title: string;
  details: string;
  minutes: number;
  source: 'chat' | 'manual' | 'dev';
};

export type WeightLog = { id: string; at: string; kg: number; source: 'chat' | 'manual' };
export type MeBlock = {
  id: string;
  section: 'today' | 'diet' | 'sport';
  type: 'text' | 'list' | 'calendar' | 'metric';
  title: string;
  content: string;
  items: string[];
  updatedAt: string;
};
export type HealthJournal = {
  meals: MealLog[];
  workouts: WorkoutLog[];
  weights: WeightLog[];
  dietPlan: { title: string; text: string; updatedAt: string } | null;
  workoutPlan: { title: string; text: string; updatedAt: string } | null;
  targets: { kcal: number; protein: number; carbs: number; fat: number };
  display: { focus: 'today' | 'diet' | 'sport' | 'progress'; goal: string };
  blocks: MeBlock[];
  blockHistory: MeBlock[][];
};

const KEY = 'vinzmon.health.journal.v1';
export const HEALTH_JOURNAL_EVENT = 'vinzmon-health-journal';
const EMPTY: HealthJournal = {
  meals: [], workouts: [], weights: [], dietPlan: null, workoutPlan: null,
  targets: { kcal: 2200, protein: 150, carbs: 275, fat: 73 },
  display: { focus: 'today', goal: '' }, blocks: [], blockHistory: [],
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
      display: { ...EMPTY.display, ...(saved.display ?? {}) },
      blocks: Array.isArray(saved.blocks) ? saved.blocks : [],
      blockHistory: Array.isArray(saved.blockHistory) ? saved.blockHistory.slice(-10) : [],
    };
  } catch { return EMPTY; }
}

function save(next: HealthJournal): HealthJournal {
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(HEALTH_JOURNAL_EVENT));
  return next;
}

const id = (kind: string) => `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const localDay = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

/* 🔷 `at` esplicito serve a UN chiamante solo: il DEV, che dichiara un pasto
   per il giorno di gioco che sta simulando — non per «adesso». Senza questo
   parametro ogni chiamata finirebbe sempre su `new Date()`, cioè su OGGI per
   il calendario vero, e più giorni simulati nello stesso momento reale
   collasserebbero tutti sulla stessa data invece di costruire uno streak. */
export function addMeal(
  input: Omit<MealLog, 'id' | 'at' | 'source'>,
  source: MealLog['source'] = 'chat',
  at: Date = new Date(),
) {
  const journal = readHealthJournal();
  const day = localDay(at);
  const fixed = input.slot !== 'extra';
  const alreadyFilled = fixed && journal.meals.some((meal) => meal.slot === input.slot && localDay(new Date(meal.at)) === day);
  const normalized = alreadyFilled ? { ...input, slot: 'extra' as const } : input;
  return save({ ...journal, meals: [...journal.meals, { ...normalized, id: id('meal'), at: at.toISOString(), source }] });
}

export function addWorkout(
  input: Omit<WorkoutLog, 'id' | 'at' | 'source'>,
  source: WorkoutLog['source'] = 'chat',
  at: Date = new Date(),
) {
  const journal = readHealthJournal();
  return save({ ...journal, workouts: [...journal.workouts, { ...input, id: id('workout'), at: at.toISOString(), source }] });
}

export function addWeight(kg: number, source: WeightLog['source'] = 'chat') {
  const journal = readHealthJournal();
  return save({ ...journal, weights: [...journal.weights, { id: id('weight'), at: new Date().toISOString(), kg, source }] });
}

export function setDietPlan(title: string, text: string) {
  const journal = readHealthJournal();
  return save({ ...journal, dietPlan: { title, text, updatedAt: new Date().toISOString() } });
}

export function setWorkoutPlan(title: string, text: string) {
  const journal = readHealthJournal();
  return save({ ...journal, workoutPlan: { title, text, updatedAt: new Date().toISOString() } });
}

export function configureHealthDisplay(focus: HealthJournal['display']['focus'], goal: string) {
  const journal = readHealthJournal();
  return save({ ...journal, display: { focus, goal } });
}

export function configureHealthTargets(targets: Partial<HealthJournal['targets']>) {
  const journal = readHealthJournal();
  return save({ ...journal, targets: { ...journal.targets, ...targets } });
}

export function manageMeBlock(input: {
  action: 'create' | 'update' | 'delete' | 'move';
  id?: string;
  section?: MeBlock['section'];
  type?: MeBlock['type'];
  title?: string;
  content?: string;
  items?: string[];
  position?: number;
}): { ok: boolean; id?: string; error?: string } {
  const journal = readHealthJournal();
  const history = [...journal.blockHistory, journal.blocks].slice(-10);
  const index = input.id ? journal.blocks.findIndex((block) => block.id === input.id) : -1;
  let blocks = [...journal.blocks];
  if (input.action === 'create') {
    if (!input.title?.trim() || !input.section || !input.type) return { ok: false, error: 'Titolo, sezione o tipo mancanti.' };
    const block: MeBlock = { id: id('me'), section: input.section, type: input.type, title: input.title.trim().slice(0, 80), content: (input.content ?? '').trim().slice(0, 4000), items: (input.items ?? []).map(String).slice(0, 60), updatedAt: new Date().toISOString() };
    const at = Math.max(0, Math.min(blocks.length, input.position ?? blocks.length));
    blocks.splice(at, 0, block); save({ ...journal, blocks, blockHistory: history }); return { ok: true, id: block.id };
  }
  if (index < 0) return { ok: false, error: 'Blocco ME non trovato.' };
  if (input.action === 'delete') blocks.splice(index, 1);
  if (input.action === 'update') blocks[index] = { ...blocks[index]!, ...(input.section ? { section: input.section } : {}), ...(input.type ? { type: input.type } : {}), ...(input.title !== undefined ? { title: input.title.trim().slice(0, 80) } : {}), ...(input.content !== undefined ? { content: input.content.trim().slice(0, 4000) } : {}), ...(input.items ? { items: input.items.map(String).slice(0, 60) } : {}), updatedAt: new Date().toISOString() };
  if (input.action === 'move') { const [block] = blocks.splice(index, 1); blocks.splice(Math.max(0, Math.min(blocks.length, input.position ?? blocks.length)), 0, block!); }
  save({ ...journal, blocks, blockHistory: history }); return { ok: true, id: input.id };
}

export function undoMeBlocks(): boolean {
  const journal = readHealthJournal();
  const previous = journal.blockHistory.at(-1);
  if (!previous) return false;
  save({ ...journal, blocks: previous, blockHistory: journal.blockHistory.slice(0, -1) });
  return true;
}

export function updateLatestMeal(
  slot: MealLog['slot'],
  patch: Partial<Pick<MealLog, 'slot' | 'description' | 'kcal' | 'protein' | 'carbs' | 'fat'>>,
): boolean {
  const journal = readHealthJournal();
  let index = -1;
  for (let cursor = journal.meals.length - 1; cursor >= 0; cursor--) {
    if (journal.meals[cursor]?.slot === slot) { index = cursor; break; }
  }
  if (index < 0) return false;
  const current = journal.meals[index]!;
  let nextSlot = patch.slot ?? current.slot;
  if (nextSlot !== 'extra') {
    const day = localDay(new Date(current.at));
    const occupied = journal.meals.some(
      (meal, mealIndex) => mealIndex !== index && meal.slot === nextSlot && localDay(new Date(meal.at)) === day,
    );
    if (occupied) nextSlot = 'extra';
  }
  const meals = journal.meals.map((meal, mealIndex) => mealIndex === index
    ? { ...meal, ...patch, slot: nextSlot }
    : meal);
  save({ ...journal, meals });
  return true;
}

export function updateLatestWorkout(patch: Partial<Pick<WorkoutLog, 'title' | 'details' | 'minutes'>>): boolean {
  const journal = readHealthJournal();
  if (!journal.workouts.length) return false;
  const workouts = journal.workouts.map((workout, index) => index === journal.workouts.length - 1
    ? { ...workout, ...patch }
    : workout);
  save({ ...journal, workouts });
  return true;
}

export function updateLatestWeight(kg: number): boolean {
  const journal = readHealthJournal();
  if (!journal.weights.length) return false;
  const weights = journal.weights.map((weight, index) => index === journal.weights.length - 1
    ? { ...weight, kg }
    : weight);
  save({ ...journal, weights });
  return true;
}

export function healthJournalReport(section: 'today' | 'diet' | 'sport' | 'progress' | 'all' = 'all'): string {
  const journal = readHealthJournal();
  const day = localDay(new Date());
  const todayMeals = journal.meals.filter((meal) => localDay(new Date(meal.at)) === day);
  const todayWorkouts = journal.workouts.filter((workout) => localDay(new Date(workout.at)) === day);
  const data = {
    ...(section === 'today' || section === 'all' ? { today: { meals: todayMeals, workouts: todayWorkouts } } : {}),
    ...(section === 'diet' || section === 'all' ? { dietPlan: journal.dietPlan, targets: journal.targets } : {}),
    ...(section === 'sport' || section === 'all' ? { workoutPlan: journal.workoutPlan, workouts: journal.workouts.slice(-20) } : {}),
    ...(section === 'progress' || section === 'all' ? { weights: journal.weights.slice(-20), display: journal.display } : {}),
    ...({ meBlocks: journal.blocks }),
  };
  return JSON.stringify(data);
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
