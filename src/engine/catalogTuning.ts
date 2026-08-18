/* ============================================================================
   CATALOGHI ACCESI E SPENTI (§20.3)

   🔷 «Nel DEV mettimi una sezione con tutte le famiglie e gli stili che si
   attivano, così posso accendere e spegnere io quello che mi piace dopo varie
   prove.»

   E il MASTER CHARACTER SYSTEM v1.1 §12 lo prevede per iscritto, almeno per i
   designer: «Approval means the designer remains in the active library;
   rejection removes it from active selection.» Questo file è il posto dove
   quell'approvazione vive.

   ════════════════════════════════════════════════════════════════════════════
   ⚠️ SPEGNERE NON È CANCELLARE, ED È UNA DIFFERENZA CHE SI PAGA SE SI CONFONDE.

   Una voce spenta resta nel catalogo, resta leggibile, e i .mon già nati con
   quella voce restano esattamente come sono. Cambia UNA cosa sola: non viene
   più estratta per le creature che devono ancora nascere.

   🔒 Perché è l'unico modo onesto. Un .mon nato ANGEL non può diventare
   qualcos'altro perché tu oggi hai deciso che gli angeli non ti piacciono:
   sarebbe riscrivere il passato, che è la cosa che questo progetto non fa
   (§29 — «una creatura porta scritta la versione con cui è nata»).
   ════════════════════════════════════════════════════════════════════════════

   🔒 E NON SI PUÒ SPEGNERE TUTTO. Ogni asse deve conservare almeno una voce
   accesa — due per le Family, perché con una sola tutte le creature nascono
   della stessa specie e il motore smette di essere un motore. Il rifiuto è in
   blocco: si dice cosa non va e non si applica niente, invece di applicare
   metà di una configurazione che non sta in piedi.
   ========================================================================= */

import {
  APPEARANCES,
  AFFINITIES,
  DESIGN_DNA,
  FAMILIES,
  FASHIONS,
  MOODS,
  ROLES,
} from './generation-config';

/** Gli assi su cui si può accendere e spegnere. */
export const CATALOG_AXES = ['family', 'affinity', 'role', 'fashion', 'mood', 'appearance', 'design'] as const;
export type CatalogAxis = (typeof CATALOG_AXES)[number];

export interface AxisInfo {
  /** Come si chiama davanti a te. */
  label: string;
  /** Tutte le voci esistenti, accese o spente. */
  all: readonly string[];
  /**
   * Quante ne devono restare accese.
   *
   * 🔒 Due per le Family: con una sola, ogni creatura nasce della stessa
   * specie e il generatore diventa un timbro. Una per gli altri assi: sono
   * modificatori, e bloccarne uno è una scelta legittima («tutte le prove in
   * CEL, per confrontare i designer» è esattamente il protocollo §12).
   */
  min: number;
  it: string;
}

export const AXES: Record<CatalogAxis, AxisInfo> = {
  family: {
    label: 'FAMILY',
    all: FAMILIES.map((f) => f.id),
    min: 2,
    it: 'la specie: che corpo ha',
  },
  affinity: {
    label: 'AFFINITY',
    all: AFFINITIES.map((a) => a.id),
    min: 1,
    it: 'la contaminazione: cosa tocca il corpo senza sostituirlo',
  },
  role: { label: 'RUOLO', all: ROLES.map((r) => r.id), min: 1, it: 'come sta al mondo' },
  fashion: { label: 'STILE', all: FASHIONS.map((f) => f.id), min: 1, it: 'la logica di vestizione' },
  mood: { label: 'TEMPERAMENTO', all: MOODS.map((m) => m.id), min: 1, it: 'il carattere con cui nasce' },
  appearance: {
    label: 'RESA',
    all: APPEARANCES,
    min: 1,
    it: 'COME è reso: superficie, non costruzione',
  },
  design: {
    label: 'CHARACTER DESIGN DNA',
    all: DESIGN_DNA.map((d) => d.id),
    min: 1,
    it: 'COM’È costruito: proporzioni, masse, faccia',
  },
};

