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
import { serverBackedStorage } from '../system/serverStorage';
import { setLocalStorageItem } from '../system/localStorageDiagnostics';

/** Gli assi su cui si può accendere e spegnere. */
export const CATALOG_AXES = ['family', 'affinity', 'role', 'fashion', 'mood', 'appearance', 'design', 'size'] as const;
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
    /* 🔶 ERA 2, con la ragione «con una sola, ogni creatura nasce della stessa
       specie e il generatore diventa un timbro». La ragione era buona e la
       difesa non serviva a niente: `TEST_PHASE` teneva ferma la Family su
       ANGEL passando SOPRA il catalogo, quindi il timbro c'era comunque —
       solo, non si vedeva e non si poteva togliere.

       🔷 «Io devo poter sbloccare o bloccare delle famiglie.» Una sola accesa
       è uno stato legittimo, e adesso è uno stato VISIBILE: si legge nella
       lista e si cambia con un tocco. */
    min: 1,
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
  /* 🔷 «Devo poter sbloccare o bloccare.» La taglia era l'unico dei tre assi
     fermi senza una lista: stava solo dentro `TEST_PHASE`, cioè in un posto
     che non si vedeva. Adesso è una lista come le altre — un meccanismo solo
     per tutto, invece di due che si somigliano. */
  size: {
    label: 'TAGLIA',
    all: ['TINY', 'MEDIUM', 'GIANT'],
    min: 1,
    it: 'quanto è grande: cambia la grammatica delle proporzioni',
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

/* ============================================================================
   🔴 IL CATALOGO NON SI SALVAVA.

   `off` viveva in memoria e basta: spegnevi una Family, ricaricavi, e tornava
   accesa. Nessun errore, nessun avviso — solo il lavoro buttato. Adesso si
   scrive.

   🔒 E IL PRIMO AVVIO PARTE DALLO STATO VERO DI ADESSO, non da «tutto acceso»:
   oggi nasce solo ANGEL, in TINY, disegnato da Ken. Prima quella scelta stava
   dentro `TEST_PHASE` e passava sopra il catalogo senza dirlo; adesso è
   scritta qui come tre voci accese e tutte le altre spente, cioè come una
   cosa che si legge e si cambia.

   ⚠️ È UN SEME, NON UN VALORE DI DEFAULT. `resetCatalog()` continua a
   riportare ai default del MOTORE — tutto acceso tranne le cinque voci che
   non piacevano — perché è quello che «rimetti a posto» deve voler dire, ed è
   quello che i controlli sulle distribuzioni verificano.
   ========================================================================= */

const CHIAVE = 'vinzmon.catalog.v1';

/** Lo stato di partenza: quello che il gioco fa DAVVERO oggi. */
const SEME: Partial<Record<CatalogAxis, readonly string[]>> = {
  family: FAMILIES.map((f) => f.id).filter((id) => id !== 'ANGEL'),
  size: ['MEDIUM', 'GIANT'],
  design: DESIGN_DNA.map((d) => d.id).filter((id) => id !== 'KEN SUGIMORI'),
};

function carica(): Disabled {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(CHIAVE);
    if (raw) {
      const salvato = JSON.parse(raw) as Record<string, string[]>;
      return Object.fromEntries(
        CATALOG_AXES.map((a) => [a, new Set<string>(salvato[a] ?? DEFAULT_OFF[a] ?? [])]),
      ) as Disabled;
    }
  } catch {
    /* Un salvataggio illeggibile non deve impedire di giocare. */
  }
  return Object.fromEntries(
    CATALOG_AXES.map((a) => [a, new Set<string>(SEME[a] ?? DEFAULT_OFF[a] ?? [])]),
  ) as Disabled;
}

let off: Disabled = carica();

function serializza(): string {
  return JSON.stringify(Object.fromEntries(CATALOG_AXES.map((a) => [a, [...off[a]]])));
}

/* 🔴 «e sfogliare CREATION non ha scritto niente» è diventato falso appena
   `salva()` ha iniziato a spingere sul server: aprire la stanza monta il .mon
   di prova (`testMon.ts`), che blocca e sblocca il perimetro voce per voce
   per generare una creatura sempre uguale — la STESSA tecnica di `genera()`
   in BUILD — e poi lo rimette esattamente com'era. Non è un tocco
   dell'utente: è un blocco che si apre e si richiude da solo nello stesso
   istante, e alla fine la chiave sul server sarebbe identica a prima. Farla
   viaggiare comunque è solo rumore — decine di scritture per un valore che
   non cambia. Questa bandiera lascia scrivere `localStorage` (serve dentro
   la stessa sessione) e taglia solo la rete, per la durata del blocco. */
let pushSospesa = false;

export function senzaSpingereSulServer<T>(fn: () => T): T {
  const prima = pushSospesa;
  pushSospesa = true;
  try {
    return fn();
  } finally {
    pushSospesa = prima;
  }
}

function salva(): void {
  const testo = serializza();
  try {
    setLocalStorageItem('engine/catalogTuning', CHIAVE, testo);
  } catch {
    /* Senza scrittura vale per questa sessione. */
  }
  if (!pushSospesa) void serverBackedStorage.setItem(CHIAVE, testo);
}

/* 🔴 «Ma se io modifico un valore dal lab, si modifica anche in VINZ.MON?»
   Stessa correzione di `designTokens.ts`: VINZ.LAB, installato come icona
   sua, non condivide più il `localStorage` di VINZ.MON. `salva()` ora spinge
   anche verso `/api/user-data`; questa la riporta indietro appena c'è un
   token — chiamata dal guscio di ciascuna app. */
export async function pullCatalogFromServer(): Promise<void> {
  const remoto = await serverBackedStorage.getItem(CHIAVE);
  if (remoto == null) return;
  try {
    const salvato = JSON.parse(remoto) as Record<string, string[]>;
    off = Object.fromEntries(
      CATALOG_AXES.map((a) => [a, new Set<string>(salvato[a] ?? DEFAULT_OFF[a] ?? [])]),
    ) as Disabled;
  } catch {
    /* valore illeggibile arrivato dal server: si tiene quello che c'era */
  }
}

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
  salva();
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
  salva();
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
