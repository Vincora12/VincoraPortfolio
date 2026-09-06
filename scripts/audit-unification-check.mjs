/* ============================================================================
   VERIFICA OFFLINE — VINZ.MON AUDIT & UNIFICATION

   Quattro livelli, tutti su codice vero (nessun mock che dice sempre
   "successo"):

   1. Riconoscimento dell'intento di AUDIT/EXPORT (`brain/stream.ts`) — le
      frasi ESATTE del task (TEST B/C e gli esempi della Sezione 1).
   2. Lo strumento di export (`ai/toolLayer.ts`) e la sua controparte
      server-side in Agent.lab (`agent-lab.ts`'s `export_report`).
   3. La mappatura OpenAI-compatibile (`_shared/openaiIngress.ts`) — pura,
      senza rete.
   4. Il confine HTTP dei tre endpoint `/v1/*` — auth, metodo, corpo — MAI una
      vera chiamata a un fornitore (nessuna chiave, nessun costo).

   Uso:  node scripts/audit-unification-check.mjs
   ========================================================================= */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'vinz-audit-unification-'));

let failures = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

async function bundle(name, code) {
  const entry = join(dir, `${name}.ts`);
  const out = join(cwd, 'node_modules', `.vinz-audit-unification-${name}.mjs`);
  writeFileSync(entry, code);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error', external: ['@netlify/blobs'] });
  return import(`file://${out}?v=${Date.now()}`);
}

/* ============================================================================
   1 — INTENTO DI AUDIT/EXPORT (brain/stream.ts) — root cause del "non posso"
   ========================================================================= */
console.log('\n═══ 1 — riconoscimento dell\'intento di audit/export (brain/stream.ts) ═══\n');
{
  const m = await bundle(
    'intent',
    `export { isAuditIntent, isExportIntent, shouldUseLocalTools, isCodeInspectionIntent } from '${cwd}/src/brain/stream.ts';`,
  );

  // Le frasi ESATTE della Sezione 1/TEST B/C del task.
  const AUDIT_PHRASES = [
    'Fammi un audit della tua memoria',
    'Controlla il Tool Layer',
    'Audit completo del tuo sistema',
    'Verifica se il runtime agentico sta funzionando',
    'Controlla se la persona viene caricata correttamente',
    'Dimmi cosa manca per essere un vero agent',
    'Audit del ME',
    'Audit del Narrator',
    'Audit completo e dammi un report da passare ad Astra',
    'Fammi un audit del Tool Layer. Controlla realmente il sistema e cita le evidenze.',
    'Audit del runtime agentico.',
  ];
  for (const phrase of AUDIT_PHRASES) {
    check(m.isAuditIntent(phrase), `TEST B/C — riconosciuta come audit: "${phrase}"`);
    check(m.shouldUseLocalTools(phrase), `TEST B/C — entra nel loop strumenti (non più "non posso"): "${phrase}"`);
  }
  // "Guarda nel repository..." resta coperta da CODE_INSPECTION_INTENT, non da AUDIT_INTENT.
  check(m.isCodeInspectionIntent('Guarda nel repository perché questa funzione non va'), 'una domanda tecnica non-audit resta coperta da CODE_INSPECTION_INTENT');

  const EXPORT_PHRASES = [
    'Fammi un audit completo del tuo sistema e dammi un TXT da passare ad Astra.',
    'Esporta questo audit in TXT',
    'Fammi un TXT completo da passare ad Astra',
    'Dammi il report come file',
  ];
  for (const phrase of EXPORT_PHRASES) {
    check(m.isExportIntent(phrase) || m.isAuditIntent(phrase), `TEST C — riconosciuta come richiesta di export: "${phrase}"`);
    check(m.shouldUseLocalTools(phrase), `TEST C — entra nel loop strumenti: "${phrase}"`);
  }

  // Non deve accendersi per la conversazione ordinaria.
  const ORDINARY = ['Come va oggi?', 'Dimmi una battuta', 'Che tempo fa?'];
  for (const phrase of ORDINARY) {
    check(!m.isAuditIntent(phrase), `G — NON è un audit: "${phrase}"`);
  }
}

/* ============================================================================
   2 — EXPORT TOOL — client (ai/toolLayer.ts) e Agent.lab (server-side)
   ========================================================================= */
