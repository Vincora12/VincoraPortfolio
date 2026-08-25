/* ============================================================================
   L'ICONA DEL LAB — LO STESSO SEGNO DI VINZ.MON, COLORI INVERTITI

   🔷 «Nel file originale di ChatGPT c'è una icona per la webapp solo legata
      al lab.» `docs/lab/VINZ_LAB_FULL_INTEGRATION.md` §5 lo prevedeva («A
      separate VINZ.LAB icon on iPhone Home Screen») ma lo rimandava
      esplicitamente («A distinct Lab icon can be added later»). Il rimando
      non era mai stato chiuso: la scorciatoia del lab sulla schermata Home
      aveva la STESSA icona di VINZ.MON.

   ⚠️ NON USA `scripts/make-icon.mjs`. Quello script disegna un vecchio
   sigillo a stella (`sigilGeometry`, 9 punte) che non è più l'icona vera:
   `public/icon-180.png` e `public/icon-512.png` sono stati sostituiti a
   mano (commit `fbefb4b`, «Correggi menu e aggiungi piano allenamento») con
   la faccia che è davvero in produzione oggi. `make-icon.mjs` è rimasto
   indietro — non l'ho toccato, perché sistemarlo non era quello che mi è
   stato chiesto, e avrebbe voluto dire decidere IO come deve essere
   l'icona principale.

   🔒 QUESTO SCRIPT PARTE DAI PNG VERI, quelli che sono davvero serviti da
   Netlify, e INVERTE i colori — bianco/nero scambiati, stesso disegno. Non
   inventa un segno nuovo: la differenza fra le due icone sulla schermata
   Home è la più piccola che si vede a colpo d'occhio senza disegnare
   qualcosa che Vincenzo non ha fatto.

   Uso:  node scripts/invert-lab-icon.mjs
   ========================================================================= */

import { chromium } from 'playwright';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

/* Stessa logica di risoluzione di Chromium usata in `make-icon.mjs` e
   `verify-screens.mjs`: preinstallato, mai scaricato. */
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

/** Inverte i colori di un PNG (RGB → 255-RGB, canale alpha intatto) via <canvas>. */
async function inverti(sorgente, destinazione) {
  const b64 = readFileSync(sorgente).toString('base64');
  await page.setContent(`<img id="src" src="data:image/png;base64,${b64}" />`);
  const invertitoB64 = await page.evaluate(async () => {
    const img = document.getElementById('src');
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < frame.data.length; i += 4) {
      frame.data[i] = 255 - frame.data[i];
      frame.data[i + 1] = 255 - frame.data[i + 1];
      frame.data[i + 2] = 255 - frame.data[i + 2];
    }
    ctx.putImageData(frame, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  writeFileSync(destinazione, Buffer.from(invertitoB64, 'base64'));
  console.log(`  ${destinazione}`);
}

console.log('\nIcona del lab, stesso segno di VINZ.MON, colori invertiti:\n');
await inverti('public/icon-180.png', 'public/lab-icon-180.png');
await inverti('public/icon-512.png', 'public/lab-icon-512.png');

await browser.close();
console.log('\n✓ Fatte.\n');
