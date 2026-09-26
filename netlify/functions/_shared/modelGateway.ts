/* ============================================================================
   MODEL GATEWAY — one place that turns "this feature needs a model of class
   X" into a concrete provider/model and enforces the policy around it
   (vNext Step 6).

   Before this module every server feature picked its route itself
   (`resolveRoute(...)` + its own subset of checks): /api/ai enforced
   local-only mode, a few callers checked the spending cap, the V2 run engine
   had its own profile table, the Hermes path its own model maps, and the
   background machines/memory/topics bypassed local-only entirely.

   Now:
     request (capability class + optional user choice + purpose)
       → resolveModelRoute()   one resolution (routing.ts catalog, the local
                               sentinel, local-first when asked)
       → assertRouteAllowed()  local-only mode + monthly cap, centrally
       → callModel()           provider call + spend recording + local-first
                               fallback policy (escalate | skip | fail)

   `routing.ts` stays the registry of WHAT exists; this module is the POLICY
   of which one runs. CEREBRO receives the route chosen here
   (`resolveWorkModel`) and never picks its own.
   ========================================================================= */
import { callProvider, type ProviderRequest, type ProviderResult } from './providers';
import {
  CLOUD_CHEAP_ROUND_MODEL,
  LOCAL_CHEAP_ROUND_MODEL,
  LOCAL_CHEAP_ROUND_SENTINEL,
  resolveRoute,
  VOICE_CHOICES,
  type Capability,
  type Route,
} from './routing';
import { checkCap, INTERNAL_CAP_EXCEEDED, LOCAL_ONLY_BLOCKED, readLocalOnlyMode, recordSpend } from './spend';

export type ModelLocation = 'local' | 'cloud';
export interface GatewayRoute extends Route { location: ModelLocation }

export const locationOf = (route: Route): ModelLocation => (route.provider === 'ollama' ? 'local' : 'cloud');

/** Why the gateway refused a route; callers map it to their own HTTP/UI shape. */
export class ModelPolicyError extends Error {
  constructor(readonly code: typeof LOCAL_ONLY_BLOCKED | typeof INTERNAL_CAP_EXCEEDED, message: string, readonly route: Route, readonly detail: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ModelPolicyError';
  }
}

/** The local route a capability can run on, when one exists in the catalog. */
export function localRouteFor(capability: Capability): GatewayRoute | null {
  if (capability === 'text-cheap' || capability === 'character-voice' || capability === 'prompt-compile') {
    return { provider: 'ollama', model: LOCAL_CHEAP_ROUND_MODEL, location: 'local' };
  }
  return null;
}

/**
 * One resolution for every server feature.
 * - `LOCAL_CHEAP_ROUND_SENTINEL` (the client's "cheap intermediate round") → the local round model;
 * - `'local'` or `localFirst` → the local route when the capability has one;
 * - otherwise the user's catalog choice (validated by `resolveRoute`) or the capability default.
 */
export function resolveModelRoute(capability: Capability, preferredModel?: string | null, options: { localFirst?: boolean } = {}): GatewayRoute {
  if (preferredModel === LOCAL_CHEAP_ROUND_SENTINEL) return { provider: 'ollama', model: LOCAL_CHEAP_ROUND_MODEL, location: 'local' };
  if (preferredModel === 'local' || (options.localFirst && !preferredModel)) {
    const local = localRouteFor(capability);
    if (local) return local;
  }
  const route = resolveRoute(capability, preferredModel);
  return { ...route, location: locationOf(route) };
}

/** Local-only mode and the monthly cap, for every caller. Local routes are free and always allowed. */
export async function assertRouteAllowed(route: Route & { location?: ModelLocation }, options: { purpose: string; enforceCap?: boolean } = { purpose: 'unknown' }): Promise<void> {
  if ((route.location ?? locationOf(route)) === 'local') return;
  const localOnly = await readLocalOnlyMode();
  if (localOnly.enabled) {
    throw new ModelPolicyError(LOCAL_ONLY_BLOCKED, `modalità solo-locale attiva — ${options.purpose} userebbe ${route.provider}/${route.model}`, route);
  }
  if (options.enforceCap !== false) {
    const cap = await checkCap();
    if (cap.blocked) {
      throw new ModelPolicyError(INTERNAL_CAP_EXCEEDED, 'tetto mensile raggiunto', route, { spentUsd: cap.ledger.usd, capUsd: cap.capUsd, month: cap.ledger.month });
    }
  }
}

export interface ModelCall {
  capability: Capability;
  /** The feature asking, for spend records and errors (e.g. 'machines', 'memory', 'topics'). */
  purpose: string;
  preferredModel?: string | null;
  /** Try the local route first when the capability has one. */
  localFirst?: boolean;
  /** What to do when the local attempt fails: escalate to cloud (interactive), skip (background), fail. */
  onLocalFailure?: 'escalate' | 'skip' | 'fail';
  /** Validate the text before accepting a local answer (e.g. JSON shape); a rejected local answer follows onLocalFailure. */
  acceptLocal?: (result: ProviderResult) => boolean;
  enforceCap?: boolean;
  action?: string;
}

