/* ============================================================================
   VINZ.MON TOOL LAYER — PHASE 1 (ispezione tecnica di sola lettura)

   🔷 «VINZ.MON è l'entità. Web, Desktop, House.mon e i client futuri sono
   solo corpi. Deve esistere un unico Core condiviso.» Questo file è quella
   parte condivisa per le capacità TECNICHE (leggere/cercare nel proprio
   codice) — non appartiene alla chat normale né esclusivamente ad Agent.lab:
   entrambi la importeranno dallo stesso posto.

   🔒 CONFINE — SOLA LETTURA, SEMPRE. Nessuna funzione qui dentro scrive un
   file, esegue un comando o tocca git. L'esecuzione vera (validazione dei
   percorsi, lista delle radici consentite, filtro delle estensioni) vive
   server-side in `netlify/functions/_shared/agentLabFiles.ts`, dietro
   `netlify/functions/code-tools.ts` — qui c'è solo la DEFINIZIONE dello
   strumento (nome/descrizione/schema, quello che il modello vede) e una
   chiamata di rete che ne formatta il risultato per la chat. Se l'ispezione
   fallisce, il risultato dice che è fallita — non inventa mai un percorso o
   un contenuto.

   🔷 PERCHÉ NON `ai/tools.ts`. Quel catalogo è legato allo stato applicativo
   di VINZ.MON (salute, ME, pagine, aspetto — vedi `ToolContext`, costruito
   da `state/store.ts`). Le capacità tecniche di questo file non hanno
   bisogno di NESSUNO stato applicativo: sono chiamate di rete pure, quindi
   vivono in un modulo separato che Agent.lab può importare senza tirarsi
   dietro l'intero stato del gioco.
   ========================================================================= */

import type { ToolDef, ToolResult, ToolUse } from './tools';

function toolLayerToken(): string | null {
  try {
    const raw = localStorage.getItem('vinzmon.prototype.v4');
    const parsed = raw ? (JSON.parse(raw) as { state?: { token?: unknown } }) : null;
    return typeof parsed?.state?.token === 'string' ? parsed.state.token : null;
  } catch {
    return null;
  }
}

/** I nomi veri delle capacità (senza punto: molti fornitori di function-calling
    rifiutano un "." nel nome dello strumento — `code.search`/`code.read` restano
    l'identificatore concettuale usato nella documentazione). */
export const CODE_SEARCH_TOOL_NAME = 'code_search';
export const CODE_READ_TOOL_NAME = 'code_read';

export const CODE_TOOL_DEFS: ToolDef[] = [
  {
    name: CODE_SEARCH_TOOL_NAME,
    description:
      'Cerca un testo (nome di funzione, variabile, concetto) nel repository VERO di VINZ.MON — non nella tua memoria. Usalo quando ti chiedono dove è gestita una cosa, se esiste già una funzione, o in quali file compare un termine. Torna percorso, numero di riga e frammento di codice reale: mai un percorso inventato.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Il termine da cercare — almeno due caratteri.' },
        cartella: { type: 'string', description: 'Limita la ricerca a una cartella (es. "src/engine"). Opzionale.' },
      },
      required: ['query'],
    },
  },
  {
    name: CODE_READ_TOOL_NAME,
    description:
      'Legge il contenuto reale di un file del repository VINZ.MON, dato il suo percorso relativo (es. "src/engine/progression.ts"). Usalo dopo code_search per vedere davvero come funziona qualcosa, prima di spiegarlo. Senza da_riga/a_riga legge dall\'inizio fino al tetto di caratteri — per un file lungo, usa da_riga/a_riga per leggere una sezione mirata invece di sperare che stia tutta nelle prime righe. Il risultato dice sempre quante righe ha il file in totale e se c\'è altro da leggere: se dice troncato, richiama code_read con un altro da_riga per continuare. Se il percorso non è valido o il file non esiste, lo strumento lo dice: non inventare mai un contenuto.',
    schema: {
      type: 'object',
      properties: {
        percorso: { type: 'string', description: 'Percorso relativo al repository, es. "src/engine/progression.ts".' },
        da_riga: { type: 'integer', description: 'Riga di inizio (1-based). Opzionale — assente = dall\'inizio del file.' },
        a_riga: { type: 'integer', description: 'Riga di fine (1-based, inclusiva). Opzionale — assente = fino al tetto di caratteri.' },
      },
      required: ['percorso'],
    },
  },
];

