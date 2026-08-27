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

export interface ChatTrace {
  /** `strumenti` = replyWithLocalTools, `diretto` = streamReply. */
  path: 'strumenti' | 'diretto';
  /** Se il .mon attivo c'era: la voce vera, o la riga neutra di sempre. */
  characterVoice: boolean;
  /** Caratteri totali mandati come system, tutti i blocchi insieme. */
  systemChars: number;
  /** Il modello che ha risposto per davvero, non quello richiesto. */
  model: string | null;
  effort: string | null;
  /** Un giro per round di strumenti; vuoto sulla strada diretta. */
  toolRounds: string[][];
  totalMs: number;
  error: string | null;
  steps: ChatTraceStep[];
  at: number;
}

let last: ChatTrace | null = null;
const listeners = new Set<() => void>();

export function recordChatTrace(t: ChatTrace): void {
  last = t;
  listeners.forEach((l) => l());
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
