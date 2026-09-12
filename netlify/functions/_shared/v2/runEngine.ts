import { callProvider, type ProviderResult, type ToolUse, type Turn } from '../providers';
import { appendRuntimeEvent } from '../runtimeLog';
import { recordSpend } from '../spend';
import { assembleContext } from './contextAssembler';
import { canonicalDomains } from './domains';
import { resolveRunModel } from './modelRegistry';
import { mayExecuteTool } from './permissions';
import { saveRun } from './runStore';
import type { ContextDomains, RunEvent, RunRequest, RunResult, ServerTool, ToolExecutionResult } from './contracts';

const MAX_ROUNDS = 6;
const TOOL_RESULT_BUDGET_CHARS = 9_000;
const active = new Map<string, AbortController>();

export interface RunDependencies {
  domains?: ContextDomains;
  tools?: ServerTool[];
  provider?: typeof callProvider;
  persist?: boolean;
}

const event = (events: RunEvent[], runId: string, type: RunEvent['type'], status: RunEvent['status'], extra: Partial<RunEvent> = {}) => {
  events.push({ runId, at: new Date().toISOString(), type, status, ...extra });
};

function assistantTurn(text: string, uses: ToolUse[]): Turn {
  return { role: 'assistant', content: [
    ...(text.trim() ? [{ type: 'text', text }] : []),
    ...uses.map((use) => ({ type: 'tool_use', id: use.id, name: use.name, input: use.input })),
  ] };
}

function resultBlocks(results: ToolExecutionResult[]): Record<string, unknown>[] {
  let remaining = TOOL_RESULT_BUDGET_CHARS;
  return results.map((result) => {
    const content = result.content.length <= remaining ? result.content : `${result.content.slice(0, Math.max(0, remaining))}\n[TRUNCATED BY RUN BUDGET]`;
    remaining = Math.max(0, remaining - content.length);
    return { type: 'tool_result', tool_use_id: result.id, content, ...(result.isError ? { is_error: true } : {}) };
  });
}

export function cancelRun(runId: string): boolean {
  const controller = active.get(runId);
  if (!controller) return false;
  controller.abort();
  return true;
}

