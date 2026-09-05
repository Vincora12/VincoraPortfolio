/* ============================================================================
   AGENT.LAB — ACCESSO DI SOLA LETTURA AL PROGETTO

   🔒 READ ACCESS → intero progetto. WRITE ACCESS → nessuno, qui dentro. Questo
   file espone solo lettura: elencare, leggere, cercare testo. Nessuna
   funzione qui scrive mai su disco, git o altrove — quel confine non è una
   promessa nel prompt, è l'assenza totale di un'API di scrittura in questo
   modulo.

   🔷 COME ARRIVANO I FILE QUI DENTRO. `node_bundler = "esbuild"` (netlify.toml)
   impacchetta di norma solo quello che una funzione importa staticamente —
   verificato prima di scrivere questo file: nessun'altra funzione qui dentro
   legge file arbitrari del repo. `netlify.toml` dichiara `included_files` per
   *questa* funzione (`agent-lab`), che copia una copia di sola lettura di
   i file .ts/.tsx/.css sotto src, i file .ts sotto netlify e i file .md sotto
   docs (vedi netlify.toml) e pochi file di root nel pacchetto della funzione — la stessa versione già pubblica su
   GitHub per questo commit, non un accesso live al repository.

   🔒 COSA NON PUÒ MAI USCIRE DA QUI. `included_files` non include mai
   `.env*`/`node_modules`/`dist`/`.git` (i pattern qui sotto non li
   toccherebbero comunque). `resolveRepoRoot()` cerca la cartella vera del
   progetto; `read_file`/`search_files` rifiutano qualunque percorso che non
   sia sotto una delle cartelle consentite, o che assomigli a un segreto
   (`.env`, `secret`, `credential`, chiavi, `.git/`) — difesa in profondità,
   anche se quei file non sarebbero mai stati inclusi nel pacchetto. Il
   contenuto letto è sempre TESTO SORGENTE: dove il codice legge una chiave
   (`process.env.ANTHROPIC_API_KEY`), quello che si vede è il NOME della
   variabile, mai il suo valore — il valore vive solo nell'ambiente Netlify,
   mai nel codice, quindi non può comparire in un file letto come testo.
   ========================================================================= */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Le uniche radici che Agent.lab può guardare. Tutto il resto è invisibile. */
const ALLOWED_ROOTS = ['src', 'netlify', 'docs'];
/** File di root leggibili singolarmente, fuori dalle cartelle qui sopra. */
const ALLOWED_ROOT_FILES = ['package.json', 'netlify.toml', 'AGENTS.md', 'README.md', 'vite.config.ts', 'tsconfig.json'];

/** Estensioni di testo che ha senso leggere. Tutto il resto viene rifiutato. */
const TEXT_EXTENSIONS = ['.ts', '.tsx', '.css', '.md', '.json', '.toml'];

/** Frammenti che, ovunque compaiano nel percorso, chiudono la porta. Difesa
 *  in profondità: questi percorsi non dovrebbero mai finire nel pacchetto. */
const DENY_PATH_FRAGMENTS = ['.env', 'node_modules', 'dist', '.git', 'secret', 'credential', '.pem', '.key', 'id_rsa'];

let cachedRoot: string | null = null;

/**
 * Trova la vera cartella del progetto dentro il pacchetto della funzione.
 * Non si assume UN solo modo in cui Netlify posiziona `included_files`: si
 * cerca la cartella che ha sia `package.json` sia `src/`, la firma che
 * distingue davvero la radice del repo da qualunque altra cosa.
 */
function resolveRepoRoot(): string {
  if (cachedRoot) return cachedRoot;
  /* ⚠️ `__dirname` è CommonJS, e questo modulo (come ogni funzione Netlify in
     questo repo) è ESM: qui non esiste. `import.meta.url` è l'equivalente
     che esiste davvero in ESM — da lì si risale alla cartella del modulo
     senza assumere quale bundler/runtime l'abbia messo dove. */
  const here = fileURLToPath(new URL('.', import.meta.url));
  const candidates = [process.cwd(), resolve(here, '../../..'), resolve(here, '../..'), resolve(here, '..'), '/var/task'];
  for (const candidate of candidates) {
    try {
      if (existsSync(join(candidate, 'package.json')) && existsSync(join(candidate, 'src'))) {
        cachedRoot = candidate;
        return candidate;
      }
    } catch {
      /* candidato non leggibile: si prova il prossimo */
    }
  }
  cachedRoot = process.cwd();
  return cachedRoot;
}

export interface FileAccessError {
  ok: false;
  error: string;
}

function looksForbidden(relPath: string): string | null {
  const normalized = relPath.split(sep).join('/');
  for (const fragment of DENY_PATH_FRAGMENTS) {
    if (normalized.toLowerCase().includes(fragment)) return fragment;
  }
  return null;
}

