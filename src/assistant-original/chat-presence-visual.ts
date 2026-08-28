export const CHAT_REVEAL_SESSION = crypto.randomUUID();

export const PRESENCE_STEP_MS = 320;

export function revealMetadata(delayMs: number) {
  return {
    revealSession: CHAT_REVEAL_SESSION,
    revealDelayMs: delayMs,
  };
}
