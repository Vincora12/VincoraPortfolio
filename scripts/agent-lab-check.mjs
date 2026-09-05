/* Verifica offline del dispatcher di strumenti e della costruzione del
   contesto di AGENT.LAB V1 (`netlify/functions/agent-lab.ts`). Non chiama
   nessun modello — verifica che ESEGUIRE uno strumento richiesto dal modello
   rispetti davvero il confine READ/WRITE, con gli stessi identificatori e la
   stessa forma di input/output che il loop reale userebbe. */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'vinz-agentlab-'));
const entry = join(dir, 'entry.ts');
const out = join(cwd, 'node_modules', '.vinz-agentlab-check.mjs');

writeFileSync(
  entry,
  `
export { executeTool, contextBlock } from '${cwd}/netlify/functions/agent-lab.ts';
`,
);

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'error',
  // Non serve mai in questi controlli: nessuna chiamata attraversa checkCap/recordSpend
  // (quelle vivono nell'handler HTTP, qui si testa solo il dispatcher di strumenti).
  external: ['@netlify/blobs'],
});

const m = await import(`file://${out}?v=${Date.now()}`);
let failures = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

console.log('\n═══ AGENT.LAB — DISPATCHER DI STRUMENTI E CONTESTO DEL FLOW ═══\n');

// ── G2 — repository blindness: list/read/search rispondono per davvero ────
const list = m.executeTool({ id: 't1', name: 'list_files', input: { path: 'src/engine' } });
check(!list.isError, 'list_files (via dispatcher) elenca src/engine senza errore');
check(JSON.parse(list.content).entries.some((e) => e.name === 'progression.ts'), 'STAGE — l’elenco contiene un file vero');

const read = m.executeTool({ id: 't2', name: 'read_file', input: { path: 'src/engine/progression.ts' } });
check(!read.isError, 'read_file (via dispatcher) legge un file vero senza errore');
check(read.content.includes('canCloseDay'), 'STAGE — il contenuto è il codice vero');

const search = m.executeTool({ id: 't3', name: 'search_files', input: { query: 'canCloseDay' } });
check(!search.isError, 'search_files (via dispatcher) trova qualcosa senza errore');
check(search.content.includes('progression.ts'), 'STAGE — trova davvero il file giusto');

const missing = m.executeTool({ id: 't4', name: 'read_file', input: {} });
check(missing.isError, 'read_file senza "path" torna un errore leggibile, non un crash');

const unknown = m.executeTool({ id: 't5', name: 'strumento_inventato', input: {} });
check(unknown.isError, 'uno strumento sconosciuto viene rifiutato, non eseguito a caso');

// ── G3/G7/G8 — propose_ui_change, via lo stesso dispatcher che il loop userebbe ──
const goodPatch = m.executeTool({
  id: 't6',
  name: 'propose_ui_change',
  input: {
    target_file: 'src/screens/TodayChecklist.tsx',
    rationale: 'riduce lo spazio verticale della card',
    patch: ['--- a/src/screens/TodayChecklist.tsx', '+++ b/src/screens/TodayChecklist.tsx', '-  <div className="card">', '+  <div className="card card--compact">'].join('\n'),
  },
});
check(!goodPatch.isError, 'G7 — una richiesta genuinamente UI-only (esempio del task) passa il dispatcher');

const forbiddenPatch = m.executeTool({
  id: 't7',
  name: 'propose_ui_change',
  input: {
    target_file: 'src/engine/generation-config.ts',
    rationale: 'fa pesare di più gli Insight nella scelta della Family',
    patch: ['--- a/src/engine/generation-config.ts', '+++ b/src/engine/generation-config.ts', '+  insightWeight = 2;'].join('\n'),
  },
});
check(forbiddenPatch.isError, 'G8 — "fai pesare di più gli Insight nella Family" (esempio del task) viene rifiutata dal dispatcher, non applicata');
check(forbiddenPatch.content.includes('PATCH RIFIUTATA'), 'G8 — il rifiuto è esplicito, non un successo silenzioso mascherato');

// ── G1 — context failure: il contesto del FLOW arriva davvero nel prompt ──
const withContext = m.contextBlock({ stepId: '20.5', stepLabel: 'Written Bio', stepDetail: 'riscrittura AI opzionale', stepPhase: 'MON RECORD' });
check(withContext.includes('20.5') && withContext.includes('Written Bio') && withContext.includes('riscrittura AI opzionale'), 'G1 — il contesto del passo FLOW (id/nome/descrizione) finisce davvero nel blocco di sistema');
check(/non darla per buona senza verificarla/i.test(withContext), 'G1 — il prompt istruisce esplicitamente a VERIFICARE il contesto dichiarato, non a fidarsene');

const withoutContext = m.contextBlock(null);
check(withoutContext === '', 'la chat principale (nessun nodo FLOW) non porta un blocco di contesto vuoto/fasullo');

if (failures) {
  console.error(`\n${failures} controllo/i falliti.`);
  process.exit(1);
}
console.log('\nTutto coerente.\n');
