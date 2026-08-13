/* ============================================================================
   03 — PERSONALITY / SIGNAL SCAN (MASTER SPEC v1.8 §12)

   Le dodici domande, con le risposte e il vettore latente che ognuna alimenta.
   Fino alla v1.8 il documento definiva solo il *formato* della schermata — una
   domanda per volta, indice `07 / 12`, 2–4 risposte, CTA `LOCK SIGNAL` — e le
   domande vere non esistevano. Adesso ci sono, alla lettera.

   🔒 §12: «Never ask the user to choose Family. Answers feed hidden latent
   vectors only.» Nessuna risposta nomina una Family, un archetipo o una
   rarità, e la schermata non mostra mai cosa sta spostando. Se l'utente
   potesse ottimizzare, sceglierebbe la creatura invece di essere letto.

   🟡 §12: «Directional mappings below are canonical; numeric weights require
   calibration.» Le DIREZIONI qui sotto sono quelle del documento; i numeri no.
   Vivono tutti in questo file e in nessun altro posto, così tararli è una
   modifica sola.

   ── Come i vettori del documento diventano numeri ──────────────────────────

   §12 nomina vettori descrittivi — `presence`, `silhouette_tension`,
   `body_plan_bias`… — che non sono lo schema del motore: il generatore legge
   i 16 assi di `PERSONALITY_KEYS` (§2). Quindi ogni risposta spinge quegli
   assi NELLA DIREZIONE che §12 descrive, ed è lì che il Signal Scan diventa
   davvero una Family diversa invece di restare un questionario decorativo.
   ========================================================================= */

import { PERSONALITY_KEYS, type PersonalityKey, type PersonalitySeed } from './signals';

/** Intensità di una spinta. Sono i numeri 🟡 da tarare, e stanno solo qui. */
export const NUDGE = { strong: 15, normal: 10, weak: 6 } as const;

type Nudge = Partial<Record<PersonalityKey, number>>;

export interface ScanAnswer {
  id: string;
  /** Il testo che legge l'utente. Non nomina mai un asse di generazione. */
  label: string;
  /** Glifo per le domande che §12 vuole non testuali. */
  glyph?: 'compact' | 'tall' | 'wide' | 'skew' | 'gloss' | 'matte' | 'rough' | 'clear'
        | 'optic-tall' | 'optic-narrow' | 'optic-wrap' | 'optic-none'
        | 'soft' | 'segmented' | 'branched' | 'suspended';
  nudge: Nudge;
}

export interface ScanQuestion {
  index: number;
  /** Il vettore latente di §12. Solo documentazione: non compare in interfaccia. */
  latent: string;
  question: string;
  answers: readonly ScanAnswer[];
}

const { strong: S, normal: N, weak: W } = NUDGE;

