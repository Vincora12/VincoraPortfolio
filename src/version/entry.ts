/* ============================================================================
   QUALE DELLE DUE VINZ.MON

   Due versioni dello stesso prodotto, nello stesso repository, nella stessa
   build, sullo stesso dominio: VINZ.MON (Current) e Vinz.mon_v2.

   🔒 SI LEGGE IL FRAMMENTO, NON IL PERCORSO. Il percorso è già impegnato:
   `/lab` è un documento suo su disco (vedi `lab/entrypoint.ts`), e il Core
   Server serve `dist/` come sito statico senza router. Spostare l'app attuale
   sotto `/current` vorrebbe dire toccare Netlify, il Core Server e il service
   worker per guadagnare zero: il frammento non viaggia mai al server, quindi
   `#/v2` funziona al refresh senza una sola regola di riscrittura.

   ⚠️ LA REGOLA È ASIMMETRICA APPOSTA. Solo il frammento VUOTO apre il
   selettore; qualunque altro frammento sconosciuto cade su Current. Così ogni
   link profondo già esistente (`#/artifact/…`, i segnalibri, la schermata Home
   di iOS) continua a entrare esattamente dov'entrava prima, e l'unica cosa che
   cambia per la versione attuale è la radice nuda.
   ========================================================================= */

export type VinzVersion = 'current' | 'v2';

export type VersionEntry = { kind: 'selector' } | { kind: 'version'; version: VinzVersion };

const LAST_KEY = 'vinzmon.version.last';

export function readVersionEntry(hash = window.location.hash): VersionEntry {
  const value = hash.trim();

  if (value === '' || value === '#' || value === '#/') return { kind: 'selector' };
  if (/^#\/v2(?:\/.*)?$/.test(value)) return { kind: 'version', version: 'v2' };

  return { kind: 'version', version: 'current' };
}

/**
 * L'ultima versione scelta si ricorda, ma non decide: serve solo a marcarla
 * nel selettore. Nessun rimbalzo automatico — se una versione si rompe, la
 * radice deve restare la via d'uscita verso l'altra.
 */
export function readLastVersion(): VinzVersion | null {
  try {
    const value = localStorage.getItem(LAST_KEY);
    return value === 'current' || value === 'v2' ? value : null;
  } catch {
    return null;
  }
}

export function enterVersion(version: VinzVersion): void {
  try {
    localStorage.setItem(LAST_KEY, version);
  } catch {
    /* Safari in navigazione privata: la scelta vale lo stesso, non si ricorda. */
  }
  /* Il ricaricamento è voluto: le due versioni montano alberi React diversi e
     caricano fogli di stile diversi. Rimontare a caldo dentro la stessa pagina
     lascerebbe addosso gli stili di quella che si sta lasciando. */
  window.location.hash = version === 'v2' ? '#/v2' : '#/current';
  window.location.reload();
}

export function backToSelector(): void {
  window.location.hash = '';
  window.location.reload();
}
