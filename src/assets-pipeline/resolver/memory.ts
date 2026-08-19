import type { Lesson } from '../../engine/types';

/* ============================================================================
   LA MEMORIA DEL RESOLVER (VINZ_MON_RESOLVER_MEMORY_v1)

   🔷 «Usa VINZ_MON_RESOLVER_MEMORY_v1 come memoria di progetto persistente
      SOLO per il Creative Resolver.»

   Non e' Character Data. E' la memoria del GUSTO: cosa ha funzionato, cosa e'
   stato bocciato, quali proporzioni hanno reso, quali fallimenti si ripetono.
   Serve a far ragionare il resolver come un art director che conosce gia' i
   gusti di Vinz, invece che come un fonditore di campi.

   ============================================================================
   🔒 LE QUATTRO REGOLE, COME LE HA DETTE LUI. Non sono commenti: sono il
   confine di questo file, e ognuna ha un modo preciso di essere rotta.

   1. NON FINISCE MAI NEL PROMPT FINALE - ne' copiata, ne' riassunta, ne'
      accodata. Il prompt immagine descrive UNA creatura; questo documento
      descrive un metodo. Un modello di immagini che riceve «KAZUMA KANEKO -
      REJECTED» non sa che farsene, e le righe che contano le annega.

   2. I DATI GREZZI RESTANO CANONICI. La memoria decide COME risolvere i dati,
      non li sostituisce e non inventa tassonomia. Orienta le decisioni ancora
      LIBERE, non riscrive quelle gia' prese dal motore.

   3. IL COMPILATORE NON LA VEDE MAI. Riceve le decisioni gia' prese e le
      esprime, e non deve reinterpretare niente per conto suo.
      ⚠️ Questa non e' una promessa, e' una proprieta' dei tipi:
      `compilePrompt` del pacchetto prende `CharacterData` e
      `CreativeResolution` e basta. Non c'e' nessun parametro attraverso cui
      questo testo possa passare.

   4. SOLO IL RESOLVER. Non la voce, non la vecchia riscrittura dei prompt in
      `ai/promptCompiler.ts`. Quella riscrive un prompt esistente: darle una
      memoria di gusto vorrebbe dire farle cambiare decisioni che non e' lei a
      prendere.
   ============================================================================

   ⚠️ COSA COSTA, DETTO PRIMA CHE SI VEDA IN BOLLETTA: sono ~4.250 token in
   ingresso, su una chiamata che ne aveva ~1.600. L'ingresso pero' si LEGGE in
   parallelo, non si genera un token alla volta come l'uscita - quindi pesa
   sul prezzo molto piu' che sul tempo. E siccome questo blocco e' identico a
   ogni chiamata e sta per primo, aggancia la cache implicita del fornitore:
   dal secondo giro in poi costa un decimo.

   🔒 Il testo e' TRASCRITTO dal documento, non riassunto. Le tabelle sono
   diventate righe con le barre verticali perche' una tabella Word non
   sopravvive al passaggio, ma le celle sono quelle: le bias numeriche per DNA
   sono la parte piu' operativa del documento, e riassumerle vorrebbe dire
   buttare via proprio i numeri.
   ========================================================================= */

