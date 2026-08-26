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

/* ============================================================================
   MASTER CHARACTER SYSTEM v1.1 §9 — HOUSE COLOR DNA

   ════════════════════════════════════════════════════════════════════════════
   ⚠️ QUELLO CHE C'ERA PRIMA PRODUCEVA PRECISAMENTE CIÒ CHE IL MASTER VIETA.

   Cinque campioni: primario, accento, TINTA del primario, OMBRA del primario,
   accento slavato. Tre su cinque erano lo stesso colore più chiaro e più
   scuro — cioè un monocromo con sfumature. Il master §9 apre così: «Do not
   default to tasteful monochrome fantasy palettes».

   Un esempio vero, generato prima di questa correzione:
     #68373c rosso cupo · #b79fa2 tinta chiara · #170d0e ombra · #e9e4d8 luce
   Elegante, e sbagliato: nessun colore acido, nessun contrasto, niente campi
   grafici grandi. La palette di un concept fantasy, non di VINZ.MON.
   ════════════════════════════════════════════════════════════════════════════

   Adesso i colori hanno RUOLI, perché è il ruolo che dice dove vanno:

     BASE       il campo grande, profondo e saturo
     ACID HERO  🔒 marca anatomia importante, occhiali, tratti firma
     CONTRAST   il terzo che tiene su l'accordo
     MICRO      uno o due, in quantità piccolissime
     NEUTRI     fondo sporco e nero non-nero

   La relazione che il master indica come tendenza di casa — cobalto profondo,
   giallo tossico, magenta caldo, ciano elettrico — non è copiata: è la
   GEOMETRIA a essere riprodotta (distanza di tinta, salti di saturazione),
   così ogni Family parte dalla sua tinta e arriva allo stesso tipo di accordo.
   ========================================================================= */

/* ────────────────────────────────────────────────────────────────────────────
   LE TRE DISTANZE, MISURATE SULLA STESSA RUOTA E NELLO STESSO VERSO.

   ⚠️ Prima acido e contrasto pescavano un lato a caso ciascuno, e quando
   cadevano dallo stesso finivano addosso: base +170 e base +130 sono due
   colori che a occhio sono lo stesso colore, e l'accordo a tre diventava un
   accordo a due. Un controllo su 4000 palette lo ha fatto vedere.

   Adesso le tre posizioni sono FISSE sulla ruota e si specchiano tutte
   insieme: il verso cambia, le distanze fra loro no.

     base   0°     il campo grande
     micro  ~40°   vicino alla base, in quantità minima
     acid   ~170°  quasi all'opposto: è l'eroe
     contr  ~265°  in mezzo all'arco libero, lontano da entrambi
   ──────────────────────────────────────────────────────────────────────── */

/** Quasi all'opposto. Cobalto → giallo tossico ≈ 168°. */
const ACID_DISTANCE: [number, number] = [150, 190];

/** In mezzo all'arco che resta: lontano dalla base E dall'acido. */
const CONTRAST_DISTANCE: [number, number] = [250, 280];

/** Vicino alla base: cobalto → ciano elettrico ≈ 35°. */
const MICRO_DISTANCE: [number, number] = [25, 55];

/**
 * 🔒 SOTTO QUESTA SATURAZIONE UN COLORE NON È PIÙ ACIDO.
 *
 * Serve perché l'umore sposta la saturazione, e i temperamenti cupi la
 * abbassano di venti punti: senza questo pavimento un .mon SAD nascerebbe con
 * un «acid hero» desaturato, cioè senza acid hero. L'umore può spegnere
 * l'atmosfera, non può cancellare una regola di casa.
 */
const ACID_SAT_FLOOR = 0.86;

