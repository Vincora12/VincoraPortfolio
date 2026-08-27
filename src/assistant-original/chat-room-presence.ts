const SESSION_ENTRY_KEY = "vinz-chat:room-entry:v1";

let manualRoomTarget: string | null = null;
let inMemorySessionEntered = false;

export function requestManualRoomEntry(threadId: string) {
  manualRoomTarget = threadId;
}

export function requestNextRoomEntry() {
  manualRoomTarget = "*";
}

export function consumeManualRoomEntry(threadId: string) {
  if (manualRoomTarget !== "*" && manualRoomTarget !== threadId) return false;
  manualRoomTarget = null;
  return true;
}

export function claimSessionRoomEntry() {
  if (inMemorySessionEntered) return false;
  try {
    if (window.sessionStorage.getItem(SESSION_ENTRY_KEY) === "1") {
      inMemorySessionEntered = true;
      return false;
    }
    window.sessionStorage.setItem(SESSION_ENTRY_KEY, "1");
  } catch {
    // Private browsing may deny storage. The module guard still prevents
    // remounts and Strict Mode reruns from becoming room entries.
  }
  inMemorySessionEntered = true;
  return true;
}
