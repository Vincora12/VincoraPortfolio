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
    'Use the attached image as the MASTER VISUAL REFERENCE.',
    '',
    'Transform the subject into a high-quality physical collectible toy / designer figure, while preserving the original character design as faithfully as possible.',
    '',
    'PRESERVE EXACTLY',
    '',
    'Keep all defining visual characteristics from the reference image:',
    '',
    '* overall silhouette',
    '* body proportions',
    '* head-to-body ratio',
    '* anatomy',
    '* pose and gesture',
    '* facial expression',
    '* face construction',
    '* eyes and eyewear',
    '* hairstyle, hair volume and hair color',
    '* horns, ears, tails, wings, appendages or unusual anatomy',
    '* clothing design',
    '* clothing volumes',
    '* footwear',
    '* accessories',
    '* palette',
    '* graphic markings',
    '* distinctive identity features',
    '* asymmetries',
    '* unusual or exaggerated proportions',
    '',
    'Do not redesign, reinterpret, simplify, beautify, normalize or replace any element unless necessary to translate it into a physical toy.',
    '',
    'TOY TRANSLATION',
    '',
    'Translate the existing design into a believable premium collectible figure.',
    '',
    'The subject should feel physically manufactured rather than simply rendered in 3D.',
    '',
    'Use:',
    '',
    '* solid sculpted volumes',
    '* clean manufactured surfaces',
    '* premium vinyl / PVC / ABS toy-material logic',
    '* subtle material variation between skin, fabric, plastic, rubber, metal or translucent elements when relevant',
    '* carefully molded hair and clothing',
    '* simplified but faithful physical construction',
    '* precise painted details',
    '* subtle seams only where believable for a manufactured collectible',
    '* rounded physical edges where required by production',
    '* convincing thickness for thin illustrated elements',
    '* stable believable toy construction',
    '',
    'Preserve the original design language even when converting flat illustrated shapes into three-dimensional forms.',
    '',
    'Do not make it look like a realistic human, CGI movie character, action-game render or generic 3D cartoon.',
    '',
    'It must read immediately as the exact same character transformed into a collectible toy.',
    '',
    'RENDER',
    '',
    'Create a polished studio product photograph of the finished collectible figure.',
    '',
    '* full character visible',
    '* centered composition',
    '* clean professional product photography',
    '* soft diffused studio lighting',
    '* subtle grounding shadow',
    '* realistic physical scale',
    '* crisp sculptural detail',
    '* premium collectible presentation',
    '* no packaging',
    '* no props unless they belong to the original character',
    '* no text',
    '* no logo',
    '* no pedestal unless structurally necessary',
    '',
    'BACKGROUND',
    '',
    'Use a completely clean optical white background:',
    '',
    'pure neutral white, bright and seamless, with no cream, beige, warm gray, visible horizon, environment or decorative elements.',
    '',
    'The final image should look like a professionally photographed designer toy on a pure white studio cyclorama.',
    '',
    'Priority order:',
    '',
    '1. preserve the original character',
    '2. preserve silhouette and proportions',
    '3. preserve pose and identity details',
    '4. translate the design into believable toy construction',
    '5. achieve premium studio-product realism',
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

  /* Il prompt Toy è stato approvato come testo completo: non aggiungiamo
     prefissi o code automatiche che ne cambierebbero priorità e significato. */
  if (assetType === 'character_toy') return lavoro.join('\n');

  return [BLOCCO, '', lavoro.join('\n'), '', `OUTPUT: ${assetTypeDef(assetType).size}.`, CODA].join(
    '\n',
  );
}

/** Gli asset che hanno un template tecnico. Serve ai controlli e a DEV. */
export function derivedCovers(): AssetType[] {
  return (Object.keys(LAVORO) as AssetType[]).filter((t) => LAVORO[t] !== undefined);
}
