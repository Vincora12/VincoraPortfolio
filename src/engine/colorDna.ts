/* ============================================================================
   PALETTE DNA (§27 palette_dna, MASTER SPEC §10.2)

   §27 chiama questo asse `palette_dna` e §40 impone che finisca esplicitamente
   nel prompt: «Must explicitly materialize: … palette DNA».

   La palette non nasce da un materiale — quel modello era sbagliato — ma dalla
   combinazione Family + Affinity + Mood, che è ciò che la bibbia usa per
   definire l'identità visiva.

   Vincoli della MASTER SPEC §10.2 che restano:
   • La base della UI è bianco/nero; il colore è solo accento.
   • Il personaggio è l'unica sorgente di colore. Niente UI arcobaleno.
   • `on_primary` deve garantire contrasto leggibile sopra `primary`.
   ========================================================================= */

import { pick, pickInt, type Rng } from './rng';
import type { PaletteDna } from './types';

/* --- Conversioni ----------------------------------------------------------- */

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function hslToHex(h: number, s: number, l: number): string {
  return `#${hslToRgb(h, s, l).map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function readableOn(background: string): string {
  return contrastRatio(background, '#111111') >= contrastRatio(background, '#ffffff')
    ? '#111111'
    : '#ffffff';
}

/* --- Nomi leggibili delle tinte, usati nei prompt (§40) -------------------- */

function hueName(h: number): string {
  const bands: [number, string][] = [
    [15, 'red'], [40, 'orange'], [65, 'yellow'], [95, 'lime'], [150, 'green'],
    [185, 'teal'], [210, 'cyan'], [250, 'blue'], [280, 'violet'], [315, 'magenta'],
    [345, 'pink'], [360, 'red'],
  ];
  const hh = ((h % 360) + 360) % 360;
  for (const [max, name] of bands) if (hh < max) return name;
  return 'red';
}

function toneName(s: number, l: number): string {
  if (s < 0.12) return l > 0.6 ? 'pale neutral' : l < 0.3 ? 'near-black neutral' : 'mid grey';
  const sat = s > 0.75 ? 'saturated' : s > 0.45 ? 'mid-saturation' : 'desaturated';
  const light = l > 0.68 ? 'light' : l < 0.32 ? 'deep' : 'mid';
  return `${sat} ${light}`;
}

/* --- Tinte di partenza per Family e Affinity ------------------------------- */

const FAMILY_HUES: Record<string, number[]> = {
  ANGEL: [45, 190, 0], BEAST: [28, 15, 40], DRAGON: [355, 130, 265],
  REPTILE: [95, 140, 35], MACHINE: [205, 0, 20], AQUA: [195, 215, 170],
  PLANT: [110, 85, 340], DEMON: [355, 300, 20], UNDEAD: [265, 200, 0],
  PSYCHIC: [280, 320, 240], MINERAL: [230, 30, 0], ALIEN: [155, 285, 75],
  FOOD: [30, 350, 55], INSECT: [70, 25, 190], AMPHIBIA: [160, 330, 185],
  FAIRY: [320, 275, 55], FUNGUS: [15, 285, 40], MICROBE: [130, 200, 305],
  SLIME: [150, 190, 100],
};

const AFFINITY_HUE_SHIFT: Record<string, number> = {
  ANGEL: 30, DEMON: -20, MACHINE: 15, PLANT: 60, AQUA: 45, PSYCHIC: 75,
  MINERAL: 20, SLIME: 50, BEAST: -15, DRAGON: -30, UNDEAD: 90, ALIEN: 110,
  ELECTRIC: 165, FIRE: -40, POISON: 100, FISH: 40,
};

/** §10 — il mood sposta saturazione e luminosità, non la tinta. */
const MOOD_TONE: Record<string, { sat: number; light: number }> = {
  CUTE: { sat: 0.1, light: 0.08 }, GOOFY: { sat: 0.12, light: 0.06 },
  BRIGHT: { sat: 0.15, light: 0.1 }, AGGRESSIVE: { sat: 0.18, light: -0.06 },
  CHAOTIC: { sat: 0.2, light: 0.02 }, SAD: { sat: -0.2, light: -0.05 },
  MYSTERIOUS: { sat: -0.1, light: -0.14 }, WATCHFUL: { sat: -0.05, light: -0.04 },
  SEDUCTIVE: { sat: 0.05, light: -0.1 }, FLIRTY: { sat: 0.14, light: 0.04 },
  FERAL: { sat: 0.2, light: -0.02 }, AFFECTIONATE: { sat: 0.08, light: 0.06 },
  ALLURING: { sat: 0.02, light: -0.06 }, STOIC: { sat: -0.18, light: -0.02 },
  CALM: { sat: -0.12, light: 0.04 }, CREEPY: { sat: -0.06, light: -0.16 },
};

/* --- Generazione ----------------------------------------------------------- */

export function generatePaletteDna(
  rng: Rng,
  family: string,
  affinity: string,
  mood: string,
): PaletteDna {
  const baseHue = pick(rng, FAMILY_HUES[family] ?? [200, 40, 300]);
  const primaryHue = (baseHue + pickInt(rng, -12, 12) + 360) % 360;

  const tone = MOOD_TONE[mood] ?? { sat: 0, light: 0 };
  const achromatic = baseHue === 0;

  const primarySat = clamp01((achromatic ? 0.08 : 0.62) + tone.sat + rng() * 0.2);
  const primaryLight = clamp01((achromatic ? 0.24 : 0.46) + tone.light + rng() * 0.1);

  // L'Affinity sposta la tinta dell'accento: è la contaminazione che si vede.
  const shift = AFFINITY_HUE_SHIFT[affinity] ?? 40;
  const accentHue = (primaryHue + shift + pickInt(rng, -10, 10) + 360) % 360;
  const accentSat = clamp01(0.68 + tone.sat * 0.5 + rng() * 0.22);
  const accentLight = clamp01(0.48 + rng() * 0.1);

  const primary = hslToHex(primaryHue, primarySat, primaryLight);
  const accent = hslToHex(accentHue, accentSat, accentLight);

  // §12 DESIGNER TOY chiede «3–5 bold colors»: cinque campioni sono il tetto.
  const swatches = [
    primary,
    accent,
    hslToHex(primaryHue, primarySat * 0.45, Math.min(0.92, primaryLight + 0.36)),
    hslToHex(primaryHue, primarySat * 0.85, Math.max(0.07, primaryLight - 0.28)),
    hslToHex(accentHue, accentSat * 0.3, 0.88),
  ];

  const swatch_names = [
    `${toneName(primarySat, primaryLight)} ${hueName(primaryHue)} (primary)`,
    `${toneName(accentSat, accentLight)} ${hueName(accentHue)} (accent)`,
    `light ${hueName(primaryHue)} tint`,
    `deep ${hueName(primaryHue)} shade`,
    `washed ${hueName(accentHue)} highlight`,
  ];

  return { primary, accent, on_primary: readableOn(primary), swatches, swatch_names };
}

/* --- Applicazione alla UI (MASTER SPEC §10.2) ------------------------------ */

export function applyPaletteDna(
  dna: PaletteDna | null,
  root: HTMLElement = document.documentElement,
) {
  if (!dna) {
    root.style.removeProperty('--char-primary');
    root.style.removeProperty('--char-accent');
    root.style.removeProperty('--char-on-primary');
    root.style.removeProperty('--char-primary-soft');
    return;
  }

  root.style.setProperty('--char-primary', dna.primary);
  root.style.setProperty('--char-accent', ensureContrastOnWhite(dna.accent));
  root.style.setProperty('--char-on-primary', dna.on_primary);
  root.style.setProperty('--char-primary-soft', `${dna.primary}1f`);
}

/** Scurisce finché il contrasto sul bianco raggiunge 3:1. */
export function ensureContrastOnWhite(hex: string, target = 3): string {
  let [r, g, b] = hexToRgb(hex);
  let out = hex;
  for (let i = 0; i < 24 && contrastRatio(out, '#ffffff') < target; i++) {
    r = Math.max(0, Math.round(r * 0.9));
    g = Math.max(0, Math.round(g * 0.9));
    b = Math.max(0, Math.round(b * 0.9));
    out = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  return out;
}

function clamp01(v: number): number {
  return Math.max(0.04, Math.min(0.96, v));
}
