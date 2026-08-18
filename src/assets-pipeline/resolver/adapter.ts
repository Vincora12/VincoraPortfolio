/* ============================================================================
   DAI NOSTRI FATTI A QUELLI CHE IL RESOLVER LEGGE

   🔒 UN SOLO PUNTO DI TRADUZIONE. I due schemi si somigliano ma non sono
   uguali: il nostro è snake_case §27 e porta cose che il pacchetto originale
   non aveva (rarità fino a SINGULAR, tre stati dei capelli, i nomi leggibili
   dei colori). Tradurre qui e basta vuol dire che quando §27 cambia si rompe
   la compilazione di questo file — che è esattamente dove uno vuole essere
   avvisato — invece di uscire un prompt con un campo vuoto.

   ⚠️ NIENTE EREDITÀ, ED È UNA REGOLA DEL PACCHETTO. `heritage_traits` esiste
   nei nostri dati e NON viene tradotto: v1 dice che ogni Forma è una
   manifestazione fresca, non una discendenza. Passarlo qui rimetterebbe in
   circolo proprio la logica che il documento chiede di togliere.
   ========================================================================= */

import type { MonRecord } from '../../engine/types';
import { DESIGN_DNA, CULTURAL_REFERENCES } from '../../engine/generation-config';
import type { ResolverInput } from './types';

/** Il nome leggibile di un colore, se il motore ce l'ha messo. */
function swatch(hex: string, names: string[], all: string[]): { hex: string; name: string } {
  const i = all.indexOf(hex);
  return { hex, name: i >= 0 && names[i] ? names[i] : hex };
}

export function resolverInputFor(record: MonRecord): ResolverInput {
  const d = record.data;
  const p = d.palette_dna;
  const roles = p.roles;
  const named = (hex: string) => swatch(hex, p.swatch_names, p.swatches);

  const designer = DESIGN_DNA.find((x) => x.id === d.character_design_dna);

  return {
    name: d.name,
    rarity: d.rarity,
    family: d.family,
    archetype: d.family_archetype,
    affinity: d.affinity,
    size: d.size,
    humanoidity: d.humanoidity,
    role: d.role,
    fashion: d.fashion,
    /* Il secondario è facoltativo: `filter` invece di due campi, o il
       resolver riceverebbe un «null» da interpretare. */
    mood: [d.mood_primary, d.mood_secondary].filter((x): x is string => Boolean(x)),
    characterDesignDNA: d.character_design_dna,
    /* La densità è del DESIGNER, non della creatura: è lui che decide quanto
       sopravvive. Se un giorno diventasse un asse per creatura, questa riga è
       il posto da cambiare. */
    detailDensity: designer?.density ?? 3,
    appearance: d.appearance,
    palette: {
      dominantBase: named(roles.base),
      acidHero: named(roles.acidHero),
      contrast: named(roles.contrast),
      microAccent: roles.micro[0] ? named(roles.micro[0]) : undefined,
      neutrals: [named(roles.neutralLight), named(roles.neutralDark)],
    },
    vinzIdentity: {
      hairMode: d.hair_state ?? 'FULL BLEACH',
      eyewearCategory: d.eyewear?.category ?? 'NESSUNA',
      eyewearSolution: d.eyewear?.description,
    },
    /* Gli id diventano le voci leggibili: al resolver serve sapere COSA sono,
       non come li chiamiamo dentro. */
    activeCulturalDNA: d.cultural_dna.map(
      (id) => CULTURAL_REFERENCES.find((c) => c.id === id)?.en ?? id,
    ),
    characterDNA: {
      silhouetteQuirk: d.character_dna.silhouette_quirk,
      anatomicalGimmick: d.character_dna.anatomical_gimmick,
      faceEyeLogic: d.character_dna.face_logic,
      bodyLanguageDefault: d.character_dna.body_language,
      recurringMotif: d.character_dna.recurring_motif,
      contradictions: d.character_dna.contradictions.map((c) => `${c.a} / ${c.b}`),
    },
  };
}
