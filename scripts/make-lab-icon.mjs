/* ============================================================================
   L'ICONA DEL LAB — IL DISEGNO VERO DI VINCENZO, NON PIÙ UN'INVERSIONE

   🔷 «Già che ci sei, l'icona di VINZ.LAB» — allegato uno schema tecnico:
      la faccia disegnata con le guide di costruzione, cerchi tratteggiati,
      diagonali, crocini di centro — lo stesso disegno che sta in
      `docs/lab/reference/lab-icon-construction.png`.

   🔴 PRIMA VERSIONE SBAGLIATA: avevo TOLTO le guide di costruzione,
      pensando fossero solo un aiuto al disegno. 🔷 «Quelle linee di
      costruzione erano volute per dare l'idea di lab — dovevi anzi
      renderle più visibili.» Erano lo stile, non uno scarto.

   🔒 IL MASTER TIENE LE GUIDE, AMPLIFICATE. Nello schema originale sono
      quasi invisibili — un grigio a 3–15 livelli da bianco puro, pensato
      per leggersi su un foglio grande, non su un'icona piccola.
      `docs/lab/reference/lab-icon-master.png` (2048×2048) è lo stesso
      schema con OGNI tratto non bianco spinto più scuro (la differenza dal
      bianco moltiplicata, non un valore fisso aggiunto — così il segno
      pieno resta nero pieno e le guide sottili diventano grigio scuro
      leggibile, non nero): il disegno tecnico si vede, invece di sparire
      al primo ridimensionamento.

   🔶 SUPERA `scripts/invert-lab-icon.mjs` (rimosso). Prima l'icona del lab
      era una scorciatoia: gli stessi colori dell'icona di VINZ.MON,
      invertiti. Adesso è il disegno suo, con lo stile suo — non deriva più
      dall'icona dell'app.

   🔒 IL MASTER È GIÀ PREPARATO A MANO. Come `docs/lab/reference/soul-
      master-sketch.png`, che SOUL legge come riferimento e non ricalcola:
      lo schema di partenza è un disegno fisso di Vincenzo, non qualcosa
      che si rigenera da una formula ogni volta (come `sigilGeometry` per
      l'icona di VINZ.MON).

   Questo script fa solo l'ultimo passo, quello davvero meccanico e
   riproducibile: ridimensiona il master alle due taglie che servono.

   ⚠️ SE IL DISEGNO CAMBIA, il master va rifatto a mano (stessa
   amplificazione delle guide) e salvato di nuovo qui sopra — questo
   script ridimensiona soltanto, non sa cosa amplificare da solo.

   Uso:  node scripts/make-lab-icon.mjs
   ========================================================================= */

import { chromium } from 'playwright';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

async function launchChromium() {
  try {
    return await chromium.launch();
  } catch {
    const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
    const candidates = readdirSync(root)
      .filter((d) => d.startsWith('chromium'))
      .flatMap((d) => [
        `${root}/${d}/chrome-linux/chrome`,
        `${root}/${d}/chrome-linux/headless_shell`,
      ])
      .filter((p) => existsSync(p));
    if (candidates.length === 0) throw new Error(`Nessun Chromium trovato in ${root}`);
    return chromium.launch({ executablePath: candidates[0] });
  }
}

const browser = await launchChromium();
const page = await browser.newPage();

const masterB64 = readFileSync('docs/lab/reference/lab-icon-master.png').toString('base64');

async function ridimensiona(size, destinazione) {
  await page.setContent(`<img id="src" src="data:image/png;base64,${masterB64}" />`);
  const b64 = await page.evaluate(async (target) => {
    const img = document.getElementById('src');
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = target;
    canvas.height = target;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, target, target);
    return canvas.toDataURL('image/png').split(',')[1];
  }, size);
  writeFileSync(destinazione, Buffer.from(b64, 'base64'));
  console.log(`  ${destinazione}  ${size}×${size}`);
}

console.log('\nIcona del lab, dal master pulito:\n');
await ridimensiona(180, 'public/lab-icon-180.png');
await ridimensiona(512, 'public/lab-icon-512.png');

await browser.close();
console.log('\n✓ Fatte.\n');
