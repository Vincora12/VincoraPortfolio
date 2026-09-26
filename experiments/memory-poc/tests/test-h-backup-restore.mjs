/* TEST H — BACKUP E RIPRISTINO. mem0 con provider "memory" usa DUE file
   SQLite distinti (history + vettori, verificato leggendo il costruttore
   di MemoryVectorStore e il config di historyStore) più, se lo store delle
   entità viene mai usato, un TERZO file derivato (`<vectors>_entities.db`,
   verificato in getEntityStore(), dist/oss/index.js:17041-17057). Copio
   TUTTO quello che esiste davvero su disco per questo POC, ripristino in
   una cartella pulita, e verifico che i ricordi si leggano da lì — non mi
   fido di aver copiato "abbastanza" solo perché ho copiato un file. */
import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { POC_ROOT } from '../lib/setup.mjs';
import { writeResult } from '../lib/result.mjs';

const DATA_DIR = resolve(POC_ROOT, 'data');
const BACKUP_DIR = resolve(POC_ROOT, 'backup');
const RESTORE_DIR = resolve(POC_ROOT, 'restored-data');
mkdirSync(BACKUP_DIR, { recursive: true });
mkdirSync(RESTORE_DIR, { recursive: true });

const filesInDataDir = readdirSync(DATA_DIR);
const copied = [];
for (const file of filesInDataDir) {
  const src = resolve(DATA_DIR, file);
  copyFileSync(src, resolve(BACKUP_DIR, file));
  copyFileSync(src, resolve(RESTORE_DIR, file));
  copied.push(file);
}

writeResult('test-h-backup-restore', {
  status: 'IN_CORSO',
  fileTrovatiECopiati: copied,
  notaFileMultipli: copied.length > 1
    ? `${copied.length} file separati costituiscono lo storage reale — copiarne uno solo avrebbe perso i ricordi o lo storico`
    : 'un solo file trovato: nessun rischio di copia parziale osservato in QUESTO run, ma resta un rischio architetturale se lo store entità viene creato in futuro',
});
