/* ============================================================================
   HERITAGE (§7.3, §8.3, §18 di §12)

   🔒 Regole canoniche:
   • Al BRANCH il nuovo .mon eredita 1–3 tratti riconoscibili dal nodo
     precedente.
   • L'eredità può essere anatomica, comportamentale, visiva, simbolica,
     mnemonica o relazionale.
   • Va TRADOTTA nella nuova Family, mai copiata alla lettera.
   • Serve a far sentire il branch come una deviazione dello stesso percorso
     di vita, non come un reroll casuale.

   Il processo è in due tempi, come impone il flusso delle schermate:
   1. `selectHeritageOrigins` — al momento della decisione (schermata 13 NEW
      BRANCH) si sceglie CHE COSA sopravvive. La schermata mostra i tratti in
      partenza senza anticipare la nuova identità.
   2. `translateHeritage` — quando il nuovo .mon viene generato, ogni tratto
      viene tradotto nella sua nuova Family/Affinity.
   ========================================================================= */

import type { Affinity, Family } from './taxonomy';
import { ACCESSORY_IT, AFFINITY_IT, EYEWEAR_IT, FAMILY_IT, MOOD_IT, ROLE_IT, it } from './taxonomyIt';
import { pickInt, pickMany, type Rng } from './rng';
import type { HeritageKind, HeritageTrait, MonRecord } from './types';

/** Tratto in partenza: sappiamo da dove viene, non ancora dove arriva. */
export type HeritageOrigin = Omit<HeritageTrait, 'transformed'>;

const KIND_LABELS: Record<HeritageKind, string> = {
  anatomical: 'ANATOMICO',
  behavioral: 'COMPORTAMENTALE',
  visual: 'VISIVO',
  symbolic: 'SIMBOLICO',
  memory: 'MNEMONICO',
  relational: 'RELAZIONALE',
};

export function heritageKindLabel(kind: HeritageKind): string {
  return KIND_LABELS[kind];
}

/* --- 1. Selezione: che cosa sopravvive al branch --------------------------- */

/**
 * Estrae 1–3 tratti dal .mon uscente. Ogni tratto descrive la sua forma
 * ATTUALE: la traduzione avviene dopo, quando la nuova Family esiste.
 */
export function selectHeritageOrigins(rng: Rng, previous: MonRecord): HeritageOrigin[] {
  const p = previous.data;
  const from = p.name;

  // Bacino dei tratti candidati. Solo quelli che questo .mon può davvero
  // esprimere entrano nel bacino: niente occhiali per un'anatomia che non li
  // porta, niente interessi se il Character DNA non ne ha campionati.
  const pool: { kind: HeritageKind; origin: string }[] = [
    {
      kind: 'anatomical',
      origin: `anatomia ${p.family} / ${p.familyArchetype}: ${FAMILY_IT[p.family]}`,
    },
    { kind: 'behavioral', origin: `il modo di fare del ${p.role}: ${ROLE_IT[p.role]}` },
    { kind: 'visual', origin: `la materia ${p.affinity}: ${AFFINITY_IT[p.affinity]}` },
    {
      kind: 'symbolic',
      origin: `la contraddizione fra ${p.characterDna.contradiction.a} e ${p.characterDna.contradiction.b}`,
    },
    {
      kind: 'memory',
      origin: `come stava al mondo quando era ${p.mood}: ${MOOD_IT[p.mood]}`,
    },
    { kind: 'relational', origin: `come chiamava VINZ: ${p.voiceDna.addressesVinzAs}` },
  ];

  if (p.fashion.eyewear) {
    pool.push({
      kind: 'visual',
      // Cornice neutra: la lista contiene anche visiere e monocoli, quindi
      // «gli occhiali» sarebbe una parola sbagliata per metà delle voci.
      origin: `quello che portava sugli occhi, sempre: ${it(EYEWEAR_IT, p.fashion.eyewear)}`,
    });
  }
  if (p.fashion.accessories.length > 0) {
    pool.push({
      kind: 'visual',
      origin: `l'accessorio che portava sempre: ${it(ACCESSORY_IT, p.fashion.accessories[0])}`,
    });
  }
  if (p.characterDna.interests.length > 0) {
    pool.push({ kind: 'memory', origin: `l'attaccamento a ${p.characterDna.interests[0]}` });
  }
  if (p.voiceDna.quirks.length > 0) {
    pool.push({ kind: 'relational', origin: `il tic verbale: ${p.voiceDna.quirks[0]}` });
  }

  const count = pickInt(rng, 1, 3);
  return pickMany(rng, pool, count).map((trait, i) => ({
    id: `her_${p.mindlineNodeId}_${i}`,
    kind: trait.kind,
    origin: trait.origin,
    fromMon: from,
  }));
}

