/* ============================================================================
   LO STILE DEL LAB, IN DUE CONTESTI

   🔷 CREATION LAB FIX + UI CLEANUP §14-19 — «pull down, e sotto c'è LAB, nativo,
   non un iframe.» VINZ.LAB è da sempre un DOCUMENTO A PARTE (`lab/index.html`):
   i suoi CSS dichiarano `:root{--ink:...}` e `html,body{margin:0;...}` perché
   possiedono l'INTERA pagina. Montare gli stessi componenti DENTRO il
   documento di VINZ.MON, come cassetto sotto l'app, senza cambiarli, vorrebbe
   dire iniettare quelle stesse regole nell'HEAD del documento vero — e
   `:root`/`body`/`html` sono selettori globali: sovrascriverebbero i colori
   dell'app vera anche mentre il cassetto è chiuso.

   🔒 LA CURA: ogni file che oggi fa `import './skin/x.css'` (effetto
   collaterale globale, sempre) lo sostituisce con `import css from
   './skin/x.css?inline'` (solo testo, nessun effetto) + `<LabStyle css={css}
   />` qui sotto. Da sola, iniettata nel documento standalone di `/lab`,
   `<LabStyle>` scrive il CSS TALE E QUALE — stesso effetto di prima, perché
   lì il documento è comunque tutto suo. Dentro il cassetto invece la stessa
   chiamata vive in un componente portato in uno SHADOW ROOT: lì `:root` non
   corrisponde a niente (non è il documento), quindi va riscritto `:host` —
   l'unico modo per uno shadow root di dire "queste variabili valgono per
   tutto quello che c'è qui dentro" senza uscire fuori.

   Tre sostituzioni, sempre le stesse tre righe nei sei fogli di stile del
   lab (verificate a mano, non un editor globale con \bbody\b — quello
   avrebbe preso anche `.drawer-body` in system.css e rotto la regola):
     `:root{…}` / `:root {…}` → `:host{…}`
     `html,body{…}` → `:host{…}`
     `body{padding:env(safe-area-inset-top)…}` → `:host{padding:…}`
   ========================================================================= */

import { createContext, useContext, useMemo } from 'react';

/** `true` = questi componenti vivono in uno shadow root (il cassetto sotto l'app). */
export const LabScopeContext = createContext(false);

function scopeToHost(css: string): string {
  return css
    .replace(/:root\s*\{/, ':host{')
    .replace('html,body{', ':host{')
    .replace('body{padding:env(safe-area-inset-top)', ':host{padding:env(safe-area-inset-top)');
}

/**
 * Un foglio di stile del lab, scritto una volta e adattato al contesto.
 * Nel documento standalone di `/lab` il testo passa invariato. Dentro il
 * cassetto (shadow root) `:root`/`html`/`body` diventano `:host`.
 */
export function LabStyle({ css }: { css: string }) {
  const scoped = useContext(LabScopeContext);
  const text = useMemo(() => (scoped ? scopeToHost(css) : css), [scoped, css]);
  return <style>{text}</style>;
}
