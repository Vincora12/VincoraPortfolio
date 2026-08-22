/* ============================================================================
   IL GUSTO DI VINZ, RIATTACCATO AL RESOLVER

   ⚠️ COSA SI ERA PERSO, E DOV'ERA.

   Il progetto contiene da sempre una ricerca dettagliata sul gusto visivo:
   18 grammatiche di moda con la loro `language`, 6 direzioni di taglio, 3
   trattamenti di decolorazione con il loro `prompt`, 16 categorie di occhiali,
   la grammatica di Size, i livelli di Humanoidity con il loro `avoid`, 23
   riferimenti culturali. È tutta in `engine/generation-config.ts`, e il
   vecchio compilatore a frammenti la usava davvero — `fragments.ts` legge
   `SIZE_GRAMMAR[size].rule` e `f.language`.

   🔴 IL RESOLVER NUOVO NON NE RICEVEVA NIENTE. `adapter.ts` gli passa le
   ETICHETTE: `fashion: 'STREET'`, `hairMode: 'FULL BLEACH'`, `size: 'GIANT'`.
   Non la grammatica dietro l'etichetta. Il taglio scelto dal motore
   (`haircut`) non gli arrivava proprio.

   Ed è esattamente il motivo dei collassi:

     STREET      senza la sua `language` → felpa e sneaker, ogni volta
     FULL BLEACH senza il taglio → cinque punte, ogni volta
     GIANT       senza `SIZE_GRAMMAR.rule` → torso muscoloso, ogni volta

   Non era il modello a essere pigro: gli mancava la ricerca.

   ════════════════════════════════════════════════════════════════════════════
   🔒 PERCHÉ UN FILE A PARTE E NON DENTRO L'ADAPTER

   `CharacterData` è un tipo del pacchetto di ChatGPT, e quello non si tocca:
   non posso aggiungergli campi. Quindi la grammatica viaggia come blocco
   separato — che è anche la forma giusta, perché sono due cose diverse:

     CHARACTER DATA   cosa È questa creatura (canonico, non si discute)
     QUESTO BLOCCO    come si legge quello che è, e cosa piace a Vinz

   🔒 E NON SOSTITUISCE I DATI. Non introduce tassonomia, non cambia campi
   generati: prende le etichette che il motore ha già deciso e ci rimette
   accanto la ricerca che c'era dietro.
   ========================================================================= */

import {
  EYEWEAR_CATEGORIES,
  FASHIONS,
  HAIRCUTS,
  HAIR_STATES,
  NO_HUMAN_HAIR_RULE,
  SIZE_GRAMMAR,
  TEST_PHASE,
} from '../../engine/generation-config';
import { CATALOG_AXES, AXES, enabled, isCatalogTuned } from '../../engine/catalogTuning';
import type { MonRecord } from '../../engine/types';
import type { CreativeResolution } from './vendor/types';

/** Cosa hanno già risolto le forme precedenti, per non ripetersi. */
export interface FormeGiaViste {
  hairConstruction: string;
  eyewearConstruction: string;
  proportionalExaggeration: string;
  dominantIdentityMass: string;
}

export function formeGiaViste(
  records: readonly MonRecord[],
  escludi: string,
): FormeGiaViste[] {
  return records
    .filter((r) => r.data.name !== escludi && r.resolution)
    .slice(-6)
    .map((r) => {
      const x = r.resolution as CreativeResolution;
      return {
        hairConstruction: x.hairConstruction,
        eyewearConstruction: x.eyewearConstruction,
        proportionalExaggeration: x.proportionalExaggeration,
        dominantIdentityMass: x.dominantIdentityMass,
      };
    });
}

