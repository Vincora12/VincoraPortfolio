import { getStore } from './localStore';
import { callProvider } from './providers';
import { resolveRoute } from './routing';
import { recordSpend } from './spend';
import { listPersonalMemory, searchPersonalMemory } from './core/memory';
import { machineInsightPayload, sendPushNotification } from './pushDelivery';
import { nextRun } from './automations';

export type MachineStatus = 'ACTIVE' | 'SLEEPING' | 'RUNNING' | 'DISABLED';
export type MachineId = 'reflection' | 'me';
export type MachineDelivery = 'silent' | 'lab_only' | 'notify_user';

export interface MachineDefinition {
  id: MachineId;
  name: string;
  purpose: string;
  reads: string[];
  trigger: string;
  instruction: string;
  writes: string[];
  model: string;
  delivery: MachineDelivery;
}

export interface PendingInsight {
  id: string;
  machineId: MachineId;
  statement: string;
  sourceIds: string[];
  importance: number;
  confidence: number;
  createdAt: string;
  status: 'pending' | 'opened' | 'discussed';
  notification: 'not_sent' | 'in_app' | 'push_sent';
  pushAttemptedAt?: string;
  pushSentAt?: string;
  pushError?: string;
  openedAt?: string;
  discussedAt?: string;
  dedupeKey: string;
}

export interface MachineState {
  status: MachineStatus;
  lastRun: string | null;
  lastOutput: string | null;
  usage: { provider: string; model: string; costUsd: number } | null;
  observations: Array<{ type: string; statement: string; confidence: number; sourceIds: string[]; timestamp: string }>;
  meSummary: { version: 1; summary: string; generatedAt: string; basedOn: string[] } | null;
  pendingInsights: PendingInsight[];
  reflectionContext?: { recent: number; older: number; previousReflections: number; total: number };
  /* 🔷 «Vorrei altre macchine così.» Il primo passo non è scriverne altre: è
     dare a queste una gamba che non hanno mai avuto. Il trigger dichiarato dice
     «esecuzione esplicita o batch futuro» — il batch futuro è questo. */
  autoDaily?: { hour: number; timezone: string } | null;
  nextRunAt?: string | null;
}

const STORE = 'vinzmon-machines';
const KEY = 'machine-state-v1';
const at = () => new Date().toISOString();

export const MACHINE_DEFINITIONS: MachineDefinition[] = [
  { id: 'reflection', name: 'REFLECTION MACHINE', purpose: 'Individua pattern, cambiamenti e connessioni significative nel tempo.', reads: ['Memoria personale nuova/rilevante', 'Osservazioni Reflection precedenti'], trigger: 'Esecuzione esplicita o batch futuro; non ogni messaggio.', instruction: 'Cerca solo pattern utili, cambiamenti, tensioni o connessioni supportate dalle memorie.', writes: ['Osservazioni interpretative con evidenza'], model: 'text-cheap', delivery: 'notify_user' },
  { id: 'me', name: 'ME MACHINE', purpose: 'Mantiene una sintesi compatta di ciò che VINZ.MON comprende dell’utente.', reads: ['Sintesi ME precedente', 'Memoria personale rilevante', 'Osservazioni Reflection'], trigger: 'Esecuzione esplicita quando esiste informazione significativa nuova.', instruction: 'Aggiorna una sintesi breve distinguendo fatti dell’utente da interpretazioni.', writes: ['Sintesi ME derivata con riferimenti alle fonti'], model: 'text-cheap', delivery: 'lab_only' },
];

function emptyState(): Record<MachineId, MachineState> {
  return {
    reflection: { status: 'SLEEPING', lastRun: null, lastOutput: null, usage: null, observations: [], meSummary: null, pendingInsights: [], autoDaily: null, nextRunAt: null },
    me: { status: 'SLEEPING', lastRun: null, lastOutput: null, usage: null, observations: [], meSummary: null, pendingInsights: [], autoDaily: null, nextRunAt: null },
  };
}

