/* ============================================================================
   LIBRERIA DEI FRAMMENTI DI PROMPT (§30, §31–§45, §48)

   §48 — «Store every prompt fragment in one canonical prompt-library file,
   ideally JSON/TS data.» Questo è quel file.

   §30.1 — ogni frammento ha: id, axis, priority, positive_prompt,
   negative_prompt, requires, forbids, tags, conditional.

   PERCHÉ SONO DERIVATI E NON COPIATI
   I ~250 frammenti di §32–§45 sono lo STESSO testo con dentro un valore
   diverso del catalogo: ogni family fragment ripete la stessa cornice
   cambiando CORE ANATOMY e ABSOLUTE GUARDRAIL, ogni role fragment cambia solo
   la TRANSLATION. Copiarli produrrebbe 250 blocchi che divergono dal catalogo
   al primo ritocco. Qui vengono generati dai cataloghi di
   `generation-config.ts` con sette forme di template, quindi la libreria non
   può mai contraddire i dati da cui il personaggio è stato generato.

   §30 — «The compiler may paraphrase transitions for grammar, but must not
   remove canonical requirements.»
   ========================================================================= */

import {
  AFFINITIES,
  DESIGN_DNA,
  APPEARANCE_RULES,
  FAMILIES,
  FASHIONS,
  HAIR_STATES,
  MOODS,
  NO_HUMAN_HAIR_RULE,
  RARITY_TIERS,
  ROLES,
  SIZES,
  SIZE_GRAMMAR,
  VOICE_PRESETS,
  SAFETY_RULES,
} from '../engine/generation-config';

/** §48 — versione del compilatore, salvata in ogni export per riproducibilità. */
export const COMPILER_VERSION = '3.1.0';

/* --- §30.1 — schema canonico del frammento --------------------------------- */

export type FragmentAxis =
  | 'global'
  | 'family'
  | 'archetype'
  | 'affinity'
  | 'size'
  | 'role'
  | 'fashion'
  | 'marker'
  | 'mood'
  | 'character_dna'
  | 'design_dna'
  | 'heritage'
  | 'appearance'
  | 'rarity'
  | 'asset'
  | 'voice';

export interface PromptFragment {
  id: string;
  axis: FragmentAxis;
  /** §30.2 — ordine di priorità 1–12; più basso = vince nei conflitti. */
  priority: number;
  positive_prompt: string;
  negative_prompt?: string;
  requires?: string[];
  forbids?: string[];
  tags?: string[];
  conditional?: { if_humanoid?: string; if_nonhumanoid?: string };
}

/* --- §30.2 — ordine di priorità --------------------------------------------
   1 FAMILY · 2 ARCHETYPE · 3 AFFINITY · 4 SIZE · 5 ROLE · 6 FASHION
   7 PERSONAL MARKERS · 8 MOOD · 9 CHARACTER DNA · 10 HERITAGE
   11 APPEARANCE · 12 ASSET-TYPE CAMERA / LAYOUT
   -------------------------------------------------------------------------- */

export const AXIS_PRIORITY: Record<FragmentAxis, number> = {
  global: 0,
  family: 1,
  archetype: 2,
  affinity: 3,
  size: 4,
  role: 5,
  fashion: 6,
  marker: 7,
  mood: 8,
  character_dna: 9,
  /* 🔒 SUBITO PRIMA dell'Appearance e DOPO tutto il resto, e l'ordine è la
     tesi del master: il Design DNA riscrive la COSTRUZIONE — proporzioni,
     masse, faccia — quindi deve poter vincere sulla grammatica di Family e
     Size; l'Appearance viene dopo e può toccare solo la superficie. Metterlo
     prima della Family lo renderebbe un suggerimento; metterlo dopo
     l'Appearance lo renderebbe un secondo modo di dire «resa». */
  design_dna: 10,
  heritage: 10,
  appearance: 11,
  rarity: 11,
  asset: 12,
  voice: 13,
};

/* ============================================================================
   §31 — FRAMMENTI GLOBALI
   ========================================================================= */

