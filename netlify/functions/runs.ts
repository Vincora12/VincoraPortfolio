import { authorize, denied, json } from './_shared/auth';
import { cancelRun, executeRun } from './_shared/v2/runEngine';
import { readRun } from './_shared/v2/runStore';
import { canonicalDomains } from './_shared/v2/domains';
import { ensureProjectWorkspace, isLocalCoreServer, listWorkspaceTree } from './_shared/vinzWorkspace';
import { assertHermesWorkspace, forgetHermesSession, hermesConfig, hermesMemoryBoundaryConfirmed, stopHermesRun, streamHermesProjectRun, type HermesVinzEvent } from './_shared/v2/hermesAdapter';
import { sendPushNotification } from './_shared/pushDelivery';
import { assembleContext } from './_shared/v2/contextAssembler';
import { localImages, readImagesLocally } from './_shared/v2/localImageOcr';
import type { ContextWindow, RunProfile, RunRequest } from './_shared/v2/contracts';
import type { Turn } from './_shared/providers';
import { validProjectId } from '../../src/engine/projects';
import { VOICE_CHOICES, type Provider } from './_shared/routing';
import { checkCap, INTERNAL_CAP_EXCEEDED, LOCAL_ONLY_BLOCKED, readLocalOnlyMode, recordSpend } from './_shared/spend';
import { issueHermesActionPermit, type HermesWriteAction } from './_shared/v2/hermesActionPermit';

const PROFILES = new Set<RunProfile>(['chat', 'project-chat', 'lab', 'automation', 'inspection', 'coding']);
const encoder = new TextEncoder();

const HERMES_PROVIDER: Partial<Record<Provider, string>> = {
  openai: 'openai-api',
  anthropic: 'anthropic',
  moonshot: 'kimi-for-coding',
  xai: 'xai',
};

const HERMES_LOCAL_MODELS = new Set(['gpt-oss:20b', 'qwen2.5:14b', 'llama3.2:3b']);

function hermesModel(value: unknown): { model: string; provider: string; cloud: boolean } | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const model = value.trim();
  if (HERMES_LOCAL_MODELS.has(model)) return { model, provider: 'custom', cloud: false };
  const choice = VOICE_CHOICES.find((candidate) => candidate.model === model);
  const provider = choice && HERMES_PROVIDER[choice.provider];
  return choice && provider ? { model: choice.model, provider, cloud: true } : null;
}

function hermesEffort(value: unknown): 'low' | 'medium' | 'high' | undefined {
  return value === 'low' || value === 'medium' || value === 'high' ? value : undefined;
}

function hermesUsage(value: Record<string, number> | undefined) {
  return {
    inputTokens: value?.input_tokens ?? 0,
    outputTokens: value?.output_tokens ?? 0,
    cacheReadTokens: value?.cache_read_tokens ?? 0,
    cacheWriteTokens: value?.cache_write_tokens ?? 0,
  };
}

function localTextFiles(value: unknown): Array<{ filename: string; text: string }> {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 2) throw new Error('HERMES_FILE_INVALID: Sono consentiti al massimo 2 fogli di calcolo.');
  return value.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('HERMES_FILE_INVALID: Allegato non valido.');
    const row = item as { mediaType?: unknown; data?: unknown; filename?: unknown };
    if (row.mediaType !== 'text/plain' || typeof row.data !== 'string' || typeof row.filename !== 'string' || !row.filename.endsWith('.xlsx.txt')) {
      throw new Error('HERMES_FILE_INVALID: Formato allegato non supportato.');
    }
    const bytes = Buffer.from(row.data, 'base64');
    if (!bytes.length || bytes.length > 60_000) throw new Error('HERMES_FILE_INVALID: Allegato vuoto o troppo grande.');
    return { filename: row.filename.slice(0, 180), text: bytes.toString('utf8').replaceAll('\0', '').slice(0, 40_000) };
  });
}

function textTurns(value: unknown): Turn[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-6).flatMap((turn) => {
    if (!turn || typeof turn !== 'object') return [];
    const row = turn as { role?: unknown; content?: unknown };
    if ((row.role !== 'user' && row.role !== 'assistant') || typeof row.content !== 'string') return [];
    return [{ role: row.role, content: row.content.slice(0, 12_000) } satisfies Turn];
  });
}

