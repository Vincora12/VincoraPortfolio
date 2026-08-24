/* ============================================================================
   DOVE SIAMO ENTRATI

   🔷 «È una nuova parte del sito, LAB, dove dentro c'è DEV e tanto altro.»

   VINZ.LAB non è un'app a parte: è lo stesso repo, la stessa build, lo stesso
   deploy. Cambia solo la porta da cui si entra — `/#/lab` — e da nessuna
   schermata di VINZ.MON esiste un link che ci porti.

   🔒 PERCHÉ UNA FUNZIONE E NON UN ROUTER. `netlify.toml` dice, da sempre, che
   qui non c'è un router: l'app è una pagina sola. Questa funzione non lo
   introduce — legge l'indirizzo UNA VOLTA, prima che React monti qualcosa, e
   restituisce quale delle tre cose va montata. Non ascolta, non naviga, non
   ha una history. È un interruttore all'ingresso, non un router.

   ⚠️ TRE INGRESSI, NON DUE. Il terzo — `?design-preview=…` — è quello che
   DESIGN.LAB carica dentro un iframe: monta UNA schermata vera senza `App`
   intorno. Deve stare qui e non dentro il ramo `lab`, perché la pagina che lo
   apre NON è il laboratorio: è la produzione, vista da sola.
   ========================================================================= */

import type { DesignScreenId } from './design/types';

export type LabId = 'creation' | 'soul' | 'design' | 'system';

export type Entrypoint =
  | { kind: 'app' }
  | { kind: 'lab'; lab: LabId | null }
  | { kind: 'design-preview'; screen: DesignScreenId };

/* 🔒 IL CATALOGO CHIUSO, di nuovo e per la stessa ragione di `skin.ts`: una
   stringa arbitraria dal browser non deve poter scegliere cosa montiamo.
   `?design-preview=qualsiasi-cosa` che non è in questa lista non è un errore
   da segnalare — è semplicemente l'app normale. */
const DESIGN_SCREENS: DesignScreenId[] = [
  'chat',
  'mon',
  'mind-map',
  'mind-dex',
  'me',
  'incubation',
  'encounter',
];

const isDesignScreen = (value: string | null): value is DesignScreenId =>
  value !== null && DESIGN_SCREENS.includes(value as DesignScreenId);

export function readEntrypoint(): Entrypoint {
  const params = new URLSearchParams(window.location.search);
  const preview = params.get('design-preview');

  if (isDesignScreen(preview)) {
    return { kind: 'design-preview', screen: preview };
  }

  /* ⚠️ L'ancora `^…$` non è un dettaglio: senza, `#/lab` matcherebbe dentro
     `#/p/labirinto` e una pagina scritta dal .mon aprirebbe il laboratorio. */
  const match = /^#\/lab(?:\/(creation|soul|design|system))?\/?$/.exec(window.location.hash);

  if (match) {
    return { kind: 'lab', lab: (match[1] as LabId | undefined) ?? null };
  }

  return { kind: 'app' };
}
