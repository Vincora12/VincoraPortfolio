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

  /* ⚠️ `width`/`height` DICHIARATI, non solo il viewBox. Per la scheda del
     browser sarebbero superflui; per essere disegnato dentro una canvas —
     cioè per diventare l'icona dell'app — non lo sono: un SVG senza misura
     intrinseca in alcuni browser si disegna come un'immagine 0×0, e il
     risultato è un PNG trasparente invece di un errore. */
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${BOX}' height='${BOX}' viewBox='0 0 ${BOX} ${BOX}'>` +
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

/* ============================================================================
   L'ICONA SULLA SCHERMATA HOME (§23.6)

   🔷 «Ti sei anche dimenticato che il logo del mostro deve apparire anche
   nell'icona dell'app.»

   Vero, e per metà: la scheda del browser aveva il sigillo dal primo giorno,
   la schermata home no. `apple-touch-icon` puntava a un PNG statico — il globo
   wireframe — quindi chi aggiungeva l'app al telefono si portava a casa
   l'icona generica di sempre. Il pezzo che rendeva vera la frase «il marchio è
   la tua creatura» era proprio quello che si vede di più.

   ════════════════════════════════════════════════════════════════════════════
   ⚠️ SERVE UN PNG, NON L'SVG CHE ABBIAMO GIÀ.

   iOS non accetta SVG per `apple-touch-icon`. Quindi il sigillo va disegnato
   dentro una canvas e riesportato: è l'unico passaggio in tutto il progetto in
   cui un'immagine viene rasterizzata, ed è per questo che è isolato qui.

   ⚠️ E RESTA IL MURO GIÀ DICHIARATO SOPRA: iOS legge l'icona UNA VOLTA,
   quando aggiungi la scorciatoia. Questo codice fa sì che, in quel momento,
   l'icona sia il sigillo di ADESSO invece del globo. Un'app già sulla home non
   la cambia nessuno — per aggiornarla si toglie e si rimette, ed è un gesto
   che vale la pena fare quando cambia forma.
   ════════════════════════════════════════════════════════════════════════════

   🔒 FALLISCE IN SILENZIO. Se la canvas non c'è, se il disegno non parte, se
   il browser rifiuta: resta l'icona di prima e non succede niente. Un'icona è
   la cosa meno importante che ci sia, e non deve poter rompere un avvio.
   ========================================================================= */

/** Le misure che servono: 180 per iOS, 512 per il manifest. */
const ICON_SIZES = [180, 512] as const;

/** Disegna il sigillo dentro una canvas e restituisce un PNG come data URI. */
function rasterise(seed: SigilSeed, size: number): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          /* Il fondo bianco è già dentro l'SVG, ma si ridipinge: una canvas
             nasce trasparente, e su iOS un'icona con alpha viene composta su
             nero — il sigillo nero su nero sparirebbe. */
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, size, size);
          ctx.drawImage(img, 0, 0, size, size);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = `data:image/svg+xml,${sigilSvg(seed)}`;
    } catch {
      resolve(null);
    }
  });
}

/**
 * Mette il sigillo nell'icona che il telefono userà se aggiungi l'app.
 *
 * Aggiorna `apple-touch-icon` e sostituisce il manifest con uno costruito al
 * volo che punta agli stessi PNG: senza il secondo pezzo, su Android l'icona
 * resterebbe quella dichiarata nel file statico.
 */
export async function applySigilAppIcon(seed: SigilSeed | null): Promise<void> {
  if (typeof document === 'undefined' || !seed) return;

  const pngs = await Promise.all(ICON_SIZES.map((s) => rasterise(seed, s)));
  const [png180, png512] = pngs;
  if (!png180 || !png512) return;

  const apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (apple) apple.href = png180;

  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) return;

  try {
    const res = await fetch(link.href);
    const manifest = (await res.json()) as Record<string, unknown>;
    manifest.icons = [
      { src: png180, sizes: '180x180', type: 'image/png', purpose: 'any' },
      { src: png512, sizes: '512x512', type: 'image/png', purpose: 'any' },
    ];

    /* 🔒 L'URL vecchio si revoca prima di crearne un altro: questa funzione
       gira a ogni evoluzione, e un blob per forma lascerebbe in memoria tutti
       i manifest di tutte le creature che ci sono state. */
    if (lastManifestUrl) URL.revokeObjectURL(lastManifestUrl);
    lastManifestUrl = URL.createObjectURL(
      new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }),
    );
    link.href = lastManifestUrl;
  } catch {
    /* Il manifest statico resta valido: l'icona su iOS è già a posto, e su
       Android si perde solo l'aggiornamento. Nessun motivo di urlare. */
  }
}

let lastManifestUrl: string | null = null;
