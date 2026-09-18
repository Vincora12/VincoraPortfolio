/* TEST G — INDIPENDENZA DAL MODELLO. Processo NUOVO, configurato con un
   modello di GENERAZIONE diverso da quello usato per scrivere i ricordi
   (qwen2.5:14b -> gpt-oss:20b), stesso embedder e stesso storage. Se i
   ricordi scritti prima si trovano lo stesso, la persistenza/ricerca non
   dipende dal modello di generazione — cosa attesa perché search() non
   chiama mai l'LLM (verificato leggendo mem0ai/dist/oss/index.js:17846-
   17910: usa solo l'embedder + il vector store), non solo dichiarata. */
process.env.MEM0_POC_LLM_MODEL = 'gpt-oss:20b';
import { getMemory } from '../lib/setup.mjs';
import { writeResult } from '../lib/result.mjs';

const mem = await getMemory();
const t0 = Date.now();
const results = await mem.search('Come si chiama il mio gatto?', {
  filters: { user_id: 'vinz-poc', agent_id: 'mon-a' },
  topK: 5,
});
const searchMs = Date.now() - t0;

const found = JSON.stringify(results).toLowerCase().includes('pixel');

writeResult('test-g-model-independence', {
  status: found ? 'PASS' : 'FAIL',
  nota: 'ricerca eseguita con MEM0_LLM_MODEL=gpt-oss:20b su ricordi scritti con qwen2.5:14b, stesso embedder (nomic-embed-text) e stesso storage isolato',
  precisazione: 'la ricerca in mem0ai OSS non invoca mai il LLM di generazione: usa solo embedder + vector store. Questo test lo conferma su dati reali, non lo suppone dal codice sorgente da solo.',
  llmModelUsatoPerLaRicerca: 'gpt-oss:20b',
  llmModelUsatoAllaScrittura: 'qwen2.5:14b',
  searchMs,
  found,
});
