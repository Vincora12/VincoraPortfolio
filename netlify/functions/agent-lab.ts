/* ============================================================================
   AGENT.LAB — PROJECT INSPECTOR (V1)

   🔒 IL CONFINE, SCRITTO NEL CODICE, NON SOLO NEL PROMPT.

     READ ACCESS  → intero progetto (via i tre strumenti di sola lettura
                     sotto — `_shared/agentLabFiles.ts` non espone nessuna
                     funzione di scrittura, quindi non è "quasi impossibile
                     scrivere", è STRUTTURALMENTE impossibile: il codice per
                     farlo non esiste in questo file).
     WRITE ACCESS → esclusivamente presentazionale, e anche lì non è mai una
                     scrittura reale su disco/git: `propose_ui_change` valida
                     meccanicamente (`checkUiOnlyPatch`) che la patch proposta
                     non tocchi logica/dati/backend, e se passa la restituisce
                     come testo pronto da incollare — Agent.lab non ha
                     credenziali GitHub, non fa commit, non fa deploy. Vedi
                     `docs/AGENT_LAB_V1_2026-09-04.md` per il perché di questa
                     scelta (non è un limite tecnico bypassabile: è la
                     decisione presa per non dare a un modello un percorso
                     autonomo di scrittura sul repository in produzione).

   🔷 PERCHÉ UN LOOP QUI E NON `/api/ai` + STRUMENTI LATO BROWSER. Il resto
   dell'app esegue gli strumenti nel browser perché è lì che vivono i dati
   (salute, memoria, pagine) — vedi `src/ai/tools.ts`. Agent.lab lavora sul
   REPOSITORY, che il browser, in produzione, non ha mai visto: leggerlo deve
   succedere qui, dentro la funzione, con lo stesso ciclo
   `chiama → tool_use → esegui → tool_result → richiama` che
   `src/brain/stream.ts` fa lato client per gli strumenti dell'app — stessa
   forma di blocchi (`tool_use`/`tool_result`), stesso `callProvider`
   normalizzato, un solo giro di rete dal browser invece di N.
   ========================================================================= */

import { authorize, denied, json } from './_shared/auth';
import { callProvider, type SystemBlock, type ToolDef, type ToolUse, type Turn, type TurnContent } from './_shared/providers';
import { resolveRoute } from './_shared/routing';
import { checkCap, recordSpend, looksLikeProviderQuota, INTERNAL_CAP_EXCEEDED, PROVIDER_QUOTA_EXCEEDED } from './_shared/spend';
import { appendRuntimeEvent } from './_shared/runtimeLog';
import { checkUiOnlyPatch, listProjectFiles, readProjectFile, searchProjectFiles } from './_shared/agentLabFiles';

const MAX_ROUNDS = 6;
const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY = 20;

interface FlowContext {
  stepId?: string;
  stepLabel?: string;
  stepDetail?: string;
  stepPhase?: string;
}

interface Payload {
  message?: string;
  messages?: { role: 'user' | 'assistant'; text: string }[];
  context?: FlowContext | null;
}

