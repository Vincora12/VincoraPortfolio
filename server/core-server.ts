import narrativeMaterial from '../netlify/functions/narrative-material';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import agentLab from '../netlify/functions/agent-lab';
import ai from '../netlify/functions/ai';
import aiChatBackground from '../netlify/functions/ai-chat-background';
import aiChatJob from '../netlify/functions/ai-chat-job';
import assets from '../netlify/functions/assets';
import automations from '../netlify/functions/automations';
import brain from '../netlify/functions/brain';
import calendar from '../netlify/functions/calendar';
import codeTools from '../netlify/functions/code-tools';
import culturalDiscovery from '../netlify/functions/cultural-discovery';
import coreContext from '../netlify/functions/core-context';
import evolutionBackground from '../netlify/functions/evolution-background';
import evolutionJob from '../netlify/functions/evolution-job';
import food from '../netlify/functions/food';
import ingest from '../netlify/functions/ingest';
import labDuelBackground from '../netlify/functions/lab-duel-background';
import labDuelJob from '../netlify/functions/lab-duel-job';
import lessons from '../netlify/functions/lessons';
import machines from '../netlify/functions/machines';
import meChatCapture from '../netlify/functions/me-chat-capture';
import meMemory from '../netlify/functions/me-memory';
import meSeed from '../netlify/functions/me-seed';
import ping from '../netlify/functions/ping';
import projects from '../netlify/functions/projects';
import push from '../netlify/functions/push';
import reminderTick from '../netlify/functions/reminder-tick';
import runtimeLog from '../netlify/functions/runtime-log';
import setup from '../netlify/functions/setup';
import shortcut from '../netlify/functions/shortcut';
import shortcutStatus from '../netlify/functions/shortcut-status';
import skills, { syncEnabledSkillsExport } from '../netlify/functions/skills';
import state from '../netlify/functions/state';
import topics from '../netlify/functions/topics';
import transcribe from '../netlify/functions/transcribe';
import usage from '../netlify/functions/usage';
import userData from '../netlify/functions/user-data';
import v1ChatCompletions from '../netlify/functions/v1-chat-completions';
import v1Models from '../netlify/functions/v1-models';
import v1Responses from '../netlify/functions/v1-responses';
import v2Issues from '../netlify/functions/v2-issues';
import { processAutomations } from '../netlify/functions/_shared/automations';
import { processDueMachines } from '../netlify/functions/_shared/machines';
import { resumeIncompleteMemoryV1Captures } from '../netlify/functions/_shared/memoryV1';
import { closeLocalStore, localDatabasePath } from '../netlify/functions/_shared/localStore';
import memoryReset from '../netlify/functions/memory-reset';
import localLlm from '../netlify/functions/local-llm';
import repoOps from '../netlify/functions/repo-ops';
import runs from '../netlify/functions/runs';
import hermesTools from '../netlify/functions/hermes-tools';
import notificationPrefs from '../netlify/functions/notification-prefs';
import vinzWorkspace from '../netlify/functions/vinz-workspace';

type Handler = (request: Request, platform?: { waitUntil(promise: Promise<unknown>): void }) => Promise<Response>;
const APP = 'VINZ.MON';
const VERSION = '1.2.0';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'dist');
const pidFile = join(root, 'data', 'vinzmon.pid');

