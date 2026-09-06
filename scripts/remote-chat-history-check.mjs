/* ============================================================================
   VERIFICA OFFLINE — REMOTE CHAT HISTORY V1

   Tre pezzi, tre livelli di prova, nessuna chiave AI/rete vera:

   1. Le funzioni di unione (`chatHistoryMerge.ts`) — codice puro, nessun mock.
   2. Il layer client (`serverStorage.ts`) — `fetch` finto, `localStorage`
      finto, stesso schema già usato da `chat-me-check.mjs`.
   3. L'endpoint server (`netlify/functions/user-data.ts`) — `@netlify/blobs`
      sostituito con un negozio finto MA con la stessa semantica vera
      (onlyIfNew/onlyIfMatch/etag), via l'opzione `alias` di esbuild: non un
      mock che dice sempre "ok", un negozio che si comporta come Blobs si
      comporterebbe davvero su un conflitto.

   Uso:  node scripts/remote-chat-history-check.mjs
   ========================================================================= */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'vinz-rch-'));

let failures = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

/* ============================================================================
   1 — LE FUNZIONI DI UNIONE (codice puro, nessun mock)
   ========================================================================= */
console.log('\n═══ 1 — chatHistoryMerge.ts ═══\n');
{
  const entry = join(dir, 'merge-entry.ts');
  const out = join(cwd, 'node_modules', '.vinz-rch-merge-check.mjs');
  writeFileSync(entry, `export { mergeMessageRepositories, mergeThreadLists } from '${cwd}/src/system/chatHistoryMerge.ts';`);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
  const m = await import(`file://${out}?v=${Date.now()}`);

  const msgA = { id: 'msg_a', createdAt: '2026-01-01T00:00:00.000Z' };
  const msgB = { id: 'msg_b', createdAt: '2026-01-01T00:01:00.000Z' };
  const msgC = { id: 'msg_c', createdAt: '2026-01-01T00:02:00.000Z' };

  const server = JSON.stringify({ headId: 'msg_b', messages: [{ message: msgA, parentId: null }, { message: msgB, parentId: 'msg_a' }] });
  const ours = JSON.stringify({ headId: 'msg_c', messages: [{ message: msgA, parentId: null }, { message: msgC, parentId: 'msg_a' }] });
  const merged = JSON.parse(m.mergeMessageRepositories(server, ours));
  check(merged.messages.length === 3, 'G5 — nessun messaggio perso: il server aveva B, noi avevamo C, il merge ha tutti e tre');
  check(merged.messages.some((i) => i.message.id === 'msg_b') && merged.messages.some((i) => i.message.id === 'msg_c'), 'G5 — sia il messaggio del server sia il nostro sopravvivono');
  check(merged.headId === 'msg_c', 'G5 — headId va al messaggio più recente per createdAt (msg_c, 00:02 > 00:01)');

  const dup = m.mergeMessageRepositories(
    JSON.stringify({ messages: [{ message: { id: 'msg_x', createdAt: '2026-01-01T00:00:00.000Z' }, parentId: null }] }),
    JSON.stringify({ messages: [{ message: { id: 'msg_x', createdAt: '2026-01-01T00:00:00.000Z', extra: 'nostro' }, parentId: null }] }),
  );
  const dupParsed = JSON.parse(dup);
  check(dupParsed.messages.length === 1 && dupParsed.messages[0].message.extra === 'nostro', 'stesso id su entrambi i lati: nessun duplicato, vince la nostra versione (lo streaming in corso)');

  check(m.mergeMessageRepositories(null, ours) === ours, 'nessun repository server (chiave mai esistita): il nostro vince intatto, non c\'è nulla da unire');
  check(m.mergeMessageRepositories('non è json', ours) === ours, 'un valore server illeggibile non blocca né corrompe: si comporta come "nessun server"');

  const threadA = { remoteId: 't_a', status: 'regular', title: 'A' };
  const threadB = { remoteId: 't_b', status: 'archived', title: 'B' };
  const threadNew = { remoteId: 't_new', status: 'regular' };
  const serverThreads = JSON.stringify([threadB, threadA]);
  const ourThreads = JSON.stringify([threadNew, threadA]);
  const mergedThreads = JSON.parse(m.mergeThreadLists(serverThreads, ourThreads));
  check(mergedThreads.length === 3, 'G3 — un thread creato da un client non sparisce quando l\'altro salva l\'indice nello stesso istante');
  check(mergedThreads.some((t) => t.remoteId === 't_new'), 'G3 — il thread nuovo (solo nostro) è nel risultato');
  check(mergedThreads.some((t) => t.remoteId === 't_b' && t.status === 'archived'), 'G3 — il thread che solo il server conosce resta');

  const sameThreadConflict = m.mergeThreadLists(
    JSON.stringify([{ remoteId: 't_shared', status: 'archived', title: 'vecchio titolo' }]),
    JSON.stringify([{ remoteId: 't_shared', status: 'archived', title: 'nuovo titolo (questo client sta rinominando)' }]),
  );
  check(JSON.parse(sameThreadConflict)[0].title === 'nuovo titolo (questo client sta rinominando)', 'stesso thread modificato da entrambi: vince il campo che QUESTO client sta ritentando di scrivere');
}

