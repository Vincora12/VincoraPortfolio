import { authorize, denied, json } from './_shared/auth';
import { discussPendingInsight, machineSnapshot, openAllPendingInsights, openPendingInsight, runMachine, setMachineSchedule, type MachineId } from './_shared/machines';
import { pushStatus } from './_shared/pushDelivery';

export default async function handler(request: Request): Promise<Response> {
  if (!authorize(request).ok) return denied();
  if (request.method === 'GET') return json({ ...(await machineSnapshot()), push: await pushStatus() });
  if (request.method !== 'POST') return json({ error: 'metodo non supportato' }, 405);
  let body: { machine?: string; preferredModel?: string | null; id?: string; hour?: number; timezone?: string; auto?: boolean };
  try { body = await request.json() as typeof body; } catch { return json({ error: 'body non leggibile' }, 400); }
  if (body.machine === 'open_insight') {
    try { return json({ insight: await openPendingInsight((body as { insightId?: string }).insightId ?? '') }); } catch { return json({ error: 'insight non disponibile' }, 404); }
  }
  if (body.machine === 'open_insights') return json({ insights: await openAllPendingInsights() });
  if (body.machine === 'discuss_insight') {
    try { return json({ insight: await discussPendingInsight((body as { insightId?: string }).insightId ?? '') }); } catch { return json({ error: 'insight non disponibile' }, 404); }
  }
  if (body.machine === 'schedule') {
    const id = body.id;
    if (id !== 'reflection' && id !== 'me') return json({ error: 'machine non valida' }, 400);
    if (body.auto === false) return json({ state: await setMachineSchedule(id, null) });
    const hour = Number(body.hour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return json({ error: 'Ora non valida.' }, 400);
    let timezone = String(body.timezone ?? '');
    try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); } catch { timezone = ''; }
    if (!timezone) return json({ error: 'Fuso orario non valido.' }, 400);
    return json({ state: await setMachineSchedule(id, { hour, timezone }) });
  }
  if (body.machine !== 'reflection' && body.machine !== 'me') return json({ error: 'machine non valida' }, 400);
  try { return json({ machine: body.machine, state: await runMachine(body.machine as MachineId, body.preferredModel) }); } catch { return json({ error: 'esecuzione machine non riuscita' }, 503); }
}

export const config = { path: '/api/machines' };
