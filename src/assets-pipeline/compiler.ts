/* ============================================================================
   PROMPT COMPILER (§30, §46, §47, §48)

   §30 — «The website must not ask an image model to invent a VINZ.MON from a
   short label. It must compile one deterministic image-generation prompt from
   modular fragments.»

   §48 — «prompt generation is a pure function of Character Data + asset type +
   compiler version.» Questo modulo è quella funzione pura: stessi dati in
   ingresso, stesso prompt in uscita, sempre.

   §48 — ogni compilazione registra anche gli id dei frammenti usati, in
   ordine: è il contenuto di `fragment_ids.json`.
   ========================================================================= */

import { GENERATION_CONFIG_VERSION, culturalReference } from '../engine/generation-config';
import { idleMotionFor } from '../engine/idleMotion';
import {
  ASSET_FRAGMENTS,
  COMPILER_VERSION,
  DOODLE_FRAGMENT,
  FRAGMENT_LIBRARY,
  getFragment,
  slug,
  type PromptFragment,
} from './fragments';
import type { AssetType, CharacterData, MonRecord } from '../engine/types';
import { displayName } from '../engine/types';

export { COMPILER_VERSION };

/* --- Risultato ------------------------------------------------------------- */

export interface CompiledPrompt {
  /** Il testo finale, pronto da incollare nel generatore di immagini. */
  text: string;
  /** §48 — gli id atomici usati, nell'ordine di assemblaggio. */
  fragmentIds: string[];
  compilerVersion: string;
  generationConfigVersion: string;
  assetType: AssetType;
  /** §48 — provenienza espandibile per la schermata DEV. */
  provenance: { id: string; axis: string; priority: number; excerpt: string }[];
  /** Conflitti risolti dal resolver, mostrati in DEV. */
  resolved: string[];
}

/* ============================================================================
   §30.2 — RESOLVER DI PRIORITÀ E CONFLITTI

   «If a lower-priority fragment weakens the read of a higher-priority axis,
    rewrite or remove the lower-priority instruction.»

   L'esempio del documento è FAMILY=INSECT + FASHION=FORMAL: non un umano in
   completo con le antenne, ma piastre simmetriche pulite e ottica precisa
   sull'anatomia dell'insetto. Il resolver non cancella la Fashion: la riscrive
   perché passi attraverso l'anatomia.
   ========================================================================= */

/** Famiglie la cui anatomia non regge un capo di abbigliamento convenzionale. */
const NON_GARMENT_FAMILIES = [
  'MICROBE', 'FUNGUS', 'MINERAL', 'PSYCHIC', 'PLANT', 'FOOD', 'INSECT',
];

/** Fashion che presuppongono un corpo vestibile in modo convenzionale. */
const GARMENT_HEAVY_FASHION = ['FORMAL', 'TAILORED AVANT', 'PREPPY', 'ROMANTIC', 'MOTO'];

function resolveConflicts(
  fragments: PromptFragment[],
  data: CharacterData,
): { fragments: PromptFragment[]; resolved: string[] } {
  const resolved: string[] = [];

  const out = fragments.map((f) => {
    if (
      f.axis === 'fashion' &&
      NON_GARMENT_FAMILIES.includes(data.family) &&
      GARMENT_HEAVY_FASHION.includes(data.fashion)
    ) {
      resolved.push(
        `FASHION=${data.fashion} su FAMILY=${data.family}: riscritta come logica di superficie e di ottica, per non creare un umano vestito con tratti da ${data.family}.`,
      );
      return {
        ...f,
        positive_prompt: [
          f.positive_prompt,
          '',
          'CONFLICT RESOLUTION — FAMILY WINS:',
          `${data.family} anatomy does not support conventional garments.`,
          `Translate ${data.fashion} into surface logic instead of clothing:`,
          'clean symmetrical plates, polished accessory hardware, precise optical hardware,',
          'disciplined silhouette and material finish — while fully preserving the Family anatomy.',
          'Do NOT create a human wearing an outfit with creature features.',
        ].join('\n'),
      };
    }

    // §21 — una taglia GIANT non deve far tagliare il corpo: la regola di
    // inquadratura è più forte della grammatica di taglia.
    if (f.axis === 'size' && data.size === 'GIANT') {
      return {
        ...f,
        positive_prompt: `${f.positive_prompt}\nEven at GIANT grammar, the entire creature must remain inside the frame: reduce presentation scale rather than cropping.`,
      };
    }

    return f;
  });

  return { fragments: out, resolved };
}

