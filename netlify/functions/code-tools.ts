/* ============================================================================
   TOOL LAYER PHASE 1 — code.search / code.read

   🔒 CONFINE. Sola lettura sul repository canonico, nient'altro. Non scrive
   mai un file, non esegue mai un comando, non tocca git, non legge variabili
   d'ambiente o segreti. Riusa `_shared/agentLabFiles.ts` — la STESSA
   validazione di percorso, la STESSA lista di radici consentite, lo STESSO
   filtro di estensioni già costruito (e verificato) per AGENT.LAB V1: questa
   funzione non duplica quella logica, la richiama.

   🔷 PERCHÉ UNA FUNZIONE NUOVA E NON DENTRO `agent-lab.ts`. Agent.lab è un
   loop agentico completo (LLM + strumenti + più round). La chat normale di
   VINZ.MON esegue già i propri strumenti lato client (`src/ai/tools.ts`) e
   ha solo bisogno di UNA chiamata diretta — cerca, oppure leggi — senza un
   secondo giro di modello. Un endpoint sottile e condiviso, che sia la chat
   normale sia (in futuro) Agent.lab possono chiamare, evita di dover montare
   l'intero loop agentico solo per rispondere "quale file gestisce X".

   🔷 DOVE VIVE IL REPOSITORY IN PRODUZIONE. Netlify non permette a una
   funzione di leggere il filesystem sorgente del deploy per conto proprio:
   serve `included_files` (netlify.toml) per copiare una copia di sola
   lettura del repository dentro il pacchetto della funzione — la stessa
   tecnica già usata per `agent-lab`, qui replicata per questa funzione.
   ========================================================================= */

import { authorize, denied, json } from './_shared/auth';
import { appendRuntimeEvent } from './_shared/runtimeLog';
import { readProjectFile, searchProjectFiles } from './_shared/agentLabFiles';

const MAX_QUERY_CHARS = 200;
const MAX_PATH_CHARS = 300;

interface SearchRequest {
  op: 'search';
  query?: unknown;
  path?: unknown;
  maxResults?: unknown;
}
interface ReadRequest {
  op: 'read';
  path?: unknown;
}

function isSearch(body: unknown): body is SearchRequest {
  return typeof body === 'object' && body !== null && (body as { op?: unknown }).op === 'search';
}
function isRead(body: unknown): body is ReadRequest {
  return typeof body === 'object' && body !== null && (body as { op?: unknown }).op === 'read';
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'metodo non valido' }, 405);
  if (!authorize(request).ok) return denied();

  const started = Date.now();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'corpo JSON non valido' }, 400);
  }

  if (isSearch(body)) {
    const query = typeof body.query === 'string' ? body.query.slice(0, MAX_QUERY_CHARS) : '';
    const path = typeof body.path === 'string' ? body.path.slice(0, MAX_PATH_CHARS) : undefined;
    const result = searchProjectFiles(query, path);
    void appendRuntimeEvent({
      eventType: 'TOOL_LAYER_CODE_SEARCH',
      status: result.ok ? 'PASS' : 'FAIL',
      scope: 'chat',
      durationMs: Date.now() - started,
      ...(result.ok ? {} : { error: result.error }),
      metadata: {
        resultCount: result.ok ? result.matches.length : 0,
        ...(path ? { source: path.slice(0, 100) } : {}),
      },
    });
    if (!result.ok) return json({ ok: false, error: result.error }, 200);
    return json({ ok: true, matches: result.matches, filesScanned: result.filesScanned, truncated: result.truncated });
  }

  if (isRead(body)) {
    const path = typeof body.path === 'string' ? body.path.slice(0, MAX_PATH_CHARS) : '';
    const result = readProjectFile(path);
    void appendRuntimeEvent({
      eventType: 'TOOL_LAYER_CODE_READ',
      status: result.ok ? 'PASS' : 'FAIL',
      scope: 'chat',
      durationMs: Date.now() - started,
      ...(result.ok ? {} : { error: result.error }),
      metadata: {
        source: path.slice(0, 100),
        ...(result.ok ? { count: result.text.length } : {}),
      },
    });
    if (!result.ok) return json({ ok: false, error: result.error }, 200);
    return json({ ok: true, path: result.path, text: result.text, truncated: result.truncated });
  }

  return json({ error: 'operazione non valida — usa "search" o "read"' }, 400);
}

export const config = { path: '/api/code-tools' };
