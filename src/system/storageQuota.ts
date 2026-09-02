/* ============================================================================
   QUOTA EXCEEDED (SYSTEM.LAB / STORAGE §6)

   `navigator.storage.estimate()` su Safari iOS non dà un numero abbastanza
   preciso da far scattare da solo lo stato QUOTA EXCEEDED: la stima può
   restare sotto soglia anche quando una scrittura è appena stata rifiutata
   per davvero. L'unico segnale certo è l'errore stesso, quando capita.

   🔒 NON si scrive in `localStorage` per ricordarlo: se è pieno, anche
   quella scrittura fallirebbe. `sessionStorage` ha una quota sua, quasi mai
   piena, e si svuota da sola alla chiusura della scheda — che è anche il
   confine giusto per "recente".
   ========================================================================= */

const KEY = 'vinzmon.storage.quotaExceeded.v1';

export interface QuotaExceededRecord {
  at: string;
  context: string;
}

/** DOMException 22 (o il vecchio `code` 1014 su Firefox) è l'unico modo
    portabile di riconoscere "lo storage ha detto di no". */
export function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof DOMException)) return false;
  return error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014;
}

export function recordQuotaExceeded(context: string): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    const record: QuotaExceededRecord = { at: new Date().toISOString(), context };
    sessionStorage.setItem(KEY, JSON.stringify(record));
  } catch { /* se anche sessionStorage rifiuta, non c'è altro da registrare qui */ }
}

export function recentQuotaExceeded(withinMs = 24 * 60 * 60 * 1000): QuotaExceededRecord | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<QuotaExceededRecord>;
    if (typeof parsed.at !== 'string' || typeof parsed.context !== 'string') return null;
    if (Date.now() - Date.parse(parsed.at) > withinMs) return null;
    return { at: parsed.at, context: parsed.context };
  } catch {
    return null;
  }
}
