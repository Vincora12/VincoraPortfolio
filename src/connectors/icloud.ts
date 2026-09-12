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
import { ensureReadPermission, searchFolderFiles, searchUploadedFiles, readUploadedTextFiles, type FolderMatch, type UploadedTextFile } from './localFolder';
import { loadICloudConfig, saveICloudConfig } from './store';

const HANDLE_KEY = 'icloud-drive';
const UPLOAD_KEY = 'icloud-drive-files';
const READABLE_EXT = /\.(md|markdown|txt|csv|json|log|rtf|yml|yaml)$/i;

export function isFolderPickerSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** Su iOS/Safari nessun browser sa aprire una cartella (vedi `idbHandle.ts`):
    il ripiego è scegliere i file uno a uno dall'app File (iCloud Drive
    compreso), una volta invece di una cartella viva. */
export async function uploadICloudFiles(fileList: FileList | File[]): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const result = await readUploadedTextFiles(fileList, READABLE_EXT);
  if (!result.ok) return result;
  await saveHandle<UploadedTextFile[]>(UPLOAD_KEY, result.files);
  saveICloudConfig({ ...loadICloudConfig(), folderLabel: `${result.files.length} file caricati` });
  return { ok: true, count: result.files.length };
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
  await clearHandle(UPLOAD_KEY);
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
  if (handle) {
    if (!(await ensureReadPermission(handle))) return { ok: false, error: 'Permesso alla cartella non concesso.' };
    try {
      return { ok: true, matches: await searchFolderFiles(handle, query, limit, READABLE_EXT) };
    } catch {
      return { ok: false, error: 'Lettura della cartella interrotta.' };
    }
  }
  const uploaded = await loadHandle<UploadedTextFile[]>(UPLOAD_KEY);
  if (uploaded?.length) return { ok: true, matches: searchUploadedFiles(uploaded, query, limit) };
  return { ok: false, error: 'Nessuna cartella iCloud Drive collegata. Aprila prima da FILES.' };
}
