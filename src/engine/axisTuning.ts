/* ============================================================================
   I PESI DEGLI ASSI — «fai in modo che escano di più»

   🔷 «Mi piacerebbe poter controllare com'è il valore degli occhiali. Da sole,
      da vista, quali sono gli occhiali nel mio DNA, e quindi poterti dire
      "senti, fai in modo che escano di più quelli da vista". E quindi poi lo
      provo.»

   ⚠️ QUESTO NON SI POTEVA FARE, E NON PER POCO. `catalogTuning` accende e
   spegne, e basta: Family, affinità, ruolo, stile, umore, resa, designer. Gli
   occhiali non ci sono proprio — le sedici categorie si estraggono a caso con
   un `pick` uniforme, e non c'è nessun posto da cui toccarle. «Spento» e
   «acceso» non sono nemmeno la risposta giusta: lui non vuole togliere quelli
   da sole, vuole che quelli da vista escano PIÙ SPESSO.

   🔒 LA PROPRIETÀ CHE RENDE QUESTO SICURO: a pesi tutti uguali il risultato è
   IDENTICO a prima, bit per bit. `pick` fa `floor(rng() * n)`; `pickWeighted`
   con pesi tutti a 1 consuma UN solo `rng()` e cade sullo stesso indice.
   Quindi accendere questo meccanismo non cambia niente finché non sposti
   davvero un peso — e le distribuzioni verificate da `verify:batch` restano
   quelle. Se un giorno quel controllo diventa rosso senza che nessuno abbia
   toccato un peso, è questo file ad aver sbagliato.

   🔒 E SI VEDE DOVE SI USA. Un peso applicato di nascosto dentro il motore
   sarebbe una taratura invisibile: `tuned()` marca l'asse come toccato, e
   CREATION.LAB lo mostra accanto al passo.
   ========================================================================= */

import { pickWeighted, type Rng } from './rng';
import { serverBackedStorage } from '../system/serverStorage';
import { setLocalStorageItem } from '../system/localStorageDiagnostics';

/** Gli assi che si possono pesare, oltre a quelli già in `catalogTuning`. */
export const WEIGHTED_AXES = ['eyewear', 'hairState', 'haircut'] as const;
export type WeightedAxis = (typeof WEIGHTED_AXES)[number];

/**
 * Quanto può salire un peso.
 *
 * 🔒 Cinque e non «quanto vuoi»: con un peso a 100 su una voce sola l'asse
 * smette di variare, e una creatura che ha SEMPRE gli stessi occhiali non è
 * una preferenza — è un timbro. Cinque volte più probabile si vede benissimo
 * e lascia vive le altre.
 */
export const PESO_MAX = 5;
export const PESO_DEFAULT = 1;

type Pesi = Partial<Record<WeightedAxis, Record<string, number>>>;

/* v2 riparte intenzionalmente da pesi uguali. Nella prima versione poteva
   essere rimasto salvato un peso alto su SHIELD: il motore corretto sarebbe
   risultato ancora sbilanciato per colpa di una preferenza storica invisibile. */
const CHIAVE = 'vinzmon.axisWeights.v2';

function leggi(): Pesi {
  try {
    const raw = localStorage.getItem(CHIAVE);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' ? (v as Pesi) : {};
  } catch {
    return {};
  }
}

let pesi: Pesi = typeof localStorage === 'undefined' ? {} : leggi();

function salva(): void {
  const testo = JSON.stringify(pesi);
  try {
    setLocalStorageItem('engine/axisTuning', CHIAVE, testo);
  } catch {
    /* Se il browser non scrive, i pesi valgono per questa sessione. */
  }
  void serverBackedStorage.setItem(CHIAVE, testo);
}

/* 🔴 «Ma se io modifico un valore dal lab, si modifica anche in VINZ.MON?»
   Stessa correzione di `designTokens.ts` e `catalogTuning.ts`: VINZ.LAB,
   installato come icona sua, non condivide più il `localStorage` di
   VINZ.MON. `salva()` ora spinge anche verso `/api/user-data`; questa la
   riporta indietro appena c'è un token. */
export async function pullWeightsFromServer(): Promise<void> {
  const remoto = await serverBackedStorage.getItem(CHIAVE);
  if (remoto == null) return;
  try {
    const v: unknown = JSON.parse(remoto);
    if (v && typeof v === 'object') pesi = v as Pesi;
  } catch {
    /* valore illeggibile arrivato dal server: si tiene quello che c'era */
  }
}

/** Il peso di una voce. 1 = come le altre, 0 = non esce mai. */
export function weightOf(axis: WeightedAxis, id: string): number {
  return pesi[axis]?.[id] ?? PESO_DEFAULT;
}

export function setWeight(axis: WeightedAxis, id: string, w: number): void {
  const v = Math.max(0, Math.min(PESO_MAX, Number.isFinite(w) ? w : PESO_DEFAULT));
  const asse = { ...(pesi[axis] ?? {}) };
  if (v === PESO_DEFAULT) delete asse[id];
  else asse[id] = v;
  pesi = { ...pesi, [axis]: asse };
  salva();
}

/** Vero se qualcuno ha spostato almeno un peso su questo asse. */
export function tuned(axis: WeightedAxis): boolean {
  return Object.keys(pesi[axis] ?? {}).length > 0;
}

export function anyTuned(): boolean {
  return WEIGHTED_AXES.some(tuned);
}

export function resetAxis(axis: WeightedAxis): void {
  pesi = { ...pesi, [axis]: {} };
  salva();
}

export function resetAllWeights(): void {
  pesi = {};
  salva();
}

/** Fotografia dei pesi toccati: serve a mostrarli e a rimetterli com'erano. */
export function snapshotWeights(): Pesi {
  return JSON.parse(JSON.stringify(pesi)) as Pesi;
}

export function restoreWeights(s: Pesi): void {
  pesi = JSON.parse(JSON.stringify(s)) as Pesi;
  salva();
}

/* ============================================================================
   L'ESTRAZIONE

   ⚠️ SE NESSUN PESO È STATO TOCCATO SI USA LA STRADA DI PRIMA. Non è
   ottimizzazione: è la garanzia che il comportamento predefinito resti quello
   verificato, senza passare da un ramo nuovo che nessuno ha ancora provato.

   ⚠️ E SE QUALCUNO PORTA TUTTO A ZERO, si torna a pesi uguali invece di
   sollevare un errore. Un asse con tutti i pesi a zero è una richiesta
   impossibile («non voglio nessun tipo di occhiali»), e a una richiesta
   impossibile una schermata di generazione non deve rispondere rompendosi:
   il posto dove dirlo è la UI, prima.
   ========================================================================= */
export function tunedPick<T>(
  rng: Rng,
  axis: WeightedAxis,
  list: readonly T[],
  idOf: (item: T) => string,
): T {
  if (list.length === 0) throw new Error(`tunedPick() su lista vuota: ${axis}`);

  if (!tuned(axis)) {
    return list[Math.floor(rng() * list.length)]!;
  }

  const entries = list.map((item) => ({ item, weight: weightOf(axis, idOf(item)) }));
  const totale = entries.reduce((s, e) => s + e.weight, 0);
  if (totale <= 0) return list[Math.floor(rng() * list.length)]!;

  return pickWeighted(rng, entries);
}
