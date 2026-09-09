import { setLocalStorageItem } from '../system/localStorageDiagnostics';

/* 🔒 Solo l'ULTIMA posizione, mai uno storico. Un indirizzo di oggi non deve
   diventare una traccia di dove sei stato — coerente con l'idea che questa è
   una scorciatoia («dove sono adesso»), non un log GPS. */
export type LocationSignal = { text: string; at: string };

const KEY = 'vinzmon.location.v1';

export function saveLocation(text: string, at: string): void {
  const value: LocationSignal = { text, at };
  setLocalStorageItem('locationSignal', KEY, JSON.stringify(value));
}

export function loadLocation(): LocationSignal | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LocationSignal;
  } catch {
    return null;
  }
}
