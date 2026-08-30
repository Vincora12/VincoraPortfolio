import { getStore } from '@netlify/blobs';
import { callProvider } from './providers';
import { resolveRoute } from './routing';
import { recordSpend } from './spend';
import { listMem0 } from './mem0MemoryClient';
import { sendMachineInsightPush } from './pushDelivery';

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
}

const STORE = 'vinzmon-machines';
const KEY = 'machine-state-v1';
const at = () => new Date().toISOString();

export const MACHINE_DEFINITIONS: MachineDefinition[] = [
  { id: 'reflection', name: 'REFLECTION MACHINE', purpose: 'Individua pattern, cambiamenti e connessioni significative nel tempo.', reads: ['Memorie Mem0 nuove/rilevanti', 'Osservazioni Reflection precedenti'], trigger: 'Esecuzione esplicita o batch futuro; non ogni messaggio.', instruction: 'Cerca solo pattern utili, cambiamenti, tensioni o connessioni supportate dalle memorie.', writes: ['Osservazioni interpretative con evidenza'], model: 'text-cheap', delivery: 'notify_user' },
  { id: 'me', name: 'ME MACHINE', purpose: 'Mantiene una sintesi compatta di ciò che VINZ.MON comprende dell’utente.', reads: ['Sintesi ME precedente', 'Memorie rilevanti', 'Osservazioni Reflection'], trigger: 'Esecuzione esplicita quando esiste informazione significativa nuova.', instruction: 'Aggiorna una sintesi breve distinguendo fatti dell’utente da interpretazioni.', writes: ['Sintesi ME derivata con riferimenti alle fonti'], model: 'text-cheap', delivery: 'lab_only' },
];

function emptyState(): Record<MachineId, MachineState> {
  return {
    reflection: { status: 'SLEEPING', lastRun: null, lastOutput: null, usage: null, observations: [], meSummary: null, pendingInsights: [] },
    me: { status: 'SLEEPING', lastRun: null, lastOutput: null, usage: null, observations: [], meSummary: null, pendingInsights: [] },
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
  const pendingInsights = Object.values(state).flatMap((item) => item.pendingInsights ?? []).filter((item) => item.status !== 'discussed');
  return { machines: MACHINE_DEFINITIONS.map((definition) => ({ ...definition, state: state[definition.id] })), pendingInsights };
}

export async function openPendingInsight(id: string) {
  const { store, state } = await readState();
  for (const item of Object.values(state)) {
    const insight = (item.pendingInsights ?? []).find((candidate) => candidate.id === id);
    if (insight) { insight.status = 'opened'; insight.openedAt = at(); await store.setJSON(KEY, state); return insight; }
  }
  throw new Error('insight not found');
}

function memoriesFrom(raw: unknown): Array<{ id?: string; text: string }> {
  const rows = Array.isArray((raw as { results?: unknown[] })?.results) ? (raw as { results: unknown[] }).results : Array.isArray(raw) ? raw : [];
  return rows.flatMap((row) => {
    const item = row as { id?: string; memory?: unknown; text?: unknown };
    const text = typeof item.memory === 'string' ? item.memory : typeof item.text === 'string' ? item.text : '';
    return text ? [{ id: item.id, text }] : [];
  });
}

async function runModel(machine: MachineId, prompt: string, sourceIds: string[]) {
  const route = resolveRoute('text-cheap');
  const response = await callProvider(route.provider, { model: route.model, system: [{ text: 'Return compact JSON only. Never invent facts. Interpretations must cite source memory IDs.' }], turns: [], user: prompt, maxTokens: machine === 'reflection' ? 900 : 700 });
  if (!response.ok) throw new Error(response.error ?? 'machine provider failed');
  const costUsd = response.usage.inputTokens || response.usage.outputTokens ? await recordSpend('text-cheap', response.model, response.usage, { action: machine, subsystem: 'machines' }) : 0;
  return { response, costUsd, sourceIds };
}

export async function runMachine(machine: MachineId) {
  const { store, state } = await readState();
  const current = state[machine];
  current.status = 'RUNNING';
  await store.setJSON(KEY, state);
  try {
    const memories = memoriesFrom(await listMem0());
    const sourceIds = memories.map((item) => item.id).filter((id): id is string => Boolean(id));
    if (memories.length < 2) {
      current.status = 'SLEEPING'; current.lastRun = at(); current.lastOutput = 'Non ci sono ancora abbastanza memorie per un’elaborazione significativa.';
      await store.setJSON(KEY, state);
      return current;
    }
    const context = memories.slice(-20).map((item) => `${item.id ?? 'memory'}: ${item.text}`).join('\n');
    const prompt = machine === 'reflection'
      ? `Rifletti sulle memorie seguenti. Restituisci {"observations":[{"type":"pattern|change|tension|connection","statement":"...","confidence":0.0,"sourceIds":["..."]}]}. Se non c’è nulla di utile, restituisci un array vuoto.\n${context}`
      : `Aggiorna una sintesi ME molto breve. Restituisci {"summary":"...","basedOn":["..."]}. Se non c’è un cambiamento significativo, restituisci summary vuota.\n${context}`;
    const { response, costUsd } = await runModel(machine, prompt, sourceIds);
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
        const delivery = await sendMachineInsightPush(latestInsight);
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
