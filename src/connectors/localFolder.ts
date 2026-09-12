/// <reference path="./fileSystemAccess.d.ts" />
/* Camminata comune su una cartella locale, condivisa da Obsidian e iCloud
   Drive — stessa API del browser (File System Access), stesso limite di
   sicurezza (MAX_FILES_SCANNED), diverso solo il filtro estensioni: un
   vault Obsidian è solo .md, iCloud Drive è documenti in generale. */

export interface FolderMatch {
  path: string;
  excerpt: string;
}

/** Su iOS/Safari non esiste `showDirectoryPicker` — nessun browser lì ce
    l'ha, Apple impone WebKit a tutti (vedi `idbHandle.ts`). Il ripiego è un
    caricamento file una tantum invece di una cartella viva: stesso limite di
    file, stesso formato di risultato, zero directory da camminare. */
export interface UploadedTextFile {
  name: string;
  content: string;
}

const MAX_FILES_SCANNED = 400;
export const MAX_UPLOADED_FILES = 200;
export const MAX_UPLOAD_TOTAL_BYTES = 8 * 1024 * 1024;

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

/** Stessa ricerca di `searchFolderFiles`, sui file caricati una volta invece
    che su una cartella viva — nessuna directory da camminare, un array. */
export function searchUploadedFiles(files: UploadedTextFile[], query: string, limit: number): FolderMatch[] {
  const needle = query.trim().toLocaleLowerCase();
  const matches: FolderMatch[] = [];
  for (const file of files) {
    if (matches.length >= limit) break;
    const haystack = `${file.name}\n${file.content}`.toLocaleLowerCase();
    if (!needle || haystack.includes(needle)) {
      const at = needle ? haystack.indexOf(needle) : 0;
      const start = Math.max(0, at - 80);
      const excerpt = file.content.slice(start, start + 240).replace(/\s+/g, ' ').trim();
      matches.push({ path: file.name, excerpt });
    }
  }
  return matches;
}

/** Legge i file scelti dall'input, filtrati per estensione e limitati per
    numero/peso totale — lo stesso tetto delle cartelle live, non un lusso
    in più solo perché qui il browser non cammina da sé le directory. */
export async function readUploadedTextFiles(
  fileList: FileList | File[],
  readableExtensions: RegExp,
): Promise<{ ok: true; files: UploadedTextFile[] } | { ok: false; error: string }> {
  const all = Array.from(fileList).filter((f) => readableExtensions.test(f.name));
  if (!all.length) return { ok: false, error: 'Nessun file con estensione valida selezionato.' };
  if (all.length > MAX_UPLOADED_FILES) return { ok: false, error: `Massimo ${MAX_UPLOADED_FILES} file per volta.` };
  const totalBytes = all.reduce((sum, f) => sum + f.size, 0);
  if (totalBytes > MAX_UPLOAD_TOTAL_BYTES) return { ok: false, error: `Troppi dati: massimo ${Math.round(MAX_UPLOAD_TOTAL_BYTES / (1024 * 1024))} MB in totale.` };
  const files = await Promise.all(all.map(async (f) => ({ name: f.name, content: await f.text() })));
  return { ok: true, files };
}
