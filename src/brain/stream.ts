import type { BrainMessage } from './store/types';

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
      stream: !image,
      system,
      webSearch: !image,
      ...(image ? { image } : {}),
      turns: turns.map(({ role, content }) => ({ role, content })),
      user,
      maxTokens: 2000,
    }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.json().catch(() => null) as { error?: string; reason?: string } | null;
    throw new Error(detail?.reason ?? detail?.error ?? `Richiesta fallita (${response.status}).`);
  }

  if (image) {
    const body = await response.json() as { text?: string };
    if (!body.text) throw new Error('Non sono riuscito a leggere l’immagine.');
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
