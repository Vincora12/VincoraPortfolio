import { authorize, denied, json } from './_shared/auth';
import { getStore } from './_shared/localStore';
import { enqueuePendingAction, type MealSlot, type PendingAction } from './shortcut';
import { consumeActionPermit, type PermitAction } from './_shared/actionPermits';

const stateStore = () => getStore({ name: 'vinzmon-state', consistency: 'strong' });
const id = (kind: string) => `hermes-${kind}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const mealSlots = new Set<MealSlot>(['colazione', 'spuntino', 'pranzo', 'merenda', 'cena', 'extra']);

function finite(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function text(value: unknown, max = 2000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function healthSnapshot(): Promise<unknown> {
  const saved = await stateStore().get('save', { type: 'json' }) as { state?: Record<string, unknown> } | null;
  return saved?.state?.__healthJournal ?? {
    meals: [], workouts: [], weights: [], dietPlan: null, workoutPlan: null,
    note: 'Nessun diario ME sincronizzato sul server.',
  };
}

async function authorizedWrite(requestId: string, action: PermitAction): Promise<Response | null> {
  return await consumeActionPermit(requestId, action)
    ? null
    : json({ error: 'CONFIRMATION_REQUIRED', message: 'Scrittura rifiutata: manca una conferma utente valida per questo turno.' }, 409);
}

export default async function handler(request: Request): Promise<Response> {
  if (!authorize(request).ok) return denied();
  if (request.method !== 'POST') return json({ error: 'solo POST' }, 405);
  let body: { tool?: unknown; request_id?: unknown; arguments?: unknown };
  try { body = await request.json() as typeof body; } catch { return json({ error: 'body non leggibile' }, 400); }
  const tool = text(body.tool, 80);
  const requestId = text(body.request_id, 160);
  const args = body.arguments && typeof body.arguments === 'object' ? body.arguments as Record<string, unknown> : {};

  if (tool === 'vinz_leggi_me') return json({ ok: true, health: await healthSnapshot() });

  if (tool === 'vinz_registra_pasto') {
    const deniedWrite = await authorizedWrite(requestId, 'meal');
    if (deniedWrite) return deniedWrite;
    const description = text(args.description, 500);
    const slot = mealSlots.has(args.slot as MealSlot) ? args.slot as MealSlot : null;
    const kcal = finite(args.kcal, 0, 5000);
    const protein = finite(args.protein, 0, 500);
    const carbs = finite(args.carbs, 0, 1000);
    const fat = finite(args.fat, 0, 500);
    if (!description || !slot || kcal === null || protein === null || carbs === null || fat === null) {
      return json({ error: 'Pasto non valido.' }, 400);
    }
    const entry: PendingAction = {
      id: id('meal'), action: 'meal', at: new Date().toISOString(),
      meal: { slot, description, kcal: Math.round(kcal), protein: Math.round(protein), carbs: Math.round(carbs), fat: Math.round(fat), confidence: args.confidence === 'high' || args.confidence === 'medium' ? args.confidence : 'low' },
    };
    await enqueuePendingAction(entry);
    return json({ ok: true, queued: true, message: 'Pasto accodato a ME; VINZ.MON lo applicherà immediatamente.' });
  }

  if (tool === 'vinz_registra_allenamento') {
    const deniedWrite = await authorizedWrite(requestId, 'workout');
    if (deniedWrite) return deniedWrite;
    const details = text(args.details, 1000);
    const minutes = finite(args.minutes, 0, 600);
    if (!details || minutes === null) return json({ error: 'Allenamento non valido.' }, 400);
    await enqueuePendingAction({
      id: id('workout'), action: 'workout', at: new Date().toISOString(),
      workout: { title: text(args.title, 120) || 'Allenamento', details, minutes: Math.round(minutes) },
    });
    return json({ ok: true, queued: true, message: 'Allenamento accodato a ME; VINZ.MON lo applicherà immediatamente.' });
  }

  if (tool === 'vinz_registra_peso') {
    const deniedWrite = await authorizedWrite(requestId, 'weight');
    if (deniedWrite) return deniedWrite;
    const kg = finite(args.kg, 20, 400);
    if (kg === null) return json({ error: 'Peso non valido.' }, 400);
    await enqueuePendingAction({ id: id('weight'), action: 'weight', at: new Date().toISOString(), weight: { kg } });
    return json({ ok: true, queued: true, message: 'Peso accodato a ME; VINZ.MON lo applicherà immediatamente.' });
  }

  return json({ error: 'Strumento VINZ.MON sconosciuto.' }, 404);
}

export const config = { path: '/api/hermes-tools' };