/* ============================================================================
   Selezione dei frammenti per un dato Character Data
   ========================================================================= */

function selectFragmentIds(data: CharacterData, assetType: AssetType): string[] {
  /* 🔒 L'ORDINE È IL DOCUMENTO. §11 del master: «The first visual read must be
     CHARACTER; the second VINZ.MON identity; Family/Archetype/Role follow.»
     Quindi le regole di casa — com'è fatto un personaggio, come si usano i
     colori, chi è VINZ — stanno PRIMA di qualunque riga di tassonomia, e non
     in fondo come postille. */
  const ids: string[] = [
    'global.identity',
    'global.house_character_dna',
    'global.house_color_dna',
    'global.vinz_hair_identity',
    'global.gender',
  ];

  // 🔶 v1.9 §23.2 — ogni asset derivato porta l'ordine di allegare il master.
  // Sul master stesso non compare: lì il riferimento non esiste ancora, ed è
  // esattamente il motivo per cui va generato per primo.
  /* ⚠️ SOLO SE IL MASTER ESISTE DAVVERO.
     Prima la condizione era «tutti tranne il master», e reggeva finché il
     master era la prima immagine generata. Da quando il RITRATTO è il primo
     (§22.4 — è l'unico che si vede subito), quel blocco finiva nella primissima
     immagine di una creatura e diceva: «allega il CHARACTER MASTER, dove testo
     e immagine non concordano vince l'immagine» — puntando a un'immagine che
     non esiste. La prima faccia nasceva da un prompt che dichiarava sé stesso
     non autorevole. */
  if (data.asset_manifest_status.character_master === 'resolved' && assetType !== 'character_master') {
    ids.push('global.master_reference');
  }

  /* Il piano corporeo appartiene a Family + Archetype. Un secondo asse
     numerico che chiedeva di essere contemporaneamente più o meno umano
     produceva ibridi bestiali anche quando la tassonomia non li prevedeva. */
  ids.push(`family.${slug(data.family)}`);
  ids.push(`archetype.${slug(data.family)}.${slug(data.family_archetype)}`);
  ids.push(`affinity.${slug(data.affinity)}`);
  ids.push(`size.${slug(data.size)}`);
  ids.push(`role.${slug(data.role)}`);
  ids.push(`fashion.${slug(data.fashion)}`);

  // §9 — i marcatori entrano solo quando l'anatomia li consente.
  if (data.eyewear) ids.push('marker.eyewear');
  if (data.hair_state) ids.push(`marker.${slug(data.hair_state)}`);
  else ids.push('marker.no_human_hair');

  ids.push(`mood.${slug(data.mood_primary)}`);
  ids.push('character_dna.compile');
  /* §7 — la Cultural DNA. Entra sempre: è un modo di pensare la creatura, non
     un tratto che alcune hanno e altre no. */
  ids.push('cultural.compile');
  /* MASTER CHARACTER SYSTEM v1.1 §8 — chi lo costruisce. Va in OGNI asset,
     compreso il doodle: cambiare designer fra un asset e l'altro produrrebbe
     sei immagini di sei creature diverse con lo stesso nome. */
  /* Stessa regola: un .mon nato prima dell'§8 non ha un designer, e non gliene
     si assegna uno adesso — cambierebbe come è fatto, retroattivamente. */
  if (data.character_design_dna) ids.push(`design.${slug(data.character_design_dna)}`);
  if (data.heritage_traits.length > 0) ids.push('heritage.compile');

  // §42 — la BIO DOODLE non usa l'Appearance canonico: usa il doodle.
  ids.push(
    assetType === 'bio_doodle' ? DOODLE_FRAGMENT.id : `appearance.${slug(data.appearance)}`,
  );

  ids.push(`rarity.${slug(data.rarity)}`);
  ids.push(ASSET_FRAGMENTS[assetType]!.id);
  /* Ultimo di tutti: le due prove si fanno su quello che hai già deciso. */
  ids.push('global.final_tests');
  ids.push('global.full_body', 'global.on_any_background', 'global.novelty');

  return ids;
}