function loadEnv(): void {
  const path = join(root, '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}
loadEnv();
/* 🔷 «Nella cartella del progetto ho caricato manualmente tutto.» La
   cartella di lavoro (`_shared/vinzWorkspace.ts`) legge/scrive il filesystem
   vero solo qui — su Netlify il processo non gira sul Mac dell'utente, e
   leggerebbe il filesystem effimero del cloud provider. Questa riga è
   l'unico posto che lo dichiara: `isLocalCoreServer()` la legge per
   rifiutare la funzione con un errore chiaro altrove, invece di un
   fallimento silenzioso o — peggio — un percorso letto dal posto sbagliato. */
process.env.VINZMON_LOCAL_CORE = '1';

const handlers: Record<string, Handler> = {
  '/api/agent-lab': agentLab, '/api/ai': ai, '/api/ai-chat-job': aiChatJob, '/api/assets': assets, '/api/brain': brain,
  '/api/automations': automations, '/api/calendar': calendar, '/api/code-tools': codeTools, '/api/core-context': coreContext,
  '/api/narrative-material': narrativeMaterial, '/api/cultural-discovery': culturalDiscovery, '/api/evolution-job': evolutionJob, '/api/food': food, '/api/ingest': ingest,
  '/api/lab-duel-job': labDuelJob, '/api/lessons': lessons, '/api/machines': machines,
  '/api/me-chat-capture': meChatCapture, '/api/me-memory': meMemory, '/api/me-seed': meSeed,
  '/api/ping': ping, '/api/projects': projects, '/api/push': push, '/api/runtime-log': runtimeLog,
  '/api/setup': setup, '/api/shortcut': shortcut, '/api/shortcut-status': shortcutStatus,
  '/api/skills': skills, '/api/state': state, '/api/topics': topics, '/api/transcribe': transcribe, '/api/usage': usage,
  '/api/user-data': userData, '/api/v2-issues': v2Issues,
  '/v1/chat/completions': v1ChatCompletions, '/v1/models': v1Models, '/v1/responses': v1Responses,
};
/* Riga a parte apposta: `server/core-server.ts` è condiviso con lavoro
   concorrente sullo stesso oggetto `handlers` — aggiungerla qui invece che
   dentro la lista evita di intrecciare due modifiche sulla stessa riga. */
handlers['/api/memory-reset'] = memoryReset;
handlers['/api/local-llm'] = localLlm;
handlers['/api/repo-ops'] = repoOps;
handlers['/api/notification-prefs'] = notificationPrefs;
handlers['/api/vinz-workspace'] = vinzWorkspace;
handlers['/api/runs'] = runs;
handlers['/api/hermes-tools'] = hermesTools;

const background: Record<string, (request: Request) => Promise<void>> = {
  '/api/evolution-background': evolutionBackground,
  '/api/lab-duel-background': labDuelBackground,
  '/api/ai-chat-background': aiChatBackground,
};

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

async function body(req: IncomingMessage): Promise<Uint8Array | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk;
    size += bytes.length;
    if (size > 30 * 1024 * 1024) throw new Error('REQUEST_TOO_LARGE');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

async function webRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host || 'localhost';
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
    else if (value !== undefined) headers.set(key, value);
  }
  return new Request(`http://${host}${req.url || '/'}`, { method: req.method, headers, body: await body(req) });
}

async function sendResponse(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (!response.body) return void res.end();
  const reader = response.body.getReader();
  let disconnected = false;
  const cancel = () => {
    disconnected = true;
    void reader.cancel('client disconnected').catch(() => undefined);
  };
  res.once('close', cancel);
  try {
    while (!disconnected) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) {
        await new Promise<void>((done) => {
          const finish = () => {
            res.off('drain', finish);
            res.off('close', finish);
            done();
          };
          res.once('drain', finish);
          res.once('close', finish);
        });
      }
    }
  } finally {
    res.off('close', cancel);
  }
  if (!disconnected) res.end();
}

function serveStatic(pathname: string, res: ServerResponse): void {
  let relative = decodeURIComponent(pathname);
  if (relative === '/lab' || relative.startsWith('/lab/')) relative = '/lab/index.html';
  else if (relative === '/brain' || relative.startsWith('/brain/')) relative = '/brain/index.html';
  else if (relative === '/assistant-example' || relative.startsWith('/assistant-example/')) relative = '/assistant-example/index.html';
  else if (relative === '/') relative = '/index.html';
  const safe = normalize(relative).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/, '');
  let file = join(dist, safe);
  if (!file.startsWith(`${dist}/`) || !existsSync(file) || !statSync(file).isFile()) file = join(dist, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    return void res.end('VINZ.MON has not been built. Run npm run build.');
  }
  res.writeHead(200, {
    'content-type': contentTypes[extname(file)] || 'application/octet-stream',
    'cache-control': file.includes(`${join(dist, 'assets')}/`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-robots-tag': 'noindex, nofollow',
  });
  createReadStream(file).pipe(res);
}

