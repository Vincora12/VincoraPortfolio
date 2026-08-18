/* ============================================================================
   LEGGERE LA RISOLUZIONE, E CONTROLLARLA DAVVERO

   🔒 QUESTA È LA RAGIONE PER CUI L'ARCHITETTURA A DUE STADI È MIGLIORE.

   Prima il modello consegnava PROSA, e per controllarla si poteva solo cercare
   stringhe dentro un testo — cercavo l'esadecimale del colore dentro un
   paragrafo, ed era un controllo che passava per caso. Qui consegna un oggetto
   con chiavi dichiarate: si controlla che le decisioni ci siano tutte e che i
   conteggi stiano nei limiti che il master impone.

   ⚠️ Tollerante sulla FORMA, severa sul CONTENUTO. Un modello che incornicia
   il JSON in un blocco di codice ha obbedito nella sostanza, e buttare quella
   risposta vorrebbe dire pagarla per niente. Un modello che consegna cinque
   punti di sagoma quando il master ne vuole tre o quattro no: quello ha
   disobbedito sulla cosa che conta.
   ========================================================================= */

import type { CreativeResolution } from './vendor/types';

/** Le chiavi che devono esserci tutte, con il conteggio che il master impone. */
const SHAPE = {
  corePersonality: [3, 7],
  silhouetteLandmarks: [3, 4],
  familySystems: [2, 4],
  affinityZones: [1, 3],
  roleBehavior: [2, 5],
  fashionMasses: [2, 6],
  culturalTranslation: [1, 6],
  asymmetryBudget: [3, 6],
  negativeSpaces: [2, 4],
  detailBudget: [1, 40],
  appealBehaviors: [4, 8],
  visualDNALock: [1, 40],
} as const;

const TEXTS = [
  'dominantIdentityMass',
  'proportionalExaggeration',
  'ridiculousSpecificFeature',
  'facialAttitude',
  'archetypeBodyPlan',
  'hairConstruction',
  'eyewearConstruction',
  'memorySentence',
] as const;

export interface ParsedResolution {
  resolution: CreativeResolution | null;
  /** Perché non va bene. Vuoto se va bene. */
  problems: string[];
}

export function parseResolution(raw: string): ParsedResolution {
  /* Il modello a volte incornicia. Si toglie la cornice e si cerca l'oggetto:
     un JSON dentro un blocco ```json è comunque un JSON. */
  const text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return { resolution: null, problems: ['Non c’è nessun oggetto JSON qui dentro.'] };
  }

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch (err) {
    return { resolution: null, problems: [`JSON non leggibile: ${String(err)}`] };
  }

  const problems: string[] = [];

  for (const [key, [lo, hi]] of Object.entries(SHAPE)) {
    const v = obj[key];
    if (!Array.isArray(v)) {
      problems.push(`${key}: manca, o non è una lista`);
      continue;
    }
    const clean = v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
    if (clean.length < lo || clean.length > hi) {
      problems.push(`${key}: ${clean.length} voci, il master ne vuole da ${lo} a ${hi}`);
    }
  }

  for (const key of TEXTS) {
    const v = obj[key];
    if (typeof v !== 'string' || v.trim().length < 3) problems.push(`${key}: manca`);
  }

  if (problems.length > 0) return { resolution: null, problems };
  return { resolution: obj as unknown as CreativeResolution, problems: [] };
}
