import { authorize, denied, json } from './_shared/auth';
import { discussPendingInsight, machineSnapshot, openPendingInsight, runMachine, type MachineId } from './_shared/machines';
import { pushStatus } from './_shared/pushDelivery';

export default async function handler(request: Request): Promise<Response> {
  if (!authorize(request).ok) return denied();
  if (request.method === 'GET') return json({ ...(await machineSnapshot()), push: await pushStatus() });
  if (request.method !== 'POST') return json({ error: 'metodo non supportato' }, 405);
  let body: { machine?: string; preferredModel?: string | null };
  try { body = await request.json() as typeof body; } catch { return json({ error: 'body non leggibile' }, 400); }
  if (body.machine === 'open_insight') {
    try { return json({ insight: await openPendingInsight((body as { insightId?: string }).insightId ?? '') }); } catch { return json({ error: 'insight non disponibile' }, 404); }
  }
  if (body.machine === 'discuss_insight') {
    try { return json({ insight: await discussPendingInsight((body as { insightId?: string }).insightId ?? '') }); } catch { return json({ error: 'insight non disponibile' }, 404); }
  }
  if (body.machine !== 'reflection' && body.machine !== 'me') return json({ error: 'machine non valida' }, 400);
  try { return json({ machine: body.machine, state: await runMachine(body.machine as MachineId, body.preferredModel) }); } catch { return json({ error: 'esecuzione machine non riuscita' }, 503); }
}

export const config = { path: '/api/machines' };
