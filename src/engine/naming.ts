/* ============================================================================
   GENOMA DEI NOMI (§4)
   "Naming genome: name begins with V, contains Z, ends with .mon;
    no lineage duplicate."   🔒 LOCKED
   ========================================================================= */

import { pick, pickInt, type Rng } from './rng';

/** Sillabe iniziali: cominciano tutte per V, come impone la regola. */
const HEAD = ['VA', 'VE', 'VI', 'VO', 'VU', 'VRA', 'VEL', 'VIN', 'VOR', 'VYS'] as const;

/** Sillabe centrali che garantiscono la Z richiesta. */
const CORE = ['Z', 'ZI', 'ZE', 'ZA', 'ZO', 'ZU', 'ZAR', 'ZEL', 'ZIR', 'ZOM', 'ZYN'] as const;

/** Code opzionali. Non possono introdurre una seconda regola: solo suono. */
const TAIL = [
  '', 'IEL', 'AR', 'EK', 'OS', 'IX', 'AN', 'UR', 'ETH', 'IL', 'ORA', 'AK', 'ESS',
] as const;

/** Ponti facoltativi tra testa e nucleo, per allungare il nome. */
const BRIDGE = ['', '', '', 'DR', 'KL', 'TR', 'M', 'N', 'L'] as const;

const SUFFIX = '.mon';

/** Verifica il genoma su un nome canonico. */
export function isValidMonName(canonical: string): boolean {
  if (!canonical.endsWith(SUFFIX)) return false;
  const stem = canonical.slice(0, -SUFFIX.length);
  if (stem.length < 3) return false;
  if (!stem.startsWith('V')) return false;
  if (!stem.includes('Z')) return false;
  return /^[A-Z]+$/.test(stem);
}

/**
 * Genera un nome canonico che rispetta il genoma e non duplica nessun nome
 * già presente nella lineage. In caso di collisione rigenera: non appende
 * mai un numero, perché un `VAZIEL2.mon` violerebbe la grammatica.
 */
export function generateMonName(rng: Rng, lineageNames: readonly string[]): string {
  const taken = new Set(lineageNames.map((n) => n.toUpperCase()));

  for (let attempt = 0; attempt < 200; attempt++) {
    const stem = `${pick(rng, HEAD)}${pick(rng, BRIDGE)}${pick(rng, CORE)}${pick(rng, TAIL)}`;
    const canonical = `${stem}${SUFFIX}`;

    if (stem.length < 4 || stem.length > 9) continue;
    if (!isValidMonName(canonical)) continue;
    if (taken.has(canonical.toUpperCase())) continue;

    return canonical;
  }

  // Fallback esaustivo: costruzione sillabica più lunga, sempre valida.
  for (let attempt = 0; attempt < 500; attempt++) {
    const stem = `${pick(rng, HEAD)}${pick(rng, CORE)}${pick(rng, CORE)}${pick(rng, TAIL)}`.slice(
      0,
      pickInt(rng, 6, 9),
    );
    const canonical = `${stem}${SUFFIX}`;
    if (isValidMonName(canonical) && !taken.has(canonical.toUpperCase())) return canonical;
  }

  throw new Error('Impossibile generare un nome .mon univoco per questa lineage');
}