function hermesUnavailable(message: string, status = 409): Response {
  return json({ error: message, code: message.split(':', 1)[0] }, status);
}

const confirms = (text: string) => /^\s*(?:s[iì]|yes|confermo|ok(?:ay)?|va bene|esatto|corretto|vai(?:\s+(?:pure|inserisci|registra|procedi))?|inserisci|registra|procedi|fallo|segna(?:lo)?)(?=\s|[.!?,;:]|$)/i.test(text);

function verifiedWriteAction(body: Record<string, unknown>, input: string, turns: Turn[]): HermesWriteAction | null {
  if (!confirms(input)) return null;
  const hint = body.actionIntent && typeof body.actionIntent === 'object'
    ? body.actionIntent as { action?: unknown; status?: unknown }
    : null;
  if (hint?.status !== 'confirmed') return null;
  const previous = [...turns].reverse().find((turn) => turn.role === 'assistant');
  const previousText = previous && typeof previous.content === 'string' ? previous.content : '';
  if (hint.action === 'meal' && /Confermi che lo registro come \*\*(?:colazione|spuntino|pranzo|merenda|cena|extra)(?:\s*\/[^*]+)?\*\*\?/i.test(previousText)) return 'meal';
  if (hint.action === 'workout' && /Confermi che registro questo \*\*allenamento\*\* in ME\?/i.test(previousText)) return 'workout';
  if (hint.action === 'weight' && previousText.includes('Confermi che registro questo **peso** in ME?')) return 'weight';
  return null;
}

function actionPolicy(body: Record<string, unknown>, requestId: string, verified: HermesWriteAction | null): string {
  const hint = body.actionIntent && typeof body.actionIntent === 'object'
    ? body.actionIntent as { action?: unknown; status?: unknown; slot?: unknown }
    : null;
  if (verified) {
    const tool = verified === 'meal' ? 'mcp__vinzmon__vinz_registra_pasto' : verified === 'workout' ? 'mcp__vinzmon__vinz_registra_allenamento' : 'mcp__vinzmon__vinz_registra_peso';
    return `VINZ.MON ACTION POLICY: the user explicitly confirmed one ${verified} write. You MUST call ${tool} exactly once, with request_id "${requestId}". Do not claim success unless the tool succeeds. Do not call any other write tool.`;
  }
  if (hint?.status === 'needs-confirmation') {
    const subject = hint.action === 'meal' ? `pasto${typeof hint.slot === 'string' ? ` come ${hint.slot}` : ''}` : hint.action === 'workout' ? 'allenamento' : hint.action === 'weight' ? 'peso' : 'azione';
    return `VINZ.MON ACTION POLICY: a ${subject} was proposed but is NOT authorized. Do not call any write tool and do not say it was saved. Briefly acknowledge or clarify; VINZ.MON will append the exact confirmation question.`;
  }
  return 'VINZ.MON ACTION POLICY: no structured write is authorized in this turn. You may use read-only VINZ.MON tools. Never call a write tool or claim a structured update.';
}

