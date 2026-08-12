/* ============================================================================
   VOICE DNA (§13, §14, §44)

   §14 — regola vincolante: «A generated .mon may use one preset as a baseline,
   then mutate every Voice axis. Presets are not classes; two .mon with the
   same preset must still speak differently.»

   Quindi il preset è solo il punto di partenza: i 12 assi di §13 vengono
   generati sopra, e le deviazioni marcate alimentano la componente «voice
   distinctiveness» del punteggio di rarità (§16).

   §28 — vincoli non negoziabili: mai vergogna su corpo, cibo, malattia o
   stato di salute; nessuna emozione è moralmente migliore di un'altra.
   ========================================================================= */

import {
  ROLES,
  VOICE_AXES,
  VOICE_PRESETS,
  moodDef,
  voicePresetDef,
  type VoiceAxisId,
} from './generation-config';
import { pick, pickMany, type Rng } from './rng';
import type { CharacterDna, VoiceDna } from './types';

/* --- Generazione ----------------------------------------------------------- */

/**
 * Sceglie il preset in base al Character DNA e poi ne muta i 12 assi.
 * Un asse che si discosta di oltre 25 punti dalla linea di base del preset
 * conta come deviazione: sono quelle a rendere due .mon dello stesso preset
 * riconoscibilmente diversi.
 */
export function generateVoiceDna(
  rng: Rng,
  dna: CharacterDna,
  moodPrimary: string,
): { preset: string; voice: VoiceDna } {
  const preset = pickPreset(rng, dna, moodPrimary);
  const baseline = presetBaseline(preset);

  const voice: VoiceDna = {} as VoiceDna;
  const deviations: string[] = [];

  for (const axis of VOICE_AXES) {
    const base = baseline[axis.id] ?? 50;
    // Mutazione ampia: §14 vuole che il preset non determini il personaggio.
    const mutated = Math.max(0, Math.min(100, Math.round(base + (rng() - 0.5) * 70)));
    voice[axis.id] = mutated;
    if (Math.abs(mutated - base) > 25) deviations.push(axis.id);
  }

  voice.deviations = deviations;
  return { preset, voice };
}

/** Il preset non è casuale: il carattere e l'umore lo orientano. */
function pickPreset(rng: Rng, dna: CharacterDna, moodPrimary: string): string {
  const byMood: Record<string, string[]> = {
    CUTE: ['SOFT PROTECTOR', 'SWEET MENACE'],
    GOOFY: ['ABSURD LITTLE FREAK', 'CHAOTIC GEN-Z'],
    BRIGHT: ['SPORT HYPE', 'CHAOTIC GEN-Z'],
    AGGRESSIVE: ['COCKY RIVAL', 'SPORT HYPE'],
    CHAOTIC: ['CHAOTIC GEN-Z', 'ABSURD LITTLE FREAK'],
    SAD: ['GOTH POET', 'SILENT STOIC'],
    MYSTERIOUS: ['MYSTERY SIGNAL', 'OLD-SOUL ORACLE'],
    WATCHFUL: ['DEADPAN FILE', 'NERD TERMINAL'],
    SEDUCTIVE: ['STREET FLIRT', 'CAMP ICON'],
    FLIRTY: ['STREET FLIRT', 'CAMP ICON'],
    FERAL: ['SWEET MENACE', 'COCKY RIVAL'],
    AFFECTIONATE: ['SOFT PROTECTOR', 'CAMP ICON'],
    ALLURING: ['CAMP ICON', 'ART SNOB'],
    STOIC: ['SILENT STOIC', 'DEADPAN FILE'],
    CALM: ['OLD-SOUL ORACLE', 'SILENT STOIC'],
    CREEPY: ['MYSTERY SIGNAL', 'CORPORATE DEMON'],
  };

  const candidates = byMood[moodPrimary] ?? VOICE_PRESETS.map((p) => p.id);

  // I tratti possono scavalcare l'umore: un .mon teatrale parla teatrale
  // anche quando è triste.
  if (dna.traits.includes('teatrale') && rng() < 0.5) return 'CAMP ICON';
  if (dna.traits.includes('tecnico') && rng() < 0.5) return 'NERD TERMINAL';

  return pick(rng, candidates);
}

/** Linea di base per asse, derivata dal tono descritto in §14. */
function presetBaseline(presetId: string): Partial<Record<VoiceAxisId, number>> {
  const tone = voicePresetDef(presetId).tone.toLowerCase();

  const has = (...words: string[]) => words.some((w) => tone.includes(w));

  return {
    temperament: has('high energy', 'fast', 'competitive') ? 78 : has('low energy', 'sparse', 'very low') ? 22 : 50,
    relationship: has('warm', 'protective', 'affectionate') ? 78 : has('provocative', 'competitive') ? 35 : 50,
    humor: has('deadpan', 'dry') ? 30 : has('camp', 'nonsense', 'absurd') ? 82 : 50,
    writing: has('short', 'sparse', 'low verbosity', 'fragments') ? 25 : has('theatrical', 'dramatic') ? 75 : 50,
    lexicon: has('technical', 'sophisticated', 'corporate') ? 80 : has('slang', 'gen-z', 'street') ? 25 : 50,
    language: has('gen-z', 'internet', 'street') ? 72 : 45,
    digitalArtifacts: has('file', 'error', 'percentages', 'terminal', 'metadata') ? 85 : 20,
    emotion: has('warm', 'high energy', 'dramatic') ? 72 : has('restrained', 'low energy', 'cold') ? 25 : 50,
    rituals: has('catchphrase', 'ritual', 'celebration') ? 70 : 45,
    // §28 — i confini non si mutano verso il basso: restano alti per tutti.
    boundaries: 95,
    evolution: 50,
    bond: has('remembers', 'callbacks', 'complicity') ? 78 : 45,
  };
}

