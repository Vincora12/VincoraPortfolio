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
  type Automation,
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
      const hour = Number(body.hour);
      const minute = Number(body.minute ?? 0);
      const timezone = body.timezone;
      if (!title || title.length > 60) return json({ error: 'Titolo mancante o troppo lungo.' }, 400);
      if (!prompt || prompt.length > 2000) return json({ error: 'Descrizione mancante o troppo lunga.' }, 400);
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) return json({ error: 'Ora non valida.' }, 400);
      if (!Number.isInteger(minute) || minute < 0 || minute > 59) return json({ error: 'Minuti non validi.' }, 400);
      if (!validTimezone(timezone)) return json({ error: 'Fuso orario non valido.' }, 400);
      if ((await countAutomations()) >= automationLimit) {
        return json({ error: `Massimo ${automationLimit} automazioni.` }, 409);
      }

      const schedule = { kind: 'daily' as const, hour, minute, timezone };
      const automation: Automation = {
        id: newId(),
        title,
        prompt,
        schedule,
        enabled: true,
        createdAt: new Date().toISOString(),
        nextRunAt: nextRun(schedule),
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
