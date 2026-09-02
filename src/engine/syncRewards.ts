import { readHealthJournal, type HealthJournal, type MealLog } from './healthJournal';

const MEAL_SLOTS: Exclude<MealLog['slot'], 'extra'>[] = ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena'];
/* 🔷 v2 — chiave nuova: la forma è cambiata da tre traguardi con soglie
   indipendenti a UNA riserva condivisa che si spende (vedi sotto). Un vecchio
   salvataggio nella forma di prima interpretato con lo schema nuovo direbbe
   cose senza senso, quindi non si legge: si riparte, che per un prototipo è
   il comportamento onesto. */
import { setLocalStorageItem } from '../system/localStorageDiagnostics';

const REWARDS_KEY = 'vinzmon.sync.rewards.v2';
const WISH_KEY = 'vinzmon.sync.wish.v1';

export type SyncRewardKind = 'evolution' | 'mega-evolution' | 'wish';
export type EvolutionWish = { text: string; kind: Exclude<SyncRewardKind, 'wish'> };

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

/* 🔷 «Se uso il due, il sette o il trenta, il SYNC deve fare meno due, meno
   sette, meno trenta — e si ricarica solo andando avanti coi giorni.»

   🔒 UNA RISERVA SOLA, NON TRE TRAGUARDI INDIPENDENTI. Prima ogni premio
   teneva il proprio traguardo (streak al momento del claim): evolvere non
   toccava il conto della megaevoluzione, quindi la ruota non scendeva mai —
   restava piena anche subito dopo averla usata. Adesso c'è un'unica riserva
   spendibile, `streak - speso`: usarne una parte la abbassa per TUTTI i
   traguardi, ed è quello che il quadrante disegna. */
function readSpent(streak: number): number {
  try {
    const raw = JSON.parse(localStorage.getItem(REWARDS_KEY) ?? '0');
    const spent = typeof raw === 'number' && raw >= 0 ? raw : 0;
    // Se la serie si è interrotta e ricominciata, una spesa vecchia non può
    // restare per sempre più alta della serie nuova: risucchierebbe ogni
    // giorno futuro finché lo streak non la raggiunge di nuovo da capo.
    return spent <= streak ? spent : 0;
  } catch { return 0; }
}

/** Quanto SYNC è davvero spendibile ORA: lo streak meno quanto già usato. */
export function syncBalance(streak = completeDayStreak()): number {
  return Math.max(0, streak - readSpent(streak));
}

export function syncRewardProgress(kind: SyncRewardKind, streak = completeDayStreak()) {
  const need = SYNC_REWARD_DAYS[kind];
  const balance = syncBalance(streak);
  return { have: Math.min(need, balance), need, ready: balance >= need };
}

export function claimSyncReward(kind: SyncRewardKind, streak = completeDayStreak()): boolean {
  if (!syncRewardProgress(kind, streak).ready) return false;
  setLocalStorageItem('engine/syncRewards', REWARDS_KEY, JSON.stringify(readSpent(streak) + SYNC_REWARD_DAYS[kind]));
  return true;
}

export function saveEvolutionWish(wish: EvolutionWish): void { setLocalStorageItem('engine/syncRewards wish', WISH_KEY, JSON.stringify(wish)); }
export function clearEvolutionWish(): void { localStorage.removeItem(WISH_KEY); }
export function readEvolutionWish(): EvolutionWish | null {
  try {
    const value = JSON.parse(localStorage.getItem(WISH_KEY) ?? 'null') as EvolutionWish | null;
    return value?.text && (value.kind === 'evolution' || value.kind === 'mega-evolution') ? value : null;
  } catch { return null; }
}
export function wishNeedsMega(text: string): boolean { return /cambi(?:a|are).*famigli|altra famiglia|nuova famiglia|famiglia diversa/i.test(text); }