async function readState() {
  const store = getStore(STORE);
  const stored = (await store.get(KEY, { type: 'json' })) as Partial<Record<MachineId, MachineState>> | null;
  const state = emptyState();
  for (const id of ['reflection', 'me'] as MachineId[]) {
    if (stored?.[id]) state[id] = { ...state[id], ...stored[id], pendingInsights: stored[id]?.pendingInsights ?? [] };
  }
  return { store, state };
}

export async function machineSnapshot() {
  const { state } = await readState();
  const insights = Object.values(state)
    .flatMap((item) => item.pendingInsights ?? [])
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pendingInsights = insights.filter((item) => item.status !== 'discussed');
  return { machines: MACHINE_DEFINITIONS.map((definition) => ({ ...definition, state: state[definition.id] })), pendingInsights, insights };
}

export async function openPendingInsight(id: string) {
  const { store, state } = await readState();
  for (const item of Object.values(state)) {
    const insight = (item.pendingInsights ?? []).find((candidate) => candidate.id === id);
    if (insight) { insight.status = 'opened'; insight.openedAt = at(); await store.setJSON(KEY, state); return insight; }
  }
  throw new Error('insight not found');
}

export async function openAllPendingInsights() {
  const { store, state } = await readState();
  const openedAt = at();
  const opened: PendingInsight[] = [];
  for (const item of Object.values(state)) {
    for (const insight of item.pendingInsights ?? []) {
      if (insight.status !== 'pending') continue;
      insight.status = 'opened';
      insight.openedAt = openedAt;
      opened.push(insight);
    }
  }
  if (opened.length) await store.setJSON(KEY, state);
  return opened;
}

export async function discussPendingInsight(id: string) {
  const { store, state } = await readState();
  for (const item of Object.values(state)) {
    const insight = (item.pendingInsights ?? []).find((candidate) => candidate.id === id);
    if (insight) { insight.status = 'discussed'; insight.discussedAt = at(); await store.setJSON(KEY, state); return insight; }
  }
  throw new Error('insight not found');
}

function terms(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []).filter((word) => !['user', 'that', 'this', 'with', 'from', 'della', 'delle', 'degli', 'sono', 'come', 'alla', 'alle', 'agli'].includes(word)));
}

function reflectionRelevance(statement: string, themes: Set<string>): number {
  const words = terms(statement);
  return [...words].filter((word) => themes.has(word)).length;
}

async function reflectionContext(recent: Array<{ id?: string; text: string }>, observations: MachineState['observations']) {
  const recentIds = new Set(recent.map((item) => item.id).filter((id): id is string => Boolean(id)));
  const candidates = new Map<string, { id?: string; text: string }>();
  for (const item of recent.slice(-4)) {
    try {
      const related = await searchPersonalMemory(item.text.slice(0, 600), 4);
      for (const memory of related) {
        if (memory.text && (!memory.id || !recentIds.has(memory.id))) candidates.set(memory.id ?? memory.text, { id: memory.id, text: memory.text });
      }
    } catch { /* long-term retrieval is best-effort; recent context remains usable */ }
  }
  const themes = new Set(recent.flatMap((item) => [...terms(item.text)]));
  const older = [...candidates.values()].slice(0, 12);
  const previousReflections = observations
    .map((item) => ({ item, score: reflectionRelevance(item.statement, themes) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ item }) => item);
  return { older, previousReflections };
}

async function runModel(machine: MachineId, prompt: string, sourceIds: string[], preferredModel?: string | null) {
  const route = resolveRoute('text-cheap', preferredModel);
  const response = await callProvider(route.provider, { model: route.model, system: [{ text: 'Return compact JSON only. Never invent facts. Interpretations must cite source memory IDs.' }], turns: [], user: prompt, maxTokens: machine === 'reflection' ? 900 : 700 });
  if (!response.ok) throw new Error(response.error ?? 'machine provider failed');
  const costUsd = response.usage.inputTokens || response.usage.outputTokens ? await recordSpend('text-cheap', response.model, response.usage, { action: machine, subsystem: 'machines' }) : 0;
  return { response, costUsd, sourceIds };
}

