/* Verifica offline del confine di lettura/scrittura di AGENT.LAB V1
   (`netlify/functions/_shared/agentLabFiles.ts`). Nessuna API key, nessuna
   rete: legge/cerca DAVVERO nel repository su disco (questo stesso repo),
   non file finti — è la prova più vera che si può fare senza un deploy. */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'vinz-agentlab-files-'));
const entry = join(dir, 'entry.ts');
const out = join(cwd, 'node_modules', '.vinz-agentlab-files-check.mjs');

writeFileSync(
  entry,
  `
export { listProjectFiles, readProjectFile, searchProjectFiles, checkUiOnlyPatch } from '${cwd}/netlify/functions/_shared/agentLabFiles.ts';
`,
);

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'error',
});

const m = await import(`file://${out}?v=${Date.now()}`);
let failures = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

console.log('\n═══ AGENT.LAB — CONFINE DI LETTURA/SCRITTURA (agentLabFiles.ts) ═══\n');

// ── list_files — G2: repository blindness ──────────────────────────────────
const roots = m.listProjectFiles();
check(roots.ok, 'list_files senza percorso torna le radici consentite');
check(roots.ok && roots.entries.some((e) => e.name === 'src' && e.kind === 'dir'), 'STAGE — "src" compare fra le radici');
check(roots.ok && roots.entries.some((e) => e.name === 'package.json'), 'STAGE — i file di root consentiti compaiono');

const srcList = m.listProjectFiles('src/engine');
check(srcList.ok, 'list_files elenca davvero una cartella reale del progetto (src/engine)');
check(srcList.ok && srcList.entries.some((e) => e.name === 'progression.ts'), 'STAGE — un file vero (progression.ts) compare nell’elenco');

// ── read_file — deve leggere codice VERO, e mai un valore di segreto ───────
const progression = m.readProjectFile('src/engine/progression.ts');
check(progression.ok, 'read_file legge davvero un file sorgente reale del progetto');
check(progression.ok && progression.text.includes('canCloseDay'), 'STAGE — il contenuto letto è il codice vero (contiene canCloseDay)');

const authFile = m.readProjectFile('netlify/functions/_shared/auth.ts');
check(authFile.ok, 'read_file legge anche codice server (auth.ts) — è pubblico su GitHub, non un segreto');
check(
  authFile.ok && authFile.text.includes('process.env[envVar]') && !/VINZMON_TOKEN\s*=\s*['"][^'"]+['"]/.test(authFile.text),
  'STAGE — il file mostra il NOME della variabile d’ambiente, mai un valore di segreto assegnato',
);

// ── G4 — secret leak: percorsi vietati per difesa in profondità ────────────
check(!m.readProjectFile('.env').ok, 'G4 — read_file rifiuta ".env"');
check(!m.readProjectFile('../.env').ok, 'G4 — read_file rifiuta un percorso che esce dal progetto');
check(!m.readProjectFile('src/../.env').ok, 'G4 — read_file rifiuta un percorso con ".." anche se "sembra" rientrare');
check(!m.readProjectFile('node_modules/some-package/index.js').ok, 'G4 — read_file rifiuta node_modules');
check(!m.readProjectFile('id_rsa').ok, 'G4 — read_file rifiuta nomi che assomigliano a chiavi private');
check(!m.listProjectFiles('../').ok, 'G4 — list_files rifiuta di uscire dal progetto');
check(!m.readProjectFile('netlify.toml.png').ok, 'G4 — read_file rifiuta estensioni non testuali dichiarate');

// ── G2 — search_files trova davvero, non finge ─────────────────────────────
const search = m.searchProjectFiles('canCloseDay', 'src/engine');
check(search.ok, 'search_files cerca davvero nei file consentiti');
check(search.ok && search.matches.some((mm) => mm.path === 'src/engine/progression.ts'), 'STAGE — trova la vera occorrenza in progression.ts');
check(!m.searchProjectFiles('x').ok, 'search_files rifiuta una query troppo corta (un solo carattere)');

// ── G3 — write escape: propose_ui_change è verificato meccanicamente ───────
const uiOnly = m.checkUiOnlyPatch(
  'src/screens/TodayChecklist.tsx',
  ['--- a/src/screens/TodayChecklist.tsx', '+++ b/src/screens/TodayChecklist.tsx', '@@', '-  <div className="card">', '+  <div className="card card--compact">'].join('\n'),
);
check(uiOnly.ok, 'G7 — una patch genuinamente presentazionale (solo className) passa il controllo meccanico');

const logicPatch = m.checkUiOnlyPatch(
  'src/state/store.ts',
  ['--- a/src/state/store.ts', '+++ b/src/state/store.ts', '@@', '+  set({ insightWeight: 2 });'].join('\n'),
);
check(!logicPatch.ok, 'G3/G8 — una patch su src/state/ viene rifiutata dal controllo meccanico, non solo "sconsigliata"');

const hookPatch = m.checkUiOnlyPatch(
  'src/screens/TodayChecklist.tsx',
  ['--- a/src/screens/TodayChecklist.tsx', '+++ b/src/screens/TodayChecklist.tsx', '@@', '+  const insights = useApp((s) => s.insights);'].join('\n'),
);
check(!hookPatch.ok, 'G3 — una patch che introduce un hook di stato (useApp) viene rifiutata anche se il file è "giusto"');
check(hookPatch.reason?.toLowerCase().includes('useapp('), 'G3 — il motivo del rifiuto nomina esattamente cosa ha trovato (useapp()), non un rifiuto generico');

const backendPatch = m.checkUiOnlyPatch(
  'src/screens/TodayChecklist.tsx',
  ['--- a/src/screens/TodayChecklist.tsx', '+++ b/src/screens/TodayChecklist.tsx', '@@', "+  await fetch('/api/agent-lab');"].join('\n'),
);
check(!backendPatch.ok, 'G3 — una patch che chiama fetch() verso il backend viene rifiutata');

const outsideSrc = m.checkUiOnlyPatch('netlify/functions/ai.ts', ['+  color: red;'].join('\n'));
check(!outsideSrc.ok, 'G3 — nessuna patch fuori da src/ viene mai accettata, qualunque sia il contenuto');

if (failures) {
  console.error(`\n${failures} controllo/i falliti.`);
  process.exit(1);
}
console.log('\nTutto coerente.\n');
