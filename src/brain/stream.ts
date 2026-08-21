import type { BrainMessage } from './store/types';
import { TOOLS, assistantTurn, resultBlocks, type ToolResult, type ToolUse } from '../ai/tools';

/** Legge soltanto il token tecnico già salvato dall'app principale. */
export function savedToken(): string | null {
  try {
    const raw = localStorage.getItem('vinzmon.prototype.v4');
    const parsed = raw ? (JSON.parse(raw) as { state?: { token?: unknown } }) : null;
    return typeof parsed?.state?.token === 'string' ? parsed.state.token : null;
  } catch {
    return null;
  }
}

export async function streamReply(
  turns: BrainMessage[],
  user: string,
  signal: AbortSignal,
  onChunk: (chunk: string) => void,
  image?: { mediaType: string; data: string },
): Promise<void> {
  const token = savedToken();
  if (!token) throw new Error('Prima attiva VINZ.MON: manca il token.');

  const system = [{
    text: [
      'You are VINZ.MON, a high-quality general personal AI assistant.',
      'Be accurate, useful, direct and natural. Do not roleplay or simulate emotions or consciousness.',
      'Answer in the language used by the user. When the user writes Italian, use natural Italian.',
      'Prefer concise answers unless detail is useful or requested.',
      'If current information is needed, use web search and distinguish verified facts from inference.',
    ].join(' '),
  }];

  const response = await fetch('/api/ai', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      capability: 'character-voice',
      stream: false,
      system,
      webSearch: !image,
      ...(image ? { image } : {}),
      turns: turns.map(({ role, content, context }) => ({
        role,
        content: context ? `${content}\n\n[ALLEGATO]\n${context}` : content,
      })),
      user,
      maxTokens: 2000,
    }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.json().catch(() => null) as { error?: string; reason?: string } | null;
    throw new Error(detail?.reason ?? detail?.error ?? `Richiesta fallita (${response.status}).`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = await response.json() as { text?: string };
    if (!body.text) throw new Error(image ? 'Non sono riuscito a leggere l’immagine.' : 'La risposta è arrivata vuota.');
    onChunk(body.text);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) onChunk(chunk);
  }
}

const TOOL_INTENT = /\b(miei dati|mia salute|come sto|dormit|allenat|mangiat|giornat|protocollo|ricordami|promemoria|pagina|aspetto|schermata)\b/i;

/** Usa il loop strumenti solo quando la richiesta riguarda dati o azioni locali. */
export function shouldUseLocalTools(text: string): boolean {
  return TOOL_INTENT.test(text);
}

export async function replyWithLocalTools(
  turns: BrainMessage[],
  user: string,
  signal: AbortSignal,
  onChunk: (chunk: string) => void,
  run: (use: ToolUse) => ToolResult,
): Promise<void> {
  const token = savedToken();
  if (!token) throw new Error('Prima attiva VINZ.MON: manca il token.');

  const system = [{
    text: [
      'You are VINZ.MON, a neutral high-quality personal AI assistant.',
      'Answer in the user language. Use tools whenever the answer depends on personal data or the user asks for an action.',
      'Never claim an action succeeded unless its tool result confirms it. Be concise and natural.',
    ].join(' '),
  }];
  const history: Array<{ role: 'user' | 'assistant'; content: unknown }> = turns.map(
    ({ role, content, context }) => ({
      role,
      content: context ? `${content}\n\n[ALLEGATO]\n${context}` : content,
    }),
  );
  let currentUser = user;
  let userBlocks: Record<string, unknown>[] | undefined;

  for (let round = 0; round < 4; round++) {
    const response = await fetch('/api/ai', {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        capability: 'character-voice',
        system,
        turns: history,
        user: currentUser,
        ...(userBlocks ? { userBlocks } : {}),
        tools: round < 3 ? TOOLS : [],
        webSearch: true,
        effort: 'none',
        maxTokens: 2000,
      }),
    });
    const body = await response.json().catch(() => null) as {
      text?: string;
      toolUses?: ToolUse[];
      error?: string;
      reason?: string;
    } | null;
    if (!response.ok || !body) {
      throw new Error(body?.reason ?? body?.error ?? `Richiesta fallita (${response.status}).`);
    }

    const uses = body.toolUses ?? [];
    if (uses.length === 0) {
      if (!body.text?.trim()) throw new Error('La risposta è arrivata vuota.');
      onChunk(body.text);
      return;
    }

    history.push(assistantTurn(body.text ?? '', uses) as { role: 'assistant'; content: unknown });
    userBlocks = resultBlocks(uses.map(run));
    currentUser = '';
  }

  throw new Error('La richiesta ha usato troppi passaggi. Prova a dividerla in due.');
}
