/* ============================================================================
   LOCALE · SERVER — LA DECISIONE, SENZA LA SCHERMATA

   🔒 PERCHÉ QUESTO FILE ESISTE. Il confronto fra la copia di questo telefono
   e quella del server viveva dentro `dev/ServerSection.tsx`, cioè dentro una
   schermata. LAB → SYSTEM → SAVE fa la stessa domanda con un altro
   linguaggio visivo, e copiarci dentro le stesse quindici righe avrebbe
   creato due verità che si somigliano finché qualcuno non tocca una delle
   due — e questa è precisamente la parte del sistema in cui due risposte
   diverse fanno perdere giorni veri.

   ⚠️ È UNO SPOSTAMENTO, NON UNA RISCRITTURA. Le funzioni qui dentro sono
   quelle di prima, riga per riga: cambia solo che adesso sono pure, non
   sanno cos'è un `<div>`, e le montano in due.
   ========================================================================= */

/** Quello che riusciamo a leggere della copia salvata, che per il server è opaca. */
export interface SavePeek {
  day: number;
  savedAt: string | null;
  mons: number;
  activeMonName: string | null;
  kept: number;
  nodes: number;
}

/**
 * Il server tiene lo stato come `unknown` di proposito (vedi `state.ts`): non
 * sa cosa contiene e non deve saperlo. Qui lo si guarda dentro, quindi ogni
 * campo si legge in difesa — un salvataggio vecchio può non avere una chiave
 * che oggi diamo per scontata, e questa lettura deve dire «non lo so» invece
 * di rompersi proprio mentre stai cercando di capire se hai perso dei dati.
 */
export function peekSave(raw: unknown, day: number, savedAt: string | null): SavePeek {
  const s = (raw ?? {}) as Record<string, unknown>;
  const mons = s.mons && typeof s.mons === 'object' ? Object.keys(s.mons as object).length : 0;
  const kept = Array.isArray(s.kept) ? s.kept.length : 0;
  const nodes = Array.isArray(s.nodes) ? s.nodes.length : 0;
  const active = typeof s.activeMonName === 'string' ? s.activeMonName : null;
  return { day, savedAt, mons, activeMonName: active, kept, nodes };
}

/** «Due minuti fa» dice più di un timestamp ISO quando la domanda è «sta salvando?». */
export function quandoFa(iso: string | null): string {
  if (!iso) return 'mai';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return iso;
  const min = Math.round(ms / 60000);
  if (min < 1) return 'meno di un minuto fa';
  if (min < 60) return `${min} ${min === 1 ? 'minuto' : 'minuti'} fa`;
  const ore = Math.round(min / 60);
  if (ore < 24) return `${ore} ${ore === 1 ? 'ora' : 'ore'} fa`;
  const giorni = Math.round(ore / 24);
  return `${giorni} ${giorni === 1 ? 'giorno' : 'giorni'} fa`;
}

export type SaveVerdict = 'allineati' | 'server-indietro' | 'server-avanti' | 'divergenti';

/**
 * 🔒 IL VERDETTO GUARDA LA STORIA, NON IL GIORNO. Due copie possono stare
 * allo stesso giorno e contenere cose diverse — una forma nuova, un .mon
 * messo in teca, succedono DENTRO una giornata senza farla avanzare. È
 * esattamente il caso che ha fatto sparire dei progressi, quindi è il caso
 * che questa funzione deve saper nominare.
 */
export function compareSaves(local: SavePeek, server: SavePeek): SaveVerdict {
  const indietro =
    server.day < local.day ||
    server.mons < local.mons ||
    server.kept < local.kept ||
    server.nodes < local.nodes;
  const avanti =
    server.day > local.day ||
    server.mons > local.mons ||
    server.kept > local.kept ||
    server.nodes > local.nodes;

  if (indietro && avanti) return 'divergenti';
  if (indietro) return 'server-indietro';
  if (avanti) return 'server-avanti';
  return 'allineati';
}
