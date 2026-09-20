import { fetchLifePersonalFacts, proposeLifeConsequence, proposeLifeEvent } from '../ai/lifeEvent';
import { acceptLifeConsequence, acceptLifeEvent, canStartLifeEvent, mightActInLife, safeLifeText, validateLifeConsequence, type LifeContext } from '../engine/lifeCycle';
import { runStep, useApp } from '../state/store';
import { postRuntimeEvent } from '../system/runtimeLog';

const LIFE_LOCAL_TIMEOUT_MS = 60_000;
export type LifeStartResult = { status: 'open'; id: string } | { status: 'ineligible' | 'failed'; code: string };
let starting: Promise<LifeStartResult> | null = null;

/** Technical codes and counts only; no prompts, memory, names or chat text. */
export function reportLifeCycle(phase: string, code: string, status: 'START' | 'PASS' | 'FAIL', metadata: Record<string, string | number | boolean> = {}): void {
  postRuntimeEvent({
    eventType: 'LIFE_CYCLE_EVENT', status, scope: 'chat',
    metadata: { phase, reason: metadata.validationCodes ? `${code}:${metadata.validationCodes}` : code,
      ...(typeof metadata.selectedCount === 'number' ? { count: metadata.selectedCount } : {}) },
    ...(typeof metadata.model === 'string' ? { model: metadata.model } : {}),
    ...(typeof metadata.httpStatus === 'number' ? { statusCode: metadata.httpStatus } : {}),
  });
}

/** One narrative opportunity on chat entry. No timers or background simulation. */
export function startLifeEventIfDue(): Promise<LifeStartResult> {
  if (starting) return starting;
  starting = (async (): Promise<LifeStartResult> => {
    const initial = useApp.getState();
    const mon = initial.activeMonName ? initial.mons[initial.activeMonName] ?? null : null;
    const world = initial.world;
    const gateCode = !initial.token ? 'missing-token' : !mon ? 'missing-mon' : !world ? 'missing-world'
      : mon.firstEncounter?.status !== 'completato' ? 'first-encounter-incomplete'
        : initial.ledger.lifeEvent?.status === 'open' ? 'event-open'
          : initial.ledger.lifeEvent?.day === initial.day ? 'resolved-today' : null;
    if (gateCode || !mon || !world || !canStartLifeEvent(mon, world, initial.ledger, initial.day)) {
      const code = gateCode ?? 'not-eligible';
      reportLifeCycle('gate', code, 'PASS', { day: initial.day });
      return { status: 'ineligible', code };
    }
    reportLifeCycle('gate', 'eligible', 'START', { day: initial.day });
    const baseline = { worldId: world.id, canonLength: world.canon.length, monNodeId: mon.data.mindline_node, day: initial.day };
    const personalFacts = await fetchLifePersonalFacts(initial.token!, mon, world, initial.ledger,
      result => reportLifeCycle('memory', result.code, result.code === 'memory-selected' ? 'PASS' : 'FAIL', { selectedCount: result.count ?? 0, ...(result.status ? { httpStatus: result.status } : {}) }));
    const ctx: LifeContext = { world, ledger: initial.ledger, mon, day: initial.day, personalFacts };
    let failureCode = 'proposal-unavailable';
    let proposal;
    try {
      proposal = await runStep('narrator', model => {
        reportLifeCycle('model', 'request-started', 'START', { model });
        return proposeLifeEvent(initial.token!, ctx, model, '', result => {
          failureCode = result.validationCodes?.length ? `validation-${result.validationCodes.join('-')}` : result.code;
          reportLifeCycle('proposal', result.code, result.code === 'proposal-valid' ? 'PASS' : 'FAIL', {
            model, ...(result.status ? { httpStatus: result.status } : {}),
            ...(result.validationCodes?.length ? { validationCodes: result.validationCodes.join(',') } : {}),
          });
        });
      }, out => ({ ok: Boolean(out), why: out ? undefined : failureCode }), { localTimeoutMs: LIFE_LOCAL_TIMEOUT_MS });
    } catch {
      failureCode = 'model-exception';
    }
    if (!proposal) { reportLifeCycle('result', failureCode, 'FAIL'); return { status: 'failed', code: failureCode }; }
    let acceptedId: string | null = null;
    let acceptCode = 'state-changed';
    useApp.setState(current => {
      const currentMon = current.activeMonName ? current.mons[current.activeMonName] ?? null : null;
      if (!currentMon || !current.world || current.world.id !== baseline.worldId || current.world.canon.length !== baseline.canonLength
        || currentMon.data.mindline_node !== baseline.monNodeId || current.day !== baseline.day
        || !canStartLifeEvent(currentMon, current.world, current.ledger, current.day)) return {};
      const accepted = acceptLifeEvent({ world: current.world, ledger: current.ledger, mon: currentMon, day: current.day, personalFacts }, proposal!);
      if (!accepted) { acceptCode = 'validation-changed'; return {}; }
      acceptedId = accepted.id;
      return { world: accepted.world, ledger: accepted.ledger };
    });
    const accepted = acceptedId as string | null;
    if (!accepted) { reportLifeCycle('accept', acceptCode, 'FAIL'); return { status: 'failed', code: acceptCode }; }
    reportLifeCycle('accept', 'event-open', 'PASS', { day: initial.day });
    return { status: 'open', id: accepted };
  })().finally(() => { starting = null; });
  return starting!;
}

