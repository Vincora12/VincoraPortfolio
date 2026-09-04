/* Verifica offline del rilevatore "ricordati che..." (MEMORY CLEANUP, goal B). Nessuna API key o rete. */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'vinz-memory-cleanup-'));
const entry = join(dir, 'entry.ts');
const out = join(cwd, 'node_modules', '.vinz-memory-cleanup-check.mjs');

writeFileSync(
  entry,
  `
export { looksLikeExplicitRemember } from '${cwd}/netlify/functions/me-chat-capture.ts';
`,
);

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'error',
  external: ['@netlify/blobs'],
});

const m = await import(`file://${out}?v=${Date.now()}`);
let failures = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

console.log('\n═══ EXPLICIT REMEMBER — RILEVATORE ═══\n');

const positives = [
  'Ricordati che ho un cane di nome Fido',
  'Ricorda che lavoro come architetto',
  'Non dimenticare che lavoro al progetto X',
  'Tieni a mente che sono vegetariano',
  'Memorizza che vivo a Milano',
  'Ehi, ricordati che domani ho un colloquio importante',
  'please remember that I am vegetarian',
  "remember that I don't eat gluten",
  'remember to call mom tomorrow',
  "don't forget I have a meeting Friday",
  "Don't forget that my sister's name is Anna",
];
for (const text of positives) {
  check(m.looksLikeExplicitRemember(text) === true, `riconosce richiesta esplicita: "${text}"`);
}

const negatives = [
  'Ho mangiato uno yogurt',
  'Ne ho mangiato un altro',
  'ciao come stai',
  'grazie mille',
  'Oggi ho fatto una corsa di 5km',
  'Che ricordo bellissimo quella vacanza',
  'Mi ricordo ancora quel giorno',
  'I remember when we met',
  'This app has a great memory feature',
];
for (const text of negatives) {
  check(m.looksLikeExplicitRemember(text) === false, `NON attiva su conversazione ordinaria: "${text}"`);
}

if (failures) {
  console.error(`\n${failures} controllo/i falliti.`);
  process.exit(1);
}
console.log('\nTutto coerente.\n');
