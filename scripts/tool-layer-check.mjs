/* ============================================================================
   VERIFICA OFFLINE — VINZ.MON TOOL LAYER PHASE 1

   Tre livelli, tutti su codice vero (nessun mock che dice sempre "successo"):

   1. Riconoscimento dell'intento tecnico (`isCodeInspectionIntent`,
      `shouldUseLocalTools`) — regex vere, frasi vere.
   2. Il layer client (`src/ai/toolLayer.ts`) chiamato con `fetch` reindirizzato
      DIRETTAMENTE all'handler VERO di `netlify/functions/code-tools.ts` — la
      stessa validazione di percorso, lo stesso filesystem reale di questo
      repository, nessuna rete finta che dice sempre "ok".
   3. Il confine di sicurezza dell'endpoint HTTP: auth, corpo non valido.

   Uso:  node scripts/tool-layer-check.mjs
   ========================================================================= */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'vinz-toollayer-'));

let failures = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

/* ============================================================================
   1 — RICONOSCIMENTO DELL'INTENTO (codice puro, nessun mock)
   ========================================================================= */
console.log('\n═══ 1 — riconoscimento dell\'intento tecnico (brain/stream.ts) ═══\n');
{
  const entry = join(dir, 'intent-entry.ts');
  const out = join(cwd, 'node_modules', '.vinz-toollayer-intent-check.mjs');
  writeFileSync(entry, `export { isCodeInspectionIntent, shouldUseLocalTools } from '${cwd}/src/brain/stream.ts';`);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
  const m = await import(`file://${out}?v=${Date.now()}`);

  const TASK_EXAMPLES = [
    'Puoi leggere il tuo codice?',
    'Controlla nel tuo codice dove viene gestito RISE.',
    'Quale file gestisce la memoria?',
    'Cerca dove viene usato NarrativeContext.',
    'Controlla se esiste già una funzione per X.',
  ];
  for (const phrase of TASK_EXAMPLES) {
    check(m.isCodeInspectionIntent(phrase), `G1 — riconosce come ispezione tecnica: "${phrase}"`);
    check(m.shouldUseLocalTools(phrase), `G1 — quella stessa frase entra nel loop strumenti (non nel percorso senza strumenti): "${phrase}"`);
  }

  // G8 — la chat ordinaria non deve accendere l'ispezione tecnica.
  const ORDINARY = ['Come va oggi?', 'Dimmi una battuta', 'Che tempo fa?', 'Raccontami una storia breve'];
  for (const phrase of ORDINARY) {
    check(!m.isCodeInspectionIntent(phrase), `G8 — NON è un'ispezione tecnica: "${phrase}"`);
  }
  // Small talk pura non deve nemmeno entrare nel loop strumenti — il percorso BASE resta quello di sempre.
  check(!m.shouldUseLocalTools('Ciao, come stai oggi?'), 'G8 — small talk pura resta sul percorso BASE (nessuno strumento acceso)');

  // Le domande salute restano quello che erano — nessuna regressione dell'intento esistente.
  check(m.shouldUseLocalTools('Ho mangiato una mela'), 'G9 — l\'intento salute esistente non è toccato da questa modifica');
}

/* ============================================================================
   2 — IL LAYER CLIENT CONTRO L'HANDLER SERVER VERO (stesso filesystem reale)
   ========================================================================= */
