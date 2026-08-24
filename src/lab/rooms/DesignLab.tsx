/* ============================================================================
   🖥 DESIGN.LAB

   🔒 FONTE DEL DISEGNO: `docs/lab/design/design-lab.html`. Barra in alto,
   quattro schede, riquadro dell'audit, fila delle schermate, testata della
   preview e il telefono: tutto da lì, classe per classe.

   ⚠️ E IL DISEGNO STESSO DICE COSA NON COPIARE. Dentro la pagina c'è scritto,
   in un riquadro a bordo spesso: «La schermata sotto NON è più la specifica
   visiva da copiare. È solo un riferimento dell'interazione del Lab.
   L'implementazione vera deve montare i componenti React reali dentro iframe
   isolati.»

   Quindi la cornice è la sua, e dentro `.phone` — al posto dei sette mock
   `.previewScreen` — c'è l'iframe che monta le schermate VERE. È l'unico
   punto di tutto VINZ.LAB dove il disegno chiede di essere sostituito, e lo
   chiede lui.

   🔒 E i TOKEN non sono più la lista scritta a mano del disegno: si leggono
   dal foglio di stile vivo dell'app. Un elenco di token copiato invecchia al
   primo `tokens.css` toccato — e un pannello che ti dice il colore sbagliato
   è peggio di un pannello che non te lo dice.
   ========================================================================= */

import { useEffect, useState } from 'react';
import { DESIGN_SCREENS } from '../design/screenRegistry';
import { DesignLabPreviewFrame } from '../design/DesignLabPreviewFrame';
import type { DesignScreenId, DesignSelection } from '../design/types';
import '../skin/design.css';
import '../skin/design-preview.css';

const TABS = [
  { id: 'ui', label: '👁 UI' },
  { id: 'tokens', label: '🎛 TOKENS' },
  { id: 'components', label: '🧱 COMPONENTS' },
  { id: 'history', label: '🕘 HISTORY' },
];

/* I bottoni delle schermate, con le etichette del disegno. `screen` dice
   quale schermata VERA monta l'iframe. */
const LIVE: { id: string; label: string; screen: DesignScreenId }[] = [
  { id: 'chat', label: '💬 CHAT', screen: 'chat' },
  { id: 'mon', label: '👾 MON', screen: 'mon' },
  { id: 'map', label: '🧬 MIND.MAP', screen: 'mind-map' },
  { id: 'dex', label: '▦ MIND.DEX', screen: 'mind-dex' },
  { id: 'me', label: '🧍 ME', screen: 'me' },
];

const PHASES: { id: string; label: string; screen: DesignScreenId }[] = [
  { id: 'incubation', label: '🥚 INCUBATION', screen: 'incubation' },
  { id: 'encounter', label: '⚡ ENCOUNTER', screen: 'encounter' },
];

