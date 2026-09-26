import type { ThreadMessage } from '@assistant-ui/react';

export type HermesClientEvent =
  | { type: 'status'; runId: string; status: string; at: string }
  | { type: 'progress'; runId: string; message: string; at: string }
  | { type: 'text_delta'; runId: string; delta: string; at: string }
  | { type: 'tool_started' | 'tool_progress'; runId: string; tool: string; preview?: string; at: string }
  | { type: 'tool_completed'; runId: string; tool: string; durationMs?: number; error?: boolean; at: string }
  | { type: 'approval_required'; runId: string; requestId?: string; reason?: string; at: string }
  | { type: 'final'; runId: string; text: string; model?: string; usage?: Record<string, number>; costUsd?: number; timings: Record<string, number>; files?: HermesWorkspaceFile[]; at: string }
  | { type: 'error'; runId: string; message: string; at: string }
  | { type: 'context'; runId: string; hermes?: ContextUsage; vinz?: ContextUsage; at: string };

export interface ContextUsage {
  usedTokens: number;
  maxTokens: number;
  percent: number;
  estimated?: boolean;
}

/** A file Hermes created or changed in the Project workspace this turn —
    path relative to the workspace root, downloadable via the existing
    /api/vinz-workspace `read-binary` action. */
export interface HermesWorkspaceFile {
  path: string;
  size: number;
}

function wasHermes(message: ThreadMessage): boolean {
  const custom = message.metadata?.custom as Record<string, unknown> | undefined;
  return custom?.orchestrator === 'hermes';
}

export function shouldUseHermesProject(messages: readonly ThreadMessage[], user: string): boolean {
  return Boolean(user.trim()) || messages.slice(-4, -1).some(wasHermes);
}

/** vNext Turn Decision Record: why the last CEREBRO delegation fell back to the legacy path. */
export let lastHermesFallbackCode: string | null = null;

export async function openHermesProjectRun(input: {
  token: string;
  requestId: string;
  projectId: string;
  conversationId: string;
  user: string;
  turns: Array<{ role: 'user' | 'assistant'; content: string }>;
  model?: string;
  effort?: string;
  images?: Array<{ mediaType: string; data: string }>;
  files?: Array<{ mediaType: string; data: string; filename: string }>;
  actionIntent?: { action: 'meal' | 'workout' | 'weight'; status: 'needs-confirmation' | 'confirmed'; slot?: string };
  signal: AbortSignal;
}): Promise<Response | null> {
  const response = await fetch('/api/runs', {
    method: 'POST',
    signal: input.signal,
    headers: { authorization: `Bearer ${input.token}`, 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({
      stream: true,
      profile: 'project-chat',
      runId: input.requestId,
      projectId: input.projectId,
      conversationId: input.conversationId,
      input: input.user,
      turns: input.turns,
      ...(input.model ? { model: input.model } : {}),
      ...(input.effort ? { effort: input.effort } : {}),
      ...(input.images?.length ? { images: input.images } : {}),
      ...(input.files?.length ? { files: input.files } : {}),
      ...(input.actionIntent ? { actionIntent: input.actionIntent } : {}),
    }),
  });
  if (response.status === 409) {
    const problem = await response.json().catch(() => null) as { code?: string } | null;
    if (problem?.code === 'HERMES_DISABLED' || problem?.code === 'HERMES_WORKSPACE_MISMATCH') {
      lastHermesFallbackCode = problem.code;
      return null;
    }
    throw new Error(problem?.code ?? 'Hermes Project workspace non disponibile.');
  }
  if (!response.ok || !response.body) {
    const problem = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(problem?.error ?? `Hermes non disponibile (${response.status}).`);
  }
  return response;
}

export async function* readHermesProjectEvents(response: Response): AsyncGenerator<HermesClientEvent> {
  if (!response.body) throw new Error('Lo stream Hermes non è disponibile.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const data = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
      if (data) yield JSON.parse(data) as HermesClientEvent;
    }
    if (done) break;
  }
}

/** Forgets the persisted Hermes session for this conversation — the "new
    Hermes session" control next to the context indicator. The next turn
    starts a fresh Hermes session instead of resuming the growing one. */
export async function resetHermesSession(input: { token: string; projectId: string; conversationId: string }): Promise<boolean> {
  const response = await fetch('/api/runs', {
    method: 'POST',
    headers: { authorization: `Bearer ${input.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'hermes-reset-session', projectId: input.projectId, conversationId: input.conversationId }),
  });
  return response.ok;
}