async function hermesStream(body: Record<string, unknown>, request: Request): Promise<Response> {
  let config;
  try { config = hermesConfig(); }
  catch (error) { return hermesUnavailable(error instanceof Error ? error.message : String(error), 503); }
  if (!config) return hermesUnavailable('HERMES_DISABLED: legacy orchestrator is active.');
  if (!hermesMemoryBoundaryConfirmed()) {
    return hermesUnavailable('HERMES_BOUNDARY_UNCONFIRMED: Hermes personal memory/profile must be disabled (VINZMON_HERMES_PERSONAL_MEMORY=off); legacy orchestrator stays active.');
  }
  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  const conversationId = typeof body.conversationId === 'string' ? body.conversationId : '';
  const requestedModel = hermesModel(body.model);
  if (body.model !== undefined && !requestedModel) return hermesUnavailable('HERMES_MODEL_INVALID: scegli un modello configurato in VINZ.MON.', 400);
  /* The model Hermes will really use: the per-run choice, else the configured
     default. Local-only mode, the spending cap and spend recording follow the
     EFFECTIVE model — previously a cloud default slipped past all three. */
  const selectedModel = requestedModel ?? hermesModel(config.model) ?? { model: config.model, provider: 'custom', cloud: !HERMES_LOCAL_MODELS.has(config.model) };
  if (selectedModel.cloud && (await readLocalOnlyMode()).enabled) {
    return json({ error: 'modalità solo-locale attiva — questa richiesta userebbe un modello cloud', code: LOCAL_ONLY_BLOCKED, wouldUseModel: selectedModel.model }, 403);
  }
  if (selectedModel.cloud) {
    const cap = await checkCap();
    if (cap.blocked) return json({ error: 'tetto mensile raggiunto', code: INTERNAL_CAP_EXCEEDED, spentUsd: cap.ledger.usd, capUsd: cap.capUsd, month: cap.ledger.month }, 402);
  }
  let input = typeof body.input === 'string' ? body.input.trim() : '';
  if (!projectId || !conversationId || !input) return hermesUnavailable('HERMES_REQUEST_INVALID: Project, conversation and input are required.', 400);
  const project = await canonicalDomains.project(projectId);
  if (!project) return hermesUnavailable(`HERMES_PROJECT_NOT_FOUND: ${projectId}`, 404);
  const workspaceRoot = await ensureProjectWorkspace(project.id, project.title);
  try { assertHermesWorkspace(config, workspaceRoot); }
  catch (error) { return hermesUnavailable(error instanceof Error ? error.message : String(error)); }
  const turns = textTurns(body.turns);
  let images;
  try { images = localImages(body.images); }
  catch (error) { return hermesUnavailable(error instanceof Error ? error.message : String(error), 400); }
  if (images.length) {
    try {
      const visibleText = await readImagesLocally(images);
      input = `${input}\n\n[TESTO RICONOSCIUTO LOCALMENTE NELLE IMMAGINI ALLEGATE]\n${visibleText}\n[FINE TESTO IMMAGINI]\nUsa questi dati come contenuto dell’allegato. Verifica i calcoli, ma non inventare ciò che l’OCR non ha riconosciuto.`;
    } catch (error) {
      return hermesUnavailable(error instanceof Error ? error.message : String(error), 422);
    }
  }
  let files;
  try { files = localTextFiles(body.files); }
  catch (error) { return hermesUnavailable(error instanceof Error ? error.message : String(error), 400); }
  if (files.length) {
    input += `\n\n[FOGLIO DI CALCOLO ALLEGATO — ESTRATTO LOCALMENTE]\n${files.map((file) => `FILE ${file.filename}:\n${file.text}`).join('\n\n')}\n[FINE FOGLIO ALLEGATO]\nL'originale XLSX è stato salvato nella cartella del progetto. Usa i valori qui sopra e non inventare celle mancanti.`;
  }
  let context;
  try {
    context = await assembleContext(canonicalDomains, {
      query: `Project ${project.title}: ${input}`,
      projectId,
      recentTurns: turns.map((turn) => `${turn.role}: ${typeof turn.content === 'string' ? turn.content : '[structured content]'}`).join('\n'),
      /* Hermes can inspect Project files on demand. A 32k context package
         made the local model ingest ~25k tokens before its first tool call;
         keep the canonical VINZ context focused and let tools fetch detail. */
      windowTokens: 16_000,
      inputBudgetTokens: 6_000,
    });
  } catch (error) {
    return hermesUnavailable(`HERMES_CONTEXT_UNAVAILABLE: ${error instanceof Error ? error.message : String(error)}`, 503);
  }
  const requestId = typeof body.runId === 'string' ? body.runId : crypto.randomUUID();
  const verifiedAction = verifiedWriteAction(body, input, turns);
  if (verifiedAction) await issueHermesActionPermit(requestId, verifiedAction);
  /* Prima del turno: istantanea del workspace. Hermes scrive file dentro la
     sua stessa cartella di lavoro con i suoi strumenti — non passa mai da un
     evento VINZ.MON dedicato — quindi l'unico modo di sapere "ha creato o
     cambiato qualcosa di scaricabile" è confrontare l'albero prima e dopo.
     size come euristica di cambiamento (niente mtime in listWorkspaceTree):
     non coglie una modifica a parità di byte, ma coglie il caso comune —
     file nuovo o contenuto diverso — senza dover fidarsi del nome di un
     tool interno di Hermes, che potrebbe cambiare. */
  const workspaceBefore = new Map((await listWorkspaceTree(workspaceRoot)).filter((entry) => entry.type === 'file').map((entry) => [entry.path, entry.size ?? -1]));
  let activeHermesRunId = '';
  const iterator = streamHermesProjectRun(config, {
    requestId,
    projectId,
    projectName: project.title,
    workspaceRoot,
    conversationId,
    input,
    systemPrompt: context.system.map((block) => block.text).join('\n\n'),
    turns,
    ...(requestedModel ? { model: requestedModel.model, provider: requestedModel.provider } : {}),
    ...(hermesEffort(body.effort) ? { effort: hermesEffort(body.effort) } : {}),
    actionPolicy: actionPolicy(body, requestId, verifiedAction),
  }, request.signal);
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) return controller.close();
        activeHermesRunId = next.value.runId;
        const event = await enrichEvent(next.value);
        notifyIfSettled(event);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      } catch (error) {
        const event: HermesVinzEvent = { type: 'error', runId: activeHermesRunId || requestId, message: error instanceof Error ? error.message : String(error), at: new Date().toISOString() };
        notifyIfSettled(event);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        controller.close();
      }
    },
    async cancel() {
      /* 🔴 QUESTO ERA IL BUG VERO DEL "NON LAVORA IN BACKGROUND". `cancel()`
         scatta ogni volta che la connessione cade — telefono in background,
         rete che salta un istante, niente di deciso dall'utente — perché
         core-server.ts lega `reader.cancel()` alla chiusura TCP (`res.once
         ('close', ...)`), non a un tasto "stop". Mandare `session.interrupt`
         qui significava uccidere DAVVERO il turno Hermes ogni volta che
         l'app usciva dal primo piano: non "il lavoro continua e non lo
         vedi", il lavoro moriva, e il prossimo tentativo ripartiva da zero
         — tempo e calcolo già spesi, buttati.

         La cancellazione VERA (tasto stop dell'utente) passa da un'altra
         strada: `handler()` più sotto, sul POST esplicito
         `{action:'cancel'}` — quello sì chiama stopHermesRun(), perché lì
         l'intenzione è reale. Qui ci si limita a smettere di ASCOLTARE
         nel senso di "buttare le risposte" — ma non si abbandona il turno:
         il Local Core è un processo che resta acceso, non uno che muore a
         ogni richiesta, quindi lo si continua a seguire in background
         (sotto) finché non finisce davvero, solo per poter mandare la
         notifica push al momento giusto. Nessun'altra connessione consuma
         quell'ascolto: è a costo zero per il turno stesso, che Hermes sta
         comunque portando avanti da solo. */
      void drainInBackgroundAfterDisconnect();
    },
  });

  const enrichEvent = async (rawEvent: HermesVinzEvent): Promise<HermesVinzEvent> => {
    let event = rawEvent;
    if (event.type === 'final' && selectedModel.cloud) {
      const costUsd = await recordSpend('character-voice', selectedModel.model, hermesUsage(event.usage), {
        action: 'hermes-project-run',
        subsystem: 'hermes',
      });
      event = { ...event, costUsd };
    }
    if (event.type === 'final') {
      const workspaceAfter = (await listWorkspaceTree(workspaceRoot).catch(() => [])).filter((entry) => entry.type === 'file');
      const changedFiles = workspaceAfter
        .filter((entry) => workspaceBefore.get(entry.path) !== (entry.size ?? -1))
        .slice(0, 5)
        .map((entry) => ({ path: entry.path, size: entry.size ?? 0 }));
      if (changedFiles.length) event = { ...event, files: changedFiles };
    }
    if (event.type === 'context') {
      event = {
        ...event,
        vinz: {
          usedTokens: context.estimatedInputTokens,
          maxTokens: context.windowTokens,
          percent: Math.round((context.estimatedInputTokens / context.windowTokens) * 100),
        },
      };
    }
    return event;
  };

  /* Un turno Hermes locale può durare minuti — iOS sospende la rete di una
     scheda in background molto prima che finisca, quindi "torna a guardare
     da solo" resta inutile se non sai QUANDO tornare. La notifica è quel
     segnale: parte sia sul successo che sull'errore, non condizionata a
     "l'app sembra in background" (non lo sappiamo da qui) — le notifiche in
     questo progetto sono sempre accese per scelta (vedi
     pushNotifications.ts), non opt-in silenzioso. */
  const notifyIfSettled = (event: HermesVinzEvent): void => {
    if (event.type !== 'final' && event.type !== 'error') return;
    void sendPushNotification({
      title: project.title,
      body: event.type === 'final' ? (event.text.slice(0, 140) || 'Risposta pronta.') : `Non riuscito: ${event.message.slice(0, 120)}`,
      url: '/',
      tag: `vinzmon-hermes-${conversationId}`,
    }).catch(() => undefined);
  };

  let draining = false;
  const drainInBackgroundAfterDisconnect = async (): Promise<void> => {
    if (draining) return;
    draining = true;
    try {
      while (true) {
        const next = await iterator.next();
        if (next.done) return;
        activeHermesRunId = next.value.runId;
        const event = await enrichEvent(next.value);
        if (event.type === 'final' || event.type === 'error') {
          notifyIfSettled(event);
          return;
        }
      }
    } catch {
      /* Nessuno resta ad ascoltare un errore qui — non c'è un client a cui
         raccontarlo, e la prossima riconnessione lo scoprirà da sola
         (session.resume torna a running:false, o direttamente fallita). */
    }
  };
  return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' } });
}