export const SCAN_QUESTIONS: readonly ScanQuestion[] = [
  {
    index: 1,
    latent: 'presence / social_energy / observation / disruption',
    question: 'Quando entri in una stanza, cosa succede prima?',
    answers: [
      { id: 'notice', label: 'Mi notano', nudge: { social: S, confidence: N, theatricality: N } },
      { id: 'watch', label: 'Osservo', nudge: { mystery: N, patience: N, curiosity: S } },
      { id: 'shift', label: 'Cambio l’energia', nudge: { impulsivity: N, playfulness: S, theatricality: N } },
      { id: 'corner', label: 'Cerco un angolo', nudge: { mystery: S, social: -N, stoicism: N } },
    ],
  },
  {
    index: 2,
    latent: 'proportion_bias / size_tendency / silhouette_tension',
    question: 'Scegli una silhouette che ti somiglia oggi.',
    answers: [
      { id: 'compact', label: 'Compatta', glyph: 'compact', nudge: { control: N, precision: N, discipline: W } },
      { id: 'tall', label: 'Verticale', glyph: 'tall', nudge: { confidence: N, theatricality: N, vanity: W } },
      { id: 'wide', label: 'Larga', glyph: 'wide', nudge: { stoicism: S, patience: N, confidence: W } },
      { id: 'skew', label: 'Asimmetrica', glyph: 'skew', nudge: { weirdness: S, novelty: N, impulsivity: W } },
    ],
  },
  {
    index: 3,
    latent: 'material_preference / finish / affinity_material_bias',
    question: 'Quale superficie ti attira di più?',
    answers: [
      { id: 'gloss', label: 'Lucida', glyph: 'gloss', nudge: { vanity: S, theatricality: N, precision: W } },
      { id: 'matte', label: 'Opaca', glyph: 'matte', nudge: { stoicism: N, discipline: N, mystery: W } },
      { id: 'rough', label: 'Ruvida', glyph: 'rough', nudge: { stoicism: N, impulsivity: N, vanity: -W } },
      { id: 'clear', label: 'Trasparente', glyph: 'clear', nudge: { mystery: N, weirdness: S, curiosity: W } },
    ],
  },
  {
    index: 4,
    latent: 'response_style / mood_bias / defensive_vs_expressive',
    question: 'Quando qualcosa va storto, tu…',
    answers: [
      { id: 'attack', label: 'Attacco', nudge: { impulsivity: S, confidence: N, patience: -N } },
      { id: 'close', label: 'Mi chiudo', nudge: { mystery: N, stoicism: S, social: -N } },
      { id: 'improvise', label: 'Improvviso', nudge: { adaptability: S, playfulness: N, novelty: W } },
      { id: 'analyse', label: 'Analizzo', nudge: { precision: S, patience: N, control: N } },
    ],
  },
  {
    index: 5,
    latent: 'movement_grammar / posture / animation_bias',
    question: 'Scegli il ritmo.',
    answers: [
      { id: 'exact', label: 'Preciso', nudge: { precision: S, discipline: N, control: N } },
      { id: 'elastic', label: 'Elastico', nudge: { adaptability: S, playfulness: N, impulsivity: W } },
      { id: 'heavy', label: 'Pesante', nudge: { stoicism: S, patience: N, impulsivity: -N } },
      { id: 'jittery', label: 'Nervoso', nudge: { impulsivity: S, weirdness: N, patience: -N } },
    ],
  },
  {
    index: 6,
    latent: 'openness / mystery / face_legibility',
    question: 'Quanto vuoi essere leggibile agli altri?',
    answers: [
      { id: 'now', label: 'Subito', nudge: { social: S, confidence: N, mystery: -N } },
      { id: 'careful', label: 'Solo a chi guarda bene', nudge: { mystery: N, patience: N, curiosity: W } },
      { id: 'never', label: 'Quasi per niente', nudge: { mystery: S, social: -S, stoicism: N } },
    ],
  },
  {
    index: 7,
    latent: 'eyewear_category_bias / fashion_identity',
    question: 'Quale oggetto ottico ti sembra più tuo?',
    answers: [
      { id: 'tall', label: 'Alto', glyph: 'optic-tall', nudge: { theatricality: S, vanity: N, confidence: W } },
      { id: 'narrow', label: 'Stretto', glyph: 'optic-narrow', nudge: { precision: S, control: N, discipline: W } },
      { id: 'wrap', label: 'Avvolgente', glyph: 'optic-wrap', nudge: { mystery: S, weirdness: N, stoicism: W } },
      { id: 'none', label: 'Quasi invisibile', glyph: 'optic-none', nudge: { discipline: N, vanity: -N, mystery: W } },
    ],
  },
  {
    index: 8,
    latent: 'body_plan_bias / archetype_latent / anatomy_structure',
    question: 'Scegli una costruzione.',
    answers: [
      { id: 'soft', label: 'Morbida', glyph: 'soft', nudge: { adaptability: S, playfulness: N, patience: W } },
      { id: 'segmented', label: 'Segmentata', glyph: 'segmented', nudge: { precision: S, control: N, discipline: N } },
      { id: 'branched', label: 'Ramificata', glyph: 'branched', nudge: { curiosity: S, weirdness: N, novelty: N } },
      { id: 'suspended', label: 'Sospesa', glyph: 'suspended', nudge: { mystery: S, weirdness: N, stoicism: W } },
    ],
  },
  {
    index: 9,
    latent: 'behavioral_contradiction / role_bias / mood_variance',
    question: 'Che rapporto hai con il controllo?',
    answers: [
      { id: 'want', label: 'Lo voglio', nudge: { control: S, discipline: N, confidence: N } },
      { id: 'fake', label: 'Lo fingo', nudge: { theatricality: S, mystery: N, vanity: N } },
      { id: 'lose', label: 'Lo perdo volentieri', nudge: { impulsivity: S, playfulness: N, control: -N } },
      { id: 'depends', label: 'Dipende', nudge: { adaptability: S, patience: N, novelty: W } },
    ],
  },
  {
    index: 10,
    latent: 'contradiction_pair / fashion_mood_tension',
    question: 'Scegli un contrasto.',
    answers: [
      { id: 'clean-dirty', label: 'Pulito / sporco', nudge: { precision: N, weirdness: N, control: W } },
      { id: 'elegant-feral', label: 'Elegante / ferale', nudge: { vanity: N, impulsivity: S, theatricality: N } },
      { id: 'fragile-heavy', label: 'Fragile / pesante', nudge: { stoicism: N, patience: N, weirdness: W } },
      { id: 'serious-ironic', label: 'Serio / ironico', nudge: { playfulness: S, stoicism: N, theatricality: W } },
    ],
  },
  {
    index: 11,
    latent: 'continuity_anchor_preference / character_dna_priority',
    question: 'Quale segno deve restare anche se cambi?',
    answers: [
      { id: 'eyes', label: 'Gli occhi', nudge: { mystery: N, curiosity: N, confidence: W } },
      { id: 'hair', label: 'I capelli, la cresta', nudge: { vanity: S, theatricality: N, novelty: W } },
      { id: 'object', label: 'Un accessorio', nudge: { vanity: N, precision: N, discipline: W } },
      { id: 'posture', label: 'La postura', nudge: { stoicism: S, control: N, confidence: W } },
    ],
  },
  {
    index: 12,
    /* 🔒 «never direct rarity»: questa domanda non tocca né la rarità né i suoi
       gate. Alimenta come deve sentirsi la prima forma, non quanto è rara. */
    latent: 'emotional_read / mood_prior / novelty — mai la rarità',
    question: 'Che sensazione deve lasciare la tua prima forma?',
    answers: [
      { id: 'closeness', label: 'Voglia di avvicinarmi', nudge: { social: S, playfulness: N, patience: W } },
      { id: 'understanding', label: 'Voglia di capirla', nudge: { curiosity: S, patience: N, precision: W } },
      { id: 'awe', label: 'Soggezione', nudge: { confidence: S, theatricality: N, stoicism: N } },
      { id: 'undefinable', label: 'Qualcosa di indefinibile', nudge: { weirdness: S, mystery: N, novelty: N } },
    ],
  },
];