export interface LifeTurnResult { intent: 'assistant_request' | 'narrative_comment' | 'narrative_action'; prompt: string; }

/** Assistant requests keep their normal route. Only explicit scene actions can advance canon. */
export async function processLifeTurn(messageId: string, userText: string, projectId: string | undefined, useTools: boolean): Promise<LifeTurnResult | null> {
  if (projectId || useTools || !messageId || !userText || userText.length > 500 || !safeLifeText(userText) || !mightActInLife(userText)
    || /\b(che ore|meteo|promemoria|calendario|cerca (online|sul web)|modifica (l'app|il codice)|what time|weather|reminder|calendar)\b/i.test(userText)) return null;
  const initial = useApp.getState();
  const event = initial.ledger.lifeEvent;
  if (!initial.token || !initial.world || !event || event.status !== 'open' || event.worldId !== initial.world.id) return null;
  const outcome = await runStep('narrator', model => proposeLifeConsequence(initial.token!, initial.world!, initial.ledger, userText, model), out => {
    if (!out || !['assistant_request', 'narrative_comment', 'narrative_action'].includes(out.intent)) return { ok: false, why: 'life-intent-invalid' };
    if (out.intent !== 'narrative_action') return { ok: true };
    const errors = validateLifeConsequence(out, messageId, userText, initial.world!, initial.ledger);
    return { ok: errors.length === 0, why: errors.join(',') || undefined };
  }, { localTimeoutMs: LIFE_LOCAL_TIMEOUT_MS });
  // If the model only returned a normal assistant request while a life event is open,
  // force a narrative comment to keep the scene context active. This covers cases
  // where a user asks a question about the scene (e.g. "In che senso?") but the model
  // misclassifies it as assistant_request.
  if (outcome && outcome.intent === 'assistant_request' && event.status === 'open') {
    return { intent: 'narrative_comment', prompt: `SITUAZIONE APERTA NELLA VITA DEL MON: ${event.observedFact.slice(0, 300)}. Rispondi al commento senza inventare una conseguenza.` };
  }
  if (!outcome || outcome.intent === 'assistant_request') return null;
  if (outcome.intent === 'narrative_comment') return { intent: outcome.intent, prompt: `SITUAZIONE APERTA NELLA VITA DEL MON: ${event.observedFact.slice(0, 300)}. Rispondi al commento senza inventare una conseguenza.` };
  let consequence: string | null = null;
  useApp.setState(current => {
    if (!current.world || current.world.id !== initial.world!.id || current.ledger.lifeEvent?.id !== event.id) return {};
    const accepted = acceptLifeConsequence(current.world, current.ledger, current.day, messageId, userText, outcome);
    if (!accepted) return {};
    consequence = accepted.ledger.lifeEvent?.consequence ?? null;
    return { world: accepted.world, ledger: accepted.ledger };
  });
  if (!consequence) return null;
  return { intent: 'narrative_action', prompt: `Nella vostra vita è successo questo: ${event.observedFact.slice(0, 300)}. Dopo l'azione esplicita del giocatore, la conseguenza validata è: ${consequence}. Reagisci come il Mon in chat; non aggiungere altri fatti permanenti.` };
}
