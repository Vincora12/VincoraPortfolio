/* ============================================================================
   VERIFICA DELLE SCHERMATE

   Percorre il prototipo end-to-end con un browser headless, cattura uno
   screenshot per schermata e FALLISCE se una qualsiasi pagina produce un
   errore di console.

   Il percorso ricalca la prova end-to-end del piano:
   incubazione → hatch → home → conversazione → giorni sincronizzati → ME →
   shift → micro-growth → shift → form evolution → new encounter → tutte le
   schermate di consultazione → pannello DEV.

   Uso:  npm run verify                          (avvia da solo il server di sviluppo)
         VERIFY_BASE=https://… npm run verify    (percorre un sito già pubblicato)

   La seconda forma serve a non verificare un deploy «a occhio»: gira la stessa
   camminata contro la produzione, dove il bundle è minificato e i percorsi
   degli asset sono altri — cioè dove una build può rompersi senza che il
   server di sviluppo se ne accorga.
   ========================================================================= */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const OUT = 'screenshots';
const PORT = 5199;

// Con VERIFY_BASE si percorre un sito già pubblicato e non si avvia niente.
const REMOTE = process.env.VERIFY_BASE?.replace(/\/$/, '');
const BASE = REMOTE ?? `http://localhost:${PORT}`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

/* --- Server di sviluppo ----------------------------------------------------- */

// `detached` mette il server in un suo gruppo di processi: alla fine si
// abbatte l'intero gruppo, altrimenti vite sopravvive a npx e lo script non
// termina mai.
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
  let serverReady = false;
  server.stdout.on('data', (d) => {
    if (d.toString().includes('ready in') || d.toString().includes('Local:')) serverReady = true;
  });

  for (let i = 0; i < 100 && !serverReady; i++) await sleep(100);
  await sleep(600);
}

/* --- Browser ---------------------------------------------------------------- */

// Verso localhost il proxy va escluso: l'ambiente instrada le uscite HTTPS
// attraverso un proxy e senza questo il browser proverebbe a passare di lì
// anche per il server locale. Verso un host esterno serve il contrario.
const PROXY = process.env.HTTPS_PROXY ?? process.env.https_proxy;
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(BASE);
const LAUNCH_ARGS = IS_LOCAL ? ['--no-proxy-server'] : [];
const LAUNCH_PROXY = IS_LOCAL || !PROXY ? undefined : { server: PROXY };

// Chromium è preinstallato nell'ambiente: non va mai scaricato.
// La revisione nel nome della cartella cambia fra le versioni di Playwright,
// quindi si prova prima la risoluzione standard e poi il binario esplicito.
const browser = await launchChromium();

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
    return chromium.launch({
      executablePath: candidates[0],
      args: LAUNCH_ARGS,
      proxy: LAUNCH_PROXY,
    });
  }
}
const page = await browser.newPage({ viewport: { width: 460, height: 920 } });

/* ============================================================================
   I BERSAGLI DELLA NAVIGAZIONE

   🔶 IL COPIONE CLICCAVA `nth-child(4)` PER ARRIVARE ALLA MINDLINE, e simili.
   Con la barra passata da quattro voci a tre — e con due schermate scese
   dentro le altre — quei numeri indicavano posti diversi da quelli scritti
   nei commenti accanto. Un copione che clicca numeri è un copione che smette
   di dire dove sta andando.

   🔒 Qui i numeri hanno un nome. Se domani l'ordine cambia si cambia questa
   tabella, non trenta righe sparse.
   ========================================================================= */
const TAB = {
  chat: '.tabbar__item:nth-child(1)',
  mon: '.tabbar__item:nth-child(2)',
  me: '.tabbar__item:nth-child(3)',
};

/** Le viste dentro MON, e dentro ME. */
const VISTA = {
  mon: '.archive__seg:nth-child(1)',
  map: '.archive__seg:nth-child(2)',
  dex: '.archive__seg:nth-child(3)',
  me: '.archive__seg:nth-child(1)',
  giorni: '.archive__seg:nth-child(2)',
};

const errors = [];

/* 🔒 Una sola finestra, dichiarata, in cui gli errori di console sono ATTESI:
   quella in cui si rompe l'app di proposito per vedere se lo dice. Fuori da
   lì il controllo resta severo — spegnerlo del tutto avrebbe voluto dire
   perdere l'unica cosa che accorge quando una schermata esplode davvero. */