const TOOLS: ToolDef[] = [
  {
    name: 'list_files',
    description: 'Elenca file e cartelle sotto una cartella consentita del progetto (src, netlify, docs). Senza percorso, elenca le radici disponibili.',
    schema: { type: 'object', properties: { path: { type: 'string', description: 'Percorso relativo alla radice del progetto, es. "src/engine".' } } },
  },
  {
    name: 'read_file',
    description: 'Legge il contenuto testuale di un file del progetto (ts, tsx, css, md, json, toml). Usalo dopo list_files o search_files, non a indovinare i percorsi.',
    schema: { type: 'object', properties: { path: { type: 'string', description: 'Percorso relativo alla radice del progetto, es. "src/engine/progression.ts".' } }, required: ['path'] },
  },
  {
    name: 'search_files',
    description: 'Cerca una stringa (case-insensitive) nei file di testo del progetto, opzionalmente sotto una cartella. Usalo per trovare dove vive un concetto prima di leggere un file preciso.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Testo da cercare, almeno due caratteri.' },
        path: { type: 'string', description: 'Limita la ricerca a questa cartella, es. "src/lab".' },
      },
      required: ['query'],
    },
  },
  {
    name: 'export_report',
    description:
      'Prepara un report per essere scaricato come file .txt REALE nel browser di chi sta usando Agent.lab (es. un audit da passare ad Astra). Chiamalo quando l\'utente chiede un file/TXT/report scaricabile. "contenuto" deve essere il report COMPLETO che hai già scritto in chat — titolo, scope, executive summary, capability matrix, findings, evidenze, root cause, raccomandazioni — mai un riassunto più corto.',
    schema: {
      type: 'object',
      properties: {
        titolo: { type: 'string', description: 'Titolo del report, usato anche per nominare il file.' },
        contenuto: { type: 'string', description: 'Il testo COMPLETO del report, autosufficiente e leggibile senza dipendere da questa conversazione.' },
      },
      required: ['titolo', 'contenuto'],
    },
  },
  {
    name: 'propose_ui_change',
    description:
      'Presenta una modifica SOLO presentazionale (CSS, className, JSX di layout) come patch pronta. Chiamalo SOLO dopo aver letto il file reale con read_file, e SOLO se la richiesta non tocca logica, dati, stato applicativo, chiamate di rete o backend. Il server verifica meccanicamente il confine: se la patch tocca qualcos\'altro, la chiamata torna un errore che spiega perché, e in quel caso NON hai una patch da mostrare — spiega invece cosa cambierebbe funzionalmente e fermati, non inventare un\'altra versione.',
    schema: {
      type: 'object',
      properties: {
        target_file: { type: 'string', description: 'Percorso del file da modificare, es. "src/screens/TodayChecklist.tsx".' },
        rationale: { type: 'string', description: 'Perché questa è una modifica solo presentazionale.' },
        patch: { type: 'string', description: 'La patch in formato diff unificato (righe che iniziano con + o -), basata sul contenuto reale letto con read_file.' },
      },
      required: ['target_file', 'rationale', 'patch'],
    },
  },
];

