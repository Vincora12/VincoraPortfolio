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
    'e il manifest suo, così l\'icona sulla Home è un\'altra',
    (await page.locator('link[rel="manifest"]').getAttribute('href')) === '/lab-manifest.webmanifest',
  );
  check(
    'su «/#/lab» VINZ.MON non è montata',
    (await page.locator('.proto-frame').count()) === 0,
    'due app montate insieme vorrebbe dire due store vivi',
  );

  /* --- 3. DESIGN.LAB ------------------------------------------------------- */
  await open('/#/lab/design');
  check('su «/#/lab/design» si apre DESIGN.LAB', (await page.locator('.labtitle').count()) > 0);
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

  /* --- 3b-bis. IL DUELLO DI CREATION ----------------------------------------
     🔷 «Un A/B test dovrebbe funzionare che mi genera random dei mon ed io
        scelgo quale mi piace, così lui inizia ad imparare.»

     🔴 Il controllo di prima guardava un confronto a parità di seme, che era
     la cosa sbagliata che avevo costruito io. Adesso guarda quella giusta:
     due creature DIVERSE, un voto, e un conto che cresce.

     🔒 E la parte che conta davvero è l'ultima: dopo pochi voti il
     laboratorio NON deve ancora dichiarare una preferenza. Una regola
     imparata da un caso solo entra nel prompt del resolver e ci resta — la
     soglia è la difesa, e una difesa che nessuno prova è una difesa che un
     giorno sparisce. */
  guarda();
  await open('/#/lab/creation');
  await page.locator('.top .tabs .tab', { hasText: 'BUILD' }).click();
  await sleep(400);
  await page.locator('.trainstart').click();
  await sleep(3200);

  const duello = await page.evaluate(() => {
    const s = document.querySelector('.session');
    if (!s) return { c: 'nessuna sessione' };
    const carte = [...s.querySelectorAll('.duelcard .duelmeta')].map((n) => n.textContent ?? '');
    return {
      c: 'aperta',
      carte: carte.length,
      diverse: carte.length === 2 && carte[0] !== carte[1],
      traccia: s.querySelectorAll('.tracebox .tracelines div').length,
      voti: s.querySelectorAll('.votegrid button').length,
    };
  });

  check('il duello genera due creature', duello.c === 'aperta' && duello.carte === 2);
  check(
    'e sono DIVERSE fra loro',
    duello.diverse === true,
    'due creature identiche non sono una scelta: è il difetto che aveva la versione di prima',
  );
  check('con la traccia vera del generatore', (duello.traccia ?? 0) > 0, 'WHY THIS? legge `trace.steps`');
  check('e i quattro voti del disegno', duello.voti === 4, 'A / B / BOTH / NO');

  /* Tre voti: pochi di proposito. */
  for (let i = 0; i < 3; i++) {
    const b = page.locator('.votegrid button').first();
    if ((await b.count()) === 0) break;
    await b.click();
    await sleep(320);
  }

  const dopoPochi = await page.evaluate(() => ({
    testo: document.querySelector('.traininglog')?.textContent ?? '',
    chip: document.querySelectorAll('.traininglog .chip').length,
  }));
  check(
    'i voti si contano',
    /3 CONFRONTI/.test(dopoPochi.testo),
    dopoPochi.testo.slice(0, 60),
  );
  check(
    'ma con tre voti non dichiara ancora nessun gusto',
    dopoPochi.chip === 0,
    'una regola imparata da un caso solo entra nel prompt del resolver e ci resta',
  );
  check(
    'e generare le creature del duello non ha scritto in rete',
    writes.length === 0,
    writes.join(' · '),
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
    (await passo.locator('.tune').count()) === 2,
    'lo stile si accende e si spegne, le sedici ottiche si pesano',
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
