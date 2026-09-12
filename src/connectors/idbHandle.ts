/// <reference path="./fileSystemAccess.d.ts" />
/* Un FileSystemDirectoryHandle non è JSON: non può vivere in `localStorage`
   come il resto della config dei connettori. IndexedDB sa clonare handle
   nativi — è l'unico posto dove il permesso a una cartella (vault Obsidian,
   cartella iCloud Drive…) sopravvive a un refresh della pagina.

   🔷 Una chiave per connettore, non un singolo slot: iCloud Drive e Obsidian
   sono due permessi distinti, a due cartelle diverse. */

const DB_NAME = 'vinzmon-connectors';
const STORE = 'handles';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* 🔷 Generico da subito: non solo handle nativi. Su iOS/Safari non esiste
   `showDirectoryPicker` (Apple obbliga ogni browser lì a usare WebKit sotto
   il cofano — installare «Chrome» o «Edge» su iPhone non cambia motore), e
   il ripiego per quel caso — file caricati una volta, non una cartella viva
   — è comunque testo semplice: stesso magazzino, stessa chiave per
   connettore, valore diverso. */
export async function saveHandle<T = FileSystemDirectoryHandle>(key: string, value: T): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadHandle<T = FileSystemDirectoryHandle>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function clearHandle(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* niente da pulire */
  }
}
