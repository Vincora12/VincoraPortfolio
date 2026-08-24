/* ============================================================================
   👁 SOUL.LAB — l'editor visivo della Soul

   🔷 «Il proposal deve essere modificabile prima di salvare. L'utente resta
      il direttore artistico.»

   🔒 QUESTO NON È UN PANNELLO DI ANTEPRIMA: è un piccolo programma di
   disegno. Il brief lo dice esplicitamente — «every meaningful visual
   parameter must be exposed», «every control must update the SVG
   immediately» — e sono due richieste diverse. La prima vieta di nascondere
   i numeri scomodi; la seconda vieta un pulsante APPLICA. Qui muovi un
   cursore e la faccia cambia mentre lo muovi.

   ⚠️ E NON SCRIVE NIENTE. La taratura vive nello stato di questa schermata e
   basta: non tocca il .mon, non tocca lo store, non tocca il server. Da qui
   esce un FILE — snapshot JSON + spiegazione a parole — che è la cosa da
   riportare indietro quando la forma è quella giusta. È la regola del
   pacchetto: «AI proposes, user applies, implementing is a separate action».
   ========================================================================= */

import { useMemo, useState } from 'react';
import { LabRoom } from './LabRoom';
import { Soul } from '../../soul/Soul';
import { SOUL_DEFAULT } from '../../soul/soulExpressions';
import { SOUL_EXPRESSIONS, SOUL_MOUTHS, type SoulExpression, type SoulMouth, type SoulTuning } from '../../soul/types';
import { useApp } from '../../state/store';

/* --- Controlli -------------------------------------------------------------- */

function Slider({
  label, value, min, max, step, onChange, hint,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div className="dev__field soullab__field">
      <label className="t-micro">
        {label} <b>{value.toFixed(step < 0.05 ? 3 : step < 1 ? 2 : 0)}</b>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p className="t-micro dev__note">{hint}</p>}
    </div>
  );
}

