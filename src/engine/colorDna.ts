/* ============================================================================
   COLOR DNA (§10.2)

   ┌───────────────────────────────────────────────────────────────────────┐
   │  PROVISIONAL — NOT CANONICAL                                          │
   │  §18 marca 🟡 "Exact adaptive colour extraction/accessibility          │
   │  algorithm". Qui il colore è DERIVATO dagli assi canonici perché       │
   │  l'immagine del .mon non esiste ancora. Quando arriveranno gli asset,  │
   │  questa funzione va sostituita da un campionamento reale dal           │
   │  Character Master, mantenendo la stessa firma e lo stesso contratto    │
   │  di contrasto.                                                        │
   └───────────────────────────────────────────────────────────────────────┘

   Regole non negoziabili (§10.2, §17):
   • La base della UI resta bianco/nero: il colore è solo accento.
   • Il personaggio è l'unica sorgente di colore. Niente UI arcobaleno.
   • `onPrimary` deve garantire contrasto leggibile sopra `primary`.
   ========================================================================= */

import { affinityDef, type Affinity } from './taxonomy';
import { pick, pickInt, type Rng } from './rng';
import type { ColorDna } from './types';

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
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

export function hslToHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, s, l);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

/** Luminanza relativa WCAG. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapporto di contrasto WCAG fra due colori. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Testo leggibile sopra un fondo: sceglie fra inchiostro e bianco quello che
 * dà il contrasto migliore. Il minimo AA per testo grande è 3:1, per testo
 * normale 4.5:1 — qui teniamo il massimo disponibile, perché le label di
 * sistema sono piccole.
 */
export function readableOn(background: string): string {
  const onDark = '#ffffff';
  const onLight = '#111111';
  return contrastRatio(background, onLight) >= contrastRatio(background, onDark)
    ? onLight
    : onDark;
}

/** Nomi leggibili delle tinte, usati testualmente nei prompt asset (§22.1). */
function hueName(h: number): string {
  const bands: [number, string][] = [
    [15, 'red'],
    [40, 'orange'],
    [65, 'yellow'],
    [95, 'lime'],
    [150, 'green'],
    [185, 'teal'],
    [210, 'cyan'],
    [250, 'blue'],
    [280, 'violet'],
    [315, 'magenta'],
    [345, 'pink'],
    [360, 'red'],
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

/* --- Generazione ----------------------------------------------------------- */

/**
 * Deriva il Color DNA dall'Affinity (che è ciò che trasforma materia e
 * anatomia, §4) più una deviazione seminata. L'Affinity resta il vincolo:
 * un .mon CERAMIC non esce mai con la palette di uno ELECTRIC.
 */
export function generateColorDna(rng: Rng, affinity: Affinity): ColorDna {
  const def = affinityDef(affinity);

  const baseHue = pick(rng, def.hues);
  const drift = pickInt(rng, -14, 14);
  const primaryHue = (baseHue + drift + 360) % 360;

  // Le affinità acromatiche (hue 0 nella loro lista) restano quasi grigie:
  // il colore non viene forzato dove il materiale non lo prevede.
  const achromatic = def.hues.filter((h) => h === 0).length > 0 && baseHue === 0;

  const primarySat = achromatic ? 0.05 + rng() * 0.08 : 0.62 + rng() * 0.3;
  const primaryLight = achromatic ? 0.2 + rng() * 0.12 : 0.42 + rng() * 0.16;

  // L'accento è una seconda tinta della stessa famiglia, non un colore libero:
  // evita l'effetto arcobaleno vietato da §10.2.
  const accentShift = pick(rng, [28, -28, 44, -44, 160]);
  const accentHue = (primaryHue + accentShift + 360) % 360;
  const accentSat = achromatic ? 0.5 + rng() * 0.3 : 0.7 + rng() * 0.25;
  const accentLight = 0.46 + rng() * 0.12;

  const primary = hslToHex(primaryHue, primarySat, primaryLight);
  const accent = hslToHex(accentHue, accentSat, accentLight);

  const palette = [
    primary,
    accent,
    hslToHex(primaryHue, primarySat * 0.5, Math.min(0.9, primaryLight + 0.34)),
    hslToHex(primaryHue, primarySat * 0.8, Math.max(0.08, primaryLight - 0.26)),
    hslToHex(accentHue, accentSat * 0.35, 0.86),
  ];

  const paletteNames = [
    `${toneName(primarySat, primaryLight)} ${hueName(primaryHue)} (character primary)`,
    `${toneName(accentSat, accentLight)} ${hueName(accentHue)} (character accent)`,
    `light ${hueName(primaryHue)} tint`,
    `deep ${hueName(primaryHue)} shade`,
    `washed ${hueName(accentHue)} highlight`,
  ];

  return {
    primary,
    accent,
    onPrimary: readableOn(primary),
    palette,
    paletteNames,
  };
}

/**
 * Applica il Color DNA alla UI (§10.2): ritematizza gli accenti senza toccare
 * l'architettura. Se `dna` è null la UI torna bianco/nero puro.
 */
export function applyColorDna(dna: ColorDna | null, root: HTMLElement = document.documentElement) {
  if (!dna) {
    root.style.removeProperty('--char-primary');
    root.style.removeProperty('--char-accent');
    root.style.removeProperty('--char-on-primary');
    root.style.removeProperty('--char-primary-soft');
    return;
  }

  // L'accento deve restare visibile sopra il campo bianco: se il contrasto è
  // insufficiente lo scuriamo finché non passa. Il colore non è mai l'unico
  // veicolo di informazione (§17), ma deve comunque essere percepibile.
  const accent = ensureContrastOnWhite(dna.accent);

  root.style.setProperty('--char-primary', dna.primary);
  root.style.setProperty('--char-accent', accent);
  root.style.setProperty('--char-on-primary', dna.onPrimary);
  root.style.setProperty('--char-primary-soft', `${dna.primary}1f`);
}

/** Scurisce progressivamente finché il contrasto sul bianco raggiunge 3:1. */
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
