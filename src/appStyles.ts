/* ============================================================================
   IL FOGLIO DI STILE DELL'APP, in un modulo a parte

   🔒 SERVE A NON CARICARLO DENTRO VINZ.LAB. Il laboratorio ha un disegno suo
   — `docs/lab/design/*.html` — con font, colori e misure suoi: Arial invece
   di Archivo, `#111` su bianco invece dei token del prodotto. Se `main.tsx`
   importasse questi fogli in cima, verrebbero caricati anche là dentro e si
   vedrebbe una terza cosa che non è né l'app né il disegno.

   ⚠️ Un `import './x.css'` in cima a `main.tsx` si esegue SEMPRE, qualunque
   ramo prenda poi il codice: gli import statici non hanno rami. È per questo
   che stanno qui e si caricano con `await import()`, solo sulla strada
   dell'app e della preview.
   ========================================================================= */

// Font self-hosted: nessuna richiesta esterna (§10.3).
// Archivo Variable con asse di larghezza + corsivo sta al posto di VINZ-HEAD.
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/archivo/wdth-italic.css';
import '@fontsource-variable/inter';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';

import './styles/tokens.css';
import './styles/base.css';
import './system/system.css';
import './system/assets.css';
import './screens/screens.css';
import './dev/dev.css';
