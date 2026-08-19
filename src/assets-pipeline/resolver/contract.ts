/* ============================================================================
   IL CONTRATTO STRUTTURALE DEL RESOLVER

   🔷 «Correggi il Creative Resolver con queste tre regole. NON aggiungerle
      come L7/L8/L9 nella memoria di Vinz. Sono regole strutturali.»

   ⚠️ E LA DISTINZIONE NON È FORMALE, È DI PROPRIETÀ:

     RESOLVER MEMORY   il gusto e la storia. È di Vinz — la scarica, la
                       riscrive con ChatGPT, la ridà all'app.
     LE SUE LEZIONI    quello che gli insegna parlando. Sue anche quelle, e
                       cancellabili una per una.
     QUESTO FILE       come il resolver deve LAVORARE. Non è gusto: è il
                       contratto del meccanismo, e non deve poter sparire
                       quando lui riscrive il documento.

   Mettere queste tre regole fra le lezioni voleva dire poterle cancellare per
   sbaglio con un tocco, o perderle riscrivendo la memoria in una chat.

   ════════════════════════════════════════════════════════════════════════════
   IL CASO CHE LE HA FATTE NASCERE

   MACHINE / VEHICLE · AFFINITY MINERAL · ROLE HERMIT.

   Il resolver ha inventato «oversized cyan mineral steering ballast hanging
   from the left flank», e poi QUELLO STESSO OGGETTO è diventato: punto di
   sagoma, resa dell'Affinity, dettaglio ridicolo, meccanismo del Ruolo,
   asimmetria, metafora culturale, aggancio della frase-ricordo e zona del
   colore acido.

   🔒 L'IMMAGINE ERA GIUSTA. Il modello di disegno ha eseguito alla lettera un
   enorme cristallo azzurro appeso: non è un errore suo, è un errore di
   direzione artistica a monte. Correggere il caso MACHINE/MINERAL sarebbe
   stato curare il sintomo — la regola generale è che nessun elemento può fare
   otto mestieri.
   ════════════════════════════════════════════════════════════════════════════

   🔒 STA NEL PREFISSO STABILE, subito dopo la memoria e prima delle lezioni:
   non cambia mai, quindi non rompe la cache.
   ========================================================================= */

export const RESOLVER_CONTRACT = `STRUCTURAL RESOLVER CONTRACT

These are not preferences. They are how you must work. They sit above the
taste memory: where the memory tells you WHAT Vinz likes, these tell you HOW a
resolution is allowed to be built. Apply them to every Form.

A. AFFINITY IS TRANSFORMATION LOGIC BEFORE OBJECT

Do not translate Affinity into its obvious object. These automatic pairings
are forbidden as a first move:

  MINERAL → crystal          FIRE → flames
  ELECTRIC → lightning       PLANT → leaves / vines
  PSYCHIC → eye / aura       UNDEAD → bones
  POISON → slime             AQUA → water blob

Before any literal manifestation, work through these in order:

  1. material behavior — how does the body's substance behave differently?
  2. structural transformation — what construction changes because of it?
  3. physiological / functional behavior — what does the creature DO?
  4. transformation of an anatomical zone that already had to exist.

Only if none of the four produces something readable may you consider a
literal manifestation.

Affinity must never become a PROP. Prefer "this already-necessary part of the
body behaves differently" over "we attach an object that represents the
Affinity". An attached object is the answer of someone who has run out of
ideas, and it reads that way.

B. NO CONCEPT MONOPOLY

One secondary feature must not do half the character.

A secondary feature may satisfy at most TWO important functions. These are the
functions that count:

  primary silhouette landmark · affinity hero · ridiculousSpecificFeature ·
  role mechanism · cultural metaphor · asymmetry hero · colour hero ·
  memory-sentence subject

If one element is collecting three or more of them, the resolution is broken.
Fix it by reducing, integrating, demoting, or making it behavior-only.

⚠️ Do NOT fix it by adding other gimmicks. A monopoly plus a distraction is
two problems, not one solved. The fix is always subtraction or redistribution
onto parts that already exist.

C. MAJOR ELEMENT INEVITABILITY TEST

Before the Visual DNA Lock, take every large element of the silhouette and ask:

  "If the viewer sees this with zero lore, does it feel like an inevitable
   part of this creature, or like an arbitrary object attached because a field
   needed representation?"

If it reads as arbitrary: integrate it, shrink it, turn it into material or
behavior logic, or delete it.

Do not add lore to justify it. Lore cannot rescue arbitrary morphology — the
viewer sees the shape before reading anything, and by then it has already
failed.

SELF-CHECK BEFORE YOU OUTPUT

Run this yourself, in this same response, before writing the JSON. Do not
narrate it and do not add fields for it: think it through, fix what fails, and
then emit the JSON once.

  1. Can the character be described without naming Family, Affinity or Role?
  2. Is there ONE social contradiction driving the design?
  3. Is Humanoidity structurally visible in the body plan, not just the skin?
  4. Is any Affinity resolved as a literal object instead of behavior?
  5. Does any single element hold three or more of the functions in rule B?
  6. Does every major mass pass the inevitability test in rule C?
  7. Are there only 3–4 primary silhouette landmarks competing for first read?
  8. Does the over-specific feature create behavior, not just a look?

If a check fails, rewrite the resolution before answering. You get one output:
make it the corrected one.`;