export function DesignLab({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState('ui');
  const [screen, setScreen] = useState<DesignScreenId>('chat');
  const [inspect, setInspect] = useState(true);
  const [selection, setSelection] = useState<DesignSelection | null>(null);

  const tutte = [...LIVE, ...PHASES];
  const corrente = tutte.find((s) => s.screen === screen)!;
  const meta = DESIGN_SCREENS.find((s) => s.id === screen)!;

  return (
    <div className="app">
      <header className="top">
        <div className="navrow">
          <a
            className="back"
            href="#/lab"
            onClick={(e) => {
              e.preventDefault();
              onBack();
            }}
          >
            ←
          </a>
          <div className="labtitle">🖥 DESIGN.LAB</div>
          <span className="status mono">REAL COMPONENTS</span>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              type="button"
              key={t.id}
              className={`tab ${t.id === tab ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {tab === 'ui' && (
          <section className="page active">
            <div className="kicker mono">CURRENT VINZ.MON UI · LIVE COMPONENTS</div>
            <h1>
              THE REAL
              <br />
              APP FIRST.
            </h1>
            <p className="lead">
              Il telefono qui sotto non è più un mock: monta le schermate React vere dentro un
              iframe isolato, con i guardiani che impediscono qualunque scrittura. Tocca un
              elemento per sapere che cos’è.
            </p>

            <div className="groupLabel mono">LIVE</div>
            <div className="screenbar">
              {LIVE.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className={`screenbtn ${s.screen === screen ? 'active' : ''}`}
                  onClick={() => {
                    setScreen(s.screen);
                    setSelection(null);
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="groupLabel mono">PHASES</div>
            <div className="screenbar">
              {PHASES.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className={`screenbtn ${s.screen === screen ? 'active' : ''}`}
                  onClick={() => {
                    setScreen(s.screen);
                    setSelection(null);
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="previewhead">
              <div>
                <b>👁 CURRENT UI PREVIEW</b>
                <small className="mono">
                  {corrente.label.replace(/^\S+\s/, '')} · {meta.group}
                </small>
              </div>
              <button type="button" className="btn" onClick={() => setInspect((v) => !v)}>
                {inspect ? 'INSPECT ON' : 'INTERACT'}
              </button>
            </div>

            <div className="phonewrap">
              <div className="phone">
                {/* 🔒 Qui il disegno metteva sette schermate finte. Il disegno
                    stesso dice di sostituirle: questa è la roba vera. */}
                <DesignLabPreviewFrame
                  screen={screen}
                  cssText=""
                  inspect={inspect}
                  onSelect={setSelection}
                />
              </div>
            </div>

            <div className="componentlist" style={{ marginTop: 14 }}>
              <div className="row">
                <div>
                  <b>{selection?.elementId ?? 'Tocca un elemento nella preview'}</b>
                  <small>{selection ? `${selection.tag} · ${selection.classes.join(' ')}` : meta.notes}</small>
                </div>
                <span className="value">{selection ? 'SELECTED' : meta.group}</span>
              </div>
              {meta.source.map((path) => (
                <div className="row" key={path}>
                  <div>
                    <b>REAL SOURCE</b>
                    <small>{path}</small>
                  </div>
                  <span className="value">FILE</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'tokens' && <Tokens />}
        {tab === 'components' && <Components />}
        {tab === 'history' && (
          <section className="page active">
            <div className="kicker mono">DESIGN PATCH HISTORY</div>
            <h1>🕘 HISTORY</h1>
            <p className="lead">
              Le proposte del Design AI non sono ancora collegate: quando lo saranno, ogni patch
              approvata compare qui con il suo R0 recuperabile.
            </p>
            <div className="componentlist">
              <div className="row">
                <div>
                  <b>R0 · CURRENT UI</b>
                  <small>Lo stato di adesso, quello che vedi nel telefono.</small>
                </div>
                <span className="value">BASELINE</span>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/* ============================================================================
   TOKENS — letti dal foglio vivo, non ricopiati
   ========================================================================= */

const TOKEN_ROWS: { nome: string; nota: string; vars: string[] }[] = [
  { nome: 'WHITE / PAPER / SURFACE', nota: 'Campi base.', vars: ['--white', '--paper', '--surface'] },
  { nome: 'INK', nota: 'Nero strutturale.', vars: ['--ink'] },
  { nome: 'BASE UNIT', nota: 'Griglia 4px / 8pt.', vars: ['--u1', '--u2'] },
  { nome: 'BORDER', nota: 'Standard / thick.', vars: ['--border', '--border-thick'] },
  { nome: 'RADIUS', nota: 'Globalmente quasi quadrato.', vars: ['--radius', '--radius-sm'] },
];

function Tokens() {
  const [valori, setValori] = useState<Record<string, string>>({});

  /* ⚠️ I token vivono nel foglio dell'APP, e il laboratorio quel foglio non lo
     carica (ha un disegno suo). Quindi si leggono da dove sono davvero: dentro
     l'iframe della preview, che l'app ce l'ha. Leggerli da qui darebbe una
     lista di stringhe vuote — e una lista vuota si scambia per «non ci sono
     token», che è un'altra cosa da «non li sto guardando». */
  useEffect(() => {
    const frame = document.createElement('iframe');
    frame.src = '/?design-preview=mon';
    frame.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(frame);

    const leggi = () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      const stile = frame.contentWindow!.getComputedStyle(doc.documentElement);
      const out: Record<string, string> = {};
      for (const riga of TOKEN_ROWS) {
        for (const v of riga.vars) out[v] = stile.getPropertyValue(v).trim();
      }
      setValori(out);
    };

    frame.addEventListener('load', () => window.setTimeout(leggi, 200));
    return () => frame.remove();
  }, []);

  const letti = Object.values(valori).some((v) => v.length > 0);

  return (
    <section className="page active">
      <div className="kicker mono">CURRENT DESIGN TOKENS · LETTI DAL VIVO</div>
      <h1>🎛 TOKENS</h1>
      <p className="lead">
        Questi valori non sono scritti qui: sono letti dal foglio di stile vero dell’app, adesso.
        Se cambi <code>tokens.css</code>, questa tabella cambia da sola.
      </p>
      <div className="tokenlist">
        {TOKEN_ROWS.map((riga) => (
          <div className="row" key={riga.nome}>
            <div>
              <b>{riga.nome}</b>
              <small>{riga.nota}</small>
            </div>
            <span className="value">
              {riga.vars.map((v) => valori[v] || '—').join(' / ')}
            </span>
          </div>
        ))}
      </div>
      {!letti && <p className="lead">Lettura dei token in corso…</p>}
    </section>
  );
}

/* ============================================================================
   COMPONENTS — chi possiede davvero cosa
   ========================================================================= */

function Components() {
  return (
    <section className="page active">
      <div className="kicker mono">CURRENT REAL OWNERSHIP</div>
      <h1>🧱 COMPONENTS</h1>
      <p className="lead">
        Ogni schermata con i file che la disegnano davvero. I percorsi sono verificati: il registro
        del pacchetto puntava a <code>src/assistant-original/*</code> per la chat, che in questo
        repo non c’è.
      </p>
      <div className="componentlist">
        {DESIGN_SCREENS.map((s) => (
          <div className="row" key={s.id}>
            <div>
              <b>{s.label}</b>
              <small>{s.source.join(' · ')}</small>
            </div>
            <span className="value">{s.group}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
