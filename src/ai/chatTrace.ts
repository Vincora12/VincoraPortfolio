/* ============================================================================
   IL PERCORSO DI UNA RISPOSTA IN CHAT

   🔷 «Devo cercare di capire come funziona quando risponde, perché ci mette
   tantissimo a dare una risposta e dice delle cose strane... l'idea è quella
   di visualizzarlo.»

   Non è un contatore di spesa (quello è `usage.ts`): è la cronaca dell'ULTIMO
   scambio — quale strada ha preso, con che prompt, quanto ha impiegato, cosa
   ha chiamato. Vive fuori da zustand per lo stesso motivo di `usage.ts`: è
   telemetria di sviluppo, non stato della partita.
   ========================================================================= */

export interface ChatTraceStep {
  label: string;
  detail: string;
  ms: number;
}

export interface ChatTracePromptBlock {
  name: string;
  chars: number;
}

export interface ChatTrace {
  originatingUserMessageId?: string;
  /** `strumenti` = replyWithLocalTools, `diretto` = streamReply. */
  path: 'strumenti' | 'diretto';
  /** Se il .mon attivo c'era: la voce vera, o la riga neutra di sempre. */
  characterVoice: boolean;
  /** Caratteri totali mandati come system, tutti i blocchi insieme. */
  systemChars: number;
  /** Composizione del system senza conservarne o mostrarne il testo. */
  systemPromptComposition?: ChatTracePromptBlock[];
  /** Il modello che ha risposto per davvero, non quello richiesto. */
  model: string | null;
  effort: string | null;
  personality?: {
    monName: string;
    voicePreset: string;
    writingFingerprint?: string;
    reactions?: string;
  };
  /** Solo contesto realmente caricato per questo giro. */
  context?: string[];
  contextKind?: 'voice-notes' | 'sources' | 'retrieved-memories' | 'other';
  /** Un giro per round di strumenti; vuoto sulla strada diretta. */
  toolRounds: string[][];
  totalMs: number;
  error: string | null;
  steps: ChatTraceStep[];
  at: number;
}

const PROMPT_HEADING = /^[A-Z][A-Z0-9v .,'’/&()§—:+-]{2,}$/;

/**
 * Misura i blocchi principali senza salvare il loro contenuto nel trace.
 * Le intestazioni sono già parte del compilatore: qui diventano soltanto
 * etichette diagnostiche con il numero di caratteri realmente inviati.
 */
export function systemPromptComposition(
  blocks: Array<{ name: string; text: string }>,
): ChatTracePromptBlock[] {
  return blocks.flatMap(({ name, text }) => {
    const headings = [...text.matchAll(/^([^\n]+)$/gm)]
      .filter((match) => PROMPT_HEADING.test(match[1]!.trim()))
      .map((match) => ({ name: match[1]!.trim(), at: match.index ?? 0 }));
    if (headings.length === 0) return [{ name, chars: text.length }];

    const measured: ChatTracePromptBlock[] = [];
    if (headings[0]!.at > 0) measured.push({ name, chars: headings[0]!.at });
    headings.forEach((heading, index) => {
      const end = headings[index + 1]?.at ?? text.length;
      measured.push({ name: heading.name, chars: end - heading.at });
    });
    return measured.filter((block) => block.chars > 0);
  });
}

let last: ChatTrace | null = null;
const listeners = new Set<() => void>();

export function recordChatTrace(t: ChatTrace): void {
  last = t;
  listeners.forEach((l) => l());
}

function auth(): HeadersInit | null {
  try {
    const raw = localStorage.getItem('vinzmon.prototype.v4');
    const parsed = raw ? JSON.parse(raw) as { state?: { token?: unknown } } : null;
    const token = typeof parsed?.state?.token === 'string' ? parsed.state.token : null;
    return token ? { authorization: `Bearer ${token}` } : null;
  } catch {
    return null;
  }
}

/** Salva il trace nel medesimo store Netlify persistente usato dalla chat. */
export async function persistChatTrace(trace: ChatTrace): Promise<string | null> {
  const headers = auth();
  if (!headers) return null;
  const id = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    const response = await fetch(`/api/user-data?key=${encodeURIComponent(`chat-trace:${id}`)}`, {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json', 'if-match': 'vinzmon-new' },
      body: JSON.stringify(trace),
    });
    return response.ok ? id : null;
  } catch {
    return null;
  }
}

export async function loadChatTrace(id: string): Promise<ChatTrace | null> {
  const headers = auth();
  if (!headers || !id) return null;
  try {
    const response = await fetch(`/api/user-data?key=${encodeURIComponent(`chat-trace:${id}`)}`, {
      headers,
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const body = await response.json() as { value?: string | null };
    return typeof body.value === 'string' ? JSON.parse(body.value) as ChatTrace : null;
  } catch {
    return null;
  }
}

export function lastChatTrace(): ChatTrace | null {
  return last;
}

export function subscribeChatTrace(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Aiuto per chi produce il trace: un cronometro con tappe nominate. */
export function traceClock(): {
  mark: (label: string, detail: string) => void;
  steps: () => ChatTraceStep[];
  elapsed: () => number;
} {
  const t0 = performance.now();
  const steps: ChatTraceStep[] = [];
  return {
    mark: (label, detail) => steps.push({ label, detail, ms: Math.round(performance.now() - t0) }),
    steps: () => steps,
    elapsed: () => Math.round(performance.now() - t0),
  };
}