/* ============================================================================
   §46 — MASTER COMPILER TEMPLATE
   ========================================================================= */

export function compilePrompt(record: MonRecord, assetType: AssetType): CompiledPrompt {
  const data = record.data;
  const ids = selectFragmentIds(data, assetType);

  const raw = ids.map(getFragment);
  const { fragments, resolved } = resolveConflicts(raw, data);

  // §30.2 — ordinamento per priorità, stabile: a parità di priorità resta
  // l'ordine di §46, che è l'ordine in cui il documento li elenca.
  const ordered = fragments
    .map((f, i) => ({ f, i }))
    .sort((a, b) => a.f.priority - b.f.priority || a.i - b.i)
    .map((x) => x.f);

  const blocks: string[] = [];

  blocks.push(`NAME: ${data.name}`);
  blocks.push(`RARITY: ${data.rarity}`);
  blocks.push('');

  for (const f of ordered) {
    let text = f.positive_prompt;

    // I due moduli con segnaposto ricevono qui i dati veri.
    if (f.id === 'character_dna.compile') {
      text = text.replace('{{CHARACTER_DNA}}', renderCharacterDna(data));
    }
    if (f.id === 'heritage.compile') {
      text = text.replace('{{HERITAGE}}', renderHeritage(data));
    }
    /* 🔷 v1.11 §23.4 — il movimento di riposo si ricava dall'anatomia di
       QUESTA creatura. Prima il frammento elencava le possibilità — «capelli,
       frange, stoffa, antenne o quello che l'anatomia ha davvero» — e un
       modello che legge un elenco di ipotesi sceglie la prima: tutti i .mon
       finivano per respirare allo stesso modo. */
    if (f.id === 'asset.idle_animation') {
      text = text.replace('{{IDLE_MOTION}}', idleMotionFor(data.family, data.affinity).text);
    }

    blocks.push(text);

    // I marcatori portano con sé la soluzione esatta generata (§40).
    if (f.id === 'marker.eyewear' && data.eyewear) {
      blocks.push(
        `EYEWEAR CATEGORY: ${data.eyewear.category}\nEYEWEAR SOLUTION: ${data.eyewear.description}`,
      );
    }
    if (f.id.startsWith('marker.') && data.haircut) {
      blocks.push(`HAIRCUT / EQUIVALENT: ${data.haircut}`);
    }
    if (f.id.startsWith('mood.') && data.mood_secondary) {
      blocks.push(`SECONDARY MOOD NUANCE: ${data.mood_secondary}`);
    }

    /* ⚠️ QUI IL DIVIETO VENIVA STAMPATO NUDO, e alcuni frammenti si scrivono
       l'etichetta da soli e altri no. Il risultato, sul blocco del genere,
       era questa riga:

         «feminine-coded styling used to soften the creature, gender ambiguity
          treated as the concept, human gender markers pasted onto non-human
          anatomy»

       Una lista di cose da EVITARE, in mezzo a un prompt, senza una parola
       che dica che sono da evitare. Letta da un modello di immagini è una
       richiesta. Adesso l'etichetta la mette il compilatore, una volta sola e
       per tutti — e chi ce l'aveva già non se la ritrova doppia. */
    if (f.negative_prompt) {
      const body = f.negative_prompt.replace(/^\s*(AVOID|NEGATIVE)\s*:\s*/i, '');
      blocks.push(`AVOID: ${body}`);
    }
    blocks.push('');
  }

  /* La complessità racconta la progressione. Una rarità alta può rendere
     memorabile una Basic Form, ma non può farla nascere già "final boss". */
  blocks.push(formComplexityBlock(data));
  blocks.push('');

  blocks.push('FINAL RESOLVER:');
  blocks.push('Remove contradictions according to canonical priority.');
  blocks.push('Do not add unrequested taxonomy, costume, anatomy or props.');
  blocks.push('Return only the requested visual asset.');
  /* 🔶 Era «CREATURE FIRST. STYLING SECOND.», che adesso contraddirebbe la
     prima riga del prompt: il master mette il CARATTERE prima della specie.
     Una chiusura che smentisce l'apertura lascia decidere al modello quale
     delle due contava. */
  blocks.push('CHARACTER FIRST. The taxonomy is how it is built, not what it is for.');

  return {
    text: blocks.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n',
    fragmentIds: ordered.map((f) => f.id),
    compilerVersion: COMPILER_VERSION,
    generationConfigVersion: data.generation_config_version ?? GENERATION_CONFIG_VERSION,
    assetType,
    provenance: ordered.map((f) => ({
      id: f.id,
      axis: f.axis,
      priority: f.priority,
      excerpt: f.positive_prompt.split('\n')[0]!.slice(0, 90),
    })),
    resolved,
  };
}

