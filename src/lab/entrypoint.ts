/* ============================================================================
   DOVE SIAMO ENTRATI

   🔷 «È una nuova parte del sito, LAB, dove dentro c'è DEV e tanto altro.»

   VINZ.LAB non è un'app a parte: è lo stesso repo, la stessa build, lo stesso
   deploy. Da nessuna schermata di VINZ.MON esiste un link che ci porti.

   🔒 PERCHÉ UNA FUNZIONE E NON UN ROUTER. `netlify.toml` dice che qui non c'è
   un router generico: l'app è una pagina sola. Questa funzione non lo
   introduce — legge l'indirizzo UNA VOLTA, prima che React monti qualcosa, e
   restituisce quale delle due cose va montata. Non ascolta, non naviga, non
   ha una history. È un interruttore all'ingresso, non un router.

   🔷 LAB INFORMATION ARCHITECTURE CLEANUP — il terzo ingresso, il preview
   `?design-preview=…` che DESIGN.LAB caricava dentro un iframe, è sparito
   insieme a quella stanza: verificato che nessun'altra pagina lo usava.

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

   🔴 E NON BASTAVA L'INDIRIZZO: SERVIVA UN DOCUMENTO. Il primo tentativo
   dava al lab l'indirizzo `/lab` ma gli serviva ancora `index.html`, quello
   dell'app, contando su `applyLabDocumentMeta.ts` per correggere i tag dopo.
   🔷 «Niente, stesso errore.» Aveva ragione: `<script type="module">` è
   DIFFERITO, quindi quando Safari legge `<head>` il JavaScript non è ancora
   partito — vede il manifest di VINZ.MON, e installa quello. Adesso `/lab/`
   ha `lab/index.html`, un documento suo, coi tag già scritti dentro.

   🔒 NON RIAPRE IL DIBATTITO SUL ROUTER. Due documenti d'ingresso, come già
   `brain/index.html`; nessuna history, nessun `pushState`. Il frammento
   (`#/lab/creation`) resta la strada per muoversi FRA le stanze una volta
   dentro: il percorso serve solo a farti entrare in modo che un sistema
   operativo possa fidarsene.
   ========================================================================= */

export type LabId = 'creation' | 'system';

export type Entrypoint =
  | { kind: 'app' }
  | { kind: 'lab'; lab: LabId | null };

export function readEntrypoint(): Entrypoint {
  /* ⚠️ L'ancora `^…$` non è un dettaglio: senza, `/lab` matcherebbe dentro
     `/labirinto` e una pagina scritta dal .mon aprirebbe il laboratorio. */
  const pathMatch = /^\/lab(?:\/(creation|system))?\/?$/.exec(window.location.pathname);

  if (pathMatch) {
    return { kind: 'lab', lab: (pathMatch[1] as LabId | undefined) ?? null };
  }

  /* Lo stesso controllo sul frammento, tenuto per compatibilità: un
     segnalibro `#/lab` aggiunto prima di oggi continua a funzionare, e dentro
     il lab la navigazione fra le stanze passa ancora di qui. */
  const hashMatch = /^#\/lab(?:\/(creation|system))?\/?$/.exec(window.location.hash);

  if (hashMatch) {
    return { kind: 'lab', lab: (hashMatch[1] as LabId | undefined) ?? null };
  }

  return { kind: 'app' };
}
