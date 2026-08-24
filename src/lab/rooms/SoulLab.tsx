/* ============================================================================
   👻 SOUL.LAB — EXPRESSION STUDIO

   🔒 FONTE DEL DISEGNO: `docs/lab/design/soul-lab.html` (v3.2). Testata con
   la freccia e la sigla, cinque schede LIVE / EXPRESSION / BODY / COLOR /
   SAVE, il palco con l'SVG, la libreria delle espressioni, e i controlli
   dentro `<details>` con le righe `.row`: etichetta, cursore, valore in
   `<code>`. Tutto da lì.

   ⚠️ UNA DIFFERENZA, DICHIARATA. Il disegno dice: «per adesso lavoriamo solo
   su pallina + faccia, la codina non esiste ancora nel renderer». Qui la
   codina C'È, perché il brief v1 la chiama essenziale — «single upward flame
   / wisp tail», con la sua riga tutta sua. Non l'ho aggiunta di testa mia:
   sta in `SOUL_V1_IMPLEMENTATION_BRIEF.md`, che è lo stesso pacchetto.

   Chi ha ragione lo decidi tu, e per questo la codina si può portare a zero
   con un cursore invece di essere murata: in BODY, `WISP HEIGHT` a 0 la fa
   sparire e resta esattamente la pallina del disegno.
   ========================================================================= */

import { useState, type ReactNode } from 'react';
import { Soul } from '../../soul/Soul';
import { SOUL_DEFAULT } from '../../soul/soulExpressions';
import { SOUL_EXPRESSIONS, type SoulExpression, type SoulTuning } from '../../soul/types';
import { useApp } from '../../state/store';
import '../skin/soul.css';

/* --- I mattoni del disegno -------------------------------------------------- */

function Row({
  label,
  children,
  value,
}: {
  label: string;
  children: ReactNode;
  value: string;
}) {
  return (
    <div className="row">
      <span>{label}</span>
      {children}
      <code>{value}</code>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <Row label={label} value={value.toFixed(step < 1 ? 2 : 0)}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Row>
  );
}

function Fold({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details open>
      <summary>
        <span>{title}</span>
        <b>▾</b>
      </summary>
      {children}
    </details>
  );
}

const TABS = ['LIVE', 'EXPRESSION', 'BODY', 'COLOR', 'SAVE'];

/* --- La stanza -------------------------------------------------------------- */

