/* ============================================================================
   IL CONTROLLORE — mette insieme le tre sorgenti

   Tre cose decidono come appare la Soul in un istante, e vengono da tre posti
   diversi che non si conoscono fra loro:

     LA TARATURA   quella che tu tocchi in SOUL.LAB
     L'UMORE       quello vero del .mon, che sta in SYSTEM
     IL SEGNALE    l'espressione che arriva insieme alla risposta

   Questo file è l'unico che le vede tutte e tre, ed è puro: dati dentro,
   descrizione visiva fuori. Chi disegna non decide niente; chi decide non
   disegna niente. Serve a poter rifare il disegno senza toccare le regole, e
   a poter provare le regole senza aprire un browser.
   ========================================================================= */

import { SOUL_FACES } from './soulExpressions';
import { bodyColor, faceColor, moodModulation, type SoulModulation } from './SoulMoodAdapter';
import type { SoulCue, SoulFaceState, SoulMoodInput, SoulTuning } from './types';

export type SoulVisualState = {
  face: SoulFaceState;
  body: string;
  ink: string;
  mod: SoulModulation;
  /** Moltiplicatore complessivo del movimento: umore × energia del segnale. */
  energy: number;
  /** 0..1 — quanto è marcata l'espressione adesso. */
  intensity: number;
};

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * L'espressione a riposo verso cui tutto ritorna.
 *
 * 🔒 `neutral` e non `deadpan`: la faccia di riposo non deve avere un'opinione.
 */
const RIPOSO = SOUL_FACES.neutral;

export function resolveSoulVisualState({
  tuning,
  mood,
  cue,
  monPrimary,
}: {
  tuning: SoulTuning;
  mood: SoulMoodInput;
  cue: SoulCue | null;
  /** Il colore del .mon attivo, `#rrggbb`, o `null` se non ce n'è uno. */
  monPrimary: string | null;
}): SoulVisualState {
  const mod = moodModulation(mood, tuning.color);

  /* Quale espressione: quella del segnale se c'è, altrimenti quella scelta a
     mano nel laboratorio. */
  const nome = cue?.expression ?? tuning.face.expression;
  const scelta = SOUL_FACES[nome] ?? RIPOSO;
  const intensity = cue ? Math.min(1, Math.max(0, cue.intensity)) : 1;

  /* ⚠️ L'INTENSITÀ NON È UN INTERRUTTORE. Un segnale «arrabbiato al 30%» non
     è una faccia arrabbiata più piccola: è la faccia neutra spostata di un
     terzo verso quella arrabbiata. Senza questa interpolazione la creatura
     scatterebbe fra dodici pose fisse, che è esattamente l'aria da emoji che
     il brief vieta. */
  const face: SoulFaceState = {
    leftEyeOpen: mix(RIPOSO.leftEyeOpen, scelta.leftEyeOpen, intensity),
    rightEyeOpen: mix(RIPOSO.rightEyeOpen, scelta.rightEyeOpen, intensity),
    leftEyeTilt: mix(RIPOSO.leftEyeTilt, scelta.leftEyeTilt, intensity),
    rightEyeTilt: mix(RIPOSO.rightEyeTilt, scelta.rightEyeTilt, intensity),
    /* La bocca è una FORMA, non un numero: non si interpola, si sceglie. Sotto
       un terzo di intensità resta quella di riposo. */
    mouthType:
      tuning.face.mouthType !== 'AUTO'
        ? tuning.face.mouthType
        : intensity < 0.34
          ? RIPOSO.mouthType
          : scelta.mouthType,
    mouthWidth: mix(RIPOSO.mouthWidth, scelta.mouthWidth, intensity) * tuning.face.mouthWidth,
    mouthOpen: mix(RIPOSO.mouthOpen, scelta.mouthOpen, intensity),
    mouthTilt: mix(RIPOSO.mouthTilt, scelta.mouthTilt, intensity) + tuning.face.mouthTilt,
  };

  /* 🔒 L'IDENTITÀ VIENE DAL .MON, e il colore di prova è solo del laboratorio:
     in prodotto `bodySource` resta `MON_PRIMARY`, e il ripiego dello schizzo
     entra in scena solo quando un .mon non c'è ancora. */
  const base =
    tuning.color.bodySource === 'TEST'
      ? tuning.color.bodyTest
      : (monPrimary ?? tuning.color.bodyTest);

  const body = bodyColor(base, mod);

  return {
    face,
    body,
    ink: faceColor(base, tuning.color),
    mod,
    energy: mod.energy * (cue ? 0.6 + cue.energy * 0.8 : 1),
    intensity,
  };
}
