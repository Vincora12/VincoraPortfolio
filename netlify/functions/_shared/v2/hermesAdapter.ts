import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { EventEmitter, on } from 'node:events';
import { isLocalCoreServer } from '../vinzWorkspace';
import { getStore, localDataDirectory } from '../localStore';
import { resolveRepoRoot } from '../agentLabFiles';
import type { Turn } from '../providers';

export type HermesVinzEvent =
  | { type: 'status'; runId: string; status: 'starting' | 'running' | 'completed' | 'cancelled'; at: string }
  | { type: 'progress'; runId: string; message: string; at: string }
  | { type: 'text_delta'; runId: string; delta: string; at: string }
  | { type: 'tool_started'; runId: string; tool: string; preview?: string; at: string }
  | { type: 'tool_progress'; runId: string; tool: string; preview?: string; at: string }
  | { type: 'tool_completed'; runId: string; tool: string; durationMs?: number; error?: boolean; at: string }
  | { type: 'approval_required'; runId: string; requestId?: string; reason?: string; at: string }
  | { type: 'final'; runId: string; text: string; model?: string; usage?: Record<string, number>; costUsd?: number; timings: HermesTimings; files?: HermesWorkspaceFile[]; at: string }
  | { type: 'error'; runId: string; message: string; at: string }
  | { type: 'context'; runId: string; hermes?: HermesContextUsage; vinz?: VinzContextUsage; at: string }
  /* vNext MON CORE: emitted by /api/runs (never by Hermes) before delegation —
     real facts only: the WORK decision, how many context items VINZ selected
     for the package, and how many enabled skills CEREBRO can load. */
  | { type: 'decision'; runId: string; mode: 'WORK'; executor: 'cerebro'; contextItems: number; skills: number; at: string };

export interface HermesContextUsage {
  usedTokens: number;
  maxTokens: number;
  percent: number;
  estimated: boolean;
}

/** Set by runs.ts (hermesAdapter.ts has no view of VINZ.MON's own context
    assembly) once the event reaches the SSE stream. */
export interface VinzContextUsage {
  usedTokens: number;
  maxTokens: number;
  percent: number;
}

/** A file Hermes created or changed in the Project workspace during this
    turn, set by runs.ts (a before/after workspace diff — hermesAdapter.ts
    has no view of VINZ.MON's own workspace file listing). `path` is
    relative to the workspace root, downloadable via the existing
    /api/vinz-workspace `read-binary` action. */
export interface HermesWorkspaceFile {
  path: string;
  size: number;
}

export interface HermesTimings {
  requestReceivedMs: number;
  runStartedMs?: number;
  firstEventMs?: number;
  firstTextDeltaMs?: number;
  firstToolEventMs?: number;
  completedMs?: number;
}

export interface HermesConfig {
  baseUrl: string;
  apiKey: string;
  workspaceRoot: string;
  model: string;
}

export interface HermesProjectRun {
  requestId: string;
  projectId: string;
  projectName: string;
  workspaceRoot: string;
  conversationId: string;
  input: string;
  systemPrompt: string;
  turns: Turn[];
  model?: string;
  provider?: string;
  effort?: 'low' | 'medium' | 'high';
  actionPolicy?: string;
}

/* Native Hermes gateway event frame, verified against the installed Hermes
   Agent source (~/.hermes/hermes-agent): tui_gateway/server.py `_event_frame`
   sends `{jsonrpc:"2.0", method:"event", params:{type, session_id, payload}}`
   for every session event, over the same `/api/ws` socket used for RPC
   requests/responses (tui_gateway/ws.py `handle_ws`). */
type HermesGatewayEventPayload = Record<string, unknown>;
interface HermesGatewayEvent {
  type: string;
  sessionId: string;
  payload: HermesGatewayEventPayload;
}

const now = () => new Date().toISOString();

function cleanBaseUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('HERMES_CONFIG_INVALID: API URL must use HTTP or HTTPS.');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('HERMES_CONFIG_INVALID: this spike only accepts a loopback Hermes runtime.');
  }
  return url.toString().replace(/\/$/, '');
}

export function hermesConfig(env: NodeJS.ProcessEnv = process.env): HermesConfig | null {
  if (env.VINZMON_ORCHESTRATOR !== 'hermes') return null;
  const baseUrl = env.VINZMON_HERMES_API_URL?.trim();
  const apiKey = env.VINZMON_HERMES_API_KEY?.trim();
  const workspaceRoot = env.VINZMON_HERMES_WORKSPACE_ROOT?.trim();
  const model = env.VINZMON_HERMES_MODEL?.trim();
  if (!baseUrl || !apiKey || !workspaceRoot || !model || env.VINZMON_HERMES_SANDBOXED !== '1') {
    throw new Error('HERMES_CONFIG_INCOMPLETE: API URL, API key, workspace root, explicit model and VINZMON_HERMES_SANDBOXED=1 are required.');
  }
  assertIsolatedHermesWorkspace(resolve(workspaceRoot));
  return {
    baseUrl: cleanBaseUrl(baseUrl),
    apiKey,
    workspaceRoot: resolve(workspaceRoot),
    model,
  };
}

/** True when `inner` is `outer` itself or lies inside it. */
function within(outer: string, inner: string): boolean {
  const rel = relative(outer, inner);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('/'));
}

/* 🔒 vNext SAFETY GATE — CEREBRO works with its own file tools inside its
   workspace, outside VINZ's write gate (`repoOps.ts` + protectedPaths). The
   workspace must therefore never overlap the VINZ.MON code or its data
   (SQLite, skills, Mem0): otherwise Hermes could rewrite the Core or the
   canonical stores and bypass every VINZ write protection. */
export function assertIsolatedHermesWorkspace(workspaceRoot: string, repoRoot = resolveRepoRoot(), dataRoot = localDataDirectory()): void {
  const workspace = resolve(workspaceRoot);
  for (const [label, protectedRoot] of [['repository VINZ.MON', resolve(repoRoot)], ['dati VINZ.MON', resolve(dataRoot)]] as const) {
    if (within(protectedRoot, workspace) || within(workspace, protectedRoot)) {
      throw new Error(`HERMES_WORKSPACE_UNSAFE: the Hermes workspace overlaps the ${label} (${protectedRoot}).`);
    }
  }
}

/* 🔒 vNext CEREBRO BOUNDARY — CEREBRO must not own canonical personal
   memory. Hermes' built-in memory and user profile are Hermes-side settings
   VINZ cannot read, so the operator confirms them explicitly: the Hermes
   profile has `memory.memory_enabled: false` and
   `memory.user_profile_enabled: false`
   (docs/hermes-vinzmon-profile.example.yaml) and the Local Core environment
   sets VINZMON_HERMES_PERSONAL_MEMORY=off. Until then WORK is not delegated
   and the chat keeps its legacy path (fail-closed, never a silent second
   memory). */
/* Hermes' own provider identifiers for the VINZ providers it can run.
   VINZ.MON chooses provider/model (modelGateway.resolveWorkModel); this
   adapter only translates the name. Local models run through Hermes'
   OpenAI-compatible "custom" provider (Ollama). */
const HERMES_PROVIDER_IDS: Partial<Record<string, string>> = {
  openai: 'openai-api',
  anthropic: 'anthropic',
  moonshot: 'kimi-for-coding',
  xai: 'xai',
  ollama: 'custom',
};

/** Hermes provider id for a VINZ provider, or null when Hermes cannot run it. */
export function hermesProviderFor(provider: string | undefined): string | null {
  return provider ? HERMES_PROVIDER_IDS[provider] ?? null : null;
}

export function hermesMemoryBoundaryConfirmed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VINZMON_HERMES_PERSONAL_MEMORY?.trim().toLowerCase() === 'off';
}