function Scelta<T extends string>({
  label, value, options, onChange,
}: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="dev__field soullab__field">
      <label className="t-micro">{label}</label>
      <div className="soullab__chips">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className={`soullab__chip ${o === value ? 'soullab__chip--on' : ''}`}
            aria-pressed={o === value}
            onClick={() => onChange(o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/* --- La stanza -------------------------------------------------------------- */

type Versione = { id: string; label: string; tuning: SoulTuning };

export function SoulLab() {
  const [t, setT] = useState<SoulTuning>(SOUL_DEFAULT);
  const [speaking, setSpeaking] = useState(false);
  const [tone, setTone] = useState(50);
  const [charge, setCharge] = useState(50);
  const [intensity, setIntensity] = useState(1);
  const [energy, setEnergy] = useState(0.5);
  const [storia, setStoria] = useState<Versione[]>([
    { id: 'R0', label: 'R0 · PARTENZA', tuning: SOUL_DEFAULT },
  ]);

  /* 🔒 IL COLORE DEL .MON VERO, letto e basta. La Soul eredita l'identità
     della creatura attiva: è il punto 2 del brief, ed è anche il motivo per
     cui il colore di prova qui sotto NON è il predefinito. */
  const monPrimary = useApp((s) =>
    s.activeMonName ? (s.mons[s.activeMonName]?.data.palette_dna?.primary ?? null) : null,
  );

  const set = <K extends keyof SoulTuning>(k: K, patch: Partial<SoulTuning[K]>) =>
    setT((p) => ({ ...p, [k]: { ...p[k], ...patch } }));

  const cue = useMemo(
    () => ({ expression: t.face.expression, intensity, energy }),
    [t.face.expression, intensity, energy],
  );

  const palco = (
    <div className="soullab__stage">
      <Soul
        tuning={t}
        mood={{ tone, charge }}
        cue={cue}
        monPrimary={monPrimary}
        speaking={speaking}
        size={230}
        title={`Soul, espressione ${t.face.expression}`}
      />
      <p className="t-micro dev__note">
        CORPO: {monPrimary && t.color.bodySource === 'MON_PRIMARY'
          ? `dal .mon attivo (${monPrimary})`
          : `colore di prova (${t.color.bodyTest})`}
      </p>
    </div>
  );

  /* --- SAVE SNAPSHOT -------------------------------------------------------
     🔷 «SAVE SNAPSHOT deve produrre JSON + un passaggio a parole.»
     I due file servono a due lettori diversi: il JSON a chi implementa, il
     testo a chi deve capire cosa hai approvato senza leggere i numeri. */
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
      `Riferimento visivo: soul-master-sketch.png`,
      '',
      'CORPO',
      `  Grande ${(s.size * 100).toFixed(0)}% del riquadro; largo ${(s.bodyWidth * 100).toFixed(0)}%, alto ${(s.bodyHeight * 100).toFixed(0)}%.`,
      `  Rotondità ${(s.roundness * 100).toFixed(0)}% — sotto il 100% è volutamente imperfetto, disegnato a mano e non a compasso.`,
      '',
      'FIAMMA',
      `  Alta ${(s.wispHeight * 100).toFixed(0)}%, larga ${(s.wispWidth * 100).toFixed(0)}%.`,
      `  Zig-zag al ${(s.wispBend * 100).toFixed(0)}% e pendenza ${s.wispLean.toFixed(2)} verso destra.`,
      `  Resta un fulmine con gli spigoli vivi: non è fumo, non sono capelli.`,
      '',
      'FACCIA',
      `  Espressione di partenza: ${f.expression}.`,
      `  Occhi distanti ${(f.eyeSpacing * 100).toFixed(0)}%, larghi ${(f.eyeWidth * 100).toFixed(0)}%, alti ${(f.eyeHeight * 100).toFixed(0)}%.`,
      `  Inclinazione delle palpebre ${f.eyeTilt.toFixed(0)}°${f.asymmetry !== 0 ? `, asimmetria ${f.asymmetry.toFixed(1)}` : ''}.`,
      `  Bocca: ${f.mouthType === 'AUTO' ? "decisa dall'espressione" : f.mouthType}, larga ${(f.mouthWidth * 100).toFixed(0)}%.`,
      '',
      'MOVIMENTO',
      `  Galleggia di ${m.floatAmplitude.toFixed(0)}px ogni ${m.floatDurationSec.toFixed(1)}s.`,
      `  Respira del ${(m.breathAmount * 100).toFixed(1)}%. La fiamma ondeggia di ${m.wispSwayDeg.toFixed(0)}° ogni ${m.wispDurationSec.toFixed(1)}s, in ritardo sul corpo.`,
      `  Sbatte le palpebre circa ogni ${m.blinkIntervalSec.toFixed(1)}s, a intervalli irregolari.`,
      '',
      'COLORE',
      `  Il corpo prende il colore dal .mon attivo${t.color.bodySource === 'TEST' ? ' (adesso in prova con un colore fisso)' : ''}.`,
      `  La faccia è ${t.color.autoContrast ? 'in contrasto automatico' : t.color.face}.`,
      `  L'umore modula soltanto: tinta ±${t.color.hueMood}°, saturazione ±${t.color.satMood}%, luminosità ±${t.color.litMood}%.`,
      `  Nessuna mappatura fissa tipo triste=blu: il colore è l'identità del .mon, non il suo umore.`,
      '',
      `Stato al momento dello scatto: tono ${tone}, carica ${charge}, intensità ${intensity.toFixed(2)}.`,
    ].join('\n');
  };

  const snapshot = () => ({ version: 'SOUL_V1', reference: 'soul-master-sketch.png', ...t });

  return (
    <LabRoom
      title="👁 SOUL.LAB"
      sub="LA FACCIA VIVA · OGNI CURSORE CAMBIA L'SVG SUBITO"
      groups={[
        {
          id: 'live',
          label: 'LIVE',
          tabs: [
            {
              id: 'live',
              label: 'LIVE',
              render: () => (
                <div className="soullab">
                  {palco}
                  <Scelta
                    label="ESPRESSIONE"
                    value={t.face.expression}
                    options={SOUL_EXPRESSIONS}
                    onChange={(v: SoulExpression) => set('face', { expression: v })}
                  />
                  <Slider label="INTENSITÀ" value={intensity} min={0} max={1} step={0.05} onChange={setIntensity}
                    hint="Sotto un terzo la bocca resta quella di riposo: l'intensità non è un interruttore." />
                  <Slider label="ENERGIA" value={energy} min={0} max={1} step={0.05} onChange={setEnergy} />
                  <Slider label="UMORE · TONO" value={tone} min={0} max={100} step={1} onChange={setTone} />
                  <Slider label="UMORE · CARICA" value={charge} min={0} max={100} step={1} onChange={setCharge} />
                  <div className="dev__field">
                    <label className="t-micro dev__check">
                      <input type="checkbox" checked={speaking} onChange={(e) => setSpeaking(e.target.checked)} />
                      STA PARLANDO
                    </label>
                  </div>
                </div>
              ),
            },
          ],
        },
        {
          id: 'shape',
          label: 'SHAPE',
          tabs: [
            {
              id: 'shape',
              label: 'FORMA',
              render: () => (
                <div className="soullab">
                  {palco}
                  <Slider label="DIMENSIONE" value={t.shape.size} min={0.5} max={1.6} step={0.01} onChange={(v) => set('shape', { size: v })} />
                  <Slider label="LARGHEZZA CORPO" value={t.shape.bodyWidth} min={0.6} max={1.5} step={0.01} onChange={(v) => set('shape', { bodyWidth: v })} />
                  <Slider label="ALTEZZA CORPO" value={t.shape.bodyHeight} min={0.6} max={1.5} step={0.01} onChange={(v) => set('shape', { bodyHeight: v })} />
                  <Slider label="ROTONDITÀ" value={t.shape.roundness} min={0.6} max={1} step={0.01} onChange={(v) => set('shape', { roundness: v })}
                    hint="1 = cerchio esatto, cioè un'icona. Sotto, torna disegnato a mano." />
                  <Slider label="ALTEZZA FIAMMA" value={t.shape.wispHeight} min={0.3} max={1.8} step={0.01} onChange={(v) => set('shape', { wispHeight: v })} />
                  <Slider label="LARGHEZZA FIAMMA" value={t.shape.wispWidth} min={0.4} max={2} step={0.01} onChange={(v) => set('shape', { wispWidth: v })} />
                  <Slider label="ZIG-ZAG" value={t.shape.wispBend} min={0} max={2} step={0.01} onChange={(v) => set('shape', { wispBend: v })}
                    hint="A zero diventa una colonna dritta: lo zig-zag è il carattere dello schizzo." />
                  <Slider label="PENDENZA" value={t.shape.wispLean} min={-1} max={1} step={0.01} onChange={(v) => set('shape', { wispLean: v })} />
                </div>
              ),
            },
          ],
        },
        {
          id: 'face',
          label: 'FACE',
          tabs: [
            {
              id: 'face',
              label: 'FACCIA',
              render: () => (
                <div className="soullab">
                  {palco}
                  <Scelta label="ESPRESSIONE" value={t.face.expression} options={SOUL_EXPRESSIONS} onChange={(v: SoulExpression) => set('face', { expression: v })} />
                  <Scelta label="BOCCA" value={t.face.mouthType} options={['AUTO', ...SOUL_MOUTHS] as const} onChange={(v: SoulMouth | 'AUTO') => set('face', { mouthType: v })} />
                  <Slider label="DISTANZA OCCHI" value={t.face.eyeSpacing} min={0.5} max={1.6} step={0.01} onChange={(v) => set('face', { eyeSpacing: v })} />
                  <Slider label="LARGHEZZA OCCHI" value={t.face.eyeWidth} min={0.4} max={2} step={0.01} onChange={(v) => set('face', { eyeWidth: v })} />
                  <Slider label="ALTEZZA OCCHI" value={t.face.eyeHeight} min={0.4} max={2} step={0.01} onChange={(v) => set('face', { eyeHeight: v })} />
                  <Slider label="INCLINAZIONE PALPEBRE" value={t.face.eyeTilt} min={-30} max={30} step={1} onChange={(v) => set('face', { eyeTilt: v })}
                    hint="È la differenza fra scocciato e arrabbiato: stessa palpebra, altra inclinazione." />
                  <Slider label="ASIMMETRIA" value={t.face.asymmetry} min={-4} max={4} step={0.1} onChange={(v) => set('face', { asymmetry: v })} />
                  <Slider label="LARGHEZZA BOCCA" value={t.face.mouthWidth} min={0.4} max={1.8} step={0.01} onChange={(v) => set('face', { mouthWidth: v })} />
                  <Slider label="ALTEZZA BOCCA" value={t.face.mouthHeight} min={0.3} max={2.4} step={0.01} onChange={(v) => set('face', { mouthHeight: v })} />
                  <Slider label="INCLINAZIONE BOCCA" value={t.face.mouthTilt} min={-25} max={25} step={1} onChange={(v) => set('face', { mouthTilt: v })} />
                  <Slider label="ALTEZZA DELLA FACCIA" value={t.face.faceY} min={-10} max={10} step={0.5} onChange={(v) => set('face', { faceY: v })} />
                </div>
              ),
            },
          ],
        },
        {
          id: 'motion',
          label: 'MOTION',
          tabs: [
            {
              id: 'motion',
              label: 'MOVIMENTO',
              render: () => (
                <div className="soullab">
                  {palco}
                  <Slider label="GALLEGGIAMENTO (px)" value={t.motion.floatAmplitude} min={0} max={16} step={0.5} onChange={(v) => set('motion', { floatAmplitude: v })} />
                  <Slider label="DURATA GALLEGGIAMENTO (s)" value={t.motion.floatDurationSec} min={1} max={10} step={0.1} onChange={(v) => set('motion', { floatDurationSec: v })} />
                  <Slider label="RESPIRO" value={t.motion.breathAmount} min={0} max={0.1} step={0.001} onChange={(v) => set('motion', { breathAmount: v })} />
                  <Slider label="ONDEGGIO FIAMMA (°)" value={t.motion.wispSwayDeg} min={0} max={22} step={0.5} onChange={(v) => set('motion', { wispSwayDeg: v })} />
                  <Slider label="DURATA ONDEGGIO (s)" value={t.motion.wispDurationSec} min={1} max={12} step={0.1} onChange={(v) => set('motion', { wispDurationSec: v })}
                    hint="Tienila diversa dal galleggiamento: se vanno in fase la creatura diventa una GIF." />
                  <Slider label="OGNI QUANTO SBATTE (s)" value={t.motion.blinkIntervalSec} min={1} max={12} step={0.1} onChange={(v) => set('motion', { blinkIntervalSec: v })} />
                  <Slider label="PULSAZIONE PARLATO" value={t.motion.talkPulse} min={0} max={0.3} step={0.01} onChange={(v) => set('motion', { talkPulse: v })} />
                  <Slider label="SCHIACCIAMENTO REAZIONE" value={t.motion.reactionSquash} min={0} max={0.35} step={0.01} onChange={(v) => set('motion', { reactionSquash: v })} />
                </div>
              ),
            },
          ],
        },
        {
          id: 'color',
          label: 'COLOR',
          tabs: [
            {
              id: 'color',
              label: 'COLORE',
              render: () => (
                <div className="soullab">
                  {palco}
                  <Scelta
                    label="COLORE DEL CORPO"
                    value={t.color.bodySource}
                    options={['MON_PRIMARY', 'TEST'] as const}
                    onChange={(v) => set('color', { bodySource: v })}
                  />
                  <div className="dev__field soullab__field">
                    <label className="t-micro">COLORE DI PROVA</label>
                    <input type="color" aria-label="Colore di prova" value={t.color.bodyTest} onChange={(e) => set('color', { bodyTest: e.target.value })} />
                  </div>
                  <div className="dev__field soullab__field">
                    <label className="t-micro">COLORE DELLA FACCIA</label>
                    <input type="color" aria-label="Colore della faccia" value={t.color.face} onChange={(e) => set('color', { face: e.target.value })} />
                  </div>
                  <div className="dev__field">
                    <label className="t-micro dev__check">
                      <input type="checkbox" checked={t.color.autoContrast} onChange={(e) => set('color', { autoContrast: e.target.checked })} />
                      CONTRASTO AUTOMATICO
                    </label>
                  </div>
                  <Slider label="UMORE · TINTA (±°)" value={t.color.hueMood} min={0} max={20} step={1} onChange={(v) => set('color', { hueMood: v })}
                    hint="Il brief mette il tetto a 8: oltre, l'umore comincia a sostituire l'identità." />
                  <Slider label="UMORE · SATURAZIONE (±%)" value={t.color.satMood} min={0} max={40} step={1} onChange={(v) => set('color', { satMood: v })} />
                  <Slider label="UMORE · LUMINOSITÀ (±%)" value={t.color.litMood} min={0} max={25} step={1} onChange={(v) => set('color', { litMood: v })} />
                </div>
              ),
            },
          ],
        },
        {
          id: 'history',
          label: 'HISTORY',
          tabs: [
            {
              id: 'history',
              label: 'VERSIONI',
              render: () => (
                <div className="soullab">
                  {palco}
                  <div className="dev__row">
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        setStoria((s) => [...s, { id: `V${s.length}`, label: `V${s.length} · ${t.face.expression}`, tuning: t }])
                      }
                    >
                      SALVA QUESTA VERSIONE
                    </button>
                    <button type="button" className="btn" onClick={() => setT(SOUL_DEFAULT)}>
                      TORNA A R0
                    </button>
                  </div>

                  <ul className="soullab__versions">
                    {storia.map((v) => (
                      <li key={v.id}>
                        <button type="button" className="btn btn--ghost" onClick={() => setT(v.tuning)}>
                          {v.label}
                        </button>
                      </li>
                    ))}
                  </ul>

                  {/* 🔷 §12 — i due file da riportare indietro. */}
                  <div className="dev__row">
                    <button type="button" className="btn btn--primary" onClick={() => scarica('soul-v1-tuning.json', JSON.stringify(snapshot(), null, 2), 'application/json')}>
                      SCARICA soul-v1-tuning.json
                    </button>
                    <button type="button" className="btn" onClick={() => scarica('soul-v1-handoff.txt', handoff(), 'text/plain')}>
                      SCARICA soul-v1-handoff.txt
                    </button>
                  </div>

                  <pre className="soullab__handoff">{handoff()}</pre>
                </div>
              ),
            },
          ],
        },
      ]}
    />
  );
}