let memoryProcess: ChildProcess | undefined;
let memoryStatus = process.env.VINZMON_MEMORY_WRITER_MODE === 'mem0' ? 'starting' : 'custom-ready';
async function startLocalMem0(): Promise<void> {
  if (process.env.VINZMON_MEMORY_WRITER_MODE !== 'mem0') return;
  /* 🔒 MEMORY V1 (2026-09-17) — senza questo controllo, accendere
     `VINZMON_MEMORY_WRITER_MODE=mem0` da solo (senza impostare ANCHE
     MEM0_LLM_PROVIDER/MEM0_EMBEDDER_PROVIDER) faceva ripiegare `mem0ai` sul
     provider 'openai' di default (verificato in `services/mem0/server.ts`),
     e le due righe qui sotto passavano la vera OPENAI_API_KEY del progetto
     al processo — un ripiego cloud silenzioso proprio per i ricordi
     personali, il contrario di quanto richiesto per Memory V1. Si rifiuta
     di partire piuttosto che rischiarlo. */
  if (process.env.MEM0_LLM_PROVIDER !== 'ollama' || process.env.MEM0_EMBEDDER_PROVIDER !== 'ollama') {
    throw new Error('VINZMON_MEMORY_WRITER_MODE=mem0 richiede MEM0_LLM_PROVIDER=ollama e MEM0_EMBEDDER_PROVIDER=ollama — rifiutato per non rischiare un ripiego cloud silenzioso sui ricordi personali.');
  }
  process.env.VINZMON_MEMORY_SERVICE_URL ||= 'http://127.0.0.1:8788';
  process.env.VINZMON_MEMORY_SERVICE_SECRET ||= process.env.VINZMON_TOKEN;
  const secret = process.env.VINZMON_MEMORY_SERVICE_SECRET;
  if (!secret || secret.length < 24) throw new Error('Mem0 requires VINZMON_MEMORY_SERVICE_SECRET or VINZMON_TOKEN (24+ characters).');
  const env = {
    ...process.env,
    VINZMON_MEMORY_SERVICE_SECRET: secret,
    MEM0_TELEMETRY: process.env.MEM0_TELEMETRY ?? 'false',
    MEM0_HISTORY_DB_PATH: resolve(process.env.VINZMON_DATA_DIR || join(root, 'data'), 'mem0-history.sqlite'),
    MEM0_VECTOR_DB_PATH: resolve(process.env.VINZMON_DATA_DIR || join(root, 'data'), 'mem0-vectors.sqlite'),
    HOST: '127.0.0.1', PORT: '8788',
    /* Ollama non usa una API key: niente più ripiego su OPENAI_API_KEY qui. */
    MEM0_LLM_API_KEY: '',
    MEM0_EMBEDDER_API_KEY: '',
  };
  memoryProcess = spawn(process.execPath, [join(root, 'services/mem0/dist/server.js')], { cwd: join(root, 'services/mem0'), env, stdio: 'inherit' });
  memoryProcess.once('exit', () => { memoryStatus = 'stopped'; });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((done) => setTimeout(done, 250));
    try {
      const response = await fetch(`${process.env.VINZMON_MEMORY_SERVICE_URL}/health`);
      if (response.ok) { memoryStatus = 'ready'; return; }
    } catch { /* still starting */ }
    if (memoryProcess.exitCode !== null) break;
  }
  memoryProcess.kill('SIGTERM');
  throw new Error('Local Mem0 failed to start. Check the provider configuration above.');
}

