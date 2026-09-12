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
import { TOOLS } from './tools';

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

/* ============================================================================
   REPO OPS — mani in più sul Mac dove gira VINZ.MON, STESSO loop di sempre

   🔒 STESSO CONFINE DI SOPRA: qui c'è solo nome/descrizione/schema (quello
   che il modello vede) e una chiamata di rete a `/api/repo-ops` (git/npm/log/
   servizi) o `/api/code-tools` (repo_list, che riusa `agentLabFiles.ts`).
   L'esecuzione vera — validazione percorsi, argv mai una stringa di shell,
   allowlist degli script npm — vive server-side in
   `netlify/functions/_shared/repoOps.ts`, dietro `netlify/functions/repo-ops.ts`.

   🔷 SOLO SUL LOCAL CORE. Ogni azione di questa sezione (tranne repo_list,
   che legge la stessa istantanea di code_search/code_read) risponde onestamente
   "non disponibile" quando il backend non è il Mac dove gira il vero
   repository — mai una simulazione, mai un errore generico non spiegato.

   🔒 RIAVVIO A PARTE. `riavvia_servizio_vinzmon` non è nell'elenco eseguibile
   subito: passa dalla STESSA conferma di `registra_peso`/`programma_promemoria`
   (`CONFIRMABLE_ACTIONS` in `brain/stream.ts`) — nome esportato qui perché
   quel registro lo referenzia per nome, non lo duplica. */

export const RESTART_SERVICE_TOOL_NAME = 'riavvia_servizio_vinzmon';

const NPM_SCRIPT_TOOLS: { name: string; script: string; label: string }[] = [
  { name: 'esegui_test', script: 'test', label: 'la suite di test' },
  { name: 'esegui_build', script: 'build', label: 'la build completa (include il typecheck)' },
  { name: 'esegui_typecheck', script: 'typecheck', label: 'il typecheck del frontend' },
  { name: 'esegui_typecheck_funzioni', script: 'typecheck:functions', label: 'il typecheck delle funzioni Netlify' },
];

