/* ============================================================================
   I PROMPT DEGLI ASSET DERIVATI — TEMPLATE TECNICI, NON DESIGN

   🔷 «Il Character Master è la decisione visiva. Gli asset derivati la
      conservano e la mettono in scena.»

   ════════════════════════════════════════════════════════════════════════════
   COM'ERA, E PERCHÉ ERA SBAGLIATO

   Dopo il master, ogni altro asset riceveva di nuovo TUTTO: Family, Archetipo,
   Affinità, Taglia, Ruolo, Fashion, umore, Character DNA, Cultural DNA,
   Character Design DNA, capelli, occhiali, palette, rarità, regole di casa.
   Sedicimila caratteri, gli stessi del master, più una riga in cima che
   diceva «comunque vince l'immagine allegata».

   Due danni, e il secondo è peggiore del primo.

   1. SI PAGAVA DUE VOLTE LA STESSA COSA. Il ragionamento creativo era già
      stato fatto — dal Resolver, con il modello grande — e finiva nel master.
      Rimandarlo per intero altre cinque volte non aggiungeva una decisione.

   2. SI INVITAVA A RIDECIDERE. Un modello che riceve un briefing completo di
      character design fa character design: è quello che il testo gli chiede.
      Poi la riga sul riferimento gli dice di non farlo. Gli davamo un ordine e
      il suo contrario, e il risultato dipendeva da quale dei due pesava di più
      quel giorno — che è esattamente il motivo per cui le sei immagini non si
      somigliavano.

   🔒 ADESSO L'INFORMAZIONE STA NELL'IMMAGINE, NON NEL TESTO. Il master viene
   allegato davvero (`generate.ts` → `assetBase64`), e il testo che lo
   accompagna dice solo la trasformazione di produzione da fare. Poche righe,
   nessuna tassonomia, nessuna interpretazione culturale, nessun designer.

   ⚠️ QUELLO CHE QUESTI TEMPLATE NON DEVONO MAI CONTENERE: Family, Archetipo,
   Affinità, Ruolo, Fashion, umore, Character DNA, Cultural DNA, il designer,
   la rarità, l'anatomia, i capelli, gli occhiali, la palette. Non perché siano
   sbagliati — perché sono GIÀ DECISI, e ripeterli è un invito a rifarli.
   `verify:package` lo verifica cercando quelle parole qui dentro.
   ════════════════════════════════════════════════════════════════════════════

   🔒 DETERMINISTICI. Nessuna chiamata a un modello di testo: sono `const` con
   dentro solo la grammatica dell'asset. Chiamare un'AI per riscrivere una
   frase che il programma conosce già è la definizione di spesa senza valore.

   🔒 E SOLO PER LE CREATURE NUOVE. Un .mon nato prima ha i suoi prompt
   compilati e §29 dice che una creatura tiene la versione con cui è nata:
   `promptFor` decide quale strada, e questa vale quando c'è una risoluzione e
   il master esiste davvero.
   ========================================================================= */

import type { AssetType } from '../engine/types';
import { EXPRESSION_SPEC, assetTypeDef } from '../engine/assets';

/**
 * La testata comune: identità bloccata, e cosa non si tocca.
 *
 * ⚠️ È l'unica parte che si ripete in tutti e cinque, e si ripete apposta.
 * Ogni template dice cosa CAMBIARE; senza una riga che dica cosa NON cambiare,
 * «cambia l'inquadratura» viene letto come permesso di rifare il resto.
 */
const BLOCCO = [
  'The attached image is the CHARACTER MASTER CEL of this character.',
  'It is the exact and only source of visual truth. This is the SAME character.',
  '',
  'PRESERVE EXACTLY, without reinterpretation:',
  'identity, face construction, anatomy, proportions, silhouette,',
  'hair or hair-equivalent, eyewear, clothing, accessories, colours,',
  'materials, and every distinctive identity detail.',
  '',
  'Do not redesign. Do not reinterpret. Do not add details that are not in the',
  'reference. Do not remove details that are in the reference.',
].join('\n');

/** La coda comune: cosa non deve comparire nel file. */
const CODA = 'No text, no labels, no watermark, no frame borders, no signature.';

/* --- I tre lavori di produzione -------------------------------------------- */

const LAVORO: Partial<Record<AssetType, string[]>> = {
  character_toy: [
    'PRODUCTION TASK: turn this exact CEL character into its definitive collectible TOY version.',
    'This TOY is the principal image of the character throughout the product.',
    'Preserve the exact silhouette, anatomy, face, outfit, colours and identity markers.',
    'Translate only the rendering and materials into a premium physical collectible toy.',
    'Full body, centred, completely visible, generous margins.',
    'Pure optical white (#FFFFFF) seamless background. No environment or decorative scene.',
  ],

  /* §22.2 04 — la griglia delle espressioni. L'ordine è indicizzato per
     posizione dall'app: non è una preferenza, è un contratto. */
  reaction_pack: [
    'PRODUCTION TASK: expression sheet of this character.',
    `One sheet, ${EXPRESSION_SPEC.frames} frames, strict ${EXPRESSION_SPEC.columns} columns x ${EXPRESSION_SPEC.rows} rows grid,`,
    'read left-to-right, top row first. The frame order is FIXED and must not be rearranged:',
    ...EXPRESSION_SPEC.order.map((e, i) => `${String(i + 1).padStart(2, '0')} ${e}`),
    '',
    'Only the facial expression and very small body language change between frames.',
    'Identical bust framing, identical scale, identical eye line in every frame.',
    'Transparent background. Even margins. The sheet must split into',
    `${EXPRESSION_SPEC.frames} equal frames of identical dimensions.`,
  ],

  /* §42 / GB §12 — il doodle è un cambio di MEZZO, non di creatura. */
  bio_doodle: [
    'PRODUCTION TASK: sketchbook translation of this character.',
    'This is a change of MEDIUM, not a redesign.',
    'Same character, drawn as a quick personal-notebook sketch: visible pencil or',
    'ballpoint line, loose construction lines left in, flat or absent colour,',
    'the feeling of something drawn in a margin rather than finished.',
    '',
    'Morphology, outfit and identity markers stay exactly as in the reference.',
    'Do not invent a different creature. Do not replace the outfit.',
    'Only the drawing treatment changes.',
    'Opaque paper-white background.',
  ],
};

/**
 * Il prompt tecnico di un asset derivato, o `null` se non ne ha uno.
 *
 * 🔒 `null` per il CHARACTER MASTER, e non è un caso mancante: il master è
 * quello che DECIDE, e la sua strada è il Resolver. Un template tecnico per lui
 * sarebbe un personaggio senza nessuno che l'ha pensato.
 */
export function derivedPrompt(assetType: AssetType): string | null {
  const lavoro = LAVORO[assetType];
  if (!lavoro) return null;

  return [BLOCCO, '', lavoro.join('\n'), '', `OUTPUT: ${assetTypeDef(assetType).size}.`, CODA].join(
    '\n',
  );
}

/** Gli asset che hanno un template tecnico. Serve ai controlli e a DEV. */
export function derivedCovers(): AssetType[] {
  return (Object.keys(LAVORO) as AssetType[]).filter((t) => LAVORO[t] !== undefined);
}
