/* ============================================================================
   IL .MON DI PROVA — la creatura noiosa che non cambia mai

   🔷 «Usa il mio mon di prova, che dovresti avere fra le informazioni che ti
      ha lasciato ChatGPT, dove modifica solo la parte degli occhiali. In
      questo modo posso vedere come nell'A/B test questi occhiali escono.»

   🔒 FONTE: `docs/lab/TEST_MON_SPEC.md`. Una creatura deliberatamente noiosa e
   stabile, che serve a una cosa sola: **cambiare UN valore e tenere fermo
   tutto il resto**. Se A e B vengono diversi, la differenza è di quel valore
   e non di altro.

   ⚠️ REGOLA DURA DELLA SPECIFICA: «use existing canonical values only». Niente
   Family nuove, niente tassonomie inventate, niente «occhiali da sole» e
   «occhiali da vista» come categorie nuove — quelle NON esistono nel motore,
   che ha sedici categorie di ottica con altri nomi. Se un valore del listino
   qui sotto sparisce dal repo, questa funzione deve ROMPERSI A VOCE ALTA e
   chiedere di aggiornare il fixture: sostituirne un altro in silenzio
   vorrebbe dire fare A/B su una creatura diversa senza saperlo.

   🔒 E i campi generati NON si scrivono a mano. La specifica lo vieta: si
   costruisce la base con i valori canonici, si usa un seme stabile, e tutto
   il resto — nome, DNA, palette, voce, sigillo, bio — lo produce il motore
   vero. Poi si congela.
   ========================================================================= */

import { seedFromString } from '../../engine/rng';
import type { MonRecord } from '../../engine/types';

/** Il seme stabile della specifica. Non cambiarlo: cambierebbe la creatura. */
export const TEST_MON_SEED = seedFromString('VINZLAB_TEST_MON_V1');

/** La base canonica, parola per parola da `TEST_MON_SPEC.md`. */
export const TEST_MON_BASE = {
  family: 'ANGEL',
  archetype: 'PUTTO',
  affinity: 'ANGEL',
  size: 'TINY',
  role: 'SCOUT',
  fashion: 'STREET',
  appearance: 'CEL',
  design: 'KEN SUGIMORI',
} as const;

let congelato: MonRecord | null = null;

/**
 * Costruisce (una volta sola) il .mon di prova.
 *
 * ⚠️ COME SI OTTENGONO I VALORI CANONICI: non si scrivono sopra al risultato.
 * Si restringe il catalogo a quelle voci per il tempo della generazione — è
 * lo stesso meccanismo con cui si blocca il perimetro dappertutto — e poi si
 * rimette com'era. Scriverli sopra a mano darebbe una creatura il cui DNA,
 * palette e voce sono stati calcolati per un'ALTRA creatura: coerente in
 * superficie, incoerente sotto.
 */
export async function testMon(): Promise<MonRecord> {
  if (congelato) return congelato;

  const { AXES, CATALOG_AXES, isEnabled, resetCatalog, setCatalogEnabled, senzaSpingereSulServer } =
    await import('../../engine/catalogTuning');
  const { generateFirstMon } = await import('../../engine/characterGenerator');
  const { generatorInput } = await import('../../state/store');
  const { useApp } = await import('../../state/store');

  const spenti = CATALOG_AXES.flatMap((a) =>
    AXES[a].all.filter((id) => !isEnabled(a, id)).map((id) => [a, id] as const),
  );

  /* 🔒 CONTROLLO PRIMA DI GENERARE. La specifica dice: «if any catalog value
     is renamed or removed, the implementation must fail visibly». Meglio un
     errore chiaro adesso che un A/B fatto su una creatura che non è quella. */
  const manca: string[] = [];
  const esiste = (asse: 'family' | 'affinity' | 'role' | 'fashion' | 'appearance' | 'design' | 'size', v: string) => {
    if (!AXES[asse].all.includes(v)) manca.push(`${asse}: ${v}`);
  };
  esiste('family', TEST_MON_BASE.family);
  esiste('affinity', TEST_MON_BASE.affinity);
  esiste('role', TEST_MON_BASE.role);
  esiste('fashion', TEST_MON_BASE.fashion);
  esiste('appearance', TEST_MON_BASE.appearance);
  esiste('design', TEST_MON_BASE.design);
  esiste('size', TEST_MON_BASE.size);
  if (manca.length > 0) {
    throw new Error(
      `Il .mon di prova non si può costruire: questi valori non esistono più nel catalogo — ${manca.join(', ')}. Aggiorna docs/lab/TEST_MON_SPEC.md e questo file.`,
    );
  }

  try {
    const tieni = (asse: 'family' | 'affinity' | 'role' | 'fashion' | 'appearance' | 'design' | 'size', v: string) => {
      for (const id of AXES[asse].all) if (id !== v) setCatalogEnabled(asse, id, false);
      setCatalogEnabled(asse, v, true);
    };
    senzaSpingereSulServer(() => {
      tieni('family', TEST_MON_BASE.family);
      tieni('affinity', TEST_MON_BASE.affinity);
      tieni('role', TEST_MON_BASE.role);
      tieni('fashion', TEST_MON_BASE.fashion);
      tieni('appearance', TEST_MON_BASE.appearance);
      tieni('design', TEST_MON_BASE.design);
      tieni('size', TEST_MON_BASE.size);
    });

    const r = generateFirstMon({
      input: generatorInput(useApp.getState()),
      mindlineNodeId: 'vinzlab-test-mon',
      originNodeId: null,
      lineageNames: [],
      seed: TEST_MON_SEED,
      devUnlockAll: false,
      hiddenEvent: false,
      allowedArchetypes: [TEST_MON_BASE.archetype],
    });

    congelato = r.record;
    return congelato;
  } finally {
    senzaSpingereSulServer(() => {
      resetCatalog();
      for (const [a, id] of spenti) setCatalogEnabled(a, id, false);
    });
  }
}

/* ============================================================================
   LA VARIANTE — cambia UNA cosa e basta

   🔒 «Only the target being tested may change.» Questa funzione tocca UN campo
   e clona tutto il resto: se domani qualcuno la usasse per cambiarne due,
   l'A/B smetterebbe di dire da dove viene la differenza — e continuerebbe ad
   avere l'aria di funzionare.
   ========================================================================= */

export type BersaglioAB = 'eyewear' | 'hair_state' | 'haircut';

export function variante(base: MonRecord, bersaglio: BersaglioAB, valore: string): MonRecord {
  const copia: MonRecord = JSON.parse(JSON.stringify(base)) as MonRecord;

  if (bersaglio === 'eyewear') {
    copia.data.eyewear = copia.data.eyewear
      ? { ...copia.data.eyewear, category: valore }
      : { category: valore, description: '' };
  } else {
    copia.data[bersaglio] = valore;
  }

  /* Il nome cambia solo per non confondere due file di immagini: la creatura
     è la stessa, e il nome non entra nel disegno. */
  copia.data = { ...copia.data, name: `${base.data.name}` };
  return copia;
}

/** Il valore che quel bersaglio ha adesso sul .mon di prova. */
export function valoreAttuale(base: MonRecord, bersaglio: BersaglioAB): string | null {
  if (bersaglio === 'eyewear') return base.data.eyewear?.category ?? null;
  return base.data[bersaglio];
}
