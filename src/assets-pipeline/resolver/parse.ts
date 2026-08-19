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
  /** Cosa è stato aggiustato per farlo leggere. Vuoto se non serviva niente. */
  repaired: string[];
}

/* ============================================================================
   ⚠️ LE VIRGOLETTE DELL'IPHONE

   Copiando da una chat su iOS, la punteggiatura intelligente trasforma le
   virgolette dritte in tipografiche — " diventa “ e ” — e `JSON.parse` le
   rifiuta con «unrecognized token». Da fuori sembra che il modello abbia
   risposto male, e invece ha risposto benissimo: è il telefono che ha
   riscritto il testo mentre lo copiavi.

   🔒 SI RIPARA, MA SI DICE. Aggiustare in silenzio vorrebbe dire che un giorno
   una risposta davvero rotta passerebbe per buona. Qui si prova prima il testo
   com'è, e solo se non si legge si tenta la riparazione — dichiarandola.
   ========================================================================= */

const REPAIRS: { find: RegExp; put: string; says: string }[] = [
  { find: /[\u201C\u201D\u201E\u201F]/g, put: '"', says: 'virgolette tipografiche → dritte' },
  /* Lo spazio unificatore non è uno spazio valido in JSON, e iOS lo infila. */
  { find: /\u00A0/g, put: ' ', says: 'spazi unificatori → spazi normali' },
  /* Una virgola prima della graffa o della quadra chiusa: la lascia il modello,
     non il telefono, ed è l'errore di battitura più comune di tutti. */
  { find: /,(\s*[}\]])/g, put: '$1', says: 'virgola di troppo prima di una chiusura' },
];

/**
 * Gli a capo dentro una stringa.
 *
 * ⚠️ Non è una `REPAIRS` come le altre perché non è una sostituzione cieca:
 * un `\n` fuori dalle stringhe è spaziatura legittima e va lasciato stare,
 * dentro una stringa è sempre illegale e va protetto. Distinguere i due casi
 * richiede di sapere dove si è, quindi si scorre.
 */
function escapeBreaksInStrings(text: string): { out: string; changed: boolean } {
  let inString = false;
  let escaped = false;
  let changed = false;
  let out = '';
  for (const c of text) {
    if (escaped) {
      out += c;
      escaped = false;
      continue;
    }
    if (c === '\\') {
      out += c;
      escaped = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      out += c;
      continue;
    }
    if (inString && (c === '\n' || c === '\r' || c === '\t')) {
      out += c === '\t' ? '\\t' : '\\n';
      changed = true;
      continue;
    }
    out += c;
  }
  return { out, changed };
}

/* ============================================================================
   DOVE È IL PROBLEMA, NON SOLO CHE C'È UN PROBLEMA

   ⚠️ «Unable to parse JSON string» è il messaggio di Safari, e non dice niente:
   né la posizione, né il carattere, né se il testo è semplicemente TAGLIATO.
   Su un telefono, incollare metà risposta è il modo più facile di sbagliare —
   e produce esattamente quel messaggio.

   🔒 Quindi la diagnosi la facciamo noi. Un errore che dice «mancano tre
   graffe: sembra tagliato» si risolve in dieci secondi; «unable to parse» si
   risolve riprovando a caso.
   ========================================================================= */

function diagnose(text: string): string[] {
  const out: string[] = [];

  /* Le graffe e le quadre si contano SOLO fuori dalle stringhe: una parentesi
     dentro una frase non è una parentesi del JSON. */
  let inString = false;
  let escaped = false;
  let curly = 0;
  let square = 0;
  let quotes = 0;
  let rawBreak = -1;

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === '\\') {
      escaped = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      quotes++;
      continue;
    }
    if (inString) {
      /* Un a capo vero dentro una stringa è sempre illegale in JSON, ed è
         quello che succede quando una risposta lunga viene incollata a pezzi. */
      if ((c === '\n' || c === '\r' || c === '\t') && rawBreak < 0) rawBreak = i;
      continue;
    }
    if (c === '{') curly++;
    else if (c === '}') curly--;
    else if (c === '[') square++;
    else if (c === ']') square--;
  }

  if (quotes % 2 !== 0) {
    out.push(`ci sono ${quotes} virgolette: un numero dispari, quindi una stringa resta aperta`);
  }
  if (curly > 0) out.push(`mancano ${curly} graffe chiuse: sembra tagliato prima della fine`);
  if (curly < 0) out.push(`ci sono ${-curly} graffe chiuse in più: sembra tagliato all'inizio`);
  if (square > 0) out.push(`mancano ${square} quadre chiuse`);
  if (square < 0) out.push(`ci sono ${-square} quadre chiuse in più`);
  if (rawBreak >= 0) {
    out.push(`c'è un a capo dentro una stringa, intorno al carattere ${rawBreak}`);
  }

  if (out.length === 0) {
    /* Nessuna delle cause comuni: si dice almeno com'è fatto il testo, che è
       già abbastanza per accorgersi di un incolla venuto male. */
    const head = text.slice(0, 50).replace(/\s+/g, ' ');
    const tail = text.slice(-50).replace(/\s+/g, ' ');
    out.push(`${text.length} caratteri · comincia con «${head}» · finisce con «${tail}»`);
  }
  return out;
}

/** Prova a leggere. Se non ci riesce, ripara e riprova, dicendo cosa ha fatto. */
function readJson(text: string): {
  obj: Record<string, unknown> | null;
  error: string | null;
  repaired: string[];
} {
  try {
    return { obj: JSON.parse(text) as Record<string, unknown>, error: null, repaired: [] };
  } catch {
    /* Niente: si prova a riparare. L'errore che conta è quello DOPO. */
  }

  const repaired: string[] = [];
  let fixed = text;
  for (const r of REPAIRS) {
    if (r.find.test(fixed)) {
      fixed = fixed.replace(r.find, r.put);
      repaired.push(r.says);
    }
  }

  const breaks = escapeBreaksInStrings(fixed);
  if (breaks.changed) {
    fixed = breaks.out;
    repaired.push('a capo dentro una stringa');
  }

  if (repaired.length === 0) {
    try {
      JSON.parse(text);
    } catch (err) {
      return { obj: null, error: String(err), repaired: [] };
    }
  }

  try {
    return { obj: JSON.parse(fixed) as Record<string, unknown>, error: null, repaired };
  } catch (err) {
    return { obj: null, error: String(err), repaired };
  }
}

export function parseResolution(raw: string): ParsedResolution {
  /* Il modello a volte incornicia. Si toglie la cornice e si cerca l'oggetto:
     un JSON dentro un blocco ```json è comunque un JSON. */
  const text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return { resolution: null, problems: ['Non c’è nessun oggetto JSON qui dentro.'], repaired: [] };
  }

  const read = readJson(text.slice(start, end + 1));
  const repaired = read.repaired;
  if (!read.obj) {
    /* 🔒 Il messaggio del browser PRIMA, la nostra diagnosi DOPO: il primo dice
       che non si legge, la seconda dice perché. */
    return {
      resolution: null,
      problems: [`JSON non leggibile: ${read.error ?? 'sconosciuto'}`, ...diagnose(text.slice(start, end + 1))],
      repaired,
    };
  }
  const obj = read.obj;

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

  if (problems.length > 0) return { resolution: null, problems, repaired };
  return { resolution: obj as unknown as CreativeResolution, problems: [], repaired };
}