export const GLOBAL_FRAGMENTS: PromptFragment[] = [
  {
    id: 'global.identity',
    axis: 'global',
    priority: 0,
    /* ════════════════════════════════════════════════════════════════════════
       🔶 QUI C'ERA «CREATURE FIRST. STYLING SECOND. The viewer must identify
       FAMILY before Fashion, Role, eyewear or VINZ personal markers.»

       Era la prima riga del prompt, e diceva l'OPPOSTO del master:

         §11 — «The first visual read must be CHARACTER; the second should be
         VINZ.MON identity; Family/Archetype/Role follow.»

       La vecchia priorità ottimizzava per leggibilità TASSONOMICA: si deve
       capire che è una MACHINE. Il risultato è precisamente quello che §3
       vieta per nome — «a technical creature study»: una creatura corretta,
       classificabile, e che non ti resta in mente.

       ⚠️ Ma il divieto che ci stava dentro NON era decorativo, e resta: «non
       trasformare le Family non umane in umani alla moda» è nato da un
       fallimento vero, ed è ancora un fallimento vero. Cambia il posto: non è
       più la premessa, è un paletto.
       ════════════════════════════════════════════════════════════════════ */
    positive_prompt: [
      'Create one original VINZ.MON creature from the supplied canonical Character Data.',
      '',
      'READING ORDER — this is the goal, in this order:',
      '1. CHARACTER. A viewer must meet a memorable individual before they can classify anything.',
      '2. VINZ.MON identity: the eyewear and hair/hair-equivalent solution.',
      '3. FAMILY, ARCHETYPE, ROLE — the taxonomy follows, it does not lead.',
      '4. Cultural references are discovered last, or never, and that is correct.',
      '',
      'Preserve all generated fields exactly:',
      'FAMILY, ARCHETYPE, AFFINITY, SIZE, ROLE, FASHION, MOOD, CHARACTER DNA,',
      'HERITAGE, APPEARANCE and palette DNA.',
      'The taxonomy must be VISIBLE THROUGH CONSTRUCTION — never pasted on as costume,',
      'and never solved by turning a non-human Family into a fashionable human.',
    ].join('\n'),
    tags: ['mandatory'],
  },
  {
    /* ════════════════════════════════════════════════════════════════════════
       MASTER CHARACTER SYSTEM v1.1 §3 — VINZ.MON HOUSE CHARACTER DNA

       🔷 «Segui il documento, mi piace come escono con quello.»

       Questo capitolo — il cuore del master — non entrava nel prompt in NESSUNA
       forma. Cercando le sue parole nel testo compilato: «3–4 silhouette
       landmarks» assente, «one proportional exaggeration» assente, «one
       slightly ridiculous feature» assente, «facial attitude» assente.

       ⚠️ E non è il CHARACTER DNA che c'era già: quello individua QUESTO .mon
       fra i suoi simili (il suo tic di sagoma, il suo motivo ricorrente).
       Questo dice come dev'essere costruito QUALUNQUE .mon per funzionare come
       personaggio. È la differenza fra «cosa lo rende lui» e «cosa lo rende
       uno che ti resta in mente», e mancava la seconda.
       ════════════════════════════════════════════════════════════════════ */
    id: 'global.house_character_dna',
    axis: 'global',
    priority: 0,
    positive_prompt: [
      'HOUSE CHARACTER DNA — non-negotiable, applies to every VINZ.MON:',
      'The result must read FIRST as a memorable CHARACTER — not as lore, not as concept art,',
      'not as a fashion mannequin, not as a technical creature study.',
      '',
      'BUILD IT WITH:',
      '- ONE dominant identity mass that owns the silhouette.',
      '- 3 to 4 silhouette landmarks that can be named out loud from across a room.',
      '- ONE strong proportional exaggeration — something is decisively too big, too long or too small.',
      '- ONE slightly ridiculous, over-specific or visually funny feature. Not a joke: a specific.',
      '- ONE facial attitude readable before any lore is understood.',
      '',
      'PERSONALITY TARGET:',
      'Approachable and energetic. A viewer should be able to imagine arguing with this character,',
      'travelling with it, being annoyed by it, and becoming attached to it.',
      'Charm does not mean childishness: sophistication must never erase character appeal.',
      'Hair/hair-equivalent and eyewear actively participate in silhouette recognition.',
      'Secondary detail never overpowers the primary character read.',
      '',
      'FOR HUMANOID FORMS:',
      'Avoid the adult fashion-model mannequin. Prefer a younger, characterful heroic rhythm —',
      'slightly larger head, expressive hands and feet, readable face, energetic posture.',
      'The target is youthful character appeal, NOT chibi anatomy.',
    ].join('\n'),
    tags: ['mandatory'],
  },
  {
    /* ════════════════════════════════════════════════════════════════════════
       MASTER CHARACTER SYSTEM v1.1 §4 — VINZ IDENTITY: I CAPELLI

       Nel prompt c'era la regola di RIPIEGO — «se la Family non ha capelli
       plausibili, traducili» — e non c'era mai l'identità che quella regola
       serve a proteggere. Un ripiego senza la cosa da cui ripiega.
       ════════════════════════════════════════════════════════════════════ */
    id: 'global.vinz_hair_identity',
    axis: 'global',
    priority: 0,
    positive_prompt: [
      'VINZ IDENTITY — HAIR:',
      'Natural hair colour is DARK BLOND; the current styling is bleached.',
      'A Form uses FULL BLEACH (reads platinum / almost white, dark blond surviving only as deep regrowth)',
      'or PARTIAL BLEACH (visible dark-blond roots transitioning into platinum lengths and tips).',
      'NEVER default to black hair.',
      'Where morphology has no plausible hair, translate this into an anatomical hair-equivalent',
      'rather than dropping the identity — or omit it when translation is impossible.',
    ].join('\n'),
    tags: ['mandatory'],
  },
  {
    /* 🔶 v1.9 §23.2 — l'istruzione che tiene in piedi l'intera pipeline.

       Un modello di immagini NON riproduce lo stesso personaggio due volte
       partendo dallo stesso testo, per quanto il testo sia dettagliato. La
       consistenza si ottiene allegando il CHARACTER MASTER, non descrivendo
       meglio. Il compiler lo esclude dal master stesso, dove il riferimento
       non esiste ancora — ed è esattamente perché va generato per primo. */
    id: 'global.master_reference',
    axis: 'global',
    priority: 0,
    positive_prompt: [
      'CONSISTENCY REFERENCE — MANDATORY:',
      'Attach the previously generated CHARACTER MASTER image of this .mon and',
      'treat it as the single source of visual truth.',
      'The text below describes the character; the reference image IS the character.',
      'Where they disagree, the reference image wins.',
      'Reproduce silhouette, anatomy, eyewear, hair solution, palette and every',
      'identity marker exactly. Change only what this asset type asks to change.',
    ].join('\n'),
    negative_prompt: 'no reinterpretation of the design, no alternative version of the character',
    tags: ['mandatory', 'pipeline'],
  },
  {
    /* 🔶 MASTER SPEC v1.9 §2.4 — il .mon è estratto dai segnali di VINZ, che è
       un uomo: la creatura si legge come maschile. Vale sull'aspetto quanto
       sulla voce, altrimenti l'immagine e il testo raccontano due persone
       diverse. Non è un tratto di catalogo e non compare fra gli assi: è una
       costante di identità, come i marcatori VINZ. */
    id: 'global.gender',
    axis: 'global',
    priority: 0,
    positive_prompt: [
      'GENDER READ:',
      'The creature reads as male.',
      'Express it through proportion, posture, facial structure and presence,',
      'translated into the anatomy of its FAMILY — never by adding human gender',
      'signifiers to a non-human body, and never as a costume or a label.',
      'A non-humanoid FAMILY still reads male through mass, stance and features.',
    ].join('\n'),
    negative_prompt: [
      'feminine-coded styling used to soften the creature',
      'gender ambiguity treated as the concept',
      'human gender markers pasted onto non-human anatomy',
    ].join(', '),
    tags: ['mandatory', 'identity'],
  },
  {
    id: 'global.full_body',
    axis: 'global',
    priority: 0,
    positive_prompt: [
      'FULL-BODY SAFETY:',
      'Show 100% of the complete creature.',
      'Never crop head, feet, paws, tail, wings, horns, frills, eyewear,',
      'floating anatomy, detached components, GIANT masses or carried signature objects.',
      'Leave generous safety margin around the silhouette.',
      'Adjust presentation scale rather than cropping.',
    ].join('\n'),
    tags: ['mandatory'],
  },
  /* ==========================================================================
     🔷 v1.14 §31.2 — DEVE REGGERE SU CHIARO E SU SCURO.

     I prompt dicevano «Transparent background», cioè COME salvarlo. Non
     dicevano niente su come DISEGNARLO, e sono due cose diverse.

     Il difetto è arrivato guardando la splash: una creatura disegnata per
     essere vista su bianco, appoggiata sul nero, perde i contorni — le linee
     scure spariscono nel fondo e la sagoma si sfalda. Non è colpa dello
     sfondo trasparente: è che nessuno aveva detto al modello che quella
     stessa immagine sarebbe finita su quattro fondi diversi.

     🔒 E lo sfondo resta TRASPARENTE, non nero. Il nero è della schermata.
     La stessa immagine vive sulla splash scura, sulla griglia chiara del DEX,
     sulla testina in chat e sul nodo Mindline; e ogni .mon ritinge l'app con
     la sua palette. Un fondo cotto dentro il file diventerebbe un rettangolo
     nero il giorno che lo appoggi su qualcosa di chiaro, e non saprebbe
     seguire il colore di chi lo indossa.
     ======================================================================= */
  {
    id: 'global.on_any_background',
    axis: 'global',
    priority: 0,
    positive_prompt: [
      'READS ON BOTH LIGHT AND DARK:',
      'The cut-out will be placed on a near-black screen AND on a near-white grid.',
      'The silhouette must stay fully readable on both, with no outer glow and no drawn frame.',
      'Do not rely on a pure-black contour to define the edge: it vanishes on dark.',
      'Do not rely on a pure-white contour either: it vanishes on light.',
      'Where the body colour approaches black or white, separate the edge with',
      'a value shift inside the artwork itself — a rim of the creature own palette,',
      'a lighter plane, or a change of material — never with an added outline.',
      'Keep the alpha edge clean: no halo, no leftover matte, no soft grey fringe.',
    ].join('\n'),
    negative_prompt:
      'No background fill of any colour. No drop shadow on the ground. No vignette. No glow.',
    tags: ['mandatory'],
  },
  {
    id: 'global.novelty',
    axis: 'global',
    priority: 0,
    positive_prompt: [
      'NOVELTY:',
      'Do not copy previous benchmark creatures.',
      'Avoid generic mascot convergence.',
      'Preserve the generated anatomical gimmick, eyewear category, haircut/bleach state,',
      'palette DNA, body proportion grammar and Heritage transformation.',
      'Do not introduce extra random features that compete with the canonical design.',
    ].join('\n'),
    tags: ['mandatory'],
  },
];

