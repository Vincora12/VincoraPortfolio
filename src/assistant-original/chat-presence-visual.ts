export const PRESENCE_STEP_MS = 320;

const pendingArrivalIds = new Set<string>();

export function revealMetadata(delayMs: number) {
  const revealArrivalId = crypto.randomUUID();
  pendingArrivalIds.add(revealArrivalId);
  return {
    revealArrivalId,
    revealDelayMs: delayMs,
  };
}

export function isPendingReveal(arrivalId: unknown) {
  return typeof arrivalId === "string" && pendingArrivalIds.has(arrivalId);
}

export function markRevealSeen(arrivalId: unknown) {
  if (typeof arrivalId === "string") pendingArrivalIds.delete(arrivalId);
}