export const REPO_OPS_TOOL_DEFS: ToolDef[] = [
  {
    name: 'git_status',
    description: 'Mostra lo stato reale del repository (branch corrente, file modificati/non tracciati) — solo quando parli col server sul Mac, mai sulla versione ospitata. Sola lettura.',
    schema: { type: 'object', properties: {} },
  },
  {
    name: 'git_diff',
    description: 'Mostra le modifiche non ancora committate. Senza percorso, un riepilogo di tutti i file cambiati; con percorso, il diff vero di quel file solo. Sola lettura, solo sul Mac.',
    schema: { type: 'object', properties: {
      percorso: { type: 'string', description: 'Percorso relativo al repository di un file, es. "src/brain/stream.ts". Opzionale.' },
    } },
  },
  {
    name: 'git_log',
    description: 'Mostra gli ultimi commit reali (hash breve e oggetto), dal più recente. Sola lettura, solo sul Mac.',
    schema: { type: 'object', properties: {
      limite: { type: 'integer', minimum: 1, maximum: 50, description: 'Quanti commit mostrare. Default 10.' },
    } },
  },
  {
    name: 'git_branch',
    description: 'Dice su quale branch git si trova adesso il repository. Sola lettura, solo sul Mac.',
    schema: { type: 'object', properties: {} },
  },
  {
    name: 'git_show',
    description: 'Mostra il riepilogo (file toccati) di un commit reale dato il suo riferimento (hash, HEAD, HEAD~1...). Sola lettura, solo sul Mac.',
    schema: { type: 'object', properties: {
      riferimento: { type: 'string', description: 'Un riferimento git valido, es. "HEAD", "HEAD~2", o un hash.' },
    }, required: ['riferimento'] },
  },
  {
    name: 'repo_list',
    description: 'Elenca file e cartelle dentro una cartella consentita del repository (src/netlify/docs). Usalo prima di repo_write/repo_edit se non conosci già il percorso esatto. Funziona anche sulla versione ospitata (stessa istantanea di sola lettura di code_search/code_read).',
    schema: { type: 'object', properties: {
      percorso: { type: 'string', description: 'Cartella da elencare, es. "src/brain". Omesso = radici consentite.' },
    } },
  },
  {
    name: 'repo_write',
    description: 'Crea o sovrascrive per intero un file di testo dentro le cartelle consentite del repository (src/netlify/docs) — solo sul Mac, mai sulla versione ospitata. Per una modifica mirata a un file che esiste già preferisci repo_edit: qui il contenuto precedente va perso.',
    schema: { type: 'object', properties: {
      percorso: { type: 'string', description: 'Percorso relativo al repository, es. "docs/note.md".' },
      contenuto: { type: 'string', description: 'Contenuto completo del file.' },
    }, required: ['percorso', 'contenuto'] },
  },
  {
    name: 'repo_edit',
    description: 'Sostituisce UNA porzione esatta e univoca di un file già esistente (come una vera modifica mirata, non una riscrittura). Leggi il file con code_read prima, per copiare il testo esatto da sostituire. Fallisce onestamente se il testo non è univoco. Solo sul Mac.',
    schema: { type: 'object', properties: {
      percorso: { type: 'string', description: 'Percorso relativo al repository del file da modificare.' },
      testo_precedente: { type: 'string', description: 'Il testo esatto, copiato dal file vero, da sostituire — deve comparire una sola volta.' },
      testo_nuovo: { type: 'string', description: 'Il testo che lo sostituisce.' },
    }, required: ['percorso', 'testo_precedente', 'testo_nuovo'] },
  },
  ...NPM_SCRIPT_TOOLS.map((t): ToolDef => ({
    name: t.name,
    description: `Esegue davvero ${t.label} del progetto (npm run ${t.script}) e torna l'esito reale — uscito con successo o con errore, output incluso (troncato se lungo). Solo sul Mac: può richiedere fino a qualche minuto.`,
    schema: { type: 'object', properties: {} },
  })),
  {
    name: 'leggi_log_vinzmon',
    description: 'Legge le ultime righe reali del log del Local Core Server (quello che gira sul Mac) — utile per capire perché qualcosa si è comportato in modo strano lato server. Solo i due log che il servizio scrive davvero, mai un file a scelta. Solo sul Mac.',
    schema: { type: 'object', properties: {
      quale: { type: 'string', enum: ['servizio', 'servizio-errori'], description: 'servizio = log normale; servizio-errori = solo gli errori.' },
    }, required: ['quale'] },
  },
  {
    name: 'stato_servizi_locali',
    description: 'Controlla davvero se Local Core, Mem0 (memoria) e Ollama (modello locale) sono online sul Mac, ed elenca i modelli Ollama scaricati. Sola lettura, solo sul Mac.',
    schema: { type: 'object', properties: {} },
  },
  {
    name: RESTART_SERVICE_TOOL_NAME,
    description: 'Riavvia il servizio Local Core sul Mac (mon.vinz.core). Richiede conferma esplicita dell\'utente prima di essere eseguibile — non chiamarlo finché l\'app non te lo permette. Dopo il riavvio, ricontrolla con stato_servizi_locali: la conferma "è di nuovo online" non è mai immediata.',
    schema: { type: 'object', properties: {} },
  },
];

export const REPO_OPS_TOOL_NAMES = new Set(REPO_OPS_TOOL_DEFS.map((t) => t.name));

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

const ALL_TOOL_LAYER_NAMES = new Set<string>([...CODE_TOOL_NAMES, EXPORT_REPORT_TOOL_NAME, ...REPO_OPS_TOOL_NAMES]);

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
    /* MAIN CHAT — EXPORT TXT FOLLOW-UP (2026-09-06). "SUCCESSO"/"FILE:" in
       testa, in maiuscolo e sulla propria riga: il modello deve poter
       riconoscere l'esito senza ambiguità (non un participio in mezzo a una
       frase) prima di dire "file creato" — vedi l'istruzione gemella in
       `src/brain/stream.ts`. */
    return { id: use.id, content: `SUCCESSO — file scaricato nel browser.\nFILE: ${filename}\nCARATTERI: ${contenuto.length} (il report completo, non un riassunto).` };
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

