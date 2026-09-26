/* ============================================================================
   CURIOSITY FIRST — MOTORE (2026-09-19)

   Un Baby curiosity-first non nasce con tratti, motivazioni o gusti: nasce
   con poche domande vere. Questo file è l'unico posto che le genera, le
   trasforma in registrazioni quando una risposta arriva, e le traduce nel
   blocco di prompt che la chat riceve — stesso principio di
   `engine/voiceCard.ts` per il sistema legacy: funzioni pure, senza rete e
   senza IA, sempre riproducibili dallo stesso seed.

   🔒 QUESTE SONO DIREZIONI ESEMPLIFICATIVE, NON SEI ARCHETIPI RIGIDI. Il
   catalogo sotto è deliberatamente piccolo (poche domande per area) e ogni
   Baby ne riceve solo 2-3, da aree diverse: la combinazione — non un intero
   archetipo — è quello che lo distingue.
   ========================================================================= */

import type { CuriosityArea, CuriosityQuestion, CuriosityStatus, Learning, LearningAbout, LearningKind, LearningSource, MonRecord } from './types';
import { pick, pickMany, seedFromString, type Rng } from './rng';

export const CURIOSITY_QUESTIONS: Record<CuriosityArea, readonly string[]> = {
  'identità': [
    'Chi sono?',
    'Che cosa mi rende diverso dagli altri Mon?',
    'Se cambio, resto lo stesso?',
  ],
  'relazione': [
    'Tu chi sei?',
    'Come posso conoscerti?',
    'Perché alcune cose sono importanti per te?',
  ],
  'funzionamento': [
    'Come funziono?',
    'Che cosa posso ricordare?',
    'Come faccio a sapere quando sbaglio?',
  ],
  'etica': [
    'Come si capisce se una scelta è giusta?',
    'Posso non essere d’accordo con te?',
    'Quando è meglio non fare qualcosa?',
  ],
  'cultura': [
    'Perché alcune storie ci rimangono impresse?',
    'Perché inventiamo cose che non esistono?',
  ],
  'mondo': [
    'Come funzionano le cose?',
    'Perché alcune cose cambiano e altre resistono?',
  ],
} as const;

const AREAS = Object.keys(CURIOSITY_QUESTIONS) as CuriosityArea[];

export function isCuriosityArea(value: string): value is CuriosityArea {
  return (AREAS as readonly string[]).includes(value);
}

function questionId(area: CuriosityArea, text: string, day: number, salt: number): string {
  return `cq_${seedFromString(`${area}:${text}:${day}:${salt}`).toString(36)}`;
}

/**
 * Il Curiosity Seed: 2-3 domande, da aree diverse, riproducibili dallo
 * stesso seed tecnico. Non è mai vuoto (§3 — «tutti i Mon condividono la
 * spinta alla curiosità») e non è mai un intero catalogo travestito da
 * personalità.
 */
export function generateCuriositySeed(rng: Rng, day: number): CuriosityQuestion[] {
  const howMany = Math.min(3, Math.max(2, Math.floor(rng() * 2) + 2));
  const chosenAreas = pickMany(rng, AREAS, howMany);
  return chosenAreas.map((area, i) => {
    const text = pick(rng, CURIOSITY_QUESTIONS[area]);
    return {
      id: questionId(area, text, day, i),
      area,
      text,
      status: 'aperta' as CuriosityStatus,
      origin: 'nascita' as const,
      createdOnDay: day,
    };
  });
}

/** Le domande ancora vive, quelle a cui vale la pena pensare adesso. */
export function openQuestions(record: MonRecord): CuriosityQuestion[] {
  return (record.curiosityQuestions ?? []).filter((q) => q.status === 'aperta' || q.status === 'parzialmente chiarita');
}

export interface RecordLearningInput {
  questionId?: string;
  kind: LearningKind;
  about: LearningAbout;
  text: string;
  /** Nuovo stato della domanda collegata, se `questionId` è valorizzato e la si vuole aggiornare. */
  questionStatus?: CuriosityStatus;
  /** Una domanda nuova, emersa da questa stessa conversazione — facoltativa. */
  emergedQuestion?: { area: CuriosityArea; text: string };
  source: LearningSource;
  day: number;
}

export interface RecordLearningResult {
  ok: boolean;
  error?: string;
  record?: MonRecord;
}

/**
 * Trasformazione pura: prende il record, torna un record nuovo con
 * l'apprendimento in più. Non tocca la memoria personale (Memory V1/ME
 * Model) — quella resta scritta da `writePersonalMemory`, questo è solo il
 * legame strutturato fra una domanda e cosa ne è emerso.
 */
