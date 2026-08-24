/* ============================================================================
   DUE ICONE SULLA STESSA SCHERMATA HOME

   🔷 «Il LAB lo aggiungo alla schermata Home dell'iPhone a parte.»

   iOS decide nome, icona e colore della barra leggendo il documento NEL
   MOMENTO in cui premi «Aggiungi a schermata Home». Sono la stessa pagina e
   lo stesso `index.html`: se non cambiamo niente, il laboratorio si installa
   chiamandosi VINZ.MON, con l'icona di VINZ.MON, e sulla schermata Home ci
   sono due bottoni identici che aprono due cose diverse.

   Quindi qui si riscrivono i quattro campi che iOS guarda, prima che React
   monti. Il manifest ha un `start_url` suo (`/#/lab`): è quello che fa
   riaprire il laboratorio invece dell'app quando premi l'icona.

   🔒 I VALORI DELL'APP NON SONO INVENTATI: sono copiati da `index.html`, che
   resta la fonte. `#111111` è il colore lì scritto — non `#000000`, che
   sarebbe stato un cambio di produzione mascherato da ripristino.
   ========================================================================= */

export function applyDocumentMeta(mode: 'app' | 'lab') {
  const lab = mode === 'lab';

  document.title = lab ? 'VINZ.LAB' : 'VINZ.MON';

  document
    .querySelector('link[rel="manifest"]')
    ?.setAttribute('href', lab ? '/lab-manifest.webmanifest' : '/manifest.webmanifest');

  document
    .querySelector('meta[name="apple-mobile-web-app-title"]')
    ?.setAttribute('content', lab ? 'VINZ.LAB' : 'VINZ.MON');

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', lab ? '#ffffff' : '#111111');
}