export function generatePaletteDna(
  rng: Rng,
  family: string,
  affinity: string,
  mood: string,
): PaletteDna {
  const baseHue = pick(rng, FAMILY_HUES[family] ?? [200, 40, 300]);
  const tone = MOOD_TONE[mood] ?? { sat: 0, light: 0 };

  /* Le Family acromatiche (hue 0 nel catalogo) restano scure e sporche sulla
     BASE — è la loro identità — ma prendono comunque un acido pieno: il
     master non ammette eccezioni su quello, e una creatura di metallo con un
     solo colore tossico addosso è esattamente l'immagine che descrive. */
  const achromatic = baseHue === 0;

  const dominantHue = (baseHue + pickInt(rng, -10, 10) + 360) % 360;
  const baseSat = clamp01((achromatic ? 0.1 : 0.74) + tone.sat * 0.4 + rng() * 0.1);
  const baseLight = clamp01((achromatic ? 0.2 : 0.34) + tone.light * 0.5 + rng() * 0.07);

  /* L'Affinity sposta l'ACIDO, non la base: la contaminazione si vede nel
     colore che marca l'anatomia trasformata, che è dove sta davvero. */
  const shift = AFFINITY_HUE_SHIFT[affinity] ?? 40;
  /* Il verso: la stessa geometria, specchiata. Cambia quale metà della ruota
     occupa l'accordo, non i rapporti al suo interno. */
  const dir = rng() < 0.5 ? 1 : -1;
  const at = (range: [number, number]) => (dominantHue + dir * pickInt(rng, ...range) + 720) % 360;

  const acidHue = (at(ACID_DISTANCE) + dir * shift * 0.2 + 720) % 360;
  const acidSat = Math.max(ACID_SAT_FLOOR, clamp01(0.95 + tone.sat * 0.2));
  const acidLight = clamp01(0.56 + tone.light * 0.3 + rng() * 0.06);

  const contrastHue = at(CONTRAST_DISTANCE);
  const contrastSat = clamp01(0.86 + rng() * 0.1);
  const contrastLight = clamp01(0.5 + rng() * 0.08);

  const microHue = at(MICRO_DISTANCE);
  const micro = [hslToHex(microHue, clamp01(0.9 + rng() * 0.08), clamp01(0.64 + rng() * 0.08))];
  /* Il secondo micro accento è facoltativo nel master, e resta facoltativo
     qui: due su tre volte non c'è. Una palette che ha sempre il numero
     massimo di colori non ha più un massimo. */
  if (rng() < 0.34) {
    micro.push(hslToHex((acidHue + 180) % 360, clamp01(0.82 + rng() * 0.12), 0.7));
  }

  /* I neutri sono SPORCHI di base: un bianco puro e un nero puro sono i due
     colori che rendono qualunque palette da software di grafica. */
  const neutralLight = hslToHex(dominantHue, 0.06, 0.93);
  const neutralDark = hslToHex(dominantHue, 0.16, 0.09);

  const base = hslToHex(dominantHue, baseSat, baseLight);
  const acidHero = hslToHex(acidHue, acidSat, acidLight);
  const contrast = hslToHex(contrastHue, contrastSat, contrastLight);

  const swatches = [base, acidHero, contrast, ...micro, neutralLight].slice(0, 5);
  const swatch_names = [
    `${toneName(baseSat, baseLight)} ${hueName(dominantHue)} — DOMINANT BASE, large graphic fields`,
    `${toneName(acidSat, acidLight)} ${hueName(acidHue)} — ACID HERO, marks signature anatomy only`,
    `${toneName(contrastSat, contrastLight)} ${hueName(contrastHue)} — CONTRAST`,
    ...micro.map((_, i) => `${hueName(i === 0 ? microHue : (acidHue + 180) % 360)} — MICRO ACCENT, tiny quantities`),
    `off-white ${hueName(dominantHue)} — NEUTRAL`,
  ].slice(0, 5);

  return {
    /* 🔶 `primary`/`accent` restano, e sono la BASE e l'ACIDO: sono i due nomi
       con cui il resto dell'app conosce già questa palette (§10.2 li mette nei
       token della UI). Rinominarli avrebbe voluto dire toccare venti file per
       un guadagno zero — i ruoli veri stanno in `roles`. */
    primary: base,
    accent: acidHero,
    on_primary: readableOn(base),
    swatches,
    swatch_names,
    roles: { base, acidHero, contrast, micro, neutralLight, neutralDark },
  };
}

/* --- Applicazione alla UI (MASTER SPEC §10.2) ------------------------------ */

export function applyPaletteDna(
  dna: PaletteDna | null,
  root: HTMLElement = document.documentElement,
) {
  if (!dna) {
    root.style.removeProperty('--char-primary');
    root.style.removeProperty('--char-accent');
    root.style.removeProperty('--char-accent-on-dark');
    root.style.removeProperty('--char-on-accent-dark');
    root.style.removeProperty('--char-on-primary');
    root.style.removeProperty('--char-primary-soft');
    return;
  }

  root.style.setProperty('--char-primary', dna.primary);
  root.style.setProperty('--char-accent', ensureContrastOnWhite(dna.accent));
  root.style.setProperty('--char-on-primary', dna.on_primary);
  root.style.setProperty('--char-primary-soft', `${dna.primary}1f`);

  /* L'accento schiarito per il fondo scuro, e SOPRA di esso l'inchiostro che
     si legge meglio — scelto misurando, non a occhio: un accento schiarito
     quel tanto che basta può restare abbastanza scuro da volere testo bianco,
     e fissarne uno solo sbaglia per metà delle creature. */
  const accentoSulNero = ensureContrastOnBlack(dna.accent);
  root.style.setProperty('--char-accent-on-dark', accentoSulNero);
  root.style.setProperty(
    '--char-on-accent-dark',
    contrastRatio(accentoSulNero, '#0d0d0d') >= contrastRatio(accentoSulNero, '#ffffff')
      ? '#0d0d0d'
      : '#ffffff',
  );
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

/* 🔴 «Il tasto invia non prende il colore del .mon.»
   E il colore c'era: era `--char-accent`, cioè l'accento passato da
   `ensureContrastOnWhite`, che lo SCURISCE finché stacca dal bianco. Su una
   schermata bianca è giusto; la chat però è nera, e lì quello stesso accento
   scurito diventa quasi invisibile — un tasto che sembra spento.

   🔒 Non si risolve togliendo la correzione: servirebbe a un fondo e
   romperebbe l'altro. Serve la stessa cura misurata SULL'ALTRO fondo, ed è
   questa. Chi disegna su nero usa `--char-accent-on-dark`. */
/** Schiarisce finché il contrasto sul nero raggiunge 3:1. */
export function ensureContrastOnBlack(hex: string, target = 3): string {
  let [r, g, b] = hexToRgb(hex);
  let out = hex;
  for (let i = 0; i < 24 && contrastRatio(out, '#000000') < target; i++) {
    r = Math.min(255, Math.round(r + (255 - r) * 0.12) + 4);
    g = Math.min(255, Math.round(g + (255 - g) * 0.12) + 4);
    b = Math.min(255, Math.round(b + (255 - b) * 0.12) + 4);
    out = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  return out;
}

function clamp01(v: number): number {
  return Math.max(0.04, Math.min(0.96, v));
}
