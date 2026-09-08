/* ============================================================================
   /api/automations — l'elenco di quello che VINZ fa da solo

   Il motore, l'orario e l'esecuzione stanno in `_shared/automations.ts`. Qui
   c'è solo la porta: chi chiede deve avere il token di VINZ, e ogni campo che
   arriva dal client viene ricontrollato prima di finire su disco.
   ========================================================================= */

import { authorize, denied, json } from './_shared/auth';
import {
  ackResult,
  automationLimit,
  countAutomations,
  deleteAutomation,
  listAutomations,
  nextRun,
  pendingResults,
  processAutomations,
  readAutomation,
  saveAutomation,
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  type Automation,
  type AutomationSchedule,
} from './_shared/automations';

interface Payload {
  action?: string;
  id?: string;
  title?: string;
  prompt?: string;
  hour?: number;
  minute?: number;
  timezone?: string;
  enabled?: boolean;
  cadence?: string;
  days?: unknown;
  everyMinutes?: number;
  fromHour?: number;
  toHour?: number;
}

function validTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const wholeIn = (value: unknown, min: number, max: number): boolean =>
  Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max;

/** Ricontrolla tutto: quello che arriva dal client non è mai la verità. */
function readSchedule(body: Payload): { schedule: AutomationSchedule } | { error: string } {
  const timezone = body.timezone;
  if (!validTimezone(timezone)) return { error: 'Fuso orario non valido.' };
  const cadence = body.cadence ?? 'daily';

  if (cadence === 'interval') {
    const everyMinutes = Number(body.everyMinutes);
    if (!wholeIn(everyMinutes, MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES)) {
      return { error: `L'intervallo deve stare fra ${MIN_INTERVAL_MINUTES} minuti e 24 ore.` };
    }
    const hasWindow = body.fromHour !== undefined || body.toHour !== undefined;
    if (hasWindow && (!wholeIn(body.fromHour, 0, 23) || !wholeIn(body.toHour, 0, 23))) {
      return { error: 'Finestra oraria non valida.' };
    }
    return {
      schedule: {
        kind: 'interval',
        everyMinutes,
        timezone,
        ...(hasWindow ? { fromHour: Number(body.fromHour), toHour: Number(body.toHour) } : {}),
      },
    };
  }

  const hour = Number(body.hour);
  const minute = Number(body.minute ?? 0);
  if (!wholeIn(hour, 0, 23)) return { error: 'Ora non valida.' };
  if (!wholeIn(minute, 0, 59)) return { error: 'Minuti non validi.' };

  if (cadence === 'weekly') {
    const raw = Array.isArray(body.days) ? body.days : [];
    const days = [...new Set(raw.map(Number))].filter((day) => wholeIn(day, 1, 7)).sort();
    if (!days.length) return { error: 'Scegli almeno un giorno della settimana.' };
    return { schedule: { kind: 'weekly', days, hour, minute, timezone } };
  }

  if (cadence !== 'daily') return { error: 'Cadenza non disponibile.' };
  return { schedule: { kind: 'daily', hour, minute, timezone } };
}

function newId(): string {
  return `a_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export default async function handler(request: Request): Promise<Response> {
  if (!authorize(request).ok) return denied();
  const url = new URL(request.url, 'http://localhost');

  if (request.method === 'GET') {
    if (url.searchParams.get('op') === 'inbox') return json({ results: await pendingResults() });
    return json({ automations: await listAutomations() });
  }

  if (request.method !== 'POST') return json({ error: 'solo GET e POST' }, 405);

  let body: Payload;
  try {
    body = (await request.json()) as Payload;
  } catch {
    return json({ error: 'body non leggibile' }, 400);
  }

  try {
    if (body.action === 'ack') {
      if (typeof body.id !== 'string' || !body.id) return json({ error: 'id mancante' }, 400);
      await ackResult(body.id);
      return json({ ok: true });
    }

    if (body.action === 'create') {
      const title = String(body.title ?? '').trim();
      const prompt = String(body.prompt ?? '').trim();
      if (!title || title.length > 60) return json({ error: 'Titolo mancante o troppo lungo.' }, 400);
      if (!prompt || prompt.length > 2000) return json({ error: 'Descrizione mancante o troppo lunga.' }, 400);
      const read = readSchedule(body);
      if ('error' in read) return json({ error: read.error }, 400);
      if ((await countAutomations()) >= automationLimit) {
        return json({ error: `Massimo ${automationLimit} automazioni.` }, 409);
      }

      const automation: Automation = {
        id: newId(),
        title,
        prompt,
        schedule: read.schedule,
        enabled: true,
        createdAt: new Date().toISOString(),
        nextRunAt: nextRun(read.schedule),
        lastRunAt: null,
        lastStatus: null,
        lastError: null,
      };
      await saveAutomation(automation);
      return json({ automation });
    }

    if (typeof body.id !== 'string' || !body.id) return json({ error: 'id mancante' }, 400);
    const current = await readAutomation(body.id);
    if (!current) return json({ error: 'Automazione non trovata.' }, 404);

    if (body.action === 'delete') {
      await deleteAutomation(current.id);
      return json({ ok: true });
    }

    if (body.action === 'toggle') {
      const enabled = body.enabled !== false;
      const automation: Automation = {
        ...current,
        enabled,
        /* Riaccendendola non deve scattare subito per il tempo passato spenta. */
        nextRunAt: enabled ? nextRun(current.schedule) : current.nextRunAt,
      };
      await saveAutomation(automation);
      return json({ automation });
    }

    if (body.action === 'run-now') {
      /* Anticipa la prossima esecuzione: il tick che gira ogni minuto la
         raccoglie da sé. Nessuna seconda strada di esecuzione da tenere
         allineata con quella vera. */
      await saveAutomation({ ...current, enabled: true, nextRunAt: new Date(Date.now() - 1000).toISOString() });
      const outcome = await processAutomations();
      return json({ ok: true, outcome });
    }

    return json({ error: 'Azione non disponibile.' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Operazione non riuscita.' }, 500);
  }
}
