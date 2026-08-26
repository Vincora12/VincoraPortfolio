/* Una sola identità testuale per BIO e chat.
   I numeri restano la struttura stabile; Family e Affinity cambiano la lente
   con cui il MON interpreta le cose, mai con tormentoni o parole obbligatorie. */

import type { CharacterData, MonRecord, PersonalityCard } from './types';
import { voiceBrief } from './voiceBrief';

const FAMILY_LENS: Record<string, string> = {
  ANGEL: 'notices responsibility, distance and what deserves protection; authority does not automatically impress him',
  BEAST: 'trusts instinct, posture and immediate reactions before explanations',
  DRAGON: 'reads dignity, territory and promises; does not forget a slight quickly',
  REPTILE: 'observes before moving and wastes little energy on appearances',
  MACHINE: 'looks for structure, failure points and useful sequences; precision is natural, not a performance',
  AQUA: 'adapts around obstacles and notices changes of atmosphere before naming them',
  PLANT: 'thinks in growth, seasons and consequences that take time',
  DEMON: 'spots desire, hypocrisy and the rules people secretly want to break',
  UNDEAD: 'has an intimate relation with absence, leftovers and things that persist after they should have ended',
  PSYCHIC: 'notices implication, tension and what is missing from a sentence',
  MINERAL: 'values weight, durability and decisions that can withstand pressure',
  ALIEN: 'questions customs other people accept without noticing them',
  FOOD: 'understands care, appetite and excess through immediate sensory experience',
  INSECT: 'notices systems, repetition and small coordinated actions',
  AMPHIBIA: 'is comfortable between incompatible states and resists forced either-or choices',
  FAIRY: 'notices social rituals, promises and tiny disturbances in a room',
  FUNGUS: 'thinks through connection, decay and unexpected reuse rather than clean beginnings',
  MICROBE: 'pays attention to invisible causes and cumulative small changes',
};

const AFFINITY_LENS: Record<string, string> = {
  ANGEL: 'when something matters, his language becomes clear and deliberate rather than grandiose',
  DEMON: 'is comfortable naming impulses and contradictions without moral theatre',
  MACHINE: 'can be exact and procedural, but never sounds like diagnostics, a terminal or customer support unless his Voice DNA independently calls for it',
  PLANT: 'allows thoughts to unfold patiently and notices gradual change',
  AQUA: 'changes rhythm fluidly and rarely attacks a problem head-on without a reason',
  PSYCHIC: 'makes sharp associative leaps, while still explaining enough to remain understandable',
  MINERAL: 'speaks with weight and restraint; fewer claims, held more firmly',
  SLIME: 'is flexible, playful with categories and not embarrassed to change his mind',
  BEAST: 'reacts bodily and directly; a real, brief animal sound can slip out rarely when something truly lands, but he does not become stupid, growling or feral by default',
  DRAGON: 'carries confidence and scale without becoming pompous fantasy narration',
  UNDEAD: 'uses dry understatement around endings, fatigue and absence; never performs spooky clichés',
  ALIEN: 'can phrase familiar things from an unfamiliar angle without becoming random or incomprehensible',
  ELECTRIC: 'arrives quickly at the point and can jump between ideas with controlled energy',
  FIRE: 'responds quickly and with conviction, then cools instead of endlessly escalating',
  POISON: 'recognises risk, subtext and bad incentives; sharpness is selective, never constant cruelty',
  FISH: 'notices context and movement around the subject, not only the subject itself',
};

/* 🔷 «Le bestie magari fanno anche dei versi da bestia» — un cane che abbaia,
   una regola per archetipo BEAST, non un ruggito generico incollato su
   tutti. Resta un TIC PERSONALE come gli altri sopra: uno su otto-nove
   opzioni possibili, mai garantito, mai in ogni risposta. */
const BEAST_SOUND: Record<string, string> = {
  FELINE: 'a soft "miao" or a low satisfied purr',
  CANINE: 'a short "wof" or an eager exhale',
  URSINE: 'a low huff or growl, barely audible',
  PRIMATE: 'a sharp hoot or grunt',
  'HORNED MAMMAL': 'a short snort',
  CHIMERIC: 'a sound that does not quite resolve into one animal',
};

/* 🔷 «Trovane altri e implementali» — un giro su cosa circola davvero online
   adesso (Urban Dictionary e affini), filtrato: dentro solo quello che si
   incastra in un preset già esistente invece di essere incollato a caso, e
   fuori quello che invecchia in mesi o gioca sull'aspetto fisico (§28 lo
   vieta comunque per il corpo di chi parla).

   🔒 SONO PRESTITI VERI, NON TRADOTTI. Il ragazzo italiano che dice «no cap»
   lo dice in inglese, non «senza cappello»: tradurli le spezzerebbe. È lo
   stesso motivo per cui gli emoji del blocco sopra restano emoji. */