console.log('\n═══ 2 — src/ai/toolLayer.ts ↔ netlify/functions/code-tools.ts (reale) ═══\n');
{
  const entry = join(dir, 'stack-entry.ts');
  const out = join(cwd, 'node_modules', '.vinz-toollayer-stack-check.mjs');
  writeFileSync(entry, `
export { runToolLayerTool, CODE_SEARCH_TOOL_NAME, CODE_READ_TOOL_NAME } from '${cwd}/src/ai/toolLayer.ts';
export { default as codeToolsHandler } from '${cwd}/netlify/functions/code-tools.ts';
export { sanitizeRuntimeEvent } from '${cwd}/netlify/functions/_shared/runtimeLog.ts';
`);
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: out,
    logLevel: 'error',
    // @netlify/blobs non gira fuori da Netlify — appendRuntimeEvent() lo sa e
    // fallisce in silenzio (try/catch già suo), esattamente come in produzione
    // quando il salvataggio dei log fosse temporaneamente irraggiungibile.
    external: ['@netlify/blobs'],
  });

  const TEST_TOKEN = 'a-fake-token-for-this-offline-check-only';
  process.env.VINZMON_TOKEN = TEST_TOKEN;

  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
  localStorage.setItem('vinzmon.prototype.v4', JSON.stringify({ state: { token: TEST_TOKEN } }));

  const m = await import(`file://${out}?v=${Date.now()}`);

  // fetch reindirizzato DIRETTAMENTE all'handler vero — stessa validazione,
  // stesso filesystem di questo repository, nessuna rete finta.
  globalThis.fetch = async (url, init) => {
    const request = new Request(`https://example.test${url}`, {
      method: init.method,
      headers: init.headers,
      body: init.body,
    });
    return m.codeToolsHandler(request);
  };

  // ── G2 — una ricerca reale trova RISE davvero nel repository ────────────
  const rise = await m.runToolLayerTool({ id: 't1', name: m.CODE_SEARCH_TOOL_NAME, input: { query: 'RISE' } });
  check(!rise.isError, 'G2 — la ricerca di "RISE" (esempio del task) non fallisce');
  check(/\.ts:\d+/.test(rise.content), 'G2 — il risultato porta percorso:riga reali, non una descrizione a parole');
  check(/narrativeContext\.ts|world\.ts|journey\.ts|worldIdentity\.ts|store\.ts|SystemLab\.tsx/.test(rise.content), 'G2 — trova almeno uno dei file VERI che contengono RISE (non un percorso inventato)');

  // ── G3 — code_read legge davvero un file consentito ─────────────────────
  const read = await m.runToolLayerTool({ id: 't2', name: m.CODE_READ_TOOL_NAME, input: { percorso: 'src/engine/progression.ts' } });
  check(!read.isError, 'G3 — code_read legge un file consentito senza errore');
  check(read.content.includes('canCloseDay'), 'G3 — il contenuto letto è codice vero (contiene canCloseDay)');
  check(read.content.startsWith('FILE: src/engine/progression.ts'), 'G3 — la provenienza (percorso reale) è dichiarata in testa al risultato');

  // ── G4 — path traversal rifiutato ───────────────────────────────────────
  const traversal = await m.runToolLayerTool({ id: 't3', name: m.CODE_READ_TOOL_NAME, input: { percorso: '../../etc/passwd' } });
  check(traversal.isError, 'G4 — ../../etc/passwd viene rifiutato');
  check(!/root:|password/i.test(traversal.content), 'G4 — nessun contenuto di sistema nella risposta');

  // ── G5 — percorso assoluto rifiutato ────────────────────────────────────
  const absolute = await m.runToolLayerTool({ id: 't4', name: m.CODE_READ_TOOL_NAME, input: { percorso: '/etc/passwd' } });
  check(absolute.isError, 'G5 — un percorso assoluto (/etc/passwd) viene rifiutato');

  // ── G6 — nessun segreto leggibile, anche indirettamente ─────────────────
  const envAttempt = await m.runToolLayerTool({ id: 't5', name: m.CODE_READ_TOOL_NAME, input: { percorso: '.env' } });
  check(envAttempt.isError, 'G6 — ".env" viene rifiutato');
  const authRead = await m.runToolLayerTool({ id: 't6', name: m.CODE_READ_TOOL_NAME, input: { percorso: 'netlify/functions/_shared/auth.ts' } });
  check(!authRead.isError, 'STAGE — auth.ts (codice pubblico) è leggibile');
  check(!/VINZMON_TOKEN\s*=\s*['"][^'"]+['"]/.test(authRead.content), 'G6 — nessun VALORE di segreto compare, solo il NOME della variabile');
  check(!authRead.content.includes(TEST_TOKEN), 'G6 — il token usato per autenticare QUESTA richiesta non compare mai nella risposta');

  // ── G7 — un'ispezione fallita è onesta, non inventata ───────────────────
  const noResults = await m.runToolLayerTool({ id: 't7', name: m.CODE_SEARCH_TOOL_NAME, input: { query: 'zzzqqqxxxNonEsisteDavveroNelCodice' } });
  check(!noResults.isError, 'G7 — zero risultati reali non è un errore di sistema...');
  check(/[Nn]essun risultato/.test(noResults.content), 'G7 — ...ma lo dice onestamente, invece di inventare un file');
  const missingFile = await m.runToolLayerTool({ id: 't8', name: m.CODE_READ_TOOL_NAME, input: { percorso: 'src/questo/file/non/esiste.ts' } });
  check(missingFile.isError, 'G7 — un file inesistente torna un fallimento dichiarato');
  check(/ISPEZIONE FALLITA/.test(missingFile.content), 'G7 — il fallimento è esplicito nel testo che il modello legge, non silenzioso');

  // ── G10 — il Runtime Log non porta mai il contenuto sorgente ────────────
  const sneaky = m.sanitizeRuntimeEvent({
    eventType: 'TOOL_LAYER_CODE_READ',
    status: 'PASS',
    scope: 'chat',
    metadata: { source: 'src/engine/progression.ts', count: 4821, text: 'CONTENUTO SORGENTE CHE NON DEVE SOPRAVVIVERE' },
  });
  check(sneaky !== null, 'lo scope "chat" (quello che questo Tool Layer usa) è valido nel Runtime Log');
  check(sneaky.metadata?.source === 'src/engine/progression.ts' && sneaky.metadata?.count === 4821, 'G10 — percorso e conteggio (metadata tecnica) sopravvivono');
  check(sneaky.metadata?.text === undefined, 'G10 — un campo "text" con contenuto sorgente viene scartato: il Runtime Log non lo accetta nemmeno se qualcuno provasse a mandarlo');

  // ── Correzione adiacente — 'agent-lab' ora è davvero uno scope valido ───
  const agentLabEvent = m.sanitizeRuntimeEvent({ eventType: 'X', status: 'PASS', scope: 'agent-lab' });
  check(agentLabEvent !== null, 'CORREZIONE — lo scope "agent-lab" (già nel tipo da AGENT.LAB V1) ora supera davvero la validazione, non viene più scartato in silenzio');
}

