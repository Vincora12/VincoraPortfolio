/* ============================================================================
   REPO OPS — mani in più per l'agent loop esistente, non un secondo runtime

   🔒 SOLO SUL SERVER LOCALE. Ogni funzione qui dentro presuppone il vero
   repository (`.git`, `node_modules`, i processi veri) — cose che esistono
   solo sul Mac dove gira il Local Core, mai nel pacchetto Netlify (che è una
   copia di sola lettura senza `.git`, vedi `agentLabFiles.ts`). L'endpoint
   che chiama queste funzioni (`netlify/functions/repo-ops.ts`) controlla
   `isLocalCoreServer()` PRIMA di arrivare qui — stessa guardia già usata da
   `vinz-workspace.ts` per la cartella di lavoro.

   🔒 NESSUNA STRINGA DI COMANDO LIBERA. Ogni funzione esegue UN comando
   fisso (`execFileSync` con argv, mai una stringa passata a una shell) o un
   argomento validato con un pattern rigido (es. un ref git). Non esiste
   "esegui questo": esiste "fai esattamente questa cosa", una funzione per
   ogni cosa — la stessa scelta di design del catalogo strumenti in
   `ai/tools.ts`, qui applicata all'esecuzione invece che alla decisione.

   🔷 SCRITTURA: RIUSA IL CONFINE DI `agentLabFiles.ts`, NON UN SECONDO.
   `resolveAllowedPath`/`TEXT_EXTENSIONS`/`resolveRepoRoot` sono la STESSA
   validazione già usata da code_search/code_read — `agentLabFiles.ts`
   dichiara esplicitamente di non avere scrittura al suo interno; quella
   vive qui, ma il "dove sei autorizzato a toccare" resta un'unica fonte. */

import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { resolveAllowedPath, resolveRepoRoot, TEXT_EXTENSIONS, type FileAccessError } from './agentLabFiles';
import { protectedWriteReason } from './protectedPaths';

const MAX_OUTPUT_CHARS = 8_000;

function capOutput(text: string): { text: string; truncated: boolean } {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_OUTPUT_CHARS) return { text: trimmed, truncated: false };
  return { text: `${trimmed.slice(0, MAX_OUTPUT_CHARS)}\n[TRONCATO — output più lungo del tetto]`, truncated: true };
}

function errorText(error: unknown): string {
  const err = error as { stderr?: Buffer | string; stdout?: Buffer | string; message?: string };
  const stderrText = typeof err.stderr === 'string' ? err.stderr : err.stderr?.toString('utf8');
  const stdoutText = typeof err.stdout === 'string' ? err.stdout : err.stdout?.toString('utf8');
  return (stderrText || stdoutText || err.message || 'comando non riuscito').trim().slice(0, 2000);
}

export interface CommandResult {
  ok: boolean;
  stdout: string;
  truncated: boolean;
  error?: string;
}

