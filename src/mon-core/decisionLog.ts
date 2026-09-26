/* MON CORE — browser-side recorder for Turn Decision Records.

   One decision per turn id: the orchestrator opens it when it chooses an
   executor, the executor amends it with facts only it knows (tool pool,
   withheld writes, round cap, model), and the chat trace picks it up when it
   is persisted. A runtime-log event is emitted once, when the decision is
   finalised. Observability must never affect the turn: every call here is
   best-effort. */
import { postRuntimeEvent } from '../system/runtimeLog';
import { decisionLogMetadata, type TurnDecision } from './turnDecision';

const open = new Map<string, TurnDecision>();
const MAX_OPEN = 50;

export function recordTurnDecision(decision: TurnDecision): void {
  open.set(decision.turnId, decision);
  while (open.size > MAX_OPEN) open.delete(open.keys().next().value as string);
}

export function amendTurnDecision(turnId: string | undefined, patch: Partial<TurnDecision>): void {
  if (!turnId) return;
  const current = open.get(turnId);
  if (current) open.set(turnId, { ...current, ...patch });
}

export function peekTurnDecision(turnId: string | undefined): TurnDecision | undefined {
  return turnId ? open.get(turnId) : undefined;
}

/** Emits the runtime event and forgets the decision. Returns it for the trace. */
export function finalizeTurnDecision(turnId: string | undefined): TurnDecision | undefined {
  if (!turnId) return undefined;
  const decision = open.get(turnId);
  if (!decision) return undefined;
  open.delete(turnId);
  try {
    postRuntimeEvent({
      eventType: 'TURN_DECISION',
      status: 'PASS',
      scope: 'chat',
      requestId: decision.turnId,
      ...(decision.capability ? { capability: decision.capability } : {}),
      ...(decision.model ? { model: decision.model } : {}),
      metadata: decisionLogMetadata(decision),
    });
  } catch { /* best-effort */ }
  return decision;
}