function formComplexityBlock(data: CharacterData): string {
  const stage = Math.max(0, data.evolution_state?.stage ?? 0);
  if (stage === 0) {
    return [
      'FORM COMPLEXITY: BASIC FORM — SIMPLE, ICONIC, IMMEDIATELY MEMORABLE.',
      'This rule overrides Rarity, Fashion and cultural detail whenever they would add visual clutter.',
      'Use one dominant identity mass, 2–3 unmistakable silhouette landmarks and one signature anatomical system. Keep 75–85% of surfaces clean and broad.',
      'Use no more than one accessory system. Merge clothing and anatomy into large readable shapes. Remove tertiary ornaments, repeated jewels, floating decorations, layered trims, extra straps, tiny symbols and redundant appendages.',
      'Distinctive does not mean detailed. Make the character recognizable from a thumbnail and drawable from memory in roughly 8–12 shapes.',
      'A new or completely changed Form always returns to this simplicity baseline.',
    ].join('\n');
  }

  const cleanSurface = Math.max(45, 75 - stage * 8);
  const additions = Math.min(stage, 4);
  return [
    `FORM COMPLEXITY: EVOLUTION STAGE ${stage} — CONTROLLED GROWTH FROM THE PREVIOUS FORM.`,
    'Preserve the previous Form core silhouette, face, proportions and identity markers before adding complexity.',
    `Add at most ${additions} clear structural development${additions === 1 ? '' : 's'} total: evolved anatomy, a stronger material system or one meaningful silhouette change. Every addition must communicate growth; decoration alone does not count.`,
    `Keep at least ${cleanSurface}% of surfaces visually clean. Increase hierarchy and physical power before increasing ornament.`,
    'Never replace large readable masses with many small details. The viewer must still recognize the Basic Form underneath the evolution.',
  ].join('\n');
}

/* --- Rendering dei blocchi con dati reali ---------------------------------- */

function renderCharacterDna(data: CharacterData): string {
  const d = data.character_dna;
  const lines = [
    `silhouette quirk: ${d.silhouette_quirk}`,
    `anatomical gimmick: ${d.anatomical_gimmick}`,
    `face / eye logic: ${d.face_logic}`,
    `body-language default: ${d.body_language}`,
    `recurring motif: ${d.recurring_motif}`,
    /* 🔶 Era un elenco di cinque esadecimali con nomi generici — «primary»,
       «light red tint» — cioè cinque colori senza un posto dove andare. Il
       master §9 vuole i RUOLI, perché è il ruolo che dice dove il colore
       finisce sul corpo. Sta qui e non in un frammento a parte perché la
       palette è parte dell'identità di QUESTA creatura, non una regola di
       casa: la regola di casa è il blocco `global.house_color_dna`. */
    renderPalette(data),
    renderCultural(data),
    `behavioral contradictions: ${d.contradictions
      .map((c) => `${c.a} together with ${c.b}`)
      .join('; ')}`,
  ];
  if (data.eyewear) lines.push(`exact eyewear solution: ${data.eyewear.description}`);
  if (data.haircut && data.hair_state) {
    lines.push(`exact haircut / bleach solution: ${data.haircut}, ${data.hair_state}`);
  }
  return lines.join('\n');
}

/**
 * I riferimenti ATTIVI di questa forma, e nient'altro.
 *
 * 🔶 Qui prima non c'era niente e nel frammento globale c'era il SERBATOIO
 * INTERO — quindici mondi possibili passati a ogni immagine. Un modello che
 * ne riceve quindici non ne combina tre: prende il minimo comune, che è la
 * creatura generica. Adesso il serbatoio resta nel generatore e nel prompt
 * arrivano solo i due-quattro che questa creatura ha davvero.
 */