/** git status/diff/log/branch/show — READ-ONLY, ognuno un comando fisso, argv mai una stringa. */
function runGit(args: string[]): CommandResult {
  try {
    const stdout = execFileSync('git', args, {
      cwd: resolveRepoRoot(),
      encoding: 'utf8',
      timeout: 10_000,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const capped = capOutput(stdout);
    return { ok: true, stdout: capped.text, truncated: capped.truncated };
  } catch (error) {
    return { ok: false, stdout: '', truncated: false, error: errorText(error) };
  }
}

export function gitStatus(): CommandResult {
  return runGit(['status', '--short', '--branch']);
}

/** Senza `path`: solo il riepilogo di tutto ciò che è cambiato (`--stat`) — un
    diff completo di una sessione con 50 file modificati sarebbe inutile da
    leggere. Con `path`, il diff vero ma di UN file solo. `--` separa sempre
    il percorso dal resto: un percorso che iniziasse per "-" non può travestirsi
    da flag (la stessa protezione che usa git stesso su riga di comando). */
export function gitDiff(path?: string): CommandResult {
  if (!path) return runGit(['diff', '--stat']);
  const resolved = resolveAllowedPath(path);
  if ('error' in resolved) return { ok: false, stdout: '', truncated: false, error: resolved.error };
  return runGit(['diff', '--', resolved.rel]);
}

export function gitLog(limit = 10): CommandResult {
  const capped = Math.max(1, Math.min(50, Math.floor(limit) || 10));
  return runGit(['log', `-n${capped}`, '--oneline']);
}

export function gitBranch(): CommandResult {
  return runGit(['branch', '--show-current']);
}

const SAFE_REF = /^[A-Za-z0-9._/-]{1,80}$/;

export function gitShow(ref: string): CommandResult {
  if (!SAFE_REF.test(ref)) return { ok: false, stdout: '', truncated: false, error: 'riferimento non valido' };
  return runGit(['show', '--stat', ref]);
}

/* --- Scrittura, dentro lo stesso recinto di code_read/code_search ---------- */

const MAX_WRITE_CHARS = 200_000;

function checkWritableExtension(rel: string): string | null {
  const ext = rel.slice(rel.lastIndexOf('.'));
  return TEXT_EXTENSIONS.includes(ext) ? null : `estensione non scrivibile — solo ${TEXT_EXTENSIONS.join(', ')}`;
}

/** vNext SAFETY GATE — the single write-path check shared by repo_write and
    repo_edit: the read confinement of `resolveAllowedPath`, then text-only
    extensions, then the protected Core list (checked on the requested path
    AND on the real path after symlinks), and no writes through symlinks. */
export function resolveWritablePath(relPath: string): { abs: string; rel: string } | FileAccessError {
  if (typeof relPath !== 'string' || !relPath.trim() || /[\0-\x1f]/.test(relPath)) return { ok: false, error: 'percorso non valido' };
  const resolved = resolveAllowedPath(relPath.normalize('NFC'));
  if ('error' in resolved) return resolved;
  const extError = checkWritableExtension(resolved.rel);
  if (extError) return { ok: false, error: extError };
  const reason = protectedWriteReason(resolved.rel);
  if (reason) return { ok: false, error: `SCRITTURA NEGATA — ${reason}. Questi file si modificano solo a mano.` };
  const root = realpathSync(resolveRepoRoot());
  if (existsSync(resolved.abs) && lstatSync(resolved.abs).isSymbolicLink()) return { ok: false, error: 'SCRITTURA NEGATA — il percorso è un collegamento simbolico' };
  let ancestor = dirname(resolved.abs);
  while (!existsSync(ancestor) && ancestor !== dirname(ancestor)) ancestor = dirname(ancestor);
  const realAncestor = realpathSync(ancestor);
  const realRel = relative(root, realAncestor);
  if (realRel.startsWith('..') || realRel.startsWith('/')) return { ok: false, error: 'SCRITTURA NEGATA — percorso fuori dal progetto' };
  if (existsSync(resolved.abs)) {
    const realTarget = relative(root, realpathSync(resolved.abs));
    const realReason = protectedWriteReason(realTarget);
    if (realReason || realTarget.startsWith('..')) return { ok: false, error: `SCRITTURA NEGATA — ${realReason ?? 'percorso fuori dal progetto'}` };
  }
  return resolved;
}

export function repoWrite(relPath: string, content: string): { ok: true } | FileAccessError {
  if (typeof content !== 'string' || content.length > MAX_WRITE_CHARS) return { ok: false, error: `contenuto troppo lungo (massimo ${MAX_WRITE_CHARS} caratteri)` };
  const resolved = resolveWritablePath(relPath);
  if ('error' in resolved) return resolved;
  mkdirSync(dirname(resolved.abs), { recursive: true });
  writeFileSync(resolved.abs, content, 'utf8');
  return { ok: true };
}

/** Sostituzione esatta di UNA occorrenza — come una vera modifica mirata, non
    una riscrittura totale del file. Rifiuta se il testo da sostituire non è
    univoco: un modello che "aggiusta" un frammento ambiguo rischia di
    colpire il pezzo sbagliato, meglio chiedergli più contesto. */
export function repoEdit(relPath: string, oldStr: string, newStr: string): { ok: true } | FileAccessError {
  const resolved = resolveWritablePath(relPath);
  if ('error' in resolved) return resolved;
  if (!oldStr) return { ok: false, error: 'serve il testo da sostituire' };
  let current: string;
  try {
    current = readFileSync(resolved.abs, 'utf8');
  } catch {
    return { ok: false, error: 'file inesistente — usa repo_write per crearlo' };
  }
  const occurrences = current.split(oldStr).length - 1;
  if (occurrences === 0) return { ok: false, error: 'testo da sostituire non trovato — rileggi il file (code_read) prima di riprovare' };
  if (occurrences > 1) return { ok: false, error: `il testo compare ${occurrences} volte — aggiungi più contesto per renderlo univoco` };
  if (newStr.length > MAX_WRITE_CHARS) return { ok: false, error: `contenuto troppo lungo (massimo ${MAX_WRITE_CHARS} caratteri)` };
  writeFileSync(resolved.abs, current.replace(oldStr, () => newStr), 'utf8');
  return { ok: true };
}

/* --- npm scripts — solo quelli che esistono già, mai inventati -------------- */

const ALLOWED_NPM_SCRIPTS = ['test', 'build', 'typecheck', 'typecheck:functions'];

export function runNpmScript(name: string): CommandResult {
  if (!ALLOWED_NPM_SCRIPTS.includes(name)) {
    return { ok: false, stdout: '', truncated: false, error: `script non consentito — solo ${ALLOWED_NPM_SCRIPTS.join(', ')}` };
  }
  const root = resolveRepoRoot();
  let scripts: Record<string, string> | undefined;
  try {
    scripts = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }).scripts;
  } catch {
    return { ok: false, stdout: '', truncated: false, error: 'package.json non leggibile' };
  }
  if (!scripts?.[name]) return { ok: false, stdout: '', truncated: false, error: `script "${name}" non presente in package.json — non lo invento` };
  try {
    const stdout = execFileSync('npm', ['run', name], {
      cwd: root,
      encoding: 'utf8',
      timeout: 240_000,
      maxBuffer: 20 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const capped = capOutput(stdout);
    return { ok: true, stdout: capped.text, truncated: capped.truncated };
  } catch (error) {
    const err = error as { status?: number };
    const capped = capOutput(errorText(error));
    return { ok: false, stdout: capped.text, truncated: capped.truncated, error: `uscito con codice ${err.status ?? '?'}` };
  }
}

/* --- Log — solo i due file che core-server.ts scrive davvero --------------- */

export function readVinzmonLogs(which: 'service' | 'service-error'): { ok: true; text: string; truncated: boolean } | { ok: false; error: string } {
  const file = which === 'service' ? 'service.log' : 'service-error.log';
  const full = join(resolveRepoRoot(), 'data', file);
  if (!existsSync(full)) return { ok: false, error: 'log non ancora creato' };
  let raw: string;
  try {
    raw = readFileSync(full, 'utf8');
  } catch {
    return { ok: false, error: 'log non leggibile' };
  }
  const lines = raw.split('\n');
  const tailedLines = lines.slice(-200);
  const capped = capOutput(tailedLines.join('\n'));
  return { ok: true, text: capped.text, truncated: capped.truncated || lines.length > 200 };
}

/* --- Stato dei servizi locali — sola lettura -------------------------------- */

export interface LocalServicesStatus {
  core: { online: boolean };
  /** `llmModel`/`embedderModel`: solo nomi, letti dal `/health` del servizio
      Mem0 stesso — mai una chiave, mai un env letto qui dentro. */
  mem0: { online: boolean; llmModel?: string; embedderModel?: string };
  ollama: { online: boolean; models: string[] };
}

async function pingHealth(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function pingMem0(url: string): Promise<{ online: boolean; llmModel?: string; embedderModel?: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return { online: false };
    const body = (await res.json()) as { llmModel?: string; embedderModel?: string };
    return { online: true, ...(body.llmModel ? { llmModel: body.llmModel } : {}), ...(body.embedderModel ? { embedderModel: body.embedderModel } : {}) };
  } catch {
    return { online: false };
  }
}

export async function inspectLocalServices(): Promise<LocalServicesStatus> {
  const core = { online: await pingHealth(`http://127.0.0.1:${process.env.PORT || 8787}/health`) };
  const mem0 = await pingMem0(`${process.env.VINZMON_MEMORY_SERVICE_URL || 'http://127.0.0.1:8788'}/health`);
  let ollamaOnline = false;
  let models: string[] = [];
  try {
    const base = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      ollamaOnline = true;
      const body = (await res.json()) as { models?: { model?: string; name?: string }[] };
      models = (body.models ?? []).flatMap((m) => (m.model ?? m.name ? [String(m.model ?? m.name)] : []));
    }
  } catch {
    /* Ollama spento o non installato: online resta false */
  }
  return { core, mem0, ollama: { online: ollamaOnline, models } };
}

/* --- Riavvio — solo il servizio conosciuto, mai un nome arbitrario --------- */

const SERVICE_LABEL = 'mon.vinz.core';

/** 🔒 Il processo che serve QUESTA richiesta È il servizio da riavviare: un
    `launchctl kickstart -k` sincrono qui dentro ucciderebbe se stesso prima
    di poter rispondere. Il chiamante (`repo-ops.ts`) risponde subito
    "riavvio avviato", poi programma questa funzione con un piccolo ritardo
    (`platform.waitUntil`) — il riavvio vero parte DOPO che la risposta è
    già in viaggio verso il client. Non si può quindi confermare qui "è
    tornato online": lo strumento lo dice in chiaro, e il modello può
    ricontrollare con inspect_local_services al giro successivo. */
export function scheduleRestart(delayMs = 300): void {
  setTimeout(() => {
    const uid = typeof process.getuid === 'function' ? process.getuid() : 501;
    try {
      execFileSync('launchctl', ['kickstart', '-k', `gui/${uid}/${SERVICE_LABEL}`], {
        timeout: 10_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      console.warn('[repo-ops] riavvio non riuscito', errorText(error));
    }
  }, delayMs);
}
