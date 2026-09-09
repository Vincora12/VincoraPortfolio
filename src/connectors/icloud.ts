/// <reference path="./fileSystemAccess.d.ts" />
/* ============================================================================
   ICLOUD DRIVE — una cartella locale, non un account

   🔒 Apple non offre un'API di lettura di iCloud Drive per un'app web di
   terze parti: niente OAuth possibile qui, a differenza di Google. Ma
   iCloud Drive sincronizza già i file su QUESTO Mac — di norma in
   ~/Library/Mobile Documents/com~apple~CloudDocs — e il browser sa aprire
   una cartella locale con lo stesso permesso già usato per il vault
   Obsidian. Stesso meccanismo (`localFolder.ts`), cartella diversa, filtro
   estensioni più largo: qui dentro ci sono documenti in generale, non solo
   note markdown. */

import { loadHandle, saveHandle, clearHandle } from './idbHandle';
import { ensureReadPermission, searchFolderFiles, type FolderMatch } from './localFolder';
import { loadICloudConfig, saveICloudConfig } from './store';

const HANDLE_KEY = 'icloud-drive';
const READABLE_EXT = /\.(md|markdown|txt|csv|json|log|rtf|yml|yaml)$/i;

export function isFolderPickerSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export async function pickICloudFolder(): Promise<{ ok: true; label: string } | { ok: false; error: string }> {
  if (!isFolderPickerSupported()) {
    return { ok: false, error: 'Questo browser non sa aprire cartelle locali (serve Chrome, Edge o un browser basato su Chromium).' };
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    await saveHandle(HANDLE_KEY, handle);
    saveICloudConfig({ ...loadICloudConfig(), folderLabel: handle.name });
    return { ok: true, label: handle.name };
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') return { ok: false, error: 'Selezione annullata.' };
    return { ok: false, error: 'Non riesco ad aprire la cartella scelta.' };
  }
}

export async function forgetICloudFolder(): Promise<void> {
  await clearHandle(HANDLE_KEY);
  saveICloudConfig({ folderLabel: null, projectId: null });
}

export function loadICloudFolderLabel(): string | null {
  return loadICloudConfig().folderLabel;
}

export function loadICloudProjectId(): string | null {
  return loadICloudConfig().projectId;
}

/** null = tutti i progetti. */
export function setICloudProject(projectId: string | null): void {
  saveICloudConfig({ ...loadICloudConfig(), projectId });
}

export type ICloudMatch = FolderMatch;

/**
 * Cerca fra i documenti di testo nella cartella iCloud Drive collegata. Solo
 * lettura, solo formati testuali (md/txt/csv/json/log/rtf/yaml) — un file
 * binario (PDF, immagine, .docx vero) non si legge qui: rientra nel motivo
 * per cui questo connettore esiste (leggere quello che il Mac ha già
 * sincronizzato), non un secondo motore di conversione documenti.
 */
export async function searchICloudFolder(
  query: string,
  limit = 8,
): Promise<{ ok: true; matches: ICloudMatch[] } | { ok: false; error: string }> {
  const handle = await loadHandle(HANDLE_KEY);
  if (!handle) return { ok: false, error: 'Nessuna cartella iCloud Drive collegata. Aprila prima da FILES.' };
  if (!(await ensureReadPermission(handle))) return { ok: false, error: 'Permesso alla cartella non concesso.' };
  try {
    return { ok: true, matches: await searchFolderFiles(handle, query, limit, READABLE_EXT) };
  } catch {
    return { ok: false, error: 'Lettura della cartella interrotta.' };
  }
}