/* ============================================================================
   2 — IL LAYER CLIENT (serverStorage.ts) — fetch e localStorage finti
   ========================================================================= */
console.log('\n═══ 2 — serverStorage.ts (client) ═══\n');
{
  const entry = join(dir, 'client-entry.ts');
  const out = join(cwd, 'node_modules', '.vinz-rch-client-check.mjs');
  writeFileSync(entry, `export { serverBackedStorage, migrateStoragePrefix } from '${cwd}/src/system/serverStorage.ts';`);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });

  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  localStorage.setItem('vinzmon.prototype.v4', JSON.stringify({ state: { token: 'test-token' } }));

  const m = await import(`file://${out}?v=${Date.now()}`);
  const { serverBackedStorage, migrateStoragePrefix } = m;

  const MSG_KEY = 'assistant-ui-official-chatgpt:messages:t1';
  const THREADS_KEY = 'assistant-ui-official-chatgpt:threads';
  const OTHER_KEY = 'vinzmon:some-unrelated-tuning:v1';

  /* Solo le richieste a /api/user-data contano per questi controlli — il
     modulo importa anche postRuntimeEvent() (fire-and-forget verso
     /api/runtime-log per l'osservabilità), che passerebbe dallo STESSO
     fetch globale e sporcherebbe il conteggio dei tentativi se non filtrata. */
  const calls = [];
  const mockFetch = (responder) => {
    globalThis.fetch = async (url, init) => {
      if (!String(url).includes('/api/user-data')) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      calls.push({ url: String(url), init });
      return responder(url, init);
    };
  };

  // ── senza token: nessuna chiamata di rete, nessun crash ──────────────────
  localStorage.removeItem('vinzmon.prototype.v4');
  calls.length = 0;
  mockFetch(() => { throw new Error('non doveva essere chiamata'); });
  await serverBackedStorage.getItem(MSG_KEY);
  await serverBackedStorage.setItem(MSG_KEY, JSON.stringify({ messages: [] }));
  check(calls.length === 0, 'G9 — senza token, nessuna richiesta di rete parte affatto (stesso confine auth del resto dell\'app)');
  localStorage.setItem('vinzmon.prototype.v4', JSON.stringify({ state: { token: 'test-token' } }));

  // ── getItem: preferisce il server, aggiorna la cache locale ──────────────
  calls.length = 0;
  mockFetch(async () => new Response(JSON.stringify({ value: 'dal-server', etag: 'e1' }), { status: 200 }));
  const got = await serverBackedStorage.getItem(OTHER_KEY);
  check(got === 'dal-server', 'G1/G2 — getItem legge il valore dal server, non dalla cache locale vuota');
  check(localStorage.getItem(OTHER_KEY) === 'dal-server', 'il valore del server viene messo in cache locale');

  // ── getItem: la rete fallisce, fallback sul locale, nessun crash ─────────
  localStorage.setItem(OTHER_KEY, 'locale-vecchio');
  calls.length = 0;
  mockFetch(async () => { throw new Error('rete assente'); });
  const gotOffline = await serverBackedStorage.getItem(OTHER_KEY);
  check(gotOffline === 'locale-vecchio', 'G8 — un fallimento di rete su getItem torna il fallback locale, non un errore');

  // ── setItem su una chiave NON di chat: PUT incondizionata, come sempre ───
  calls.length = 0;
  mockFetch(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  await serverBackedStorage.setItem(OTHER_KEY, 'nuovo-valore');
  const otherPut = calls.at(-1);
  check(!!otherPut && otherPut.init.method === 'PUT', 'setItem su una chiave qualunque (tuning/config) manda ancora una PUT');
  check(!otherPut.init.headers['if-match'] && !otherPut.init.headers['x-only-if-new'], 'NESSUNA REGRESSIONE — una chiave non di chat non manda mai condizioni: stesso comportamento di sempre per axisTuning/catalogTuning/designTokens/ecc.');

  // ── setItem su una chiave di chat, NESSUN etag noto: X-Only-If-New ───────
  calls.length = 0;
  mockFetch(async () => new Response(JSON.stringify({ ok: true, etag: 'e-thread-1' }), { status: 200 }));
  await serverBackedStorage.setItem(THREADS_KEY, JSON.stringify([{ remoteId: 't1', status: 'regular' }]));
  const firstThreadPut = calls.at(-1);
  check(firstThreadPut.init.headers['x-only-if-new'] === '1', 'G7 — la primissima scrittura di un indice thread (nessun etag noto) chiede "solo se nuovo", non sovrascrive alla cieca una chiave che potrebbe già esistere sul server');

  // ── setItem su una chiave di chat DOPO una getItem: If-Match con l'etag conosciuto ──
  calls.length = 0;
  mockFetch(async () => new Response(JSON.stringify({ value: JSON.stringify([{ remoteId: 't1', status: 'regular' }]), etag: 'e-thread-2' }), { status: 200 }));
  await serverBackedStorage.getItem(THREADS_KEY);
  mockFetch(async () => new Response(JSON.stringify({ ok: true, etag: 'e-thread-3' }), { status: 200 }));
  await serverBackedStorage.setItem(THREADS_KEY, JSON.stringify([{ remoteId: 't1', status: 'archived' }]));
  check(calls.at(-1).init.headers['if-match'] === 'e-thread-2', 'una setItem subito dopo una getItem manda l\'etag appena letto, non "solo se nuovo"');

  // ── CONFLITTO su messages: — G5/G6, il cuore del task ────────────────────
  calls.length = 0;
  let attempt = 0;
  const serverSideMsg = { message: { id: 'msg_server', createdAt: '2026-01-01T00:05:00.000Z' }, parentId: null };
  mockFetch(async (url, init) => {
    attempt++;
    if (attempt === 1) {
      // Prima PUT: il server rifiuta — un altro dispositivo ha già scritto questa chiave.
      return new Response(JSON.stringify({
        error: 'conflict',
        value: JSON.stringify({ headId: 'msg_server', messages: [serverSideMsg] }),
        etag: 'e-msg-2',
      }), { status: 409 });
    }
    // Ritentativo: verificato più sotto che contenga ENTRAMBI i messaggi.
    return new Response(JSON.stringify({ ok: true, etag: 'e-msg-3' }), { status: 200 });
  });
  const ourMsg = { message: { id: 'msg_ours', createdAt: '2026-01-01T00:06:00.000Z' }, parentId: null };
  await serverBackedStorage.setItem(MSG_KEY, JSON.stringify({ headId: 'msg_ours', messages: [ourMsg] }), 'test-append');
  check(attempt === 2, 'G5 — un conflitto (409) fa ritentare la scrittura, non la abbandona');
  const retriedBody = JSON.parse(calls.at(-1).init.body);
  check(
    retriedBody.messages.some((i) => i.message.id === 'msg_server') && retriedBody.messages.some((i) => i.message.id === 'msg_ours'),
    'G5/G6 — il ritentativo porta ENTRAMBI i messaggi: quello scritto dall\'altro dispositivo nel frattempo non viene perso, e il nostro non viene scartato',
  );
  check(calls.at(-1).init.headers['if-match'] === 'e-msg-2', 'il ritentativo usa l\'etag fresco ricevuto nel conflitto, non quello vecchio');
  check(localStorage.getItem(MSG_KEY) && JSON.parse(localStorage.getItem(MSG_KEY)).messages.length === 2, 'la cache locale riflette il risultato unito, non solo quello che questo client sapeva da solo');

  // ── CONFLITTO persistente oltre i tentativi: nessun crash, nessun loop infinito ──
  calls.length = 0;
  mockFetch(async () => new Response(JSON.stringify({
    error: 'conflict',
    value: JSON.stringify({ messages: [{ message: { id: 'msg_forever', createdAt: '2026-01-01T00:00:00.000Z' } }] }),
    etag: 'e-forever',
  }), { status: 409 }));
  let resolved = false;
  await serverBackedStorage.setItem(MSG_KEY, JSON.stringify({ messages: [{ message: { id: 'msg_mine', createdAt: '2026-01-01T00:00:01.000Z' } }] }));
  resolved = true;
  check(resolved, 'G8 — un conflitto che non si risolve mai (bug ipotetico, rete instabile) NON blocca setItem per sempre: si arrende dopo un numero limitato di tentativi');
  check(calls.length >= 2 && calls.length <= 6, `il numero di tentativi resta limitato (${calls.length} chiamate, non infinite)`);

  // ── Fallimento totale di rete su una chiave di chat: nessun crash ────────
  calls.length = 0;
  mockFetch(async () => { throw new Error('offline'); });
  let networkFailureResolved = false;
  await serverBackedStorage.setItem(MSG_KEY, JSON.stringify({ messages: [] }));
  networkFailureResolved = true;
  check(networkFailureResolved, 'G8 — un fallimento di rete totale su setItem (chiave di chat) non blocca né fa esplodere la chat');

  // ── G7 — MIGRATION della cronologia locale legacy, idempotente ───────────
  const LEGACY_PREFIX = 'assistant-ui-official-chatgpt:';
  const LEGACY_KEY = `${LEGACY_PREFIX}messages:legacy-thread`;
  localStorage.clear();
  localStorage.setItem('vinzmon.prototype.v4', JSON.stringify({ state: { token: 'test-token' } }));
  localStorage.setItem(LEGACY_KEY, JSON.stringify({ messages: [{ message: { id: 'legacy_msg', createdAt: '2025-01-01T00:00:00.000Z' } }] }));

  let migrationPuts = 0;
  const serverAfterMigration = new Map();
  mockFetch(async (url, init) => {
    const method = init?.method ?? 'GET';
    if (method === 'PUT') {
      migrationPuts++;
      serverAfterMigration.set(String(url), init.body);
      return new Response(JSON.stringify({ ok: true, etag: 'e-migrated' }), { status: 200 });
    }
    const existing = serverAfterMigration.get(String(url));
    return new Response(JSON.stringify({ value: existing ?? null, etag: existing ? 'e-migrated' : null }), { status: 200 });
  });
  await migrateStoragePrefix(LEGACY_PREFIX);
  check(migrationPuts === 1, 'G7 — un thread che esiste SOLO nella cronologia locale legacy viene spinto sul server la prima volta');

  await migrateStoragePrefix(LEGACY_PREFIX);
  check(migrationPuts === 1, 'G7 — ripetere la migration (ogni riavvio dell\'app la richiama) non scrive una seconda volta: il server ce l\'ha già, nessun duplicato');
}