/* ============================================================================
   §32 — LIBRERIA FAMILY
   «Each Family contributes the strongest anatomical block. These fragments are
   mandatory and have the highest visual priority.»
   ========================================================================= */

function familyFragment(f: (typeof FAMILIES)[number]): PromptFragment {
  return {
    id: `family.${slug(f.id)}`,
    axis: 'family',
    priority: AXIS_PRIORITY.family,
    positive_prompt: [
      `FAMILY: ${f.id}`,
      'PRIMARY READ:',
      `The creature must unmistakably read as ${f.id} before any other layer.`,
      'CORE ANATOMY:',
      f.coreAnatomy,
      'GENERATION INTENT:',
      'Build the silhouette, face/core, limbs and main body masses from this Family anatomy.',
      'Use Family-specific anatomy as the foundation onto which Archetype, Affinity and styling are added.',
      'ABSOLUTE GUARDRAIL:',
      f.absoluteRule,
    ].join('\n'),
    negative_prompt:
      'Do not solve Family identity through costume, color alone, logos, props or human accessories.',
    tags: [slug(f.id), f.supportsHair ? 'hair-capable' : 'no-hair'],
  };
}

/* ============================================================================
   §33 — LIBRERIA ARCHETIPI
   ========================================================================= */

function archetypeFragment(
  f: (typeof FAMILIES)[number],
  a: { id: string; structure: string },
): PromptFragment {
  return {
    id: `archetype.${slug(f.id)}.${slug(a.id)}`,
    axis: 'archetype',
    priority: AXIS_PRIORITY.archetype,
    positive_prompt: [
      `FAMILY ARCHETYPE: ${a.id}`,
      `PARENT FAMILY: ${f.id}`,
      'MORPHOLOGICAL SUBTYPE:',
      a.structure,
      'Translate this subtype into the primary silhouette, body plan and identity mass.',
      'Preserve the Parent Family read.',
    ].join('\n'),
    negative_prompt: 'Do not treat the Archetype as a costume label or decorative motif.',
    requires: [`family.${slug(f.id)}`],
    tags: [slug(f.id)],
  };
}