/** Il documento, parola per parola. Va in testa alla chiamata del resolver. */
export const RESOLVER_MEMORY = `
VINZ.MON
RESOLVER MEMORY v1
CHARACTER-DESIGN MEMORY PACK
Portable taste memory for the VINZ.MON Creative Resolver
SCOPE — This document contains only character-design knowledge that should influence the VINZ.MON Creative Resolver. It intentionally excludes game mechanics, app UI/product logic, travel/diet/work context, and superseded evolution/lineage systems.
1. What this memory is for
The Resolver should behave less like a field-merger and more like an art director who already understands Vinz's taste. Its job is to identify the character inside the raw data, protect character appeal, and sacrifice weaker visual ideas before the final prompt is written.
Use this memory as preference/context, not as taxonomy.
The Master Character System remains the canonical rules document.
This memory explains what has repeatedly worked, failed, been approved or rejected during visual testing.
When a new rule conflicts with an older preference note, the newer explicit project decision wins.
2. Core taste model
CHARACTER FIRST. The viewer should meet someone before classifying Family, Archetype, Affinity or Cultural DNA.
Characters should feel socially imaginable: someone Vinz could argue with, travel with, be annoyed by, laugh with and become attached to.
Charm is preferred over solemnity. Sophistication is welcome only if it does not erase personality.
Specificity beats generic coolness. One strangely exact feature is more valuable than five elegant secondary ideas.
Facial attitude, posture and proportional comedy are primary tools for appeal.
Fashion is important, but the character must not become a mannequin or editorial pose with taxonomy attached.
Cultural references should contaminate the design invisibly. If a reference is recognizable before the character, the translation is too literal.
Large graphic masses and silhouette hierarchy matter more than surface detail.
3. Permanent VINZ.MON identity preferences
3.1 Hair / bleach
Natural hair color: DARK BLOND.
Current identity is bleached: FULL BLEACH or PARTIAL BLEACH.
FULL BLEACH: platinum / almost-white dominates, with only minimal dark-blond regrowth at the deepest roots.
PARTIAL BLEACH: visible dark-blond roots/base transitioning clearly into platinum lengths/tips.
Never default to black hair.
When morphology does not support human hair, translate it into native anatomy: crest, fibers, feathers, tape, leaves, keratin, mechanical fins/panels, mane, fur-equivalent, etc.
Hair should normally be designed as a small number of strong silhouette masses, not realistic strands.
3.2 Eyewear
Eyewear is one of the strongest VINZ.MON identity anchors and should vary aggressively across Forms.
Do not default to round glasses.
Approved eyewear logics include: shield, wraparound/bug-eye, rimless/high-frame, ultra-narrow/sculptural, oversized editorial, asymmetric/mono, transparent/crystal, tinted, mirrored and integrated optics.
At low Humanoidity, eyewear should become anatomy or skull-integrated optical structures rather than a human accessory.
Eyewear should often occupy a meaningful percentage of the face and contribute to silhouette.
A successful eyewear solution should make the character more specific, not merely more fashionable.
4. Chromatic taste memory
VINZ.MON should use synthetic, high-energy, slightly artificial color relationships.
Preferred structure: ONE dominant base + ONE Acid Hero + ONE substantial contrast + optional micro accents.
Large graphic color fields are preferred to rainbow micro-detail.
Acid Hero should identify a major signature zone, frequently eyewear or signature anatomy.
Avoid tasteful monochrome fantasy palettes, bone/black/silver default palettes, and over-desaturation.
The successful Shark benchmark used deep cobalt + toxic yellow + hot magenta + electric cyan; this is a useful relationship model, not a mandatory palette.
5. Human-read and proportion preferences
For humanoid Forms, prefer youthful characterful proportions over adult runway-model proportions.
Slightly larger head, compact torso, expressive hands and enlarged feet often improve appeal.
High detail density must not automatically make the character older, more elegant or more severe.
Humanoidity is BODY PLAN, not realism. At 3/5 or below, the non-human component must structurally replace major human relationships, not merely alter skin/material.
At Humanoidity 3/5 or lower, at least TWO major body-plan relationships should become non-human: pelvis/torso architecture, limb attachment, locomotion, head/torso relation, hands/feet, shoulder geometry, etc.
For GIANT high-humanoidity Forms, a BARA-adjacent mass logic is approved as a size-specific option: larger torso/shoulders/arms/hands/feet and strong physical presence, while avoiding tiny-head bodybuilder anatomy.
6. Approved Character Design DNA memory
DNA | STATUS | MEMORY
KEN SUGIMORI | APPROVED / baseline favorite | Iconic clarity, compact coherent species-character construction, moderate simplification, every feature justified. Strong baseline for immediate readability.
GENNDY TARTAKOVSKY | APPROVED | Extreme mass contrast, directional geometry, negative space, action-readable silhouette, strong proportion changes.
AKIRA TORIYAMA | APPROVED | Friendly functional adventure construction, rounded usable forms, expressive faces, practical playful design.
CRAIG McCRACKEN | APPROVED | Radical economy, few shapes, extreme proportion, facial economy, silhouette/memory first. Must sacrifice concepts, not merely shrink them.
PENDLETON WARD | APPROVED but requires careful prompting | Elastic impossible morphology, few soft masses, anatomical weirdness. Must remain distinct from McCracken: Ward breaks body logic, Craig simplifies graphic logic.
TETSUYA NOMURA | APPROVED / very strong | Maximum hierarchical detail over youthful proportions. Layering, asymmetry, hardware and multiple detail scales without adult fashion-model drift.
JAMIE HEWLETT | APPROVED | Street attitude, irregular face geometry, loose posture, lanky or swaggering rhythm, expressive hands/feet, slightly abrasive charm.
KAZUMA KANEKO | REJECTED / inactive | Do not select.
BRIAN FROUD / HENSON | REJECTED / not part of active library | Do not select.
7. Numeric character-design habits that improved results
The strongest prompts did not use only qualitative language. They converted design intent into measurable constraints. The Resolver should continue doing this.
DNA | USEFUL NUMERIC BIAS | NOTES
Sugimori | Head ~1.10–1.20x; hands ~1.15–1.25x; feet ~1.20–1.45x; ~5–7 hair masses | 65–75% clean surfaces; 3–4 landmarks.
Genndy | Torso can compress ~0.60–0.80x; limbs ~1.20–1.35x; hands/feet ~1.35–1.60x | Opposing masses are more important than anatomical plausibility.
Toriyama | Head ~1.15–1.25x; torso ~0.80–0.95x; hands ~1.20–1.30x; feet ~1.35–1.55x | Friendly adventure rhythm.
Craig | Head ~1.25–1.40x; torso ~0.60–0.80x; hands ~1.20–1.35x; feet ~1.50–1.80x; eyewear ~35–55% face | Low density means deletion. Often 4–6 hair masses and very few systems.
Ward | Often head ~1.20–1.40x; limbs may become elastic tubes; body masses may merge | Use numbers to keep simplicity, but allow anatomical impossibility.
Nomura | Head ~1.10–1.20x; torso ~0.80–0.95x; hands ~1.15–1.30x; feet ~1.25–1.50x; hair ~7–10 masses | 4–5 clothing layers; 3–4 localized detail zones.
Hewlett | Head ~1.10–1.25x; arms/legs ~1.05–1.25x; hands ~1.20–1.35x; feet ~1.30–1.55x | Loose diagonal posture and irregular facial relationships matter more than perfect ratios.
8. What repeatedly produced strong characters
Write a mundane CORE PERSONALITY before anatomy or powers. Example pattern: "the guy who always knows a shortcut".
Reduce personality to ONE socially recognizable contradiction or caricature engine.
Make the character describable without taxonomy.
Use ONE dominant identity mass and 3–4 silhouette landmarks.
Give ONE proportional joke that is decisively visible: huge head, tiny torso, enormous feet, oversized bag, etc.
Give ONE over-specific feature that creates behavior, not just a cool visual mechanism.
Translate 2–3 personality behaviors directly into posture, anatomy or a signature mechanism.
Use explicit Detail Budget and a STOP condition at low density.
Use explicit Asymmetry Budget rather than making every part asymmetric.
Name important negative spaces and protect them from detail creep.
Run Silhouette Test, Memory Test and House-DNA Appeal Check before Visual DNA lock.
Appearance comes last and must not redesign morphology.
9. Failure memory / anti-patterns
FAILURE | WHAT IT LOOKS LIKE / CORRECTION
CREEPY BIOMORPH DRIFT | Too many organ/sac/multiple-eye/ritual-symmetry instructions before character appeal. Fix: simplify biology, enlarge social facial cues, prioritize posture and personality.
TAXONOMY CHECKLIST | Every field receives a separate body part or prop. Fix: merge, compress or make weaker fields behavior-only.
HUMANOIDITY IGNORED | Low Humanoidity produces a normal human with creature skin/parts. Fix: replace actual body-plan relationships.
FASHION MANNEQUIN | Alluring + Y2K + Nomura/fashion becomes an editorial figure. Fix: alluring first affects gaze, timing, confidence and awkwardness; preserve youthful proportions and mundane behavior.
COOL FEATURE INSTEAD OF CHARACTER FEATURE | A feature looks elegant but creates no behavior. Fix: give the feature an involuntary social/emotional consequence.
CONCEPT DUPLICATION | Eye/halo/knot/etc repeated across multiple zones. Fix: one primary manifestation + at most one subtle echo.
DETAIL DENSITY MISUSED | High density adds more unrelated concepts; low density keeps every concept but tiny. Fix: high density deepens surviving systems; low density deletes visual manifestations.
LITERAL CULTURAL DNA | Tarot becomes stars, myth becomes crowns, folklore becomes talismans everywhere. Fix: translate culture into behavior, transformation logic, color confidence, ritual habits or one subtle motif.
ADULT DRIFT | Humanoid characters become elegant mature adults. Fix: slightly larger head, compact torso, expressive hands/feet, youthful facial construction.
LORE-FIRST DESIGN | A viewer needs explanation to understand why the character is interesting. Fix: rewrite Core Personality and Memory Sentence before adding anything else.
10. Resolver rules learned from testing
CHARACTER CARICATURE RULE — Before anatomy, identify ONE mundane socially recognizable contradiction. Every major decision should reinforce it.
HUMANOIDITY BODY-PLAN RULE — At 3/5 or lower, explicitly name at least TWO human body-plan relationships that are replaced. Material change alone does not count.
BEHAVIORAL SPECIFICITY RULE — The ridiculous/over-specific feature must influence behavior, emotion or social interaction. If it only looks cool, it fails.
ONE CONCEPT / ONE PRIMARY MANIFESTATION — A visual idea gets one major zone and at most one subtle echo elsewhere.
DETAIL DENSITY = CONCEPT SURVIVAL — Low density removes visual concepts. High density increases construction depth inside selected concepts; it does not increase conceptual breadth.
FASHION CHARACTER TEST — If the design reads primarily as fashion after removing the pose, reduce elegance and increase character proportion, facial specificity or awkward behavior.
PERSONALITY-TO-BODY RULE — After Core Personality, select 2–3 behaviors and force them to change posture, proportion, anatomy or one signature mechanism.
SACRIFICE RULE — The Resolver is allowed and expected to compress, merge or visually suppress canonical fields when equal visibility would damage the character. Preserve conceptual truth, not equal screen time.
SILHOUETTE BEFORE INVENTORY — Name 3–4 silhouette landmarks before resolving secondary details.
SOCIAL READABILITY RULE — The final design must support ordinary emotions/actions such as embarrassment, irritation, excitement, boredom, vanity, affection and argument.
11. Character-design Cultural Memory
This is not a list to dump into every prompt. It is part of VINZ.MON's background taste. The Resolver should activate only a small subset per Form.
Final Fantasy / Kingdom Hearts - youthful adventure, layered fantasy construction, emotional-object logic.
Shaman King - conceptual human/spirit/object relationship, guardian entity, possession/interface logic; never copy characters or iconography.
Magical-girl transformation - transformation logic and state-change spectacle, not costume quotation.
Power Rangers - transformation confidence and object/action logic, not franchise silhouettes.
Y2K digital optimism - translucent materials, confident synthetic color, optimistic tech weirdness.
Club / rave / queer fashion image-making - attitude, confidence, eyewear, body image, chromatic energy; avoid turning every Form into editorial fashion.
Southern Italian / Neapolitan folklore and superstition - ritual habits, domestic signs, protection logic, inherited gestures; avoid literal icon dumping.
Yokai / strange sacred anatomy / cosmic beings - unfamiliar body logic when Family supports it; never at the expense of character appeal.
tarot / constellations / Greek myth - conceptual structures, fate, symbolism, relationships; avoid literal star/crown/arc shorthand unless specifically justified.
Robots / obsolete electronics - functional modules, translucent plastics, screens, dials, lived-in tech; keep behavior first.
Street / skate / bootleg graphics - useful especially for INK and street-character attitude.
Contemporary fashion and eyewear - strong source for optical construction, silhouette and styling; fashion remains subordinate to the individual.
12. Gold-standard example memory
12.1 Shark Courier / Craig McCracken - APPROVED benchmark
Core personality: convinced every route can be improved; useful, impatient, cocky, slightly exhausting.
Why it worked: personality existed before taxonomy.
Numeric clarity: head ~30–35% larger, huge eyewear, hands enlarged, feet ~60–70% wider, compact torso.
Exactly five major hair masses.
Huge messenger bag approximately torso volume as one Role-derived landmark.
Ridiculous feature: tiny electroreceptive filament pointing toward the nearest active phone.
Cultural DNA compressed mainly into attitude, color, eyewear, movement and bag scale.
Low density removed concepts rather than miniaturizing all of them.
Memory sentence could describe him without lore.
12.2 Nomura Shark Courier - APPROVED
High detail density succeeded after proportions were made more youthful.
Head slightly larger, torso compact, hands/feet emphasized; detail density remained 5/5.
Layering, hardware and asymmetry were concentrated in zones rather than distributed uniformly.
Lesson: maximum detail and youthful character appeal can coexist.
12.3 Hewlett test - APPROVED
Worked because face, posture, hands, feet and street attitude changed construction, not just surface rendering.
Loose diagonal posture and irregular facial geometry created a genuinely different territory from Sugimori/Nomura.
12.4 Rejected / weaker generated forms - lessons
Alien/Biomorph prompts became creepy when organ logic, multiple eyes, ritual symmetry and strange mouths arrived before character appeal.
Some Dragon/Plant/Archivist attempts became clever concept design but cold because Role and Cultural DNA each demanded separate anatomy.
Some low-Humanoidity prompts still resolved as fashionable humans. Structural body-plan replacement must be mandatory.
Some alluring/fashion prompts became adult editorial mannequins. Alluring should first change gaze, timing, confidence and awkwardness.
13. Character Critic checklist
Before the Resolver output is accepted, a critic pass should answer these questions. If any answer fails, rewrite the resolved design rather than merely commenting.
Can the personality be described without mentioning Family, Affinity, Role or Cultural DNA?
Is there one clear character caricature / social contradiction?
Is Humanoidity structurally visible in the body plan?
Does the over-specific feature create behavior?
Are any visual concepts duplicated across too many zones?
Does Detail Density control concept survival appropriately?
Has Fashion become more important than the character?
Is Cultural DNA being illustrated too literally?
Are only 3–4 primary silhouette landmarks competing for first read?
Does the design support at least 4–8 mundane emotional/social behaviors?
Can the Memory Sentence describe the character in one memorable line?
Does the final design still feel like VINZ.MON through hair/bleach, eyewear, color and attitude?
14. Scope guard - what is intentionally NOT in this memory
No gameplay rules, stats, combat systems, rarity mechanics beyond visual density implications.
No app UI, sprite companion, card layout, menus, progression screen or product theming.
No evolution tree, lineage, heritage percentage or previous-mindline inheritance.
No diet, travel, career, finance, household or unrelated personal context.
No obsolete project terminology that does not directly improve current character design.
`;

