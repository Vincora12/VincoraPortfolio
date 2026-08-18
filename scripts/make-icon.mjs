/* ============================================================================
   L'ICONA DELL'APP È IL SIGILLO (§9.2 · §23.5)

   🔷 «Ti sei dimenticato che il logo del mostro deve apparire anche
   nell'icona dell'app.» — e poi: «l'icona è ancora così».

   ⚠️ NON ERA ROTTA. Il PNG c'era, il tag c'era, Netlify lo serviva. Era
   SBAGLIATA: disegnava un globo wireframe con un cursore, cioè precisamente
   il segnaposto che iOS mette quando un'icona NON c'è. Un'icona che si
   confonde con l'assenza di un'icona ha fallito, anche se il file è a posto.

   🔒 IL SEGNO LO DISEGNA `sigilGeometry`, LO STESSO CODICE DELL'APP. Non una
   copia ridisegnata a mano: se un giorno la geometria del sigillo cambia,
   l'icona cambia con lei invece di restare indietro in silenzio.

   ⚠️ 9 PUNTE, e non è un numero a caso: `FAMILY_ARMS` arriva al massimo a 8
   (PSYCHIC, FAIRY). Nove non appartiene a nessuna Family — e non deve, perché
   questo non è il sigillo di una creatura, è quello della stirpe.

   Uso:  node scripts/make-icon.mjs
   ========================================================================= */

import { chromium } from 'playwright';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'vinz-icon-'));
const entry = join(dir, 'entry.ts');
const out = join(cwd, 'node_modules', '.vinz-icon.mjs');

writeFileSync(entry, `export { sigilGeometry } from '${cwd}/src/engine/sigil.ts';\n`);
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const { sigilGeometry } = await import(`file://${out}`);

/**
 * Il segno della stirpe.
 *
 * ⚠️ `PLAIN` e non `RING`, e la ragione è misurata, non estetica: renderizzate
 * a 40px — la dimensione a cui iOS disegna l'icona nella ricerca e nelle
 * cartelle — tutte le varianti con l'anello si chiudono, e il segno diventa un
 * punto scuro dentro un cerchio. La stella nuda regge a 180, a 60 e a 40.
 *
 * ⚠️ `solidCore: true` NON vuol dire «rarità alta» qui: questo non è un .mon,
 * e la rarità non gli si applica. Il pieno è la scelta che tiene la forma
 * leggibile quando è piccola. Se un giorno qualcuno leggesse questo come una
 * dichiarazione di rarità, starebbe leggendo una cosa che non c'è.
 */
const MARK = {
  arms: 9,
  mutation: 'PLAIN',
  rotation: 0,
  weight: 3,
  solidCore: true,
  from: ['VINZ.MON'],
};

/**
 * @param size lato in px
 * @param pad quanto il segno sta dentro il quadrato, 0–1. Su iOS gli angoli
 *   vengono arrotondati dal sistema, e `maskable` ritaglia un cerchio: un
 *   segno a filo del bordo perde le punte in tutti e due i casi.
 */
function svg(size, pad) {
  const inner = size * pad;
  const off = (size - inner) / 2;
  const g = sigilGeometry(MARK, inner);
  const r = inner / 2;
  const stroke = inner * (0.05 + MARK.weight * 0.018);

  const fill = MARK.solidCore ? '#111111' : 'none';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#ffffff"/>
  <g transform="translate(${off} ${off})" stroke="#111111" stroke-linejoin="miter">
    <polygon points="${g.points}" fill="${fill}" stroke-width="${stroke}"/>
    ${g.ring !== null ? `<circle cx="${r}" cy="${r}" r="${g.ring}" fill="none" stroke-width="${stroke}"/>` : ''}
  </g>
</svg>`;
}

/* Chromium è preinstallato: non va mai scaricato. La revisione nel nome della
   cartella cambia fra le versioni di Playwright, quindi si prova prima la
   risoluzione standard e poi il binario esplicito — stessa logica di
   `verify-screens.mjs`, e per la stessa ragione. */
const browser = await launchChromium();

async function launchChromium() {
  try {
    return await chromium.launch();
  } catch {
    const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
    const candidates = readdirSync(root)
      .filter((d) => d.startsWith('chromium'))
      .flatMap((d) => [
        join(root, d, 'chrome-linux', 'chrome'),
        join(root, d, 'chrome-linux', 'headless_shell'),
      ])
      .filter((p) => existsSync(p));
    if (candidates.length === 0) throw new Error(`Nessun Chromium trovato in ${root}`);
    return chromium.launch({ executablePath: candidates[0] });
  }
}
const page = await browser.newPage();

/** Disegna un SVG e lo salva come PNG, senza passare da nessuna rete. */
async function png(size, pad, file) {
  const markup = svg(size, pad);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;padding:0}</style>${markup}`,
    { waitUntil: 'load' },
  );
  const shot = await page.screenshot({ omitBackground: false });
  writeFileSync(file, shot);
  console.log(`  ${file}  ${size}×${size}`);
}

console.log('\nIcone dal sigillo della stirpe:\n');
/* 0.78: le punte respirano dentro l'angolo arrotondato di iOS. */
await png(180, 0.78, 'public/icon-180.png');
await png(512, 0.78, 'public/icon-512.png');
/* `maskable` può essere ritagliata a cerchio: il segno sta nell'80% centrale
   con margine, o su Android perde le punte. */
await png(512, 0.6, 'public/icon-maskable-512.png');

writeFileSync('public/icon.svg', svg(512, 0.78) + '\n');
console.log('  public/icon.svg');

/* 🔶 La favicon era un `data:` incollato a mano dentro `index.html`. L'ho
   rotta la prima volta che ho provato a modificarla di lì — viewBox e
   dimensioni si erano disallineati, e nessuno se ne sarebbe accorto guardando
   il codice. Adesso è un file, disegnato dalla stessa funzione: un posto solo
   dove il segno può essere sbagliato. */
writeFileSync('public/favicon.svg', svg(32, 0.78) + '\n');
console.log('  public/favicon.svg');

await browser.close();
console.log('\n✓ Fatte.\n');