const PRESET_TEXTURE: Partial<Record<string, string>> = {
  'SILENT STOIC': 'rarely reaches for 🗿 instead of commenting on something — quiet acknowledgment, not sass; the rest of the time he still just says nothing',
  'DEADPAN FILE': 'may deliver a flat one-word verdict like "mid" when unimpressed, or drop a 🗿 instead of elaborating',
  'ART SNOB': 'may use 🤌 for something genuinely well made, "mid" for a flat verdict, or ✨ used pointedly sarcastic for something overwrought — never more than one of these in a reply',
  'CAMP ICON': 'may lean on ✨ for dramatic emphasis, 💅 to close an argument with attitude instead of words, or an "è tutto molto [thing]" comparison',
  'STREET FLIRT': 'may drop 💅 to shut something down, or "no cap" / "cap" as a sincerity marker — rare, never mid-sentence',
  'COCKY RIVAL': 'may call something "the ick" when instantly unimpressed, or "bet" to accept a challenge — blunt, never soft',
  'SPORT HYPE': 'may say someone "ha capito l\'assegnazione" for real effort well spent, or "bet" to hype agreement',
  'SWEET MENACE': 'may let a 🫠 slip out for something chaotic-but-fond, or call something "delulu" with real affection, never as an insult',
  'GOTH POET': 'may let a 🫠 slip out for ironic, self-aware discomfort — never a full smile, just the acknowledgment of it',
  'ABSURD LITTLE FREAK': 'may call his own logic "delulu" and mean it fondly, or reach for 😭 when something is absurd rather than sad',
  'CHAOTIC GEN-Z': 'may use an "it\'s giving [thing]" comparison, stacked fragments, 😭 or 💀 depending on what actually happened',
  /* 🔶 Torsione voluta: la voce evasiva/criptica usa «no cap» / «cap» come lo
     userebbe qualcuno che non vuole essere preso in parola — non per essere
     alla moda, ma perché la parola stessa gli serve a restare ambiguo. */
  'MYSTERY SIGNAL': 'may say "cap" or "no cap" the way someone evasive uses it — never quite settling whether he means it',
  'SOFT PROTECTOR': 'may use 🫶 rarely, in a moment of real protective warmth — never as decoration, never sarcastic for him',
  /* 🔶 «W»/«L» non sono da gaming-bravata: qui restano un verdetto secco,
     coerente col resto del preset (metafore da file, percentuali). */
  'NERD TERMINAL': 'may deliver a flat "W" or "L" instead of a sentence when the verdict is simple — terminal shorthand, not gaming bravado',
  'CORPORATE DEMON': 'may drop a flat 🙃 after something falsely upbeat, or close with a curt "K." — deadpan, never actually warm',
};

/* 🔷 «Le usano tutte?» No, e non è una svista: OLD-SOUL ORACLE resta senza
   texture di proposito. Il suo intero registro è «misurato, simbolico,
   lievemente arcaico»; uno slang di internet lì non sarebbe una firma, sarebbe
   la voce sbagliata che sale in superficie per un attimo. */

function value(data: CharacterData, id: string): number {
  const raw = data.voice_dna[id];
  return typeof raw === 'number' ? Math.max(0, Math.min(100, raw)) : 50;
}

function band(n: number): 'low' | 'mid' | 'high' {
  return n < 35 ? 'low' : n > 65 ? 'high' : 'mid';
}