/* ============================================================================
   §34 — LIBRERIA AFFINITY
   L'Affinity trasforma anatomia e materia; non è un filtro colore.
   ========================================================================= */

function affinityFragment(a: (typeof AFFINITIES)[number]): PromptFragment {
  return {
    id: `affinity.${slug(a.id)}`,
    axis: 'affinity',
    priority: AXIS_PRIORITY.affinity,
    positive_prompt: [
      `AFFINITY: ${a.id}`,
      'MORPHOLOGICAL TRANSFORMATION:',
      a.effect,
      'Affinity must physically transform selected secondary anatomy or materials.',
      'FAMILY anatomy remains dominant and immediately readable.',
      'Use 1–3 strong transformed zones rather than covering every surface.',
    ].join('\n'),
    negative_prompt: [
      'It must NOT behave as:',
      '- a color filter',
      '- a logo/icon',
      '- a held prop',
      '- a costume',
      '- a background effect',
    ].join('\n'),
    tags: [slug(a.id)],
  };
}

/* ============================================================================
   §35–§37 — SIZE, ROLE, FASHION
   ========================================================================= */

function sizeFragment(size: (typeof SIZES)[number]): PromptFragment {
  return {
    id: `size.${slug(size)}`,
    axis: 'size',
    priority: AXIS_PRIORITY.size,
    positive_prompt: [
      `SIZE: ${size}`,
      'PROPORTIONAL GRAMMAR:',
      SIZE_GRAMMAR[size].rule,
      'This rule changes internal proportions, not canvas zoom.',
      'Full body must still fit with generous safety space.',
    ].join('\n'),
    negative_prompt:
      size === 'TINY'
        ? 'Keep the creature readable and strange; do not automatically make it cute.'
        : undefined,
  };
}

function roleFragment(r: (typeof ROLES)[number]): PromptFragment {
  return {
    id: `role.${slug(r.id)}`,
    axis: 'role',
    priority: AXIS_PRIORITY.role,
    positive_prompt: [
      `ROLE: ${r.id}`,
      'NARRATIVE / CULTURAL DIRECTION:',
      r.translation,
      'ROLE should affect posture, gesture, silhouette rhythm and one or two structural motifs.',
      "Translate the Role through the creature's own anatomy and current Fashion.",
    ].join('\n'),
    negative_prompt: 'Do NOT create literal cosplay. Do NOT let Role override Family or Archetype.',
  };
}

function fashionFragment(f: (typeof FASHIONS)[number]): PromptFragment {
  return {
    id: `fashion.${slug(f.id)}`,
    axis: 'fashion',
    priority: AXIS_PRIORITY.fashion,
    positive_prompt: [
      `FASHION: ${f.id}`,
      'STYLING LANGUAGE:',
      f.language,
      'Fashion controls:',
      '- garment silhouette when anatomy supports garments',
      '- footwear / paw or limb treatment when plausible',
      '- eyewear category and construction',
      '- haircut / hair-equivalent when plausible',
      '- accessories',
      '- body exposure',
      '- material and styling attitude',
      'Adapt Fashion to the creature.',
      'Use a few large readable styling decisions rather than tiny decorative clutter.',
    ].join('\n'),
    negative_prompt: 'Never humanize the creature just to make the outfit easier.',
  };
}

/* ============================================================================
   §38 — MARCATORI PERSONALI VINZ
   ========================================================================= */

export const MARKER_FRAGMENTS: PromptFragment[] = [
  {
    id: 'marker.eyewear',
    axis: 'marker',
    priority: AXIS_PRIORITY.marker,
    positive_prompt: [
      'Whenever anatomically possible, give the creature fashion-oriented eyewear.',
      'Use the generated eyewear category exactly.',
      "The eyewear must be specifically fitted to the creature's unusual face/skull/core",
      'rather than floating like a generic human accessory.',
    ].join('\n'),
    negative_prompt: 'Do not repeat recent eyewear silhouettes.',
  },
  ...HAIR_STATES.map((h) => ({
    id: `marker.${slug(h.id)}`,
    axis: 'marker' as const,
    priority: AXIS_PRIORITY.marker,
    positive_prompt: h.prompt,
  })),
  {
    id: 'marker.no_human_hair',
    axis: 'marker',
    priority: AXIS_PRIORITY.marker,
    positive_prompt: NO_HUMAN_HAIR_RULE,
  },
];

