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

  /* PRODOTTO — FILE TXT SCARICABILI (2026-09-06), FIX 1D: le frasi ESATTE del
     task, richieste dirette e generiche (non un audit già in corso). Prima
     di questa correzione cadevano nel percorso BASE, senza `esporta_report`
     disponibile — root cause del "non ho uno strumento per creare un file". */
  const GENERIC_TXT_PHRASES = [
    'Creami un txt con scritto ciao',
    'Salvami questa risposta come audit_tool_layer.txt',
    'Fammi un file txt con questo testo lungo',
    'Creami un file chiamato appunti', // FIX 1D — senza estensione esplicita
  ];
  for (const phrase of GENERIC_TXT_PHRASES) {
    check(m.isExportIntent(phrase), `FIX 1D — riconosciuta come richiesta diretta di file: "${phrase}"`);
    check(m.shouldUseLocalTools(phrase), `FIX 1D — entra nel loop strumenti (esporta_report disponibile): "${phrase}"`);
  }
  // Non deve accendersi per un "crea" che è in realtà un'altra scrittura tipizzata.
  check(!m.isExportIntent('Crea un piano di allenamento per lunedì'), 'FIX 1D — "crea un piano" NON è confuso con una richiesta di file');

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
  check(okResult.content.startsWith('SUCCESSO') && okResult.content.includes('FILE: audit-tool-layer.txt'), 'MAIN CHAT — EXPORT TXT: il ToolResult conferma successo + filename in un formato inequivocabile (SUCCESSO/FILE:), non una frase generica');

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
  check(ok.content.startsWith('SUCCESSO') && ok.content.includes('FILE: audit-runtime-agentico.txt'), 'export_report (Agent.lab) — stesso formato inequivocabile SUCCESSO/FILE:');

  const empty = m.executeTool({ id: 't2', name: 'export_report', input: { titolo: 'x', contenuto: '' } });
  check(empty.isError === true && empty.exportFile === undefined, 'export_report (Agent.lab) rifiuta un contenuto vuoto');
}

/* ============================================================================
   2bis — MAIN CHAT · EXPORT TXT FOLLOW-UP: la conferma di esporta_report
   sopravvive al budget di turno anche accanto a una lettura grande
   ========================================================================= */
console.log('\n═══ 2bis — la conferma di export sopravvive al budget di turno ═══\n');
{
  const m = await bundle(
    'export-vs-budget',
    `export { budgetToolResults } from '${cwd}/src/ai/tools.ts';`,
  );

  // REGRESSIONE REALE (segnalata online, 2026-09-06): un audit che legge un
  // file grande e POI chiama esporta_report nello stesso turno vedeva la
  // conferma dell'export accorciata/rimandata dal budget combinato — il MON
  // diceva "non ricevo il risultato operativo" pur avendo davvero scaricato
  // il file. La conferma (sempre corta) non deve MAI essere toccata dal
  // budget, indipendentemente da quanto grande sia il risultato che la
  // precede nello stesso turno.
  const exportConfirmation = 'SUCCESSO — file scaricato nel browser.\nFILE: audit-tool-layer.txt\nCARATTERI: 9000 (il report completo, non un riassunto).';
  const roundWithExportLast = [
    { id: 't1', content: 'A'.repeat(9000) }, // un code_read grande, PRIMA
    { id: 't2', content: exportConfirmation }, // esporta_report, DOPO — il budget è già a zero qui
  ];
  const budgetedLast = m.budgetToolResults(roundWithExportLast);
  check(budgetedLast[1].content === exportConfirmation, 'REGRESSIONE — la conferma di esporta_report NON viene mai accorciata/rimandata, anche quando arriva dopo un risultato che ha già esaurito il budget');
  check(budgetedLast[1].content.startsWith('SUCCESSO') && budgetedLast[1].content.includes('FILE:'), 'la conferma sopravvissuta resta nel formato SUCCESSO/FILE: che il modello deve leggere per dire "file creato"');

  // Stesso scenario con l'export PRIMA (ordine diverso, deve funzionare comunque).
  const roundWithExportFirst = [
    { id: 't1', content: exportConfirmation },
    { id: 't2', content: 'B'.repeat(9000) },
  ];
  const budgetedFirst = m.budgetToolResults(roundWithExportFirst);
  check(budgetedFirst[0].content === exportConfirmation, 'la conferma di esporta_report sopravvive anche quando è il PRIMO risultato del turno');
}
{
  const m = await bundle(
    'export-vs-budget-agentlab',
    `export { budgetToolResults } from '${cwd}/netlify/functions/agent-lab.ts';`,
  );
  const exportConfirmation = 'SUCCESSO — file pronto per il download nel browser.\nFILE: audit.txt\nCARATTERI: 9000 (il report completo, non un riassunto).';
  const round = [
    { id: 't1', content: 'A'.repeat(9000), isError: false },
    { id: 't2', content: exportConfirmation, isError: false },
  ];
  const budgeted = m.budgetToolResults(round);
  check(budgeted[1].content === exportConfirmation, 'Agent.lab — stessa regressione, stessa protezione: export_report non viene mai accorciato/rimandato dal budget');
}

