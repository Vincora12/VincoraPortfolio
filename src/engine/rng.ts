/* ============================================================================
   RNG DETERMINISTICO
   Ogni generazione parte da un seed esplicito, così una .mon si riproduce
   identica e due candidati si confrontano in QA (§20.2).
   Nessun Math.random() dentro engine/.
   ========================================================================= */

/** mulberry32 — piccolo, veloce, distribuzione sufficiente per la generazione. */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = ReturnType<typeof makeRng>;

export function pick<T>(rng: Rng, list: readonly T[]): T {
  if (list.length === 0) throw new Error('pick() su lista vuota');
  return list[Math.floor(rng() * list.length)]!;
}

/** Estrae `n` elementi distinti, o meno se la lista è più corta. */
export function pickMany<T>(rng: Rng, list: readonly T[], n: number): T[] {
  const pool = [...list];
  const out: T[] = [];
  const count = Math.min(n, pool.length);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rng() * pool.length);
    out.push(pool.splice(idx, 1)[0]!);
  }
  return out;
}

/** Intero in [min, max] inclusi. */
export function pickInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

/** Estrazione pesata. I pesi non devono essere normalizzati. */
export function pickWeighted<T>(rng: Rng, entries: readonly { item: T; weight: number }[]): T {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let r = rng() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e.item;
  }
  return entries[entries.length - 1]!.item;
}

/** Seed riproducibile da una stringa, per derivare sotto-generatori stabili. */
export function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Seed casuale per una nuova generazione non riproducibile a mano. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