/* ============================================================================
   §39 — MOOD
   ========================================================================= */

function moodFragment(m: (typeof MOODS)[number]): PromptFragment {
  return {
    id: `mood.${slug(m.id)}`,
    axis: 'mood',
    priority: AXIS_PRIORITY.mood,
    positive_prompt: [
      `MOOD: ${m.id}`,
      'EMOTIONAL PRESENCE:',
      m.presence,
      'Express Mood primarily through:',
      '- face / gaze',
      '- head angle',
      '- posture',
      '- silhouette tension',
      '- spacing between limbs/appendages',
      '- social body language',
    ].join('\n'),
    negative_prompt:
      'Do not redesign Family anatomy. Do not automatically turn the creature cute, angry or human unless the selected Mood requires it.',
  };
}

/* ============================================================================
   §40–§41 — CHARACTER DNA e HERITAGE
   Sono moduli con un segnaposto: il compilatore ci inserisce i dati reali.
   ========================================================================= */

export const CHARACTER_DNA_FRAGMENT: PromptFragment = {
  id: 'character_dna.compile',
  axis: 'character_dna',
  priority: AXIS_PRIORITY.character_dna,
  positive_prompt: [
    'CHARACTER DNA:',
    '{{CHARACTER_DNA}}',
    'Use Character DNA to resolve individuality after all categorical axes are established.',
    'Must explicitly materialize:',
    '- 1 distinctive silhouette quirk',
    '- 1 anatomical gimmick that does not contradict Family',
    '- palette DNA',
    '- face / eye logic',
    '- body-language default',
    '- exact eyewear solution',
    '- exact haircut / bleach solution when plausible',
    '- 1 recurring motif',
    '- 1–3 behavioral contradictions translated visually when possible',
    'The character must feel like THIS .mon, not an average example of its taxonomy.',
  ].join('\n'),
  negative_prompt: 'Do not add unrelated decorative ideas.',
};

export const HERITAGE_FRAGMENT: PromptFragment = {
  id: 'heritage.compile',
  axis: 'heritage',
  priority: AXIS_PRIORITY.heritage,
  positive_prompt: [
    'HERITAGE FROM PREVIOUS MINDLINE NODE:',
    '{{HERITAGE}}',
    'Preserve continuity without copying the previous creature.',
    'For each inherited trait:',
    '1. identify its underlying idea, shape, behavior or relationship meaning;',
    '2. translate it through the NEW Family / Archetype anatomy;',
    '3. preserve recognizability only where compatible.',
    'Target: approximately 20% translated Heritage / 80% new design freedom.',
  ].join('\n'),
  negative_prompt:
    'Never paste incompatible anatomy from the previous Family onto the new creature.',
};

/* ============================================================================
   §42 — APPEARANCE
   ========================================================================= */

const APPEARANCE_DETAIL: Record<string, { visual: string[]; avoid: string }> = {
  'DESIGNER TOY 3D': {
    visual: [
      '- tactile sculptural body',
      '- simplified but intentional forms',
      '- smooth matte vinyl / soft-touch plastic / painted resin',
      '- occasional translucent resin only when anatomy/material DNA supports it',
      '- controlled seam logic; not a mass-produced generic figure',
      '- high-quality studio prototype photography',
      '- clean neutral white seamless background',
      '- full body, centered, generous margin',
      '- 3–5 dominant colors with strong color blocking',
    ],
    avoid:
      'Pixar look, Funko proportions, generic chibi collectible, realistic skin/fur microtexture, gloss-everywhere plastic, cinematic environment, exaggerated depth-of-field, text/logos.',
  },
  INK: {
    visual: [
      '- thick irregular black contours',
      '- bold black masses',
      '- white negative space',
      '- one acid spot color or very limited accent color',
      '- skate graphic / DIY street character / bootleg streetwear print / punk-zine energy',
      '- spontaneous but designed mark-making',
      '- readable full-body silhouette',
    ],
    avoid:
      'manga/anime shorthand, polished vector art, realistic comic rendering, dense crosshatching everywhere, clean corporate illustration, grayscale painting.',
  },
  CEL: {
    visual: [
      '- precise 2D linework',
      '- flat edited color blocks',
      '- hard-edged minimal shadow only where useful',
      '- graphic face logic',
      '- strong readable silhouette',
      '- fashion and anatomy equally legible',
      '- sophisticated but bold palette',
    ],
    avoid:
      'generic anime/JRPG character-select art, moe eyes, painterly rendering, soft gradients, realistic lighting, 3D materials, fashion-illustration elongation.',
  },
  'ELASTIC CARTOON': {
    visual: [
      '- very readable large shapes',
      '- controlled squash/stretch',
      '- expressive face and pose',
      '- exaggerated silhouette rhythm',
      '- flat saturated colors',
      '- clean dark outline',
      '- minimal rendering',
    ],
    avoid:
      'copying any existing TV cartoon, universal chibi proportions, automatic cuteness, rubber-hose sameness, over-detailed shading.',
  },
};

