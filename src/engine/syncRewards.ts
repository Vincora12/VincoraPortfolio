import { readHealthJournal, type HealthJournal, type MealLog } from './healthJournal';

const MEAL_SLOTS: Exclude<MealLog['slot'], 'extra'>[] = ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena'];
const REWARDS_KEY = 'vinzmon.sync.rewards.v1';
const WISH_KEY = 'vinzmon.sync.wish.v1';

export type SyncRewardKind = 'evolution' | 'mega-evolution' | 'wish';
export type EvolutionWish = { text: string; kind: Exclude<SyncRewardKind, 'wish'> };
type Claims = Record<SyncRewardKind, number>;

const localDay = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const previousDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);

export function isCompleteHealthDay(journal: HealthJournal, date: Date): boolean {
  const key = localDay(date);
  const slots = new Set(journal.meals.filter((item) => localDay(new Date(item.at)) === key).map((item) => item.slot));
  const trained = journal.workouts.some((item) => localDay(new Date(item.at)) === key);
  return MEAL_SLOTS.every((slot) => slots.has(slot)) && trained;
}

/* 🔷 «Quando il DEV porta avanti i giorni, la ruota dovrebbe muoversi
   davvero, non restare a zero.»

   🔒 `referenceDate` NON HA PIÙ `new Date()` COME UNICO PUNTO DI PARTENZA. Il
   diario ha date vere, ma «oggi» qui deve voler dire «oggi nel gioco» —
   `dateForDay(s.day, s.startedAt)` — non «oggi sul telefono». Per un utente
   normale le due cose coincidono sempre, perché il giorno di gioco segue da
   solo il calendario vero (§ `catchUpToRealDay`). Per il DEV, che fa
   avanzare il giorno di gioco senza aspettare, sono la stessa cosa SOLO se
   gliela si passa esplicitamente — altrimenti lo streak guarderebbe sempre
   la data vera di adesso, cioè sempre lo stesso giorno, e non salirebbe
   mai sopra 1 per quanti giorni tu simuli. */
export function completeDayStreak(journal = readHealthJournal(), referenceDate = new Date()): number {
  let cursor = referenceDate;
  if (!isCompleteHealthDay(journal, cursor)) cursor = previousDay(cursor);
  let streak = 0;
  while (streak < 3650 && isCompleteHealthDay(journal, cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }
  return streak;
}

export const SYNC_REWARD_DAYS: Record<SyncRewardKind, number> = { evolution: 2, 'mega-evolution': 7, wish: 30 };

function readClaims(): Claims {
  try {
    return { evolution: 0, 'mega-evolution': 0, wish: 0, ...JSON.parse(localStorage.getItem(REWARDS_KEY) ?? '{}') };
  } catch { return { evolution: 0, 'mega-evolution': 0, wish: 0 }; }
}

export function syncRewardProgress(kind: SyncRewardKind, streak = completeDayStreak()) {
  const need = SYNC_REWARD_DAYS[kind];
  const claimedAt = readClaims()[kind];
  // Se la serie si interrompe, la nuova serie riparte davvero da zero: un
  // vecchio premio usato al giorno 30 non può bloccare per sempre il futuro.
  const earnedSinceClaim = streak >= claimedAt ? streak - claimedAt : streak;
  return { have: Math.min(need, earnedSinceClaim), need, ready: earnedSinceClaim >= need };
}

export function claimSyncReward(kind: SyncRewardKind, streak = completeDayStreak()): boolean {
  if (!syncRewardProgress(kind, streak).ready) return false;
  const claims = readClaims();
  claims[kind] = streak;
  localStorage.setItem(REWARDS_KEY, JSON.stringify(claims));
  return true;
}

export function saveEvolutionWish(wish: EvolutionWish): void { localStorage.setItem(WISH_KEY, JSON.stringify(wish)); }
export function clearEvolutionWish(): void { localStorage.removeItem(WISH_KEY); }
export function readEvolutionWish(): EvolutionWish | null {
  try {
    const value = JSON.parse(localStorage.getItem(WISH_KEY) ?? 'null') as EvolutionWish | null;
    return value?.text && (value.kind === 'evolution' || value.kind === 'mega-evolution') ? value : null;
  } catch { return null; }
}
export function wishNeedsMega(text: string): boolean { return /cambi(?:a|are).*famigli|altra famiglia|nuova famiglia|famiglia diversa/i.test(text); }