/**
 * Le cose che Vinz ha SPENTO nei cataloghi.
 *
 * ⚠️ È l'unico segnale di rifiuto ESPLICITO che il progetto contiene: DEV →
 * CATALOGHI è letteralmente «accendere e spegnere quello che piace». Non
 * arrivava a nessuna AI — serviva solo a non far uscire quelle voci
 * dall'estrazione. Ma «non voglio più vedere questa cosa» è
 * un'informazione di gusto, non solo un filtro di sorteggio.
 */
function spentiDaVinz(): string[] {
  if (!isCatalogTuned()) return [];
  const out: string[] = [];
  for (const axis of CATALOG_AXES) {
    const info = AXES[axis];
    const accesi = enabled(axis);
    const spenti = info.all.filter((id) => !accesi.includes(id));
    if (spenti.length > 0 && spenti.length < info.all.length) {
      out.push(`${info.label}: ${spenti.join(', ')}`);
    }
  }
  return out;
}

const riga = (t: string | undefined): string => (t ? t.trim() : '');

/**
 * Il briefing di gusto per QUESTA forma.
 *
 * 🔒 Tutto quello che c'è dentro è già nel progetto: `generation-config.ts` e
 * i cataloghi accesi/spenti. Non c'è una riga di conoscenza generica sulla
 * moda o sul character design aggiunta da me — sarebbe esattamente il modo di
 * sostituire il gusto di Vinz con un gusto medio.
 */
