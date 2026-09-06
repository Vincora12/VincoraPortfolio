/* ============================================================================
   COSA È SUCCESSO NELLE ULTIME CHIAMATE (brief §4, §11)

   «Log requests in DEV/LAB with action, timestamp, success/failure and AI
   cost when applicable, but never log the secret token.»

   Un anello di poche righe, scritto da `shortcut.ts` a ogni chiamata e letto
   da `shortcut-status.ts` per VINZ.LAB → SHORTCUT API. Nessun contenuto
   dell'azione (niente testo del pasto, niente numero del peso) — solo la
   forma della chiamata: cosa, quando, riuscita o no, quanto è costata.
   ========================================================================= */

import { getStore } from './localStore';
import type { ShortcutActionId } from './shortcutActions';

export interface ShortcutCallLog {
  action: ShortcutActionId | 'unknown';
  at: string;
  ok: boolean;
  ms: number;
  costUsd: number;
  /** Solo per i log del server, mai il token. */
  reason?: string;
}

const KEY = 'recent';
const MAX = 20;

const store = () => getStore('vinzmon-shortcut-log');

export async function recordShortcutCall(entry: ShortcutCallLog): Promise<void> {
  const existing = ((await store().get(KEY, { type: 'json' })) as ShortcutCallLog[] | null) ?? [];
  const next = [...existing, entry].slice(-MAX);
  await store().setJSON(KEY, next);
}

export async function recentShortcutCalls(): Promise<ShortcutCallLog[]> {
  const existing = ((await store().get(KEY, { type: 'json' })) as ShortcutCallLog[] | null) ?? [];
  return [...existing].reverse();
}