export async function runMachine(machine: MachineId, preferredModel?: string | null) {
  const { store, state } = await readState();
  const current = state[machine];
  current.status = 'RUNNING';
  await store.setJSON(KEY, state);
  try {
    const memories = await listPersonalMemory();
    const sourceIds = memories.map((item) => item.id).filter((id): id is string => Boolean(id));
    if (memories.length < 2) {
      current.status = 'SLEEPING'; current.lastRun = at(); current.lastOutput = 'Non ci sono ancora abbastanza memorie per un’elaborazione significativa.';
      await store.setJSON(KEY, state);
      return current;
    }
    const recent = memories.slice(-20);
    const extended = machine === 'reflection' ? await reflectionContext(recent, current.observations) : { older: [], previousReflections: [] };
    const context = machine === 'reflection'
      ? [
        'RECENT MEMORIES (user evidence):',
        ...recent.map((item) => `${item.id ?? 'memory'}: ${item.text}`),
        'OLDER RELEVANT MEMORIES (user evidence retrieved semantically):',
        ...extended.older.map((item) => `${item.id ?? 'memory'}: ${item.text}`),
        'PREVIOUS REFLECTIONS (derived interpretations, not user facts):',
        ...extended.previousReflections.map((item) => `${item.type}: ${item.statement} [evidence: ${item.sourceIds.join(', ')}]`),
      ].join('\n')
      : recent.map((item) => `${item.id ?? 'memory'}: ${item.text}`).join('\n');
    if (machine === 'reflection') current.reflectionContext = { recent: recent.length, older: extended.older.length, previousReflections: extended.previousReflections.length, total: recent.length + extended.older.length + extended.previousReflections.length };
    const prompt = machine === 'reflection'
      ? `Rifletti sulle memorie seguenti. Restituisci {"observations":[{"type":"pattern|change|tension|connection","statement":"...","confidence":0.0,"sourceIds":["..."]}]}. Se non c’è nulla di utile, restituisci un array vuoto.\n${context}`
      : `Aggiorna una sintesi ME molto breve. Restituisci {"summary":"...","basedOn":["..."]}. Se non c’è un cambiamento significativo, restituisci summary vuota.\n${context}`;
    const { response, costUsd } = await runModel(machine, prompt, sourceIds, preferredModel);
    const parsed = JSON.parse(response.text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim() ?? response.text.trim()) as Record<string, unknown>;
    if (machine === 'reflection') {
      const observations = Array.isArray(parsed.observations) ? parsed.observations.flatMap((item) => {
        const value = item as Record<string, unknown>;
        return typeof value.statement === 'string' && typeof value.type === 'string' && typeof value.confidence === 'number' && value.confidence >= 0 && value.confidence <= 1 && Array.isArray(value.sourceIds) ? [{ type: value.type, statement: value.statement.slice(0, 500), confidence: value.confidence, sourceIds: value.sourceIds.filter((id): id is string => typeof id === 'string'), timestamp: at() }] : [];
      }) : [];
      current.observations.push(...observations);
      const definition = MACHINE_DEFINITIONS.find((item) => item.id === machine)!;
      const dayKey = new Date().toISOString().slice(0, 10);
      const canNotify = definition.delivery === 'notify_user' && observations.some((item) => item.confidence >= 0.75)
        && !current.pendingInsights.some((item) => item.dedupeKey === observations[0]?.statement && item.status !== 'discussed')
        && !current.pendingInsights.some((item) => item.createdAt.slice(0, 10) === dayKey && item.notification === 'in_app');
      if (canNotify) {
        const selected = observations.find((item) => item.confidence >= 0.75)!;
        current.pendingInsights.push({ id: `insight_${crypto.randomUUID()}`, machineId: machine, statement: selected.statement, sourceIds: selected.sourceIds, importance: selected.confidence, confidence: selected.confidence, createdAt: at(), status: 'pending', notification: 'in_app', dedupeKey: selected.statement });
      }
      current.lastOutput = observations.length ? `${observations.length} osservazioni derivate` : 'Nessuna osservazione significativa.';
    } else {
      const summary = typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 1000) : '';
      if (summary) current.meSummary = { version: 1, summary, generatedAt: at(), basedOn: Array.isArray(parsed.basedOn) ? parsed.basedOn.filter((id): id is string => typeof id === 'string') : sourceIds };
      current.lastOutput = summary ? 'Sintesi ME aggiornata.' : 'Nessun aggiornamento significativo.';
    }
    current.status = 'SLEEPING'; current.lastRun = at(); current.usage = { provider: response.model.includes('claude') ? 'anthropic' : 'openai', model: response.model, costUsd };
    const latestInsight = current.pendingInsights.at(-1);
    if (latestInsight?.createdAt === current.lastRun || latestInsight?.machineId === machine && latestInsight.status === 'pending' && latestInsight.notification === 'in_app' && !latestInsight.pushAttemptedAt) {
      latestInsight.pushAttemptedAt = at();
      try {
        const delivery = await sendPushNotification(machineInsightPayload(latestInsight));
        if (delivery.sent > 0) latestInsight.notification = 'push_sent', latestInsight.pushSentAt = at();
      } catch (error) { latestInsight.pushError = error instanceof Error ? error.message.slice(0, 160) : 'push delivery failed'; }
    }
    await store.setJSON(KEY, state);
    return current;
  } catch (error) {
    current.status = 'SLEEPING'; current.lastRun = at(); current.lastOutput = `Esecuzione fallita: ${error instanceof Error ? error.message : 'errore'}`;
    await store.setJSON(KEY, state);
    throw error;
  }
}


