/* ============================================================================
   AMBIENTE ISOLATO DEL POC

   Ogni script di test importa QUESTO file per primo. Fa tre cose, in
   quest'ordine, prima che qualunque altro modulo (incluso mem0ai) venga
   caricato:

   1. Cancella dall'ambiente ogni chiave di provider cloud che potrebbe
      essere presente nella shell che lancia il test — non basta "non
      passarla", va tolta attivamente, perché il requisito del POC è che
      nessuna chiamata possa raggiungere un endpoint esterno anche per
      errore di configurazione.
   2. Punta il servizio Mem0 (lo stesso `services/mem0/dist/server.js` già
      presente nel repository, riutilizzato senza modifiche) su Ollama e su
      due file SQLite ISOLATI dentro questa cartella — mai
      `data/mem0-history.sqlite` / `data/mem0-vectors.sqlite` del progetto
      reale.
   3. Imposta NODE_ENV=test: `server.js` fa partire un server HTTP al solo
      import se NODE_ENV non è 'test' (server.ts:23) — qui si vuole solo la
      funzione `getMemory()`, non un secondo servizio in ascolto sulla
      porta 8788 che potrebbe scontrarsi con quello vero.
   ========================================================================= */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const POC_ROOT = resolve(HERE, '..');

for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'MOONSHOT_API_KEY']) {
  delete process.env[key];
}

process.env.NODE_ENV = 'test';
/* 🔴 TROVATO DURANTE IL POC, NON PRESUNTO: mem0ai OSS manda telemetria
   anonima a PostHog (`us.i.posthog.com`) per default — verificato con
   `lsof` durante un `add()` reale (connessione non-loopback stabilita) e
   confermato nel sorgente (`dist/oss/index.js`: `MEM0_TELEMETRY = true`
   salvo questa variabile a "false", chiave PostHog fissa nel pacchetto).
   Per un POC che deve dimostrare "tutto locale" questa riga non è
   opzionale. */
process.env.MEM0_TELEMETRY = 'false';
process.env.VINZMON_MEMORY_SERVICE_SECRET = 'memory-poc-local-only-not-a-real-secret';
process.env.MEM0_LLM_PROVIDER = 'ollama';
process.env.MEM0_EMBEDDER_PROVIDER = 'ollama';
process.env.MEM0_LLM_MODEL = process.env.MEM0_POC_LLM_MODEL || 'qwen2.5:14b';
process.env.MEM0_EMBEDDER_MODEL = 'nomic-embed-text';
process.env.MEM0_EMBEDDING_DIMS = '768';
process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
/* `??=`: uno script chiamante (es. il test di ripristino, che punta a
   `restored-data/` invece che a `data/`) può fissare questi due PRIMA di
   importare questo modulo per usare uno storage diverso dal predefinito. */
process.env.MEM0_HISTORY_DB_PATH ??= resolve(POC_ROOT, 'data/mem0-history.sqlite');
process.env.MEM0_VECTOR_DB_PATH ??= resolve(POC_ROOT, 'data/mem0-vectors.sqlite');

/** Il modulo compilato reale del servizio — non una riscrittura. */
const serverModule = await import('../../../services/mem0/dist/server.js');
export const getMemory = serverModule.getMemory;
export const validateConfig = serverModule.validateConfig;

export function log(label, data) {
  console.log(`[${new Date().toISOString()}] ${label}`, data !== undefined ? JSON.stringify(data) : '');
}