export type GatewayResult = ProviderResult & { route: GatewayRoute; costUsd: number; skipped?: boolean };

async function run(route: GatewayRoute, call: ModelCall, request: Omit<ProviderRequest, 'model'>): Promise<GatewayResult> {
  await assertRouteAllowed(route, { purpose: call.purpose, enforceCap: call.enforceCap });
  const result = await callProvider(route.provider, { ...request, model: route.model });
  let costUsd = 0;
  if (result.usage.inputTokens || result.usage.outputTokens) {
    const recorded = await recordSpend(call.capability, result.model, result.usage, { action: call.action ?? call.purpose, subsystem: call.purpose }).catch(() => 0);
    if (typeof recorded === 'number' && Number.isFinite(recorded)) costUsd = recorded;
  }
  return { ...result, route, costUsd };
}

/** The canonical server-side model call. Throws ModelPolicyError when policy refuses a cloud route. */
export async function callModel(call: ModelCall, request: Omit<ProviderRequest, 'model'>): Promise<GatewayResult> {
  const primary = resolveModelRoute(call.capability, call.preferredModel, { localFirst: call.localFirst });
  if (primary.location === 'local' && call.localFirst) {
    let local: GatewayResult | null = null;
    try { local = await run(primary, call, request); } catch { local = null; }
    if (local?.ok && (!call.acceptLocal || call.acceptLocal(local))) return local;
    const policy = call.onLocalFailure ?? 'escalate';
    if (policy === 'skip') return { ok: false, text: '', usage: {}, model: primary.model, toolUses: [], sources: [], error: 'LOCAL_UNAVAILABLE_SKIPPED', route: primary, costUsd: 0, skipped: true };
    if (policy === 'fail') return local ?? { ok: false, text: '', usage: {}, model: primary.model, toolUses: [], sources: [], error: 'LOCAL_UNAVAILABLE', route: primary, costUsd: 0 };
    const cloud = resolveModelRoute(call.capability, call.preferredModel === 'local' ? null : call.preferredModel);
    if (cloud.location === 'local') return local ?? { ok: false, text: '', usage: {}, model: primary.model, toolUses: [], sources: [], error: 'LOCAL_UNAVAILABLE', route: primary, costUsd: 0 };
    return run(cloud, call, request);
  }
  return run(primary, call, request);
}

/* ── V2 run profiles (was v2/modelRegistry.ts) ─────────────────────────── */

type RunProfileName = 'chat' | 'project-chat' | 'lab' | 'automation' | 'inspection' | 'coding';
const PROFILE_CAPABILITY: Record<RunProfileName, Capability> = {
  chat: 'character-voice',
  'project-chat': 'character-voice',
  automation: 'character-voice',
  lab: 'prompt-compile',
  inspection: 'prompt-compile',
  coding: 'prompt-compile',
};
export interface RunModelRoute extends GatewayRoute { billingCapability: Capability; local: boolean }

/** A run profile's route: local-first for conversational profiles without an explicit choice. */
export function resolveRunModel(profile: RunProfileName, preference?: string): RunModelRoute {
  const capability = PROFILE_CAPABILITY[profile];
  const conversational = profile === 'chat' || profile === 'project-chat' || profile === 'automation';
  const route = resolveModelRoute(capability, preference, { localFirst: conversational });
  return { ...route, billingCapability: capability, local: route.location === 'local' };
}

/** The cloud model a failed local intermediate chat round escalates to. */
export const cheapRoundEscalation = (): Route => resolveRoute('character-voice', CLOUD_CHEAP_ROUND_MODEL);

/* ── WORK / CEREBRO ────────────────────────────────────────────────────── */

/** The local models CEREBRO may run on: the local entries of the voice catalog. */
export const WORK_LOCAL_MODELS: readonly string[] = VOICE_CHOICES.filter((choice) => choice.provider === 'ollama').map((choice) => choice.model);

/** A model for CEREBRO. `provider` is absent only for a runtime default VINZ does not list (the runtime profile decides). */
export interface WorkModel { model: string; provider?: Route['provider']; location: ModelLocation }

/**
 * The model CEREBRO runs with, chosen by VINZ.MON: the user's per-run choice
 * when it is in the catalog, else the configured runtime default. Returns
 * null for a choice VINZ does not know (never a silent substitute). An
 * unlisted runtime default is treated as CLOUD for policy (conservative:
 * local-only mode blocks it, the cap applies).
 */
export function resolveWorkModel(preferred: unknown, configuredDefault: string): WorkModel | null {
  const pick = (model: string): WorkModel | null => {
    if (WORK_LOCAL_MODELS.includes(model)) return { provider: 'ollama', model, location: 'local' };
    const choice = VOICE_CHOICES.find((candidate) => candidate.model === model);
    return choice ? { provider: choice.provider, model: choice.model, location: locationOf(choice) } : null;
  };
  if (typeof preferred === 'string' && preferred.trim()) return pick(preferred.trim());
  if (preferred !== undefined && preferred !== null) return null;
  return pick(configuredDefault) ?? { model: configuredDefault, location: 'cloud' };
}
