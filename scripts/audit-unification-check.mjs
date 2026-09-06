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
   5. FOLLOW-UP 2026-09-06 — "risultati degli strumenti troppo lunghi": il
      budget combinato di un turno (`budgetToolResults`, chat E Agent.lab) e
      la lettura per range di `code_read`/`read_file` (`readProjectFile`).
      Riproduce la combinazione reale che ha fatto fallire il test online
      (due letture piene nello stesso turno) e verifica che ora resti sotto
      il tetto vero del server (`ai.ts`'s `LIMITS.userChars`), MAI in
      silenzio.

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

/* ============================================================================
   5 — FOLLOW-UP 2026-09-06: "risultati degli strumenti troppo lunghi"
   ========================================================================= */
console.log('\n═══ 5 — budget combinato dei tool result + lettura per range ═══\n');
{
  const m = await bundle(
    'budget-tools',
    `export { budgetToolResults, resultBlocks } from '${cwd}/src/ai/tools.ts';`,
  );

  // REGRESSIONE REALE — la combinazione esatta che ha fatto fallire il test
  // online: due code_read pieni (6000 caratteri l'uno, il tetto per-file di
  // agentLabFiles.ts) nello stesso turno. PRIMA di questa correzione, la
  // somma (12000+) superava il tetto del server (`ai.ts`'s LIMITS.userChars
  // = 12000) e l'intero turno falliva con "risultati degli strumenti troppo
  // lunghi" — un errore che non diceva al modello cosa fare diversamente.
  const twoFullFileReads = [
    { id: 't1', content: 'A'.repeat(6000) },
    { id: 't2', content: 'B'.repeat(6000) },
  ];
  const budgeted = m.budgetToolResults(twoFullFileReads);
  const totalAfter = budgeted.reduce((n, r) => n + r.content.length, 0);
  check(totalAfter < 9_500, 'REGRESSIONE — due code_read pieni nello stesso turno restano sotto il budget combinato (9000 + il testo dell\'avviso esplicito)');
  check(budgeted[1].content.includes('ACCORCIATO') || budgeted[1].content.includes('RIMANDATO'), 'il secondo risultato accorciato/rimandato lo dice esplicitamente — mai un troncamento muto');
  check(budgeted[0].content === 'A'.repeat(6000), 'il PRIMO risultato non viene toccato se rientra nel budget (nessuna perdita di qualità quando non serve tagliare)');

  // La stessa combinazione, mandata al server VERO tramite resultBlocks —
  // deve stare sotto il tetto reale di ai.ts (LIMITS.userChars = 12000),
  // non solo sotto il budget "a occhio" di questo file.
  const blocks = m.resultBlocks(twoFullFileReads);
  const serverSideLength = JSON.stringify(blocks).length;
  check(serverSideLength < 12_000, `REGRESSIONE (limite server reale) — JSON.stringify(userBlocks) = ${serverSideLength} caratteri, resta sotto i 12000 di ai.ts's LIMITS.userChars`);

  // Un turno "normale" (risultati piccoli) non deve MAI essere toccato dal
  // budget — questo NON è un abbassamento generale della qualità.
  const smallResults = [{ id: 't1', content: 'Pasto registrato in ME.' }, { id: 't2', content: 'ok' }];
  const untouched = m.budgetToolResults(smallResults);
  check(untouched[0].content === smallResults[0].content && untouched[1].content === smallResults[1].content, 'risultati piccoli (il caso comune) escono IDENTICI — il budget non degrada la chat normale');

  // Tre letture piene (18000 raw) — il budget deve accorciare/rimandare, MAI
  // lanciare un'eccezione o produrre un turno comunque troppo grande.
  const threeFullFileReads = [
    { id: 't1', content: 'A'.repeat(6000) },
    { id: 't2', content: 'B'.repeat(6000) },
    { id: 't3', content: 'C'.repeat(6000) },
  ];
  const threeBudgeted = m.budgetToolResults(threeFullFileReads);
  const threeTotal = threeBudgeted.reduce((n, r) => n + r.content.length, 0);
  check(threeTotal < 10_000, 'tre code_read pieni nello stesso turno restano comunque ben sotto il tetto vero del server (12000)');
  check(threeBudgeted[2].content.includes('RIMANDATO'), 'il terzo risultato, oltre il budget già esaurito dai primi due, viene rimandato esplicitamente al turno successivo');
}
{
  // La stessa correzione, lato Agent.lab (server-side) — implementazione
  // duplicata di proposito (questo file non importa mai codice client), ma
  // stesso comportamento.
  const m = await bundle(
    'budget-tools-agentlab',
    `export { budgetToolResults } from '${cwd}/netlify/functions/agent-lab.ts';`,
  );
  const twoFullFileReads = [
    { id: 't1', content: 'A'.repeat(6000), isError: false },
    { id: 't2', content: 'B'.repeat(6000), isError: false },
  ];
  const budgeted = m.budgetToolResults(twoFullFileReads);
  const total = budgeted.reduce((n, r) => n + r.content.length, 0);
  check(total < 9_500, 'Agent.lab — stessa combinazione, stesso budget rispettato server-side');
  check(budgeted[1].content.includes('ACCORCIATO') || budgeted[1].content.includes('RIMANDATO'), 'Agent.lab — avviso esplicito, non un troncamento muto');
}
{
  // LETTURA PER RANGE — il modello deve poter chiedere solo la sezione che
  // gli serve invece di ricevere sempre l'intero file dall'inizio: verifica
  // contro il filesystem REALE di questo repository (stesso file usato dai
  // controlli G3/G7 di verify:tool-layer).
  const m = await bundle(
    'read-range',
    `export { readProjectFile } from '${cwd}/netlify/functions/_shared/agentLabFiles.ts';`,
  );
  const full = m.readProjectFile('src/engine/progression.ts');
  check(full.ok, 'lettura senza range: comportamento invariato, nessun errore');
  if (full.ok) {
    check(typeof full.totalLines === 'number' && full.totalLines > 0, 'il risultato dichiara sempre il numero totale di righe del file');
    check(typeof full.startLine === 'number' && full.startLine === 1, 'senza range, parte dalla riga 1 come sempre');
  }
  const ranged = m.readProjectFile('src/engine/progression.ts', { startLine: 2, endLine: 5 });
  check(ranged.ok, 'lettura per range: nessun errore su un range valido');
  if (ranged.ok && full.ok) {
    check(ranged.startLine === 2 && ranged.endLine === 5, 'il range richiesto è rispettato esattamente');
    check(ranged.text.split('\n').length <= 4, 'il testo tornato contiene solo le righe richieste, non il file intero');
    check(ranged.totalLines === full.totalLines, 'il totale righe è coerente fra lettura intera e lettura per range (stesso file)');
    check(ranged.truncated === true || ranged.endLine >= full.totalLines, 'una lettura per range che non arriva alla fine del file lo dichiara esplicitamente (truncated), mai in silenzio');
  }
  const beyond = m.readProjectFile('src/engine/progression.ts', { startLine: 999999 });
  check(!beyond.ok, 'chiedere una riga oltre la fine del file torna un errore leggibile, non un crash o un contenuto vuoto scambiato per successo');
}

console.log(`\n${failures === 0 ? 'Tutto coerente.' : `${failures} controllo/i falliti.`}\n`);
process.exit(failures === 0 ? 0 : 1);