export function SoulLab({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState('LIVE');
  const [t, setT] = useState<SoulTuning>(SOUL_DEFAULT);
  const [intensity, setIntensity] = useState(1);
  const [energy, setEnergy] = useState(0.5);
  const [speaking, setSpeaking] = useState(false);
  const [tone, setTone] = useState(50);
  const [charge, setCharge] = useState(50);

  const monPrimary = useApp((s) =>
    s.activeMonName ? (s.mons[s.activeMonName]?.data.palette_dna?.primary ?? null) : null,
  );

  const set = <K extends keyof SoulTuning>(k: K, patch: Partial<SoulTuning[K]>) =>
    setT((p) => ({ ...p, [k]: { ...p[k], ...patch } }));

  const scarica = (nome: string, testo: string, tipo: string) => {
    const url = URL.createObjectURL(new Blob([testo], { type: tipo }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handoff = () => {
    const s = t.shape;
    const f = t.face;
    const m = t.motion;
    return [
      'SOUL v1 — RISULTATO APPROVATO',
      'Riferimento visivo: soul-master-sketch.png',
      '',
      'CORPO',
      `  Largo ${(s.bodyWidth * 100).toFixed(0)}%, alto ${(s.bodyHeight * 100).toFixed(0)}%.`,
      `  Rotondità ${(s.roundness * 100).toFixed(0)}% — sotto il 100% è volutamente imperfetto, disegnato a mano.`,
      '',
      'CODINA',
      s.wispHeight === 0
        ? '  Nessuna: solo pallina, come dice la v3.2 dello studio.'
        : `  Alta ${(s.wispHeight * 100).toFixed(0)}%, larga ${(s.wispWidth * 100).toFixed(0)}%, zig-zag al ${(s.wispBend * 100).toFixed(0)}%. Fulmine a spigoli vivi, non fumo.`,
      '',
      'FACCIA',
      `  Espressione: ${f.expression}. Occhi distanti ${(f.eyeSpacing * 100).toFixed(0)}%, larghi ${(f.eyeWidth * 100).toFixed(0)}%, alti ${(f.eyeHeight * 100).toFixed(0)}%.`,
      `  Palpebre inclinate di ${f.eyeTilt.toFixed(0)}°: è quello che separa scocciato da arrabbiato.`,
      `  Bocca ${f.mouthType === 'AUTO' ? "decisa dall'espressione" : f.mouthType}, larga ${(f.mouthWidth * 100).toFixed(0)}%.`,
      '',
      'MOVIMENTO',
      `  Galleggia di ${m.floatAmplitude.toFixed(0)}px ogni ${m.floatDurationSec.toFixed(1)}s, respira del ${(m.breathAmount * 100).toFixed(1)}%.`,
      `  Palpebre ogni ~${m.blinkIntervalSec.toFixed(1)}s, a intervalli irregolari.`,
      '',
      'COLORE',
      `  Il corpo prende il colore dal .mon attivo${t.color.bodySource === 'TEST' ? ' (ora in prova con un colore fisso)' : ''}.`,
      `  L'umore modula soltanto: tinta ±${t.color.hueMood}°, saturazione ±${t.color.satMood}%, luminosità ±${t.color.litMood}%.`,
      '  Nessuna mappatura fissa tipo triste=blu: il colore è l\'identità del .mon, non il suo umore.',
    ].join('\n');
  };

  return (
    <main>
      <div className="head">
        <a
          href="#/lab"
          onClick={(e) => {
            e.preventDefault();
            onBack();
          }}
        >
          ←
        </a>
        <b>👻 SOUL.LAB</b>
        <span className="mono sub">
          v3.2
          <br />
          EXPRESSION STUDIO
        </span>
      </div>

      <div className="tabs">
        {TABS.map((x) => (
          <button type="button" key={x} className={x === tab ? 'on' : ''} onClick={() => setTab(x)}>
            {x}
          </button>
        ))}
      </div>

      {/* Il palco resta sempre a schermo: si tara guardando. */}
      <div className="stage">
        <div className="soul-wrap">
          <Soul
            tuning={t}
            mood={{ tone, charge }}
            cue={{ expression: t.face.expression, intensity, energy }}
            monPrimary={monPrimary}
            speaking={speaking}
            size={210}
            title={`Soul, espressione ${t.face.expression}`}
          />
        </div>
      </div>

      <section className="panel">
        {tab === 'LIVE' && (
          <div className="section on">
            <h1>
              ONE BALL.
              <br />
              MANY STATES.
            </h1>
            <p>
              Ogni emozione è una costruzione grafica della STESSA faccia, non una faccina
              preconfezionata. Tocca una voce della libreria e guarda il palco.
            </p>

            <div className="library">
              {SOUL_EXPRESSIONS.map((e: SoulExpression) => (
                <button
                  type="button"
                  key={e}
                  className={e === t.face.expression ? 'on' : ''}
                  onClick={() => set('face', { expression: e })}
                >
                  {e}
                </button>
              ))}
            </div>

            <Fold title="REPLY CUE TEST">
              <Slider label="INTENSITY" value={intensity} min={0} max={1} step={0.01} onChange={setIntensity} />
              <Slider label="ENERGY" value={energy} min={0} max={1} step={0.01} onChange={setEnergy} />
              <Row label="SPEAKING" value={speaking ? 'ON' : 'OFF'}>
                <input
                  type="checkbox"
                  checked={speaking}
                  aria-label="Sta parlando"
                  onChange={(e) => setSpeaking(e.target.checked)}
                />
              </Row>
            </Fold>

            <Fold title="RUNTIME MOOD">
              <Slider label="TONE" value={tone} min={0} max={100} step={1} onChange={setTone} />
              <Slider label="CHARGE" value={charge} min={0} max={100} step={1} onChange={setCharge} />
            </Fold>

            <div className="status">
              {t.face.expression.toUpperCase()} · INTENSITÀ {(intensity * 100).toFixed(0)}%
              {monPrimary && t.color.bodySource === 'MON_PRIMARY' ? ` · COLORE DAL .MON ${monPrimary}` : ' · COLORE DI PROVA'}
            </div>
          </div>
        )}

        {tab === 'EXPRESSION' && (
          <div className="section on">
            <h1>EDIT FACE.</h1>
            <p>Ogni emozione salva la sua costruzione grafica. Non è una faccina preconfezionata.</p>

            <Fold title="EYES">
              <Slider label="SPACING" value={t.face.eyeSpacing} min={0.55} max={1.45} step={0.01} onChange={(v) => set('face', { eyeSpacing: v })} />
              <Slider label="WIDTH" value={t.face.eyeWidth} min={0.45} max={1.55} step={0.01} onChange={(v) => set('face', { eyeWidth: v })} />
              <Slider label="HEIGHT" value={t.face.eyeHeight} min={0.45} max={1.55} step={0.01} onChange={(v) => set('face', { eyeHeight: v })} />
              <Slider label="TILT" value={t.face.eyeTilt} min={-30} max={30} step={1} onChange={(v) => set('face', { eyeTilt: v })} />
              <Slider label="ASYMMETRY" value={t.face.asymmetry} min={-4} max={4} step={0.1} onChange={(v) => set('face', { asymmetry: v })} />
            </Fold>

            <Fold title="MOUTH">
              <Slider label="WIDTH" value={t.face.mouthWidth} min={0.4} max={1.8} step={0.01} onChange={(v) => set('face', { mouthWidth: v })} />
              <Slider label="HEIGHT" value={t.face.mouthHeight} min={0.3} max={2.4} step={0.01} onChange={(v) => set('face', { mouthHeight: v })} />
              <Slider label="TILT" value={t.face.mouthTilt} min={-25} max={25} step={1} onChange={(v) => set('face', { mouthTilt: v })} />
              <Slider label="FACE Y" value={t.face.faceY} min={-10} max={10} step={0.5} onChange={(v) => set('face', { faceY: v })} />
            </Fold>

            <div className="actions">
              <button type="button" onClick={() => set('face', SOUL_DEFAULT.face)}>RESET FACE</button>
            </div>
          </div>
        )}

        {tab === 'BODY' && (
          <div className="section on">
            <h1>EDIT BODY.</h1>
            <p>Anche il corpo è parte dell’emozione. Ogni preset può deformarsi e muoversi in modo diverso.</p>

            <Fold title="SHAPE">
              <Slider label="SCALE X" value={t.shape.bodyWidth} min={0.7} max={1.3} step={0.01} onChange={(v) => set('shape', { bodyWidth: v })} />
              <Slider label="SCALE Y" value={t.shape.bodyHeight} min={0.7} max={1.3} step={0.01} onChange={(v) => set('shape', { bodyHeight: v })} />
              <Slider label="ROUNDNESS" value={t.shape.roundness} min={0.6} max={1} step={0.01} onChange={(v) => set('shape', { roundness: v })} />
            </Fold>

            <Fold title="WISP">
              {/* 🔒 A 0 sparisce: il disegno v3.2 dice «solo pallina», il brief
                  v1 dice che la codina è essenziale. Il cursore lascia decidere
                  invece di murare una delle due. */}
              <Slider label="HEIGHT" value={t.shape.wispHeight} min={0} max={1.8} step={0.01} onChange={(v) => set('shape', { wispHeight: v })} />
              <Slider label="WIDTH" value={t.shape.wispWidth} min={0.4} max={2} step={0.01} onChange={(v) => set('shape', { wispWidth: v })} />
              <Slider label="ZIG-ZAG" value={t.shape.wispBend} min={0} max={2} step={0.01} onChange={(v) => set('shape', { wispBend: v })} />
              <Slider label="LEAN" value={t.shape.wispLean} min={-1} max={1} step={0.01} onChange={(v) => set('shape', { wispLean: v })} />
            </Fold>

            <Fold title="MOTION">
              <Slider label="BOUNCE AMP" value={t.motion.floatAmplitude} min={0} max={18} step={0.5} onChange={(v) => set('motion', { floatAmplitude: v })} />
              <Slider label="BOUNCE DUR" value={t.motion.floatDurationSec} min={0.5} max={10} step={0.1} onChange={(v) => set('motion', { floatDurationSec: v })} />
              <Slider label="PULSE" value={t.motion.breathAmount} min={0} max={0.09} step={0.005} onChange={(v) => set('motion', { breathAmount: v })} />
              <Slider label="WISP SWAY" value={t.motion.wispSwayDeg} min={0} max={22} step={0.5} onChange={(v) => set('motion', { wispSwayDeg: v })} />
              <Slider label="BLINK EVERY" value={t.motion.blinkIntervalSec} min={1} max={12} step={0.1} onChange={(v) => set('motion', { blinkIntervalSec: v })} />
            </Fold>

            <div className="actions">
              <button type="button" onClick={() => { set('shape', SOUL_DEFAULT.shape); set('motion', SOUL_DEFAULT.motion); }}>
                RESET BODY
              </button>
            </div>
          </div>
        )}

        {tab === 'COLOR' && (
          <div className="section on">
            <h1>EDIT COLOR.</h1>
            <p>
              Il corpo prende il colore dal .mon attivo. L’umore lo modula soltanto — mai
              triste=blu: il colore è l’identità della creatura, non il suo umore di stasera.
            </p>

            <Fold title="BASE">
              <Row label="SOURCE" value={t.color.bodySource}>
                <button
                  type="button"
                  onClick={() => set('color', { bodySource: t.color.bodySource === 'TEST' ? 'MON_PRIMARY' : 'TEST' })}
                >
                  CAMBIA
                </button>
              </Row>
              <Row label="BODY" value={t.color.bodyTest}>
                <input type="color" aria-label="Colore del corpo" value={t.color.bodyTest} onChange={(e) => set('color', { bodyTest: e.target.value })} />
              </Row>
              <Row label="FACE" value={t.color.face}>
                <input type="color" aria-label="Colore della faccia" value={t.color.face} onChange={(e) => set('color', { face: e.target.value })} />
              </Row>
              <Row label="AUTO CONTRAST" value={t.color.autoContrast ? 'ON' : 'OFF'}>
                <input type="checkbox" aria-label="Contrasto automatico" checked={t.color.autoContrast} onChange={(e) => set('color', { autoContrast: e.target.checked })} />
              </Row>
            </Fold>

            <Fold title="MOOD RESPONSE">
              <Slider label="HUE ±°" value={t.color.hueMood} min={0} max={20} step={1} onChange={(v) => set('color', { hueMood: v })} />
              <Slider label="SATURATION ±%" value={t.color.satMood} min={0} max={40} step={1} onChange={(v) => set('color', { satMood: v })} />
              <Slider label="BRIGHTNESS ±%" value={t.color.litMood} min={0} max={25} step={1} onChange={(v) => set('color', { litMood: v })} />
            </Fold>

            <div className="actions">
              <button type="button" onClick={() => set('color', SOUL_DEFAULT.color)}>RESET COLOR</button>
            </div>
          </div>
        )}

        {tab === 'SAVE' && (
          <div className="section on">
            <h1>SAVE SNAPSHOT.</h1>
            <p>
              Due file: il JSON serve a chi implementa, il testo a chi deve capire cosa hai
              approvato senza leggere i numeri.
            </p>

            <div className="actions">
              <button
                type="button"
                className="primary"
                onClick={() => scarica('soul-v1-tuning.json', JSON.stringify({ version: 'SOUL_V1', reference: 'soul-master-sketch.png', ...t }, null, 2), 'application/json')}
              >
                soul-v1-tuning.json
              </button>
              <button type="button" onClick={() => scarica('soul-v1-handoff.txt', handoff(), 'text/plain')}>
                soul-v1-handoff.txt
              </button>
              <button type="button" onClick={() => setT(SOUL_DEFAULT)}>RESET ALL</button>
            </div>

            <pre className="soullab__handoff">{handoff()}</pre>
          </div>
        )}
      </section>
    </main>
  );
}