/**
 * Le impronte digitali della memoria: frasi che esistono SOLO qui dentro.
 *
 * 🔒 Servono al controllo automatico che verifica la regola numero 1. Il
 * confine fra memoria e prompt finale e' garantito dai tipi, ma i tipi non
 * proteggono da un modello che copia mezza tabella dentro un campo di testo
 * della risoluzione. Queste stringhe si'.
 */
export const MEMORY_FINGERPRINTS = [
  'KAZUMA KANEKO',
  'BRIAN FROUD',
  'REJECTED / inactive',
  'FASHION MANNEQUIN',
  'CREEPY BIOMORPH DRIFT',
  'Shark Courier',
  'USEFUL NUMERIC BIAS',
  'Portable taste memory',
  'Character Critic checklist',
];

/* ============================================================================
   LA MEMORIA CRESCIUTA: IL DOCUMENTO PIÙ QUELLO CHE GLI HAI INSEGNATO TU

   🔷 «Vorrei poter parlare con il resolver, così gli insegno io, e quello che
      gli insegno resta nella memoria anche se resetti.»

   ⚠️ LE LEZIONI VANNO IN CODA, E NON È UN DETTAGLIO DI IMPAGINAZIONE.

   Il fornitore mette in cache un PREFISSO: la parte iniziale identica fra una
   chiamata e l'altra. Il documento non cambia mai, le lezioni cambiano ogni
   volta che ne aggiungi una. Mettendole prima, il prefisso cambierebbe a ogni
   lezione nuova e la cache non aggancerebbe MAI: stesso codice, dieci volte
   il prezzo, nessun errore.

   In coda: le prime ~4.250 parole restano identiche e costano un decimo,
   e solo la parte tua si paga piena.

   🔒 E VALGONO LE STESSE QUATTRO REGOLE del documento — non sono un canale
   privilegiato per aggirarle. Una lezione orienta COME si decide; non
   sostituisce i dati generati, non inventa tassonomia, e non finisce nel
   prompt immagine.
   ========================================================================= */


export function resolverMemoryWith(lessons: readonly Lesson[]): string {
  if (lessons.length === 0) return RESOLVER_MEMORY;

  const righe = lessons
    .map((l, i) => `L${i + 1}. ${l.text}`)
    .join('\n');

  return `${RESOLVER_MEMORY}

15. Lessons taught directly by Vinz
These were added by Vinz after the document above, during real use. They are
the most recent expression of his taste: when one of them conflicts with an
older preference note above, THIS SECTION WINS — the document itself says the
newer explicit project decision wins.
They remain preferences about HOW to resolve, exactly like the rest of this
memory. They never replace generated Character Data, never introduce new
taxonomy, and never appear in the final image prompt.
${righe}`;
}
