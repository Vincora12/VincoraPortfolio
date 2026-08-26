/* ============================================================================
   HERITAGE (§23, §41)

   §23 — «BRANCH target: 1–3 recognizable Heritage traits. Equivalent visual
   target: roughly 20% translated heritage / 80% new design freedom.»
   §23 — otto categorie: anatomy, palette fragment, eyewear logic, symbolic
   motif, behavioral contradiction, Voice ritual, memory, relationship habit.
   §23 — «No direct copy across incompatible Families; translate structurally.»
   §41 — la traduzione avviene in tre mosse: si isola l'idea sottostante, la si
   traduce attraverso la NUOVA anatomia, si conserva la riconoscibilità solo
   dove è compatibile.

   Due tempi, come impone il flusso delle schermate:
   1. `selectHeritageOrigins` al momento del branch — che cosa sopravvive.
      La schermata 13 mostra questo SENZA anticipare la nuova identità, che a
      quel punto non esiste ancora.
   2. `translateHeritage` alla generazione — come si traduce nella nuova Family.
   ========================================================================= */

import {
  HERITAGE_CATEGORIES,
  affinityDef,
  familyDef,
  moodDef,
  roleDef,
  type HeritageCategory,
} from './generation-config';
import { pickInt, pickMany, type Rng } from './rng';
import type { HeritageTrait, MonRecord } from './types';

export type HeritageOrigin = Omit<HeritageTrait, 'transformed'>;

export function heritageCategoryLabel(id: HeritageCategory): string {
  return HERITAGE_CATEGORIES.find((c) => c.id === id)?.it ?? id.toUpperCase();
}

/* --- 1. Che cosa sopravvive ------------------------------------------------ */

export function selectHeritageOrigins(rng: Rng, previous: MonRecord): HeritageOrigin[] {
  const p = previous.data;
  const from = p.name;

  // Un candidato per categoria di §23, quando il .mon uscente può esprimerla.
  const pool: { category: HeritageCategory; origin: string }[] = [
    {
      category: 'anatomy',
      origin: `anatomia ${p.family} / ${p.family_archetype}: ${familyDef(p.family).it}`,
    },
    {
      category: 'palette',
      origin: `il colore dominante: ${p.palette_dna.swatch_names[0]} — ${p.palette_dna.primary}`,
    },
    {
      category: 'contradiction',
      origin: p.character_dna.contradictions[0]
        ? `la contraddizione fra ${p.character_dna.contradictions[0].a} e ${p.character_dna.contradictions[0].b}`
        : `il modo di stare al mondo del ${p.role}: ${roleDef(p.role).it}`,
    },
    {
      category: 'voiceRitual',
      origin: `il registro di voce: ${p.voice_preset}`,
    },
    {
      category: 'memory',
      origin: `come stava al mondo quando era ${p.mood_primary}: ${moodDef(p.mood_primary).it}`,
    },
    {
      category: 'relationship',
      origin: `l'espediente anatomico che lo rendeva riconoscibile: ${p.character_dna.anatomical_gimmick}`,
    },
  ];

  if (p.eyewear) {
    pool.push({
      category: 'eyewear',
      origin: `la logica dell'ottica: ${p.eyewear.category} — ${p.eyewear.description}`,
    });
  }

  const count = pickInt(rng, 1, 3);
  return pickMany(rng, pool, count).map((t, i) => ({
    id: `her_${p.mindline_node}_${i}`,
    category: t.category,
    origin: t.origin,
    from_mon: from,
  }));
}

/* --- 2. Traduzione nella nuova Family -------------------------------------- */

/**
 * §41 — traduce, non copia. Le varianti si scorrono in ordine a partire da un
 * turno casuale, così due tratti della stessa categoria nello stesso .mon non
 * ricevono mai la stessa frase.
 */
export function translateHeritage(
  rng: Rng,
  origins: readonly HeritageOrigin[],
  family: string,
  affinity: string,
): HeritageTrait[] {
  const offset = pickInt(rng, 0, 2);
  const used = new Map<HeritageCategory, number>();

  return origins.map((o) => {
    const seen = used.get(o.category) ?? 0;
    used.set(o.category, seen + 1);
    return { ...o, transformed: translateOne(o.category, family, affinity, offset + seen) };
  });
}

function translateOne(
  category: HeritageCategory,
  family: string,
  affinity: string,
  variant: number,
): string {
  const anatomy = familyDef(family).it;
  const contamination = affinityDef(affinity).it;

  const options: Record<HeritageCategory, string[]> = {
    anatomy: [
      `la stessa struttura riscritta nell'anatomia ${family}: ${anatomy}`,
      `il carico si sposta: quello che era una forma a sé ora è ${anatomy}`,
      `sopravvive come proporzione più che come forma, dentro un corpo ${family}`,
    ],
    palette: [
      `la tinta resta, ma su materia nuova: ${contamination}`,
      `il colore si ritira a una zona sola e diventa accento invece che dominante`,
      `resta come sottotono, non più come superficie`,
    ],
    eyewear: [
      `stessa logica ottica, montata su un cranio che non ha la stessa forma`,
      `la categoria di ottica resta, la costruzione si adatta alla nuova testa`,
      `sopravvive ridotta: una sola lente dove prima ce n'erano due`,
    ],
    symbol: [
      `il motivo torna più piccolo, come dettaglio invece che come firma`,
      `si è raffreddato in un simbolo: c'è, e non si discute più`,
      `riappare inciso sulla materia nuova: ${contamination}`,
    ],
    contradiction: [
      `la contraddizione resta, ma cambia il lato che domina`,
      `lo stesso conflitto, ora visibile nella sagoma invece che nel comportamento`,
      `si è spostato dal volto alla postura`,
    ],
    voiceRitual: [
      `il rituale di voce resta ma si accorcia: la relazione ha preso confidenza`,
      `riappare solo nei momenti di calo, come una vecchia abitudine`,
      `sopravvive come cadenza, non più come formula`,
    ],
    memory: [
      `passa in forma parziale: resta la sensazione, si perde il dettaglio`,
      `torna come preferenza inspiegata — non sa perché, lo fa e basta`,
      `sopravvive come citazione interna, mai detta ad alta voce`,
    ],
    relationship: [
      `la stessa abitudine, con un corpo che la esegue in modo diverso`,
      `resta come riflesso, prima ancora che come scelta`,
      `emerge sotto pressione e poi rientra`,
    ],
  };

  const list = options[category];
  return list[variant % list.length]!;
}

/* --- Novità (§23) ----------------------------------------------------------- */

/**
 * §23 — «A new .mon should normally change at least 4 of these 7:
 * Family/Archetype, Affinity, silhouette, eyewear, Fashion silhouette,
 * color DNA, Voice baseline.»
 * Il risultato alimenta la componente `novelty` del punteggio di rarità (§16).
 */
export function countChangedAxes(
  previous: MonRecord | null,
  next: {
    family: string;
    archetype: string;
    affinity: string;
    fashion: string;
    eyewear: string | null;
    voicePreset: string;
    palettePrimary: string;
  },
): number {
  if (!previous) return 7;
  const p = previous.data;

  const checks = [
    p.family !== next.family || p.family_archetype !== next.archetype,
    p.affinity !== next.affinity,
    p.character_dna.silhouette_quirk !== undefined, // la silhouette è sempre rigenerata
    (p.eyewear?.category ?? null) !== next.eyewear,
    p.fashion !== next.fashion,
    p.palette_dna.primary !== next.palettePrimary,
    p.voice_preset !== next.voicePreset,
  ];

  return checks.filter(Boolean).length;
}
