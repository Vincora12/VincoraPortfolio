/* ============================================================================
   LE DODICI ESPRESSIONI — numeri, non disegni

   🔒 TRE SONO ANCORE, e non sono opinioni: stanno nello schizzo.

     sleepy / annoyed  ← la faccia di SINISTRA: palpebre a metà, dritte, e la
                         bocca a onda che va su e giù
     neutral / deadpan ← la faccia di CENTRO: due occhi aperti, verticali, e
                         un trattino corto
     angry             ← la faccia di DESTRA: palpebre a metà ma INCLINATE
                         verso l'interno, e la bocca a denti

   ⚠️ L'INCLINAZIONE È TUTTA LA DIFFERENZA FRA SCOCCIATO E ARRABBIATO. Sono
   la stessa palpebra alla stessa altezza: cambia solo che nello scocciato è
   orizzontale e nell'arrabbiato scende verso il centro della faccia. Le
   altre nove espressioni si muovono dentro quello stesso vocabolario — mai
   sopracciglia, mai naso, mai un tratto nuovo — perché è il vocabolario che
   rende quelle tre riconoscibili come la stessa creatura.
   ========================================================================= */

import type { SoulExpression, SoulFaceState } from './types';

/** Il volto a riposo, da cui tutte le altre si scostano. */
const BASE: SoulFaceState = {
  leftEyeOpen: 1,
  rightEyeOpen: 1,
  leftEyeTilt: 0,
  rightEyeTilt: 0,
  mouthType: 'small',
  mouthWidth: 1,
  mouthOpen: 0,
  mouthTilt: 0,
};

const f = (patch: Partial<SoulFaceState>): SoulFaceState => ({ ...BASE, ...patch });

export const SOUL_FACES: Record<SoulExpression, SoulFaceState> = {
  /* ANCORA — centro dello schizzo. */
  neutral: f({}),
  deadpan: f({ leftEyeOpen: 0.86, rightEyeOpen: 0.86, mouthType: 'flat', mouthWidth: 0.8 }),

  /* ANCORA — sinistra dello schizzo. Palpebre a metà, DRITTE. */
  sleepy: f({ leftEyeOpen: 0.34, rightEyeOpen: 0.3, mouthType: 'zigzag', mouthWidth: 0.95 }),
  annoyed: f({ leftEyeOpen: 0.42, rightEyeOpen: 0.42, mouthType: 'zigzag', mouthWidth: 1 }),

  /* ANCORA — destra dello schizzo. Stesse palpebre, INCLINATE verso il centro. */
  /* 🔴 ERA `open: 0.46` CON `tilt: 22`, e i due si sommavano: la palpebra
     scendeva a metà E poi si inclinava, chiudendo l'occhio quasi del tutto.
     A schermo l'arrabbiato non aveva occhi — solo due trattini — mentre
     nello schizzo ha due occhi GRANDI e obliqui, ed è quello che lo rende
     arrabbiato invece che addormentato. L'inclinazione fa il lavoro; la
     palpebra deve restare alta. */
  angry: f({
    leftEyeOpen: 0.78,
    rightEyeOpen: 0.78,
    leftEyeTilt: 26,
    rightEyeTilt: -26,
    mouthType: 'fang',
    mouthWidth: 1.25,
    mouthOpen: 0.7,
  }),

  /* Le altre otto restano dentro lo stesso vocabolario. */
  skeptical: f({ leftEyeOpen: 0.95, rightEyeOpen: 0.4, rightEyeTilt: 14, mouthType: 'flat', mouthTilt: 9 }),
  amused: f({ leftEyeOpen: 0.55, rightEyeOpen: 0.55, mouthType: 'up', mouthWidth: 0.9, mouthTilt: 5 }),
  happy: f({ leftEyeOpen: 0.5, rightEyeOpen: 0.5, mouthType: 'up', mouthWidth: 1.1 }),
  excited: f({ leftEyeOpen: 1.15, rightEyeOpen: 1.15, mouthType: 'open', mouthWidth: 0.95, mouthOpen: 0.9 }),
  sad: f({ leftEyeOpen: 0.62, rightEyeOpen: 0.62, leftEyeTilt: -16, rightEyeTilt: 16, mouthType: 'down', mouthWidth: 0.85 }),
  concerned: f({ leftEyeOpen: 0.8, rightEyeOpen: 0.8, leftEyeTilt: -10, rightEyeTilt: 10, mouthType: 'zigzag', mouthWidth: 0.8 }),
  surprised: f({ leftEyeOpen: 1.3, rightEyeOpen: 1.3, mouthType: 'open', mouthWidth: 0.6, mouthOpen: 1 }),
};

/* ============================================================================
   LA TARATURA DI PARTENZA

   Questi numeri sono un punto di partenza da MUOVERE: SOUL.LAB esiste per
   questo, e tu resti il direttore artistico. Non sono canone.
   ========================================================================= */

import type { SoulTuning } from './types';

export const SOUL_DEFAULT: SoulTuning = {
  shape: {
    size: 1,
    bodyWidth: 1,
    bodyHeight: 1,
    /* 🔒 Sotto 1 il corpo NON è un cerchio perfetto, ed è voluto: il brief
       dice «hand-drawn / characterful rather than sterile». Un cerchio esatto
       è un'icona di interfaccia, non una creatura. */
    roundness: 0.93,
    wispHeight: 1,
    wispWidth: 1,
    wispBend: 1,
    wispLean: 0.18,
  },
  face: {
    expression: 'neutral',
    eyeSpacing: 1,
    eyeWidth: 1,
    eyeHeight: 1,
    eyeTilt: 0,
    asymmetry: 0,
    mouthType: 'AUTO',
    mouthWidth: 1,
    mouthHeight: 1,
    mouthTilt: 0,
    faceY: 0,
  },
  motion: {
    floatAmplitude: 4,
    floatDurationSec: 4.2,
    breathAmount: 0.015,
    wispSwayDeg: 5,
    wispDurationSec: 5.6,
    blinkIntervalSec: 4.2,
    talkPulse: 0.06,
    reactionSquash: 0.08,
  },
  color: {
    bodySource: 'MON_PRIMARY',
    /* I viola e verdi dello schizzo, tenuti SOLO come esempio di prova. */
    bodyTest: '#8A00FF',
    face: '#18F5B4',
    autoContrast: false,
    hueMood: 8,
    satMood: 16,
    litMood: 8,
  },
};
