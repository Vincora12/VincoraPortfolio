import { setLocalStorageItem } from '../system/localStorageDiagnostics';

/* 🔒 Come locationSignal.ts: solo l'ULTIMO valore per ciascun segnale, mai
   uno storico — sono scorciatoie «cosa sta succedendo adesso», non un log. */
export type DeviceSignals = {
  nowPlaying?: { text: string; at: string };
  focus?: { text: string; at: string };
  battery?: { percent: number; at: string };
};

const KEY = 'vinzmon.device.v1';

function load(): DeviceSignals {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DeviceSignals) : {};
  } catch {
    return {};
  }
}

function save(patch: DeviceSignals): void {
  const next = { ...load(), ...patch };
  setLocalStorageItem('deviceSignals', KEY, JSON.stringify(next));
}

export function saveNowPlaying(text: string, at: string): void {
  save({ nowPlaying: { text, at } });
}

export function saveFocus(text: string, at: string): void {
  save({ focus: { text, at } });
}

export function saveBattery(percent: number, at: string): void {
  save({ battery: { percent, at } });
}

export function loadDeviceSignals(): DeviceSignals {
  return load();
}