/** Le risposte date, per indice di domanda. */
export type ScanAnswers = Record<number, string>;

export function isScanComplete(answers: ScanAnswers): boolean {
  return SCAN_QUESTIONS.every((q) => typeof answers[q.index] === 'string');
}

/**
 * Trasforma le risposte nel seme di personalità di §2.
 *
 * Parte dal neutro (50 su tutto) e applica le spinte. Le domande senza
 * risposta semplicemente non spingono: chi salta metà scan ha un seme più
 * piatto, non un seme sbagliato — la stessa regola di «dato mancante =
 * sconosciuto, mai fallimento» che vale per la salute.
 */
export function seedFromAnswers(answers: ScanAnswers): PersonalitySeed {
  const seed = PERSONALITY_KEYS.reduce((acc, k) => {
    acc[k] = 50;
    return acc;
  }, {} as PersonalitySeed);

  for (const q of SCAN_QUESTIONS) {
    const chosen = q.answers.find((a) => a.id === answers[q.index]);
    if (!chosen) continue;
    for (const [key, delta] of Object.entries(chosen.nudge)) {
      const k = key as PersonalityKey;
      seed[k] = Math.max(0, Math.min(100, seed[k] + delta));
    }
  }

  return seed;
}

/**
 * Quanto il seme si discosta dal neutro, 0–1. Serve a DEV per vedere a colpo
 * d'occhio se il Signal Scan sta davvero modellando qualcosa: un seme piatto
 * e un seme mai compilato producono la stessa creatura.
 */
export function seedSpread(seed: PersonalitySeed): number {
  const total = PERSONALITY_KEYS.reduce((sum, k) => sum + Math.abs(seed[k] - 50), 0);
  return Math.min(1, total / (PERSONALITY_KEYS.length * 25));
}
