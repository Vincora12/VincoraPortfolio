import { generateMon, type GenerationContext } from './characterGenerator';
import { asBaby } from './baby';
import type { GenerationTrace, MonRecord } from './types';
export const BREED_DURATION_MS = 24 * 60 * 60 * 1000;
export interface BreedJob { id: string; parentNames: [string, string]; startedAt: number; readyAt: number; candidate: MonRecord; trace: GenerationTrace }
/** Prepared once, then held until a wall-clock deadline. No timer or open tab
 * is needed for the 24 hours to pass; the job lives in the canonical save. */
export function prepareBreed(a: MonRecord, b: MonRecord, ctx: GenerationContext, now: number): BreedJob {
  if (a.data.mindline_node === b.data.mindline_node) throw new Error('Scegli due backup diversi');
  const strength = (m: MonRecord) => m.data.heritage_traits.length + (m.data.evolution_state?.stage ?? 0);
  const dominant = strength(a) === strength(b) ? (ctx.seed % 2 ? a : b) : strength(a) > strength(b) ? a : b;
  const result = generateMon({ ...ctx, previous: dominant, continuity: ['family', 'mood_primary'],
    heritageOrigins: [a,b].map((m,i) => ({ id:`breed_${ctx.mindlineNodeId}_${i}`,category:'anatomy' as const,from_mon:m.data.name,origin:m.data.character_dna.anatomical_gimmick })),
  });
  const candidate = asBaby(result.record, [a,b]);
  // Reinterpret one drive from the second backup without replacing the Voice Card.
  const other = dominant === a ? b : a;
  candidate.data.character_dna = { ...candidate.data.character_dna,
    drives: [...new Set([candidate.data.character_dna.drives[0],other.data.character_dna.drives[0]].filter((v):v is string=>Boolean(v)))] };
  candidate.data.narrativeDNA = candidate.data.narrativeDNA ? { ...candidate.data.narrativeDNA, drive: candidate.data.character_dna.drives[0] ?? candidate.data.narrativeDNA.drive } : undefined;
  return { id:`breed_${ctx.mindlineNodeId}`,parentNames:[a.data.name,b.data.name],startedAt:now,readyAt:now+BREED_DURATION_MS,candidate,trace:result.trace };
}
export function breedReady(job: BreedJob, now = Date.now()): boolean { return now >= job.readyAt; }
