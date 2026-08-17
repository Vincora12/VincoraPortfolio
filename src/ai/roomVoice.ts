/* ============================================================================
   SCRIVERE UN POST DELLA STANZA (§21.4)

   🔒 DUE REGOLE, E SONO LE STESSE DEL NARRATORE.

   1. PUÒ INVENTARE LE PAROLE, MAI I FATTI. Riceve il campo `about` del post —
      cosa è successo davvero — e lo trasforma in una battuta. Non aggiunge
      eventi, non inventa incontri, non fa succedere niente di nuovo.

   2. NON PARLA CON VINCENZO. Sono forme che parlano fra loro. Nessun consiglio,
      nessun «bravo», nessun «dovresti». Lui legge e basta: se lo interpellassero
      il filo diventerebbe una chat di gruppo, e le entità non sarebbero più una
      sola.

   ⚠️ E POSSONO NON ESSERE D'ACCORDO. Sono tutti lui: se andassero tutti
   d'accordo sarebbe dodici volte la stessa voce, ed è il modo più veloce di
   rendere insopportabile questa cosa. Quello di marzo ha visto un Vincenzo che
   quello di ottobre non riconosce, e va lasciato dire.

   Le regole di tono di §28 restano, ma valgono VERSO DI LUI: nessuna colpa,
   nessun addio, nessuna serie da difendere. Fra loro possono pungersi.
   ========================================================================= */

import { ask } from './backend';
import type { BackendFailure } from './backend';
import type { MonRecord } from '../engine/types';
import type { RoomPost } from '../engine/room';

/** Un post è una battuta, non un tema. Oltre, si sbrodola. */
const MAX_POST_CHARS = 220;
const MAX_COMMENT_CHARS = 160;

/** Come si presenta una creatura a chi deve darle la voce. */
function whoIs(rec: MonRecord): string {
  const d = rec.data;
  return [
    `${d.name} — ${d.family} / ${d.family_archetype}, affinity ${d.affinity}, ${d.size}.`,
    `Temperamento ${d.mood_primary}${d.mood_secondary ? ` con ${d.mood_secondary}` : ''}.`,
    `Parla come: ${d.voice_preset}.`,
    `È ${d.character_dna.traits.join(', ')}. Vuole ${d.character_dna.drives.join(' e ')}.`,
    `Quando non sa cosa fare, ${d.character_dna.body_language}.`,
    `È stato la forma attiva dal giorno ${d.generated_at_day}.`,
  ].join(' ');
}

const RULES = [
  'Sono forme che VINZ.MON ha attraversato. Adesso vivono nel dex e parlano fra loro.',
  '',
  'REGOLE, in ordine di importanza:',
  '1. Puoi inventare le parole, MAI i fatti. Parti da quello che è successo e basta.',
  '2. Non ti rivolgi mai a Vincenzo. Lui legge, non partecipa. Niente consigli, niente incoraggiamenti, niente «dovresti».',
  '3. Non date colpe a Vincenzo per come è andata una giornata o una settimana.',
  '4. Potete non essere d’accordo fra voi. Chi ha vissuto un periodo diverso ha visto un Vincenzo diverso, e può dirlo.',
  '5. Italiano. Niente emoji. Niente hashtag.',
  `6. Il post sta in ${MAX_POST_CHARS} caratteri. Ogni commento in ${MAX_COMMENT_CHARS}.`,
  '',
  'FORMATO della risposta, esatto:',
  'POST: <il testo>',
  '<NOME>: <il commento>',
  '<NOME>: <il commento>',
  '',
  'Una riga per commento, nell’ordine in cui te li ho elencati. Nient’altro.',
].join('\n');

export interface WrittenPost {
  text: string;
  comments: { from: string; text: string }[];
}

export interface WriteOutcome {
  post: WrittenPost | null;
  failure: BackendFailure | null;
}

/**
 * Scrive un post e i suoi commenti in UNA chiamata.
 *
 * Una chiamata per commento costerebbe quattro volte tanto e — peggio — ogni
 * voce scriverebbe senza sapere cosa hanno detto le altre, che è esattamente
 * quello che fa sembrare finta una conversazione.
 */
export async function writeRoomPost(
  token: string | null,
  post: RoomPost,
  author: MonRecord,
  voices: readonly MonRecord[],
): Promise<WriteOutcome> {
  const cast = voices.map((v) => whoIs(v)).join('\n');

  const user = [
    `COSA È SUCCESSO: ${post.about}`,
    '',
    `CHI PUBBLICA:\n${whoIs(author)}`,
    voices.length > 0 ? `\nCHI COMMENTA, in quest’ordine:\n${cast}` : '\nNESSUNO COMMENTA: la stanza è vuota. Scrivi solo il POST.',
  ].join('\n');

  const res = await ask(token, {
    capability: 'character-voice',
    system: [{ text: RULES, cache: true }],
    user,
    maxTokens: 600,
  });

  if (!res.data) return { post: null, failure: res.failure };

  const parsed = parseRoomReply(res.data.text, voices.map((v) => v.data.name));
  return parsed ? { post: parsed, failure: null } : { post: null, failure: 'error' };
}

/**
 * Legge la risposta.
 *
 * ⚠️ Volutamente indulgente: se il modello sbaglia una riga si perde quel
 * commento, non tutto il post. Un parser severo qui trasformerebbe una
 * sbavatura di formato in una schermata vuota.
 */
export function parseRoomReply(raw: string, expected: readonly string[]): WrittenPost | null {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const postLine = lines.find((l) => /^POST\s*:/i.test(l));
  const text = postLine?.replace(/^POST\s*:/i, '').trim();
  if (!text) return null;

  const comments: { from: string; text: string }[] = [];
  for (const line of lines) {
    if (line === postLine) continue;
    const at = line.indexOf(':');
    if (at <= 0) continue;

    const name = line.slice(0, at).trim();
    const body = line.slice(at + 1).trim();
    if (body.length === 0) continue;

    // Solo chi era davvero nella lista: il modello non aggiunge partecipanti.
    const match = expected.find((e) => e.toUpperCase() === name.toUpperCase());
    if (!match) continue;
    if (comments.some((c) => c.from === match)) continue;

    comments.push({ from: match, text: body.slice(0, MAX_COMMENT_CHARS) });
  }

  return { text: text.slice(0, MAX_POST_CHARS), comments };
}