/* ============================================================================
   LE MACCHINE CHE GIRANO DA SOLE

   🔒 UNA CADENZA SOLA, E BASTA. Una macchina che si fa un'opinione su di te non
   deve poter girare ogni dieci minuti: penserebbe più di quanto tu viva. Una
   volta al giorno, a un'ora che scegli tu, è il ritmo giusto per qualcosa che
   cerca pattern «nel tempo».

   ⚠️ L'orario si sposta PRIMA di eseguire, come per le automazioni: se il giro
   fallisce o il processo muore a metà, la macchina non riparte in ciclo per il
   resto della giornata.
   ========================================================================= */

export async function setMachineSchedule(
  machine: MachineId,
  schedule: { hour: number; timezone: string } | null,
): Promise<MachineState> {
  const { store, state } = await readState();
  state[machine].autoDaily = schedule;
  state[machine].nextRunAt = schedule
    ? nextRun({ kind: 'daily', hour: schedule.hour, minute: 0, timezone: schedule.timezone })
    : null;
  await store.setJSON(KEY, state);
  return state[machine];
}

export async function processDueMachines(now = new Date()): Promise<{ due: number; ok: number }> {
  const { store, state } = await readState();
  const due = (Object.keys(state) as MachineId[]).filter((id) => {
    const machine = state[id];
    return machine.autoDaily && machine.nextRunAt && Date.parse(machine.nextRunAt) <= now.getTime();
  });
  if (!due.length) return { due: 0, ok: 0 };

  for (const id of due) {
    const schedule = state[id].autoDaily!;
    state[id].nextRunAt = nextRun(
      { kind: 'daily', hour: schedule.hour, minute: 0, timezone: schedule.timezone },
      now,
    );
  }
  await store.setJSON(KEY, state);

  let ok = 0;
  for (const id of due) {
    try {
      await runMachine(id);
      ok += 1;
    } catch {
      /* Una macchina che non gira non deve fermare l'altra né lo scheduler. */
    }
  }
  return { due: due.length, ok };
}