export const CODE_TOOL_NAMES = new Set(CODE_TOOL_DEFS.map((t) => t.name));

/* AUDIT & UNIFICATION — l'ultima capacità mancante che il TEST C richiede:
   "fammi un TXT da passare ad Astra" deve produrre un file VERO, scaricabile,
   non un riassunto in chat. Sta qui (non in `ai/tools.ts`) per lo stesso
   motivo di `code_search`/`code_read`: non serve nessuno stato applicativo,
   solo il browser — Agent.lab potrà volerlo esattamente come la chat normale. */
export const EXPORT_REPORT_TOOL_NAME = 'esporta_report';

export const EXPORT_REPORT_TOOL_DEF: ToolDef = {
  name: EXPORT_REPORT_TOOL_NAME,
  description:
    'Genera e scarica DAVVERO un file .txt nel browser dell\'utente, con il contenuto fornito. Usalo quando l\'utente chiede un file/TXT/report scaricabile, o un report "da passare" a un\'altra AI (es. Astra). "contenuto" deve essere il report COMPLETO (titolo, scope, executive summary, capability matrix, findings, evidenze, root cause, raccomandazioni) — mai un riassunto povero, mai più corto di quanto hai già scritto in chat.',
  schema: {
    type: 'object',
    properties: {
      titolo: { type: 'string', description: 'Titolo del report, usato anche per nominare il file.' },
      contenuto: { type: 'string', description: 'Il testo COMPLETO del report, pronto per essere letto o incollato altrove senza dipendere da questa conversazione.' },
    },
    required: ['titolo', 'contenuto'],
  },
};

const ALL_TOOL_LAYER_NAMES = new Set<string>([...CODE_TOOL_NAMES, EXPORT_REPORT_TOOL_NAME]);

/** Nome file sicuro: niente separatori di percorso, niente caratteri che i
    filesystem/browser rifiutano — mai un titolo libero usato alla lettera. */
function safeFileName(titolo: string): string {
  const base = titolo
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  return `${base || 'report'}.txt`;
}

/** Sola scrittura CLIENT-SIDE del browser (un download), mai una scrittura sul
    repository o su un server: stesso confine READ/WRITE di tutto questo file. */
