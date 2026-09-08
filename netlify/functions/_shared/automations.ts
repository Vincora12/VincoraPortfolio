/* ============================================================================
   LE AUTOMAZIONI — quello che VINZ fa da solo, a un'ora che decidi tu

   🔴 PRIMA NON ESISTEVANO. Il promemoria del calendario è monouso e non ESEGUE
   niente: quando scade manda una push generica («Hai un promemoria da
   consultare») e finisce lì. «Ogni mattina mandami le notizie» chiede due cose
   che non c'erano: la RICORRENZA e l'ESECUZIONE.

   🔒 SOLA LETTURA, PER SCELTA. Un'automazione cerca sul web e riferisce. Non
   scrive niente nel registro di ME: nessun pasto, nessun peso, nessun piano
   può cambiare mentre dormi. La conferma esplicita che protegge quelle
   scritture non si aggira facendola fare a un timer.

   🔒 IL RISULTATO NON SI CONSEGNA DA QUI. Il runner lo mette in una casella; è
   il client, quando apri la chat, a portarlo dentro la conversazione. Scrivere
   nel repository dei messaggi dal server vorrebbe dire combattere con il gate
   dello storico e con la copia viva che tiene il browser — vedi la nota su
   `ResumeLastThread` in IntegratedChat.tsx.
   ========================================================================= */

import { getStore } from './localStore';
import { sendPushNotification } from './pushDelivery';
import { callProvider } from './providers';
import { resolveRoute } from './routing';
import { checkCap, recordSpend } from './spend';
import { loadCoreContext } from './coreContext';

export interface AutomationSchedule {
  /** Una sola cadenza per ora: tutti i giorni a un'ora fissa. */
  kind: 'daily';
  hour: number;
  minute: number;
  timezone: string;
}

export interface Automation {
  id: string;
  title: string;
  prompt: string;
  schedule: AutomationSchedule;
  enabled: boolean;
  createdAt: string;
  nextRunAt: string;
  lastRunAt: string | null;
  lastStatus: 'ok' | 'error' | null;
  lastError: string | null;
}

export interface AutomationResult {
  id: string;
  automationId: string;
  title: string;
  text: string;
  at: string;
}

const MAX_AUTOMATIONS = 20;
const MAX_PER_TICK = 3;

function store() {
  return getStore({ name: 'vinzmon-automations', consistency: 'strong' });
}

/* --- Orario ---------------------------------------------------------------
   ⚠️ Niente libreria di fusi orari: si chiede a `Intl` che ore sono davvero in
   quel fuso e si lavora sullo scarto. Sul cambio dell'ora legale una singola
   esecuzione può slittare di un'ora — accettabile per un digest del mattino, e
   scritto qui perché nessuno lo scopra dal comportamento. */
function offsetMinutes(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - date.getTime()) / 60_000;
}

export function nextRun(schedule: AutomationSchedule, from = new Date()): string {
  for (let ahead = 0; ahead <= 2; ahead++) {
    const probe = new Date(from.getTime() + ahead * 86_400_000);
    const offset = offsetMinutes(probe, schedule.timezone);
    const local = new Date(probe.getTime() + offset * 60_000);
    const target = Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate(),
      schedule.hour,
      schedule.minute,
    ) - offset * 60_000;
    if (target > from.getTime()) return new Date(target).toISOString();
  }
  return new Date(from.getTime() + 86_400_000).toISOString();
}

/* --- Lettura e scrittura --------------------------------------------------- */