/* ============================================================================
   QUELLO CHE NASCE SPENTO

   🔷 «Metti sempre disabilitato SLIME, FAIRY, INK, cartoon e toy.»

   🔒 SPENTO DI PARTENZA NON È CANCELLATO. Queste voci restano nel catalogo,
   si vedono, e si riaccendono con un tocco: sono gusti, e i gusti cambiano.
   ELASTIC CARTOON invece è stata TOLTA dal codice, perché il master §10 non la
   prevede — è una cosa diversa e va tenuta diversa.

   ⚠️ E «RIACCENDI» torna A QUESTI, non a tutto acceso. Un pulsante che
   riportasse ogni voce accesa rimetterebbe dentro proprio le cinque che hai
   detto di non volere più, ogni volta che ti serve annullare una prova.
   ========================================================================= */

const DEFAULT_OFF: Partial<Record<CatalogAxis, readonly string[]>> = {
  family: ['FAIRY'],
  affinity: ['SLIME'],
  appearance: ['INK', 'DESIGNER TOY 3D'],
};

/* --- Lo stato ------------------------------------------------------------- */

type Disabled = Record<CatalogAxis, Set<string>>;

const fromDefaults = (): Disabled =>
  Object.fromEntries(
    CATALOG_AXES.map((a) => [a, new Set<string>(DEFAULT_OFF[a] ?? [])]),
  ) as Disabled;

let off: Disabled = fromDefaults();

/** Le voci accese di un asse. Il motore pesca SEMPRE da qui. */
export function enabled(axis: CatalogAxis): string[] {
  return AXES[axis].all.filter((id) => !off[axis].has(id));
}

export function isEnabled(axis: CatalogAxis, id: string): boolean {
  return !off[axis].has(id);
}

/** Vero se qualcosa è stato spento: serve a marcare la traccia in DEV. */
export function isCatalogTuned(): boolean {
  return CATALOG_AXES.some((a) => off[a].size > 0);
}

/**
 * Accende o spegne una voce.
 *
 * Restituisce i problemi: se ce n'è anche uno, NON si applica niente. Spegnere
 * la penultima Family non deve lasciare il motore in uno stato in cui la
 * prossima creatura nasce per forza uguale alla precedente.
 */
export function setCatalogEnabled(axis: CatalogAxis, id: string, on: boolean): string[] {
  if (!AXES[axis].all.includes(id)) return [`${id} non è una voce di ${AXES[axis].label}`];

  const next = new Set(off[axis]);
  if (on) next.delete(id);
  else next.add(id);

  const left = AXES[axis].all.length - next.size;
  if (left < AXES[axis].min) {
    return [
      `${AXES[axis].label}: ne devono restare almeno ${AXES[axis].min} ${AXES[axis].min === 1 ? 'accesa' : 'accese'}, ne resterebbe${left === 1 ? '' : 'ro'} ${left}`,
    ];
  }

  off[axis] = next;
  return [];
}

/**
 * Torna ai predefiniti su un asse, o su tutti.
 *
 * 🔒 Ai PREDEFINITI, non a «tutto acceso»: vedi `DEFAULT_OFF`.
 */
export function resetCatalog(axis?: CatalogAxis): void {
  if (axis) off[axis] = new Set(DEFAULT_OFF[axis] ?? []);
  else off = fromDefaults();
}

/** Vero se questa voce nasce spenta. Serve a dirlo nella schermata. */
export function isOffByDefault(axis: CatalogAxis, id: string): boolean {
  return (DEFAULT_OFF[axis] ?? []).includes(id);
}

/** Quante voci sono spente, per asse. Per la riga di riepilogo in DEV. */
export function catalogSummary(): { axis: CatalogAxis; on: number; total: number }[] {
  return CATALOG_AXES.map((axis) => ({
    axis,
    on: enabled(axis).length,
    total: AXES[axis].all.length,
  }));
}

/**
 * Filtra una lista di candidati tenendo solo gli accesi.
 *
 * ⚠️ Se il filtro svuotasse la lista si restituisce quella INTERA invece di
 * niente. Non è indulgenza: è che una lista vuota qui farebbe fallire una
 * nascita, e una creatura che non nasce è un danno molto peggiore di una
 * creatura nata con una voce che avevi spento. Non può succedere finché i
 * minimi reggono — ma «non può succedere» è esattamente la premessa con cui
 * nascono i guasti che nessuno ha previsto.
 */
export function keepEnabled<T>(axis: CatalogAxis, items: readonly T[], idOf: (x: T) => string): T[] {
  const kept = items.filter((x) => isEnabled(axis, idOf(x)));
  return kept.length > 0 ? kept : [...items];
}