export default async function handler(request: Request): Promise<Response> {
  if (!authorize(request).ok) return denied();
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const runId = url.searchParams.get('runId');
    if (!runId) return json({ error: 'runId mancante' }, 400);
    const run = await readRun(runId);
    return run ? json({ run }) : json({ error: 'Run non trovato.' }, 404);
  }
  if (request.method !== 'POST') return json({ error: 'solo GET e POST' }, 405);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return json({ error: 'body non leggibile' }, 400); }
  if (body.action === 'cancel') {
    const runId = typeof body.runId === 'string' ? body.runId : '';
    if (!runId) return json({ error: 'Run non attivo.' }, 404);
    let config = null;
    try { config = hermesConfig(); } catch { /* legacy cancellation remains available */ }
    if (config && await stopHermesRun(config, runId)) return json({ ok: true });
    return cancelRun(runId) ? json({ ok: true }) : json({ error: 'Run non attivo.' }, 404);
  }
  if (body.action === 'hermes-reset-session') {
    /* The "new Hermes session" control: forgets the persisted mapping for
       this conversation so the next turn starts cold instead of resuming an
       ever-growing one. Harmless (a no-op delete) when there was nothing to
       forget — off the Local Core, or before Hermes was ever engaged here. */
    const projectId = typeof body.projectId === 'string' ? body.projectId : '';
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId : '';
    if (!projectId || !conversationId) return json({ error: 'projectId e conversationId richiesti.' }, 400);
    await forgetHermesSession(projectId, conversationId);
    return json({ ok: true });
  }
  /* Hermes nativo gira solo sul Mac (ws://127.0.0.1:9119 è il loopback del Local
     Core, mai quello del sandbox Netlify): il ramo streaming è quindi condizionato
     a isLocalCoreServer(), oltre al profilo e alla richiesta esplicita di stream.
     hermesStream() prepara già da sé context/workspace/permit: nessuna duplicazione
     qui, solo il dispatch. Ogni altro profilo, o Hermes non locale/non configurato,
     resta sul percorso executeRun() esistente. */
  if (body.stream === true && body.profile === 'project-chat' && isLocalCoreServer()) {
    return hermesStream(body, request);
  }
  const input = typeof body.input === 'string' ? body.input.trim() : '';
  const profile = body.profile as RunProfile;
  if (!input || input.length > 12_000 || !PROFILES.has(profile)) return json({ error: 'Run non valido.' }, 400);
  if (body.projectId !== undefined && body.projectId !== null && !validProjectId(body.projectId)) return json({ error: 'projectId non valido.' }, 400);
  const contextWindow: ContextWindow = body.contextWindow === 32_000 ? 32_000 : 16_000;
  const runRequest: RunRequest = {
    profile, input, contextWindow,
    ...(typeof body.runId === 'string' ? { runId: body.runId } : {}),
    ...(typeof body.conversationId === 'string' ? { conversationId: body.conversationId } : {}),
    ...(body.projectId === null || typeof body.projectId === 'string' ? { projectId: body.projectId } : {}),
    ...(typeof body.modelPreference === 'string' ? { modelPreference: body.modelPreference } : {}),
    ...(body.webSearch === true ? { webSearch: true } : {}),
  };
  const result = await executeRun(runRequest);
  return json(result, result.status === 'completed' ? 200 : result.status === 'cancelled' ? 499 : 502);
}

export const config = { path: '/api/runs' };