export function assertHermesWorkspace(config: HermesConfig, selectedWorkspace: string): void {
  const selected = resolve(selectedWorkspace);
  if (selected !== config.workspaceRoot) {
    throw new Error(`HERMES_WORKSPACE_MISMATCH: selected Project workspace is ${selected}; Hermes is scoped to ${config.workspaceRoot}.`);
  }
}

export function hermesSessionId(projectId: string, conversationId: string, requestId: string): string {
  /* Per-execution id, used only as the Hermes session `title` for traceability
     in logs/dashboards. Conversation continuity across turns is a separate
     concern — see hermesConversationKey() and streamHermesProjectRun()'s
     create/resume logic below. */
  return `vinz_${createHash('sha256').update(projectId).update('\0').update(conversationId).update('\0').update(requestId).digest('hex').slice(0, 32)}`;
}

/* One VINZ.MON Project conversation maps to one PERSISTENT Hermes session,
   so Hermes keeps its own memory of tool calls, files read and reasoning
   across turns instead of starting cold every message. The mapping
   (conversation -> Hermes' durable session id) survives across the
   per-turn WebSocket connections in the same local SQLite store other
   canonical VINZ.MON records use (see _shared/localStore.ts). */
function hermesConversationKey(projectId: string, conversationId: string): string {
  return createHash('sha256').update(projectId).update('\0').update(conversationId).digest('hex').slice(0, 32);
}

interface StoredHermesSession {
  sessionId: string;
  model: string;
  provider: string;
  updatedAt: string;
}

const hermesSessionStore = () => getStore('vinzmon-hermes-sessions');

async function rememberHermesSession(conversationKey: string, sessionId: string, model: string, provider: string): Promise<void> {
  const record: StoredHermesSession = { sessionId, model, provider, updatedAt: now() };
  await hermesSessionStore().setJSON(conversationKey, record);
}

/** Drops the persisted Hermes session for one conversation — the next turn
    starts a brand new one (see the "reset" control in the chat UI). Hermes'
    own session is left to its normal idle/cap eviction; this only forgets
    VINZ.MON's pointer to it. */
export async function forgetHermesSession(projectId: string, conversationId: string): Promise<void> {
  await hermesSessionStore().delete(hermesConversationKey(projectId, conversationId));
}

