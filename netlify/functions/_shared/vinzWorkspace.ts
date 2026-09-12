/* ============================================================================
   LA CARTELLA DI VINZ — una cartella vera per progetto, sua

   🔷 «Nella cartella del progetto ho caricato manualmente tutto.» La cartella
   di lavoro è LA STESSA cosa che l'utente vede in FILES/"Aggiungi file": non
   un collegamento a scoprire, esiste già in automatico, una per progetto.
   VINZ può scrivere, organizzare, cancellare qui dentro — ma solo dentro il
   proprio recinto, mai fuori (vedi `resolveInside`).

   🔒 SOLO SUL SERVER LOCALE — `isLocalCoreServer()`: su Netlify questa
   cartella non esisterebbe sul Mac dell'utente, ma sul filesystem effimero
   del cloud provider. */

import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { getStore } from './localStore';

export function isLocalCoreServer(): boolean {
  return process.env.VINZMON_LOCAL_CORE === '1';
}

const store = () => getStore({ name: 'vinzmon-workspace', consistency: 'strong' });
const MAP_KEY = 'folders';

const WORKSPACE_ROOT = resolve(process.env.VINZMON_WORKSPACE_DIR || join(homedir(), 'VinzMon'));
const MAX_ENTRIES = 500;
const MAX_READ_BYTES = 1 * 1024 * 1024;
const MAX_WRITE_CHARS = 200_000;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

interface WorkspaceMap {
  [projectId: string]: string;
}

async function loadMap(): Promise<WorkspaceMap> {
  return ((await store().get(MAP_KEY, { type: 'json' })) as WorkspaceMap | null) ?? {};
}

async function saveMap(map: WorkspaceMap): Promise<void> {
  await store().setJSON(MAP_KEY, map);
}

function slugify(title: string): string {
  const slug = title
    .trim()
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return slug || 'progetto';
}

/** Nome di cartella stabile per progetto: assegnato una volta, mai più
    cambiato — se cambiasse a ogni rinomina del progetto, il lavoro già
    salvato lì dentro sembrerebbe sparito. */
export async function ensureProjectWorkspace(projectId: string, projectTitle: string): Promise<string> {
  const map = await loadMap();
  let folderName = map[projectId];
  if (!folderName) {
    const base = slugify(projectTitle);
    const taken = new Set(Object.values(map));
    let candidate = base;
    let n = 2;
    while (taken.has(candidate)) candidate = `${base}-${n++}`;
    folderName = candidate;
    map[projectId] = folderName;
    await saveMap(map);
  }
  const root = join(WORKSPACE_ROOT, folderName);
  await mkdir(root, { recursive: true });
  return root;
}

/** Tiene un percorso relativo dentro il recinto di `root` — niente `../` o
    percorsi assoluti che scappano fuori, che sia la cartella di lavoro
    dell'AI o una cartella collegata dall'utente. */
function resolveInside(root: string, relPath: string): string {
  const cleaned = relPath.replace(/^[/\\]+/, '');
  const full = resolve(root, cleaned);
  if (full !== root && !full.startsWith(root + sep)) throw new Error('Percorso fuori dalla cartella consentita.');
  return full;
}

export interface WorkspaceEntry {
  path: string;
  type: 'file' | 'dir';
  size?: number;
}

export async function listWorkspaceTree(root: string): Promise<WorkspaceEntry[]> {
  const out: WorkspaceEntry[] = [];
  async function walk(dir: string, prefix: string): Promise<void> {
    if (out.length >= MAX_ENTRIES) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= MAX_ENTRIES) return;
      if (entry.name.startsWith('.')) continue;
      const rel = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        out.push({ path: rel, type: 'dir' });
        await walk(join(dir, entry.name), `${rel}/`);
      } else {
        const info = await stat(join(dir, entry.name)).catch(() => null);
        out.push({ path: rel, type: 'file', size: info?.size });
      }
    }
  }
  await walk(root, '');
  return out;
}

export async function readWorkspaceFile(root: string, relPath: string): Promise<string> {
  const full = resolveInside(root, relPath);
  const info = await stat(full);
  if (!info.isFile()) throw new Error('Non è un file.');
  if (info.size > MAX_READ_BYTES) throw new Error('File troppo grande da leggere come testo.');
  return readFile(full, 'utf8');
}

export async function writeWorkspaceFile(root: string, relPath: string, content: string): Promise<void> {
  if (content.length > MAX_WRITE_CHARS) throw new Error(`Contenuto troppo lungo (massimo ${MAX_WRITE_CHARS} caratteri).`);
  const full = resolveInside(root, relPath);
  if (full === root) throw new Error('Serve un nome di file, non la cartella stessa.');
  await mkdir(resolve(full, '..'), { recursive: true });
  await writeFile(full, content, 'utf8');
}

/** Upload dal browser (FILES → "Aggiungi file"): qualunque tipo di file, non
    solo testo — l'utente carica foto, PDF, quello che serve. Bytes grezzi da
    base64, mai passati per un encoding di testo che li corromperebbe. */
export async function writeWorkspaceBinary(root: string, relPath: string, base64: string): Promise<void> {
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.byteLength > MAX_UPLOAD_BYTES) throw new Error(`File troppo grande (massimo ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB).`);
  const full = resolveInside(root, relPath);
  if (full === root) throw new Error('Serve un nome di file, non la cartella stessa.');
  await mkdir(resolve(full, '..'), { recursive: true });
  await writeFile(full, buffer);
}

export async function deleteWorkspaceEntry(root: string, relPath: string): Promise<void> {
  const full = resolveInside(root, relPath);
  if (full === root) throw new Error('Non puoi cancellare l’intera cartella di lavoro.');
  await rm(full, { recursive: true, force: true });
}

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MEDIA_TYPE_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

/** «Se un file è già nella cartella, deve essere sempre consultabile» — un
    PDF o una foto qui dentro non basta rileggerli come testo (`readFile`
    li corromperebbe): vanno restituiti in base64 così chi chiama può
    allegarli davvero alla conversazione, non solo citarne il nome. */
export async function readWorkspaceBinary(root: string, relPath: string): Promise<{ base64: string; mediaType: string }> {
  const full = resolveInside(root, relPath);
  const info = await stat(full);
  if (!info.isFile()) throw new Error('Non è un file.');
  const ext = full.slice(full.lastIndexOf('.') + 1).toLowerCase();
  const mediaType = MEDIA_TYPE_BY_EXT[ext];
  if (!mediaType) throw new Error('Formato non leggibile direttamente: solo PDF e immagini (png, jpg, webp, gif).');
  if (info.size > MAX_DOCUMENT_BYTES) throw new Error(`File troppo grande da allegare (massimo ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB).`);
  const buffer = await readFile(full);
  return { base64: buffer.toString('base64'), mediaType };
}
