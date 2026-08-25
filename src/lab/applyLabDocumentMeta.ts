/* ============================================================================
   DUE ICONE SULLA STESSA SCHERMATA HOME

   🔷 «Il LAB lo aggiungo alla schermata Home dell'iPhone a parte.»

   iOS decide nome, icona e colore della barra leggendo il documento NEL
   MOMENTO in cui premi «Aggiungi a schermata Home». Sono la stessa pagina e
   lo stesso `index.html`: se non cambiamo niente, il laboratorio si installa
   chiamandosi VINZ.MON, con l'icona di VINZ.MON, e sulla schermata Home ci
   sono due bottoni identici che aprono due cose diverse.

   Quindi qui si riscrivono i sei campi che iOS guarda, prima che React
   monti. Il manifest ha un `start_url` suo (`/#/lab`): è quello che fa
   riaprire il laboratorio invece dell'app quando premi l'icona.

   🔒 I VALORI DELL'APP NON SONO INVENTATI: sono copiati da `index.html`, che
   resta la fonte. `#111111` è il colore lì scritto — non `#000000`, che
   sarebbe stato un cambio di produzione mascherato da ripristino.

   🔷 «Nel file originale di ChatGPT c'è una icona per la webapp solo legata
      al lab.» `VINZ_LAB_FULL_INTEGRATION.md` §5 lo prevedeva ma lo rimandava
      («A distinct Lab icon can be added later»), e il rimando non era mai
      stato chiuso: `lab-manifest.webmanifest` puntava agli STESSI PNG di
      VINZ.MON, e questo file non toccava `apple-touch-icon` — che è il tag
      che iOS legge quando premi «Aggiungi a schermata Home», prima ancora
      del manifest. Le due scorciatoie erano identiche, anche se aprivano
      cose diverse.

   🔷 «Già che ci sei, l'icona di VINZ.LAB» — con allegato uno schema
   tecnico: la faccia con le guide di costruzione, cerchi tratteggiati,
   diagonali. 🔷 «Quelle linee erano volute, per dare l'idea di lab —
   dovevi renderle più visibili.» `lab-icon-180.png`/`lab-icon-512.png`
   adesso sono quel disegno con le guide amplificate, non tolte — non più
   una copia invertita dell'icona di VINZ.MON. La fonte sta in
   `docs/lab/reference/lab-icon-construction.png`, il master con le guide
   già amplificate in `docs/lab/reference/lab-icon-master.png`, e
   `scripts/make-lab-icon.mjs` li ridimensiona alle due taglie che servono
   qui. Vedi quel file per il perché il master è preparato a mano una volta
   sola, e non ogni volta.
   ========================================================================= */

export function applyDocumentMeta(mode: 'app' | 'lab') {
  const lab = mode === 'lab';

  document.title = lab ? 'VINZ.LAB' : 'VINZ.MON';

  document
    .querySelector('link[rel="manifest"]')
    ?.setAttribute('href', lab ? '/lab-manifest.webmanifest' : '/manifest.webmanifest');

  document
    .querySelector('link[rel="apple-touch-icon"]')
    ?.setAttribute('href', lab ? '/lab-icon-180.png?v=2' : '/icon-180.png?v=2');

  document
    .querySelector('link[rel="icon"]')
    ?.setAttribute('href', lab ? '/lab-icon-512.png?v=2' : '/icon-512.png?v=2');

  document
    .querySelector('meta[name="apple-mobile-web-app-title"]')
    ?.setAttribute('content', lab ? 'VINZ.LAB' : 'VINZ.MON');

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', lab ? '#ffffff' : '#111111');
}
