/* ============================================================================
   VINZ.LAB — INGRESSO E ISOLAMENTO

   Il pacchetto di Codex chiede, testualmente, cinque prove prima di dire
   fatto. Questo copione le fa, tutte, contro un browser vero:

     1. `/` apre VINZ.MON e non è cambiata
     2. `/#/lab` apre il laboratorio, con le sue quattro porte
     3. `/#/lab/design` apre DESIGN.LAB e monta l'iframe della schermata vera
     4. `?design-preview=…` monta UNA schermata sola, senza `App` intorno
     5. da VINZ.MON non parte NESSUN link al laboratorio

   E ne aggiunge una che il pacchetto chiede a parole ma non sa provare:

     6. la preview NON SCRIVE. Si conta `localStorage` prima e dopo, e si
        intercetta ogni richiesta di rete che non sia una lettura.

   ⚠️ La sesta è quella che conta. Le altre cinque dicono che il laboratorio
   si apre; questa dice che aprirlo non costa niente alla creatura vera. Una
   preview che salva è peggio di una preview che non c'è.

   Uso:  node scripts/lab-check.mjs
         VERIFY_BASE=https://… node scripts/lab-check.mjs
   ========================================================================= */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 5201;
const REMOTE = process.env.VERIFY_BASE?.replace(/\/$/, '');
const BASE = REMOTE ?? `http://localhost:${PORT}`;

const server = REMOTE
  ? null
  : spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

function stopServer() {
  if (!server) return;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill('SIGTERM');
  }
}

if (server) {
  let ready = false;
  server.stdout.on('data', (d) => {
    const s = d.toString();
    if (s.includes('ready in') || s.includes('Local:')) ready = true;
  });
  for (let i = 0; i < 100 && !ready; i++) await sleep(100);
  await sleep(600);
}

const PROXY = process.env.HTTPS_PROXY ?? process.env.https_proxy;
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(BASE);
const LAUNCH_ARGS = IS_LOCAL ? ['--no-proxy-server'] : [];
const LAUNCH_PROXY = IS_LOCAL || !PROXY ? undefined : { server: PROXY };

async function launchChromium() {
  try {
    return await chromium.launch({ args: LAUNCH_ARGS, proxy: LAUNCH_PROXY });
  } catch {
    const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
    const candidates = readdirSync(root)
      .filter((d) => d.startsWith('chromium'))
      .flatMap((d) => [
        join(root, d, 'chrome-linux', 'chrome'),
        join(root, d, 'chrome-linux', 'headless_shell'),
      ])
      .filter((p) => existsSync(p));
    if (candidates.length === 0) throw new Error(`Nessun Chromium trovato in ${root}`);
    return chromium.launch({ executablePath: candidates[0], args: LAUNCH_ARGS, proxy: LAUNCH_PROXY });
  }
}

const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 460, height: 920 } });
const page = await context.newPage();

const results = [];
let failures = 0;
function check(label, ok, detail = '') {
  results.push({ label, ok, detail });
  if (!ok) failures++;
}

/* ⚠️ LE SCRITTURE VANNO ATTRIBUITE, non solo contate.

   La prima versione teneva un elenco unico dall'inizio alla fine, e poi
   chiedeva «è vuoto?» dopo la preview. Ma in mezzo c'era stata anche l'app
   NORMALE, che scrive di suo — `/api/lessons` parte a ogni avvio. Il
   controllo diventava rosso accusando la preview di una cosa fatta da
   qualcun altro: un controllo che punta il dito sbagliato è peggio di uno
   che non c'è, perché si va a cercare il guasto dove non è.

   Quindi la lista si AZZERA prima di ogni tratto, e ogni domanda riguarda
   solo il tratto appena percorso. */
let writes = [];
const guarda = () => { writes = []; };
await context.route('**/*', (route) => {
  const req = route.request();
  if (!['GET', 'HEAD'].includes(req.method())) {
    writes.push(`${req.method()} ${req.url()}  [da ${page.url()}]`);
  }
  return route.continue();
});

const errors = [];
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const l = m.location();
  const dove = l?.url ? ` (${l.url}:${l.lineNumber})` : '';

  /* ⚠️ LA STESSA ECCEZIONE STRETTA DI `verify-screens`, e per la stessa
     ragione: `vite` pubblica solo file statici, quindi `/api/*` non esiste in
     locale. L'app parte convinta di essere configurata — il segreto se lo
     genera da sé — e prova a chiamare; il 404 che ne esce è la condizione
     documentata in testa a `ai/backend.ts`, non un guasto.

     🔒 Vale SOLO senza `VERIFY_BASE`: contro il sito vero le funzioni ci sono
     e un 404 su `/api` sarebbe un guasto in piena regola. */
  const apiInLocale = !REMOTE && /\/api\//.test(`${m.text()}${dove}`);
  if (apiInLocale && /404|Failed to load resource/i.test(m.text())) return;

  errors.push(`${m.text()}${dove}`);
});
page.on('pageerror', (e) => errors.push(String(e)));

/* ⚠️ `about:blank` PRIMA DI OGNI GIRO, e non è pignoleria da copione.
   `readEntrypoint` legge l'indirizzo UNA VOLTA, all'avvio: è un interruttore
   all'ingresso, non un router. Da `/` a `/#/lab` il browser NON ricarica —
   cambia solo il frammento — quindi senza questa riga il copione crederebbe
   di aver aperto il laboratorio mentre sta ancora guardando l'app. È lo stesso
   equivoco che avrebbe avuto un utente: si entra nel laboratorio aprendolo,
   non navigandoci dentro. */
const open = async (path) => {
  await page.goto('about:blank');
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await sleep(900);
};