console.log('\n═══ 2 — esporta_report / export_report ═══\n');
{
  const m = await bundle(
    'export-client',
    `export { EXPORT_REPORT_TOOL_NAME, EXPORT_REPORT_TOOL_DEF, runToolLayerTool } from '${cwd}/src/ai/toolLayer.ts';`,
  );

  // Stub minimo del DOM — solo le tre API che l'idioma di download usa
  // davvero (stesso idioma di `src/dev/MemoryView.tsx`'s `scarica()`), non un
  // browser finto: verifica la LOGICA (nome file, contenuto), non il rendering.
  const clicked = [];
  globalThis.document = {
    createElement: () => ({ set href(_v) {}, set download(v) { this._download = v; }, click() { clicked.push(this._download); }, remove() {} }),
    body: { appendChild() {}, },
  };
  globalThis.URL.createObjectURL = () => 'blob:fake';
  globalThis.URL.revokeObjectURL = () => {};

  const okResult = await m.runToolLayerTool({ id: 't1', name: m.EXPORT_REPORT_TOOL_NAME, input: { titolo: 'Audit Tool Layer', contenuto: 'TITOLO\nSCOPE\n...report vero e completo...' } });
  check(okResult !== undefined && !okResult.isError, 'esporta_report (client) genera un file senza errore');
  check(clicked.includes('audit-tool-layer.txt'), 'esporta_report (client) sceglie un nome file leggibile dal titolo');

  const emptyResult = await m.runToolLayerTool({ id: 't2', name: m.EXPORT_REPORT_TOOL_NAME, input: { titolo: 'x', contenuto: '' } });
  check(emptyResult?.isError === true, 'esporta_report (client) rifiuta un contenuto vuoto invece di scaricare un file vuoto');

  const unrelated = await m.runToolLayerTool({ id: 't3', name: 'leggi_me', input: {} });
  check(unrelated === undefined, 'esporta_report (client) non intercetta strumenti che non gli appartengono');
}
{
  const m = await bundle(
    'export-agentlab',
    `export { executeTool } from '${cwd}/netlify/functions/agent-lab.ts';`,
  );
  const ok = m.executeTool({ id: 't1', name: 'export_report', input: { titolo: 'Audit Runtime Agentico', contenuto: 'report completo vero' } });
  check(!ok.isError, 'export_report (Agent.lab, server-side) prepara il file senza errore');
  check(ok.exportFile?.filename === 'audit-runtime-agentico.txt', 'export_report (Agent.lab) sceglie lo stesso schema di nome file del client');
  check(ok.exportFile?.content === 'report completo vero', 'export_report (Agent.lab) porta il contenuto COMPLETO, non un riassunto');

  const empty = m.executeTool({ id: 't2', name: 'export_report', input: { titolo: 'x', contenuto: '' } });
  check(empty.isError === true && empty.exportFile === undefined, 'export_report (Agent.lab) rifiuta un contenuto vuoto');
}

/* ============================================================================
   3 — MAPPATURA OPENAI-COMPATIBILE (_shared/openaiIngress.ts) — pura
   ========================================================================= */
console.log('\n═══ 3 — mappatura OpenAI-compatibile (_shared/openaiIngress.ts) ═══\n');
{
  const m = await bundle(
    'ingress-map',
    `export { mapMessagesToRequest, mapToolsIn, INGRESS_MODEL_ID } from '${cwd}/netlify/functions/_shared/openaiIngress.ts';`,
  );

  const mapped = m.mapMessagesToRequest([
    { role: 'system', content: 'Sei utile.' },
    { role: 'user', content: 'primo messaggio' },
    { role: 'assistant', content: 'risposta precedente' },
    { role: 'user', content: 'ultimo messaggio' },
  ]);
  check(mapped.system.length === 1 && mapped.system[0].text === 'Sei utile.', 'i messaggi "system" diventano SystemBlock, non un turno');
  check(mapped.user === 'ultimo messaggio', 'l\'ULTIMO messaggio utente diventa "user", non un turno in più');
  check(mapped.turns.length === 2, 'i messaggi precedenti diventano turni di storico');

  const noSystem = m.mapMessagesToRequest([{ role: 'user', content: 'ciao' }]);
  check(noSystem.system.length === 1 && noSystem.system[0].text.includes('VINZ.MON'), 'senza un system esplicito, arriva comunque un system neutro (mai una chiamata senza system)');

  const tools = m.mapToolsIn([{ type: 'function', function: { name: 'get_weather', description: 'd', parameters: { type: 'object' } } }, { type: 'not-a-function' }]);
  check(tools?.length === 1 && tools[0].name === 'get_weather', 'i tool OpenAI (function) vengono mappati, il resto ignorato');
  check(m.mapToolsIn(undefined) === undefined, 'nessun tool in ingresso → undefined, non un array vuoto che accende il ramo strumenti a vuoto');
  check(typeof m.INGRESS_MODEL_ID === 'string' && m.INGRESS_MODEL_ID.length > 0, 'esiste un id di modello logico stabile per l\'ingresso');
}

