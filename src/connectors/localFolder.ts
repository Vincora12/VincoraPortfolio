/// <reference path="./fileSystemAccess.d.ts" />
/* Camminata comune su una cartella locale, condivisa da Obsidian e iCloud
   Drive — stessa API del browser (File System Access), stesso limite di
   sicurezza (MAX_FILES_SCANNED), diverso solo il filtro estensioni: un
   vault Obsidian è solo .md, iCloud Drive è documenti in generale. */

export interface FolderMatch {
  path: string;
  excerpt: string;
}

const MAX_FILES_SCANNED = 400;

export async function ensureReadPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  if ((await handle.queryPermission({ mode: 'read' })) === 'granted') return true;
  return (await handle.requestPermission({ mode: 'read' })) === 'granted';
}

/**
 * Cerca nei file di testo di una cartella locale già collegata. Solo
 * lettura: nessuna scrittura, nessun file inviato altrove — la ricerca gira
 * qui, il risultato che torna al modello sono percorso + un estratto
 * corto, non la cartella intera.
 */
export async function searchFolderFiles(
  handle: FileSystemDirectoryHandle,
  query: string,
  limit: number,
  readableExtensions: RegExp,
): Promise<FolderMatch[]> {
  const needle = query.trim().toLocaleLowerCase();
  const matches: FolderMatch[] = [];
  let scanned = 0;

  async function walk(dir: FileSystemDirectoryHandle, prefix: string): Promise<void> {
    for await (const [name, entry] of dir.entries()) {
      if (matches.length >= limit || scanned >= MAX_FILES_SCANNED) return;
      if (name.startsWith('.')) continue;
      if (entry.kind === 'directory') {
        await walk(entry, `${prefix}${name}/`);
      } else if (readableExtensions.test(name)) {
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

  await walk(handle, '');
  return matches;
}