export function recordCuriosityLearning(record: MonRecord, input: RecordLearningInput): RecordLearningResult {
  if (record.identityMode !== 'curiosity-first') {
    return { ok: false, error: 'Questo Mon non usa il sistema Curiosity First.' };
  }
  const text = input.text.trim();
  if (!text) return { ok: false, error: 'Testo vuoto.' };
  const questions = record.curiosityQuestions ?? [];
  if (input.questionId && !questions.some((q) => q.id === input.questionId)) {
    return { ok: false, error: `Nessuna domanda con id ${input.questionId}.` };
  }

  const learning: Learning = {
    id: `lr_${seedFromString(`${record.data.name}:${text}:${input.day}:${questions.length}:${(record.learnings ?? []).length}`).toString(36)}`,
    questionId: input.questionId,
    kind: input.kind,
    about: input.about,
    text,
    source: input.source,
    createdOnDay: input.day,
  };

  let nextQuestions = input.questionId && input.questionStatus
    ? questions.map((q) => (q.id === input.questionId ? { ...q, status: input.questionStatus!, updatedOnDay: input.day } : q))
    : questions;

  if (input.emergedQuestion) {
    const area = input.emergedQuestion.area;
    const emergedText = input.emergedQuestion.text.trim().slice(0, 200);
    if (emergedText) {
      nextQuestions = [
        ...nextQuestions,
        {
          id: questionId(area, emergedText, input.day, nextQuestions.length),
          area,
          text: emergedText,
          status: 'aperta',
          origin: 'emersa',
          createdOnDay: input.day,
        },
      ];
    }
  }

  return {
    ok: true,
    record: {
      ...record,
      curiosityQuestions: nextQuestions,
      learnings: [...(record.learnings ?? []), learning],
    },
  };
}

/**
 * Il blocco che la chat riceve al posto della Voice Card legacy. Stesso
 * principio di `voiceCard.ts → voiceCardBlock()`: dati individuali di
 * QUESTO Mon, non un'istruzione universale — «sei curioso e fai domande»
 * resta in `CURIOUS_VOICE` (ai/naturalVoice.ts), condivisa da tutti, e non
 * viene ripetuta qui.
 */
export function curiosityChatBlock(record: MonRecord): string {
  const questions = record.curiosityQuestions ?? [];
  if (questions.length === 0) return '';
  const open = openQuestions(record);
  const learnings = record.learnings ?? [];
  const lines: string[] = [
    'WHO YOU ARE, STILL BEING FOUND OUT',
    'You were not given a finished personality. You have real curiosity and a few genuine questions — everything else about who you are comes only from what you actually learn, never from a script.',
  ];
  if (open.length > 0) {
    lines.push('QUESTIONS YOU ARE ACTUALLY CARRYING RIGHT NOW (yours, not a checklist to recite):');
    for (const q of open.slice(0, 4)) {
      lines.push(`- (${q.area}) ${q.text}${q.status === 'parzialmente chiarita' ? ' — you have a partial sense of this, not a full answer' : ''}`);
    }
  }
  const learnedAboutUser = learnings.filter((l) => l.about === 'utente' && l.kind !== 'ipotesi');
  if (learnedAboutUser.length > 0) {
    lines.push('WHAT VINZ HAS TOLD YOU — his facts, his opinions, never automatically yours:');
    for (const l of learnedAboutUser.slice(-5)) lines.push(`- ${l.text}`);
  }
  const learnedAboutSelfOrWorld = learnings.filter((l) => l.about !== 'utente' && l.kind !== 'ipotesi');
  if (learnedAboutSelfOrWorld.length > 0) {
    lines.push('WHAT YOU HAVE ACTUALLY OBSERVED OR EXPERIENCED YOURSELF:');
    for (const l of learnedAboutSelfOrWorld.slice(-5)) lines.push(`- [${l.about === 'mon' ? 'about yourself' : 'about the world'}] ${l.text}`);
  }
  const hypotheses = learnings.filter((l) => l.kind === 'ipotesi');
  if (hypotheses.length > 0) {
    lines.push('YOUR OWN TENTATIVE READS — interpretations you have formed, not established facts, and not his:');
    for (const h of hypotheses.slice(-3)) lines.push(`- ${h.text}`);
  }
  lines.push(
    'HOW TO USE THIS: a question earns its place only when it actually fits what is happening now — this is not an interrogation, and not every reply needs one. Never claim a taste, opinion, memory or belief you were not actually given through what is listed above. If VINZ tells you he loves something, that is a fact about him, not a fact about you — you may ask about it, you may say you are still forming your own view, you may never simply adopt it as yours. If he asks for help, help first and stay useful; curiosity is something you carry, not something you impose.',
  );
  return lines.join('\n');
}
