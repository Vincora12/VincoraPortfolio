/* ============================================================================
   L'UMORE NON CAMBIA CHI SEI, CAMBIA COME TI VEDI OGGI

   🔒 IL DIVIETO PIÙ IMPORTANTE DEL BRIEF, scritto per esteso: «Do not use
   cliché fixed mappings like sad = blue, angry = red, happy = yellow».

   Non è una questione di gusto. Il colore del corpo È l'identità del .mon —
   viene dal suo Palette DNA. Se triste lo facesse blu, l'umore
   sostituirebbe l'identità: sarebbe un'altra creatura ogni sera. Quindi
   l'umore MODULA e basta, dentro tetti stretti e dichiarati:

     tinta        ±8°
     saturazione  ±16%
     luminosità   ±8%

   Otto gradi di tinta si vedono e non spostano il colore in un'altra
   famiglia. È tutta la regola.

   ⚠️ E l'umore tocca anche il MOVIMENTO, che è la parte che si legge davvero:
   stanco = meno energia, eccitato = più energia. Un colore leggermente meno
   saturo lo noti se guardi; una creatura che si muove più piano lo senti
   subito.
   ========================================================================= */

import type { SoulColor, SoulMoodInput } from './types';

export type SoulModulation = {
  /** Gradi da aggiungere alla tinta del corpo. */
  hue: number;
  /** Moltiplicatore della saturazione. 1 = invariata. */
  sat: number;
  /** Moltiplicatore della luminosità. */
  lit: number;
  /** Moltiplicatore dell'energia del movimento. */
  energy: number;
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Da -1 a +1, con 50 al centro: è la scala che usa `engine/mood.ts`. */
const centrata = (v: number) => clamp((v - 50) / 50, -1, 1);

export function moodModulation(mood: SoulMoodInput, color: SoulColor): SoulModulation {
  const tono = centrata(mood.tone);
  const carica = centrata(mood.charge);

  return {
    /* Il tono scalda o raffredda di pochissimo. */
    hue: tono * color.hueMood,
    /* La carica satura: scarico = spento, carico = pieno. */
    sat: 1 + carica * (color.satMood / 100),
    /* Il tono schiarisce appena. */
    lit: 1 + tono * (color.litMood / 100),
    /* 🔒 Il movimento ha un pavimento: 0.55. A zero la creatura sembrerebbe
       rotta, non stanca — e «rotta» non è un umore. */
    energy: clamp(0.55 + (carica + 1) * 0.45, 0.55, 1.45),
  };
}

/* ============================================================================
   IL COLORE, IN CONCRETO
   ========================================================================= */

/** `#rrggbb` → [h, s, l] con h in gradi e s/l in percento. */
export function hexToHsl(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [280, 100, 50];
  const n = parseInt(m[1]!, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s * 100, l * 100];
}

export const hsl = (h: number, s: number, l: number) =>
  `hsl(${((h % 360) + 360) % 360} ${clamp(s, 0, 100).toFixed(1)}% ${clamp(l, 0, 100).toFixed(1)}%)`;

/** Il colore del corpo, di oggi: identità + modulazione dell'umore. */
export function bodyColor(base: string, mod: SoulModulation): string {
  const [h, s, l] = hexToHsl(base);
  return hsl(h + mod.hue, s * mod.sat, l * mod.lit);
}

/* ============================================================================
   IL CONTRASTO DELLA FACCIA

   🔒 UNA FACCIA CHE NON SI LEGGE NON È UN'ESPRESSIONE. Il verde dello
   schizzo funziona sul viola perché ci sta lontano sulla ruota: `autoContrast`
   generalizza quella scelta invece di ricopiarla — tinta opposta, e la
   luminosità spinta dalla parte in cui il corpo NON è.
   ========================================================================= */
export function faceColor(body: string, color: SoulColor): string {
  if (!color.autoContrast) return color.face;
  const [h, s, l] = hexToHsl(body.startsWith('#') ? body : color.bodyTest);
  return hsl(h + 155, Math.max(60, s), l > 55 ? 16 : 78);
}
