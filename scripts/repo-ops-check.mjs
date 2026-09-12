/* Verifica offline/reale del confine di REPO OPS
   (`netlify/functions/_shared/repoOps.ts`): git/npm/log/servizi, le nuove
   "mani in più" sul repository. Stessa forma di `agent-lab-files-check.mjs`
   — nessuna API key, nessun mock: gira su QUESTO repository vero. Non
   invoca mai uno script npm reale (test/build/typecheck) — solo i suoi
   RIFIUTI, per non far girare la suite dentro la suite. */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'vinz-repo-ops-'));
const entry = join(dir, 'entry.ts');
const out = join(cwd, 'node_modules', '.vinz-repo-ops-check.mjs');

writeFileSync(
  entry,
  `
export {
  gitStatus, gitDiff, gitLog, gitBranch, gitShow,
  repoWrite, repoEdit, runNpmScript, readVinzmonLogs, inspectLocalServices,
} from '${cwd}/netlify/functions/_shared/repoOps.ts';
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

console.log('\n═══ REPO OPS — git/npm/log/servizi (repoOps.ts) ═══\n');

// ── git, sola lettura — deve leggere DAVVERO questo repository ─────────────
const status = m.gitStatus();
check(status.ok, 'git_status legge davvero lo stato del repository');
check(status.ok && /^##/.test(status.stdout), 'STAGE — lo stato porta la riga di branch (--branch)');

const branch = m.gitBranch();
check(branch.ok && branch.stdout.length > 0, 'git_branch torna un nome di branch reale, non vuoto');

const log = m.gitLog(3);
check(log.ok, 'git_log legge davvero la cronologia');
check(log.ok && log.stdout.split('\n').filter(Boolean).length <= 3, 'STAGE — il limite sui commit è rispettato');

const diffAll = m.gitDiff();
check(diffAll.ok, 'git_diff senza percorso torna un riepilogo (--stat)');

// ── git_show — il ref è VALIDATO PRIMA di raggiungere execFileSync ─────────
const badRef = m.gitShow('HEAD; rm -rf /');
check(!badRef.ok && /non valido/.test(badRef.error ?? ''), 'git_show RIFIUTA un riferimento con un carattere di shell (";")');
const okRef = m.gitShow('HEAD');
check(okRef.ok, 'git_show accetta un riferimento reale (HEAD)');

// ── scrittura — STESSO confine di code_search/code_read, mai un secondo ───
const traversal = m.repoWrite('../../etc/vinz-repo-ops-check-traversal', 'x');
check(!traversal.ok && /\.\./.test(traversal.error ?? ''), 'repo_write RIFIUTA un percorso con ".." (path traversal)');

const outsideRoot = m.repoWrite('/etc/vinz-repo-ops-check-abs', 'x');
check(!outsideRoot.ok, 'repo_write RIFIUTA un percorso assoluto fuori dal repository');

const badExt = m.repoWrite('docs/vinz-repo-ops-check.sh', '#!/bin/sh\necho hi\n');
check(!badExt.ok && /estensione/.test(badExt.error ?? ''), 'repo_write RIFIUTA un\'estensione non scrivibile (.sh)');

const badRoot = m.repoWrite('node_modules/vinz-repo-ops-check.md', 'x');
check(!badRoot.ok, 'repo_write RIFIUTA una radice non consentita (node_modules)');

const editMissing = m.repoEdit('docs/does-not-exist-vinz-check.md', 'a', 'b');
check(!editMissing.ok, 'repo_edit RIFIUTA un file inesistente invece di crearlo da solo');

// Scrittura reale e pulizia, per provare che il percorso CONSENTITO funziona davvero.
const realWrite = m.repoWrite('docs/.vinz-repo-ops-check-tmp.md', 'prova');
check(realWrite.ok, 'repo_write SCRIVE davvero un file dentro una radice consentita (docs/)');
if (existsSync(join(cwd, 'docs/.vinz-repo-ops-check-tmp.md'))) {
  const notUnique = m.repoEdit('docs/.vinz-repo-ops-check-tmp.md', 'z', 'y');
  check(!notUnique.ok && /non trovato/.test(notUnique.error ?? ''), 'repo_edit RIFIUTA una sostituzione il cui testo non esiste nel file');
  const edited = m.repoEdit('docs/.vinz-repo-ops-check-tmp.md', 'prova', 'modificato');
  check(edited.ok, 'repo_edit SOSTITUISCE davvero un\'occorrenza unica');
  await import('node:fs/promises').then((fs) => fs.unlink(join(cwd, 'docs/.vinz-repo-ops-check-tmp.md')));
}

// ── npm scripts — mai un nome inventato, mai fuori allowlist ───────────────
const badScript = m.runNpmScript('rm -rf /');
check(!badScript.ok && /non consentito/.test(badScript.error ?? ''), 'run_npm_script RIFIUTA un nome fuori allowlist');
const notInAllowlist = m.runNpmScript('postinstall');
check(!notInAllowlist.ok, 'run_npm_script RIFIUTA uno script fuori allowlist (postinstall, esiste ma non è consentito)');

// ── log — solo i due file veri, mai un percorso a scelta ───────────────────
const logs = m.readVinzmonLogs('service');
check(logs.ok || /non ancora creato/.test(logs.error ?? ''), 'read_logs torna un esito onesto per il log di servizio (esiste o non ancora creato)');

// ── servizi — sola lettura, mai un'eccezione se offline ────────────────────
const services = await m.inspectLocalServices();
check(typeof services.core.online === 'boolean', 'inspect_local_services torna sempre un booleano per Local Core, online o no');
check(typeof services.mem0.online === 'boolean', 'inspect_local_services torna sempre un booleano per Mem0, online o no');
check(Array.isArray(services.ollama.models), 'inspect_local_services torna sempre un array di modelli Ollama (vuoto se offline)');

console.log(`\n${failures === 0 ? 'TUTTO OK' : `${failures} CONTROLLO/I FALLITO/I`}\n`);
process.exit(failures === 0 ? 0 : 1);
