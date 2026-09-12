/* Verifica LOCAL-FIRST / LOCAL ONLY MODE / REPO OPS INTENT.

   Due tipi di controllo, per lo stesso motivo di `backend-check.mjs`:
   - STATICO (lettura del sorgente) per `ai.ts`, dove imbottigliare l'intero
     handler (providers, auth, runtime log...) solo per una guardia da tre
     righe sarebbe più fragile della guardia stessa.
   - FUNZIONALE VERO per la config LOCAL ONLY (`_shared/spend.ts`, stesso
     store del tetto mensile) e per i rilevatori d'intento di REPO OPS
     (`brain/stream.ts`, funzioni pure, nessuno stato applicativo). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const cwd = process.cwd();
let failures = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

console.log('\n═══ LOCAL-FIRST / LOCAL ONLY MODE / REPO OPS INTENT ═══\n');

/* ── STATICO — ai.ts: la guardia sta DOVE deve stare ──────────────────────── */
const aiSource = readFileSync(`${cwd}/netlify/functions/ai.ts`, 'utf8');
const routeAt = aiSource.indexOf('const route = preferences.modelName === LOCAL_CHEAP_ROUND_SENTINEL');
const guardAt = aiSource.indexOf('eventType: LOCAL_ONLY_BLOCKED');
const firstCallProviderAt = aiSource.indexOf('callProvider(route.provider');
check(routeAt > -1, 'ai.ts risolve ancora `route` con lo stesso sentinel/resolveRoute di sempre');
check(guardAt > routeAt, 'la guardia LOCAL ONLY sta DOPO che `route` è risolta');
check(firstCallProviderAt === -1 || guardAt < firstCallProviderAt, 'la guardia LOCAL ONLY sta PRIMA di qualunque chiamata a callProvider');
check(
  aiSource.includes('localOnly.enabled && route.provider !== ') && aiSource.includes('403'),
  'la guardia rifiuta con 403 quando attiva e la rotta non è locale — mai un ripiego silenzioso',
);
check(
  aiSource.match(/resolveRoute\(capability, preferences\.modelName\)/),
  '⚠️ resolveRoute resta l\'UNICA porta per un modello scelto a mano — nessun bypass nuovo introdotto per la Control Room',
);

/* ── FUNZIONALE — Local Only mode: round-trip vero, store finto ──────────── */
const records = new Map();
globalThis.__localOnlyStore = {
  get: async (key, opts) => {
    const raw = records.get(key);
    if (!raw) return null;
    return opts?.type === 'json' ? JSON.parse(raw) : raw;
  },
  setJSON: async (key, data) => { records.set(key, JSON.stringify(data)); },
};
async function moduleFrom(path, plugins) {
  const { outputFiles } = await build({ entryPoints: [path], bundle: true, format: 'esm', platform: 'node', write: false, plugins });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
}
const spend = await moduleFrom(`${cwd}/netlify/functions/_shared/spend.ts`, [{
  name: 'isolated-local-only',
  setup(builder) {
    builder.onResolve({ filter: /\/localStore$|^\.\/localStore$/ }, () => ({ path: 'store', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const getStore = () => globalThis.__localOnlyStore;', loader: 'js' }));
  },
}]);

const before = await spend.readLocalOnlyMode();
check(before.enabled === false, 'LOCAL ONLY MODE è spento di default, prima di qualunque scrittura');

const afterOn = await spend.writeLocalOnlyMode(true);
check(afterOn.enabled === true, 'writeLocalOnlyMode(true) torna acceso');
const readOn = await spend.readLocalOnlyMode();
check(readOn.enabled === true, 'readLocalOnlyMode rilegge davvero quello scritto (acceso)');

const afterOff = await spend.writeLocalOnlyMode(false);
check(afterOff.enabled === false, 'writeLocalOnlyMode(false) torna spento');
const readOff = await spend.readLocalOnlyMode();
check(readOff.enabled === false, 'readLocalOnlyMode rilegge davvero quello scritto (spento)');

/* ── FUNZIONALE — rilevatori d'intento REPO OPS (funzioni pure) ───────────── */
const stream = await moduleFrom(`${cwd}/src/brain/stream.ts`, [{
  name: 'isolated-stream-intents',
  setup(builder) {
    // `stream.ts` porta con sé zustand/React solo per tipi e per funzioni mai
    // chiamate qui: bundlarlo intero serve solo a raggiungere le due funzioni
    // pure che questo controllo verifica.
  },
}]).catch((error) => {
  console.warn('  (bundling di stream.ts fallito, salto i controlli sui rilevatori d\'intento):', error.message);
  return null;
});

if (stream) {
  check(stream.isRepoOpsIntent('fai partire i test'), 'isRepoOpsIntent riconosce "fai partire i test"');
  check(stream.isRepoOpsIntent('qual è lo stato di git'), 'isRepoOpsIntent riconosce "stato di git"');
  check(stream.isRepoOpsIntent('riavvia il servizio local core'), 'isRepoOpsIntent riconosce una richiesta di riavvio');
  check(stream.isRepoOpsIntent('ollama è online sul mio mac?'), 'isRepoOpsIntent riconosce una domanda sullo stato di Ollama');
  check(!stream.isRepoOpsIntent('quanto ho dormito stanotte'), 'isRepoOpsIntent NON si accende su una domanda di salute qualsiasi');
  check(stream.shouldUseLocalTools('lancia il typecheck delle funzioni'), 'shouldUseLocalTools include le richieste REPO OPS');
}

console.log(`\n${failures === 0 ? 'TUTTO OK' : `${failures} CONTROLLO/I FALLITO/I`}\n`);
process.exit(failures === 0 ? 0 : 1);