/* ============================================================================
   TESTI DI FALLBACK (MASTER SPEC §17)
   Ogni superficie che dipenderà da un'AI ha un fallback deterministico. Nel
   prototipo queste righe SONO quel fallback.

   Le cornici non ospitano mai un descrittore dove serve accordo di articolo,
   genere o persona: si introduce con i due punti.
   ========================================================================= */

const OBSERVATIONS = [
  'Il tuo recupero sta salendo. Si vede anche da fuori.',
  'Hai saltato un giorno. Non è un dramma, ma l’ho notato.',
  'C’è un dato che manca. Non lo invento.',
  'Stai spingendo più del solito.',
  'Il ritmo è costante. È la parte difficile.',
  'Qualcosa è cambiato nella forma. Ancora poco, ma c’è.',
];

const GREETINGS: Record<string, string[]> = {
  CUTE: ['Eccoti!', 'Ti stavo aspettando.'],
  GOOFY: ['Ops. Ciao.', 'Stavo facendo una cosa. Non chiedere.'],
  BRIGHT: ['Oggi funziona tutto.', 'Pronto quando vuoi.'],
  AGGRESSIVE: ['Allora?', 'Muoviti.'],
  CHAOTIC: ['Ho tre cose da dirti e nessuna in ordine.', 'CIAO. Scusa il volume.'],
  SAD: ['Ci sono.', 'Oggi poco, ma ci sono.'],
  MYSTERIOUS: ['Sapevo che saresti passato.', 'Non chiedermelo adesso.'],
  WATCHFUL: ['Ti ho visto arrivare.', 'Stavo controllando una cosa.'],
  SEDUCTIVE: ['Guarda chi si vede.', 'Con calma.'],
  FLIRTY: ['Ah, sei tu.', 'Che onore.'],
  FERAL: ['Andiamo. Ora.', 'Ho troppa energia addosso.'],
  AFFECTIONATE: ['Mi mancavi, lo ammetto.', 'Bello vederti.'],
  ALLURING: ['Eccoci.', 'Ti aspettavo, con eleganza.'],
  STOIC: ['Ci sono.', 'Dimmi.'],
  CALM: ['Tutto tranquillo.', 'Piano, oggi.'],
  CREEPY: ['Sapevo l’ora esatta.', 'Sei arrivato con due minuti di ritardo.'],
};

export function fallbackGreeting(rng: Rng, moodPrimary: string, voice: VoiceDna): string {
  const base = pick(rng, GREETINGS[moodPrimary] ?? ['Ci sono.']);
  const verbosity = voice.writing ?? 50;
  if (verbosity < 30) return base;
  if (verbosity > 70) return `${base} ${pick(rng, OBSERVATIONS)}`;
  return base;
}

export function fallbackReply(
  rng: Rng,
  moodPrimary: string,
  voice: VoiceDna,
  role: string,
): string {
  const shapes = [
    `Ricevuto. ${pick(rng, OBSERVATIONS)}`,
    `Ci penso. Intanto sto così: ${moodDef(moodPrimary).it}.`,
    pick(rng, OBSERVATIONS),
    `Lo registro. Il mio mestiere è questo: ${roleIt(role)}.`,
  ];

  const text = pick(rng, shapes);
  return (voice.writing ?? 50) < 30 ? `${text.split('.')[0]!}.` : text;
}

function roleIt(role: string): string {
  return ROLES.find((r) => r.id === role)?.it ?? role.toLowerCase();
}

/** Reazioni testuali finché il Reaction Pack non è importato (§45). */
export function generateReactions(rng: Rng, moodPrimary: string): string[] {
  const base = ['sì', 'no', 'boh', 'ottimo', 'aspetta', 'di nuovo?'];
  const byMood: Record<string, string[]> = {
    CUTE: ['si avvicina', 'fa gli occhi grandi'],
    GOOFY: ['inciampa', 'ride di sé'],
    BRIGHT: ['alza le braccia', 'salta sul posto'],
    AGGRESSIVE: ['si irrigidisce', 'fa un passo avanti'],
    CHAOTIC: ['gira su sé stesso', 'parla sopra'],
    SAD: ['si siede', 'abbassa la testa'],
    MYSTERIOUS: ['non risponde', 'guarda altrove'],
    WATCHFUL: ['inclina la testa', 'segue con lo sguardo'],
    SEDUCTIVE: ['sposta il peso', 'sorride appena'],
    FLIRTY: ['alza un sopracciglio', 'applausi lenti'],
    FERAL: ['scatta', 'scuote tutto il corpo'],
    AFFECTIONATE: ['appoggia la testa', 'resta vicino'],
    ALLURING: ['posa', 'sostiene lo sguardo'],
    STOIC: ['annuisce una volta', 'niente'],
    CALM: ['respira piano', 'resta fermo'],
    CREEPY: ['sorride troppo a lungo', 'si avvicina di un passo'],
  };

  return [...pickMany(rng, base, 3), ...(byMood[moodPrimary] ?? [])];
}