/* ============================================================================
   3 — L'ENDPOINT SERVER (user-data.ts) — @netlify/blobs con semantica vera
   ========================================================================= */
console.log('\n═══ 3 — netlify/functions/user-data.ts (server) ═══\n');
{
  const fakeBlobsPath = join(dir, 'fake-blobs.mjs');
  writeFileSync(fakeBlobsPath, `
const stores = new Map();
let counter = 0;
export function getStore() {
  return {
    async getWithMetadata(key) {
      const entry = stores.get(key);
      return entry ? { data: entry.data, etag: entry.etag } : null;
    },
    async set(key, data, options) {
      const existing = stores.get(key);
      if (options?.onlyIfNew && existing) return { modified: false };
      if (options?.onlyIfMatch !== undefined && (!existing || existing.etag !== options.onlyIfMatch)) return { modified: false };
      const etag = 'etag-' + (++counter);
      stores.set(key, { data: String(data), etag });
      return { modified: true, etag };
    },
    async delete(key) { stores.delete(key); },
  };
}
`);

  const entry = join(dir, 'server-entry.ts');
  const out = join(cwd, 'node_modules', '.vinz-rch-server-check.mjs');
  writeFileSync(entry, `export { default as handler } from '${cwd}/netlify/functions/user-data.ts';`);
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: out,
    logLevel: 'error',
    plugins: [{ name: 'local-store-fixture', setup(builder) {
      builder.onResolve({ filter: /^@netlify\/blobs$|\/localStore$|^\.\/_shared\/localStore$/ }, () => ({ path: fakeBlobsPath }));
    } }],
  });

  process.env.VINZMON_TOKEN = 'a-fake-token-just-for-this-offline-check';
  const m = await import(`file://${out}?v=${Date.now()}`);
  const { handler } = m;

  const AUTH = { authorization: `Bearer ${process.env.VINZMON_TOKEN}` };
  const req = (method, key, body, headers = {}) =>
    new Request(`https://example.test/api/user-data?key=${encodeURIComponent(key)}`, { method, headers: { ...AUTH, ...headers }, body });

  // ── senza token: 401, mai i dati ──────────────────────────────────────
  const unauth = await handler(new Request('https://example.test/api/user-data?key=x', { method: 'GET' }));
  check(unauth.status === 401, 'G9 — senza token, 401: stesso confine auth del resto dell\'app');

  // ── GET su chiave inesistente ────────────────────────────────────────
  const missing = await handler(req('GET', 'missing-key'));
  const missingBody = await missing.json();
  check(missingBody.value === null && missingBody.etag === null, 'GET su una chiave mai scritta torna value/etag nulli, non un errore');

  // ── PUT incondizionata (nessun header) — comportamento di sempre ────────
  const plainPut = await handler(req('PUT', 'plain-key', 'ciao'));
  check(plainPut.status === 200, 'una PUT senza If-Match/X-Only-If-New (il caso di ogni chiamante che non è la chat) continua a funzionare senza condizioni');
  const plainPutAgain = await handler(req('PUT', 'plain-key', 'sovrascritto'));
  check(plainPutAgain.status === 200, 'NESSUNA REGRESSIONE — una seconda PUT incondizionata sulla stessa chiave sovrascrive ancora alla cieca, esattamente come faceva prima di questo task');
  const plainGet = await handler(req('GET', 'plain-key'));
  check((await plainGet.json()).value === 'sovrascritto', 'e il valore letto è quello dell\'ultima scrittura incondizionata');

  // ── PUT con X-Only-If-New su chiave nuova → crea ────────────────────────
  const createNew = await handler(req('PUT', 'threads-key', '[]', { 'x-only-if-new': '1' }));
  check(createNew.status === 200, 'X-Only-If-New su una chiave che non esiste ancora: creata con successo');
  const createdEtag = (await createNew.json()).etag;
  check(!!createdEtag, 'la creazione riuscita torna un etag');

  // ── PUT con X-Only-If-New sulla STESSA chiave ora esistente → 409 ───────
  const createConflict = await handler(req('PUT', 'threads-key', '[]', { 'x-only-if-new': '1' }));
  check(createConflict.status === 409, 'G5/G6 — X-Only-If-New su una chiave che nel frattempo è stata creata da un altro scrittore: 409, non una sovrascrittura silenziosa');
  const conflictBody = await createConflict.json();
  check(conflictBody.value === '[]' && !!conflictBody.etag, 'il 409 porta il valore E l\'etag correnti, così chi ha fallito può unire e ritentare senza un\'altra GET');

  // ── PUT con If-Match corretto → succeede e avanza l'etag ────────────────
  const matchOk = await handler(req('PUT', 'threads-key', '["t1"]', { 'if-match': createdEtag }));
  check(matchOk.status === 200, 'If-Match con l\'etag corretto: la scrittura passa');
  const newEtag = (await matchOk.json()).etag;
  check(newEtag !== createdEtag, 'e l\'etag avanza dopo una scrittura riuscita');

  // ── PUT con If-Match VECCHIO (stale) → 409, mai una sovrascrittura ──────
  const staleMatch = await handler(req('PUT', 'threads-key', '["stale-client-wins-never"]', { 'if-match': createdEtag }));
  check(staleMatch.status === 409, 'G6 — un client con un etag vecchio (cache stale) viene rifiutato, non gli è permesso sovrascrivere una cronologia più nuova');
  const afterStaleGet = await handler(req('GET', 'threads-key'));
  check((await afterStaleGet.json()).value === '["t1"]', 'e infatti il valore più nuovo sul server resta intatto dopo il tentativo stale');

  // ── DELETE rimuove davvero ───────────────────────────────────────────────
  await handler(req('DELETE', 'plain-key'));
  const afterDelete = await handler(req('GET', 'plain-key'));
  check((await afterDelete.json()).value === null, 'DELETE rimuove davvero la chiave');

  // ── limite di byte ancora rispettato ─────────────────────────────────────
  const huge = 'x'.repeat(26 * 1024 * 1024);
  const tooBig = await handler(req('PUT', 'huge-key', huge));
  check(tooBig.status === 413, 'NESSUNA REGRESSIONE — il tetto di byte esiste ancora ed è controllato prima di qualunque logica condizionale');
}

console.log('\nTutto coerente.\n');
if (failures) { console.error(`${failures} controllo/i falliti.`); process.exit(1); }
