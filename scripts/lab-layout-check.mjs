/* ============================================================================
   VERIFICA GEOMETRIA — LAB FULLY-OPEN HEIGHT (V1 SMALL FIXES)

   Porta l'app fino a `phase: 'live'` (usando il .mon di prova di VINZ.LAB,
   `src/lab/rooms/testMon.ts` — non uno stato inventato per il test), simula
   il gesto di trascinamento reale (touchstart/touchmove/touchend, non un
   trucco di stato) fino allo stage 'lab' del cassetto globale
   (`PullDownSystemSheet` in App.tsx), e misura la geometria vera nel DOM a
   due viewport tipo iPhone.
   ========================================================================= */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const OUT = 'screenshots/lab-layout';
const PORT = 5198;
const BASE = `http://localhost:${PORT}`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
function stopServer() {
  try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); }
}
let serverReady = false;
server.stdout.on('data', (d) => { if (d.toString().includes('ready in') || d.toString().includes('Local:')) serverReady = true; });
for (let i = 0; i < 100 && !serverReady; i++) await sleep(100);
await sleep(600);

let failures = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const consoleErrors = [];

try {
  const VIEWPORTS = [
    { name: 'iphone-390x844', width: 390, height: 844 },
    { name: 'iphone-se-375x667', width: 375, height: 667 },
  ];

  for (const viewport of VIEWPORTS) {
    console.log(`\n═══ LAB LAYOUT — ${viewport.name} ═══\n`);
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`[${viewport.name}] ${msg.text()}`); });
    page.on('pageerror', (err) => consoleErrors.push(`[${viewport.name}] pageerror: ${err.message}`));

    await page.goto(`${BASE}/?dev=1`, { waitUntil: 'networkidle' });

    // Porta l'app a `phase: 'live'` con una creatura vera (il .mon di prova
    // di VINZ.LAB), invece di inventare uno stato minimo per il test.
    await page.evaluate(async () => {
      const { testMon } = await import('/src/lab/rooms/testMon.ts');
      const { useApp } = await import('/src/state/store.ts');
      const record = await testMon();
      useApp.setState({
        phase: 'live',
        mons: { [record.data.name]: record },
        activeMonName: record.data.name,
        eggs: [],
        firstSync: null,
      });
    });
    await page.waitForSelector('.proto-sheet', { timeout: 5000 });
    await page.waitForSelector('.system-tray', { timeout: 5000 });
    await sleep(300);

    // ── Gesto reale: trascina dall'alto oltre l'altezza piena del LAB ──────
    await page.evaluate(() => {
      const sheet = document.querySelector('.proto-sheet');
      if (!sheet) throw new Error('proto-sheet non trovato');
      const fire = (type, clientY) => {
        const touch = new Touch({ identifier: 1, target: sheet, clientX: 40, clientY });
        const list = type === 'touchend' ? [] : [touch];
        sheet.dispatchEvent(new TouchEvent(type, { touches: list, changedTouches: [touch], targetTouches: list, bubbles: true, cancelable: true }));
      };
      fire('touchstart', 20);
      for (let y = 20; y <= window.innerHeight + 40; y += 24) fire('touchmove', y);
      fire('touchend', window.innerHeight + 40);
    });
    await sleep(500); // la transizione CSS (320ms) deve finire prima di misurare

    const geometry = await page.evaluate(() => {
      const tray = document.querySelector('.system-tray')?.getBoundingClientRect();
      const lab = document.querySelector('.lab-underlayer')?.getBoundingClientRect();
      const protoSheet = document.querySelector('.proto-sheet')?.getBoundingClientRect();
      const closeBtn = document.querySelector('.system-tray__close')?.getBoundingClientRect();
      const labStyle = document.querySelector('.lab-underlayer') ? getComputedStyle(document.querySelector('.lab-underlayer')) : null;
      const devBtn = document.querySelector('.devtrigger');
      const labBtn = document.querySelector('.labtrigger');
      const cmp = (el) => {
        if (!el) return null;
        const s = getComputedStyle(el);
        return { minHeight: s.minHeight, borderColor: s.borderColor, borderWidth: s.borderWidth, font: s.font, padding: s.padding };
      };
      return {
        tray: tray ? { top: tray.top, bottom: tray.bottom, left: tray.left, right: tray.right } : null,
        lab: lab ? { top: lab.top, bottom: lab.bottom, height: lab.height } : null,
        protoSheet: protoSheet ? { top: protoSheet.top, bottom: protoSheet.bottom } : null,
        closeBtn: closeBtn ? { top: closeBtn.top, bottom: closeBtn.bottom, left: closeBtn.left, right: closeBtn.right } : null,
        overflowY: labStyle?.overflowY ?? null,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devBtnStyle: cmp(devBtn),
        labBtnStyle: cmp(labBtn),
        stageIsLab: document.querySelector('.lab-underlayer')?.getAttribute('aria-hidden') === 'false',
      };
    });

    await page.screenshot({ path: `${OUT}/${viewport.name}.png` });

    check(geometry.stageIsLab, 'il gesto reale (touchstart/move/end) porta davvero allo stage "lab" (aria-hidden diventa false)');
    check(!!geometry.tray && !!geometry.lab, 'system-tray e lab-underlayer esistono nel DOM dopo il gesto');

    if (geometry.tray && geometry.lab) {
      check(geometry.tray.top === 0, 'TOP CONTROLS — la tray parte dalla cima, invariata');
      check(Math.abs(geometry.lab.top - geometry.tray.bottom) < 1.5, 'LAB inizia esattamente sotto i controlli in alto (nessuna sovrapposizione, nessun buco)');
    }
    if (geometry.lab && geometry.protoSheet) {
      check(geometry.lab.bottom <= geometry.protoSheet.top + 1.5, 'LAB finisce prima della striscia MON/CHAT persistente in fondo (nessuna sovrapposizione)');
      /* 🔶 `.proto-sheet` è alto quanto l'intero frame e viene spostato con
         `translateY`: la trasformazione non ne riduce il box, quindi il suo
         `bottom` reale finisce ben oltre il viewport — è la parte SOTTO la
         piega, non un difetto. Quello che conta è che il suo `top` (dove
         comincia la striscia MON/CHAT rivelata) resti dentro il viewport,
         visibile e non negativo. */
      check(geometry.protoSheet.top >= 0 && geometry.protoSheet.top < geometry.innerHeight, 'la striscia MON/CHAT in fondo è davvero rivelata dentro il viewport (non sopra, non sotto)');
    }
    check(geometry.overflowY === 'auto', 'lo scroll interno del LAB resta quello di sempre (overflow-y: auto), non toccato');
    check(geometry.scrollWidth <= geometry.innerWidth + 1, 'nessun overflow orizzontale');
    if (geometry.closeBtn) {
      check(
        geometry.closeBtn.top >= 0 && geometry.closeBtn.bottom <= geometry.innerHeight && geometry.closeBtn.left >= 0 && geometry.closeBtn.right <= geometry.innerWidth,
        'il controllo CHIUDI non è tagliato dal viewport',
      );
    }
    if (geometry.devBtnStyle && geometry.labBtnStyle) {
      check(
        geometry.devBtnStyle.minHeight === geometry.labBtnStyle.minHeight &&
          geometry.devBtnStyle.borderColor === geometry.labBtnStyle.borderColor &&
          geometry.devBtnStyle.borderWidth === geometry.labBtnStyle.borderWidth &&
          geometry.devBtnStyle.font === geometry.labBtnStyle.font,
        'DEV e LAB restano nello stesso sistema grafico (stesso bordo, stessa altezza minima, stesso font) — nessuna restyle indipendente',
      );
    }

    await context.close();
  }

  check(consoleErrors.length === 0, `nessun errore di console durante il gesto o la misura (${consoleErrors.length} trovati)`);
  if (consoleErrors.length) consoleErrors.forEach((e) => console.log(`    · ${e}`));
} finally {
  await browser.close();
  stopServer();
}

if (failures) {
  console.error(`\n${failures} controllo/i falliti.`);
  process.exit(1);
}
console.log('\nTutto coerente.\n');
