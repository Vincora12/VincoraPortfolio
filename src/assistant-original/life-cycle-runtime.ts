import { classifyQuestAction, explicitQuestAction, fetchLifePersonalFacts, proposeLifeConsequence, proposeLifeEvent, proposeQuestAnswer } from '../ai/lifeEvent';
import { acceptLifeConsequence, acceptLifeEvent, canStartLifeEvent, mightActInLife, safeLifeText, validateLifeConsequence, type LifeContext } from '../engine/lifeCycle';
import { resolveQuestTurn, type QuestTurnResult } from '../engine/worldGame';
import { suspendLifeEventForQuest, withCanon, worldInquiry } from '../engine/world';
import { runStep, useApp } from '../state/store';
import { postRuntimeEvent } from '../system/runtimeLog';
import { WORLD_PROJECT_ID } from '../engine/projects';

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

/**
 * Vinz.World classifies every safe scene turn, including questions and
 * dialogue. Only requests that clearly belong to the normal assistant route
 * are kept out of the narrative classifier.
 */
function isAssistantRequest(text: string): boolean {
  return /\b(che ore|meteo|promemoria|calendario|cerca (online|sul web)|modifica (l'app|il codice)|what time|weather|reminder|calendar|scrivi una mail|riassumi questo|traduci questo)\b/i.test(text);
}

/** One narrative opportunity on chat entry. No timers or background simulation. */
export function startLifeEventIfDue(): Promise<LifeStartResult> {
  if (starting) return starting;
  starting = (async (): Promise<LifeStartResult> => {
    const initial = useApp.getState();
    const mon = initial.activeMonName ? initial.mons[initial.activeMonName] ?? null : null;
    const world = initial.world;
    const quest = initial.ledger.quest;
    const activeQuest = Boolean(quest && (quest.status !== 'complete' || initial.evolutionJob?.kind === 'evolution' || initial.evolutionJob?.kind === 'mega-evolution'));
    const gateCode = !initial.token ? 'missing-token' : !mon ? 'missing-mon' : !world ? 'missing-world'
      : activeQuest ? 'quest-active'
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
      const currentQuest = current.ledger.quest;
      const questBlocksEvent = Boolean(currentQuest && (currentQuest.status !== 'complete'
        || current.evolutionJob?.kind === 'evolution' || current.evolutionJob?.kind === 'mega-evolution'));
      if (!currentMon || !current.world || current.world.id !== baseline.worldId || current.world.canon.length !== baseline.canonLength
        || currentMon.data.mindline_node !== baseline.monNodeId || current.day !== baseline.day || questBlocksEvent
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

export interface LifeTurnResult {
  intent: 'assistant_request' | 'narrative_comment' | 'narrative_action';
  prompt: string;
  questFrame?: { before: string; after: string };
}

function questTurnResponse(quest: QuestTurnResult['quest'], outcome: string): LifeTurnResult {
  const after = quest.status === 'complete'
    ? quest.kind === 'TUNE' ? 'L’abitante può attraversare il tratto che era bloccato.' : 'Il percorso verso il prossimo World è aperto.'
    : quest.status === 'failed'
      ? `Il Mon è al sicuro, ma il ${quest.foe.name} blocca ancora la strada.`
      : quest.status === 'combat'
        ? `Il ${quest.foe.name} è ancora davanti al Mon.`
        : `Il ${quest.foe.name} blocca ancora il passaggio.`;
  return {
    intent: 'narrative_action',
    prompt: `ESITO VINCOLANTE DELLA QUEST: ${outcome}\nRispondi SOLO come il Mon, in prima persona e in una o due frasi. Reagisci alla scelta del giocatore con una frase completa e chiara; evita frasi tronche e pronomi ambigui. Non scrivere narratore, corsivo, statistiche, nuovi eventi o riepiloghi dell'esito: il motore mostra già il fatto prima e dopo la tua battuta.`,
    questFrame: { before: outcome, after },
  };
}

/** Assistant requests keep their normal route. Only explicit scene actions can advance canon. */
export async function processLifeTurn(messageId: string, userText: string, projectId: string | undefined, useTools: boolean): Promise<LifeTurnResult | null> {
  if (projectId !== WORLD_PROJECT_ID || useTools || !messageId || !userText || userText.length > 500 || !safeLifeText(userText) || isAssistantRequest(userText)) return null;
  const initial = useApp.getState();
  const quest = initial.ledger.quest;
  // Reloading a failed AI reply must reuse the resolved turn, not roll combat again.
  if (initial.world && quest?.worldId === initial.world.id && quest.lastMessageId === messageId && quest.lastOutcome) {
    return questTurnResponse(quest, quest.lastOutcome);
  }
  if (initial.token && initial.world && quest && quest.worldId === initial.world.id
    && (quest.status === 'investigate' || quest.status === 'combat')) {
    const action = explicitQuestAction(userText) ?? await runStep('narrator', model => classifyQuestAction(initial.token!, quest, userText, model), result => ({ ok: Boolean(result), why: result ? undefined : 'quest-intent-unavailable' }), { localTimeoutMs: LIFE_LOCAL_TIMEOUT_MS });
    if (!action) return null;
    let accepted: ReturnType<typeof resolveQuestTurn> = null;
    useApp.setState(current => {
      const currentQuest = current.ledger.quest;
      if (!current.world || current.world.id !== quest.worldId || !currentQuest
        || currentQuest.id !== quest.id || currentQuest.attempt !== quest.attempt || currentQuest.turn !== quest.turn) return {};
      const result = resolveQuestTurn(currentQuest, action, messageId);
      if (!result) return {};
      accepted = result;
      const finished = result.quest.status === 'complete' || result.quest.status === 'failed';
      const world = finished ? withCanon(current.world, {
        id: `${quest.id}:attempt:${quest.attempt}:${result.quest.status}`,
        day: current.day, kind: 'life-consequence', epistemic: 'WORLD_CANON',
        text: result.quest.status === 'complete'
          ? `${quest.foe.name} è stato superato: ${quest.kind === 'TUNE' ? 'la zona è di nuovo accessibile' : 'la Nebbia maggiore del World si è diradata'}.`
          : `${quest.foe.name} ha costretto il Mon alla fuga; la ${quest.kind} resta incompleta.`,
        monName: current.activeMonName ?? '',
      }) : current.world;
      if (result.quest.status === 'complete' && quest.kind === 'RISE' && !worldInquiry(world).answer) {
        const evidenceEventId = `${quest.id}:attempt:${quest.attempt}:complete`;
        world.inquiry = { ...worldInquiry(world),
          answer: world.id === 'world_NUL'
            ? 'Abbiamo reso possibile il passaggio che il Veilborn teneva chiuso.'
            : 'La Nebbia impediva di vedere un legame del World; superarla ha aperto il passaggio.',
          evidenceEventId };
      }
      return { world, ledger: { ...suspendLifeEventForQuest(current.ledger), quest: result.quest.status === 'complete'
        ? { ...result.quest, completionReplyPending: true } : result.quest } };
    });
    const outcome = accepted as unknown as QuestTurnResult | null;
    if (!outcome) return null;
    if (outcome.quest.status === 'complete' && quest.kind === 'RISE' && !worldInquiry(initial.world).answer) {
      const evidence = `${quest.foe.name} è stato superato: la Nebbia maggiore del World si è diradata.`;
      void runStep('narrator', model => proposeQuestAnswer(initial.token!, initial.world!, evidence, model), answer => ({ ok: Boolean(answer), why: answer ? undefined : 'world-answer-unavailable' }), { localTimeoutMs: LIFE_LOCAL_TIMEOUT_MS })
        .then(answer => {
          if (!answer) return;
          useApp.setState(current => {
            if (!current.world || current.world.id !== quest.worldId || current.ledger.quest?.id !== quest.id
              || current.ledger.quest.status !== 'complete' || current.world.inquiry?.evidenceEventId !== `${quest.id}:attempt:${quest.attempt}:complete`) return {};
            return { world: { ...current.world, inquiry: { ...worldInquiry(current.world), answer } } };
          });
        }).catch(() => {});
    }
    return questTurnResponse(outcome.quest, outcome.text);
  }
  const event = initial.ledger.lifeEvent;
  if (!initial.token || !initial.world || !event || event.status !== 'open' || event.worldId !== initial.world.id) return null;
  /* Una domanda o un commento senza un'azione fisica non deve pagare una
     seconda chiamata al modello solo per essere classificato: il normale
     turno del Mon può rispondere usando la scena aperta, senza cambiare il
     canone. Le azioni e i dialoghi dichiarativi passano invece al validatore
     AI, che può registrare una conseguenza. */
  if (!mightActInLife(userText) && /\?/.test(userText)) {
    return { intent: 'narrative_comment', prompt: `SITUAZIONE APERTA NELLA VITA DEL MON: ${event.observedFact.slice(0, 300)}. Rispondi alla domanda dentro la scena usando il contesto già presente, senza inventare una conseguenza o un fatto permanente.` };
  }
  const outcome = await runStep('narrator', model => proposeLifeConsequence(initial.token!, initial.world!, initial.ledger, userText, model), out => {
    if (!out || !['assistant_request', 'narrative_comment', 'narrative_action'].includes(out.intent)) return { ok: false, why: 'life-intent-invalid' };
    if (out.intent !== 'narrative_action') return { ok: true };
    const errors = validateLifeConsequence(out, messageId, userText, initial.world!, initial.ledger);
    return { ok: errors.length === 0, why: errors.join(',') || undefined };
  }, { localTimeoutMs: LIFE_LOCAL_TIMEOUT_MS });
  // Determine final intent when a life event is in progress.
  if (event.status === 'open') {
    // No meaningful outcome from the model, treat as a narrative comment to keep context.
    if (!outcome || outcome.intent === 'assistant_request' || outcome.intent === 'narrative_comment') {
      return { intent: 'narrative_comment', prompt: `SITUAZIONE APERTA NELLA VITA DEL MON: ${event.observedFact.slice(0, 300)}. Rispondi al commento senza inventare una conseguenza.` };
    }
  }
  if (!outcome) return null;
  if (outcome.intent === 'narrative_comment') return { intent: outcome.intent, prompt: `SITUAZIONE APERTA NELLA VITA DEL MON: ${event.observedFact.slice(0, 300)}. Rispondi al commento senza inventare una conseguenza.` };
  // At this point outcome is a narrative_action.
  let consequence: string | null = null;
  let worldAnswer: string | null = null;
  useApp.setState(current => {
    if (!current.world || current.world.id !== initial.world!.id || current.ledger.lifeEvent?.id !== event.id) return {};
    const accepted = acceptLifeConsequence(current.world, current.ledger, current.day, messageId, userText, outcome);
    if (!accepted) return {};
    consequence = accepted.ledger.lifeEvent?.consequence ?? null;
    worldAnswer = accepted.world.inquiry?.answer && !current.world.inquiry?.answer ? accepted.world.inquiry.answer : null;
    return { world: accepted.world, ledger: accepted.ledger };
  });
  if (!consequence) return null;
  return { intent: 'narrative_action', prompt: `Nella vostra vita è successo questo: ${event.observedFact.slice(0, 300)}. Dopo l'azione esplicita del giocatore, la conseguenza validata è: ${consequence}.${worldAnswer ? ` La tua risposta provvisoria alla domanda di questo World è: ${worldAnswer}. Puoi dirla con la voce del Mon, citando il fatto che ve l'ha fatta capire.` : ''} Reagisci come il Mon in chat; non aggiungere altri fatti permanenti.` };
}
