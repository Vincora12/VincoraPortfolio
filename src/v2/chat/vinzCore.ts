/* ============================================================================
   MOTORE «vinz-core» — il Local Core Server di VINZ

   Parla l'ingresso OpenAI-compatibile che il Core già espone
   (`netlify/functions/v1-chat-completions.ts`), quindi identità, Persona e
   contesto ME li compone il Core come per la Current: V2 non riscrive il
   prompt di sistema di VINZ e non ne tiene una seconda copia.

   🔒 IL GIRO DEGLI STRUMENTI, E PERCHÉ NON È QUELLO DI OPENAI. L'ingresso
   comprime la conversazione in UN ultimo turno utente (`mapMessagesToRequest`):
   se il secondo giro finisse con un messaggio `role: 'tool'`, quell'ultimo
   turno resterebbe vuoto e il fornitore rifiuterebbe la richiesta. Quindi il
   risultato dello strumento torna indietro come blocco di sistema e la domanda
   originale resta l'ultimo turno utente. Lo strumento è girato davvero e il suo
   output vero entra davvero nella risposta — cambia solo come viene consegnato.
   ========================================================================= */

import { useApp } from '@/state/store';

import { EngineError, type ChatEngine, type EngineReply, type HealthState, type SendOptions } from './engine';
import { runVinzTool, VINZ_TOOLS } from './tools';
import { newId, type V2ToolRun } from './types';

const ENDPOINT = '/v1/chat/completions';

interface OpenAiToolCall {
  id: string;
  function: { name: string; arguments: string };
}

interface CompletionResponse {
  model?: string;
  choices?: { message?: { content?: string | null; tool_calls?: OpenAiToolCall[] } }[];
  error?: { message?: string };
}

function token(): string | null {
  return useApp.getState().token;
}

async function post(body: unknown, signal: AbortSignal): Promise<CompletionResponse> {
  const auth = token();
  if (!auth) throw new EngineError('VINZ.MON non è attivo: manca il token.');

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` },
    body: JSON.stringify(body),
    signal,
  });

  const payload = (await response.json().catch(() => null)) as CompletionResponse | null;
  if (!response.ok) {
    throw new EngineError(payload?.error?.message ?? `Il Core ha risposto ${response.status}.`);
  }
  if (!payload) throw new EngineError('Risposta del Core non leggibile.');
  return payload;
}

export const vinzCoreEngine: ChatEngine = {
  id: 'vinz-core',
  label: 'VINZ Local Core',

  async health(signal): Promise<HealthState> {
    const auth = token();
    if (!auth) return { status: 'unconfigured', detail: 'VINZ.MON non è ancora attivo su questo dispositivo.' };
    try {
      const response = await fetch('/api/state', {
        headers: { authorization: `Bearer ${auth}` },
        cache: 'no-store',
        signal,
      });
      return response.ok
        ? { status: 'online', detail: 'Local Core raggiungibile.' }
        : { status: 'offline', detail: `Local Core ha risposto ${response.status}.` };
    } catch {
      return { status: 'offline', detail: 'Local Core non raggiungibile.' };
    }
  },

  async send({ turns, signal, onToolRun }: SendOptions): Promise<EngineReply> {
    const messages: Record<string, unknown>[] = turns.map((turn) => ({ role: turn.role, content: turn.content }));
    const tools = VINZ_TOOLS.map((tool) => ({
      type: 'function' as const,
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));

    const first = await post({ model: 'vinzmon-core', messages, tools, stream: false }, signal);
    const choice = first.choices?.[0]?.message;
    const calls = choice?.tool_calls ?? [];

    if (!calls.length) {
      return { text: choice?.content?.trim() ?? '', model: first.model, toolRuns: [] };
    }

    const runs: V2ToolRun[] = [];
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = call.function.arguments ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {};
      } catch {
        args = {};
      }

      const run: V2ToolRun = { id: call.id || newId('t'), name: call.function.name, args, status: 'running' };
      runs.push(run);
      onToolRun(run);

      const started = performance.now();
      const outcome = await runVinzTool(call.function.name, args);
      run.ms = Math.round(performance.now() - started);
      run.status = outcome.ok ? 'ok' : 'error';
      if (outcome.ok) run.result = outcome.result;
      else run.error = outcome.error ?? 'errore sconosciuto';
      onToolRun(run);
    }

    const evidence = runs
      .map((run) =>
        run.status === 'ok'
          ? `Strumento ${run.name} → ${run.result}`
          : `Strumento ${run.name} non riuscito: ${run.error}`,
      )
      .join('\n');

    const second = await post(
      {
        model: 'vinzmon-core',
        messages: [
          {
            role: 'system',
            content: `Risultati degli strumenti VINZ appena eseguiti, da usare come fonte di verità nella risposta:\n${evidence}`,
          },
          ...messages,
        ],
        stream: false,
      },
      signal,
    );

    return {
      text: second.choices?.[0]?.message?.content?.trim() ?? '',
      model: second.model,
      toolRuns: runs,
    };
  },
};