let schedulerStatus = 'starting';
async function runScheduler(): Promise<void> {
  try {
    await reminderTick();
    /* 🔷 LE AUTOMAZIONI GIRANO SULLO STESSO BATTITO. Nessun secondo timer da
       tenere vivo: il tick che c'era già per i promemoria ora raccoglie anche
       le automazioni scadute. Se una fallisce non deve spegnere lo scheduler,
       quindi l'errore muore qui dentro. */
    try { await processAutomations(); }
    catch (error) { console.warn('[automations] esecuzione non riuscita', error); }
    /* Le macchine di THINK sullo stesso battito: il loro trigger dichiarato
       diceva «esecuzione esplicita o batch futuro», e questo è il batch. */
    try { await processDueMachines(); }
    catch (error) { console.warn('[machines] esecuzione non riuscita', error); }
    /* MEMORY V1 — riprende catture rimaste a metà (processo morto durante
       una scrittura). No-op quando il flag è spento (`isMemoryV1Enabled()`
       torna false), quindi sicuro da lasciare sempre nel battito. */
    try { await resumeIncompleteMemoryV1Captures(); }
    catch (error) { console.warn('[memory-v1] ripresa non riuscita', error); }
    schedulerStatus = 'ready';
  }
  catch { schedulerStatus = 'error'; }
}

const server = createServer(async (req, res) => {
  try {
    const parsed = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (parsed.pathname === '/health') {
      const status = memoryStatus === 'stopped' || schedulerStatus === 'error' ? 'degraded' : 'ok';
      return void sendResponse(new Response(JSON.stringify({ status, app: APP, version: VERSION, storage: existsSync(localDatabasePath()) ? 'ready' : 'initializing', memory: memoryStatus, scheduler: schedulerStatus }), { status: status === 'ok' ? 200 : 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }), res);
    }
    const request = await webRequest(req);
    const handler = handlers[parsed.pathname];
    if (handler) {
      const platform = { waitUntil(promise: Promise<unknown>) { void promise.catch((error) => console.warn('[background]', error instanceof Error ? error.message : 'failed')); } };
      return void await sendResponse(await handler(request, platform), res);
    }
    const task = background[parsed.pathname];
    if (task) {
      void task(request).catch((error) => console.warn('[background]', error instanceof Error ? error.message : 'failed'));
      return void await sendResponse(new Response(JSON.stringify({ accepted: true }), { status: 202, headers: { 'content-type': 'application/json' } }), res);
    }
    serveStatic(parsed.pathname, res);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === 'REQUEST_TOO_LARGE';
    console.error('[core]', error instanceof Error ? error.message : error);
    res.writeHead(tooLarge ? 413 : 500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: tooLarge ? 'request_too_large' : 'internal_error' }));
  }
});

async function shutdown(signal: string): Promise<void> {
  console.info(`[core] ${signal}; stopping`);
  clearInterval(scheduler);
  memoryProcess?.kill('SIGTERM');
  server.close(() => {
    closeLocalStore();
    try { unlinkSync(pidFile); } catch { /* absent */ }
    process.exit(0);
  });
}

await startLocalMem0();
/* vNext safety gate: CEREBRO (Hermes) reads skills only from the enabled-only
   mirror; rebuild it at boot so a disabled skill never survives a restart there. */
try { syncEnabledSkillsExport(); } catch (error) { console.warn('[skills] export per CEREBRO non riuscito', error); }
await runScheduler();
const schedulerInterval = Math.max(1_000, Number(process.env.VINZMON_SCHEDULER_INTERVAL_MS || 60_000));
const scheduler = setInterval(() => void runScheduler(), schedulerInterval);
const port = Number(process.env.PORT || 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(error.code === 'EADDRINUSE' ? `[core] Port ${port} is already in use.` : '[core] Server failed:', error.message);
  process.exitCode = 1;
});
server.listen(port, '0.0.0.0', () => {
  mkdirSync(join(root, 'data'), { recursive: true, mode: 0o700 });
  writeFileSync(pidFile, String(process.pid), { mode: 0o600 });
  console.info(`[core] ${APP} ${VERSION} ready at http://localhost:${port} (listening on 0.0.0.0)`);
});
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
