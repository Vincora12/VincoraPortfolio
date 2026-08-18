/* ============================================================================
   DAI NOSTRI FATTI A QUELLI CHE IL SUO COMPILATORE LEGGE

   🔒 «NON MODIFICARE IL SUO COMPILATORE.» I file in `vendor/` sono quelli del
   pacchetto, byte per byte: `types.ts`, `rules.ts`, `resolver.ts`,
   `compiler.ts`. Se il codice qui producesse un testo diverso da quello che
   esce provando a mano in una chat, il confronto non varrebbe niente — ed è
   esattamente il confronto per cui questa cosa esiste.

   Quindi TUTTO l'adattamento sta in questo file. Quando §27 cambia si rompe la
   compilazione di qui, che è dove uno vuole essere avvisato.

   ⚠️ TRE FORZATURE DI TIPO, DICHIARATE. I suoi tipi sono più stretti dei
   nostri dati in tre punti. La scelta è stata: NON allargare i suoi tipi
   (sarebbe modificarli) e NON impoverire i nostri dati (il prompt direbbe il
   falso). Quindi il valore VERO passa e il tipo si forza qui, dove si vede:

     rarity      da noi arriva anche a MYTHIC e SINGULAR
     hairMode    da noi c'è anche GROWN-OUT BLEACH
     humanoidity da noi è un `number`, per lui è 1|2|3|4|5

   In tutti e tre i casi il suo compilatore stampa il valore e basta, quindi il
   prompt resta vero. Se un giorno ci facesse dei confronti, questa nota è il
   posto da rileggere.

   ⚠️ NIENTE EREDITÀ. `heritage_traits` esiste nei nostri dati e non viene
   tradotto: il pacchetto dice che ogni Forma è una manifestazione fresca.
   ========================================================================= */

import type { MonRecord } from '../../engine/types';
import { CULTURAL_REFERENCES, DESIGN_DNA } from '../../engine/generation-config';
import type { CharacterData } from './vendor/types';

/** Il nome leggibile di un colore, se il motore ce l'ha messo. */
function named(hex: string, names: string[], all: string[]): { hex: string; name: string } {
  const i = all.indexOf(hex);
  return { hex, name: i >= 0 && names[i] ? names[i] : hex };
}

export function characterDataFor(record: MonRecord): CharacterData {
  const d = record.data;
  const p = d.palette_dna;
  const roles = p.roles;
  const colour = (hex: string) => named(hex, p.swatch_names, p.swatches);
  const designer = DESIGN_DNA.find((x) => x.id === d.character_design_dna);

  return {
    name: d.name,
    rarity: d.rarity as CharacterData['rarity'],
    family: d.family,
    archetype: d.family_archetype,
    affinity: d.affinity,
    size: d.size as CharacterData['size'],
    humanoidity: d.humanoidity as CharacterData['humanoidity'],
    role: d.role,
    fashion: d.fashion,
    mood: [d.mood_primary, d.mood_secondary].filter((x): x is string => Boolean(x)),
    characterDesignDNA: d.character_design_dna as CharacterData['characterDesignDNA'],
    /* La densità è del DESIGNER: è lui che decide quanto sopravvive. Il suo
       `validateCharacterData` la confronta con la propria `detailRange` e
       avvisa se non torna — quell'avviso è utile e va lasciato suonare. */
    detailDensity: designer?.density ?? 3,
    appearance: d.appearance as CharacterData['appearance'],
    palette: {
      dominantBase: colour(roles.base),
      acidHero: colour(roles.acidHero),
      contrast: colour(roles.contrast),
      microAccent: roles.micro[0] ? colour(roles.micro[0]) : undefined,
      neutrals: [colour(roles.neutralLight), colour(roles.neutralDark)],
    },
    vinzIdentity: {
      hairMode: (d.hair_state ?? 'FULL BLEACH') as CharacterData['vinzIdentity']['hairMode'],
      eyewearCategory: d.eyewear?.category ?? 'NONE',
      eyewearSolution: d.eyewear?.description,
    },
    /* Gli id diventano le voci in inglese: al resolver serve sapere COSA sono,
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
