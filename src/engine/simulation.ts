/* ============================================================================
   SIMULAZIONE (§20)

   🔒 LOCKED (§20): il prototipo deve includere uno strato di simulazione per
   sviluppatori capace di bypassare tempo reale, integrazioni non disponibili
   e chiamate API mancanti SENZA cambiare il modello di prodotto.

   §25 — questo è un cheat di prototipo dichiarato: i controlli di tempo stanno
   al posto dell'accumulo reale di calendario e dati. Sostituirli con
   HealthKit / Google Fit non deve cambiare niente a valle.

   Funzioni pure: la mutazione dello stato sta nello store.
   ========================================================================= */

import { pick, type Rng } from './rng';
import type { Memory, MemoryKind, MonRecord } from './types';
import { displayName } from './types';

/* --- Eventi giornalieri ---------------------------------------------------- */

export interface DailyEvent {
  kind: MemoryKind;
  title: string;
  text: string;
  /** Vero se l'evento merita di diventare una memoria persistente (§8.2). */
  memorable: boolean;
}

const EVENT_TEMPLATES: { kind: MemoryKind; title: string; texts: string[]; memorable: boolean }[] = [
  {
    kind: 'workout',
    title: 'Allenamento registrato',
    texts: [
      'Sessione completata. Nessun record, ma è andata.',
      'Hai spinto più del solito.',
      'Allenamento breve, fatto comunque.',
    ],
    memorable: false,
  },
  {
    kind: 'conversation',
    title: 'Conversazione',
    texts: [
      'Avete parlato di qualcosa che non riguardava i dati.',
      'Una domanda a cui non hai risposto subito.',
      'Ha insistito. Tu hai cambiato argomento.',
    ],
    memorable: true,
  },
  {
    kind: 'milestone',
    title: 'Soglia superata',
    texts: [
      'Una settimana intera senza saltare un giorno.',
      'Il recupero è tornato sopra la linea.',
      'Prima volta che tutti i segnali sono leggibili nello stesso giorno.',
    ],
    memorable: true,
  },
  {
    kind: 'joke',
    title: 'Battuta interna',
    texts: [
      'Una cosa che ora non potete più smettere di ripetere.',
      'Ha frainteso di proposito. Ha funzionato.',
      'Nessuno dei due ricorda come è iniziata.',
    ],
    memorable: true,
  },
  {
    kind: 'gift',
    title: 'Nuovo oggetto',
    texts: [
      'Gli hai lasciato qualcosa. Lo tiene addosso.',
      'Ha trovato una cosa e ha deciso che è sua.',
    ],
    memorable: true,
  },
  {
    kind: 'event',
    title: 'Segnale anomalo',
    texts: [
      'Un dato fuori scala. Non è un errore, è successo qualcosa.',
      'Il sistema ha registrato una discontinuità.',
      'Un giorno che non somiglia agli altri.',
    ],
    memorable: true,
  },
];

/** Estrae un evento per il giorno corrente. Deterministico dal seed. */
export function rollDailyEvent(rng: Rng, logged: boolean, workout: boolean): DailyEvent | null {
  if (!logged) return null;

  const pool = EVENT_TEMPLATES.filter((t) => (t.kind === 'workout' ? workout : true));
  // La maggior parte dei giorni non produce niente di notevole: le memorie
  // devono restare rare per contare qualcosa (§8.2).
  if (rng() > (workout ? 0.42 : 0.24)) return null;

  const template = pick(rng, pool);
  return {
    kind: template.kind,
    title: template.title,
    text: pick(rng, template.texts),
    memorable: template.memorable,
  };
}

/* --- Memorie (§8.2) -------------------------------------------------------- */

export function makeMemory(params: {
  id: string;
  day: number;
  event: DailyEvent;
  monName: string;
}): Memory {
  return {
    id: params.id,
    day: params.day,
    kind: params.event.kind,
    title: params.event.title,
    text: params.event.text,
    monName: params.monName,
  };
}

/**
 * §8.2 — "Memories belong to the relationship and can survive a branch in
 * transformed/partial form."
 * Al branch una parte delle memorie passa al nuovo .mon, ma riscritta: resta
 * la sensazione, si perde il dettaglio. Le altre restano nell'archivio legate
 * al .mon che le ha vissute.
 */
export function carryMemoriesThroughBranch(
  rng: Rng,
  memories: readonly Memory[],
  previous: MonRecord,
  newMonName: string,
): Memory[] {
  const fromPrevious = memories.filter((m) => m.monName === previous.data.name);
  const survivors = fromPrevious.filter(() => rng() < 0.35);

  return survivors.map((m, i) => ({
    id: `${m.id}_carried_${i}`,
    day: m.day,
    kind: m.kind,
    title: m.title,
    text: partialise(rng, m.text),
    monName: newMonName,
    carriedFrom: previous.data.name,
  }));
}

/** Rende parziale un ricordo trasmesso: è passato attraverso una deviazione. */
function partialise(rng: Rng, text: string): string {
  const forms = [
    `Qualcosa di questo è rimasto: ${lowerFirst(text)}`,
    `Non ricorda i dettagli. Ricorda che ${lowerFirst(text)}`,
    `Arriva da prima di lui: ${lowerFirst(text)}`,
  ];
  return pick(rng, forms);
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/* --- Etichette --------------------------------------------------------------*/

export const MEMORY_KIND_LABELS: Record<MemoryKind, string> = {
  conversation: 'CONVERSAZIONE',
  milestone: 'TRAGUARDO',
  joke: 'BATTUTA',
  event: 'EVENTO',
  gift: 'OGGETTO',
  workout: 'ALLENAMENTO',
};

/** Raggruppa le memorie per fascia temporale, come nel board (S11). */
export function groupMemoriesByAge(
  memories: readonly Memory[],
  today: number,
): { label: string; items: Memory[] }[] {
  const buckets: { label: string; items: Memory[]; max: number }[] = [
    { label: 'OGGI', items: [], max: 0 },
    { label: 'QUESTA SETTIMANA', items: [], max: 7 },
    { label: '2 SETTIMANE FA', items: [], max: 14 },
    { label: 'PIÙ INDIETRO', items: [], max: Infinity },
  ];

  for (const m of [...memories].sort((a, b) => b.day - a.day)) {
    const age = today - m.day;
    const bucket = buckets.find((b) => age <= b.max) ?? buckets[buckets.length - 1]!;
    bucket.items.push(m);
  }

  return buckets.filter((b) => b.items.length > 0).map(({ label, items }) => ({ label, items }));
}

/** Riepilogo testuale di un .mon per la timeline della storia (§20 di §12). */
export function monSummaryLine(record: MonRecord): string {
  const d = record.data;
  const form = d.evolution_state?.label ?? 'BASIC FORM';
  return `${displayName(d.name)} — ${form} · ${d.family} / ${d.affinity}`;
}
