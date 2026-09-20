import { fetchLifePersonalFacts, proposeLifeConsequence, proposeLifeEvent } from '../ai/lifeEvent';
import { acceptLifeConsequence, acceptLifeEvent, canStartLifeEvent, mightActInLife, safeLifeText, validateLifeConsequence, type LifeContext } from '../engine/lifeCycle';
import { runStep, useApp } from '../state/store';

let starting: Promise<string | null> | null = null;

/** One narrative opportunity on chat entry. No timers or background simulation. */
export function startLifeEventIfDue(): Promise<string | null> {
  if (starting) return starting;
  starting = (async () => {
    const initial = useApp.getState();
    const mon = initial.activeMonName ? initial.mons[initial.activeMonName] ?? null : null;
    const world = initial.world;
    if (!initial.token || !mon || !world || !canStartLifeEvent(mon, world, initial.ledger, initial.day)) return null;
    const baseline = { worldId: world.id, canonLength: world.canon.length, monNodeId: mon.data.mindline_node, day: initial.day };
    const personalFacts = await fetchLifePersonalFacts(initial.token, mon, world, initial.ledger);
    const ctx: LifeContext = { world, ledger: initial.ledger, mon, day: initial.day, personalFacts };
    let proposal = await runStep('narrator', model => proposeLifeEvent(initial.token!, ctx, model), out => ({ ok: Boolean(out), why: out ? undefined : 'life-proposal-invalid' }));
    if (!proposal) proposal = await runStep('narrator', model => proposeLifeEvent(initial.token!, ctx, model, 'schema, continuità o sicurezza'), out => ({ ok: Boolean(out), why: out ? undefined : 'life-proposal-invalid' }));
    if (!proposal) return null;
    let acceptedId: string | null = null;
    useApp.setState(current => {
      const currentMon = current.activeMonName ? current.mons[current.activeMonName] ?? null : null;
      if (!currentMon || !current.world || current.world.id !== baseline.worldId || current.world.canon.length !== baseline.canonLength
        || currentMon.data.mindline_node !== baseline.monNodeId || current.day !== baseline.day
        || !canStartLifeEvent(currentMon, current.world, current.ledger, current.day)) return {};
      const accepted = acceptLifeEvent({ world: current.world, ledger: current.ledger, mon: currentMon, day: current.day, personalFacts }, proposal!);
      if (!accepted) return {};
      acceptedId = accepted.id;
      return { world: accepted.world, ledger: accepted.ledger };
    });
    return acceptedId;
  })().finally(() => { starting = null; });
  return starting;
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
  });
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
