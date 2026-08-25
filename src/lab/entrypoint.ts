/* ============================================================================
   DOVE SIAMO ENTRATI

   🔷 «È una nuova parte del sito, LAB, dove dentro c'è DEV e tanto altro.»

   VINZ.LAB non è un'app a parte: è lo stesso repo, la stessa build, lo stesso
   deploy. Da nessuna schermata di VINZ.MON esiste un link che ci porti.

   🔒 PERCHÉ UNA FUNZIONE E NON UN ROUTER. `netlify.toml` dice che qui non c'è
   un router generico: l'app è una pagina sola. Questa funzione non lo
   introduce — legge l'indirizzo UNA VOLTA, prima che React monti qualcosa, e
   restituisce quale delle tre cose va montata. Non ascolta, non naviga, non
   ha una history. È un interruttore all'ingresso, non un router.

   ⚠️ TRE INGRESSI, NON DUE. Il terzo — `?design-preview=…` — è quello che
   DESIGN.LAB carica dentro un iframe: monta UNA schermata vera senza `App`
   intorno. Deve stare qui e non dentro il ramo `lab`, perché la pagina che lo
   apre NON è il laboratorio: è la produzione, vista da sola.

   🔴 IL LAB SI ENTRA ANCHE DA UN INDIRIZZO VERO, `/lab`, NON SOLO DA `#/lab`.

   🔷 «Non si apre la webapp, mi porta sempre a vinz.mon» — e la prova che ha
   dato Vincenzo era chirurgica: da Safari, navigando, `#/lab` funziona
   sempre; dall'icona aggiunta alla schermata Home, no — apre VINZ.MON. La
   differenza è esattamente «leggere l'indirizzo mentre lo guardi» contro
   «un sistema operativo che ricorda un indirizzo installato», ed è lì che il
   frammento (`#/lab`) smette di essere affidabile: un frammento non viaggia
   mai al server, e non c'è garanzia che iOS lo conservi quando decide da
   dove far ripartire un'icona già installata — cosa che invece fa con lo
   `start_url` del manifest, che punta a un frammento.

   🔒 `/lab` NON RIAPRE IL DIBATTITO SUL ROUTER. Resta UNA pagina sola,
   `index.html`, servita anche per questo indirizzo — `netlify.toml` ha una
   riga di riscrittura in più, non un router lato client con history e
   `pushState`. Il frammento (`#/lab/creation` eccetera) resta la strada per
   muoversi FRA le stanze una volta dentro: qui serve solo a farti entrare in
   modo che un sistema operativo possa fidarsene.
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

  /* ⚠️ L'ancora `^…$` non è un dettaglio: senza, `/lab` matcherebbe dentro
     `/labirinto` e una pagina scritta dal .mon aprirebbe il laboratorio. */
  const pathMatch = /^\/lab(?:\/(creation|soul|design|system))?\/?$/.exec(window.location.pathname);

  if (pathMatch) {
    return { kind: 'lab', lab: (pathMatch[1] as LabId | undefined) ?? null };
  }

  /* Lo stesso controllo sul frammento, tenuto per compatibilità: un
     segnalibro `#/lab` aggiunto prima di oggi continua a funzionare, e dentro
     il lab la navigazione fra le stanze passa ancora di qui. */
  const hashMatch = /^#\/lab(?:\/(creation|soul|design|system))?\/?$/.exec(window.location.hash);

  if (hashMatch) {
    return { kind: 'lab', lab: (hashMatch[1] as LabId | undefined) ?? null };
  }

  return { kind: 'app' };
}
