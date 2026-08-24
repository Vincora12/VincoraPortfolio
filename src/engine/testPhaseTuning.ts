/* ============================================================================
   LA FASE DI PROVA, ACCESA O SPENTA DA TE

   🔷 «In questo momento la generazione fa solo ANGEL e i vari affinity. Devo
      vedere una sezione dove questa cosa è selezionata — nel flow — e devo
      poterla disabilitare e abilitare altre cose.»

   🔴 E AVEVA RAGIONE SU TUTTO, ANCHE SU DOVE STAVA IL PROBLEMA. La causa non
   era il vincolo degli archetipi che si vede in `store.ts`: quello lascia
   libera la Family. Era `TEST_PHASE` in `generation-config.ts` —
   `enabled: true`, `family: 'ANGEL'`, `size: 'TINY'`,
   `characterDesigner: 'KEN SUGIMORI'` — tre assi fermi, scritti nel codice.

   Misurato prima di toccare niente: 400 generazioni, **100% ANGEL**. E
   nessuna schermata lo diceva. Una cosa che decide la specie di ogni creatura
   che nasce, e che si poteva scoprire solo leggendo un file.

   ⚠️ LA FASE NON È SBAGLIATA. È un'ancora chiesta apposta: «se ogni creatura
   cambia anche specie, taglia e disegnatore, non si capisce mai se la
   differenza fra due forme viene dal generatore o dal fatto che sono due cose
   diverse». Quello che era sbagliato è che fosse INVISIBILE e IMMOBILE.

   🔒 IL PREDEFINITO NON CAMBIA. Senza override la fase resta esattamente
   quella di prima: questo file aggiunge un interruttore, non una decisione
   diversa.
   ========================================================================= */

import type { TestPhase } from './generation-config';

const CHIAVE = 'vinzmon.testPhase.v1';

type Override = Partial<TestPhase>;

function leggi(): Override {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(CHIAVE);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' ? (v as Override) : {};
  } catch {
    return {};
  }
}

let override: Override = leggi();

function salva(): void {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(override));
  } catch {
    /* Senza scrittura vale per questa sessione. */
  }
}

/** Quello che hai cambiato tu, o niente. */
export function testPhaseOverride(): Override {
  return { ...override };
}

export function isTestPhaseTuned(): boolean {
  return Object.keys(override).length > 0;
}

export function setTestPhase(patch: Override): void {
  override = { ...override, ...patch };
  salva();
}

export function resetTestPhase(): void {
  override = {};
  salva();
}

/**
 * La fase che vale davvero.
 *
 * 🔒 UNA SOLA FUNZIONE, LETTA DA TUTTI. `locked()` la usa per il generatore e
 * `taste.ts` per il prompt del resolver: se una delle due leggesse ancora la
 * costante, il prompt continuerebbe a dire «FAMILY = ANGEL» mentre il motore
 * ne pesca un'altra — e la creatura nascerebbe DRAGON con addosso le
 * istruzioni per un angelo. È il tipo di scollamento che non dà errori: dà
 * risultati sbagliati con l'aria di essere giusti.
 */
export function effectiveTestPhase(base: TestPhase): TestPhase {
  return { ...base, ...override };
}