function textTurn(turn: Turn): { role: string; content: string } | null {
  if (typeof turn.content === 'string') return { role: turn.role, content: turn.content };
  const text = turn.content
    .flatMap((block) => block && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string' ? [block.text] : [])
    .join('\n')
    .trim();
  return text ? { role: turn.role, content: text } : null;
}

/* Full boundary/rules text — sent once, at session.create. A resumed
   session already read all of this on turn 1 and keeps it in its own
   transcript; Hermes does not forget it between turns the way VINZ.MON's own
   context package is re-assembled fresh each time (see RunContext /
   assembleContext — a deliberately bounded, non-accumulating snapshot).
   Resending it on every resumed turn was a real, compounding cost (more
   tokens every turn, for the whole life of the conversation) for something
   that never changes inside one conversation — see resumeInstructions()
   below for what actually needs to stay fresh. */
function instructions(run: HermesProjectRun): string {
  return [
    run.systemPrompt,
    'CEREBRO EXECUTION BOUNDARY — you are the WORK executor for VINZ.MON. You own only this execution session: planning, tool use and continuity of this task. VINZ.MON is canonical for identity, personal memory, Projects, Skills, permissions, ME/health, Sync, Mon evolution and lore. Do not save facts about the user, their life or their preferences into your own memory or profile: VINZ.MON records personal memory itself. Use VINZ.MON MCP tools for structured state; never imitate a successful write in prose.',
    `ACTIVE PROJECT ID: ${run.projectId}`,
    `ACTIVE PROJECT NAME: ${run.projectName}`,
    `AUTHORIZED WORKSPACE: ${run.workspaceRoot}`,
    'LANGUAGE: Write every user-visible message in Italian, including short pre-tool updates, progress narration, questions, warnings, errors and the final answer. Tool arguments and exact file names may remain unchanged. Do not emit English planning notes.',
    'Inspect files on demand; do not ask for or ingest the whole repository. Work only inside AUTHORIZED WORKSPACE and use paths relative to it.',
    'Navigate before searching: list the nearest known directory once, then use the exact relative path returned by that listing. Never repeat the same failed search with minor query variants more than twice. For spreadsheet questions, prefer a nearby CSV or Markdown source when it contains the requested fact; otherwise inspect the spreadsheet with an available document tool.',
    'Never read secrets or access paths outside AUTHORIZED WORKSPACE. Never push, merge, deploy, restart services, alter Git history, or install dependencies. If one of those is needed, stop and ask for explicit approval.',
    'For edits: discover the relevant file, read only what is needed, make the smallest change, run a targeted existing validation when safe, and report the resulting git diff/status.',
    'FILE DELIVERY: any file you create or change inside AUTHORIZED WORKSPACE is automatically offered to the user as a download button in the chat once this turn completes — never tell the user a file is "in the folder" or explain where it is saved; just say what it contains and that it is ready to download.',
    'If one search primitive fails or returns nothing, verify the workspace and try one different read-only search method before concluding that a file is absent.',
    run.actionPolicy ?? 'VINZ.MON ACTION POLICY: no structured write is authorized in this turn. Read tools remain available.',
  ].join('\n\n');
}

/* Light preamble for a RESUMED session: only what genuinely changes turn to
   turn — VINZ.MON's freshly-retrieved context for THIS query (recent
   conversation, memory/ME/project snippets relevant to what's being asked
   right now) and the action policy (safety-critical: whether a structured
   write is authorized THIS turn, never inherited from an earlier one). The
   boundary/language/navigation rules from instructions() are intentionally
   left out — Hermes already has them from session.create. */
function resumeInstructions(run: HermesProjectRun): string {
  return [
    run.systemPrompt,
    run.actionPolicy ?? 'VINZ.MON ACTION POLICY: no structured write is authorized in this turn. Read tools remain available.',
  ].join('\n\n');
}

/* Real field names verified in the installed Hermes source
   (agent/context_breakdown.py `context_usage_fields`), nested under
   session.info's `usage` object alongside token counters. Absent whenever
   Hermes has not run a turn on this session yet. */
function hermesContextUsage(sessionInfoPayload: HermesGatewayEventPayload): HermesContextUsage | undefined {
  const usage = sessionInfoPayload.usage;
  if (!usage || typeof usage !== 'object') return undefined;
  const row = usage as Record<string, unknown>;
  const usedTokens = row.context_used;
  const maxTokens = row.context_max;
  if (typeof usedTokens !== 'number' || typeof maxTokens !== 'number' || !maxTokens) return undefined;
  const percent = typeof row.context_percent === 'number' ? row.context_percent : Math.round((usedTokens / maxTokens) * 100);
  return { usedTokens, maxTokens, percent, estimated: row.context_estimated !== false };
}

function safeToolPreview(config: HermesConfig, preview: string | undefined): string | undefined {
  if (!preview?.trim()) return undefined;
  const relative = preview.trim().replaceAll(config.workspaceRoot, '.');
  return relative
    .replace(/(?:sk-|Bearer\s+)[A-Za-z0-9._-]{16,}/gi, '[segreto nascosto]')
    .replace(/\s+/g, ' ')
    .slice(0, 180);
}

/* ── Native Hermes gateway transport (ws://127.0.0.1:9119/api/ws) ──────────
   Replaces the old REST + SSE bridge (/v1/runs). Verified directly against
   the installed Hermes Agent source under ~/.hermes/hermes-agent:
     - route:    hermes_cli/web_routers/chat_ws.py `gateway_ws`
     - dispatch: tui_gateway/ws.py `handle_ws` -> tui_gateway/server.py `dispatch`
     - auth:     hermes_cli/web_server_chat.py `_ws_auth_reason` — loopback
                 mode compares `?token=` against `_SESSION_TOKEN`, which is
                 `os.environ["HERMES_DASHBOARD_SESSION_TOKEN"]` when set (a
                 random per-process value otherwise, which an external client
                 cannot discover). VINZ.MON therefore reads that SAME env var
                 Hermes itself already defines — no new token, cookie or JWT
                 is minted here.
   Only reachable from the Local Core (isLocalCoreServer()): on Netlify this
   loopback address is the cloud sandbox's own, never the user's Mac. */

const HERMES_GATEWAY_WS_URL = 'ws://127.0.0.1:9119/api/ws';
const HERMES_WS_CONNECT_TIMEOUT_MS = 10_000;
const HERMES_WS_RPC_TIMEOUT_MS = 30_000;

function hermesGatewayToken(): string {
  const token = process.env.HERMES_DASHBOARD_SESSION_TOKEN?.trim();
  if (!token) {
    throw new Error(
      'HERMES_CONFIG_INCOMPLETE: HERMES_DASHBOARD_SESSION_TOKEN is not set. Set it (in the same environment ' +
      'that starts `hermes dashboard`) so Local Core can authenticate to ws://127.0.0.1:9119/api/ws — ' +
      'VINZ.MON does not generate or guess this token.',
    );
  }
  return token;
}

interface HermesRpcError { code: number; message: string }

/** One JSON-RPC connection to the Hermes dashboard gateway: correlates request/response
    frames by id and fans out `event` frames (see HermesGatewayEvent) to listeners. */
class HermesGatewaySocket {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (r: Record<string, unknown>) => void; reject: (e: Error) => void }>();
  private readonly events = new EventEmitter();
  private closeError: Error | null = null;

  private constructor(private readonly ws: WebSocket) {
    ws.addEventListener('message', (evt: MessageEvent) => {
      let frame: Record<string, unknown>;
      try { frame = JSON.parse(typeof evt.data === 'string' ? evt.data : ''); }
      catch { return; }
      const params = frame.params as { type?: unknown; session_id?: unknown; payload?: unknown } | undefined;
      if (frame.method === 'event' && params && typeof params.type === 'string') {
        const event: HermesGatewayEvent = {
          type: params.type,
          sessionId: typeof params.session_id === 'string' ? params.session_id : '',
          payload: params.payload && typeof params.payload === 'object' ? params.payload as HermesGatewayEventPayload : {},
        };
        this.events.emit('event', event);
        return;
      }
      const id = frame.id;
      if (typeof id !== 'number' || !this.pending.has(id)) return;
      const waiter = this.pending.get(id)!;
      this.pending.delete(id);
      const error = frame.error as HermesRpcError | undefined;
      if (error) waiter.reject(new Error(`HERMES_RPC_ERROR: ${error.message || 'unknown error'} (code ${error.code})`));
      else waiter.resolve((frame.result as Record<string, unknown>) ?? {});
    });
    const onClose = () => {
      this.closeError ??= new Error('HERMES_WS_CLOSED: the connection to the Hermes gateway closed.');
      for (const waiter of this.pending.values()) waiter.reject(this.closeError!);
      this.pending.clear();
    };
    ws.addEventListener('close', onClose);
    ws.addEventListener('error', onClose);
  }

  static async connect(token: string, signal?: AbortSignal): Promise<HermesGatewaySocket> {
    if (signal?.aborted) throw new DOMException('Run cancelled', 'AbortError');
    const ws = new WebSocket(`${HERMES_GATEWAY_WS_URL}?token=${encodeURIComponent(token)}`);
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        cleanup();
        try { ws.close(); } catch { /* already gone */ }
        rejectPromise(new Error('HERMES_WS_TIMEOUT: could not connect to ws://127.0.0.1:9119/api/ws — is `hermes dashboard` running?'));
      }, HERMES_WS_CONNECT_TIMEOUT_MS);
      const onOpen = () => { cleanup(); resolvePromise(); };
      const onFailure = () => { cleanup(); rejectPromise(new Error('HERMES_WS_UNREACHABLE: could not reach ws://127.0.0.1:9119/api/ws.')); };
      const onAbort = () => { cleanup(); try { ws.close(); } catch { /* already gone */ } rejectPromise(new DOMException('Run cancelled', 'AbortError')); };
      function cleanup(): void {
        clearTimeout(timer);
        ws.removeEventListener('open', onOpen);
        ws.removeEventListener('error', onFailure);
        ws.removeEventListener('close', onFailure);
        signal?.removeEventListener('abort', onAbort);
      }
      ws.addEventListener('open', onOpen, { once: true });
      ws.addEventListener('error', onFailure, { once: true });
      ws.addEventListener('close', onFailure, { once: true });
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    return new HermesGatewaySocket(ws);
  }

  /** Async iterator of every gateway event, closed automatically when `signal` fires
      (see node:events `on`) or when the caller stops iterating (`break`/`return`). */
  eventStream(signal?: AbortSignal): AsyncIterable<[HermesGatewayEvent]> {
    return on(this.events, 'event', { signal }) as AsyncIterable<[HermesGatewayEvent]>;
  }

  async call(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (this.closeError) throw this.closeError;
    const id = this.nextId++;
    const frame = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(new Error(`HERMES_RPC_TIMEOUT: ${method} did not answer in time.`));
      }, HERMES_WS_RPC_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (r) => { clearTimeout(timer); resolvePromise(r); },
        reject: (e) => { clearTimeout(timer); rejectPromise(e); },
      });
      this.ws.send(JSON.stringify(frame));
    });
  }

  close(): void {
    try { this.ws.close(); } catch { /* already closed */ }
  }
}