function renderCultural(data: CharacterData): string {
  /* §29 — una forma nata prima di questo campo non ne ha, e non gliene si
     assegnano adesso: cambierebbe da cosa è fatta, retroattivamente. */
  const ids = data.cultural_dna ?? [];
  if (ids.length === 0) return 'active cultural DNA: none recorded for this Form.';
  const names = ids.map((id) => culturalReference(id)?.en ?? id);
  return `ACTIVE CULTURAL DNA (combine ONLY these, translated into anatomy and attitude): ${names.join(' + ')}`;
}

/**
 * La palette come ruoli, non come elenco.
 *
 * 🔒 L'ordine è quello del master, e non è casuale: la base per prima perché
 * è quella che si vede da lontano, l'acido subito dopo perché è quello che
 * decide se la creatura è una VINZ.MON, e i neutri per ultimi perché sono
 * quelli che non si notano quando sono giusti.
 */
function renderPalette(data: CharacterData): string {
  const n = data.palette_dna.swatch_names;

  /* ⚠️ UNA CREATURA NATA PRIMA DI §9 NON HA I RUOLI, e §29 dice che una
     creatura porta scritta la versione con cui è venuta al mondo: non si
     riscrive. Quindi qui non si inventa un acid hero che non è mai esistito —
     si stampa quello che quella creatura ha davvero, e si dice da dove viene.

     Senza questo, il primo `compilePrompt` su un .mon salvato ieri leggeva
     `roles.base` di un oggetto che non c'è: schermata grigia. */
  const r = data.palette_dna.roles;
  if (!r) {
    return [
      'PALETTE (generated before HOUSE COLOR DNA roles existed — use as a flat set):',
      data.palette_dna.swatches.map((hex, i) => `${hex} (${n[i] ?? ''})`).join(' · '),
    ].join('\n');
  }
  return [
    'HOUSE COLOR DNA — each colour has a JOB, not just a value:',
    `- DOMINANT BASE ${r.base} (${n[0]?.split(' — ')[0] ?? ''}): large graphic fields. This is what is seen from across the room.`,
    `- ACID HERO ${r.acidHero} (${n[1]?.split(' — ')[0] ?? ''}): marks signature anatomy, the eyewear, or the one feature that identifies this creature. It is NOT scattered.`,
    `- CONTRAST ${r.contrast}: holds the chord together; used in fewer, deliberate places.`,
    `- MICRO ACCENT${r.micro.length > 1 ? 'S' : ''} ${r.micro.join(' ')}: tiny quantities only.`,
    `- NEUTRALS ${r.neutralLight} / ${r.neutralDark}: dirty off-white and a black that is not pure black.`,
    /* 🔒 LE PERCENTUALI, non «campi grandi». Il master dice «large graphic
       colour fields matter more than multicoloured micro-detail», che è un
       giudizio; questa è un'istruzione. Senza, l'acido finisce spruzzato
       ovunque e la base non domina niente. */
    'DISTRIBUTION — approximate, and it matters more than the exact hues:',
    `~45% ${r.base} · ~20% neutrals · ~15% hair or its equivalent · ~12% ${r.contrast} · ~6% ${r.acidHero} · ~2% micro accents.`,
    'The acid colour is under a tenth of the surface: that is what makes it read as acid.',
  ].join('\n');
}

function renderHeritage(data: CharacterData): string {
  if (data.heritage_traits.length === 0) return 'none — this is an origin node.';
  return data.heritage_traits
    .map(
      (h) =>
        `• [${h.category}] from ${displayName(h.from_mon)}\n  was: ${h.origin}\n  now: ${h.transformed}`,
    )
    .join('\n');
}

/* --- Verifica di integrità della libreria (§48) ----------------------------- */

/** Ogni id emesso deve esistere nel registro: lo controlliamo, non lo speriamo. */
export function validateFragmentIds(ids: readonly string[]): string[] {
  return ids.filter((id) => !FRAGMENT_LIBRARY.has(id));
}
