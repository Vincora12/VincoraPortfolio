/* ============================================================================
   LA GEOMETRIA — dove nasce la forma

   Funzioni pure: parametri dentro, path SVG fuori. Niente React, niente
   stato, niente DOM — così si possono provare senza un browser, e il
   laboratorio può muoverne uno e vedere il risultato senza rimontare niente.

   Sistema di riferimento: un quadrato 0..100 in larghezza, 0..130 in altezza.
   Il corpo sta in basso, la fiamma sale. (50, 0) è in alto al centro.
   ========================================================================= */

import type { SoulFaceState, SoulMouth, SoulShape } from './types';

export const VIEW_W = 100;
export const VIEW_H = 130;

/** Il centro del corpo. Fisso: è l'ancora attorno a cui tutto il resto respira. */
export const BODY_CX = 50;
export const BODY_CY = 92;
export const BODY_R = 27;

const n = (v: number) => Number(v.toFixed(2));

/* ============================================================================
   IL CORPO

   🔒 NON È UN `<circle>`. Il brief chiede «round / slightly imperfect», e un
   cerchio SVG è perfetto per definizione. Qui è un path di quattro archi con
   i raggi leggermente diversi fra loro: la differenza è di un paio di punti e
   basta a togliere l'aria da icona.
   ========================================================================= */
export function bodyPath(shape: SoulShape): string {
  const rx = BODY_R * shape.bodyWidth;
  const ry = BODY_R * shape.bodyHeight;

  /* Quanto i quattro quarti si scostano dal cerchio. A `roundness` 1 sono
     tutti uguali e torna un'ellisse esatta. */
  const w = 1 - shape.roundness;
  const q = [1 + w * 0.10, 1 - w * 0.06, 1 + w * 0.04, 1 - w * 0.12];

  const k = 0.5523; // il numero che rende una Bézier un quarto di cerchio
  const x = BODY_CX;
  const y = BODY_CY;

  return [
    `M ${n(x)} ${n(y - ry * q[0]!)}`,
    `C ${n(x + rx * k * q[0]!)} ${n(y - ry * q[0]!)} ${n(x + rx)} ${n(y - ry * k * q[1]!)} ${n(x + rx * q[1]!)} ${n(y)}`,
    `C ${n(x + rx * q[1]!)} ${n(y + ry * k * q[2]!)} ${n(x + rx * k * q[2]!)} ${n(y + ry)} ${n(x)} ${n(y + ry * q[2]!)}`,
    `C ${n(x - rx * k * q[2]!)} ${n(y + ry)} ${n(x - rx)} ${n(y + ry * k * q[3]!)} ${n(x - rx * q[3]!)} ${n(y)}`,
    `C ${n(x - rx * q[3]!)} ${n(y - ry * k * q[0]!)} ${n(x - rx * k * q[0]!)} ${n(y - ry * q[0]!)} ${n(x)} ${n(y - ry * q[0]!)}`,
    'Z',
  ].join(' ');
}

/* ============================================================================
   LA FIAMMA

   🔒 NON SONO CAPELLI, NON È UN CORNO. È la coda di energia della creatura, e
   nello schizzo è un fulmine: sale a zig-zag, si assottiglia, e finisce con
   una punta che scappa di lato.

   ⚠️ COSTRUITA COME UN NASTRO, non come un poligono a mano. C'è una linea
   centrale che zigzaga e una larghezza che si chiude verso la punta; il
   contorno si ottiene salendo da un lato e ridiscendendo dall'altro. È
   l'unico modo per cui `wispHeight`, `wispBend` e `wispLean` restano
   controlli veri invece di dodici numeri da riaggiustare a mano ogni volta.

   🔒 SPIGOLI VIVI, mai curve: le curve la fanno diventare fumo, e lo schizzo
   dice fulmine.
   ========================================================================= */