function appearanceFragment(id: string): PromptFragment {
  const detail = APPEARANCE_DETAIL[id];
  return {
    id: `appearance.${slug(id)}`,
    axis: 'appearance',
    priority: AXIS_PRIORITY.appearance,
    positive_prompt: [
      `APPEARANCE: ${id}`,
      APPEARANCE_RULES[id] ?? '',
      'VISUAL LANGUAGE:',
      ...(detail?.visual ?? []),
      'KEEP:',
      'Family anatomy, Archetype, Affinity transformation, Size grammar, Fashion, eyewear, haircut, Character DNA.',
    ].join('\n'),
    negative_prompt: detail ? `AVOID: ${detail.avoid}` : undefined,
  };
}

/* ============================================================================
   MASTER CHARACTER SYSTEM v1.1 §8 — CHARACTER DESIGN DNA

   🔒 QUESTO FRAMMENTO PARLA DI COSTRUZIONE, MAI DI RESA. Se un giorno ci
   finisse dentro una parola come «cel», «inchiostro» o «vinile», starebbe
   dicendo la stessa cosa dell'Appearance — e a quel punto due assi si
   contendono lo stesso campo e nessuno dei due si controlla più.
   ========================================================================= */

function designDnaFragment(d: (typeof DESIGN_DNA)[number]): PromptFragment {
  return {
    id: `design.${slug(d.id)}`,
    axis: 'design_dna',
    priority: AXIS_PRIORITY.design_dna,
    positive_prompt: [
      `CHARACTER DESIGN DNA: ${d.id} — construction rules only.`,
      '',
      /* 🔒 Un asse per riga, sempre gli stessi sette. È quello che rende
         confrontabili due prove del protocollo §12: se un designer descrive
         la faccia e un altro no, quello che vedi cambiare fra le due immagini
         non è il designer, è quanto era scritto. */
      `PROPORTION: ${d.proportion}`,
      `SHAPE LANGUAGE: ${d.shapes}`,
      `FACIAL CONSTRUCTION: ${d.face}`,
      `ANATOMICAL SIMPLIFICATION: ${d.anatomy}`,
      `CLOTHING CONSTRUCTION: ${d.clothing}`,
      `POSTURE / GESTURE: ${d.posture}`,
      `SURVIVING DETAIL: ${d.detail}`,
      '',
      `DETAIL DENSITY: ${d.density}/5. This controls how many visual decisions survive, not how much lore exists.`,
      d.density <= 2
        ? 'Compress every idea into as few primary shapes as possible. Anything that does not survive compression is dropped, not shrunk.'
        : d.density >= 4.5
          ? 'Layering, hardware and tertiary information are permitted, but the read must stay hierarchical: silhouette first, then primary masses, then detail.'
          : 'Keep a clear primary read with a controlled second tier of detail.',
      'This layer rewrites CONSTRUCTION — proportion, shape language, facial build, anatomical simplification, clothing construction, posture. It must visibly change how the character is built.',
    ].join('\n'),
    negative_prompt:
      'Do NOT let this layer decide rendering medium, outlines, shading or material: that belongs to APPEARANCE. Do not name the designer or imitate a specific existing character.',
  };
}

/* ============================================================================
   MASTER CHARACTER SYSTEM v1.1 §7 — CULTURAL DNA

   ⚠️ NON ARRIVAVA MAI AL PROMPT. I tag culturali esistono nel codice da sempre,
   ma alimentavano solo il PUNTEGGIO con cui si sceglie una Family: uscivano
   in un numero e mai in una parola. Il capitolo §7 del master, nel testo
   compilato, era zero righe.

   🔒 «Ingredients, not a checklist of visible easter eggs.» È la regola che
   rende questo blocco utile invece che dannoso: un riferimento riconoscibile
   è un fallimento, non un successo. Va combinato, tradotto in morfologia, e
   scoperto per ultimo — o mai, il che è ugualmente corretto.
   ========================================================================= */

/* ============================================================================
   MASTER CHARACTER SYSTEM v1.1 §9 — HOUSE COLOR DNA (la regola di casa)

   I colori di QUESTA creatura stanno nel Character DNA. Qui sta il modo di
   usarli, che è uguale per tutte — e il divieto che apre il capitolo, che è la
   cosa che la palette vecchia violava a ogni nascita.
   ========================================================================= */

export const HOUSE_COLOR_FRAGMENT: PromptFragment = {
  id: 'global.house_color_dna',
  axis: 'global',
  priority: 0,
  positive_prompt: [
    'HOUSE COLOR DNA — how the palette is used:',
    'LARGE GRAPHIC COLOUR FIELDS matter more than multicoloured micro-detail.',
    'The acid colour identifies important anatomy, eyewear, fashion or signature features —',
    'it is placed deliberately, never scattered as speckles across the body.',
    'Overall chromatic identity: energetic, synthetic, youthful, slightly artificial.',
  ].join('\n'),
  negative_prompt:
    'Do NOT default to a tasteful monochrome fantasy palette: one hue with its own tints and shades is a failure of this layer, however elegant. Do not desaturate the acid colour to make the image calmer.',
};

export const CULTURAL_FRAGMENT: PromptFragment = {
  id: 'cultural.compile',
  axis: 'global',
  priority: 0,
  positive_prompt: [
    'CULTURAL DNA — ingredients, never easter eggs:',
    'The ACTIVE references for this Form are listed in the Character DNA block below.',
    'Combine ONLY those, conceptually, and translate them into morphology, behaviour,',
    'fashion logic, transformation, colour or attitude — never into quotation.',
    'The viewer should be able to remember this character without identifying a single reference.',
  ].join('\n'),
  negative_prompt:
    'Never reproduce recognisable characters, costumes, logos, weapons, species, silhouettes or franchise iconography. A reference anyone can name is a failure. Do not add references beyond the ones listed.',
};