function runExportReportTool(use: ToolUse): ToolResult {
  const args = (use.input ?? {}) as Record<string, unknown>;
  const titolo = typeof args.titolo === 'string' && args.titolo.trim() ? args.titolo.trim() : 'report';
  const contenuto = typeof args.contenuto === 'string' ? args.contenuto : '';
  if (!contenuto.trim()) {
    return { id: use.id, content: 'EXPORT FALLITO — il contenuto del report è vuoto: niente file generato.', isError: true };
  }
  try {
    const filename = safeFileName(titolo);
    const blob = new Blob([contenuto], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { id: use.id, content: `File "${filename}" generato e scaricato nel browser (${contenuto.length} caratteri reali, non un riassunto).` };
  } catch {
    return { id: use.id, content: 'EXPORT FALLITO — il browser non ha permesso di generare il file in questo momento.', isError: true };
  }
}

interface SearchMatch { path: string; line: number; text: string }
type SearchResponse =
  | { ok: true; matches: SearchMatch[]; filesScanned: number; truncated: boolean }
  | { ok: false; error: string };
type ReadResponse =
  | { ok: true; path: string; text: string; truncated: boolean; totalLines: number; startLine: number; endLine: number }
  | { ok: false; error: string };

function formatSearchResult(res: SearchResponse): ToolResult['content'] {
  if (!res.ok) return `ISPEZIONE FALLITA — ${res.error}`;
  if (res.matches.length === 0) return 'Nessun risultato reale trovato nel repository per questa ricerca. Non è un file che manca di essere letto: è che il termine non compare (o non con queste lettere).';
  const lines = res.matches.map((m) => `${m.path}:${m.line} — ${m.text}`);
  const note = res.truncated ? '\n\n(risultati troncati: la ricerca ha trovato più di quanto mostrato qui — restringi a una cartella o a un termine più specifico)' : '';
  return `${res.matches.length} risultato/i reali nel repository:\n\n${lines.join('\n')}${note}`;
}

/* Il modello deve SAPERE quando ha visto solo una parte di un file — mai un
   troncamento muto che gli lascia credere di aver letto tutto. */
function formatReadResult(res: ReadResponse): ToolResult['content'] {
  if (!res.ok) return `ISPEZIONE FALLITA — ${res.error}`;
  const range = `righe ${res.startLine}-${res.endLine} di ${res.totalLines} totali`;
  const note = res.truncated
    ? `\n\n[PARZIALE — ${range}, il file continua oltre questo punto. Richiama code_read con da_riga=${res.endLine + 1} per continuare, o con da_riga/a_riga per una sezione precisa.]`
    : res.totalLines > 1 ? `\n\n[completo — ${range}]` : '';
  return `FILE: ${res.path}\n\n${res.text}${note}`;
}

async function postCodeTool(body: Record<string, unknown>): Promise<Response> {
  const token = toolLayerToken();
  if (!token) throw new Error('nessun token');
  return fetch('/api/code-tools', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

/**
 * Esegue uno strumento del Tool Layer, se `use.name` gli appartiene.
 * Torna `undefined` per qualunque altro strumento — così chi chiama può
 * ricadere sul proprio dispatcher esistente (`runMonTool`) senza duplicare
 * la lista dei nomi altrove.
 *
 * ⚠️ Non lancia MAI per un fallimento dell'ispezione: un percorso rifiutato
 * o un file inesistente tornano un `ToolResult` con `isError:true` e un
 * messaggio onesto, che il modello legge e può raccontare — mai un'eccezione
 * che interrompe il turno, mai un contenuto inventato al posto suo.
 */
export async function runToolLayerTool(use: ToolUse): Promise<ToolResult | undefined> {
  if (!ALL_TOOL_LAYER_NAMES.has(use.name)) return undefined;
  if (use.name === EXPORT_REPORT_TOOL_NAME) return runExportReportTool(use);
  const args = (use.input ?? {}) as Record<string, unknown>;

  try {
    if (use.name === CODE_SEARCH_TOOL_NAME) {
      const query = typeof args.query === 'string' ? args.query : '';
      const path = typeof args.cartella === 'string' && args.cartella.trim() ? args.cartella.trim() : undefined;
      if (query.trim().length < 2) return { id: use.id, content: 'ISPEZIONE FALLITA — la ricerca serve almeno due caratteri.', isError: true };
      const response = await postCodeTool({ op: 'search', query, path });
      if (!response.ok) return { id: use.id, content: `ISPEZIONE FALLITA — il servizio di ricerca non ha risposto (${response.status}).`, isError: true };
      const body = await response.json() as SearchResponse;
      return { id: use.id, content: formatSearchResult(body), ...(body.ok ? {} : { isError: true }) };
    }

    if (use.name === CODE_READ_TOOL_NAME) {
      const path = typeof args.percorso === 'string' ? args.percorso : '';
      if (!path.trim()) return { id: use.id, content: 'ISPEZIONE FALLITA — manca il percorso del file.', isError: true };
      const startLine = typeof args.da_riga === 'number' ? args.da_riga : undefined;
      const endLine = typeof args.a_riga === 'number' ? args.a_riga : undefined;
      const response = await postCodeTool({ op: 'read', path, startLine, endLine });
      if (!response.ok) return { id: use.id, content: `ISPEZIONE FALLITA — il servizio di lettura non ha risposto (${response.status}).`, isError: true };
      const body = await response.json() as ReadResponse;
      return { id: use.id, content: formatReadResult(body), ...(body.ok ? {} : { isError: true }) };
    }

    return undefined;
  } catch {
    /* Rete assente, token mancante, o risposta non JSON: onesto, non inventato. */
    return { id: use.id, content: 'ISPEZIONE FALLITA — impossibile raggiungere il servizio di ispezione del codice in questo momento.', isError: true };
  }
}