export function tasteBrief(record: MonRecord, storia: FormeGiaViste[] = []): string {
  const d = record.data;

  const fashion = FASHIONS.find((f) => f.id === d.fashion);
  const size = SIZE_GRAMMAR[d.size as keyof typeof SIZE_GRAMMAR];
  const hair = HAIR_STATES.find((h) => h.id === d.hair_state);
  const cut = HAIRCUTS.find((h) => h.id === d.haircut);
  const eyewear = EYEWEAR_CATEGORIES.find((e) => e.id === d.eyewear?.category);
  const spenti = spentiDaVinz();

  const parti: string[] = [
    `VINZ TASTE BRIEF — the research behind the labels in Character Data.

These are not new facts about the creature. Character Data stays canonical.
This is the grammar each label already carries in Vinz's own catalogue, plus
what he has explicitly rejected. Read it before you decide anything.

⚠️ WORK IN TWO STAGES. Do not collapse a label into its most obvious object.

  STAGE A — choose a DIRECTION: which styling grammar, which bleach treatment,
            which haircut direction, which eyewear category, which cultural
            references, which proportional strategy.
  STAGE B — only after Family, Archetype, Role, personality and
            silhouette are settled, build the exact solution for THIS body.

"TRANSPARENT/CRYSTAL" is a direction, not a visor. "FULL BLEACH" is a
treatment, not five spikes. "WORKWEAR" is a grammar, not a bib and a panel.`,
  ];

  if (fashion) {
    parti.push(`FASHION — ${fashion.id}
${riga(fashion.language)}

Fashion is a styling GRAMMAR, never a garment list. It governs volume,
silhouette, proportion, layering, construction, body exposure, footwear or
foot treatment, material attitude, accessory scale, and how all of that
relates to the eyewear and the hair. Active Cultural DNA contaminates this
grammar — it does not replace it. A named reference means: extract its
operating principles (silhouette, proportion, layering, material contrast,
tailoring behaviour, exposure, garment architecture, accessory scale,
footwear attitude) and reinterpret them through THIS body. Never copy an
outfit.`);
  }

  if (size) {
    parti.push(`SIZE — ${d.size}
${riga(size.rule)}

GIANT must not resolve as "bigger torso" again. The dominant scale can land on
the head, the torso, the hands, the feet, the arms, the legs, a tail, wings,
horns, appendages, or a Family-specific structure. Choose from what this
creature already is.`);
  }

  const capelli = [
    hair ? `BLEACH TREATMENT — ${hair.id}\n${riga(hair.prompt)}` : '',
    cut ? `HAIRCUT DIRECTION — ${cut.id} (${riga(cut.en)})` : '',
    `The identity repeats — dark blond base, bleach as a recurring Vinz marker.
The FORMAL SOLUTION must not. Vary the cut, the number of masses, their
direction, the silhouette, the root treatment, how the bleach is distributed,
and the texture. ${riga(NO_HUMAN_HAIR_RULE)}
Do not default a non-human head to a five-spike crest.`,
  ].filter(Boolean);
  parti.push(capelli.join('\n\n'));

  if (eyewear) {
    parti.push(`EYEWEAR CATEGORY — ${eyewear.id}

⚠️ The category is a direction, not a construction. Its actual shape must come
out of this face's anatomy, the Family, the Archetype, the
Character Design DNA, the Fashion grammar and the Cultural DNA. Different
Forms must produce genuinely different eyewear silhouettes — do not resolve
repeatedly into a visor, a continuous face mask or a single skull plate.`);
  }

  /* ⚠️ LA FASE DI PROVA VA DETTA AL RESOLVER, E VA DETTA COSÌ.

     🔷 «KEN definisce la lingua del character design, non deve forzare una
        silhouette ricorrente, un'anatomia d'angelo fissa, una faccia sola,
        una tavolozza sola o sempre la stessa aureola.»

     ⚠️ Un modello che vede tre assi fermi e non riceve nient'altro fa la cosa
     più naturale del mondo: tratta i tre valori come UN personaggio, e
     comincia a rifarlo. È il rischio specifico di questa fase, ed è il
     contrario di quello che serve — i tre assi sono fermi PROPRIO per poter
     giudicare quanto varia tutto il resto. */
  if (TEST_PHASE.enabled) {
    parti.push(`TEST PHASE — three axes are deliberately locked.

  FAMILY = ${TEST_PHASE.family}   SIZE = ${TEST_PHASE.size}   DESIGNER = ${TEST_PHASE.characterDesigner}

They are held still so that everything else can be judged. This is NOT a
recurring character: it is the same three constraints handed to a fresh
design problem each time.

⚠️ The locked designer defines a character-design LANGUAGE — how form is
constructed, simplified and read. It must never harden into:

  - one recurring body shape        - one fixed face
  - one recurring silhouette        - one fixed palette
  - one fixed ${TEST_PHASE.family} anatomy${' '.repeat(Math.max(0, 8 - TEST_PHASE.family.length))}      - one fixed halo or wing construction

⚠️ And a locked SIZE is not a locked proportion. ${TEST_PHASE.size} is a
compression strategy: which mass dominates, and what gets shortened, must be
decided again for every Form from what that Form already is.

Morphological variation inside this locked space must be MAXIMUM. Treat every
generation as a brand-new character-design problem that happens to share three
constraints with the previous one — the way two illustrators given the same
brief produce two different creatures, not two drafts of one.`);
  }

  if (spenti.length > 0) {
    parti.push(`WHAT VINZ HAS SWITCHED OFF — explicit rejections, not inference.
${spenti.map((s) => `- ${s}`).join('\n')}

He turned these off himself. Never reintroduce them as a reference, an
influence or a near-equivalent through a side door.`);
  }

  if (storia.length > 0) {
    parti.push(`WHAT RECENT FORMS ALREADY DID — do not repeat these solutions.
${storia
  .map(
    (h, i) =>
      `${i + 1}. hair: ${h.hairConstruction}\n   eyewear: ${h.eyewearConstruction}\n   proportion: ${h.proportionalExaggeration}\n   dominant mass: ${h.dominantIdentityMass}`,
  )
  .join('\n')}

Before locking the Visual DNA, check yourself: is this basically the same hair
again? is this secretly another visor? did a different Fashion category
collapse into the same construction? did GIANT use the same trick? are too
many strange features being maximised at once? If yes, resolve it differently.
Do not mention this check in your output.`);
  }

  return parti.filter(Boolean).join('\n\n────────────────────────────────────\n\n');
}