/* ============================================================================
   3 — CONFINE HTTP: AUTH E CORPO NON VALIDO
   ========================================================================= */
console.log('\n═══ 3 — confine HTTP di code-tools.ts ═══\n');
{
  const entry = join(dir, 'http-entry.ts');
  const out = join(cwd, 'node_modules', '.vinz-toollayer-http-check.mjs');
  writeFileSync(entry, `export { default as handler } from '${cwd}/netlify/functions/code-tools.ts';`);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error', external: ['@netlify/blobs'] });
  process.env.VINZMON_TOKEN = 'a-fake-token-for-this-offline-check-only';
  const m = await import(`file://${out}?v=${Date.now()}`);

  const noAuth = await m.handler(new Request('https://example.test/api/code-tools', { method: 'POST', body: JSON.stringify({ op: 'search', query: 'RISE' }) }));
  check(noAuth.status === 401, 'G9/G6 — nessuna Authorization: 401, non un errore generico che lascia intuire se la chiave era vicina');

  const wrongAuth = await m.handler(new Request('https://example.test/api/code-tools', { method: 'POST', headers: { authorization: 'Bearer chiave-sbagliata-non-quella-vera' }, body: JSON.stringify({ op: 'search', query: 'RISE' }) }));
  check(wrongAuth.status === 401, 'token sbagliato: 401 comunque');

  const wrongMethod = await m.handler(new Request('https://example.test/api/code-tools', { method: 'GET', headers: { authorization: 'Bearer a-fake-token-for-this-offline-check-only' } }));
  check(wrongMethod.status === 405, 'solo POST è un metodo valido');

  const badBody = await m.handler(new Request('https://example.test/api/code-tools', { method: 'POST', headers: { authorization: 'Bearer a-fake-token-for-this-offline-check-only', 'content-type': 'application/json' }, body: 'non è json' }));
  check(badBody.status === 400, 'un corpo non JSON viene rifiutato in modo pulito, non fa esplodere la funzione');

  const badOp = await m.handler(new Request('https://example.test/api/code-tools', { method: 'POST', headers: { authorization: 'Bearer a-fake-token-for-this-offline-check-only', 'content-type': 'application/json' }, body: JSON.stringify({ op: 'delete', path: 'x' }) }));
  check(badOp.status === 400, 'un\'operazione sconosciuta ("delete") viene rifiutata — solo "search"/"read" esistono, nessuna scrittura possibile nemmeno per errore di battitura');
}

console.log('\nTutto coerente.\n');
if (failures) { console.error(`${failures} controllo/i falliti.`); process.exit(1); }
