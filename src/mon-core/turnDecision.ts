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

/* ============================================================================
   decideTurn — THE canonical routing decision (vNext Step 5)

   Deterministic and synchronous: every input is a fact the orchestrator has
   already computed with the existing intent rules (brain/stream.ts) and the
   confirmation state machine. No model call, no second classifier.

     pending confirmation   → ACTION (a "sì" always finishes what was asked)
     explicit override      → honoured when valid, otherwise recorded as
                              rejected and AUTO decides
     special routes         → image / issue (ACTION)
     structured writes,
     product tools          → ACTION (bounded VINZ tool loop)
     multi-step Project work→ WORK (CEREBRO) — never merely because a
                              Project is selected
     other tool rules       → ACTION
     everything else        → ANSWER
   ========================================================================= */

/** Multi-step production/analysis over Project material: the WORK signal. */
const WORK_INTENT = /\b(?:lavora\w*|analizz\w*|prepar\w*|elabor\w*|riorganizz\w*|confront\w*|calcol\w*|gener\w*|redig\w*|riscriv\w*|aggiorn\w*|modific\w*|crea\w*|scriv\w*|sistem\w*|compil\w*|complet\w*|verific\w*)\b[^.!?]{0,80}\b(?:file|document\w*|report|foglio|fogli|excel|xlsx|csv|pdf|business\s*plan|presentazion\w*|slide|cartella|workspace|bozza|contratto|preventiv\w*|listino|tabell\w*|dati|piano\s+(?:marketing|editoriale|di\s+lavoro|commerciale))\b|\b(?:passo\s+per\s+passo|in\s+più\s+passaggi|occupatene|fai\s+tutto\s+tu|lavoraci)\b/i;
/** A short follow-up that continues the previous CEREBRO work («sì, procedi», «continua»). */
const WORK_CONTINUATION = /^\s*(?:s[iì]|ok(?:ay)?|va bene|procedi|continua|vai(?:\s+avanti)?|prosegui|fallo|fai pure|perfetto)(?=[\s,.;:!]|$)[^?]{0,80}$/i;

export function isWorkIntent(text: string): boolean {
  return WORK_INTENT.test(text);
}

export interface TurnFacts {
  requested: ModeRequest;
  text: string;
  project: 'global' | 'project' | 'world';
  /** A pending app-asked confirmation was just answered with a yes. */
  pendingConfirmed: boolean;
  /** A structured write/confirmation is proposed or confirmed in this turn (meal, workout, weight, plan, reminder, code…). */
  structuredAction: boolean;
  specialRoute?: 'image' | 'issue';
  /** Needs a browser-bound product tool CEREBRO cannot reach (calendar, drive, email, reminders, look, repo ops…). */
  browserProductTool: boolean;
  /** The existing tool rules (`shouldUseLocalTools`) matched. */
  toolRules: boolean;
  /** Images or spreadsheets are attached to this turn. */
  attachments: boolean;
  /** The previous assistant turn was answered by CEREBRO. */
  previousWasCerebro: boolean;
  /** A tool executor is available in this client at all. */
  toolsAvailable: boolean;
}

export interface RoutingOutcome {
  mode: ExecutionMode;
  executor: TurnExecutor;
  source: DecisionSource;
  overrideRejected?: string;
}

function autoRoute(f: TurnFacts): RoutingOutcome {
  if (f.specialRoute) return { mode: 'ACTION', executor: f.specialRoute, source: 'special-route' };
  const action: RoutingOutcome = { mode: 'ACTION', executor: f.toolsAvailable ? 'legacy-tools' : 'direct', source: 'rule' };
  if (f.structuredAction || f.browserProductTool) return action;
  if (f.project === 'project') {
    if (isWorkIntent(f.text) || f.attachments || (f.previousWasCerebro && WORK_CONTINUATION.test(f.text))) {
      return { mode: 'WORK', executor: 'cerebro', source: 'rule' };
    }
  }
  if (f.toolRules) return action;
  return { mode: 'ANSWER', executor: 'direct', source: 'default' };
}

export function decideTurn(f: TurnFacts): RoutingOutcome {
  if (f.pendingConfirmed) return { mode: 'ACTION', executor: f.toolsAvailable ? 'legacy-tools' : 'direct', source: 'pending-confirmation' };
  const auto = autoRoute(f);
  if (f.requested === 'AUTO') return auto;
  if (f.requested === 'ANSWER') return { mode: 'ANSWER', executor: 'direct', source: 'override' };
  if (f.requested === 'ACTION') {
    return f.toolsAvailable
      ? { mode: 'ACTION', executor: 'legacy-tools', source: 'override' }
      : { ...auto, overrideRejected: 'action-needs-tools' };
  }
  // WORK
  if (f.project === 'world') return { ...auto, overrideRejected: 'world-is-deterministic' };
  if (f.project !== 'project') return { ...auto, overrideRejected: 'work-needs-project' };
  if (f.structuredAction) return { ...auto, overrideRejected: 'structured-write-is-action' };
  if (f.browserProductTool) return { ...auto, overrideRejected: 'tool-not-available-to-cerebro' };
  return { mode: 'WORK', executor: 'cerebro', source: 'override' };
}