const BOUNDARY_RULES = [
  'Sei AGENT.LAB — PROJECT INSPECTOR: l\'agente tecnico interno di VINZ.MON. Non sei il .mon, non sei il narratore, non sei un assistente di prodotto per l\'utente finale: parli con chi sviluppa o vuole capire come è fatto davvero questo progetto.',
  '',
  'CONFINE — NON NEGOZIABILE:',
  '- READ ACCESS: l\'intero progetto, tramite list_files/read_file/search_files. Usali davvero: non descrivere a memoria come funziona qualcosa, verificalo nel codice reale prima di rispondere. Se una domanda richiede di seguire più file, seguili — non fermarti al primo.',
  '- WRITE ACCESS: esclusivamente presentazionale, e nemmeno quello è una scrittura reale — vedi propose_ui_change. Non hai nessun altro modo di modificare il progetto.',
  '- NON PUOI modificare, né proporre di modificare: business logic, il Generator, la progression, Memory, ME, Insight, voce/persona, la Bio, i prompt AI, l\'AI routing, le API, la persistenza, lo schema dati, lo state management, il comportamento del backend/server, l\'auth, i permessi degli strumenti. Se una richiesta UI implica anche una di queste cose, NON proporre una patch parziale che aggira il confine: spiega quale modifica funzionale servirebbe davvero, e fermati lì.',
  '- Non hai mai accesso a chiavi API, token o segreti. Se il codice che leggi menziona una variabile d\'ambiente, quella riga contiene solo il NOME della variabile — non il suo valore, che non esiste da nessuna parte in questo progetto come testo.',
  '',
  'ESPLICABILITÀ — quando la domanda riguarda "perché" o "da dove viene" un risultato, distingui sempre, con queste etichette esatte fra parentesi quadre:',
  '[DERIVATO DALL\'UTENTE] — quando il codice mostra che il dato viene davvero da segnali/scelte/storia dell\'utente (health, mood, memory, personality, insight, bond, history).',
  '[EREDITATO DAL MON] — quando deriva dalla forma precedente/continuità/heritage/voce/stato precedente della creatura.',
  '[GENERATO/STOCASTICO] — quando deriva da un seed, un campionamento, un resolver, una scelta pesata fra alternative compatibili.',
  '[NON DETERMINABILE] — quando il codice non permette di stabilirlo con certezza. Usa questa etichetta piuttosto che indovinare: non inventare una causalità che il codice non dimostra.',
  '',
  'STILE: rispondi in italiano, diretto, tecnico. Cita percorsi di file reali quando li hai letti. Non hardcodare spiegazioni teoriche di uno step solo perché ne conosci il nome — leggi il codice vero anche quando arrivi già con un contesto.',
  '',
  'AUDIT — quando ti viene chiesto un audit/diagnosi di un sottosistema o dell\'intero VINZ.MON, struttura la risposta come: TITOLO / SCOPE / EXECUTIVE SUMMARY / CAPABILITY MATRIX (capacità, stato EXISTS o PARTIAL o MISSING o BROKEN, evidenza con percorso file reale, rischio, azione consigliata) / DETAILED FINDINGS / ROOT CAUSES / RECOMMENDED NEXT STEPS. Distingui sempre FATTO (verificato con uno strumento) da INFERENZA da RACCOMANDAZIONE. Se una capacità non esiste davvero, dillo chiaramente — non fingere che esista.',
  'EXPORT — se l\'utente chiede il report come file/TXT/qualcosa da passare ad un\'altra AI, dopo aver scritto il report completo in chat chiama export_report con "contenuto" uguale al report COMPLETO (non un riassunto) e un "titolo" breve.',
].join('\n');

/** Esportato solo per `scripts/agent-lab-check.mjs`: verifica offline che il contesto del FLOW arrivi davvero nel prompt, senza dover chiamare il modello. */
export function contextBlock(context?: FlowContext | null): string {
  if (!context || !(context.stepId || context.stepLabel)) return '';
  return [
    '',
    'CONTESTO — questa chat è stata aperta da un nodo del FLOW di CREATION.LAB:',
    context.stepId ? `ID passo: ${context.stepId}` : '',
    context.stepPhase ? `Fase: ${context.stepPhase}` : '',
    context.stepLabel ? `Nome: ${context.stepLabel}` : '',
    context.stepDetail ? `Descrizione dichiarata nel FLOW: ${context.stepDetail}` : '',
    'Questa descrizione è quello che il FLOW dice fare a quel passo — NON darla per buona senza verificarla: usa i tuoi strumenti per leggere il codice reale che lo implementa prima di rispondere a domande su di esso.',
  ]
    .filter(Boolean)
    .join('\n');
}

function assistantTurn(text: string, uses: readonly ToolUse[]): Turn {
  const content: Record<string, unknown>[] = [];
  if (text.trim().length > 0) content.push({ type: 'text', text });
  for (const u of uses) content.push({ type: 'tool_use', id: u.id, name: u.name, input: u.input });
  return { role: 'assistant', content };
}

function resultBlock(id: string, content: string, isError?: boolean): Record<string, unknown> {
  return { type: 'tool_result', tool_use_id: id, content, ...(isError ? { is_error: true } : {}) };
}

/** Nome file sicuro — stessa logica di `src/ai/toolLayer.ts`, duplicata qui
    di proposito: questa funzione non importa mai codice client (vedi la nota
    in testa al file su "loop qui e non /api/ai + strumenti lato browser"). */
function safeFileName(titolo: string): string {
  const base = titolo
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  return `${base || 'report'}.txt`;
}

/** Esegue UN solo strumento — sempre lato server, mai nel browser: qui i dati sono file del progetto, non dati personali.
 *  Esportata anche per `scripts/agent-lab-check.mjs`: verifica il confine di lettura/scrittura senza passare dal modello. */
