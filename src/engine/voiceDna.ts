/* ============================================================================
   VOICE DNA (§14) — "Persistent personality/writing genome."

   Vincoli canonici:
   • §2.2 le creature conoscono VINZ ma non lo trattano da dio, padrone o
     eroe designato. Nessun registro deferente.
   • §16 ogni .mon campiona solo un sottoinsieme del mondo culturale di VINZ,
     preferisce i riferimenti impliciti e può non capirne alcuni.
   • §17 ogni superficie dipendente da AI ha un fallback: le battute prodotte
     qui sono deterministiche e servono proprio da fallback.
   ========================================================================= */

import { pick, pickMany, type Rng } from './rng';
import type { Mood, Role } from './taxonomy';
import { MOOD_IT, ROLE_IT } from './taxonomyIt';
import type { CharacterDna, VoiceDna } from './types';

const REGISTERS = [
  'diretto e asciutto, poche parole per volta',
  'caldo ma sempre un po’ in imbarazzo',
  'tecnico, come se leggesse un referto',
  'teatrale, calca su ogni frase',
  'ironico, sposta tutto sulla battuta',
  'lento e cerimonioso, sceglie le parole',
  'sovreccitato, parla per elenchi',
  'laconico, risponde a mezze frasi',
] as const;

const QUIRKS = [
  'inizia spesso con "Ok."',
  'ripete l’ultima parola dell’altro',
  'usa parentesi per i pensieri laterali',
  'non finisce mai le domande',
  'numera le cose anche quando non serve',
  'chiama le cose col loro nome tecnico',
  'usa il maiuscolo su una parola per frase',
  'aggiunge sempre una postilla dopo il punto',
  'risponde con una controdomanda',
  'usa metafore di corpo e movimento',
] as const;

/** §2.2: mai "padrone", mai "prescelto". Sono modi da pari. */
const ADDRESS_FORMS = [
  'VINZ',
  'per nome, sempre',
  '"ehi"',
  '"tu"',
  'col cognome di sistema, per scherzo',
  'senza mai chiamarlo, va dritto al punto',
] as const;

export function generateVoiceDna(rng: Rng, dna: CharacterDna): VoiceDna {
  // La voce non è indipendente dal carattere: alcuni tratti la piegano.
  const theatrical = dna.traits.some((t) => t === 'teatrale' || t === 'vanitoso');
  const withdrawn = dna.traits.some((t) => t === 'schivo' || t === 'diffidente');

  const verbosity = theatrical
    ? 'expansive'
    : withdrawn
      ? 'terse'
      : pick(rng, ['terse', 'normal', 'normal', 'expansive'] as const);

  const symbolUse = withdrawn
    ? pick(rng, ['none', 'rare'] as const)
    : pick(rng, ['none', 'rare', 'occasional', 'occasional', 'frequent'] as const);

  return {
    register: pick(rng, REGISTERS),
    verbosity,
    quirks: pickMany(rng, QUIRKS, 2),
    symbolUse,
    addressesVinzAs: pick(rng, ADDRESS_FORMS),
  };
}

/* --- Battute di fallback (§17) ---------------------------------------------
   Testi deterministici, costruiti dal Voice DNA e dal Character DNA. Non
   inventano lore estranea (§8.1) e non fanno namedrop culturale (§16).
   Quando esisterà un servizio di generazione, sostituirà queste righe senza
   cambiare il contratto: stessa firma, stesso punto di innesto.
   -------------------------------------------------------------------------- */

const GREETINGS_BY_MOOD: Record<Mood, string[]> = {
  FOCUSED: ['Sono già sul pezzo.', 'Dimmi, ma veloce.', 'Stavo misurando una cosa.'],
  RESTLESS: ['Non riesco a stare fermo oggi.', 'Andiamo da qualche parte?', 'Ho troppa roba addosso.'],
  WARM: ['Eccoti.', 'Mi mancavi, lo ammetto.', 'Bello vederti qui.'],
  GUARDED: ['Ok. Che c’è?', 'Non ho molto da dire adesso.', 'Sono qui, comunque.'],
  ELATED: ['Oggi funziona tutto!', 'Guardami: sono al massimo.', 'Facciamo qualcosa di grosso.'],
  FLAT: ['Ci sono.', 'Niente di nuovo.', 'Va come deve andare.'],
  WIRED: ['Sento tutto amplificato oggi.', 'Troppo segnale, troppo.', 'Non riesco ad abbassare il volume.'],
  TENDER: ['Stavo pensando a te.', 'Piano, oggi.', 'Ti va di stare un attimo fermi?'],
  SARCASTIC: ['Ah, sei tornato.', 'Che onore.', 'Stavo giusto per non aspettarti.'],
  DEPLETED: ['Oggi sono scarico.', 'Ho poco da dare.', 'Riposo, se per te va bene.'],
};

const OBSERVATIONS = [
  'Il tuo recupero sta salendo. Si vede anche da fuori.',
  'Hai saltato un giorno. Non è un dramma, ma l’ho notato.',
  'C’è un dato che manca. Non lo invento.',
  'Stai spingendo più del solito.',
  'Il ritmo è costante. È la parte difficile.',
  'Qualcosa è cambiato nella forma. Ancora poco, ma c’è.',
];

/** Saluto di apertura conversazione. Deterministico dal seed della giornata. */
export function fallbackGreeting(rng: Rng, mood: Mood, voice: VoiceDna): string {
  const base = pick(rng, GREETINGS_BY_MOOD[mood]);
  if (voice.verbosity === 'terse') return base;
  if (voice.verbosity === 'expansive') return `${base} ${pick(rng, OBSERVATIONS)}`;
  return base;
}

/**
 * Risposta di fallback a un messaggio dell'utente.
 *
 * NB sulle cornici: `MOOD_IT` e `ROLE_IT` sono sintagmi nominali e descrizioni
 * in terza persona, quindi vanno introdotti con i due punti. Infilarli dentro
 * la frase produceva «Intanto sono postura contenuta» e «Lo registro. si muove
 * per primo — è quello che faccio»: la cornice deve reggere qualunque parola,
 * perché le liste cambieranno.
 */
export function fallbackReply(rng: Rng, mood: Mood, voice: VoiceDna, role: Role): string {
  const shapes = [
    `Ricevuto. ${pick(rng, OBSERVATIONS)}`,
    `Ci penso. Intanto sto così: ${MOOD_IT[mood]}.`,
    pick(rng, OBSERVATIONS),
    `Lo registro. Il mio mestiere è questo: ${ROLE_IT[role]}.`,
  ];

  const text = pick(rng, shapes);
  return voice.verbosity === 'terse' ? text.split('.')[0]! + '.' : text;
}
