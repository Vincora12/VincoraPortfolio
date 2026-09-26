/* ============================================================================
   MON CORE — TURN DECISION RECORD (vNext)

   MON CORE is not an agent and not a loop: it is the place where VINZ.MON
   decides, per user turn, WHICH executor answers and under which limits.
   This module holds the shared, dependency-free contract of that decision so
   the browser orchestrator, the server run ingress (`/api/runs`) and the
   observability surfaces (chat trace, runtime log, LAB TRACE) all speak the
   same shape.

   🔒 A decision record contains only operational facts that actually
   happened: which rules matched, which executor ran, which tools were
   offered or withheld, why a delegation fell back. Never prompt text, never
   user content, never model reasoning.
   ========================================================================= */

export type ExecutionMode = 'ANSWER' | 'ACTION' | 'WORK';
export type ModeRequest = 'AUTO' | ExecutionMode;
export const MODE_REQUESTS: readonly ModeRequest[] = ['AUTO', 'ANSWER', 'ACTION', 'WORK'];

/** Where the turn was executed. */
export type TurnExecutor =
  | 'direct'        // single-shot answer (background job / direct model call)
  | 'legacy-tools'  // bounded VINZ tool loop (replyWithLocalTools)
  | 'cerebro'       // WORK delegated to CEREBRO (Hermes v1)
  | 'image'         // image creation route
  | 'issue';        // V2 issue capture route

export type DecisionSource = 'pending-confirmation' | 'override' | 'special-route' | 'rule' | 'default';

export interface TurnDecision {
  v: 1;
  turnId: string;
  at: string;
  requested: ModeRequest;
  mode: ExecutionMode;
  executor: TurnExecutor;
  source: DecisionSource;
  /** Names of the deterministic rules that matched (never the text). */
  rules: string[];
  /** Routing capability class used for the model call, when known. */
  capability?: string;
  project?: 'none' | 'global' | 'project' | 'world';
  /** Filled by the ACTION executor once the pool is built. */
  toolsOffered?: string[];
  toolsWithheld?: string[];
  maxRounds?: number;
  cerebro?: { attempted: boolean; delegated: boolean; fallbackReason?: string };
  model?: string;
  modelLocation?: 'local' | 'cloud';
  /** A mode the user asked for but that could not be honoured, and why. */
  overrideRejected?: string;
}

export function isModeRequest(value: unknown): value is ModeRequest {
  return typeof value === 'string' && (MODE_REQUESTS as readonly string[]).includes(value);
}

/** The mode an executor implies. Kept as one table so every surface agrees. */
export function modeForExecutor(executor: TurnExecutor): ExecutionMode {
  return executor === 'direct' ? 'ANSWER' : executor === 'cerebro' ? 'WORK' : 'ACTION';
}

export function newTurnDecision(input: Omit<TurnDecision, 'v' | 'at' | 'mode' | 'requested'> & { requested?: ModeRequest; mode?: ExecutionMode }): TurnDecision {
  return {
    v: 1,
    at: new Date().toISOString(),
    requested: input.requested ?? 'AUTO',
    mode: input.mode ?? modeForExecutor(input.executor),
    ...input,
  };
}

/** Compact, content-free metadata for the runtime log allow-list. */
export function decisionLogMetadata(decision: TurnDecision): Record<string, string | number | boolean> {
  return {
    mode: decision.mode,
    executor: decision.executor,
    source: decision.source,
    requested: decision.requested,
    rules: decision.rules.slice(0, 12).join(','),
    count: decision.toolsOffered?.length ?? 0,
    ...(decision.toolsWithheld?.length ? { withheld: decision.toolsWithheld.slice(0, 8).join(',') } : {}),
    ...(decision.cerebro?.fallbackReason ? { reason: decision.cerebro.fallbackReason } : {}),
    ...(decision.overrideRejected ? { reason: decision.overrideRejected } : {}),
    ...(decision.modelLocation ? { location: decision.modelLocation } : {}),
  };
}