/* ============================================================================
   2ter — FIX 1: TXT SCARICABILI DA RICHIESTE GENERICHE — il tool stesso
   (2026-09-06). L'intent detection sopra decide QUANDO offrire lo strumento;
   qui si verifica che lo strumento stesso rispetti i requisiti del task:
   nome file mai scelto liberamente dal modello, nessuna traversal, UTF-8,
   contenuto grande supportato, nessun falso successo.
   ========================================================================= */
console.log('\n═══ 2ter — FIX 1: nome file sicuro, contenuto grande, fallimento onesto ═══\n');
{
  const m = await bundle(
    'export-fix1',
    `export { EXPORT_REPORT_TOOL_NAME, runToolLayerTool } from '${cwd}/src/ai/toolLayer.ts';`,
  );

  const clicked = [];
  let createObjectURLCalls = 0;
  globalThis.document = {
    createElement: () => ({ set href(_v) {}, set download(v) { this._download = v; }, click() { clicked.push(this._download); }, remove() {} }),
    body: { appendChild() {} },
  };
  globalThis.URL.createObjectURL = () => { createObjectURLCalls += 1; return 'blob:fake'; };
  globalThis.URL.revokeObjectURL = () => {};

  // Percorso/caratteri non sicuri nel titolo: mai usato alla lettera, mai una
  // traversal, sempre .txt — il modello non sceglie MAI un percorso reale.
  const traversal = await m.runToolLayerTool({ id: 't1', name: m.EXPORT_REPORT_TOOL_NAME, input: { titolo: '../../etc/passwd', contenuto: 'ciao' } });
  check(!traversal.isError, 'FIX 1B — un titolo con caratteri di percorso non fa fallire l\'export (viene sanificato, non rifiutato)');
  check(!clicked.at(-1)?.includes('/') && !clicked.at(-1)?.includes('..'), 'FIX 1B — nessuna traversal: il nome file scaricato non contiene "/" né "..' + '"', clicked.at(-1));
  check(clicked.at(-1)?.endsWith('.txt'), 'FIX 1B — estensione .txt sempre garantita anche con un titolo "malevolo"');

  const scriptTitle = await m.runToolLayerTool({ id: 't2', name: m.EXPORT_REPORT_TOOL_NAME, input: { titolo: '<script>alert(1)</script>.exe', contenuto: 'ciao' } });
  check(!scriptTitle.isError, 'FIX 1B — un titolo con markup/estensione eseguibile non fa fallire l\'export');
  check(/^[a-z0-9-]+\.txt$/.test(clicked.at(-1) ?? ''), 'FIX 1B — il nome file scaricato è ridotto a caratteri sicuri + .txt, mai ".exe" o markup', clicked.at(-1));

  // Nome file mancante/vuoto: fallback onesto, mai un file senza nome.
  const noTitle = await m.runToolLayerTool({ id: 't3', name: m.EXPORT_REPORT_TOOL_NAME, input: { titolo: '', contenuto: 'ciao' } });
  check(!noTitle.isError && clicked.at(-1) === 'report.txt', 'FIX 1B — titolo vuoto usa un nome di fallback leggibile, non un file senza nome');

  // Contenuto grande: nessun tetto artificiale nel tool stesso (il budget dei
  // tool_result nel loop chat è un'altra cosa — vedi §5 sopra — questa è
  // esattamente la generazione del file).
  const big = 'Riga di report molto lunga con dettagli veri. '.repeat(4000); // ~47.000 caratteri
  const bigResult = await m.runToolLayerTool({ id: 't4', name: m.EXPORT_REPORT_TOOL_NAME, input: { titolo: 'report grande', contenuto: big } });
  check(!bigResult.isError, 'FIX 1B — un contenuto grande (~47.000 caratteri) genera comunque il file, nessun tetto artificiale');
  check(bigResult.content.includes(`CARATTERI: ${big.length}`), 'FIX 1B — il ToolResult dichiara la lunghezza reale del contenuto scaricato, non una stima');

  // Fallimento vero del browser: mai un "successo" finto.
  const savedCreateElement = globalThis.document.createElement;
  globalThis.document.createElement = () => { throw new Error('DOM non disponibile in questo momento'); };
  const failed = await m.runToolLayerTool({ id: 't5', name: m.EXPORT_REPORT_TOOL_NAME, input: { titolo: 'x', contenuto: 'ciao' } });
  check(failed?.isError === true && failed.content.startsWith('EXPORT FALLITO'), 'FIX 1B — un fallimento reale del browser torna EXPORT FALLITO, mai un SUCCESSO finto');
  globalThis.document.createElement = savedCreateElement;

  check(createObjectURLCalls === 5, 'ogni chiamata riuscita ha davvero generato un blob (nessuna simulazione muta)', `${createObjectURLCalls}`);
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

/* ============================================================================
   6 — FIX 3 (2026-09-06): VINZ.MON CONOSCE LE SUE VERE CAPACITÀ

   Root cause reale: "Che strumenti hai?"/"Cosa puoi fare?" non toccano
   NESSUN intento sopra (non è un audit, non è una richiesta di dati) e
   cadevano nel BASE senza nessuna descrizione delle capacità applicative —
   il modello rispondeva con quello che si ricorda di sé (web.run), non con
   quello che VINZ.MON sa fare davvero. Qui si verifica `buildCapabilitySummary`
   (la fonte unica, proiettata dai registri veri — TOOLS/CODE_TOOL_DEFS/
   EXPORT_REPORT_TOOL_DEF) e che sia davvero cablata nei due percorso che
   costruiscono il system prompt (BASE e loop strumenti).
   ========================================================================= */
console.log('\n═══ 6 — FIX 3: capacità reali, non "web.run e basta" ═══\n');
{
  const m = await bundle(
    'capability-summary',
    `export { buildCapabilitySummary } from '${cwd}/src/ai/toolLayer.ts';`,
  );

  const withWebSearch = m.buildCapabilitySummary(true);
  const withoutWebSearch = m.buildCapabilitySummary(false);

  // §3C — capacità in linguaggio naturale, MAI nomi di funzione interni.
  const INTERNAL_NAMES = ['leggi_i_miei_dati', 'leggi_me', 'code_search', 'code_read', 'esporta_report', 'gestisci_me'];
  for (const name of INTERNAL_NAMES) {
    check(!withWebSearch.includes(name), `FIX 3C — il riassunto non nomina l'implementazione interna "${name}"`);
  }

  // §3F — dopo FIX 1+FIX 3, "posso creare un file" deve essere dichiarato:
  // niente stato in cui VINZ.MON ha `esporta_report` ma dice di non poterlo fare.
  check(/file\s+\.txt|txt.*scaricabile|file.*scaricabile/i.test(withWebSearch), 'FIX 3F — la creazione di un file .txt scaricabile è dichiarata come capacità reale');
  check(/dat[ei].*ME|ME.*(?:pasti|dati)/i.test(withWebSearch), 'la lettura dei dati registrati in ME è dichiarata');
  check(/codice sorgente|ispezionare/i.test(withWebSearch), 'l\'ispezione del codice sorgente reale è dichiarata (per un audit tecnico)');

  // §3D — provider-dependent: la ricerca web è runtime-aware, non sempre "sì".
  check(/cercare.*web|web.*cercare/i.test(withWebSearch), 'con un fornitore che la supporta, la ricerca web è dichiarata disponibile');
  check(!/cercare.*informazioni sul web quando serve/i.test(withoutWebSearch), 'FIX 3D — senza un fornitore che la supporta, la ricerca web NON viene dichiarata disponibile');

  // §3D/§3F — non deve MAI rivendicare capacità che non esistono in questa
  // sessione: computer/filesystem del dispositivo, Gmail, calendario esterno.
  check(/non ho accesso.*(?:computer|filesystem)/i.test(withWebSearch), 'FIX 3D — il controllo del computer/filesystem dell\'utente è dichiarato NON disponibile, non ignorato in silenzio');
  check(/gmail/i.test(withWebSearch) && /non ho accesso/i.test(withWebSearch), 'FIX 3D — Gmail è esplicitamente dichiarato non connesso, mai rivendicato');
  check(/calendario esterno/i.test(withWebSearch), 'FIX 3D — un calendario esterno è esplicitamente dichiarato non connesso');

  // Deterministica: stesso input, stesso output — nessuna casualità nel
  // riassunto delle capacità (il modello deve poter fare affidamento sempre
  // sulla stessa descrizione).
  check(m.buildCapabilitySummary(true) === withWebSearch, 'il riassunto delle capacità è deterministico, non varia fra due chiamate identiche');

  // ⚠️ CABLAGGIO REALE — non basta che la funzione esista: deve essere
  // davvero chiamata nei due percorsi che costruiscono il system prompt.
  // Un controllo testuale sul sorgente, come già fa questo file altrove
  // (FORBIDDEN_EVENTS in batch-check.mjs) per una wiring-regression che un
  // test puramente funzionale non potrebbe cogliere (import mai usato).
  const { readFileSync } = await import('node:fs');
  const baseSrc = readFileSync(new URL('../src/assistant-original/netlify-runtime.ts', import.meta.url), 'utf8');
  check(/buildCapabilitySummary/.test(baseSrc) && /systemPrompt\s*=.*capabilitySummary|capabilitySummary/.test(baseSrc), 'FIX 3 — il percorso BASE (netlify-runtime.ts) chiama davvero buildCapabilitySummary e la usa nel system prompt');
  const toolLoopSrc = readFileSync(new URL('../src/brain/stream.ts', import.meta.url), 'utf8');
  check(/buildCapabilitySummary\(true\)/.test(toolLoopSrc), 'FIX 3 — il percorso col loop strumenti (brain/stream.ts) chiama davvero buildCapabilitySummary, non solo per l\'export/audit ma SEMPRE');
}

console.log(`\n${failures === 0 ? 'Tutto coerente.' : `${failures} controllo/i falliti.`}\n`);
process.exit(failures === 0 ? 0 : 1);