export async function listAutomations(): Promise<Automation[]> {
  const { blobs } = await store().list({ prefix: 'auto:' });
  const rows = await Promise.all(
    blobs.map(async ({ key }) => (await store().get(key, { type: 'json' })) as Automation | null),
  );
  return rows.filter((row): row is Automation => Boolean(row)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function saveAutomation(automation: Automation): Promise<void> {
  await store().setJSON(`auto:${automation.id}`, automation);
}

export async function deleteAutomation(id: string): Promise<void> {
  await store().delete(`auto:${id}`);
}

export async function readAutomation(id: string): Promise<Automation | null> {
  return ((await store().get(`auto:${id}`, { type: 'json' })) as Automation | null) ?? null;
}

export async function countAutomations(): Promise<number> {
  return (await store().list({ prefix: 'auto:' })).blobs.length;
}

export const automationLimit = MAX_AUTOMATIONS;

/* --- La casella dei risultati ---------------------------------------------- */

export async function pendingResults(): Promise<AutomationResult[]> {
  const { blobs } = await store().list({ prefix: 'result:' });
  const rows = await Promise.all(
    blobs.map(async ({ key }) => (await store().get(key, { type: 'json' })) as AutomationResult | null),
  );
  return rows.filter((row): row is AutomationResult => Boolean(row)).sort((a, b) => a.at.localeCompare(b.at));
}

export async function ackResult(id: string): Promise<void> {
  await store().delete(`result:${id}`);
}

/* --- L'esecuzione ---------------------------------------------------------- */

const AUTOMATION_RULES = [
  'You are running an automation the user scheduled: they are not in front of you and cannot answer questions.',
  'Answer the request directly and completely in one message. Never ask a question back.',
  'Use web search for anything time-sensitive and cite what you actually found. Never invent news, numbers or sources.',
  'This run is read-only: you cannot record meals, workouts, weight, plans or reminders, and must not claim that you did.',
  'Keep it tight and scannable. No greeting, no "here is your digest" preamble.',
].join(' ');

async function runOne(automation: Automation, now: Date): Promise<AutomationResult> {
  const route = resolveRoute('character-voice');
  const { systemPrompt } = await loadCoreContext({
    query: automation.prompt,
    body: 'external',
    toolsAvailable: false,
  });

  const result = await callProvider(route.provider, {
    model: route.model,
    system: [{ text: systemPrompt }, { text: AUTOMATION_RULES }],
    turns: [],
    user: automation.prompt,
    webSearch: true,
    maxTokens: 1600,
    effort: 'low',
  });

  if (result.usage.inputTokens || result.usage.outputTokens) {
    await recordSpend('character-voice', result.model, result.usage, {
      action: 'automation',
      subsystem: 'automation',
    });
  }
  if (!result.ok || !result.text.trim()) {
    throw new Error(result.error || 'Il modello non ha risposto.');
  }

  return {
    id: `${automation.id}-${now.getTime().toString(36)}`,
    automationId: automation.id,
    title: automation.title,
    text: result.text.trim(),
    at: now.toISOString(),
  };
}

export async function processAutomations(now = new Date()): Promise<{ due: number; ok: number; failed: number }> {
  const all = await listAutomations();
  const due = all
    .filter((automation) => automation.enabled && Date.parse(automation.nextRunAt) <= now.getTime())
    .slice(0, MAX_PER_TICK);
  if (!due.length) return { due: 0, ok: 0, failed: 0 };

  const cap = await checkCap();
  if (cap.blocked) {
    /* Il tetto di spesa vale anche per chi gira da solo — anzi, soprattutto:
       un'automazione quotidiana che sfonda il budget non se ne accorgerebbe. */
    for (const automation of due) {
      await saveAutomation({
        ...automation,
        lastRunAt: now.toISOString(),
        lastStatus: 'error',
        lastError: 'Tetto mensile di spesa raggiunto.',
        nextRunAt: nextRun(automation.schedule, now),
      });
    }
    return { due: due.length, ok: 0, failed: due.length };
  }

  let ok = 0;
  let failed = 0;

  for (const automation of due) {
    /* La prossima esecuzione si sposta PRIMA di eseguire: se questo giro va
       storto o il processo muore a metà, l'automazione non riparte in loop
       ogni minuto per il resto della giornata. */
    const rescheduled = { ...automation, nextRunAt: nextRun(automation.schedule, now) };
    await saveAutomation({ ...rescheduled, lastRunAt: now.toISOString() });

    try {
      const produced = await runOne(automation, now);
      await store().setJSON(`result:${produced.id}`, produced);
      await saveAutomation({ ...rescheduled, lastRunAt: now.toISOString(), lastStatus: 'ok', lastError: null });
      ok += 1;
      try {
        await sendPushNotification({
          title: automation.title,
          body: produced.text.slice(0, 140),
          url: '/#/current',
          tag: `vinzmon-automation-${automation.id}`,
        });
      } catch {
        /* Il risultato resta in casella e arriva in chat lo stesso. */
      }
    } catch (error) {
      failed += 1;
      await saveAutomation({
        ...rescheduled,
        lastRunAt: now.toISOString(),
        lastStatus: 'error',
        lastError: error instanceof Error ? error.message.slice(0, 200) : 'Esecuzione non riuscita.',
      });
    }
  }

  return { due: due.length, ok, failed };
}