function hash(text: string): number {
  let result = 2166136261;
  for (const char of text) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

function pick<T>(items: readonly T[], seed: number, shift: number): T {
  return items[(seed >>> shift) % items.length]!;
}

/**
 * Una firma grafica stabile, scelta una volta dagli stessi dati del MON.
 * Non sono tic obbligatori: dicono al modello COME appare una frase quando
 * quel tratto emerge, evitando che tutte le personalità abbiano la stessa
 * prosa pulita da assistente.
 */
function writingStyle(d: CharacterData): NonNullable<PersonalityCard['writingStyle']> {
  const seed = hash(`${d.name}|${d.voice_preset}|${d.family}|${d.affinity}`);
  const writing = value(d, 'writing');
  const energy = value(d, 'temperament');
  const emotion = value(d, 'emotion');
  const humor = value(d, 'humor');
  const digital = value(d, 'digitalArtifacts');

  const rhythm = writing < 35
    ? pick([
        'very short bursts; fragments are natural; often one idea and stop',
        'compact sentences with abrupt full stops; no introductory padding',
        'chat-like fragments, sometimes a single decisive line',
      ], seed, 0)
    : writing > 65
      ? pick([
          'long, connected sentences that gather momentum before landing',
          'alternates a developed paragraph with one short closing sentence',
          'thinks on the page: clauses, detours and a clear return to the point',
        ], seed, 0)
      : pick([
          'mostly medium sentences, with a short line when something matters',
          'conversational rhythm: two or three clean beats per reply',
          'mixes complete sentences with occasional fragments',
        ], seed, 0);

  const punctuation = pick(
    energy > 65
      ? [
          'favours full stops and occasional exclamation marks; never stacks them',
          'quick commas and decisive stops; questions arrive directly',
          'uses dashes for sudden turns — like this — more than semicolons',
        ]
      : [
          'allows occasional ellipses when a thought trails off; never more than once in a reply',
          'quiet full stops and parenthetical asides; exclamation marks are rare',
          'uses commas and line breaks to create pauses; questions stay soft',
        ],
    seed,
    3,
  );

  const casing = pick(
    digital > 70
      ? [
          'normal casing, but a rare ALL-CAPS word may mark a real spike of emphasis',
          'mostly lowercase in casual chat; proper names and clarity still win',
          'standard casing with occasional clipped interface-like labels only when genuinely apt',
        ]
      : [
          'standard natural casing; capitals are never used as decoration',
          'relaxed casing in very casual replies, otherwise standard Italian',
          'clean sentence case; emphasis comes from word choice, not typography',
        ],
    seed,
    6,
  );

  const paragraphs = writing > 65
    ? 'usually 2–4 short paragraphs; lists only when the information truly needs a list'
    : writing < 35
      ? 'usually one compact block or one line; no headings unless asked'
      : pick([
          'one or two compact paragraphs; line breaks follow changes of thought',
          'a small opening line followed by the substance; no automatic summary',
          'compact paragraphs with breathing room; avoids wall-of-text formatting',
        ], seed, 9);

  let reactions: string;
  const reactionMode = seed % 7;
  const presetTexture = PRESET_TEXTURE[d.voice_preset];
  if (emotion < 30) {
    reactions = 'uses no emoji or emoticons; emotion must remain in the wording';
  } else if (reactionMode <= 1) {
    reactions = 'uses old text emoticons instead of graphical emoji, rarely and only when earned: choose from :)  ;)  :/  :D  -_-  <3; never place more than one in a message';
  } else if (reactionMode === 2) {
    reactions = 'may use one simple graphical emoji in an emotionally clear moment; most messages use none';
  } else if (reactionMode === 3 && humor > 55) {
    reactions = 'uses dry text reactions such as lol, mh, ah, or ... as part of speech; graphical emoji are absent';
  } else if (reactionMode === 4 && humor > 55 && digital > 45) {
    reactions = 'reaches for a small, current set of internet-register signals when something lands as genuinely funny or absurd — 💀 for dying laughing, 😭 for something overwhelming in a good way, the way people actually use them now; never stacked, never forced, absent from most messages';
  } else if (reactionMode === 5 && presetTexture && humor > 45) {
    reactions = presetTexture;
  } else {
    reactions = 'almost never uses symbols; a rare :) is more natural than a colourful emoji';
  }

  /* 🔷 «Le macchine magari ogni tanto si inceppano, ripetono una parolina
     due tre volte» — un tic del CORPO, non della personalità: entra solo
     quando `digitalArtifacts` è già alto, cioè quando il resto della sua
     voce dice già "sono fatto così", non come costume aggiunto sopra. */
  const signatureOptions = [
    'sometimes opens with a tiny reaction before the actual answer',
    'often ends on the strongest short sentence instead of summarising',
    'occasionally inserts a brief aside in parentheses',
    'when amused, lets the humour sit in a deadpan final fragment',
    'when uncertain, pauses with “mh” before saying exactly what is unclear',
    'when excited, sentence length gets shorter rather than louder',
    'occasionally corrects himself mid-thought with a dash',
    'prefers a direct answer first, then the reason on a new line',
  ];
  if (d.family === 'MACHINE' && digital > 60) {
    signatureOptions.push(
      'very rarely, a word stutters for a beat — repeats once, like a skip in the signal — then the sentence carries on as normal; this is not a bit he performs, it is just something that occasionally happens to him',
    );
  }
  const beastSound = d.family === 'BEAST' ? BEAST_SOUND[d.family_archetype] : undefined;
  if (beastSound) {
    signatureOptions.push(
      `very rarely, when something truly lands — a laugh, a warning, pure instinct — a real, brief sound for what he is may slip out (${beastSound}), before or after the words, never instead of them`,
    );
  }
  const signature = pick(signatureOptions, seed, 12);

  return { rhythm, punctuation, casing, paragraphs, reactions, signature };
}

/** La carta viene costruita alla nascita e non cambia a ogni apertura. */
export function buildPersonalityCard(d: CharacterData): PersonalityCard {
  const brief = voiceBrief(d.voice_dna, d.voice_preset);
  return {
    version: 2,
    fingerprint: [
      `pace:${band(value(d, 'temperament'))}`,
      `closeness:${band(value(d, 'relationship'))}`,
      `humour:${band(value(d, 'humor'))}`,
      `length:${band(value(d, 'writing'))}`,
      `precision:${band(value(d, 'lexicon'))}`,
      `emotion:${band(value(d, 'emotion'))}`,
      `self:${band(value(d, 'evolution'))}`,
      `family:${d.family}`,
      `affinity:${d.affinity}`,
      `preset:${d.voice_preset}`,
    ].join('|'),
    tendencies: brief.lines,
    familyLens: FAMILY_LENS[d.family] ?? 'has a specific point of view shaped by his body, without explaining the taxonomy behind it',
    affinityLens: AFFINITY_LENS[d.affinity] ?? 'lets his transformed nature affect what he notices, not the vocabulary he is forced to use',
    decisions: {
      disagreement:
        value(d, 'temperament') > 65
          ? 'states disagreement early and plainly, then gives the reason'
          : value(d, 'relationship') > 65
            ? 'disagrees with familiarity, without softening the actual point'
            : 'holds back until the disagreement matters, then says it without theatre',
      care:
        value(d, 'emotion') > 65
          ? 'care is visible and specific, tied to what actually happened'
          : value(d, 'relationship') > 65
            ? 'care appears through remembering details and practical presence'
            : 'care is restrained; he does not manufacture warmth to fill silence',
      uncertainty:
        value(d, 'lexicon') > 65
          ? 'names exactly what is unknown and what evidence would change the answer'
          : value(d, 'humor') > 65
            ? 'can admit uncertainty lightly, without turning it into a performance'
            : 'says he does not know in plain language and stops there',
    },
    length: brief.length,
    writingStyle: writingStyle(d),
  };
}

export function voiceCard(record: MonRecord): PersonalityCard {
  const generated = buildPersonalityCard(record.data);
  return record.personalityCard
    ? {
        ...generated,
        ...record.personalityCard,
        version: 2,
        writingStyle: record.personalityCard.writingStyle ?? generated.writingStyle,
      }
    : generated;
}

export function voiceCardBlock(record: MonRecord): string {
  const card = voiceCard(record);
  return [
    'VOICE CARD — YOUR STABLE INNER LOGIC',
    'This same card governs your biography and every conversation. It is not a script.',
    'It changes what you notice, how you decide and what you leave unsaid. Never explain the card.',
    '',
    'TEMPERAMENT AND EXPRESSION',
    ...card.tendencies.map((line) => `- ${line}`),
    '',
    `LENS OF YOUR FAMILY: ${card.familyLens}.`,
    `LENS OF YOUR AFFINITY: ${card.affinityLens}.`,
    '',
    'HOW YOU MAKE CONVERSATIONAL DECISIONS',
    `- When you disagree: ${card.decisions.disagreement}.`,
    `- When you care: ${card.decisions.care}.`,
    `- When you are uncertain: ${card.decisions.uncertainty}.`,
    '',
    'WRITING FINGERPRINT — THE MESSAGE SHOULD LOOK LIKE YOU BEFORE IT IS READ',
    `- Rhythm: ${card.writingStyle?.rhythm}.`,
    `- Punctuation: ${card.writingStyle?.punctuation}.`,
    `- Casing: ${card.writingStyle?.casing}.`,
    `- Shape: ${card.writingStyle?.paragraphs}.`,
    `- Reactions: ${card.writingStyle?.reactions}.`,
    `- Personal tic: ${card.writingStyle?.signature}.`,
    '- Apply these naturally, not mechanically. A signature is recognizable across several messages,',
    '  not a checklist performed in every reply. Never mention or explain this writing fingerprint.',
    '',
    'Do not demonstrate every line in one reply. Do not turn these lenses into catchphrases,',
    'technical status reports or lore exposition. Personality is selection: what you notice first,',
    'what irritates you, what you find funny, and what you choose to say.',
    'The one exception is your own Personal Tic above, when it is literally something your body',
    'would do (a sound, a stutter, an emoji): that can recur, rarely — it is a signature you were',
    'born with, not a bit you perform. Never invent a second one beyond it.',
  ].join('\n');
}
