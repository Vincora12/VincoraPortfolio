/* ============================================================================
   LA SOUL — composizione

   Un `<svg>` e tre pezzi: corpo, fiamma, faccia. Nessuna immagine, nessuna
   libreria: il brief chiede «ultra-light», e questo pesa quanto il testo che
   stai leggendo.

   🔒 I SEI STRATI DI MOVIMENTO (§6) SONO INDIPENDENTI, e devono restarlo:

     FLOAT     tutto il corpo sale e scende, lentissimo
     WISP      la fiamma insegue con un ritardo suo
     BREATH    un respiro di scala, quasi invisibile
     BLINK     ogni tanto le palpebre scendono e risalgono
     TALK      la bocca pulsa mentre esce del testo
     REACTION  uno schiacciamento corto quando arriva un segnale

   ⚠️ «Do not make the Soul constantly bouncy». Se questi sei diventassero
   una animazione sola, sincronizzata, la creatura rimbalzerebbe a tempo come
   una GIF. Sono separati perché è la loro DESINCRONIZZAZIONE a farla sembrare
   viva: la fiamma arriva tardi, il respiro non c'entra col galleggiamento, e
   il battito di ciglia non chiede permesso a nessuno.
   ========================================================================= */

import { useEffect, useRef, useState } from 'react';
import { bodyPath, eyes, mouthPath, wispPath, VIEW_H, VIEW_W } from './soulGeometry';
import { resolveSoulVisualState } from './SoulController';
import type { SoulCue, SoulMoodInput, SoulTuning } from './types';
import './soul.css';

export function Soul({
  tuning,
  mood,
  cue = null,
  monPrimary = null,
  speaking = false,
  size = 160,
  title,
}: {
  tuning: SoulTuning;
  mood: SoulMoodInput;
  cue?: SoulCue | null;
  monPrimary?: string | null;
  speaking?: boolean;
  size?: number;
  title?: string;
}) {
  const v = resolveSoulVisualState({ tuning, mood, cue, monPrimary });
  const m = tuning.motion;

  /* --- BLINK ---------------------------------------------------------------
     🔒 Sta in React e non in CSS perché è l'unico strato IRREGOLARE: un
     battito di ciglia a intervallo esatto si legge come un lampeggio, cioè
     come un guasto. L'attesa è l'intervallo ± metà, tirata a sorte ogni
     volta. */
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    let vivo = true;
    let t: ReturnType<typeof setTimeout>;
    const giro = () => {
      const attesa = m.blinkIntervalSec * 1000 * (0.75 + Math.random() * 0.9);
      t = setTimeout(() => {
        if (!vivo) return;
        setBlink(true);
        setTimeout(() => vivo && setBlink(false), 120);
        giro();
      }, attesa);
    };
    giro();
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [m.blinkIntervalSec]);

  /* --- REACTION ------------------------------------------------------------
     Uno schiacciamento corto ogni volta che ARRIVA un segnale nuovo. Non a
     ogni render: solo quando cambia davvero, altrimenti la creatura
     sussulterebbe a ogni battuta di tastiera. */
  const [reagisce, setReagisce] = useState(false);
  const ultimo = useRef<string | null>(null);
  useEffect(() => {
    const firma = cue ? `${cue.expression}:${cue.intensity}` : null;
    if (firma === ultimo.current) return;
    ultimo.current = firma;
    if (!firma) return;
    setReagisce(true);
    const t = setTimeout(() => setReagisce(false), 420);
    return () => clearTimeout(t);
  }, [cue]);

  const face = blink
    ? { ...v.face, leftEyeOpen: 0.04, rightEyeOpen: 0.04 }
    : v.face;

  const [sx, dx] = eyes(face, tuning.face);
  const bocca = mouthPath(face.mouthType, face, tuning.face);

  /* Il movimento rallenta o accelera con l'energia: stanco = più lento. Non
     si cambia l'ampiezza, si cambia il TEMPO — una creatura stanca fa gli
     stessi gesti, più piano. */
  const stile = {
    '--soul-float': `${m.floatAmplitude}px`,
    '--soul-float-t': `${m.floatDurationSec / v.energy}s`,
    '--soul-breath': `${1 + m.breathAmount}`,
    '--soul-breath-t': `${(m.floatDurationSec * 0.68) / v.energy}s`,
    '--soul-sway': `${m.wispSwayDeg * v.energy}deg`,
    '--soul-sway-t': `${m.wispDurationSec / v.energy}s`,
    '--soul-talk': `${1 + m.talkPulse}`,
    '--soul-squash': `${1 + m.reactionSquash}`,
    '--soul-body': v.body,
    '--soul-ink': v.ink,
    width: `${size}px`,
  } as React.CSSProperties;

  return (
    <div className={`soul ${reagisce ? 'soul--reacts' : ''}`} style={stile}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="soul__svg"
        role={title ? 'img' : 'presentation'}
        aria-label={title}
      >
        <defs>
          {/* Le palpebre. Ogni occhio è un'ellisse a cui si toglie tutto quello
              che sta sopra il bordo della palpebra: vedi `soulGeometry.ts`. */}
          {[sx, dx].map((e, i) => (
            <clipPath key={i} id={`soul-lid-${i}`} clipPathUnits="userSpaceOnUse">
              <rect
                x={e.cx - 20}
                y={e.lidY}
                width="40"
                height="40"
                transform={`rotate(${e.lidDeg} ${e.cx} ${e.lidY})`}
              />
            </clipPath>
          ))}
        </defs>

        <g className="soul__float" style={{ transformOrigin: '50px 92px' }}>
          <g className="soul__breath" style={{ transformOrigin: '50px 92px' }}>
            {/* La fiamma sta SOTTO il corpo nell'ordine di disegno: nello
                schizzo esce da dietro la testa, non gli sta appoggiata sopra. */}
            <g className="soul__wisp" style={{ transformOrigin: '50px 68px' }}>
              <path d={wispPath(tuning.shape)} fill="var(--soul-body)" />
            </g>

            <path d={bodyPath(tuning.shape)} fill="var(--soul-body)" />

            <g className="soul__face" fill="var(--soul-ink)" stroke="var(--soul-ink)">
              {[sx, dx].map((e, i) => (
                <ellipse
                  key={i}
                  cx={e.cx}
                  cy={e.cy}
                  rx={e.rx}
                  ry={e.ry}
                  strokeWidth="0"
                  clipPath={`url(#soul-lid-${i})`}
                />
              ))}

              <g
                className={speaking ? 'soul__mouth soul__mouth--talks' : 'soul__mouth'}
                style={{ transformOrigin: '50px 101px' }}
              >
                <path
                  d={bocca}
                  fill={face.mouthType === 'open' ? 'var(--soul-ink)' : 'none'}
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  transform={`rotate(${face.mouthTilt} 50 101)`}
                />
              </g>
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