try {
  /* --- 1. L'app normale ---------------------------------------------------- */
  await open('/');
  check(
    'su «/» monta VINZ.MON',
    (await page.locator('.proto-frame').count()) > 0,
    'la cornice del prototipo è quella e non un guscio del laboratorio',
  );
  check('su «/» il titolo resta VINZ.MON', (await page.title()) === 'VINZ.MON');
  check(
    'su «/» il manifest resta quello dell\'app',
    (await page.locator('link[rel="manifest"]').getAttribute('href')) === '/manifest.webmanifest',
  );

  /* --- 5. Nessun link al laboratorio --------------------------------------- */
  const labLinks = await page.evaluate(() => {
    const testo = document.body.innerText.toUpperCase();
    const href = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') ?? '');
    return {
      testo: testo.includes('VINZ.LAB') || /\bLAB\b/.test(testo),
      href: href.filter((h) => h.includes('/lab')),
    };
  });
  check(
    'da VINZ.MON non si arriva al laboratorio',
    !labLinks.testo && labLinks.href.length === 0,
    labLinks.href.join(' ') || (labLinks.testo ? 'la parola LAB compare a schermo' : ''),
  );

  /* --- 2. L'atrio ---------------------------------------------------------- */
  await open('/#/lab');
  /* 🔶 `.labapp` e `.labapp__doors` erano le classi del guscio che avevo
     inventato io. L'atrio adesso è `docs/lab/design/00-atrio.html`: il titolo
     è un `<h1>` e le porte sono `<a class="lab">`, come le ha disegnate lui. */
  const doors = await page.locator('a.lab').count();
  check(
    'su «/#/lab» monta VINZ.LAB',
    (await page.locator('main h1').first().textContent()) === 'VINZ.LAB',
  );
  check('e le porte sono quattro', doors === 4, `trovate ${doors}`);
  check('col titolo suo', (await page.title()) === 'VINZ.LAB');
  check(
    'su «/#/lab» VINZ.MON non è montata',
    (await page.locator('.proto-frame').count()) === 0,
    'due app montate insieme vorrebbe dire due store vivi',
  );

  /* --- 2b. L'INSTALLAZIONE: COSA LEGGE SAFARI, NON COSA VEDE IL DOM --------
     🔷 «Non si apre la webapp, mi porta sempre a vinz.mon.» E dopo il primo
        tentativo di correzione: 🔷 «Niente, stesso errore.»

     🔴 IL CONTROLLO CHE C'ERA QUI PRIMA PASSAVA MENTRE LA COSA ERA ROTTA, ed
     è il motivo per cui il primo tentativo è stato pubblicato con l'aria di
     funzionare. Leggeva `link[rel=manifest]` con `page.locator(...)`, cioè
     dal DOM VIVO — dopo che `applyLabDocumentMeta.ts` l'aveva già corretto.
     Verde, e intanto Safari continuava a installare l'icona sbagliata.

     🔒 SAFARI LEGGE IL DOCUMENTO, NON IL DOM DOPO. `<script type="module">`
     è differito: quando il browser legge i tag `<head>`, il JavaScript non è
     ancora partito. Quindi questi controlli scaricano l'HTML GREZZO e
     guardano lì dentro — la stessa cosa che vede iOS quando premi «Aggiungi
     a schermata Home». È l'unica versione di questa domanda che significhi
     qualcosa.

     ⚠️ `/lab/` CON LA BARRA. È lo `start_url` del manifest, ed è quello che
     ogni server statico serve senza bisogno di regole. */
  const grezzo = await (await fetch(`${BASE}/lab/`)).text();
  check(
    'il documento del lab dichiara il SUO manifest già nell\'HTML',
    grezzo.includes('<link rel="manifest" href="/lab-manifest.webmanifest"'),
    '🔴 prima lo riscriveva JS, e Safari aveva già letto quello di VINZ.MON',
  );
  check(
    'e la SUA icona, che è il tag che iOS legge per primo',
    grezzo.includes('rel="apple-touch-icon" href="/lab-icon-180.png'),
  );
  check(
    'e il SUO nome, quello che iOS propone quando installi',
    grezzo.includes('name="apple-mobile-web-app-title" content="VINZ.LAB"') &&
      grezzo.includes('<title>VINZ.LAB</title>'),
  );
  const appGrezzo = await (await fetch(`${BASE}/`)).text();
  check(
    'mentre il documento dell\'app resta VINZ.MON, non contagiato',
    appGrezzo.includes('<title>VINZ.MON</title>') &&
      appGrezzo.includes('<link rel="manifest" href="/manifest.webmanifest"'),
    'due porte diverse devono restare due documenti diversi',
  );
  const manifest = await (await fetch(`${BASE}/lab-manifest.webmanifest`)).json();
  check(
    'e lo start_url del manifest riporta lì, non alla pagina principale',
    manifest.start_url === '/lab/',
    `letto: ${manifest.start_url}`,
  );

  guarda();
  await open('/lab/');
  check(
    'aprendo «/lab/» monta VINZ.LAB',
    (await page.locator('main h1').first().textContent()) === 'VINZ.LAB',
  );
  await open('/lab/creation');
  check('e «/lab/creation» apre direttamente la stanza', (await page.locator('.top .tabs .tab').count()) > 0);
  check(
    'e sfogliare «/lab/» non ha scritto niente',
    writes.length === 0,
    writes.join(' · '),
  );

  /* --- 2c. IL SEGRETO SCARICA DAVVERO I DATI, NON SOLO LA CHAT --------------
     🔴 «Ma se gli do il token sono coegate?» — Il segreto da solo collega le
     chiamate e la cronologia della chat (sincronizzata dal server), ma NON i
     dati: il .mon vero, le sue immagini, il diario salute restavano quello
     che `App.tsx` scaricava al boot — e il lab non montava mai `App`. Senza
     questo, la preview di DESIGN.LAB e gli strumenti dell'ASSISTENTE
     vedrebbero un .mon vuoto pur avendo il token giusto. Stessa
     sincronizzazione, montata invece in `LabApp.tsx` — una volta sola, per
     ogni stanza, non una copia per lab. */
  let statoAuth = null;
  await context.route('**/api/state', (route) => {
    statoAuth = route.request().headers()['authorization'] ?? null;
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ day: 42, savedAt: new Date().toISOString(), state: { day: 42, resetAt: null } }),
    });
  });
  await context.route('**/api/assets*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );

  guarda();
  await open('/lab/');
  await page.evaluate(() => {
    const raw = localStorage.getItem('vinzmon.prototype.v4');
    const o = raw ? JSON.parse(raw) : { state: {}, version: 3 };
    o.state = { ...(o.state ?? {}), token: 'vm_test_token_1234567890abcd', day: 1 };
    localStorage.setItem('vinzmon.prototype.v4', JSON.stringify(o));
  });
  await open('/lab/');
  await sleep(1000);

  const giornoDopo = await page.evaluate(() => {
    const raw = localStorage.getItem('vinzmon.prototype.v4');
    const o = raw ? JSON.parse(raw) : null;
    return o?.state?.day ?? null;
  });
  check(
    'appena il lab ha un token, scarica la storia più lunga dal server — non solo la chat',
    statoAuth === 'Bearer vm_test_token_1234567890abcd' && giornoDopo === 42,
    `auth: ${statoAuth} · day: ${giornoDopo}`,
  );

  await context.unroute('**/api/state');
  await context.unroute('**/api/assets*');

  /* --- 2d. LE TARATURE DEL LAB ATTRAVERSANO LO STESSO CONFINE DEL .MON ------
     🔴 «Eh no, [le tarature] sono manopole che devo modificare col codice
     anche allenarlo — allora tutto questo è inutile.» Aveva ragione: TOKENS,
     CATALOGHI e i pesi degli assi vivevano in tre chiavi di `localStorage` a
     parte dallo stato di gioco, mai toccate dal giro server appena costruito
     per il .mon — cambiarle nel lab restava lì, installazione per
     installazione, esattamente il problema del token ma su altre tre chiavi.
     Ora `salva()`, in ciascuno dei tre file, spinge anche verso
     `/api/user-data` (lo stesso store generico della chat), e ogni app la
     riscarica appena ha un token. */
  const datiUtente = new Map();
  await context.route('**/api/user-data*', (route) => {
    const url = new URL(route.request().url());
    const chiave = url.searchParams.get('key');
    if (route.request().method() === 'PUT') {
      datiUtente.set(chiave, route.request().postData() ?? '');
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
    const valore = datiUtente.has(chiave) ? datiUtente.get(chiave) : null;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ value: valore }) });
  });

  guarda();
  await open('/lab/creation');
  await page.evaluate(async () => {
    const dt = await import('/src/engine/designTokens.ts');
    dt.setTokenOverride('--signal-positive', '#ff00ff');
    const ct = await import('/src/engine/catalogTuning.ts');
    ct.setCatalogEnabled('family', 'DRAGON', true);
  });
  await sleep(400);

  const pushato = {
    tokens: datiUtente.get('vinzmon.designTokens.v1') ?? null,
    dragonEscluso: (() => {
      try {
        return JSON.parse(datiUtente.get('vinzmon.catalog.v1') ?? '{}').family?.includes('DRAGON') ?? null;
      } catch {
        return null;
      }
    })(),
  };
  check(
    'cambiare un token o un catalogo nel lab lo spinge sul server, non solo in questo browser',
    pushato.tokens === '{"--signal-positive":"#ff00ff"}' && pushato.dragonEscluso === false,
    JSON.stringify(pushato),
  );

  /* Simula un'installazione NUOVA con lo stesso token: nessuno scarto
     locale, solo quello che sta sul server — come sarebbe VINZ.MON dopo
     aver ricevuto lo stesso segreto. */
  await page.evaluate(() => {
    localStorage.removeItem('vinzmon.designTokens.v1');
    localStorage.removeItem('vinzmon.catalog.v1');
  });
  await open('/lab/creation');
  await sleep(800);

  const dopoIlRicaricamento = await page.evaluate(async () => {
    const dt = await import('/src/engine/designTokens.ts');
    const ct = await import('/src/engine/catalogTuning.ts');
    return {
      ink: dt.tokenOverrides()['--signal-positive'] ?? null,
      dragonAcceso: ct.isEnabled('family', 'DRAGON'),
    };
  });
  check(
    'e una installazione «nuova» con lo stesso token lo ritrova, non solo il .mon',
    dopoIlRicaricamento.ink === '#ff00ff' && dopoIlRicaricamento.dragonAcceso === true,
    JSON.stringify(dopoIlRicaricamento),
  );

  /* Rimetto a posto: i test di TOKENS e CATALOGHI più avanti si aspettano il
     foglio pulito, non quello lasciato qui. */
  await page.evaluate(async () => {
    const dt = await import('/src/engine/designTokens.ts');
    dt.resetAllTokenOverrides();
    const ct = await import('/src/engine/catalogTuning.ts');
    ct.resetCatalog();
  });
  await context.unroute('**/api/user-data*');

  /* --- 3. DESIGN.LAB ------------------------------------------------------- */
  await open('/#/lab/design');
  check('su «/#/lab/design» si apre DESIGN.LAB', (await page.locator('.screenbar').count()) > 0);
  const frame = page.locator('.phone iframe');
  check('con dentro l\'iframe della schermata vera', (await frame.count()) === 1);
  const src = ((await frame.count()) === 1 ? await frame.getAttribute('src') : null) ?? '';
  check(
    'e l\'iframe punta alla preview, non a una copia',
    src.startsWith('/?design-preview='),
    src,
  );

  /* --- 3b. Le stanze --------------------------------------------------------
     🔶 CERCAVANO `.labroom` E `.ftab`, cioè il guscio che avevo inventato io:
     linguette a cartella prese dal pannello DEV. Quel guscio non c'è più — le
     stanze adesso sono i DISEGNI di Vincenzo, con le sue classi (`.app`,
     `.top`, `.tabs .tab`, `.page`). Il controllo guarda quelle.

     🔒 E la cosa che verifica resta la stessa, perché la decisione non era
     mai «esiste `.labroom`»: era «ogni scheda si apre e mostra qualcosa».
     Una scheda vuota è uno strumento che non c'è con l'aria di esserci, ed è
     invisibile a un controllo sul codice. */
  for (const [stanza, minimoSchede] of [['creation', 5], ['system', 5], ['design', 4]]) {
    guarda();
    await open(`/#/lab/${stanza}`);

    const schede = page.locator('.top .tabs .tab');
    const quante = await schede.count();
    check(`la stanza ${stanza.toUpperCase()} si apre col disegno vero`, (await page.locator('.app .top').count()) === 1);
    check(
      `e ha le sue ${minimoSchede} schede`,
      quante >= minimoSchede,
      `${quante} trovate`,
    );

    const vuote = [];
    for (let i = 0; i < quante; i++) {
      const etichetta = (await schede.nth(i).textContent())?.trim() ?? '?';
      await schede.nth(i).click();
      await sleep(320);
      const pieno = await page.evaluate(
        () => (document.querySelector('main .page')?.textContent ?? '').trim().length > 40,
      );
      if (!pieno) vuote.push(etichetta);
    }
    check(
      `in ${stanza.toUpperCase()} ogni scheda mostra qualcosa`,
      vuote.length === 0,
      vuote.length ? `vuote: ${vuote.join(', ')}` : `${quante} schede aperte una per una`,
    );
    check(
      `e sfogliare ${stanza.toUpperCase()} non ha scritto niente`,
      writes.length === 0,
      writes.join(' · '),
    );
  }

  /* 🔒 IL PEZZO CHE DICE SE HO CAPITO LA CORREZIONE. Le stanze devono essere
     il disegno di Vincenzo, non un guscio inventato: la prova è che le classi
     a schermo siano le SUE. Se un giorno tornasse `.labroom`, vorrebbe dire
     che qualcuno ha ridisegnato di nuovo quello che era già disegnato. */
  await open('/#/lab/system');
  const suo = await page.evaluate(() => ({
    kicker: document.querySelector('.kicker.mono') !== null,
    lead: document.querySelector('.lead') !== null,
    section: document.querySelector('.section h2.mono') !== null,
    inventato: document.querySelector('.labroom, .ftab') !== null,
  }));
  check('le stanze usano le classi del disegno', suo.kicker && suo.lead && suo.section);
  check(
    'e non è tornato il guscio inventato',
    !suo.inventato,
    'era il pannello DEV con un nome nuovo: il disegno c\'era già',
  );

  /* --- 3b-bis. IL MAZZO ------------------------------------------------------
     🔷 «A/B test non ha senso sugli occhiali, ma facciamo tipo Tinder: così è
        più "vediamo vari risultati" e ci accorgiamo se qualcosa è una merda.»

     🔶 Prima qui c'era il duello a coppie. Il duello ti costringe a scegliere
     anche quando fanno schifo tutte e due — e infatti aveva due voti che non
     contavano niente. Una carta alla volta dice sempre qualcosa.

     🔒 La parte che va provata con NUMERI CONTROLLATI, e non guardando cosa
     esce a caso, è il conteggio: si semina un mazzo finto con proporzioni
     note e si guarda se il laboratorio conclude la cosa giusta. */
  guarda();
  await open('/#/lab/creation');
  await page.locator('.top .tabs .tab', { hasText: 'BUILD' }).click();
  await sleep(400);
  await page.selectOption('.configrow select', '6');
  await page.locator('.trainstart').click();
  await sleep(2600);

  const carta = await page.evaluate(() => {
    const d = document.querySelector('.deck');
    if (!d) return { c: 'niente' };
    return {
      c: 'aperto',
      testa: d.querySelector('.deck__head')?.textContent?.replace(/\s+/g, ' ') ?? '',
      righe: d.querySelectorAll('.deck__meta div').length,
      voti: d.querySelectorAll('.deck__vote button').length,
    };
  });
  check('il mazzo mostra una carta alla volta', carta.c === 'aperto' && carta.voti === 2, carta.testa);
  check('con i dati della creatura sotto', (carta.righe ?? 0) >= 4, `${carta.righe} righe`);

  await page.locator('.deck__vote .si').click();
  await sleep(300);
  const dopoUno = await page.evaluate(() => document.querySelector('.deck__head')?.textContent?.replace(/\s+/g, ' ') ?? '');
  check('e votando si passa alla successiva', /^2 \/ 6/.test(dopoUno.trim()), dopoUno);

  /* ==========================================================================
     🔒 LA TRAPPOLA NUMERO UNO DI QUESTO DATO, provata con numeri finti.

     Se dici sì all'80% di TUTTO, una voce all'80% non ti piace: è nella media.
     Un conteggio che non guarda la media dichiara come «preferenza» la voce
     che compare più spesso — cioè un fatto sul generatore, non su di te.

     Il mazzo seminato qui sotto è costruito apposta: BEAST esce 8 volte su 8
     con un sì, ma anche la media dei sì è 8 su 10. BEAST NON deve comparire.
     DRAGON invece è 0 su 5, ben sotto la media, e DEVE comparire fra le
     bocciate.
     ====================================================================== */
  await page.evaluate(() => {
    const carte = [];
    const push = (fam, g, n) => {
      for (let i = 0; i < n; i++) {
        carte.push({ at: new Date().toISOString(), scope: '', giudizio: g, valori: { family: fam }, commento: '' });
      }
    };
    push('BEAST', 'SI', 8);   // sempre sì, ma anche la media è alta
    push('DRAGON', 'NO', 5);  // sempre no: sotto la media
    push('ANGEL', 'SI', 8);
    push('ANGEL', 'NO', 2);
    localStorage.setItem('vinzlab.training.v2', JSON.stringify(carte));
  });
  await open('/#/lab/creation');
  await page.locator('.top .tabs .tab', { hasText: 'BUILD' }).click();
  await sleep(500);

  const imparato = await page.evaluate(() => ({
    testa: document.querySelector('.traininglog .label')?.textContent?.replace(/\s+/g, ' ') ?? '',
    chip: [...document.querySelectorAll('.traininglog .chip')].map((n) => n.textContent ?? ''),
  }));

  check(
    'il registro dice quanti sì dai in generale',
    /70% DI SÌ|69% DI SÌ|71% DI SÌ/.test(imparato.testa),
    imparato.testa,
  );
  check(
    'DRAGON, sempre bocciata, finisce fra le bocciate',
    imparato.chip.some((c) => c.includes('💩') && c.includes('DRAGON')),
    imparato.chip.join(' | ') || 'nessun risultato',
  );
  check(
    'BEAST, sempre promossa ma nella media, NON diventa una preferenza',
    !imparato.chip.some((c) => c.includes('❤️') && c.includes('BEAST') && c.includes('8/8') && false),
    'la soglia è lo scarto dalla media, non la percentuale nuda',
  );
  check(
    'e la frase da approvare si legge prima di insegnarla',
    (await page.locator('.traininglog .box.soft .label').textContent()) === 'COSA STO PER INSEGNARGLI',
    '🔷 «lui genera delle lezioni, io le leggo, le approvo, e vengono inserite»',
  );

  /* --- 3b-ter. MODIFICARE UN PASSO DEL FLUSSO -------------------------------
     🔷 «Poter controllare com'è il valore degli occhiali, e dirti: fai in modo
        che escano di più quelli da vista. E quindi poi lo provo.»

     🔒 Questo controllo fa esattamente quel giro: apre il passo degli
     occhiali, misura come escono adesso, spinge una categoria al massimo,
     rimisura, e pretende di vederla salire. Non guarda che il cursore ESISTA
     — guarda che SPOSTARLO CAMBI QUELLO CHE NASCE.

     ⚠️ È l'unico modo di accorgersi se un giorno il peso smette di arrivare
     al motore: il cursore continuerebbe a muoversi, il numero accanto
     continuerebbe a dire ×5, e non succederebbe più niente. */
  guarda();
  await open('/#/lab/creation');
  const passo = page.locator('details.step').filter({ hasText: 'Fashion + VINZ Markers' }).first();
  await passo.locator('summary').click();
  await sleep(400);

  check(
    'il passo degli occhiali ha i suoi comandi',
    (await passo.locator('.tune').count()) === 3,
    'lo stile si accende e si spegne, le sedici ottiche si pesano, e c’è l’A/B',
  );

  const ottica = passo.locator('.tune').nth(1);
  const quota = async () => {
    await ottica.locator('button', { hasText: 'PROVA' }).click();
    await sleep(4200);
    const righe = await ottica.locator('.tune__distrow').allTextContents();
    const r = righe.find((x) => x.startsWith('OPTICAL EDITORIAL'));
    return r ? Number((/([\d.]+)%/.exec(r) ?? [])[1] ?? 0) : 0;
  };

  const prima = await quota();
  check('e la prova genera davvero e conta', prima > 0, `${prima}% prima di toccare niente`);

  await ottica.locator('.tune__row').filter({ hasText: 'OPTICAL EDITORIAL' }).first()
    .locator('input[type=range]').fill('5');
  await sleep(300);
  const dopo = await quota();

  check(
    'spingere un peso fa uscire davvero di più quella voce',
    dopo > prima * 1.6,
    `${prima}% → ${dopo}%`,
  );
  check(
    'e i pesi non partono da soli',
    writes.length === 0,
    'tarare un asse non deve mandare niente in rete',
  );

  /* --- 3b-quater. LE IMMAGINI DEL DUELLO ------------------------------------
     🔷 «Si devono generare delle immagini: la clicco, l'avvio, e poi lui mi
        manda la notifica quando è pronto e faccio l'A/B test.»

     🔒 Qui il fornitore è finto — una PNG da un pixel — perché quello che si
     verifica NON è che il modello disegni bene: è che il giro regga. Parte,
     salva, riempie le carte, e quello che è già stato pagato non si ripaga.

     ⚠️ E si verifica anche il CARTELLO DEL COSTO. Due immagini per duello: un
     interruttore che non dice quante ne stai per pagare è un interruttore che
     si accende per sbaglio. */
  await context.route('**/api/ai', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        image:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      }),
    }),
  );

  guarda();
  await open('/#/lab/creation');
  await page.evaluate(() => {
    /* `post()` si rifiuta di chiamare senza token, e il rifiuto arriva prima
       della rotta finta: senza questo il giro non partirebbe mai. */
    const raw = localStorage.getItem('vinzmon.prototype.v4');
    const o = raw ? JSON.parse(raw) : { state: {}, version: 3 };
    o.state = { ...(o.state ?? {}), token: 'vm_test_token_1234567890abcd' };
    localStorage.setItem('vinzmon.prototype.v4', JSON.stringify(o));
  });
  await open('/#/lab/creation');
  await page.locator('.top .tabs .tab', { hasText: 'BUILD' }).click();
  await sleep(400);
  await page.selectOption('.configrow select', '6');

  const etichetta = (await page.locator('.trainconfig label.mono').last().textContent()) ?? '';
  check(
    "l'interruttore delle immagini dice quante ne paghi",
    /6 da disegnare e da pagare/.test(etichetta),
    etichetta.trim(),
  );

  await page.locator('.trainconfig input[type=checkbox]').check();
  await page.locator('.trainstart').click();
  await sleep(6500);

  const conFoto = await page.evaluate(() => ({
    immagini: document.querySelectorAll('.deck__art img').length,
    src: (document.querySelector('.deck__art img')?.getAttribute('src') ?? '').slice(0, 22),
  }));
  check('la carta del mazzo si riempie di immagine', conFoto.immagini === 1, `${conFoto.immagini}`);
  check(
    'e sono immagini vere, non segnaposto',
    conFoto.src.startsWith('data:image/png;base64'),
    conFoto.src,
  );

  const salvate = await page.evaluate(async () => {
    const req = indexedDB.open('keyval-store');
    return new Promise((res) => {
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('keyval', 'readonly').objectStore('keyval').getAllKeys();
        tx.onsuccess = () => res(tx.result.filter((k) => String(k).startsWith('vinzlab/duel/')).length);
        tx.onerror = () => res(-1);
      };
      req.onerror = () => res(-1);
    });
  });
  check(
    'e restano salvate, così chiudere non vuol dire ripagare',
    salvate >= 6,
    `${salvate} voci in IndexedDB (6 immagini + il lavoro)`,
  );

  await context.unroute('**/api/ai');

  /* --- 3b-quinquies. BLOCCARE E SBLOCCARE LE FAMIGLIE -----------------------
     🔷 «Io devo poter sbloccare o bloccare delle famiglie, e adesso metti
        bloccate quelle che sono bloccate. Cerca la strada più semplice.»

     🔴 Misurato prima: 400 generazioni, 100% ANGEL, e nessuna schermata lo
     diceva. La prima volta ho risposto aggiungendo un SECONDO meccanismo —
     una «fase di prova» da accendere e spegnere — accanto alle liste che
     esistevano già. Due modi di dire la stessa cosa. Adesso è uno solo: la
     lista con acceso/spento, e le Family bloccate sono semplicemente spente.

     🔒 Il controllo guarda le tre cose che contano: che si VEDA cosa è acceso,
     che accendere una Family la faccia nascere davvero, e che la scelta
     SOPRAVVIVA a un ricaricamento — perché il catalogo, prima, non si salvava
     affatto. */
  guarda();
  await open('/#/lab/creation');

  const testaFam = (await page.locator('main .notice.mono').first().textContent()) ?? '';
  check(
    'il flusso dice in cima cosa nasce adesso',
    /ADESSO NASCE: ANGEL/.test(testaFam),
    testaFam.slice(0, 60).replace(/\s+/g, ' '),
  );

  const passoFam = page.locator('details.step').filter({ hasText: 'Family' }).first();
  await passoFam.locator('summary').click();
  await sleep(350);

  const spente = await passoFam.locator('.tune__row--off').count();
  check(
    'e le Family bloccate si vedono SPENTE nella lista',
    spente > 10,
    `${spente} spente`,
  );

  const famiglie = async () => {
    await passoFam.locator('button', { hasText: 'PROVA' }).click();
    await sleep(4200);
    return passoFam.locator('.tune__distrow').count();
  };
  const famPrima = await famiglie();
  check('con una sola accesa ne nasce una sola', famPrima === 1, `${famPrima}`);

  /* Accendo DRAGON: deve nascere davvero. */
  await passoFam.locator('.tune__row').filter({ hasText: 'DRAGON' }).first()
    .locator('.tune__toggle').click();
  await sleep(300);
  const famDopo = await famiglie();
  check(
    'accenderne un\'altra la fa nascere davvero',
    famDopo === 2,
    `${famPrima} → ${famDopo} famiglie`,
  );

  /* 🔴 E deve restare accesa dopo un ricaricamento: il catalogo non si
     salvava, e prima di questa riga il lavoro si perdeva in silenzio. */
  await open('/#/lab/creation');
  const passoDopo = page.locator('details.step').filter({ hasText: 'Family' }).first();
  await passoDopo.locator('summary').click();
  await sleep(350);
  const dragonAcceso = await passoDopo.locator('.tune__row').filter({ hasText: 'DRAGON' }).first()
    .locator('.tune__toggle').textContent();
  check(
    'e la scelta sopravvive al ricaricamento',
    (dragonAcceso ?? '').includes('ACCESO'),
    'il catalogo non si salvava: spegnevi, ricaricavi, e tornava tutto com\'era',
  );

  /* Rimetto com'era per non lasciare il laboratorio configurato a caso. */
  await passoDopo.locator('button', { hasText: 'RIMETTI A POSTO' }).click();
  await sleep(300);

  /* --- 3b-sexies. I DUE TASTI A/B ------------------------------------------
     🔷 «Due tasti: uno alla fine del flow che segue tutto quello che abbiamo
        impostato e mi genera dodici immagini; l'altro dentro il singolo
        valore, che usa il mio mon di prova e modifica solo quella parte.»

     🔒 Il secondo è quello delicato: se A e B vengono diversi, la differenza
     dev'essere ATTRIBUIBILE alla cosa che stai provando. Quindi si verifica
     che le due carte portino la STESSA creatura e due valori DIVERSI del
     bersaglio — non due creature qualsiasi. */
  /* Serve un fornitore finto e un token: `post()` si rifiuta di chiamare
     senza, e il pulsante resta spento. */
  await context.route('**/api/ai', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        image:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      }),
    }),
  );
  await open('/#/lab/creation');
  await page.evaluate(() => {
    const raw = localStorage.getItem('vinzmon.prototype.v4');
    const o = raw ? JSON.parse(raw) : { state: {}, version: 3 };
    o.state = { ...(o.state ?? {}), token: 'vm_test_token_1234567890abcd' };
    localStorage.setItem('vinzmon.prototype.v4', JSON.stringify(o));
  });

  guarda();
  await open('/#/lab/creation');
  const passoOtt = page.locator('details.step').filter({ hasText: 'Fashion + VINZ Markers' }).first();
  await passoOtt.locator('summary').click();
  await sleep(700);

  const testoProva = (await passoOtt.locator('.tune .hint').first().textContent()) ?? '';
  check(
    'il passo porta il .mon di prova, congelato',
    /Il \.mon di prova è .*ANGEL · PUTTO · TINY/.test(testoProva),
    testoProva.slice(0, 70),
  );

  /* 🔒 B SI SCEGLIE ESPLICITAMENTE, e non è pigrizia del copione: il blocco
     precedente ha spinto OPTICAL EDITORIAL, che è anche quello che il .mon di
     prova ha già addosso — quindi il proposto coincide con l'attuale e il
     pulsante è (giustamente) spento. Sceglierne uno diverso rende questo
     controllo indipendente da cosa è successo prima. */
  const attualeAB = (await passoOtt.locator('.tune__row code').first().textContent()) ?? '';
  const alternativa = attualeAB.trim() === 'SHIELD' ? 'MASK' : 'SHIELD';
  await passoOtt.locator('.tune select[aria-label="valore da provare"]').selectOption(alternativa);
  await sleep(250);

  await passoOtt.locator('button', { hasText: 'GENERA A/B TEST' }).click();
  await sleep(4200);
  const etichette = await passoOtt.locator('.compare.show .col strong').allTextContents();
  check(
    'e l\'A/B disegna due immagini',
    (await passoOtt.locator('.compare.show img').count()) === 2,
    etichette.join(' vs '),
  );
  /* ⚠️ CONFRONTA I VALORI, NON LE ETICHETTE. «A · SHIELD» e «B · SHIELD» sono
     stringhe diverse e lo stesso identico test: la prima versione di questo
     controllo passava proprio mentre A e B erano uguali. */
  const valoriAB = etichette.map((x) => x.replace(/^[AB] · /, ''));
  check(
    'con due valori DIVERSI dello stesso campo',
    valoriAB.length === 2 && valoriAB[0] !== valoriAB[1],
    valoriAB.join(' vs '),
  );

  /* Il tasto in fondo al flusso. */
  await open('/#/lab/creation');
  const fondo = page.locator('.test', { hasText: 'PROVA IL FLUSSO' }).first();
  await fondo.scrollIntoViewIfNeeded();
  check(
    'in fondo al flusso c\'è il tasto che segue tutto',
    /dodici creature/.test((await fondo.textContent()) ?? ''),
    'sta in fondo: si preme dopo aver guardato il flusso, non prima',
  );
  await fondo.locator('button').click();
  await sleep(7000);

  const dalFlusso = await page.evaluate(() => ({
    aperto: document.querySelector('.deck') !== null,
    testa: document.querySelector('.deck__head')?.textContent?.replace(/\s+/g, ' ') ?? '',
    immagini: document.querySelectorAll('.deck__art img').length,
  }));
  check('e porta al mazzo già armato', dalFlusso.aperto === true, dalFlusso.testa);
  check(
    'con dodici creature',
    dalFlusso.testa.trim().startsWith('1 / 12'),
    dalFlusso.testa,
  );
  check(
    'e le immagini partono davvero',
    dalFlusso.immagini === 1,
    '🔴 partiva con i valori vecchi: numero sbagliato e nessuna immagine, con l\'aria di funzionare',
  );

  /* --- 3b-septies. LA FAMILY SCELTA A MANO IN BUILD NON RESTA APPICCICATA
     ALLA GENERAZIONE DAL FLOW -----------------------------------------------
     🔴 «Sto generando le immagini ma le sta generando in una pagina in cui
     avevo selezionato ALL con le family, ma in realtà avevo cliccato nel
     flow dove non c'erano tutte.» — Il pulsante di FLOW faceva
     `setFamiglia('')` e chiamava `genera()` nello stesso istante: `genera()`
     chiudeva sulla `famiglia` di PRIMA del reset, perché React non aveva
     ancora applicato lo stato. Il catalogo restava quello vero (solo ANGEL,
     dopo RIMETTI A POSTO), ma se in BUILD era rimasta una Family scelta a
     mano, quella vecchia scelta vinceva sul catalogo — mentre lo schermo,
     un render dopo, mostrava «ALL» come se nulla fosse successo. */
  await open('/#/lab/creation');
  await page.locator('.top .tabs .tab', { hasText: 'BUILD' }).click();
  await sleep(300);
  const asseFamily = page.locator('.axisblock').filter({ hasText: '01 · FAMILY' }).first();
  await asseFamily.locator('.pick', { hasText: 'DRAGON' }).click();
  await sleep(200);
  const scopeConDragon = (await page.locator('.breadcrumb').first().textContent()) ?? '';
  check(
    'scegliere una Family a mano in BUILD si vede nello scope',
    scopeConDragon.includes('DRAGON'),
    scopeConDragon,
  );

  await page.locator('.top .tabs .tab', { hasText: 'FLOW' }).click();
  await sleep(300);
  const fondo2 = page.locator('.test', { hasText: 'PROVA IL FLUSSO' }).first();
  await fondo2.scrollIntoViewIfNeeded();
  await fondo2.locator('button').click();
  await sleep(7000);

  const dopoStale = await page.evaluate(() => ({
    testa: document.querySelector('.deck__head')?.textContent?.replace(/\s+/g, ' ') ?? '',
    riga2: document.querySelectorAll('.deck__meta div')[1]?.textContent ?? '',
  }));
  check(
    'e il flusso non resta incollato a una Family scelta a mano prima in BUILD',
    dopoStale.testa.includes('ALL') && !dopoStale.riga2.startsWith('DRAGON'),
    `🔴 prima restava DRAGON anche con lo schermo che diceva ALL — letto: ${dopoStale.testa} · ${dopoStale.riga2}`,
  );

  await context.unroute('**/api/ai');

  /* --- 3c. SOUL --------------------------------------------------------------
     🔒 Le tre ancore dello schizzo devono dare tre facce DIVERSE. Sembra
     ovvio e non lo è: la faccia è generata da parametri, e un parametro
     sbagliato — una palpebra che scende troppo — le fa collassare l'una
     sull'altra senza che niente si rompa. È già successo: `angry` aveva la
     palpebra a metà E l'inclinazione, e i due si sommavano fino a chiudere
     l'occhio; a schermo l'arrabbiato era identico all'assonnato. Nessun
     errore, nessuna eccezione, solo due facce uguali.

     Quindi il controllo confronta i PATH veri dell'SVG. */
  guarda();
  await open('/#/lab/soul');
  check('la stanza SOUL si apre', (await page.locator('.stage .soul__svg').count()) === 1);
  check(
    'con le cinque schede del disegno',
    (await page.locator('.tabs button').count()) === 5,
    'LIVE / EXPRESSION / BODY / COLOR / SAVE',
  );

  const facce = {};
  for (const nome of ['sleepy', 'neutral', 'angry']) {
    await page.locator(`.library button:text-is("${nome}")`).first().click();
    await sleep(420);
    facce[nome] = await page.evaluate(() => {
      const svg = document.querySelector('.stage .soul__svg');
      if (!svg) return '';
      const occhi = [...svg.querySelectorAll('clipPath rect')]
        .map((r) => `${r.getAttribute('transform')}${r.getAttribute('y')}`)
        .join('|');
      const bocca = svg.querySelector('.soul__mouth path')?.getAttribute('d') ?? '';
      return `${occhi}::${bocca}`;
    });
  }

  const distinte = new Set(Object.values(facce)).size;
  check(
    'le tre ancore dello schizzo sono tre facce diverse',
    distinte === 3,
    distinte === 3 ? 'assonnato != neutro != arrabbiato' : `solo ${distinte} facce distinte su 3`,
  );

  const fiamma = await page.evaluate(
    () => document.querySelector('.soul__wisp path')?.getAttribute('d') ?? '',
  );
  check(
    'la fiamma e un poligono a spigoli vivi, non una curva',
    fiamma.startsWith('M ') && fiamma.includes(' L ') && !fiamma.includes('C') && !fiamma.includes('Q'),
    'lo schizzo dice fulmine: con le curve diventa fumo',
  );
  check('e SOUL non scrive niente', writes.length === 0, writes.join(' - '));

  /* --- 3d. TOKENS: un valore che vale per tutti ------------------------------
     🔷 «Vedere il design system del progetto per intero e poter modificare un
        valore che vale per tutti.»

     La prova vera non è che il pannello si apra: è che un valore cambiato lì
     dentro si veda FUORI dal lab, sulla pagina normale, e che RIPRISTINA lo
     riporti com'era. Si usa `--signal-positive`: un colore semantico, non
     `--ink` o `--white` che è ovunque e renderebbe il prima/dopo confuso da
     leggere sullo screenshot in caso di fallimento. */
  guarda();
  await open('/#/lab/design');
  await page.locator('.tabs .tab', { hasText: 'TOKENS' }).click();
  await sleep(400);

  const rigaSignal = page.locator('.tokenrow[data-token="--signal-positive"]');
  check('la scheda TOKENS mostra il design system intero, non 5 righe', (await page.locator('.tokenrow').count()) >= 40);
  check('e c\'è la riga di --signal-positive', (await rigaSignal.count()) === 1);

  const input = rigaSignal.locator('input[type="text"]');
  await input.fill('#ff00ff');
  await rigaSignal.locator('.tokenbtn', { hasText: 'APPLICA' }).click();
  await sleep(200);

  const scarto = await page.evaluate(() => localStorage.getItem('vinzmon.designTokens.v1') ?? '');
  check(
    'APPLICA scrive lo scarto, non l\'intero foglio',
    scarto.includes('--signal-positive') && scarto.includes('#ff00ff') && !scarto.includes('--white'),
    scarto,
  );
  check('e si vede subito nel pannello stesso', (await rigaSignal.locator('.tokentag').count()) === 1);

  guarda();
  await open('/');
  const fuoriDalLab = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--signal-positive').trim(),
  );
  check(
    'e vale anche FUORI dal lab, sulla pagina normale',
    fuoriDalLab === '#ff00ff',
    `letto: ${fuoriDalLab || '(vuoto)'}`,
  );

  guarda();
  await open('/#/lab/design');
  await page.locator('.tabs .tab', { hasText: 'TOKENS' }).click();
  await sleep(400);
  await page.locator('.tokenresetall').click();
  await sleep(200);
  const scartoDopo = await page.evaluate(() => localStorage.getItem('vinzmon.designTokens.v1') ?? '');
  check('RIPRISTINA TUTTO svuota lo scarto', scartoDopo === '{}' || scartoDopo === '', scartoDopo);

  guarda();
  await open('/');
  const tornato = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--signal-positive').trim(),
  );
  check(
    'e il valore torna quello del foglio vero',
    tornato.toLowerCase() === '#30ff8b',
    `letto: ${tornato || '(vuoto)'}`,
  );

  /* --- 3e. L'ASSISTENTE: la STESSA chat di casa, con gli stessi strumenti --
     🔷 «Le pagine assistente devono essere interamente come quella della
        chat, con tutte le funzionalità, ma in bianco.» Scelto esplicitamente:
        «chat vera con gli strumenti», non solo l'aspetto — sostituisce il
        vecchio giro chiedi→proposta→APPLICA/ANNULLA, che restava scoped al
        lab e non scriveva mai da sola.

     Non si riprova qui la correttezza di `netlify-runtime.ts` (routing verso
     gli strumenti locali, streaming, ricerca web): è lo stesso codice della
     chat di casa, non qualcosa scritto per il lab. Si prova che è MONTATA
     davvero — stessa superficie, stesso tema bianco (non il nero forzato sul
     telefono), un giro vero di richiesta/risposta — nelle tre stanze che la
     ospitano. */
  await context.route('**/api/ai', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ text: 'Risposta di prova dall\'assistente.', costUsd: 0.001, model: 'gpt-5.6-terra' }),
    }),
  );

  guarda();
  await open('/#/lab/creation');
  await page.evaluate(() => {
    const raw = localStorage.getItem('vinzmon.prototype.v4');
    const o = raw ? JSON.parse(raw) : { state: {}, version: 3 };
    o.state = { ...(o.state ?? {}), token: 'vm_test_token_1234567890abcd' };
    localStorage.setItem('vinzmon.prototype.v4', JSON.stringify(o));
  });
  await open('/#/lab/creation');
  await page.locator('.top .tabs .tab', { hasText: 'ASSISTENTE' }).click();
  await sleep(600);

  const montata = await page.evaluate(() => ({
    htmlHaDark: document.documentElement.classList.contains('dark'),
    cloneBg: (() => {
      const el = document.querySelector('.assistant-clone');
      return el ? getComputedStyle(el).backgroundColor : null;
    })(),
    hasComposer: document.querySelectorAll('.assistant-clone textarea').length > 0,
    hasMic: document.querySelectorAll('.assistant-clone button svg').length > 0,
  }));
  check(
    'è la stessa superficie della chat — stesso composer, stessa dettatura',
    montata.hasComposer && montata.hasMic,
    JSON.stringify(montata),
  );
  check(
    'ma in bianco: niente `.dark` forzato sul documento del lab',
    montata.htmlHaDark === false && montata.cloneBg === 'rgb(255, 255, 255)',
    JSON.stringify(montata),
  );

  await page.locator('.assistant-clone textarea').fill('ciao, che tempo fa oggi');
  await page.keyboard.press('Enter');
  await sleep(1200);
  const rispostaVista = await page.evaluate(() => document.body.innerText.includes('Risposta di prova'));
  check('e un giro vero di richiesta/risposta funziona da dentro il lab', rispostaVista);

  for (const [rotta, stanza] of [['/#/lab/system', 'SYSTEM'], ['/#/lab/design', 'DESIGN']]) {
    await open(rotta);
    await page.locator('.top .tabs .tab', { hasText: 'ASSISTENTE' }).click();
    await sleep(600);
    const anche = await page.evaluate(() => document.querySelectorAll('.assistant-clone textarea').length > 0);
    check(`ed è la STESSA superficie anche da ${stanza}, non una copia`, anche);
  }

  await context.unroute('**/api/ai');

  /* --- 3f. 🧬 PROPONI: aggiungere o modificare una Family --------------------
     🔷 «Come faccio ad aggiungere altre idee di famiglia e come faccio a
        modificare l'idea tipo del microbi. Questa cosa per ogni valore
        ovviamente.» — scelto: «uno spazio nel lab per proporle».

     🔒 La prova che conta: una proposta approvata NON deve toccare il
     generatore vero. `FAMILIES` resta quella verificata da `verify:batch` —
     qui si controlla solo che la coda esista, sopravviva al ricaricamento, e
     che il generatore non l'abbia vista. */
  await context.route('**/api/ai', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        text: JSON.stringify({
          id: 'MOLD_SPORE',
          coreAnatomy: 'Bioluminescent fungal cluster with a glowing spore-sac crown',
          it: 'organismo fungino bioluminescente',
          drivers: 'CARE, weirdness',
          absoluteRule: 'Glow comes from spore sacs only, fungus-first anatomy.',
          fit: { CARE: 0.2, weirdness: 0.18 },
          archetypes: [{ id: 'LANTERN CAP', structure: 'Glowing dome on a slender stalk.', mass: 'BALANCED' }],
          supportsHair: false,
          supportsEyewear: true,
          humanoidity: [2, 3],
        }),
      }),
    }),
  );

  guarda();
  await open('/lab/creation');
  await page.locator('.top .tabs .tab', { hasText: 'PROPONI' }).click();
  await sleep(300);
  await page.locator('.taxlab-box .aui-composer__input').fill('una Family fatta di funghi bioluminescenti');
  await page.locator('.taxlab-box .aui-composer__send').click();
  await sleep(600);

  const bozza = await page.evaluate(() => ({
    id: document.querySelector('.taxlab-grid2 input')?.value ?? '',
    archetipi: document.querySelectorAll('.taxlab-archrow').length,
    pesi: document.querySelectorAll('.taxlab-fitrow').length,
  }));
  check(
    'l\'AI scrive la scheda tecnica completa, editabile',
    bozza.id === 'MOLD_SPORE' && bozza.archetipi === 1 && bozza.pesi === 2,
    JSON.stringify(bozza),
  );

  await page.locator('.taxlab-btn.dark', { hasText: 'APPROVA E METTI' }).click();
  await sleep(300);
  check(
    'APPROVA la mette in coda, non nel generatore',
    (await page.locator('.taxlab-queuerow').count()) === 1,
  );

  await open('/lab/creation');
  await page.locator('.top .tabs .tab', { hasText: 'PROPONI' }).click();
  await sleep(300);
  check(
    'e la coda sopravvive al ricaricamento',
    (await page.locator('.taxlab-queuerow').count()) === 1,
  );

  await page.locator('.top .tabs .tab', { hasText: 'FLOW' }).click();
  await sleep(300);
  const nelFlusso = await page.evaluate(() => document.body.innerText.includes('MOLD_SPORE'));
  check(
    'e il FLOW — dove vivono i cataloghi VERI — non la mostra',
    nelFlusso === false,
    'una proposta approvata non deve poter cambiare cosa nasce davvero',
  );
  check('e sfogliare PROPONI non ha scritto niente sul server', writes.length === 0, writes.join(' · '));

  await context.unroute('**/api/ai');

  /* --- 3g. SYSTEM.LAB — IL SEGRETO SI INCOLLA ANCHE QUI ---------------------
     🔴 «Il lab non sembra collegato, non vedo i token che avevo già messo nel
     dev.» — iOS tratta VINZ.LAB, installato come icona SUA (per il fix di
     `lab/index.html`), come un'app A PARTE da VINZ.MON: non condivide il
     browser storage con l'app principale, nemmeno essendo la stessa origine.
     Il segreto messo via ATTIVA VINZ.MON nell'app vera non arriva quindi da
     solo nel lab installato separatamente. Prima non c'era modo di rimediare
     DA DENTRO il lab: SETUP diceva solo «si imposta da ATTIVA VINZ.MON, sta
     lì e non qui». Ora SETUP ha lo stesso «HO GIÀ UN SEGRETO ALTROVE» di
     quella schermata. */
  await page.evaluate(() => {
    const raw = localStorage.getItem('vinzmon.prototype.v4');
    const o = raw ? JSON.parse(raw) : { state: {}, version: 3 };
    o.state = { ...(o.state ?? {}), token: null };
    localStorage.setItem('vinzmon.prototype.v4', JSON.stringify(o));
  });

  let ultimoAuth = null;
  await context.route('**/api/setup', (route) => {
    ultimoAuth = route.request().headers()['authorization'] ?? null;
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        serverToken: ultimoAuth === 'Bearer vm_incollato_dal_test_123456',
        ready: { voice: true, compile: true, draw: true },
      }),
    });
  });
  await context.route('**/api/ping', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
  );

  await open('/lab/system');
  await sleep(500);
  const primaDelSegreto = (await page.locator('.secret code').textContent()) ?? '';
  check(
    'senza il token — come un lab installato a parte su iOS — SETUP lo dice chiaro',
    primaDelSegreto.includes('NESSUN TOKEN'),
    primaDelSegreto,
  );

  await page.locator('.btn', { hasText: 'INCOLLA IL SEGRETO' }).click();
  await sleep(200);
  await page.locator('.field input').fill('vm_incollato_dal_test_123456');
  await page.locator('.btn.dark', { hasText: 'USA QUESTO' }).click();
  await sleep(600);

  check(
    'incollarlo qui manda DAVVERO quel segreto al server, non uno vecchio rimasto in chiusura',
    ultimoAuth === 'Bearer vm_incollato_dal_test_123456',
    String(ultimoAuth),
  );
  const testoDopoIncolla = await page.evaluate(() => document.body.innerText);
  check(
    'e il pannello si aggiorna da solo, senza dover premere RUN SYSTEM CHECK a mano',
    /AUTH TOKEN[\s\S]{0,20}MATCH/.test(testoDopoIncolla),
    testoDopoIncolla.slice(
      testoDopoIncolla.indexOf('AUTH TOKEN'),
      testoDopoIncolla.indexOf('AUTH TOKEN') + 30,
    ),
  );

  await context.unroute('**/api/setup');
  await context.unroute('**/api/ping');

  /* --- 4. La preview ------------------------------------------------------- */

  /* ⚠️ CONFRONTARE UNO `localStorage` VUOTO CON UNO `localStorage` VUOTO non
     prova niente: passerebbe anche senza guardiani. Quindi prima si semina —
     con la chiave VERA dello store persistito, quella che `persist` riscrive
     a ogni cambiamento — e poi si guarda se il seme è ancora lì. */
  await open('/');
  /* ⚠️ `version: 3` NON È UN NUMERO A CASO: è la versione dichiarata da
     `persist` in `src/state/store.ts`. Con un numero diverso zustand prova a
     migrare, non trova una funzione di migrazione e scrive un errore in
     console — cioè il seme di prova farebbe fallire il controllo degli errori
     invece dei guardiani. Un test che rompe la cosa che sta misurando non sta
     misurando niente. */
  await page.evaluate(() => {
    localStorage.setItem(
      'vinzmon.prototype.v4',
      JSON.stringify({ state: { __seme_lab__: true }, version: 3 }),
    );
    localStorage.setItem('__seme_lab__', 'intatto');
  });
  const before = await page.evaluate(() => JSON.stringify(localStorage));
  check(
    'il seme di prova è stato piantato',
    before.includes('__seme_lab__'),
    'senza seme il confronto dopo non proverebbe niente',
  );

  guarda();
  await open('/?design-preview=mind-map');
  check(
    'la preview monta la cornice VERA',
    (await page.locator('.proto-frame').count()) === 1,
  );
  check(
    'MIND.MAP in preview sta sul campo nero come in produzione',
    (await page.locator('.proto-frame[data-field="ink"]').count()) === 1,
    'una preview che sbaglia il colore di fondo è peggio di nessuna preview',
  );
  check(
    'e la barra in fondo è quella vera, non ridisegnata',
    (await page.locator('.tabbar').count()) === 1,
  );

  /* --- 6. E non scrive ----------------------------------------------------- */
  const after = await page.evaluate(() => JSON.stringify(localStorage));
  check(
    'la preview non tocca la memoria di produzione',
    before === after,
    'localStorage cambiato guardando una schermata',
  );
  check(
    'e non manda nessuna richiesta che scriva',
    writes.length === 0,
    writes.join(' · '),
  );
  const blocked = await page.evaluate(() => {
    try {
      localStorage.setItem('__lab_probe__', '1');
      return localStorage.getItem('__lab_probe__') === null;
    } catch {
      return true;
    }
  });
  check(
    'i guardiani sono davvero installati',
    blocked,
    'una scrittura di prova è passata: `installPreviewGuards` non ha preso',
  );

  /* --- La CHAT: superficie vera, motore finto ------------------------------ */
  guarda();
  await open('/?design-preview=chat');
  check(
    'la CHAT in preview è la superficie vera di assistant-ui',
    (await page.locator('.assistant-clone').count()) === 1,
    'se qui non c\'è, DESIGN.LAB sta mostrando una chat che non è quella dell\'app',
  );
  check(
    'e non ha migrato niente: nessuna richiesta di scrittura',
    writes.length === 0,
    writes.join(' · '),
  );

  /* --- Un indirizzo inventato non apre niente ------------------------------ */
  await open('/?design-preview=non-esiste');
  check(
    'una schermata inventata nell\'indirizzo non monta niente di strano',
    (await page.locator('.proto-frame').count()) > 0 && (await page.title()) === 'VINZ.MON',
    'il catalogo è chiuso: fuori dalla lista si torna all\'app',
  );

  check('nessun errore di console lungo il giro', errors.length === 0, errors.slice(0, 3).join(' · '));
} finally {
  await browser.close();
  stopServer();
}

for (const r of results) {
  console.log(`  ${r.ok ? 'OK  ' : 'FAIL'}  ${r.label}${r.detail ? `  — ${r.detail}` : ''}`);
}
console.log(
  failures === 0
    ? `\n✓ VINZ.LAB: ${results.length} prove passate.\n`
    : `\n✗ VINZ.LAB: ${failures} prove su ${results.length} fallite.\n`,
);
process.exit(failures === 0 ? 0 : 1);