/* ============================================================================

/** §42 — DOODLE non è un Appearance: vive solo nella BIO. */
export const DOODLE_FRAGMENT: PromptFragment = {
  id: 'appearance.doodle_bio_only',
  axis: 'appearance',
  priority: AXIS_PRIORITY.appearance,
  positive_prompt: [
    'BIO VISUAL LANGUAGE: DOODLE',
    'This is NOT the canonical Appearance.',
    'Translate the already-established canonical .mon into an intimate sketchbook / personal-file drawing.',
    'USE:',
    '- loose pen / fineliner / ballpoint-like marks',
    '- visible construction',
    '- corrections and abandoned lines',
    '- partial/incomplete contours',
    '- 2–4 scribbled colors',
    '- white paper visible',
    '- arrows, tiny notes, symbols and underlines used sparingly',
    '- rough Fashion/eyewear notation',
    'Preserve the canonical anatomy and identity.',
    'This asset belongs only to BIO / PERSONAL FILE contexts.',
  ].join('\n'),
  negative_prompt: 'Do not redesign the character.',
};

/* ============================================================================
   §43 — RARITÀ → CONSEGUENZA SUL PROMPT
   «Rarity must NOT add random ornament. It only controls how far the compiler
   may push distinctiveness inside already-selected canonical axes.»
   ========================================================================= */

function rarityFragment(t: (typeof RARITY_TIERS)[number]): PromptFragment {
  return {
    id: `rarity.${slug(t.id)}`,
    axis: 'rarity',
    priority: AXIS_PRIORITY.rarity,
    positive_prompt: `RARITY: ${t.id}.\n${t.promptConsequence}`,
    negative_prompt: 'Rarity must not add random ornament or extra taxonomy.',
  };
}

/* ============================================================================
   §44 — PRESET DI VOCE (per modelli di testo, non di immagine)
   ========================================================================= */

function voiceFragment(p: (typeof VOICE_PRESETS)[number]): PromptFragment {
  return {
    id: `voice.${slug(p.id)}`,
    axis: 'voice',
    priority: AXIS_PRIORITY.voice,
    positive_prompt: [
      `BASE VOICE PRESET: ${p.id}`,
      'TONE:',
      p.tone,
      'This is only a baseline.',
      'Then apply the generated Voice DNA values for temperament, relationship, humor,',
      'writing, lexicon, language, digital artifacts, emotion, rituals, boundaries,',
      'evolution maturity and Bond.',
    ].join('\n'),
    // §28 — i vincoli di sicurezza viaggiano con ogni frammento di voce.
    negative_prompt: [
      'Never collapse the character into a generic assistant.',
      ...SAFETY_RULES,
    ].join('\n'),
  };
}

/* ============================================================================
   §45 — FRAMMENTI PER TIPO DI ASSET
   ========================================================================= */

