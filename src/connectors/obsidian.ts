/// <reference path="./fileSystemAccess.d.ts" />
import { loadHandle, saveHandle, clearHandle } from './idbHandle';
import { ensureReadPermission, searchFolderFiles, type FolderMatch } from './localFolder';
import { loadObsidianConfig, saveObsidianConfig } from './store';

const HANDLE_KEY = 'obsidian-vault';
const READABLE_EXT = /\.md$/i;

export function isVaultPickerSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
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
  if (!handle) return { ok: false, error: 'Nessun vault collegato. Aprilo prima da FILES.' };
  if (!(await ensureReadPermission(handle))) return { ok: false, error: 'Permesso alla cartella del vault non concesso.' };
  try {
    return { ok: true, matches: await searchFolderFiles(handle, query, limit, READABLE_EXT) };
  } catch {
    return { ok: false, error: 'Lettura del vault interrotta.' };
  }
}

export function loadVaultLabel(): string | null {
  return loadObsidianConfig().vaultLabel;
}