/** Il percorso richiesto è dentro una radice consentita? Nessuna `..`, nessuna radice assoluta estranea. */
function resolveAllowedPath(requested: string): { abs: string; rel: string } | FileAccessError {
  const clean = normalize(requested).replace(/^[/\\]+/, '');
  if (clean.includes('..')) return { ok: false, error: 'percorso non valido (contiene "..")' };

  const forbidden = looksForbidden(clean);
  if (forbidden) return { ok: false, error: `percorso non leggibile (contiene "${forbidden}")` };

  const root = resolveRepoRoot();
  const abs = resolve(root, clean);
  const rel = relative(root, abs);

  // Deve restare DENTRO la radice del progetto — resolve/normalize potrebbero
  // altrimenti uscirne con abbastanza `..` incatenati diversamente.
  if (rel.startsWith('..') || rel === '') return { ok: false, error: 'percorso fuori dal progetto' };

  const topLevel = rel.split(sep)[0];
  const isAllowedRoot = ALLOWED_ROOTS.includes(topLevel ?? '');
  const isAllowedRootFile = ALLOWED_ROOT_FILES.includes(rel);
  if (!isAllowedRoot && !isAllowedRootFile) {
    return { ok: false, error: `cartella non consentita — solo ${ALLOWED_ROOTS.join(', ')}, o uno fra ${ALLOWED_ROOT_FILES.join(', ')}` };
  }

  return { abs, rel };
}

export interface FileEntry {
  name: string;
  kind: 'file' | 'dir';
}

/** Elenca una cartella consentita. Senza percorso, elenca le radici stesse. */
export function listProjectFiles(requestedPath?: string): { ok: true; path: string; entries: FileEntry[] } | FileAccessError {
  if (!requestedPath || requestedPath.trim() === '' || requestedPath === '.' || requestedPath === '/') {
    return {
      ok: true,
      path: '.',
      entries: [...ALLOWED_ROOTS.map((name) => ({ name, kind: 'dir' as const })), ...ALLOWED_ROOT_FILES.map((name) => ({ name, kind: 'file' as const }))],
    };
  }
  const resolved = resolveAllowedPath(requestedPath);
  if ('error' in resolved) return resolved;
  let stat;
  try {
    stat = statSync(resolved.abs);
  } catch {
    return { ok: false, error: 'percorso inesistente' };
  }
  if (!stat.isDirectory()) return { ok: false, error: 'non è una cartella — usa read_file' };
  let names: string[];
  try {
    names = readdirSync(resolved.abs);
  } catch {
    return { ok: false, error: 'cartella non leggibile' };
  }
  const entries: FileEntry[] = names
    .filter((name) => !name.startsWith('.'))
    .map((name) => {
      const full = join(resolved.abs, name);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        /* voce sparita fra il readdir e lo stat: si ignora come file */
      }
      return { name, kind: isDir ? ('dir' as const) : ('file' as const) };
    })
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1));
  return { ok: true, path: resolved.rel || '.', entries };
}

const MAX_FILE_CHARS = 6000;

/** Legge un file di testo consentito, troncato se enorme. */
export function readProjectFile(requestedPath: string): { ok: true; path: string; text: string; truncated: boolean } | FileAccessError {
  const resolved = resolveAllowedPath(requestedPath);
  if ('error' in resolved) return resolved;
  const ext = resolved.rel.slice(resolved.rel.lastIndexOf('.'));
  if (!TEXT_EXTENSIONS.includes(ext)) {
    return { ok: false, error: `estensione non leggibile come testo — solo ${TEXT_EXTENSIONS.join(', ')}` };
  }
  let stat;
  try {
    stat = statSync(resolved.abs);
  } catch {
    return { ok: false, error: 'file inesistente' };
  }
  if (!stat.isFile()) return { ok: false, error: 'non è un file — usa list_files' };
  let raw: string;
  try {
    raw = readFileSync(resolved.abs, 'utf8');
  } catch {
    return { ok: false, error: 'file non leggibile' };
  }
  const truncated = raw.length > MAX_FILE_CHARS;
  return { ok: true, path: resolved.rel, text: truncated ? raw.slice(0, MAX_FILE_CHARS) : raw, truncated };
}

export interface SearchMatch {
  path: string;
  line: number;
  text: string;
}

const MAX_FILES_SCANNED = 500;
const MAX_MATCHES = 30;

function walk(dir: string, root: string, out: string[]): void {
  if (out.length >= MAX_FILES_SCANNED) return;
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (out.length >= MAX_FILES_SCANNED) return;
    if (name.startsWith('.') || looksForbidden(name)) continue;
    const full = join(dir, name);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walk(full, root, out);
    } else if (TEXT_EXTENSIONS.includes(name.slice(name.lastIndexOf('.')))) {
      out.push(full);
    }
  }
}