export const ASSET_FRAGMENTS: Record<string, PromptFragment> = {
  character_master: {
    id: 'asset.character_master',
    axis: 'asset',
    priority: AXIS_PRIORITY.asset,
    positive_prompt: [
      'ASSET TYPE: CHARACTER MASTER',
      'PURPOSE:',
      'Canonical source-of-truth full-body image for this .mon.',
      'OUTPUT:',
      '- one creature only',
      '- full body 100% visible',
      '- neutral readable 3/4 or near-front canonical pose',
      '- pure/clean background appropriate to selected Appearance',
      '- generous safety margin',
      '- preserve exact Character Data for all derivative assets.',
    ].join('\n'),
    negative_prompt: 'No UI. No text. No labels.',
  },
  profile_portrait: {
    id: 'asset.profile_portrait',
    axis: 'asset',
    priority: AXIS_PRIORITY.asset,
    positive_prompt: [
      'ASSET TYPE: PROFILE PORTRAIT',
      'PURPOSE:',
      'Dedicated profile/avatar asset, NOT an accidental crop of Character Master.',
      'COMPOSITION:',
      'head + upper torso / primary identity mass,',
      'recognizable eyewear/face/hair,',
      'canonical expression,',
      'simple background or transparency,',
      'safe circular/square crop zone.',
    ].join('\n'),
    negative_prompt: 'No text. Never crop the identifying eyewear or head silhouette.',
  },
  bio_doodle: {
    id: 'asset.bio_doodle',
    axis: 'asset',
    priority: AXIS_PRIORITY.asset,
    positive_prompt: [
      'ASSET TYPE: BIO DOODLE',
      'Include 2–5 tiny sketchbook annotations or symbols derived from real Character DNA / memories.',
    ].join('\n'),
    negative_prompt: 'Do not invent unrelated lore.',
  },
  /* 🔶 v1.9 §23.1 — non più un «pacchetto» generico ma una GRIGLIA indicizzabile:
     la chat legge il riquadro per posizione, quindi ordine e numero sono
     vincolati esattamente come per lo sprite di rotazione. */
  reaction_pack: {
    id: 'asset.reaction_pack',
    axis: 'asset',
    priority: AXIS_PRIORITY.asset,
    positive_prompt: [
      'ASSET TYPE: EXPRESSION SHEET',
      'One sheet, 6 frames, strict 3 columns x 2 rows grid, read left-to-right,',
      'top row first. Frame order is FIXED and must not be rearranged:',
      '01 NEUTRAL  — resting presence, direct gaze, no strong emotion',
      '02 WARM     — open and close, features softening',
      '03 AMUSED   — entertained, ironic, asymmetric read',
      '04 ALERT    — attentive, surprised or curious, whole body orienting',
      '05 LOW      — dimmed, tired or melancholic; no pity, no melodrama',
      '06 INTENSE  — charged, determined or tense, energy held back',
      'Identical bust framing, identical scale and identical eye line in every frame.',
      'Same anatomy, fashion, eyewear, palette and proportions throughout.',
      'Expression and micro-pose change. The design never changes.',
      'Transparent background. Even margins. No frame borders drawn.',
    ].join('\n'),
    negative_prompt:
      'No labels, no numbers, no captions. No redesign between frames. No varying crop or scale.',
  },
  /* 🔶 v1.9 §23.1 — nuovo: il ciclo di respiro. Senza, il .mon è
     un'illustrazione ferma, e la differenza fra «c'è» ed «è disegnato» è
     tutta lì. */
  idle_animation: {
    id: 'asset.idle_animation',
    axis: 'asset',
    priority: AXIS_PRIORITY.asset,
    positive_prompt: [
      'ASSET TYPE: IDLE ANIMATION STRIP',
      'One sheet, 4 frames, single row, read left to right: a seamless breathing',
      'loop of the SAME canonical .mon standing at rest.',
      'ABSOLUTE CONSISTENCY across all 4 frames: same anatomy, proportions,',
      'face, eyewear, haircut, outfit, accessories, palette and lighting.',
      'The loop is played ping-pong, so frame 01 and frame 04 are the two',
      'extremes of the motion, NOT a repeat of each other.',
      'Motion budget is deliberately small: chest/mass rise and fall and a',
      'slight weight shift, plus THIS SPECIFIC MOTION and nothing else:',
      '{{IDLE_MOTION}}',
      'Feet stay planted. The character never travels across the canvas.',
      'Full body. Identical framing, scale and horizontal position in every frame.',
      'Bottom-center anchor. Transparent background.',
      'Sheet must split into 4 equal sprite frames of identical dimensions.',
    ].join('\n'),
    negative_prompt: [
      'no walking, no jumping, no turning, no camera movement',
      'no frame where the character shifts position on the canvas',
      'no labels, no numbers, no onion-skin ghosting',
    ].join(', '),
  },
  sigil: {
    id: 'asset.sigil',
    axis: 'asset',
    priority: AXIS_PRIORITY.asset,
    positive_prompt: [
      'ASSET TYPE: SIGIL',
      'Create one simple monochrome personal symbol derived from:',
      'Family + Affinity + one Character DNA motif + Mindline Heritage.',
      'Black on white or transparent.',
      'Extremely simple.',
      'Readable at 24px.',
    ].join('\n'),
    negative_prompt:
      'No text. No generic zodiac/fantasy rune unless Character DNA specifically supports it.',
  },
  encounter_hero: {
    id: 'asset.reveal_hero',
    axis: 'asset',
    priority: AXIS_PRIORITY.asset,
    positive_prompt: [
      'ASSET TYPE: NEW ENCOUNTER / REVEAL HERO',
      'Purpose: dramatic first reveal of the new .mon.',
      'Keep the creature itself 100% canonical.',
      'Allow a stronger composition, pose and limited signal/energy graphics appropriate to VINZ.MON.',
      'Leave enough clean space for UI overlay.',
    ].join('\n'),
    negative_prompt: 'Do not introduce new anatomy or costume. No baked-in text.',
  },
};

/* ============================================================================
   REGISTRO COMPLETO
   Ogni frammento è indicizzato per id: `fragment_ids.json` (§48) contiene solo
   chiavi che esistono qui.
   ========================================================================= */

export const FRAGMENT_LIBRARY: Map<string, PromptFragment> = (() => {
  const all: PromptFragment[] = [
    ...GLOBAL_FRAGMENTS,
    ...FAMILIES.map(familyFragment),
    ...FAMILIES.flatMap((f) => f.archetypes.map((a) => archetypeFragment(f, a))),
    ...AFFINITIES.map(affinityFragment),
    ...SIZES.map(sizeFragment),
    ...ROLES.map(roleFragment),
    ...FASHIONS.map(fashionFragment),
    ...MARKER_FRAGMENTS,
    ...MOODS.map(moodFragment),
    CHARACTER_DNA_FRAGMENT,
    CULTURAL_FRAGMENT,
    HOUSE_COLOR_FRAGMENT,
    HERITAGE_FRAGMENT,
    ...DESIGN_DNA.map(designDnaFragment),
    ...Object.keys(APPEARANCE_DETAIL).map(appearanceFragment),
    DOODLE_FRAGMENT,
    ...RARITY_TIERS.map(rarityFragment),
    ...VOICE_PRESETS.map(voiceFragment),
    ...Object.values(ASSET_FRAGMENTS),
  ];

  const map = new Map<string, PromptFragment>();
  for (const f of all) {
    if (map.has(f.id)) throw new Error(`Frammento duplicato: ${f.id}`);
    map.set(f.id, f);
  }
  return map;
})();

export function getFragment(id: string): PromptFragment {
  const f = FRAGMENT_LIBRARY.get(id);
  if (!f) throw new Error(`Frammento inesistente: ${id}`);
  return f;
}

/** Normalizza un id di catalogo in un segmento di id di frammento. */
export function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
