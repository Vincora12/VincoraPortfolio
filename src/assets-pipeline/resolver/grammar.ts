/* ============================================================================
   LA GRAMMATICA NUMERICA, PIEGATA DA UMANOIDITÀ E TAGLIA

   🔒 QUESTO È IL MOTIVO PER CUI I NUMERI SONO NUMERI E NON PROSA. La tabella
   dei designer dice «testa 1.35×», ma quel moltiplicatore ha senso solo su un
   corpo che una testa umana ce l'ha. A umanoidità 1–2 le proporzioni umane si
   TOLGONO — non si mettono a 1.0, che direbbe «braccia di lunghezza normale» a
   una creatura senza braccia, ed è precisamente il modo in cui nasce un corpo
   deforme: due istruzioni vere insieme che insieme non stanno.
   ========================================================================= */

import { DESIGN_DNA, type NumericGrammar } from '../../engine/generation-config';
import type { ResolverInput } from './types';

/** I campi che descrivono un corpo umano, e che spariscono se umano non è. */
const HUMAN_ONLY = [
  'headScale',
  'torsoLength',
  'shoulderWidth',
  'armLength',
  'handScale',
  'legLength',
  'footScale',
] as const;

export function numericGrammarFor(input: ResolverInput): NumericGrammar {
  const designer = DESIGN_DNA.find((d) => d.id === input.characterDesignDNA);
  /* Un designer sconosciuto non deve far esplodere una compilazione: si perde
     la grammatica, non la creatura. Resta l'unico campo obbligatorio. */
  if (!designer) return { silhouetteLandmarkCount: [3, 4] };

  const base: NumericGrammar = { ...designer.numeric };

  if (input.humanoidity <= 2) {
    for (const k of HUMAN_ONLY) delete base[k];
  }

  /* Grande e umanoide: mani, piedi e spalle crescono più del resto, o la
     taglia si legge solo dalla scala e non dalla costruzione. */
  if (input.size === 'GIANT' && input.humanoidity >= 3) {
    base.shoulderWidth = Math.max(base.shoulderWidth ?? 1, 1.2);
    base.handScale = Math.max(base.handScale ?? 1, 1.3);
    base.footScale = Math.max(base.footScale ?? 1, 1.4);
  }

  /* Piccolo: la testa non scende sotto una soglia, o smette di leggersi come
     personaggio e diventa una miniatura. */
  if ((input.size === 'TINY' || input.size === 'SMALL') && base.headScale) {
    base.headScale = Math.max(base.headScale, 1.15);
  }

  return base;
}

/** Cose fuori posto che non fermano niente, ma vanno dette. */
export function inputWarnings(input: ResolverInput): string[] {
  const out: string[] = [];
  const designer = DESIGN_DNA.find((d) => d.id === input.characterDesignDNA);

  if (!designer) {
    out.push(`Design DNA sconosciuto: ${input.characterDesignDNA}. Grammatica numerica assente.`);
  } else if (Math.abs(designer.density - input.detailDensity) > 0.01) {
    out.push(
      `Densità ${input.detailDensity}/5 diversa da quella dichiarata da ${designer.id} (${designer.density}/5).`,
    );
  }

  if (input.activeCulturalDNA.length === 0) {
    out.push('Nessun riferimento culturale attivo: il master ne chiede da 2 a 4.');
  }
  if (input.activeCulturalDNA.length > 5) {
    out.push(`${input.activeCulturalDNA.length} riferimenti culturali attivi: più di cinque.`);
  }
  return out;
}