async function postRepoOps(body: Record<string, unknown>): Promise<Response> {
  const token = toolLayerToken();
  if (!token) throw new Error('nessun token');
  return fetch('/api/repo-ops', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

interface CommandResponse { ok: boolean; stdout: string; truncated: boolean; error?: string }
interface WriteResponse { ok: boolean; error?: string }
interface LogResponse { ok: boolean; text?: string; truncated?: boolean; error?: string }
interface ServicesResponse { ok: boolean; core?: { online: boolean }; mem0?: { online: boolean; llmModel?: string; embedderModel?: string }; ollama?: { online: boolean; models: string[] } }
interface ListResponse { ok: boolean; path?: string; entries?: { name: string; kind: 'file' | 'dir' }[]; error?: string }

/** Il messaggio onesto quando il backend non è il Local Core — la STESSA
    frase che `repo-ops.ts` torna già (503), qui solo per il caso in cui la
    fetch stessa fallisca prima di leggere quel corpo. */
const NOT_LOCAL_CORE = 'ISPEZIONE FALLITA — questi strumenti funzionano solo parlando al server locale sul tuo Mac, non sulla versione ospitata.';

function formatCommandResult(res: CommandResponse, successLabel: string): string {
  const note = res.truncated ? '\n\n[output troncato — più lungo del tetto]' : '';
  if (res.ok) return `${successLabel}\n\n${res.stdout || '(nessun output)'}${note}`;
  return `FALLITO — ${res.error ?? 'errore sconosciuto'}${res.stdout ? `\n\n${res.stdout}${note}` : ''}`;
}

async function callCommandTool(use: ToolUse, body: Record<string, unknown>, successLabel: string): Promise<ToolResult> {
  const response = await postRepoOps(body);
  if (response.status === 503) return { id: use.id, content: NOT_LOCAL_CORE, isError: true };
  if (!response.ok) return { id: use.id, content: `ISPEZIONE FALLITA — il servizio non ha risposto (${response.status}).`, isError: true };
  const res = (await response.json()) as CommandResponse;
  return { id: use.id, content: formatCommandResult(res, successLabel), ...(res.ok ? {} : { isError: true }) };
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

    if (use.name === 'git_status') return await callCommandTool(use, { action: 'git-status' }, 'STATO REPOSITORY');
    if (use.name === 'git_diff') {
      const percorso = typeof args.percorso === 'string' && args.percorso.trim() ? args.percorso.trim() : undefined;
      return await callCommandTool(use, { action: 'git-diff', path: percorso }, percorso ? `DIFF — ${percorso}` : 'RIEPILOGO MODIFICHE');
    }
    if (use.name === 'git_log') {
      const limite = typeof args.limite === 'number' ? args.limite : undefined;
      return await callCommandTool(use, { action: 'git-log', limit: limite }, 'ULTIMI COMMIT');
    }
    if (use.name === 'git_branch') return await callCommandTool(use, { action: 'git-branch' }, 'BRANCH CORRENTE');
    if (use.name === 'git_show') {
      const riferimento = typeof args.riferimento === 'string' ? args.riferimento.trim() : '';
      if (!riferimento) return { id: use.id, content: 'ISPEZIONE FALLITA — manca il riferimento git.', isError: true };
      return await callCommandTool(use, { action: 'git-show', ref: riferimento }, `COMMIT ${riferimento}`);
    }

    if (use.name === 'repo_list') {
      const percorso = typeof args.percorso === 'string' && args.percorso.trim() ? args.percorso.trim() : undefined;
      const response = await postCodeTool({ op: 'list', path: percorso });
      if (!response.ok) return { id: use.id, content: `ISPEZIONE FALLITA — il servizio non ha risposto (${response.status}).`, isError: true };
      const body = (await response.json()) as ListResponse;
      if (!body.ok) return { id: use.id, content: `ISPEZIONE FALLITA — ${body.error ?? 'errore sconosciuto'}`, isError: true };
      const lines = (body.entries ?? []).map((e) => `${e.kind === 'dir' ? '📁' : '📄'} ${e.name}`);
      return { id: use.id, content: `CARTELLA: ${body.path}\n\n${lines.length ? lines.join('\n') : '(vuota)'}` };
    }

    if (use.name === 'repo_write') {
      const percorso = typeof args.percorso === 'string' ? args.percorso.trim() : '';
      const contenuto = typeof args.contenuto === 'string' ? args.contenuto : '';
      if (!percorso) return { id: use.id, content: 'ISPEZIONE FALLITA — manca il percorso del file.', isError: true };
      const response = await postRepoOps({ action: 'repo-write', path: percorso, content: contenuto });
      if (response.status === 503) return { id: use.id, content: NOT_LOCAL_CORE, isError: true };
      if (!response.ok) return { id: use.id, content: `ISPEZIONE FALLITA — il servizio non ha risposto (${response.status}).`, isError: true };
      const res = (await response.json()) as WriteResponse;
      return res.ok
        ? { id: use.id, content: `SCRITTO — ${percorso} (${contenuto.length} caratteri).` }
        : { id: use.id, content: `FALLITO — ${res.error ?? 'errore sconosciuto'}`, isError: true };
    }

    if (use.name === 'repo_edit') {
      const percorso = typeof args.percorso === 'string' ? args.percorso.trim() : '';
      const oldStr = typeof args.testo_precedente === 'string' ? args.testo_precedente : '';
      const newStr = typeof args.testo_nuovo === 'string' ? args.testo_nuovo : '';
      if (!percorso || !oldStr) return { id: use.id, content: 'ISPEZIONE FALLITA — manca il percorso o il testo da sostituire.', isError: true };
      const response = await postRepoOps({ action: 'repo-edit', path: percorso, oldStr, newStr });
      if (response.status === 503) return { id: use.id, content: NOT_LOCAL_CORE, isError: true };
      if (!response.ok) return { id: use.id, content: `ISPEZIONE FALLITA — il servizio non ha risposto (${response.status}).`, isError: true };
      const res = (await response.json()) as WriteResponse;
      return res.ok
        ? { id: use.id, content: `MODIFICATO — ${percorso}.` }
        : { id: use.id, content: `FALLITO — ${res.error ?? 'errore sconosciuto'}`, isError: true };
    }

    const npmTool = NPM_SCRIPT_TOOLS.find((t) => t.name === use.name);
    if (npmTool) return await callCommandTool(use, { action: 'run-npm-script', name: npmTool.script }, `ESEGUITO — ${npmTool.label}`);

    if (use.name === 'leggi_log_vinzmon') {
      const quale = args.quale === 'servizio-errori' ? 'service-error' : 'service';
      const response = await postRepoOps({ action: 'read-logs', which: quale });
      if (response.status === 503) return { id: use.id, content: NOT_LOCAL_CORE, isError: true };
      if (!response.ok) return { id: use.id, content: `ISPEZIONE FALLITA — il servizio non ha risposto (${response.status}).`, isError: true };
      const res = (await response.json()) as LogResponse;
      if (!res.ok) return { id: use.id, content: `ISPEZIONE FALLITA — ${res.error ?? 'errore sconosciuto'}`, isError: true };
      return { id: use.id, content: `LOG (${quale === 'service' ? 'servizio' : 'solo errori'}):\n\n${res.text || '(vuoto)'}${res.truncated ? '\n\n[troncato — solo le ultime righe]' : ''}` };
    }

    if (use.name === 'stato_servizi_locali') {
      const response = await postRepoOps({ action: 'inspect-services' });
      if (response.status === 503) return { id: use.id, content: NOT_LOCAL_CORE, isError: true };
      if (!response.ok) return { id: use.id, content: `ISPEZIONE FALLITA — il servizio non ha risposto (${response.status}).`, isError: true };
      const res = (await response.json()) as ServicesResponse;
      const lines = [
        `Local Core: ${res.core?.online ? 'ONLINE' : 'OFFLINE'}`,
        `Mem0 (memoria): ${res.mem0?.online ? `ONLINE — LLM: ${res.mem0.llmModel ?? '?'}, embedder: ${res.mem0.embedderModel ?? '?'}` : 'OFFLINE'}`,
        `Ollama: ${res.ollama?.online ? `ONLINE — modelli: ${res.ollama.models.join(', ') || '(nessuno)'}` : 'OFFLINE'}`,
      ];
      return { id: use.id, content: lines.join('\n') };
    }

    if (use.name === RESTART_SERVICE_TOOL_NAME) {
      const response = await postRepoOps({ action: 'restart-service' });
      if (response.status === 503) return { id: use.id, content: NOT_LOCAL_CORE, isError: true };
      if (!response.ok) return { id: use.id, content: `ISPEZIONE FALLITA — il servizio non ha risposto (${response.status}).`, isError: true };
      const res = (await response.json()) as { ok: boolean; note?: string };
      return { id: use.id, content: res.ok ? `RIAVVIO AVVIATO — ${res.note ?? 'ricontrolla fra qualche secondo con stato_servizi_locali.'}` : 'FALLITO — riavvio non avviato.', ...(res.ok ? {} : { isError: true }) };
    }

    return undefined;
  } catch {
    /* Rete assente, token mancante, o risposta non JSON: onesto, non inventato. */
    return { id: use.id, content: 'ISPEZIONE FALLITA — impossibile raggiungere il servizio di ispezione del codice in questo momento.', isError: true };
  }
}

/* ============================================================================
   PRODOTTO — VINZ.MON DEVE CONOSCERE LE SUE VERE CAPACITÀ (2026-09-06)

   🔷 «Che strumenti hai?» rispondeva con `web.run` e basta — non perché il
   fornitore lo limiti davvero, ma perché NESSUN percorso (né il BASE della
   chat viva, né il pool a intento del loop strumenti) mette mai una parola
   sulle capacità applicative nel system prompt quando la domanda è proprio
   quella: senza quel testo, il modello risponde con quello che si ricorda
   di essere in generale. Root cause = un'OMISSIONE, non un limite reale.

   🔒 UNA SOLA FONTE, PROIETTATA — non una terza lista scritta a mano. Ogni
   riga qui sotto è condizionata alla presenza REALE del/i tool che descrive
   nei registri veri (`TOOLS` di ai/tools.ts, `CODE_TOOL_DEFS` ed
   `EXPORT_REPORT_TOOL_DEF` di questo stesso file): se un tool sparisse o
   cambiasse nome, la riga corrispondente sparirebbe da sola invece di
   continuare a promettere una capacità che non c'è più.

   ⚠️ CAPACITÀ, NON IMPLEMENTAZIONE (§3C del task): frasi come "posso leggere
   i tuoi dati" o "posso cercare online", mai un nome di funzione tipo
   `leggi_i_miei_dati` o `code_search` — quelli restano dentro gli schema dei
   tool veri, che il modello vede solo quando quel pool è già acceso.

   Questo blocco va aggiunto SEMPRE al system prompt (BASE in
   `netlify-runtime.ts` e il blocco del loop strumenti in `brain/stream.ts`),
   indipendentemente da quale pool di strumenti è attivo per quel turno —
   §3E: la CONSAPEVOLEZZA delle capacità non deve dipendere dall'esecuzione
   di un tool specifico in quel messaggio. È per questo che sta qui, non
   dentro `buildVoiceSystemPrompt` (personalità — non si tocca) né dentro un
   `wantsExport`/`isAudit` condizionale (quelli decidono solo QUALI tool
   caricare in quel turno, non cosa il modello SA di poter fare in generale). */
function hasAllToolNames(names: string[], registry: Set<string>): boolean {
  return names.every((name) => registry.has(name));
}

export function buildCapabilitySummary(webSearchAvailable: boolean): string {
  const registry = new Set<string>([
    ...TOOLS.map((tool) => tool.name),
    ...CODE_TOOL_DEFS.map((tool) => tool.name),
    EXPORT_REPORT_TOOL_NAME,
  ]);
  const lines: string[] = [];

  if (hasAllToolNames(['leggi_i_miei_dati', 'leggi_me'], registry)) {
    lines.push('Posso leggere i dati che hai registrato in ME (pasti, allenamenti, peso, dieta, obiettivi, stato di oggi).');
  }
  if (hasAllToolNames(['registra_pasto', 'registra_allenamento', 'registra_peso'], registry)) {
    lines.push('Posso registrare per te un pasto, un allenamento o il peso quando me lo racconti.');
  }
  if (hasAllToolNames(['imposta_dieta', 'imposta_piano_allenamento', 'imposta_obiettivi_nutrizionali', 'gestisci_me'], registry)) {
    lines.push('Posso aggiornare dieta, piano di allenamento, obiettivi, e gestire liste, note o calendario dentro ME.');
  }
  if (hasAllToolNames(['elenca_le_pagine', 'leggi_una_pagina', 'scrivi_una_pagina', 'aggiorna_una_pagina'], registry)) {
    lines.push("Posso leggere e scrivere pagine dentro l'app.");
  }
  if (hasAllToolNames(['ricorda_di'], registry)) {
    lines.push('Posso impostarti dei promemoria.');
  }
  if (hasAllToolNames([CODE_SEARCH_TOOL_NAME, CODE_READ_TOOL_NAME], registry)) {
    lines.push('Posso ispezionare il mio vero codice sorgente (cercarlo e leggerlo davvero) quando mi chiedi un audit o una verifica tecnica su me stesso.');
  }
  if (hasAllToolNames([EXPORT_REPORT_TOOL_NAME], registry)) {
    lines.push('Posso crearti un vero file .txt scaricabile con un testo, una risposta o un report che mi chiedi.');
  }
  if (hasAllToolNames([...REPO_OPS_TOOL_NAMES], registry)) {
    lines.push('Quando sto girando sul tuo Mac (Local Core) posso anche controllare git, leggere/scrivere file del repository, eseguire test/build/typecheck, leggere i miei log di servizio, controllare se Local Core/Mem0/Ollama sono online, e riavviare il servizio Local Core (solo con la tua conferma esplicita) — sulla versione ospitata queste azioni non sono disponibili, e lo dico invece di far finta.');
  }
  if (webSearchAvailable) {
    lines.push('Posso cercare informazioni sul web quando serve.');
  }
  if (hasAllToolNames(['leggi_calendario_google'], registry)) {
    lines.push('Posso leggere il tuo Google Calendar, Google Drive, Gmail, le note di un vault Obsidian, una cartella iCloud Drive, o un servizio custom — solo se li hai collegati tu in FILES.');
  }
  lines.push('Non ho accesso al tuo computer, al filesystem del tuo dispositivo, a Gmail, o ad altri servizi non elencati qui e non collegati da te in FILES: se me li chiedi, dillo chiaramente invece di far finta di poterlo fare.');

  return [
    '',
    '',
    'LE TUE VERE CAPACITÀ — usa SOLO questo elenco (non quello che ricordi di essere in generale) per rispondere a domande come "che strumenti hai", "cosa puoi fare" o "puoi fare X": descrivile come cose che sai fare in linguaggio naturale, mai come nomi di funzione interni.',
    ...lines.map((line) => `- ${line}`),
  ].join('\n');
}