export function executeTool(use: ToolUse): { id: string; content: string; isError: boolean; exportFile?: { filename: string; content: string } } {
  const input = typeof use.input === 'object' && use.input ? (use.input as Record<string, unknown>) : {};
  try {
    if (use.name === 'export_report') {
      const titolo = typeof input.titolo === 'string' && input.titolo.trim() ? input.titolo.trim() : 'report';
      const contenuto = typeof input.contenuto === 'string' ? input.contenuto : '';
      if (!contenuto.trim()) return { id: use.id, content: 'EXPORT FALLITO — il contenuto del report è vuoto: niente file preparato.', isError: true };
      const filename = safeFileName(titolo);
      return {
        id: use.id,
        content: `File "${filename}" pronto per il download nel browser (${contenuto.length} caratteri reali, non un riassunto).`,
        isError: false,
        exportFile: { filename, content: contenuto },
      };
    }
    if (use.name === 'list_files') {
      const result = listProjectFiles(typeof input.path === 'string' ? input.path : undefined);
      if (!result.ok) return { id: use.id, content: result.error, isError: true };
      return { id: use.id, content: JSON.stringify({ path: result.path, entries: result.entries }), isError: false };
    }
    if (use.name === 'read_file') {
      const path = typeof input.path === 'string' ? input.path : '';
      if (!path) return { id: use.id, content: 'manca "path"', isError: true };
      const result = readProjectFile(path);
      if (!result.ok) return { id: use.id, content: result.error, isError: true };
      return {
        id: use.id,
        content: `${result.path}${result.truncated ? ' (troncato, file più lungo)' : ''}:\n${result.text}`,
        isError: false,
      };
    }
    if (use.name === 'search_files') {
      const query = typeof input.query === 'string' ? input.query : '';
      const path = typeof input.path === 'string' ? input.path : undefined;
      const result = searchProjectFiles(query, path);
      if (!result.ok) return { id: use.id, content: result.error, isError: true };
      const lines = result.matches.map((m) => `${m.path}:${m.line}: ${m.text}`);
      return {
        id: use.id,
        content: lines.length
          ? `${lines.join('\n')}${result.truncated ? '\n(altri risultati esistono, restringi la ricerca)' : ''}`
          : 'nessuna corrispondenza',
        isError: false,
      };
    }
    if (use.name === 'propose_ui_change') {
      const targetFile = typeof input.target_file === 'string' ? input.target_file : '';
      const patch = typeof input.patch === 'string' ? input.patch : '';
      if (!targetFile || !patch) return { id: use.id, content: 'mancano target_file o patch', isError: true };
      const check = checkUiOnlyPatch(targetFile, patch);
      if (!check.ok) {
        return {
          id: use.id,
          content: `PATCH RIFIUTATA — ${check.reason}${check.offendingLine ? ` (riga: ${check.offendingLine})` : ''}. Non presentare questa modifica come applicabile: spiega invece quale cambiamento funzionale servirebbe.`,
          isError: true,
        };
      }
      return {
        id: use.id,
        content: 'Patch validata come solo-presentazionale (nessun hook, stato, rete o import verso logica/backend nelle righe aggiunte). Presentala nella risposta finale come blocco "PATCH PRONTA", con il percorso del file e il diff.',
        isError: false,
      };
    }
    return { id: use.id, content: `strumento sconosciuto: ${use.name}`, isError: true };
  } catch (err) {
    return { id: use.id, content: `strumento fallito: ${String(err)}`, isError: true };
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'solo POST' }, 405);

  const auth = authorize(request);
  if (!auth.ok) {
    console.warn('[agent-lab] richiesta rifiutata:', auth.reason);
    return denied();
  }

  const cap = await checkCap();
  if (cap.blocked) {
    await appendRuntimeEvent({
      eventType: INTERNAL_CAP_EXCEEDED,
      status: 'FAIL',
      scope: 'agent-lab',
      error: `spesa ${cap.ledger.usd.toFixed(4)} $ su un tetto di ${cap.capUsd.toFixed(2)} $ (${cap.capSource})`,
    });
    return json({ error: 'tetto mensile raggiunto', code: INTERNAL_CAP_EXCEEDED, spentUsd: cap.ledger.usd, capUsd: cap.capUsd }, 402);
  }

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return json({ error: 'body non leggibile' }, 400);
  }

  const message = (payload.message ?? '').trim();
  if (!message) return json({ error: 'messaggio vuoto' }, 400);
  if (message.length > MAX_MESSAGE_CHARS) {
    return json({ error: 'messaggio troppo lungo', reason: `${message.length} caratteri contro un tetto di ${MAX_MESSAGE_CHARS}` }, 413);
  }
  const priorMessages = (Array.isArray(payload.messages) ? payload.messages : []).slice(-MAX_HISTORY);

  const route = resolveRoute('prompt-compile');
  const context = contextBlock(payload.context);
  const system: SystemBlock[] = [{ text: BOUNDARY_RULES, cache: true }, ...(context ? [{ text: context }] : [])];

  const history: Turn[] = priorMessages.map((m) => ({ role: m.role, content: m.text }));
  let currentUser = message;
  let userBlocks: Record<string, unknown>[] | undefined;
  let totalCostUsd = 0;
  let lastModel = route.model;
  const toolTrace: { name: string; ok: boolean }[] = [];
  let finalText: string | null = null;
  let exportFile: { filename: string; content: string } | undefined;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const userContent: TurnContent | undefined = userBlocks?.length ? userBlocks : undefined;
    const result = await callProvider(route.provider, {
      model: route.model,
      system,
      turns: history,
      user: userContent ? '' : currentUser,
      ...(userContent ? { userBlocks: userBlocks } : {}),
      tools: round < MAX_ROUNDS - 1 ? TOOLS : [],
      maxTokens: 1800,
      effort: 'low',
    });

    if (result.usage.inputTokens || result.usage.outputTokens) {
      totalCostUsd += await recordSpend('prompt-compile', result.model, result.usage, { action: 'agent-lab', subsystem: 'agent-lab' });
    }
    lastModel = result.model;

    if (!result.ok) {
      const providerQuota = looksLikeProviderQuota(result.error);
      await appendRuntimeEvent({ eventType: providerQuota ? PROVIDER_QUOTA_EXCEEDED : 'AI_CALL_ERROR', status: 'FAIL', scope: 'agent-lab', capability: 'prompt-compile', provider: route.provider, model: result.model, error: result.error });
      return json({ error: 'risposta non disponibile', reason: (result.error ?? '').slice(0, 300), ...(providerQuota ? { code: PROVIDER_QUOTA_EXCEEDED } : {}) }, 502);
    }

    const uses = result.toolUses ?? [];
    if (uses.length === 0) {
      finalText = result.text?.trim() ?? '';
      break;
    }

    if (round === 0 && currentUser) history.push({ role: 'user', content: currentUser });
    if (userBlocks?.length) history.push({ role: 'user', content: userBlocks });
    history.push(assistantTurn(result.text ?? '', uses));

    const results = uses.map((use) => {
      const outcome = executeTool(use);
      toolTrace.push({ name: use.name, ok: !outcome.isError });
      if (outcome.exportFile) exportFile = outcome.exportFile;
      return outcome;
    });
    userBlocks = results.map((r) => resultBlock(r.id, r.content, r.isError));
    currentUser = '';
  }

  if (finalText === null) {
    return json({ error: 'la richiesta ha usato troppi passaggi di lettura — prova a restringerla' }, 502);
  }
  if (!finalText) {
    return json({ error: 'la risposta è arrivata vuota' }, 502);
  }

  return json({
    text: finalText,
    toolTrace,
    model: lastModel,
    costUsd: totalCostUsd,
    warning: cap.warning,
    ...(exportFile ? { exportFile } : {}),
  });
}

export const config = { path: '/api/agent-lab' };
