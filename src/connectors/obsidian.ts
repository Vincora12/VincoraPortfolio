/// <reference path="./fileSystemAccess.d.ts" />
import { loadVaultHandle, saveVaultHandle, clearVaultHandle } from './idbHandle';
import { loadObsidianConfig, saveObsidianConfig } from './store';

export function isVaultPickerSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export async function pickVault(): Promise<{ ok: true; label: string } | { ok: false; error: string }> {
  if (!isVaultPickerSupported()) {
    return { ok: false, error: 'Questo browser non sa aprire cartelle locali (serve Chrome, Edge o un browser basato su Chromium).' };
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    await saveVaultHandle(handle);
    saveObsidianConfig({ vaultLabel: handle.name });
    return { ok: true, label: handle.name };
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') return { ok: false, error: 'Selezione annullata.' };
    return { ok: false, error: 'Non riesco ad aprire la cartella scelta.' };
  }
}

export async function forgetVault(): Promise<void> {
  await clearVaultHandle();
  saveObsidianConfig({ vaultLabel: null });
}

async function ensureReadPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  if ((await handle.queryPermission({ mode: 'read' })) === 'granted') return true;
  return (await handle.requestPermission({ mode: 'read' })) === 'granted';
}

export interface VaultMatch {
  path: string;
  excerpt: string;
}

const MAX_FILES_SCANNED = 400;

/**
 * Cerca nei file .md del vault collegato. Solo lettura: nessuna scrittura,
 * nessun file inviato altrove — la ricerca gira qui, il risultato che torna
 * al modello sono percorso + un estratto corto, non il vault intero.
 */
export async function searchVault(
  query: string,
  limit = 8,
): Promise<{ ok: true; matches: VaultMatch[] } | { ok: false; error: string }> {
  const handle = await loadVaultHandle();
  if (!handle) return { ok: false, error: 'Nessun vault collegato. Aprilo prima da LAB → CONNETTORI.' };
  if (!(await ensureReadPermission(handle))) return { ok: false, error: 'Permesso alla cartella del vault non concesso.' };

  const needle = query.trim().toLocaleLowerCase();
  const matches: VaultMatch[] = [];
  let scanned = 0;

  async function walk(dir: FileSystemDirectoryHandle, prefix: string): Promise<void> {
    for await (const [name, entry] of dir.entries()) {
      if (matches.length >= limit || scanned >= MAX_FILES_SCANNED) return;
      if (name.startsWith('.')) continue;
      if (entry.kind === 'directory') {
        await walk(entry, `${prefix}${name}/`);
      } else if (name.toLocaleLowerCase().endsWith('.md')) {
        scanned += 1;
        const file = await entry.getFile();
        const text = await file.text();
        const haystack = `${name}\n${text}`.toLocaleLowerCase();
        if (!needle || haystack.includes(needle)) {
          const at = needle ? haystack.indexOf(needle) : 0;
          const start = Math.max(0, at - 80);
          const excerpt = text.slice(start, start + 240).replace(/\s+/g, ' ').trim();
          matches.push({ path: `${prefix}${name}`, excerpt });
        }
      }
    }
  }

  try {
    await walk(handle, '');
  } catch {
    return { ok: false, error: 'Lettura del vault interrotta.' };
  }
  return { ok: true, matches };
}

export function loadVaultLabel(): string | null {
  return loadObsidianConfig().vaultLabel;
}