export async function stopHermesRun(_config: HermesConfig, runId: string): Promise<boolean> {
  if (!isLocalCoreServer()) return false;
  let socket: HermesGatewaySocket | null = null;
  try {
    socket = await HermesGatewaySocket.connect(hermesGatewayToken());
    await socket.call('session.interrupt', { session_id: runId });
    return true;
  } catch {
    return false;
  } finally {
    socket?.close();
  }
}

export async function* streamHermesProjectRun(
  config: HermesConfig,
  run: HermesProjectRun,
  signal?: AbortSignal,
): AsyncGenerator<HermesVinzEvent> {
  assertHermesWorkspace(config, run.workspaceRoot);
  if (!isLocalCoreServer()) {
    throw new Error('HERMES_LOCAL_ONLY: the native Hermes gateway (ws://127.0.0.1:9119) is reachable only from the Local Core on the Mac, never from the Netlify-hosted runtime.');
  }
  const receivedAt = performance.now();
  const timings: HermesTimings = { requestReceivedMs: 0 };
  const selectedModel = run.model || config.model;

  const socket = await HermesGatewaySocket.connect(hermesGatewayToken(), signal);
  let runId = '';
  try {
    const conversationKey = hermesConversationKey(run.projectId, run.conversationId);
    const wantModel = selectedModel || '';
    const wantProvider = run.provider || '';
    const stored = await hermesSessionStore().get(conversationKey, { type: 'json' }) as StoredHermesSession | null;

    /* Resume the SAME Hermes session across turns of one conversation so it
       keeps its own memory of tool calls, files read and reasoning instead
       of starting cold every message. Only when the requested model/provider
       still match what that session was created with — Hermes does not
       accept a model override on resume, so a genuine model change starts a
       fresh session on purpose rather than silently ignoring the user's
       choice. A resume that fails (e.g. Hermes restarted and the session is
       gone) also falls through to a fresh create rather than failing the
       whole turn. */
    let resumed: Record<string, unknown> | null = null;
    if (stored && stored.model === wantModel && stored.provider === wantProvider) {
      resumed = await socket.call('session.resume', { session_id: stored.sessionId }).catch(() => null);
    }

    const wasResumed = Boolean(resumed);
    let alreadyRunning = false;
    if (resumed) {
      runId = typeof resumed.session_id === 'string' ? resumed.session_id : '';
      if (!runId) throw new Error('HERMES_START_FAILED: session.resume did not return a session_id.');
      /* Reconnect case (app backgrounded/network dropped mid-turn, the client
         retries): the turn Hermes is running does not depend on our socket —
         only our VIEW of it broke. If resume reports the session still
         running, reattach and listen instead of calling prompt.submit again,
         which Hermes would reject outright ("session busy") and strand the
         client on a dead-end retry that can never see the real answer. */
      alreadyRunning = resumed.running === true;
    } else {
      const created = await socket.call('session.create', {
        cwd: run.workspaceRoot,
        title: hermesSessionId(run.projectId, run.conversationId, run.requestId),
        messages: run.turns.map(textTurn).filter((turn): turn is NonNullable<typeof turn> => Boolean(turn)),
        ...(selectedModel ? { model: selectedModel } : {}),
        ...(run.provider ? { provider: run.provider } : {}),
        ...(run.effort ? { reasoning_effort: run.effort } : {}),
      });
      runId = typeof created.session_id === 'string' ? created.session_id : '';
      const storedSessionId = typeof created.stored_session_id === 'string' ? created.stored_session_id : runId;
      if (!runId) throw new Error('HERMES_START_FAILED: session.create did not return a session_id.');
      await rememberHermesSession(conversationKey, storedSessionId, wantModel, wantProvider);
    }
    timings.runStartedMs = Math.round(performance.now() - receivedAt);
    yield { type: 'status', runId, status: 'starting', at: now() };

    if (!alreadyRunning) {
      /* The native gateway's session.create has no system-prompt/instructions
         field the way the old /v1/runs REST call did — a session's system
         prompt comes from the agent's own profile config, not a per-call
         override, so it travels as a preamble on prompt.submit instead. Full
         boundary/rules text only on a fresh session (Hermes has never seen
         them); a resumed session gets the light version — see
         resumeInstructions() above for why resending the full text every
         turn was real, compounding cost for nothing that changes mid
         conversation. */
      const preamble = wasResumed ? resumeInstructions(run) : instructions(run);
      const text = `${preamble}\n\n---\n\n${run.input}`;
      await socket.call('prompt.submit', { session_id: runId, text });
    }

    let settled: 'complete' | 'error' | null = null;
    for await (const [event] of socket.eventStream(signal)) {
      if (event.sessionId !== runId) continue;
      const elapsed = Math.round(performance.now() - receivedAt);
      timings.firstEventMs ??= elapsed;
      const payload = event.payload;
      if (event.type === 'message.delta' && typeof payload.text === 'string') {
        timings.firstTextDeltaMs ??= elapsed;
        yield { type: 'text_delta', runId, delta: payload.text, at: now() };
      } else if (event.type === 'reasoning.delta') {
        /* Hermes does not expose raw chain-of-thought over the gateway
           either; reasoning.delta only confirms a reasoning phase happened
           (same truthful boundary the old reasoning.available mapping kept). */
        yield { type: 'progress', runId, message: 'Ho scelto il prossimo passaggio.', at: now() };
      } else if (event.type === 'tool.start') {
        timings.firstToolEventMs ??= elapsed;
        const previewSource = typeof payload.context === 'string' ? payload.context : undefined;
        const preview = safeToolPreview(config, previewSource);
        yield { type: 'tool_started', runId, tool: typeof payload.name === 'string' ? payload.name : 'tool', ...(preview ? { preview } : {}), at: now() };
      } else if (event.type === 'tool.complete') {
        timings.firstToolEventMs ??= elapsed;
        const result = payload.result;
        const isError = Boolean(result && typeof result === 'object' && (result as Record<string, unknown>).isError);
        const durationMs = typeof payload.duration_s === 'number' ? Math.round(payload.duration_s * 1000) : undefined;
        yield { type: 'tool_completed', runId, tool: typeof payload.name === 'string' ? payload.name : 'tool', ...(durationMs !== undefined ? { durationMs } : {}), ...(isError ? { error: true } : {}), at: now() };
      } else if (event.type === 'approval.request') {
        const requestId = typeof payload.request_id === 'string' ? payload.request_id : undefined;
        const reason = typeof payload.reason === 'string' ? payload.reason : undefined;
        yield { type: 'approval_required', runId, ...(requestId ? { requestId } : {}), ...(reason ? { reason } : {}), at: now() };
        /* Fail-closed, unchanged from the REST adapter: VINZ.MON never lets a
           gateway approval prompt go unanswered/unattended. */
        await socket.call('approval.respond', { session_id: runId, choice: 'deny', ...(requestId ? { request_id: requestId } : {}) }).catch(() => undefined);
      } else if (event.type === 'session.info') {
        const context = hermesContextUsage(payload);
        if (context) yield { type: 'context', runId, hermes: context, at: now() };
        if (settled) return;
      } else if (event.type === 'message.complete') {
        timings.completedMs = elapsed;
        if (payload.status === 'error') {
          yield { type: 'error', runId, message: typeof payload.error === 'string' ? payload.error : 'Hermes run failed.', at: now() };
        } else {
          yield { type: 'status', runId, status: 'completed', at: now() };
          const usage = payload.usage && typeof payload.usage === 'object' ? payload.usage as Record<string, number> : undefined;
          yield { type: 'final', runId, text: typeof payload.text === 'string' ? payload.text : '', model: selectedModel, ...(usage ? { usage } : {}), timings: { ...timings }, at: now() };
        }
        settled = 'complete';
      } else if (event.type === 'error') {
        timings.completedMs = elapsed;
        yield { type: 'error', runId, message: typeof payload.message === 'string' ? payload.message : 'Hermes run failed.', at: now() };
        settled = 'error';
      }
      if (settled) break;
    }
    /* Hermes emits session.info with fresh context-window usage right after
       a turn settles (see _emit_settled_session_info upstream) — worth a
       short, bounded wait so the chat's context indicator has real numbers
       instead of staying blank; never worth hanging the response for.
       AbortSignal.timeout()/AbortSignal.any() do not reliably interrupt
       node:events' `on()` here (verified: the combined signal firing never
       unblocked a pending iterator) — a plain AbortController + setTimeout
       does, so that is what bounds this wait. */
    if (settled) {
      const graceController = new AbortController();
      const graceTimer = setTimeout(() => graceController.abort(), 2_000);
      const onOuterAbort = () => graceController.abort();
      signal?.addEventListener('abort', onOuterAbort, { once: true });
      try {
        for await (const [event] of socket.eventStream(graceController.signal)) {
          if (event.sessionId !== runId || event.type !== 'session.info') continue;
          const context = hermesContextUsage(event.payload);
          if (context) yield { type: 'context', runId, hermes: context, at: now() };
          break;
        }
      } catch { /* grace window expired or the caller cancelled — no context this turn, not fatal */ }
      finally {
        clearTimeout(graceTimer);
        signal?.removeEventListener('abort', onOuterAbort);
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      if (runId) await socket.call('session.interrupt', { session_id: runId }).catch(() => undefined);
      yield { type: 'status', runId, status: 'cancelled', at: now() };
      return;
    }
    throw error;
  } finally {
    socket.close();
  }
}
