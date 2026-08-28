let manualRoomTarget: string | null = null;
let inMemorySessionEntered = false;
let roomEntryRevision = 0;
const roomEntryListeners = new Set<() => void>();

export function requestManualRoomEntry(threadId: string) {
  manualRoomTarget = threadId;
}

export function requestNextRoomEntry() {
  manualRoomTarget = "*";
  roomEntryRevision += 1;
  roomEntryListeners.forEach((listener) => listener());
}

export function subscribeRoomEntry(listener: () => void) {
  roomEntryListeners.add(listener);
  return () => roomEntryListeners.delete(listener);
}

export function currentRoomEntryRevision() {
  return roomEntryRevision;
}

export function consumeManualRoomEntry(threadId: string) {
  if (manualRoomTarget !== "*" && manualRoomTarget !== threadId) return false;
  manualRoomTarget = null;
  return true;
}

export function claimSessionRoomEntry() {
  if (inMemorySessionEntered) return false;
  inMemorySessionEntered = true;
  return true;
}
