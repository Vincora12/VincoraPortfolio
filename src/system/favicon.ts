/* ============================================================================
   IL SIGILLO COME ICONA (MASTER SPEC v1.15 §23.6)

   🔷 «Diventa anche il logo dell'app, che continua a cambiare.»

   L'idea è giusta e vale più di quanto sembri: un'app il cui marchio cambia
   quando cambia la creatura è un'app che dichiara di essere di qualcuno.
   Nessun prodotto può permetterselo — solo una cosa fatta per una persona
   sola.

   ════════════════════════════════════════════════════════════════════════════
   ⚠️ MA IOS METTE UN MURO, E VA DETTO PRIMA INVECE CHE SCOPERTO DOPO.

   • NELLA SCHEDA DEL BROWSER — cambia dal vivo. È quello che fa questo file:
     il sigillo diventa un'icona SVG e si aggiorna a ogni evoluzione.

   • SULLA SCHERMATA HOME — iOS legge l'icona UNA VOLTA, quando aggiungi la
     scorciatoia, e da lì in poi la tiene in cache. Non la ricontrolla mai.
     Non è una cosa che si può aggirare: nessuna app web aggiorna la propria
     icona sulla home di un iPhone già installato.

   Quindi «un logo che continua a cambiare» sulla home NON è possibile. Quello
   che è possibile è che l'icona sia il sigillo del momento in cui l'hai
   aggiunta — e per cambiarla si toglie e si rimette.

   🔷 E siccome la forma cambia ogni ventotto giorni, togliere e rimettere una
   volta al mese non è una scocciatura: è il gesto che segna l'evoluzione. Vale
   la pena dirlo quando succede, invece di lasciare l'icona vecchia lì a
   mentire.
   ════════════════════════════════════════════════════════════════════════════

   🔒 Nessuna dipendenza e nessuna richiesta di rete: l'icona è una stringa
   costruita qui e passata come `data:` URI. Un marchio che ha bisogno di un
   giro sul server è un marchio che sparisce quando la rete non c'è.
   ========================================================================= */

import { sigilGeometry, type SigilSeed } from '../engine/sigil';

/** Lato del disegno. 64 basta: è vettoriale, scala da sé. */
const BOX = 64;

/**
 * Il sigillo come documento SVG completo.
 *
 * Esporta il markup invece di un componente React perché serve in due posti
 * che React non tocca: l'attributo `href` di un `<link>`, e — un giorno — il
 * manifest. La GEOMETRIA resta condivisa con il componente (`sigilGeometry`):
 * è quella la parte che non deve poter divergere.
 */
export function sigilSvg(seed: SigilSeed, color = '%23111111'): string {
  const g = sigilGeometry(seed, BOX);
  const r = BOX / 2;
  const stroke = BOX * (0.05 + seed.weight * 0.018);

  const parts: string[] = [];

  parts.push(
    `<polygon points='${g.points}' fill='${seed.solidCore ? color : 'none'}' ` +
      `stroke='${color}' stroke-width='${stroke.toFixed(2)}' stroke-linejoin='miter'/>`,
  );

  if (g.inner !== null) {
    const innerG = sigilGeometry({ ...seed, mutation: 'PLAIN' }, g.inner * 2);
    parts.push(
      `<polygon points='${innerG.points}' ` +
        `transform='translate(${(r - g.inner).toFixed(2)} ${(r - g.inner).toFixed(2)}) ` +
        `rotate(${g.innerRotation} ${g.inner.toFixed(2)} ${g.inner.toFixed(2)})' ` +
        `fill='none' stroke='${color}' stroke-width='${(stroke * 0.7).toFixed(2)}'/>`,
    );
  }

  const rotated = `<g transform='rotate(${seed.rotation} ${r} ${r})'>${parts.join('')}</g>`;

  const ring =
    g.ring !== null
      ? `<circle cx='${r}' cy='${r}' r='${g.ring.toFixed(2)}' fill='none' ` +
        `stroke='${color}' stroke-width='${(stroke * (seed.mutation === 'ORBIT' ? 0.5 : 1)).toFixed(2)}'/>`
      : '';

  /* Il foro va per ultimo e ridisegna il fondo: su un centro pieno, bucare
     significa rimettere sopra il colore di sotto. Qui il fondo è dichiarato
     bianco perché un'icona deve avere un fondo suo — sulla scheda del browser
     non c'è nessuna schermata dietro a fornirlo. */
  const hole =
    g.hole !== null
      ? `<circle cx='${r}' cy='${r}' r='${g.hole.toFixed(2)}' fill='%23ffffff'/>`
      : '';

  return (
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${BOX} ${BOX}'>` +
    `<rect width='${BOX}' height='${BOX}' fill='%23ffffff'/>` +
    rotated +
    ring +
    hole +
    `</svg>`
  );
}

/**
 * Mette il sigillo nella scheda del browser.
 *
 * Sostituisce l'`href` del `<link rel="icon">` esistente invece di
 * aggiungerne un altro: due icone dichiarate lasciano al browser la scelta di
 * quale usare, e la scelta cambia da browser a browser.
 */
export function applySigilFavicon(seed: SigilSeed | null): void {
  if (typeof document === 'undefined') return;

  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) return;

  /* Senza creatura si lascia l'icona di partenza: il globo wireframe è
     l'identità dell'app prima che ci sia qualcuno dentro, e sostituirlo con
     un segnaposto vuoto sarebbe peggio che non toccarlo. */
  if (!seed) return;

  link.type = 'image/svg+xml';
  link.href = `data:image/svg+xml,${sigilSvg(seed)}`;
}