export async function executeRun(request: RunRequest, dependencies: RunDependencies = {}): Promise<RunResult> {
  const runId = request.runId ?? crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const events: RunEvent[] = [];
  const controller = new AbortController();
  active.set(runId, controller);
  event(events, runId, 'created', 'assembling-context');
  const tools = dependencies.tools ?? [];
  const allowedTools = tools.filter((tool) => mayExecuteTool(request.profile, tool));
  const exposedDefinitions = request.toolMode === 'caller' ? (request.tools ?? []) : allowedTools.map((tool) => tool.definition);
  const toolDefinitionText = exposedDefinitions.length ? exposedDefinitions.map((tool) => `${tool.name}: ${tool.description}`).join('\n') : undefined;
  const context = await assembleContext(dependencies.domains ?? canonicalDomains, {
    query: request.input,
    projectId: request.projectId,
    recentTurns: (request.turns ?? []).slice(-8).map((turn) => `${turn.role}: ${typeof turn.content === 'string' ? turn.content : '[structured content]'}`).join('\n'),
    windowTokens: request.contextWindow,
    toolDefinitionText,
    allowPersonal: !['lab', 'inspection', 'coding'].includes(request.profile),
  });
  event(events, runId, 'context-ready', 'running');
  const route = resolveRunModel(request.profile, request.modelPreference);
  let turns = [...(request.turns ?? [])];
  let user = request.input;
  let userBlocks: Record<string, unknown>[] | undefined;
  let result: ProviderResult | undefined;
  let costUsd = 0;
  const toolUses: Array<{ name: string; ok: boolean }> = [];
  const sources: RunResult['sources'] = [];
  try {
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      if (controller.signal.aborted) throw new DOMException('Run cancelled', 'AbortError');
      event(events, runId, 'model-started', 'running');
      result = await (dependencies.provider ?? callProvider)(route.provider, {
        model: route.model,
        system: [...(request.system ?? []), ...context.system],
        turns,
        user: userBlocks ? '' : user,
        ...(userBlocks ? { userBlocks } : {}),
        tools: request.toolMode === 'caller' ? exposedDefinitions : round < MAX_ROUNDS - 1 ? exposedDefinitions : [],
        maxTokens: Math.min(request.maxOutputTokens ?? context.reservedOutputTokens, context.reservedOutputTokens),
        effort: request.profile === 'lab' || request.profile === 'coding' ? 'medium' : 'low',
        webSearch: request.webSearch === true,
      });
      sources.push(...result.sources);
      if (result.usage.inputTokens || result.usage.outputTokens) {
        costUsd += await recordSpend(route.billingCapability, result.model, result.usage, { action: 'v2-run', subsystem: request.profile });
      }
      if (!result.ok) throw new Error(result.error ?? 'model unavailable');
      if (!result.toolUses.length || request.toolMode === 'caller') break;
      if (round === 0 && user) turns.push({ role: 'user', content: user });
      if (userBlocks) turns.push({ role: 'user', content: userBlocks });
      turns.push(assistantTurn(result.text, result.toolUses));
      const outcomes: ToolExecutionResult[] = [];
      for (const use of result.toolUses) {
        const tool = allowedTools.find((candidate) => candidate.definition.name === use.name);
        event(events, runId, 'tool-started', 'running', { toolName: use.name });
        const outcome = tool
          ? await tool.execute(use, controller.signal)
          : { id: use.id, content: `Tool not allowed: ${use.name}`, isError: true };
        outcomes.push(outcome);
        toolUses.push({ name: use.name, ok: !outcome.isError });
        event(events, runId, 'tool-finished', 'running', { toolName: use.name, ...(outcome.isError ? { error: outcome.content.slice(0, 240) } : {}) });
      }
      userBlocks = resultBlocks(outcomes);
      user = '';
    }
    if (!result?.ok || (result.toolUses.length && request.toolMode !== 'caller')) throw new Error('Run exceeded the tool round limit.');
    event(events, runId, 'completed', 'completed');
    const completed: RunResult = { runId, status: 'completed', text: result.text.trim(), model: result.model, projectId: request.projectId, toolUses, ...(result.toolUses.length ? { rawToolUses: result.toolUses } : {}), sources: [...new Map(sources.map((source) => [source.url, source])).values()], usage: { ...result.usage, costUsd }, context, events };
    if (dependencies.persist !== false) await saveRun(completed, request.profile, createdAt, request.conversationId);
    void appendRuntimeEvent({ eventType: 'V2_RUN_COMPLETED', status: 'PASS', scope: request.profile === 'lab' ? 'agent-lab' : 'ai', requestId: runId, conversationId: request.conversationId, model: result.model, metadata: { count: context.trace.filter((item) => item.selected).length } });
    return completed;
  } catch (error) {
    const cancelled = error instanceof DOMException && error.name === 'AbortError';
    event(events, runId, cancelled ? 'cancelled' : 'failed', cancelled ? 'cancelled' : 'failed', { error: error instanceof Error ? error.message : String(error) });
    const failed: RunResult = { runId, status: cancelled ? 'cancelled' : 'failed', text: '', model: result?.model ?? route.model, projectId: request.projectId, toolUses, sources, usage: { ...result?.usage, costUsd }, context, events, error: error instanceof Error ? error.message : String(error) };
    if (dependencies.persist !== false) await saveRun(failed, request.profile, createdAt, request.conversationId);
    void appendRuntimeEvent({ eventType: cancelled ? 'V2_RUN_CANCELLED' : 'V2_RUN_FAILED', status: 'FAIL', scope: request.profile === 'lab' ? 'agent-lab' : 'ai', requestId: runId, conversationId: request.conversationId, model: failed.model, error: failed.error });
    return failed;
  } finally {
    active.delete(runId);
  }
}