let attesi = false;
page.on('console', (m) => {
  if (m.type() !== 'error' || attesi) return;
  /* La posizione, non solo il testo: un avviso di React dice COSA è
     sbagliato e mai dove, e senza questo si finisce a indovinare quale delle
     quaranta liste dell'app è quella che sbaglia le chiavi. */
  const l = m.location();
  const where = l?.url ? ` (${l.url}:${l.lineNumber}:${l.columnNumber})` : '';

  /* ⚠️ UNA ECCEZIONE STRETTA, E SOLO IN LOCALE: `/api/*` non esiste quando
     serve `vite`, che pubblica solo i file statici. Da quando il segreto si
     genera da se' al primo avvio, l'app CREDE di essere configurata e prova a
     chiamare — e il 404 che ne esce non e' un guasto, e' la condizione che
     `ai/backend.ts` documenta in testata.

     🔒 Vale SOLO senza VERIFY_BASE: contro il sito vero le funzioni ci sono, e
     li' un 404 su /api sarebbe un guasto in piena regola. Un'eccezione che
     valesse dappertutto spegnerebbe il controllo proprio dove serve. */
  const apiInLocale = !process.env.VERIFY_BASE && /\/api\//.test(`${m.text()}${where}`);
  if (apiInLocale && /404|Failed to load resource/i.test(m.text())) return;

  errors.push(`[console] ${m.text()}${where}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

let step = 0;
const shot = async (name) => {
  await sleep(220);
  step += 1;
  const file = `${OUT}/${String(step).padStart(2, '0')}-${name}.png`;
  /* ⚠️ La cornice non c'e' SEMPRE: quando l'app si rompe, `App` non monta e
     al suo posto c'e' la schermata di rottura, che vive fuori dal frame. Un
     selettore fisso qui mandava lo script in timeout invece di fotografare
     proprio la cosa che si voleva vedere. */
  const frame = page.locator('.proto-frame');
  if ((await frame.count()) > 0) await frame.screenshot({ path: file });
  else await page.screenshot({ path: file });
  console.log(`  ✓ ${file}`);
};

/** Clicca il primo elemento che corrisponde, fallendo con un messaggio utile. */
const click = async (selector, label) => {
  const el = page.locator(selector).first();
  if ((await el.count()) === 0) throw new Error(`Elemento non trovato: ${label} (${selector})`);
  await el.click();
  await sleep(180);
};

const byText = (text) => `text="${text}"`;

/* La misura sta in una funzione perche non riguarda una schermata sola: ogni
   testo scritto con un token che si inverte puo sparire su un campo, e
   l'unico modo di saperlo e misurarlo dove sta davvero. */
const contrastoDi = (selettori, dove) =>
  page
    .evaluate((sel) => {
      const lum = (c) => {
        const [r, g, b] = c.map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const parse = (s) => (s.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
      const bgOf = (el) => {
        let n = el;
        while (n) {
          const bg = getComputedStyle(n).backgroundColor;
          if (bg && !bg.includes('rgba(0, 0, 0, 0)')) return parse(bg);
          n = n.parentElement;
        }
        return [255, 255, 255];
      };

      return [...document.querySelectorAll(sel)].map((el) => {
        const fg = parse(getComputedStyle(el).color);
        const bg = bgOf(el);
        const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
        return { cls: el.className, ratio: (a + 0.05) / (b + 0.05) };
      });
    }, selettori)
    .then((misure) => {
      for (const c of misure) {
        if (c.ratio < 4.5) {
          errors.push(`contrasto insufficiente ${dove}: ${c.cls} a ${c.ratio.toFixed(2)}:1`);
        }
      }
    });


/* 🔷 §29 — DEV ha due livelli da quando quindici linguette in fila erano
   diventate un cruscotto d'aereo. Si sceglie prima il GRUPPO e poi la scheda,
   e questa funzione fa i due tocchi come li farebbe una mano. Le linguette dei
   due livelli sono entrambe `.ftab`, quindi si distinguono per FILA: la prima
   `.ftabs` e' quella dei gruppi, la seconda quella delle sezioni. */
const devTab = async (group, tab) => {
  await click(`.ftabs:nth-of-type(1) .ftab:text-is("${group}")`, `gruppo DEV ${group}`);
  if (!tab) return;
  const sub = page.locator(`.ftabs:nth-of-type(2) .ftab:text-is("${tab}")`).first();
  if ((await sub.count()) > 0) {
    await sub.click();
    await sleep(180);
  }
};

/** Il «+» del composer apre direttamente la registrazione (v1.9 §13.3). */
const openCapture = async () => {
  await click('.composer .btn-icon:first-child', 'apri REGISTRA');
};

/** I bottoni che cambiano percorso si tengono premuti; da tastiera basta Invio. */
const hold = async (label) => {
  const el = page.locator(`.hold__btn:has-text("${label}")`).first();
  if ((await el.count()) === 0) throw new Error(`Hold button non trovato: ${label}`);
  await el.press('Enter');
  await sleep(400);
};

try {
  console.log(`\n═══ VERIFICA DELLE SCHERMATE — ${BASE} ═══\n`);

  /* ════════════════════════════════════════════════════════════════════════
     🔷 «A me esce grigio.»

     Il grigio e' `#c9c9cf`, il fondo del body: vuol dire che React non ha
     montato niente. Prima di percorrere l'app si prova che quello stato NON
     puo' piu' esistere in silenzio — si sporca il salvataggio con qualcosa di
     illeggibile, si apre, e si guarda se l'app dice cosa e' successo invece di
     restare grigia.

     🔒 Va fatto per PRIMO e con lo storage sporco, perche' e' esattamente la
     situazione di chi ha l'app sul telefono da prima di un aggiornamento.
     ════════════════════════════════════════════════════════════════════ */
  attesi = true;
  await page.goto(`${BASE}/?dev=1`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem(
      'vinzmon.prototype.v4',
      JSON.stringify({ version: 3, state: { phase: 'live', activeMonName: 'X', mons: { X: { data: null } } } }),
    );
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(500);

  const rotto = await page.evaluate(() => ({
    crash: !!document.querySelector('.crash'),
    vuoto: (document.getElementById('root')?.childElementCount ?? 0) === 0,
    testo: document.querySelector('.crash__what')?.textContent ?? '',
  }));
  if (rotto.vuoto) {
    errors.push('con un salvataggio illeggibile l’app resta grigia: nessuna rete di sicurezza');
  }
  if (rotto.crash) {
    if (rotto.testo.trim().length === 0) {
      errors.push('la schermata di rottura non dice cosa si e rotto: inutile da un telefono');
    }
    await shot('00-rottura');
    console.log(`  §26  con un salvataggio illeggibile l'app spiega invece di sparire`);
  }

  attesi = false;
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(400);

  /* 03 — SIGNAL SCAN (§12): dodici domande, una per schermata */
  await shot('03-signal-scan');
  // Le domande con i glifi sono quelle che §12 vuole non testuali: la 02
  // (silhouette), la 03 (materiali), la 07 (ottica) e la 08 (costruzione).
  for (let q = 1; q <= 12; q++) {
    if (q === 2) await shot('03-signal-scan-silhouette');
    if (q === 7) await shot('03-signal-scan-ottica');
    // Risposte diverse a ogni domanda, così il seme non esce piatto.
    const nth = (q % 3) + 1;
    await click(`.scan03__answer:nth-child(${nth})`, `risposta ${q}`);
    await sleep(260);
  }
  await shot('03-signal-scan-lock');
  await click(byText('LOCK SIGNAL'), 'LOCK SIGNAL');

  /* 04 — PROTOCOLLO (v1.10 §5.3): dieta e allenamento, a testo libero.
     Il testo qui sotto NON è decorativo: contiene una negazione («niente
     dolci»), un gruppo cercato («proteine») e una frequenza. Se il lettore si
     rompe, la riga di interpretazione sotto al campo resta vuota e lo si vede
     nello screenshot. */
  await shot('04-protocollo-vuoto');
  await page
    .locator('.protocol__area').first()
    .fill('tante proteine e verdura, pochi carboidrati la sera, niente dolci né alcol, 5 pasti al giorno');
  await page
    .locator('.protocol__area').nth(1)
    .fill('pesi lunedi mercoledi venerdi, corsa il sabato, domenica riposo');
  await sleep(200);
  await shot('04-protocollo-letto');
  await click(byText('CONFERMA IL PROTOCOLLO'), 'conferma protocollo');

  /* v1.10 §13.7 — l'ingresso compare a ogni cambio di fase, quindi il
     percorso non può dare per scontato di trovarsi già dentro. */
  const enterIfSplash = async () => {
    const door = page.locator('.splash__enter');
    if (await door.count()) {
      await door.click();
      await sleep(220);
    }
  };

  /* 00 — INGRESSO CON L'UOVO (v1.10 §13.7): la creatura al centro, e una
     porta dichiarata. Vale anche durante l'incubazione, adesso. */
  await shot('05-ingresso-uovo');
  await click('.splash__enter', 'entra nella chat');

  /* 05 — INCUBAZIONE: si parla all'uovo, e l'uovo risponde a suoni (§7.2) */
  await shot('05-incubazione');

  await page.locator('.composer--egg textarea').fill('a pranzo pollo e broccoli, poi palestra');
  await click('.composer--egg .btn-icon:last-child', 'parla all’uovo');
  await sleep(300);
  await shot('05-incubazione-suono');

  // Sette giorni sincronizzati: è la nuova soglia di incubazione (v1.4).
  await click('.incubation__skip', '+7 giorni sincronizzati');
  await shot('05-incubazione-pronta');

  /* 05 — FIRST ENCOUNTER: tre battute, non una (v1.9 §13.2) */
  // 🔷 v1.10 §13.8 — anche nascere si tiene premuto.
  await hold('HATCH');
  await sleep(900);
  /* 🔷 v1.15 — la nascita e' il punto in cui l'app monta per la prima volta
     tutto quello che riguarda una creatura. Se qualcosa la fa cadere, da qui
     in poi ogni schermata fallisce con un timeout su un selettore, e il
     messaggio non dice mai qual era il problema vero.

     Questo controllo l'ha trovato subito: «Tipo di asset sconosciuto: sigil». */
  if (await page.evaluate(() => document.querySelector('.proto-frame') === null)) {
    throw new Error(`l'app e caduta alla nascita: ${errors.slice(-3).join(' | ')}`);
  }
  await shot('05-first-encounter-nome');
  await sleep(1600); // il sipario si alza da sé
  await shot('05-first-encounter');

  /* 🔷 §22.5 — il voto. Sta qui e non dietro all'immagine: quello che giudichi
     è la creatura, e quella c'è anche senza chiave. Si preme davvero, perché
     il difetto tipico di una fila di pulsanti-stella è che li disegni e non li
     colleghi. */
  await click('.facegate__star:nth-child(4)', 'voto 4 su 5');
  await shot('05-first-encounter-voto');

  const votate = await page.$$eval('.facegate__star--on', (n) => n.length);
  if (votate !== 4) {
    errors.push(`il voto non si e registrato: ${votate} quadrati accesi invece di 4`);
  }

  /* 🔷 §22.4 — le sei immagini si approvano una per una, e la sequenza dice a
     che punto sta. Qui gira senza chiave, quindi nessuna immagine arriva: e'
     precisamente il caso in cui §26 vieta di bloccare il flusso. */
  const passo = await page
    .locator('.facegate__note')
    .first()
    .textContent()
    .catch(() => null);
  if (!passo || !/1 di \d/.test(passo)) {
    errors.push(`la nascita non dice a che punto sta la sequenza: "${passo ?? 'niente'}"`);
  }

  /* 06 — LA HOME È IL PERSONAGGIO (v1.10 §13.7).
     Non è una schermata di benvenuto da superare: è la tab MON, con la barra
     di navigazione sotto. Alla chat ci si va.

     🔶 Cliccava «BENVENUTO A CASA», che era l'etichetta del caso «c'e' una
     faccia». Senza chiave la faccia non c'e' mai, e l'ago si teneva in piedi
     su un ramo che in questa camminata non veniva mai preso. La decisione da
     verificare e' un'altra e piu' importante: SI ENTRA COMUNQUE. */
  /* 🔶 E ADESSO SI NASCE DENTRO LA CHAT. La barra ha tre voci — CHAT, MON, ME
     — e la prima è quella aperta: «appena entri c'è la chat aperta». Quindi
     alla creatura ci si va, non ci si torna. */
  await click(byText('ENTRA'), 'entra senza immagini');
  await click(TAB.mon, 'tab MON');
  await shot('06-home-personaggio');
  await click('.splash__enter', 'vai in chat');
  await shot('06-companion-home');

  /* 🔷 §23.6 — «il logo del mostro deve apparire anche nell'icona dell'app».
     Non basta che il codice ci sia: la rasterizzazione passa da una canvas e
     può fallire in silenzio, restituendo un PNG trasparente o niente. Qui si
     guarda l'attributo VERO dopo la nascita. */
  await sleep(600);
  const icona = await page.evaluate(() => ({
    apple: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') ?? '',
    manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? '',
  }));
  if (!icona.apple.startsWith('data:image/png;base64,')) {
    errors.push(`apple-touch-icon è ancora «${icona.apple.slice(0, 40)}»: sulla home resta il globo`);
  } else if (icona.apple.length < 500) {
    errors.push('apple-touch-icon è un PNG vuoto: la canvas non ha disegnato niente');
  }
  if (!icona.manifest.startsWith('blob:')) {
    errors.push('il manifest non è stato aggiornato: su Android l’icona resta quella statica');
  }

  /* 🔷 §10.6 — la riga «come sta oggi», l'unica superficie di prodotto
     dell'umore. Qui deve esserci per forza: e appena nato, e NATO lascia
     l'appiglio 18 punti sotto la sua base. Se un giorno sparisse da questo
     punto, vorrebbe dire che nessuno la vedra mai piu da nessuna parte —
     e' successo gia una volta, ed e' il motivo per cui l'abbiamo costruita. */
  const umore = await page.$$eval('.home__mood', (n) => n.map((e) => e.textContent ?? ''));
  if (umore.length === 0) {
    errors.push('appena nato, la home non dice come sta: la riga d\'umore non c\'e');
  }
  await contrastoDi('.home__mood', 'nella riga d\'umore');
  for (const riga of umore) {
    /* 🔒 Dice COME sta, mai PERCHE: la causa scritta sulla home sarebbe il
       senso di colpa stampato («e passato un giorno senza di te»). E niente
       cifre — un numero la trasformerebbe in un punteggio da alzare. */
    if (/senza di te|non mi hai|hai salta|dovresti|perche/i.test(riga)) {
      errors.push(`la riga d'umore dice PERCHE invece di come sta: «${riga}»`);
    }
    if (/\d/.test(riga)) {
      errors.push(`la riga d'umore contiene un numero: «${riga}»`);
    }
  }

  /* 🔷 v1.12 §17.4 — LA COMPARSA, PROVATA DAL VIVO.
     `engine/reveal.ts` calcola il piano ed è verificato in batch-check, ma il
     piano poteva anche essere eseguito male: i timer non partono, la bolla
     resta vuota, i puntini non compaiono. Questi tre controlli guardano la
     pagina vera mentre risponde — l'unico posto dove si vede la differenza
     fra «il piano è giusto» e «l'app fa quello che dice il piano».

     Gira SENZA chiave: quindi prova la strada del fallback, che è esattamente
     quella in cui vive l'app oggi. */
  /* v1.14 — il campo della chat e' un'area che cresce, non piu un `input`:
     serviva a chi detta, perche' una frase lunga dentro una riga sola scorre
     via mentre la stai dicendo. */
  await page.locator('.composer textarea').fill('Oggi palestra e poi carbonara, sono distrutto');
  await click('.composer .btn-icon:last-child', 'invia');

  /* Si campiona il TESTO, non la sua lunghezza: la cosa che abbiamo corretto è
     che la bolla non si riscriva più sotto gli occhi, e per vederlo bisogna
     confrontare le stringhe.

     ⚠️ La prima versione di questo controllo pretendeva che il testo comparisse
     a pezzi, e falliva a caso: il .mon di quel giro consegnava A BLOCCO, che è
     un ritmo legittimo (§17.3). Un controllo che dipende da quale creatura è
     uscita non è un controllo, è una monetina. Qui si verifica solo quello che
     deve valere per TUTTI i ritmi. */
  const samples = [];
  let sawDots = false;
  for (let i = 0; i < 34; i++) {
    const snap = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.bubblerow--mon .bubble')];
      const last = rows[rows.length - 1];
      return {
        text: (last?.querySelector('.bubble__text')?.textContent ?? '').trim(),
        dots: !!document.querySelector('.bubble__typing'),
        // Quante bolle ha detto finora: serve a distinguere «il testo e'
        // stato riscritto» da «e' comparsa una bolla nuova».
        bubbles: rows.length,
      };
    });
    if (snap.dots) sawDots = true;
    samples.push(snap);
    await sleep(140);
  }

  const texts = samples.map((s) => s.text);
  const settled = texts[texts.length - 1];
  const firstFilled = texts.findIndex((t) => t.length > 0);

  if (!sawDots) throw new Error('§17.4: i puntini di «sta scrivendo» non sono mai comparsi');
  if (settled.length === 0) throw new Error('§17.4: la bolla è rimasta vuota alla fine');

  // La bolla NASCE VUOTA: se il primo campione ha già del testo, il fallback è
  // tornato a comparire subito — cioè il difetto che abbiamo corretto.
  if (firstFilled <= 0) {
    throw new Error('§17.4: la bolla non è nata vuota, il testo è comparso subito');
  }

  /* IL CONTROLLO CHE CONTA: il testo non si riscrive mai. Ogni campione deve
     essere un prefisso del successivo — vale per chi scrive parola per parola
     (cresce), per chi consegna a blocco (un salto solo, da vuoto a tutto) e
     per chi usa due bolle (la seconda cresce da zero). Non vale, e deve
     fallire, se una frase viene SOSTITUITA da un'altra. */
  /* ⚠️ Questo ciclo aveva un difetto, trovato per caso rimettendo mano al
     codice: guarda l'ULTIMA bolla, e chi spezza la risposta in due (§17.3
     `splitReply`) ne crea una seconda che parte da capo. Il salto da «Il ritmo
     è costante.» a «È» veniva letto come una riscrittura, e non lo era.

     Passava solo perche' le creature dei giri precedenti non spezzavano —
     cioe' era di nuovo un controllo che dipendeva da quale creatura usciva.
     Adesso una bolla NUOVA e' un fatto dichiarato, non un'eccezione dedotta
     dalla lunghezza. */
  for (let i = firstFilled; i < texts.length - 1; i++) {
    const now = texts[i];
    const next = texts[i + 1];
    if (samples[i + 1].bubbles > samples[i].bubbles) continue; // bolla nuova
    if (next.length >= now.length && next.startsWith(now)) continue;
    throw new Error(
      `§17.4: il testo è stato RISCRITTO sotto gli occhi — «${now}» → «${next}»`,
    );
  }

  const steps = new Set(texts.filter((t) => t.length > 0)).size;
  console.log(
    `  §17.4  puntini visti, bolla nata vuota, testo mai riscritto ` +
      `(${steps} stat${steps === 1 ? 'o' : 'i'}, ${settled.length} caratteri)`,
  );

  /* 🔷 v1.14 — IL NOME CI STA?
     I nomi generati arrivano a 13 caratteri con l'estensione, e a corpo
     display su un telefono sforavano. Il controllo misura la larghezza vera
     del nome contro quella del suo contenitore: e' l'unico modo di sapere se
     ci sta, perche' il testo che deborda non genera nessun errore — si vede
     e basta, e solo su certi nomi.

     ⚠️ Si misura anche l'ALTEZZA: un nome che va a capo "ci sta" in larghezza
     ma e' rotto uguale. */
  const nameFit = await page.evaluate(() => {
    const results = [];
    for (const el of document.querySelectorAll('.monname--fit')) {
      const host = el.parentElement?.getBoundingClientRect();
      const measure = (label) => {
        const box = el.getBoundingClientRect();
        const line = parseFloat(getComputedStyle(el).fontSize);
        results.push({
          name: label,
          width: Math.round(box.width),
          available: Math.round(host?.width ?? 0),
          lines: Math.round(box.height / (line * 1.3)),
        });
      };

      measure(el.getAttribute('aria-label') ?? '?');

      /* IL CASO PEGGIORE, forzato invece che sperato. Il nome di questo giro
         e' quello che il generatore ha estratto — spesso corto, e un controllo
         che passa perche' e' uscito un nome corto non ha controllato niente.
         I nomi generati arrivano a 9 caratteri di stem, cioe' 13 con
         l'estensione: si mette il testo piu lungo possibile e si rimisura. */
      const stem = el.firstElementChild;
      const realStem = stem.textContent;
      const realChars = el.style.getPropertyValue('--monname-chars');
      stem.textContent = 'VZZZZZZZZ';
      el.style.setProperty('--monname-chars', '13');
      measure('caso peggiore (13 caratteri)');
      stem.textContent = realStem;
      el.style.setProperty('--monname-chars', realChars);
    }
    return results;
  });

  for (const n of nameFit) {
    if (n.available > 0 && n.width > n.available + 1) {
      throw new Error(
        `nome fuori dal contenitore: ${n.name} occupa ${n.width}px su ${n.available}px`,
      );
    }
    if (n.lines > 1) {
      throw new Error(`nome andato a capo: ${n.name} su ${n.lines} righe`);
    }
  }
  if (nameFit.length > 0) {
    const worst = nameFit.reduce((a, b) => (b.width / b.available > a.width / a.available ? b : a));
    console.log(
      `  nome    ${nameFit.length} verificati, il piu stretto e ${worst.name} ` +
        `(${worst.width}px su ${worst.available}px)`,
    );
  }

  /* 🔷 v1.14 — I MARGINI DI SISTEMA.

     Questo controllo esiste perche' il difetto e' arrivato da una FOTO di un
     telefono vero, non da qui: Chromium headless non ha una tacca, quindi
     `env(safe-area-inset-*)` vale zero e tutto sembrava a posto mentre
     sull'iPhone l'orologio finiva sopra l'uovo.

     Non si puo' simulare una tacca, ma si puo' verificare che le tre barre
     DICHIARINO di usare l'inset: se qualcuno toglie quella riga di CSS, qui
     si accorge subito invece che alla prossima foto. */
  const insets = await page.evaluate(() => {
    const read = (sel, prop) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return getComputedStyle(el).getPropertyValue(prop);
    };
    return {
      statusbar: read('.proto-statusbar', 'padding-top'),
      composer: read('.composer', 'padding-bottom'),
      tabbar: read('.tabbar', 'padding-bottom'),
    };
  });

  for (const [where, value] of Object.entries(insets)) {
    if (value === null) continue; // quella barra non c'e' in questa schermata
    if (Number.parseFloat(value) < 0) {
      throw new Error(`margine di sistema negativo su ${where}: ${value}`);
    }
  }
  if (insets.statusbar === null) throw new Error('la barra di stato non esiste piu');
  console.log(
    `  margini alto ${insets.statusbar} · composer ${insets.composer ?? '—'} · tab ${insets.tabbar ?? '—'}`,
  );

  await shot('06-conversazione');

  /* 07 — REGISTRA (v1.9 §5.2): un campo solo, e quello che ha capito */
  await openCapture();
  await shot('07-registra-vuoto');
  await page.locator('.capture textarea').fill('nuotato mezz’ora, poi insalata. peso 78');
  await shot('07-registra-capito');
  await click(byText('REGISTRA'), 'conferma registrazione');

  /* 🔷 v1.15 §13.12 — IL DOSSIER SOTTO LA FACCIA.

     Qui il giro entrava nel profilo da un pulsante in alto a destra della
     chat. Quel pulsante non c'e' piu: era un bersaglio grande con una freccia
     e nessun nome. Il profilo e' sceso sotto il personaggio nella home, e ci
     si arriva scorrendo — quindi il giro fa la stessa cosa. */
  await click('.home__face', 'torna al personaggio');
  await sleep(300);
  await shot('06-home-personaggio-alto');
  await page.locator('.dossier').scrollIntoViewIfNeeded();
  await sleep(300);
  await shot('06-home-dossier');

  /* Le statistiche congelate alla nascita devono esserci davvero: sono la
     cosa nuova di questa schermata, e una sezione vuota passerebbe inosservata
     in uno screenshot. */
  const statLines = await page.locator('.statline').count();
  if (statLines !== 6) {
    throw new Error(`§21.3: attese 6 statistiche alla nascita, trovate ${statLines}`);
  }
  console.log(`  §21.3  sei statistiche congelate alla nascita, sotto la faccia`);

  await click('.splash__enter', 'torna in chat');

  /* 15 — SPECIMEN PROFILE: adesso ci si arriva dalla Mindline, che e' il posto
     dove si guarda una forma qualsiasi e non solo quella attiva. */
  await click(TAB.mon, 'tab MON');
  await click(VISTA.map, 'vista MIND.MAP');
  await click('.mindline__node--active', 'nodo attivo');
  await click(byText('SPECIMEN'), 'profilo');
  await shot('15-specimen-stats');
  await click(byText('IDENTITÀ'), 'tab identità');
  await shot('15-specimen-identita');
  /* 🔶 v1.9 §8.1 — la BIO è una scheda del profilo, in prima persona. */
  await click(byText('BIO'), 'tab bio');
  await shot('16-bio');
  await click(byText('LINEAGE'), 'tab lineage');
  await shot('15-specimen-lineage');
  await click(byText('ASSET'), 'tab asset');
  await shot('15-specimen-asset');
  await click('.specimen__head .btn-icon', 'indietro');
  await click(TAB.mon, 'torna su MON');
  await click(VISTA.mon, 'vista MON');

  /* 09 — ME */
  await click(TAB.me, 'tab ME');
  await shot('09-me-overview');

  /* GIORNI — calendario a date vere, oggi in grande (v1.9 §14.1) */
  await click(TAB.me, 'tab ME');
  await click(VISTA.giorni, 'vista GIORNI');
  await shot('09b-calendario');
  // §14 vuole il dettaglio del giorno con i tre segnali e la provenienza.
  await click('.cal__cell--today', 'dettaglio di oggi');
  await shot('09c-calendario-giorno');

  // 🔷 v1.11 §5.4 — il riepilogo sta in fondo al dettaglio: senza scorrere,
  // lo screenshot non lo vede e non serve a niente.
  await page.locator('.daysum').scrollIntoViewIfNeeded();
  await sleep(200);
  await shot('09d-riepilogo-giornata');

  /* 08 — DAILY SCAN si apre da «oggi», che è dove si va a raccontare. */
  await click('.cal__today', 'apri la giornata');
  await shot('08-daily-scan');
  await click(byText('Cazzaro'), 'mood cazzaro');
  await shot('08-daily-scan-selezionato');
  await click(byText('REGISTRA'), 'registra mood');
  await click(TAB.me, 'torna in ME');
  await click(VISTA.giorni, 'torna a GIORNI');

  /* 17 — MINDLINE: senza selezione si vede solo la topologia */
  await click(TAB.mon, 'tab MON');
  await click(VISTA.map, 'vista MIND.MAP');
  await shot('17-mindline');

  // Il dettaglio del nodo esiste solo dopo averlo toccato.
  await click('.mindline__node--active', 'nodo attivo');
  await shot('17-mindline-nodo');

  /* 🔷 v1.14 §12.5 — MIND.DEX: la seconda vista della stessa tab. Lo scaffale
     di chi sei stato, per immagine invece che come albero. */
  await click(VISTA.dex, 'vista MIND.DEX');
  await shot('17-dex');
  await click('.dexcard', 'una forma dello scaffale');
  await shot('17-dex-dettaglio');
  await click(VISTA.map, 'torna alla MIND.MAP');
  /* Tornando indietro la vista si rimonta e la selezione del nodo si perde:
     e' il comportamento giusto — cambiare vista e' una navigazione, non un
     ritorno — ma il giro deve riselezionare per proseguire. */
  await click('.mindline__node--active', 'riseleziona il nodo attivo');

  /* 20 — HISTORY */
  await click(byText('EVOLUTION TIMELINE'), 'timeline');
  await shot('20-history');
  await click('.specimen__head .btn-icon', 'indietro');

  /* DEV */
  await click('.devtrigger', 'apri DEV');
  /* 🔒 DEV si apre su INIZIO, non su una scheda a caso. È la decisione che ha
     reso questo pannello usabile: se un giorno tornasse ad aprirsi su TEMPO
     con quindici linguette in fila, questo controllo lo direbbe. */
  await shot('dev-inizio');
  /* 🔷 §29 — la targhetta della build. Il controllo non guarda che ci sia un
     elemento: guarda che dentro ci sia un COMMIT VERO. Una targhetta che dice
     «sconosciuto» e' esattamente inutile per la domanda a cui deve rispondere,
     e sarebbe passata da un controllo di sola presenza. */
  const targhetta = await page.textContent('.dev__build');
  if (!/^[0-9a-f]{7} · \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test((targhetta ?? '').trim())) {
    errors.push(`la targhetta della build dice «${targhetta}» invece di commit e ora`);
  }

  const gruppi = await page.$$eval('.ftabs', (n) => n.length);
  if (gruppi !== 1) {
    errors.push(`DEV si apre con ${gruppi} file di linguette invece di una sola`);
  }
  await devTab('TEMPO', 'SEGNALI');
  await shot('dev-segnali');

  // Forza l'eleggibilità per raggiungere entrambe le strade (criterio 2 di §26).
  await devTab('CREATURA', 'MINDLINE');
  await page.locator('.dev__check input').nth(0).check();
  await page.locator('.dev__check input').nth(1).check();
  await shot('dev-mindline');

  await devTab('CREATURA', 'GENERA');
  await click(byText('GENERATE 50'), 'batch 50');
  await shot('dev-batch');

  await devTab('VOCE', 'PROVA');
  await shot('dev-voce');

  await devTab('CREATURA', 'PROMPT IMMAGINI');
  await shot('dev-prompt-compilato');
  await click(byText('PROVENIENZA'), 'provenienza frammenti');
  await shot('dev-prompt-provenienza');

  /* 🔷 §8.1 — la bio. Senza segreto il pulsante che la fa riscrivere e' spento
     di proposito: quello che si controlla qui e' che la schermata regga
     comunque e mostri quella del motore, perche' e' lo stato in cui l'app si
     trova al primo avvio di chiunque. */
  await devTab('CREATURA', 'BIO');
  await shot('dev-bio');

  /* 🔷 v1 — il resolver a mano. Il pezzo che conta e' che il prompt da
     incollare esista e sia lungo: e' l'unica strada che non dipende dal muro
     dei dieci secondi. */
  await devTab('CREATURA', 'RESOLVER');
  const risolto = await page
    .locator('.dev__section')
    .first()
    .textContent()
    .catch(() => '');
  if (!risolto || !/DA FARE/.test(risolto)) {
    errors.push('la schermata del resolver non dice a che punto sta');
  }
  /* Un pulsante solo, e dice cosa fa. */
  if (!/DAMMI IL PROMPT/.test(risolto)) {
    errors.push('manca il pulsante unico che fa tutto');
  }
  /* 🔷 «Fallo semplice che io possa cliccare e avviene tutto.» Gli attrezzi da
     riparazione — la casella dove incollare, il prompt del resolver — stanno
     CHIUSI finche' non servono: metterli davanti alla cosa che si usa ogni
     giorno fa sembrare difficile una cosa facile. */
  const casellaChiusa = await page.$$eval('.dev__paste', (n) => n.length);
  if (casellaChiusa !== 0) {
    errors.push('la casella per incollare a mano e aperta prima che serva');
  }
  await click(byText('A MANO'), 'apri il modo a mano');
  const casella = await page.$$eval('.dev__paste', (n) => n.length);
  if (casella !== 1) errors.push(`la casella dove incollare la risoluzione: ${casella}`);
  await shot('dev-resolver');

  /* 🔷 §22.4 — la forgia. Senza segreto i pulsanti sono spenti di proposito:
     quello che si controlla qui e' che il prezzo sia scritto PRIMA, perche' e'
     l'unica cosa dell'app che con un tocco spende quasi un euro. */
  await devTab('CREATURA', 'GENERA');
  const forgia = await page.$$eval('.dev__section', (n) =>
    n.map((e) => e.textContent ?? '').join(' '),
  );
  /* 🔶 CERCAVA LA STRINGA `0,75`. Era il prezzo di quel giorno, non la
     decisione: adesso che i cinque prompt derivati non si fanno più riscrivere
     il conto è sceso, e l'ago sarebbe fallito su un MIGLIORAMENTO. Quello che
     va difeso è che un prezzo ci sia, scritto prima di premere. */
  if (!/\d+,\d+\s*€/.test(forgia)) {
    errors.push('la forgia non dice quanto costa prima di premere');
  }
  await shot('dev-forgia');

  await devTab('CREATURA', 'ASSET');
  /* 🔷 «Tienimi i prompt da copiare, sto mettendo le immagini a mano.»
     Il giro a mano vive su questa schermata: ogni slot deve avere il SUO
     pulsante, o si torna a saltare fra due schede per ogni immagine. */
  const slotCopie = await page.$$eval('.dev__slotrow .btn', (n) => n.length);
  const slot = await page.$$eval('.dev__slotrow', (n) => n.length);
  if (slot === 0 || slotCopie < slot) {
    errors.push(`${slot} slot ma solo ${slotCopie} pulsanti per copiare il prompt`);
  }
  await shot('dev-import-asset');

  await devTab('TEMPO', 'PROGRESSIONE');
  await shot('dev-progressione');

  /* 🔶 v1.9 §18.1 — la spesa AI, e §15.1 — la memoria, che vive solo qui. */
  await devTab('SPESA');
  await shot('dev-costi');
  await devTab('VOCE', 'MEMORIA');
  await shot('dev-memoria');

  /* 🔷 v1.16 §15.3 — DEV → RARITÀ. Il pulsante simula cinquecento nascite
     sincronamente: se ci fosse un errore nel motore uscirebbe QUI, prima che
     una creatura vera lo incontri. Vale la pena premerlo davvero invece di
     limitarsi a fotografare la scheda vuota. */
  /* 🔷 §20.3 — CATALOGHI. Si prova SPEGNENDO davvero: una schermata di
     interruttori che non spengono niente è la cosa più facile da costruire e
     la più inutile. */
  await devTab('CREATURA', 'CATALOGHI');
  await shot('dev-cataloghi');
  const primaAccese = await page.$$eval('.cat__row[aria-pressed="true"]', (n) => n.length);
  await click('.cat__row', 'spegni la prima Family');
  const dopoAccese = await page.$$eval('.cat__row[aria-pressed="true"]', (n) => n.length);
  if (dopoAccese !== primaAccese - 1) {
    errors.push(`spento una voce, ne restano accese ${dopoAccese} invece di ${primaAccese - 1}`);
  }
  await shot('dev-cataloghi-spento');

  /* 🔒 I designer ritirati si vedono ma non si riaccendono: il master v1.1
     dichiara Kaneko NOT ACTIVE, e un nome cancellato da un elenco rientra al
     primo che rilegge un documento vecchio. */
  await click('.cat__chip:last-child', 'apri CHARACTER DESIGN DNA');
  const ritirati = await page.$$eval('.cat__row--retired', (n) => n.map((e) => e.textContent ?? ''));
  if (!ritirati.some((r) => /KANEKO/i.test(r))) {
    errors.push('i designer ritirati non sono dichiarati: Kaneko può rientrare di nascosto');
  }
  await shot('dev-cataloghi-designer');

  await click(byText('TUTTO AI PREDEFINITI'), 'torna ai predefiniti');

  /* 🔷 §12 — il protocollo di prova dei designer. Si controlla che ci siano
     tutti e sette con il loro prompt: una schermata di prova che ne mostra
     sei ha gia' falsato il confronto. */
  await devTab('CREATURA', 'PROVE');
  await shot('dev-prove-designer');
  /* 🔷 «Una sezione dove posso scegliere io il personaggio.» Si prova
     SCEGLIENDO: si fissa una Family e si guarda che la forma provata cambi
     davvero. Sei menu che non spostano niente sono la cosa piu facile da
     costruire e la piu inutile. */
  const primaFamily = await page.textContent('.rowlist .row:nth-child(2)');
  await page.selectOption('.test__picker:first-child select', 'MACHINE');
  await sleep(400);
  const dopoFamily = await page.textContent('.rowlist .row:nth-child(2)');
  if (!/MACHINE/.test(dopoFamily ?? '')) {
    errors.push(`fissata MACHINE, la forma provata resta «${(dopoFamily ?? '').slice(0, 40)}»`);
  }
  if (primaFamily === dopoFamily && /MACHINE/.test(primaFamily ?? '')) {
    console.log('  §12  la forma era gia MACHINE: scelta non distinguibile in questo giro');
  }
  await shot('dev-prove-composta');

  const prove = await page.$$eval('.test__row', (n) => n.length);
  const copie = await page.$$eval('.test__row .btn', (n) => n.length);
  if (prove !== 7) errors.push(`il protocollo §12 mostra ${prove} designer invece di 7`);
  if (copie < prove * 2) {
    errors.push('una prova senza il suo pulsante per copiare o senza scarta non e una prova');
  }

  await devTab('CREATURA', 'RARITÀ');
  await shot('dev-rarita');
  await click(byText('Simula 500 nascite'), 'simula nascite');
  await page.waitForSelector('.rarity__hist', { timeout: 15000 });
  await shot('dev-rarita-simulazione');

  /* 🔷 v1.17 §21 — gli strumenti. Si eseguono DAVVERO: leggere i dati e
     scrivere una pagina sono i due che il .mon userà di più, e una pagina
     scritta qui è una pagina vera — il che vuol dire che il percorso
     completo, disegnatore di markdown compreso, viene camminato prima di
     avere una chiave. */
  await devTab('VOCE', 'STRUMENTI');
  await shot('dev-strumenti');
  await click(byText('Esegui'), 'esegui leggi_i_miei_dati');
  await page.waitForSelector('.tools__out', { timeout: 5000 });
  await shot('dev-strumenti-dati');

  await click(byText('scrivi_una_pagina'), 'scegli scrivi_una_pagina');
  await click(byText('Esegui'), 'esegui scrivi_una_pagina');
  await page.waitForSelector('.tools__out', { timeout: 5000 });
  await shot('dev-strumenti-pagina');

  // L'annuncio dello shift esiste solo quando qualcosa è pronto. Le forzature
  // sono già attive (tab MINDLINE, poco sopra): basta uscire e guardare.
  await click('.dev__head .btn-icon', 'chiudi DEV');

  /* 🔷 §19.5 — ATTIVA VINZ.MON. Il percorso gira SENZA chiavi e senza
     funzioni pubblicate, che è lo stato in cui uno apre questa schermata la
     prima volta: qui si controlla che in quello stato dica cosa manca invece
     di restare muta. */
  await click('.activatechip', 'attiva vinz.mon');
  await page.waitForSelector('.activate', { timeout: 5000 });
  await shot('19-attiva');

  const passi = await page.$$eval('.activate .window', (n) => n.length);
  if (passi !== 6) errors.push(`la procedura guidata ha ${passi} passi invece di 6`);

  /* 🔒 Il segreto proposto deve essere lungo abbastanza da essere accettato da
     `auth.ts` (24 caratteri). Un pulsante COPIA che consegna un token che il
     server rifiuterà è la trappola perfetta: sembra tutto a posto e non parte
     niente. */
  const segreto = (await page.locator('.activate__value').first().textContent()) ?? '';
  if (segreto.trim().length < 24) {
    errors.push(`il segreto proposto è di ${segreto.trim().length} caratteri: auth.ts ne vuole 24`);
  }

  /* 🔒 E in locale, dove /api non esiste, deve dire QUELLO — non «token
     sbagliato». Era il difetto che questa schermata è nata per togliere. */
  const detto = (await page.locator('.activate__bad').first().textContent()) ?? '';
  if (!/funzioni non rispondono|non è ancora stato ripubblicato|in locale/i.test(detto)) {
    errors.push(`senza funzioni la procedura dice «${detto.slice(0, 80)}» invece di spiegare`);
  }

  /* 🔒 Le etichette di stato stanno nell'intestazione INVERTITA della
     finestra: è l'unico posto dell'app dove un componente che eredita il
     colore sparisce. Ci è già sparito una volta. */
  await contrastoDi(
    '.activate__bad, .activate__intro, .activate__varwhat, .window__head .syslabel',
    "nell'attivazione",
  );
  await click('.specimen__head .btn-icon', 'chiudi attivazione');

  /* La pagina appena scritta deve esserci per davvero: si apre, si legge, e
     si controlla che il markdown sia diventato struttura invece che testo. */
  await click(TAB.me, 'tab ME');
  await click('.pagerow', 'apri la pagina');
  await page.waitForSelector('.md__table', { timeout: 5000 });
  await shot('21-pagina');

  const pageChecks = await page.evaluate(() => ({
    hash: window.location.hash,
    headings: document.querySelectorAll('.md__h1, .md__h2').length,
    rows: document.querySelectorAll('.md__table tbody tr').length,
    checks: document.querySelectorAll('.md__list--check li').length,
    rawHtml: document.querySelector('.pagereader__doc')?.innerHTML.includes('&lt;script') ?? false,
  }));

  if (!pageChecks.hash.startsWith('#/p/')) {
    throw new Error(`la pagina non ha un indirizzo proprio: "${pageChecks.hash}"`);
  }
  if (pageChecks.headings < 2 || pageChecks.rows < 2 || pageChecks.checks < 2) {
    throw new Error(`il markdown non è diventato struttura: ${JSON.stringify(pageChecks)}`);
  }

  await click('.pagereader__head .btn-icon', 'chiudi la pagina');

  await click(TAB.mon, 'tab MON');
  await shot('06-shift-disponibile');
  await click('.devtrigger', 'riapri DEV');

  /* 11 — MINDLINE SHIFT */
  await devTab('CREATURA', 'MINDLINE');
  await click(byText('APRI MINDLINE SHIFT'), 'apri shift');
  await shot('11-mindline-shift');

  /* 12 — MATURAZIONE (micro-growth) */
  await hold('LASCIA MATURARE');
  await shot('12-evolution-rivelazione');
  await sleep(1600); // la rivelazione si toglie da sola
  await shot('12-evolution');
  await click(byText('CONTINUA'), 'continua');
  await enterIfSplash();

  /* 13 — CAMBIO DI FORMA */
  await click('.devtrigger', 'apri DEV');
  await devTab('CREATURA', 'MINDLINE');
  await page.locator('.dev__check input').nth(1).check();
  await click(byText('APRI MINDLINE SHIFT'), 'apri shift');
  await hold('GUARDA COSA CAMBIA');
  await shot('13-form-evolution');

  /* 14 — NEW ENCOUNTER */
  await hold('CAMBIA FORMA');
  await sleep(2600);
  await shot('14-new-encounter');
  /* Stessa ragione della nascita: senza chiave non c'e' nessuna immagine da
     approvare, e la decisione da verificare e' che si entri comunque. */
  await click(byText('ENTRA'), 'entra senza immagini');
  await enterIfSplash();

  /* 18 — HERITAGE DNA */
  await click(TAB.mon, 'tab MON');
  await click(VISTA.map, 'vista MIND.MAP');
  await shot('17-mindline-ramificata');
  await click('.mindline__node--active', 'nodo attivo');
  await click(byText('HERITAGE DNA'), 'heritage');
  await shot('18-heritage-dna');

  /* ============================================================================
     §21.3 — IL RICORDO SOPRAVVIVE AL RESET

     Questo e l'unico controllo che vale davvero per la teca, e va fatto per
     ULTIMO perche distrugge la partita: si conserva un .mon, si preme RESET
     COMPLETO, e si guarda se e ancora li. Tutto il resto — che il pulsante
     esista, che la scheda si disegni — non dice niente sul difetto che conta.
     ========================================================================= */

  /* 🔶 QUI IL PERCORSO ENTRAVA IN MIND.SOCIAL e controllava il filo: i post
     senza testo, le facce, nessun campo di scrittura. È uscito con la
     schermata. 🔷 «Mindsocial togliamolo proprio: voglio cercare di farlo
     funzionare e poi aggiungo.» */

  /* 🔶 E con loro il controllo di contrasto sui post, che nasceva da un
     difetto vero fatto lì dentro. La lezione non si perde: `contrastoDi` resta,
     e viene usato su tutte le altre superfici. */

  /* 🔒 L'overlay dell'heritage va chiuso, o sotto non c'è nessuna barra da
     toccare. Stava dentro il blocco tolto: se ne va con lui e va rimesso. */
  await click('.specimen__head .btn-icon', 'chiudi heritage');
  await click(TAB.mon, 'tab MON');
  await click(VISTA.dex, 'vista MIND.DEX');
  /* La scheda giusta e quella marcata «ora»: lo scaffale e in ordine di
     comparsa, e dopo un branch la prima non e piu quella attiva. */
  await click('.dexcard:has(.dexcard__day:text-is(\"ora\"))', 'la forma attiva');
  await click(byText('CONSERVA COME RICORDO'), 'conserva');
  await page.waitForSelector('.teca', { timeout: 5000 });
  await shot('19-teca');

  const keptBefore = await page.$$eval('.dexcard--kept', (n) => n.length);

  await click('.devtrigger', 'riapri DEV');
  /* 🔒 Il reset sta in INIZIO, cioè nella schermata che DEV apre da sola.
     Era finito in fondo a MINDLINE e con il raggruppamento delle schede era
     diventato irraggiungibile senza sapere già dov'era: questo controllo
     fallisce se ci torna. Nessun `devTab` qui — deve essere la prima cosa. */
  const resetVisibile = await page.locator(':text("RESET COMPLETO DELLA SIMULAZIONE")').count();
  if (resetVisibile === 0) {
    errors.push('il reset non è raggiungibile dalla schermata che DEV apre da sola');
  }
  await click(byText('RESET COMPLETO DELLA SIMULAZIONE'), 'reset completo');
  /* 🔷 Il pulsante ora chiede conferma: un tocco solo non deve bastare, e il
     controllo deve accorgersene se un giorno la conferma sparisce. */
  await shot('19-reset-conferma');
  await click(byText('Cancella tutto'), 'conferma il reset');
  await page.waitForSelector('.screen', { timeout: 5000 });
  await shot('19-dopo-il-reset');

  /* Dopo il reset la partita riparte dallo scan: la teca si raggiunge di
     nuovo dalla tab MINDLINE, che deve esserci comunque. */
  const keptAfter = await page.evaluate(() => {
    const raw = localStorage.getItem('vinzmon.prototype.v4');
    if (!raw) return -1;
    try {
      return JSON.parse(raw).state.kept.length;
    } catch {
      return -1;
    }
  });

  if (keptBefore < 1) {
    errors.push(`la teca non ha conservato niente (${keptBefore} schede)`);
  }
  if (keptAfter !== keptBefore) {
    errors.push(
      `il reset ha svuotato la teca: ${keptBefore} ricordi prima, ${keptAfter} dopo`,
    );
  }

  console.log(`\n${step} schermate catturate in ${OUT}/`);
} finally {
  await browser.close();
  stopServer();
}

if (errors.length > 0) {
  console.error(`\n✗ ${errors.length} errori di console:\n`);
  for (const e of [...new Set(errors)]) console.error(`   ${e}`);
  process.exit(1);
}

console.log('\n✓ Nessun errore di console.\n');
process.exit(0);