/* ============================================================================
   4 — CONFINE HTTP DEI TRE ENDPOINT /v1/* — MAI un fornitore vero
   ========================================================================= */
console.log('\n═══ 4 — confine HTTP di /v1/models, /v1/chat/completions, /v1/responses ═══\n');
{
  process.env.VINZMON_TOKEN = 'test-token-almeno-24-caratteri-xy';
  const AUTH = { authorization: `Bearer ${process.env.VINZMON_TOKEN}` };

  const models = await bundle('v1-models', `export { default } from '${cwd}/netlify/functions/v1-models.ts';`);
  const noAuth = await models.default(new Request('https://x/v1/models', { method: 'GET' }));
  check(noAuth.status === 401, '/v1/models senza Authorization → 401');
  const withAuth = await models.default(new Request('https://x/v1/models', { method: 'GET', headers: AUTH }));
  check(withAuth.status === 200, '/v1/models con token corretto → 200');
  const body = await withAuth.json();
  check(body.object === 'list' && Array.isArray(body.data) && typeof body.data[0]?.id === 'string', '/v1/models torna un elenco nel formato OpenAI ({object:"list", data:[...]})');
  const wrongMethod = await models.default(new Request('https://x/v1/models', { method: 'POST', headers: AUTH }));
  check(wrongMethod.status === 405, '/v1/models rifiuta un metodo diverso da GET');

  const chat = await bundle('v1-chat', `export { default } from '${cwd}/netlify/functions/v1-chat-completions.ts';`);
  const chatNoAuth = await chat.default(new Request('https://x/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'x', messages: [{ role: 'user', content: 'ciao' }] }) }));
  check(chatNoAuth.status === 401, '/v1/chat/completions senza Authorization → 401 (mai una chiamata al fornitore senza auth)');
  const chatBadBody = await chat.default(new Request('https://x/v1/chat/completions', { method: 'POST', headers: { ...AUTH, 'content-type': 'application/json' }, body: 'non è json' }));
  check(chatBadBody.status === 400, '/v1/chat/completions rifiuta un corpo non JSON');
  const chatNoMessages = await chat.default(new Request('https://x/v1/chat/completions', { method: 'POST', headers: { ...AUTH, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'x', messages: [] }) }));
  check(chatNoMessages.status === 400, '/v1/chat/completions rifiuta "messages" vuoto');
  const chatWrongMethod = await chat.default(new Request('https://x/v1/chat/completions', { method: 'GET', headers: AUTH }));
  check(chatWrongMethod.status === 405, '/v1/chat/completions rifiuta un metodo diverso da POST');

  const responses = await bundle('v1-responses', `export { default } from '${cwd}/netlify/functions/v1-responses.ts';`);
  const respNoAuth = await responses.default(new Request('https://x/v1/responses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'x', input: 'ciao' }) }));
  check(respNoAuth.status === 401, '/v1/responses senza Authorization → 401');
  const respNoInput = await responses.default(new Request('https://x/v1/responses', { method: 'POST', headers: { ...AUTH, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'x', input: [] }) }));
  check(respNoInput.status === 400, '/v1/responses rifiuta "input" vuoto');
  const respWrongMethod = await responses.default(new Request('https://x/v1/responses', { method: 'GET', headers: AUTH }));
  check(respWrongMethod.status === 405, '/v1/responses rifiuta un metodo diverso da POST');

  // 🔒 Oltre questo punto (auth/metodo/corpo, TUTTI prima di checkCap) il
  // passo successivo dell'handler è `checkCap()`, che in questo ambiente
  // locale non ha Netlify Blobs configurato (vedi `verify:tool-layer`/
  // `verify:agent-lab`, che per lo stesso motivo non invocano MAI l'handler
  // HTTP completo di una funzione con budget). Chiamare l'handler oltre
  // questo punto qui bloccherebbe la verifica invece di provare qualcosa in
  // più: TEST F/G (l'ingresso arriva davvero al Core, non a un runtime
  // finto) vanno rifatti online con VINZMON_TOKEN reale — vedi il report.
}

console.log(`\n${failures === 0 ? 'Tutto coerente.' : `${failures} controllo/i falliti.`}\n`);
process.exit(failures === 0 ? 0 : 1);
