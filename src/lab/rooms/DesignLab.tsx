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

   🔷 «Vedere il design system del progetto per intero e poter modificare un
      valore che vale per tutti.» Adesso TOKENS mostra il foglio intero (7
      gruppi, non 5 righe) e ogni riga si può cambiare: APPLICA scrive lo
      scarto in `engine/designTokens.ts`, che lo tiene fuori dal lab — vale
      per l'app vera, non solo per questa schermata.
   ========================================================================= */

import { useEffect, useRef, useState } from 'react';
import { DESIGN_SCREENS } from '../design/screenRegistry';
import { DesignLabPreviewFrame } from '../design/DesignLabPreviewFrame';
import type { DesignScreenId, DesignSelection } from '../design/types';
import {
  ADAPTIVE_VARS,
  resetAllTokenOverrides,
  resetTokenOverride,
  setTokenOverride,
  subscribeTokenOverrides,
  TOKEN_GROUPS,
  tokenOverrides,
} from '../../engine/designTokens';
import '../skin/design.css';
import '../skin/design-preview.css';
import '../skin/design-tokens-editor.css';

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
   TOKENS — il design system intero, letto dal foglio vivo e modificabile

   La lettura resta come prima: un iframe nascosto che monta una schermata
   vera e legge `getComputedStyle`, perché il lab non carica il foglio
   dell'app (ha un disegno suo) e una lista ricopiata a mano invecchia al
   primo `tokens.css` toccato.

   ⚠️ APPLICA scrive l'override e lo applica SUBITO all'iframe di lettura
   (`frameRef`), così questa tabella cambia senza aspettare un reload. Non
   serve inseguire anche l'iframe visibile della scheda 👁 UI: quello si
   smonta quando si cambia scheda e rimonta da zero quando si torna — e al
   rimontaggio passa da `main.tsx`, che rilegge gli override da
   `localStorage`. Un giro più semplice che tenere sincronizzati due iframe
   a mano.
   ========================================================================= */

function leggiValori(frame: HTMLIFrameElement | null): Record<string, string> | null {
  const doc = frame?.contentDocument;
  if (!frame || !doc || !frame.contentWindow) return null;
  const stile = frame.contentWindow.getComputedStyle(doc.documentElement);
  const out: Record<string, string> = {};
  for (const gruppo of TOKEN_GROUPS) for (const v of gruppo.vars) out[v.name] = stile.getPropertyValue(v.name).trim();
  for (const nome of ADAPTIVE_VARS) out[nome] = stile.getPropertyValue(nome).trim();
  return out;
}

function Tokens() {
  const [valori, setValori] = useState<Record<string, string>>({});
  const [bozza, setBozza] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState(() => ({ ...tokenOverrides() }));
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => subscribeTokenOverrides(() => setOverrides({ ...tokenOverrides() })), []);

  useEffect(() => {
    const frame = document.createElement('iframe');
    frame.src = '/?design-preview=mon';
    frame.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(frame);
    frameRef.current = frame;

    frame.addEventListener('load', () =>
      window.setTimeout(() => {
        const letti = leggiValori(frame);
        if (letti) setValori(letti);
      }, 200),
    );
    return () => {
      frame.remove();
      frameRef.current = null;
    };
  }, []);

  const applica = (nome: string, valore: string) => {
    setTokenOverride(nome, valore);
    if (frameRef.current) frameRef.current.contentDocument?.documentElement.style.setProperty(nome, valore);
    const letti = leggiValori(frameRef.current);
    if (letti) setValori(letti);
    setBozza((b) => {
      const { [nome]: _tolto, ...resto } = b;
      return resto;
    });
  };

  const ripristina = (nome: string) => {
    resetTokenOverride(nome);
    if (frameRef.current) frameRef.current.contentDocument?.documentElement.style.removeProperty(nome);
    const letti = leggiValori(frameRef.current);
    if (letti) setValori(letti);
  };

  const ripristinaTutto = () => {
    resetAllTokenOverrides();
    if (frameRef.current) {
      for (const gruppo of TOKEN_GROUPS)
        for (const v of gruppo.vars) frameRef.current.contentDocument?.documentElement.style.removeProperty(v.name);
    }
    const letti = leggiValori(frameRef.current);
    if (letti) setValori(letti);
    setBozza({});
  };

  const letti = Object.values(valori).some((v) => v.length > 0);
  const nModificati = Object.keys(overrides).length;

  return (
    <section className="page active">
      <div className="kicker mono">CURRENT DESIGN TOKENS · LETTI DAL VIVO</div>
      <h1>🎛 TOKENS</h1>
      <p className="lead">
        Il design system intero, letto adesso dal foglio vero dell’app. Cambia un valore e premi
        APPLICA: si vede subito qui sopra, e resta per ogni schermata di VINZ.MON — anche fuori dal
        lab, anche dopo aver chiuso e riaperto.
      </p>
      {nModificati > 0 && (
        <button type="button" className="tokenresetall" onClick={ripristinaTutto}>
          RIPRISTINA TUTTO · {nModificati} modificat{nModificati === 1 ? 'o' : 'i'}
        </button>
      )}

      {TOKEN_GROUPS.map((gruppo) => (
        <div className="tokengroup" key={gruppo.id}>
          <h2>{gruppo.label}</h2>
          <p className="note">{gruppo.note}</p>
          <div className="tokenlist">
            {gruppo.vars.map((v) => {
              const attuale = valori[v.name] || v.defaultValue;
              const modificato = v.name in overrides;
              const draft = bozza[v.name] ?? attuale;
              const uguale = draft.trim() === attuale.trim();
              return (
                <div className="tokenrow" data-token={v.name} key={v.name}>
                  <div className="tokenrow__head">
                    <b>{v.name}</b>
                    {modificato && <span className="tokentag">MODIFICATO</span>}
                  </div>
                  <div className="tokenedit">
                    {v.kind === 'color' && (
                      <input
                        type="color"
                        value={/^#[0-9a-f]{6}$/i.test(draft.trim()) ? draft.trim() : '#000000'}
                        onChange={(e) => setBozza((b) => ({ ...b, [v.name]: e.target.value }))}
                        aria-label={`colore ${v.name}`}
                      />
                    )}
                    <input
                      type="text"
                      value={draft}
                      onChange={(e) => setBozza((b) => ({ ...b, [v.name]: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="tokenbtn"
                      disabled={uguale || draft.trim().length === 0}
                      onClick={() => applica(v.name, draft)}
                    >
                      APPLICA
                    </button>
                    {modificato && (
                      <button type="button" className="tokenbtn ghost" onClick={() => ripristina(v.name)}>
                        RIPRISTINA
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="tokengroup tokenadaptive">
        <h2>COLOR DNA</h2>
        <p className="note">
          {ADAPTIVE_VARS.join(' · ')} non si modificano da qui: cambiano da soli a ogni .mon attivo,
          scritti da <code>colorDna.ts</code>. Sono nel design system, ma non sono &quot;un valore
          uguale per tutti&quot; — sono la sola parte che l’app decide creatura per creatura.
        </p>
        <div className="tokenlist">
          {ADAPTIVE_VARS.map((nome) => (
            <div className="row" key={nome}>
              <div>
                <b>{nome}</b>
              </div>
              <span className="value">{valori[nome] || '—'}</span>
            </div>
          ))}
        </div>
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