/** Cerca un testo (semplice, case-insensitive) nelle cartelle consentite. */
export function searchProjectFiles(query: string, requestedPath?: string): { ok: true; matches: SearchMatch[]; filesScanned: number; truncated: boolean } | FileAccessError {
  const term = query.trim();
  if (term.length < 2) return { ok: false, error: 'la ricerca serve almeno due caratteri' };

  const startRoots: string[] = [];
  if (requestedPath && requestedPath.trim() && requestedPath !== '.' && requestedPath !== '/') {
    const resolved = resolveAllowedPath(requestedPath);
    if ('error' in resolved) return resolved;
    startRoots.push(resolved.abs);
  } else {
    const root = resolveRepoRoot();
    for (const name of ALLOWED_ROOTS) {
      const abs = join(root, name);
      if (existsSync(abs)) startRoots.push(abs);
    }
  }

  const root = resolveRepoRoot();
  const files: string[] = [];
  for (const start of startRoots) walk(start, root, files);

  const needle = term.toLowerCase();
  const matches: SearchMatch[] = [];
  outer: for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if ((lines[i] ?? '').toLowerCase().includes(needle)) {
        matches.push({ path: relative(root, file).split(sep).join('/'), line: i + 1, text: (lines[i] ?? '').trim().slice(0, 200) });
        if (matches.length >= MAX_MATCHES) break outer;
      }
    }
  }

  return { ok: true, matches, filesScanned: files.length, truncated: matches.length >= MAX_MATCHES || files.length >= MAX_FILES_SCANNED };
}

/* ============================================================================
   IL CONFINE DI SCRITTURA — SOLO UI, VERIFICATO NEL CODICE, NON PROMESSO NEL
   PROMPT

   🔒 Questa funzione non scrive MAI niente. Convalida solo se una patch
   proposta ha l'aria di toccare esclusivamente presentazione — e se non ce
   l'ha, dice esattamente perché, così Agent.lab può spiegarlo invece di
   fingere di applicare qualcosa. Non esiste, in nessun punto di questo
   modulo o del resto della funzione, una chiamata che scriva su file, git o
   rete verso GitHub: il confine "WRITE ACCESS → esclusivamente UI" qui è
   realizzato come "non esiste scrittura, esiste solo una patch pronta da
   incollare" — la decisione è documentata in
   docs/AGENT_LAB_V1_2026-09-04.md.
   ========================================================================= */

/** Righe aggiunte (quelle che iniziano con "+", non l'intestazione "+++") di una patch unificata. */
function addedLines(patch: string): string[] {
  return patch
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1));
}

/** Segnali che una riga aggiunta non è più "solo presentazione". */
const FUNCTIONAL_SIGNALS = [
  'useapp(', 'usestate(', 'useeffect(', 'usereducer(', 'usecallback(', 'usememo(',
  'store.ts', 'runmontool', 'fetch(', 'localstorage', 'sessionstorage', 'process.env',
  'netlify/functions', 'import(', 'require(', 'engine/', 'ai/backend', 'ai/tools',
  'async function', 'await ', '.env',
];

export interface UiOnlyCheck {
  ok: boolean;
  reason?: string;
  offendingLine?: string;
}

/**
 * Verifica MECCANICA (non un giudizio del modello) che una patch proposta
 * non introduca logica, chiamate di rete, stato applicativo o accesso a
 * backend/config. Non certifica che la patch sia corretta o bella — solo che
 * non abbia oltrepassato il confine.
 */
export function checkUiOnlyPatch(targetFile: string, patch: string): UiOnlyCheck {
  const cleanTarget = targetFile.replace(/^[/\\]+/, '');
  if (!cleanTarget.startsWith('src' + sep) && !cleanTarget.startsWith('src/')) {
    return { ok: false, reason: 'il file di destinazione non è sotto src/ — Agent.lab non propone patch fuori dal client' };
  }
  const deniedDirs = ['src/state/', 'src/engine/', 'src/ai/', 'src/brain/', 'src/assets-pipeline/'];
  const normalizedTarget = cleanTarget.split(sep).join('/');
  for (const dir of deniedDirs) {
    if (normalizedTarget.startsWith(dir)) {
      return { ok: false, reason: `"${dir}" è dominio logico/dati, non presentazione — fuori dal confine UI-only di Agent.lab` };
    }
  }
  for (const line of addedLines(patch)) {
    const lower = line.toLowerCase();
    for (const signal of FUNCTIONAL_SIGNALS) {
      if (lower.includes(signal)) {
        return { ok: false, reason: `la riga aggiunta usa "${signal}" — questo non è più un cambiamento solo presentazionale`, offendingLine: line.trim().slice(0, 200) };
      }
    }
  }
  return { ok: true };
}
