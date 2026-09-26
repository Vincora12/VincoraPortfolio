/* TEST H, PARTE 2 — punta un'istanza NUOVA di Memory sui file RIPRISTINATI
   in `restored-data/` (copie separate, non gli originali in `data/`), e
   verifica che un ricordo scritto prima sia leggibile da lì. */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Va fissato PRIMA di importare setup.mjs: quel modulo usa `??=` proprio
   per lasciare che un chiamante come questo scelga uno storage diverso da
   quello predefinito (`data/`) — qui punto a `restored-data/`. */
const POC_ROOT_LOCAL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.MEM0_HISTORY_DB_PATH = resolve(POC_ROOT_LOCAL, 'restored-data/mem0-history.sqlite');
process.env.MEM0_VECTOR_DB_PATH = resolve(POC_ROOT_LOCAL, 'restored-data/mem0-vectors.sqlite');

const { getMemory } = await import('../lib/setup.mjs');
const { writeResult } = await import('../lib/result.mjs');

const mem = await getMemory();
const results = await mem.search('Come si chiama il mio gatto?', {
  filters: { user_id: 'vinz-poc', agent_id: 'mon-a' },
  topK: 5,
});
const found = JSON.stringify(results).toLowerCase().includes('pixel');

writeResult('test-h2-restore-verify', {
  status: found ? 'PASS' : 'FAIL',
  storageUsato: { history: process.env.MEM0_HISTORY_DB_PATH, vectors: process.env.MEM0_VECTOR_DB_PATH },
  nota: 'directory pulita, copie dei file, processo separato da quello di backup',
  found,
});
