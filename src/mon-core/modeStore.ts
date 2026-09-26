/* MON CORE — the user's execution-mode override (AUTO | ANSWER | ACTION | WORK).

   A per-device preference, not shared data: it only says how the NEXT turns
   should be routed, and `decideTurn()` still validates it (a WORK request
   outside a Project, for example, is recorded as rejected and AUTO decides).
   localStorage is a convenience cache here; losing it simply means AUTO. */
import { useSyncExternalStore } from 'react';
import { isModeRequest, type ModeRequest } from './turnDecision';

const KEY = 'vinzmon.mon-core.mode.v1';
const listeners = new Set<() => void>();

function read(): ModeRequest {
  try {
    const value = globalThis.localStorage?.getItem(KEY);
    return isModeRequest(value) ? value : 'AUTO';
  } catch {
    return 'AUTO';
  }
}

let current: ModeRequest = read();

export function currentModeRequest(): ModeRequest {
  return current;
}

export function setModeRequest(mode: ModeRequest): void {
  current = mode;
  try { globalThis.localStorage?.setItem(KEY, mode); } catch { /* preference only */ }
  listeners.forEach((listener) => listener());
}

export function useModeRequest(): ModeRequest {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => current,
    () => 'AUTO' as ModeRequest,
  );
}