export function wispPath(shape: SoulShape): string {
  /* 🔴 ERA `62` DI ALTEZZA E `15` DI LARGHEZZA, cioè una fiamma alta più del
     doppio della testa e sottile come un filo: sullo schermo si leggeva come
     un fulmine SEPARATO che passa di lì, non come una coda che esce dalla
     creatura. Nello schizzo la fiamma è alta circa quanto il corpo ed è
     spessa: è la stessa massa che continua.

     ⚠️ E la base entra DENTRO la testa (`+ 9` invece di `+ 3`). Appoggiata al
     bordo si vedeva la cucitura; affondata, corpo e coda sono una cosa sola —
     che è quello che il brief chiede quando dice «emerge from the body». */
  const h = 47 * shape.wispHeight;
  const w = 21 * shape.wispWidth;
  const base = BODY_CY - BODY_R * shape.bodyHeight + 9;

  /* Quanto ogni nodo scarta di lato, in frazioni di `w`. Viene dallo
     schizzo: parte quasi dritto, sbanda a destra, torna a sinistra, e
     l'ultimo tratto scappa in alto a destra. */
  /* 🔶 Lo spessore si chiudeva troppo presto (0.72 già al primo nodo) e la
     fiamma diventava un filo a metà strada. Adesso resta piena per due terzi
     e si chiude alla fine: è il profilo dello schizzo, dove la punta è
     l'unica parte sottile. */
  const nodi: { t: number; dx: number; sp: number }[] = [
    { t: 0.00, dx: 0.00, sp: 1.05 },
    { t: 0.26, dx: 0.78, sp: 0.92 },
    { t: 0.50, dx: -0.48, sp: 0.76 },
    /* 🔴 QUI IL NASTRO SI STROZZAVA. Fra 0.72 e 0.88 la linea centrale torna
       indietro di quasi tutta la larghezza, e con uno spessore ancora a 0.30
       i due bordi si incrociavano: a schermo la fiamma si spezzava in due
       pezzi con un filo in mezzo. Il tornante c'è anche nello schizzo — è
       l'ultimo zag prima della punta — ma lì il tratto è già sottile. Quindi
       non si raddrizza la curva: si assottiglia PRIMA di curvare. */
    { t: 0.72, dx: 0.74, sp: 0.48 },
    { t: 0.88, dx: 0.34, sp: 0.17 },
    { t: 1.00, dx: 1.42, sp: 0.00 },
  ];

  const px = (nodo: { t: number; dx: number }) =>
    BODY_CX + nodo.dx * w * shape.wispBend + nodo.t * shape.wispLean * w * 2.4;
  const py = (nodo: { t: number }) => base - nodo.t * h;

  /* La normale alla linea centrale, così il nastro ha spessore VERO anche
     nei tratti obliqui: senza, i pezzi in diagonale si assottigliano da soli
     e la fiamma sembra strozzata a metà. */
  const spessore = (i: number): [number, number] => {
    const prima = nodi[Math.max(0, i - 1)]!;
    const dopo = nodi[Math.min(nodi.length - 1, i + 1)]!;
    const dx = px(dopo) - px(prima);
    const dy = py(dopo) - py(prima);
    const len = Math.hypot(dx, dy) || 1;
    return [-dy / len, dx / len];
  };

  const sinistra: string[] = [];
  const destra: string[] = [];

  nodi.forEach((nodo, i) => {
    const [nx, ny] = spessore(i);
    const s = (w * nodo.sp) / 2;
    sinistra.push(`${n(px(nodo) - nx * s)} ${n(py(nodo) - ny * s)}`);
    destra.push(`${n(px(nodo) + nx * s)} ${n(py(nodo) + ny * s)}`);
  });

  return `M ${sinistra.join(' L ')} L ${destra.reverse().join(' L ')} Z`;
}

/* ============================================================================
   GLI OCCHI

   🔒 UN OCCHIO SOLO, CON UNA PALPEBRA. Nello schizzo le tre facce hanno LO
   STESSO occhio: cambia dove arriva la palpebra e di quanto è inclinata.

     aperto      → palpebra su         (centro dello schizzo)
     assonnato   → palpebra a metà, ORIZZONTALE   (sinistra)
     arrabbiato  → palpebra a metà, INCLINATA verso il centro   (destra)

   ⚠️ Ed è per questo che si taglia invece di disegnare tre forme: tre forme
   diverse sarebbero tre occhi diversi, e la faccia smetterebbe di essere la
   stessa creatura che cambia umore. Il ritaglio è la differenza fra
   «espressioni» e «icone».
   ========================================================================= */

