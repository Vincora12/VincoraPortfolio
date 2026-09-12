/// <reference path="./fileSystemAccess.d.ts" />
import { loadHandle, saveHandle, clearHandle } from './idbHandle';
import { ensureReadPermission, searchFolderFiles, searchUploadedFiles, readUploadedTextFiles, type FolderMatch, type UploadedTextFile } from './localFolder';
import { loadObsidianConfig, saveObsidianConfig } from './store';

const HANDLE_KEY = 'obsidian-vault';
const UPLOAD_KEY = 'obsidian-vault-files';
const READABLE_EXT = /\.md$/i;

export function isVaultPickerSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** Su iOS/Safari nessun browser sa aprire una cartella (vedi `idbHandle.ts`):
    il ripiego è caricare i file .md una volta, invece di una cartella viva. */
export async function uploadVaultFiles(fileList: FileList | File[]): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const result = await readUploadedTextFiles(fileList, READABLE_EXT);
  if (!result.ok) return result;
  await saveHandle<UploadedTextFile[]>(UPLOAD_KEY, result.files);
  saveObsidianConfig({ ...loadObsidianConfig(), vaultLabel: `${result.files.length} file caricati` });
  return { ok: true, count: result.files.length };
}

export async function pickVault(): Promise<{ ok: true; label: string } | { ok: false; error: string }> {
  if (!isVaultPickerSupported()) {
    return { ok: false, error: 'Questo browser non sa aprire cartelle locali (serve Chrome, Edge o un browser basato su Chromium).' };
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    await saveHandle(HANDLE_KEY, handle);
    saveObsidianConfig({ ...loadObsidianConfig(), vaultLabel: handle.name });
    return { ok: true, label: handle.name };
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') return { ok: false, error: 'Selezione annullata.' };
    return { ok: false, error: 'Non riesco ad aprire la cartella scelta.' };
  }
}

export async function forgetVault(): Promise<void> {
  await clearHandle(HANDLE_KEY);
  await clearHandle(UPLOAD_KEY);
  saveObsidianConfig({ vaultLabel: null, projectId: null });
}

export function loadVaultProjectId(): string | null {
  return loadObsidianConfig().projectId;
}

/** null = tutti i progetti. */
export function setVaultProject(projectId: string | null): void {
  saveObsidianConfig({ ...loadObsidianConfig(), projectId });
}

export type VaultMatch = FolderMatch;

export async function searchVault(
  query: string,
  limit = 8,
): Promise<{ ok: true; matches: VaultMatch[] } | { ok: false; error: string }> {
  const handle = await loadHandle(HANDLE_KEY);
  if (handle) {
    if (!(await ensureReadPermission(handle))) return { ok: false, error: 'Permesso alla cartella del vault non concesso.' };
    try {
      return { ok: true, matches: await searchFolderFiles(handle, query, limit, READABLE_EXT) };
    } catch {
      return { ok: false, error: 'Lettura del vault interrotta.' };
    }
  }
  const uploaded = await loadHandle<UploadedTextFile[]>(UPLOAD_KEY);
  if (uploaded?.length) return { ok: true, matches: searchUploadedFiles(uploaded, query, limit) };
  return { ok: false, error: 'Nessun vault collegato. Aprilo prima da FILES.' };
}

export function loadVaultLabel(): string | null {
  return loadObsidianConfig().vaultLabel;
}