/* --- 2. Traduzione nella nuova Family -------------------------------------- */

/**
 * Traduce ogni tratto nella nuova anatomia. Non copia: riscrive lo stesso
 * fatto nella grammatica della nuova Family/Affinity (§7.3).
 */
export function translateHeritage(
  rng: Rng,
  origins: readonly HeritageOrigin[],
  family: Family,
  affinity: Affinity,
): HeritageTrait[] {
  // Il turno di partenza è casuale ma poi le varianti si scorrono in ordine:
  // due tratti dello stesso tipo nello stesso .mon non possono più ricevere
  // la stessa identica frase, cosa che rendeva l'eredità poco credibile.
  const offset = pickInt(rng, 0, 2);
  const used = new Map<HeritageKind, number>();

  return origins.map((o) => {
    const seen = used.get(o.kind) ?? 0;
    used.set(o.kind, seen + 1);
    return { ...o, transformed: translateOne(o.kind, family, affinity, offset + seen) };
  });
}

/** Tre riscritture per tipo di tratto. `variant` sceglie in modo ciclico. */
function translateOne(
  kind: HeritageKind,
  family: Family,
  affinity: Affinity,
  variant: number,
): string {
  const anatomy = FAMILY_IT[family];
  const material = AFFINITY_IT[affinity];

  const options: Record<HeritageKind, string[]> = {
    anatomical: [
      `la stessa struttura riappare nell'anatomia ${family}: ${anatomy}`,
      `il carico si sposta: quello che era una forma a sé ora è ${anatomy}`,
      `sopravvive come proporzione più che come forma, dentro un corpo ${family}`,
    ],
    behavioral: [
      `stesso comportamento, corpo diverso: cambia il gesto, non l'intenzione`,
      `resta come abitudine di postura, prima ancora che come azione`,
      `emerge sotto pressione e poi rientra: è diventato un riflesso, non più un ruolo`,
    ],
    visual: [
      `il segno passa alla materia nuova: ${material}`,
      `stessa posizione sul corpo, materiale diverso — adesso ${material}`,
      `sopravvive ridotto a un dettaglio solo, coerente con la nuova materia`,
    ],
    symbolic: [
      `la contraddizione resta, ma cambia il lato che domina`,
      `lo stesso conflitto, ora visibile nella sagoma invece che nel comportamento`,
      `si è raffreddato in un simbolo: c'è, e non si discute più`,
    ],
    memory: [
      `passa in forma parziale: resta la sensazione, si perde il dettaglio`,
      `torna come preferenza inspiegata — non sa perché, lo fa e basta`,
      `sopravvive come citazione interna, mai detta ad alta voce`,
    ],
    relational: [
      `lo stesso modo di rivolgersi a VINZ, con una voce nuova sopra`,
      `resta ma si accorcia: la relazione ha preso confidenza`,
      `riappare solo nei momenti di calo, come una vecchia abitudine`,
    ],
  };

  const list = options[kind];
  return list[variant % list.length]!;
}