export type EyeGeom = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Y del bordo della palpebra, in coordinate del riquadro. */
  lidY: number;
  /** Rotazione della palpebra, in gradi. */
  lidDeg: number;
};

export function eyes(
  face: SoulFaceState,
  tuning: { eyeSpacing: number; eyeWidth: number; eyeHeight: number; eyeTilt: number; asymmetry: number; faceY: number },
): [EyeGeom, EyeGeom] {
  const cy = BODY_CY - 7 + tuning.faceY;
  const dx = 11 * tuning.eyeSpacing;
  const rx = 4.1 * tuning.eyeWidth;
  const ry = 6.4 * tuning.eyeHeight;

  const uno = (segno: -1 | 1, open: number, tilt: number, asim: number): EyeGeom => ({
    cx: BODY_CX + segno * dx,
    cy: cy + asim,
    rx,
    ry: ry * (1 + asim * 0.02),
    /* `open` 1 = palpebra sopra il bordo alto (occhio intero), 0 = giù fino
       in fondo (chiuso). Si va appena oltre il bordo per non lasciare una
       riga di pixel quando è spalancato. */
    lidY: cy - ry * 1.15 + (1 - Math.min(open, 1.3)) * ry * 2.2,
    lidDeg: tilt + tuning.eyeTilt * segno,
  });

  return [
    uno(-1, face.leftEyeOpen, face.leftEyeTilt, -tuning.asymmetry),
    uno(1, face.rightEyeOpen, face.rightEyeTilt, tuning.asymmetry),
  ];
}

/* ============================================================================
   LA BOCCA

   Sette forme, e due sono dello schizzo: `zigzag` è l'onda della faccia
   assonnata, `fang` sono i denti di quella arrabbiata. Le altre cinque
   stanno nello stesso alfabeto grafico — tratti piatti, nessuna curva
   morbida se non dove serve un sorriso.
   ========================================================================= */
export function mouthPath(
  tipo: SoulMouth,
  face: SoulFaceState,
  tuning: { mouthWidth: number; mouthHeight: number; faceY: number },
): string {
  const y = BODY_CY + 9 + tuning.faceY;
  const w = 17 * face.mouthWidth * tuning.mouthWidth;
  const h = 5 * tuning.mouthHeight * (0.5 + face.mouthOpen);
  const x0 = BODY_CX - w / 2;

  switch (tipo) {
    case 'small':
      return `M ${n(BODY_CX - w * 0.22)} ${n(y)} L ${n(BODY_CX + w * 0.22)} ${n(y)}`;
    case 'flat':
      return `M ${n(x0)} ${n(y)} L ${n(x0 + w)} ${n(y)}`;
    case 'up':
      return `M ${n(x0)} ${n(y - h * 0.4)} Q ${n(BODY_CX)} ${n(y + h * 1.4)} ${n(x0 + w)} ${n(y - h * 0.4)}`;
    case 'down':
      return `M ${n(x0)} ${n(y + h * 0.6)} Q ${n(BODY_CX)} ${n(y - h * 1.2)} ${n(x0 + w)} ${n(y + h * 0.6)}`;
    case 'open':
      return `M ${n(BODY_CX)} ${n(y - h)} A ${n(w * 0.34)} ${n(h)} 0 1 0 ${n(BODY_CX + 0.01)} ${n(y - h)} Z`;
    case 'zigzag': {
      /* L'onda della faccia di sinistra: cinque picchi, morbidi, che partono
         in basso e finiscono in basso. */
      const punti = [0, 1, 2, 3, 4, 5, 6].map((i) => {
        const x = x0 + (w * i) / 6;
        const su = i % 2 === 1;
        return `${n(x)} ${n(y + (su ? -h * 0.55 : h * 0.35))}`;
      });
      return `M ${punti.join(' L ')}`;
    }
    case 'fang': {
      /* I denti della faccia di destra: la stessa onda ma alta e appuntita,
         con la punta che scende. È la bocca che rende «arrabbiato» leggibile
         a venti pixel. */
      const punti = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
        const x = x0 + (w * i) / 8;
        const giu = i % 2 === 1;
        return `${n(x)} ${n(y + (giu ? h * 1.15 : -h * 0.5))}`;
      });
      return `M ${punti.join(' L ')}`;
    }
  }
}
