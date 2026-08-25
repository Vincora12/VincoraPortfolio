/* ============================================================================
   PROPOSTE DI CATALOGO — «come aggiungo una Family, come modifico MICROBE»

   🔷 «Aspetta io avevo modificato... come faccio ad aggiungere altre idee di
   famiglia e come faccio a modificare l'idea tipo del microbi. Questa cosa
   per ogni valore ovviamente.»

   ════════════════════════════════════════════════════════════════════════════
   PERCHÉ QUESTO È DIVERSO DA `catalogTuning.ts` E `axisTuning.ts`

   Quei due file cambiano QUANTO esce una voce che esiste già. Qui si scrive
   una voce che NON esiste — o si riscrive il contenuto creativo di una che
   c'è, tipo MICROBE. Non è un numero da girare: `coreAnatomy`, `absoluteRule`
   e `fit` finiscono dentro i prompt veri, e `fit` pesa la stessa formula di
   punteggio che tara la rarità.

   🔒 QUINDI QUESTO FILE NON TOCCA MAI `generation-config.ts`. Le proposte
   vivono in una coda a parte (`localStorage`), lette e scritte solo da
   questa stanza del lab. Non c'è nessun punto in cui il generatore VERO le
   legga: `FAMILIES`, `AFFINITIES` eccetera restano esattamente quelli
   verificati da `verify:batch`.

   🔷 Approvare una proposta qui NON la fa entrare nel gioco. È la stessa
   regola già scritta per DESIGN AI («No automatic promotion. No silent
   GitHub writes.»), estesa dal design al catalogo: «APPLICA» qui vuol dire
   «pronta, aspetta che qualcuno la porti dentro scrivendo il codice e
   verificando che le distribuzioni reggano» — non «è già viva».
   ========================================================================= */

import type { ArchetypeMass, SignalKey } from './generation-config';

export type TaxonomyAxis = 'family' | 'affinity' | 'role' | 'fashion' | 'mood';

export const TAXONOMY_AXES: { id: TaxonomyAxis; label: string; nota: string }[] = [
  { id: 'family', label: 'FAMILY', nota: 'la specie: che corpo ha. Lo schema più ricco — coreAnatomy, drivers, regola assoluta, pesi, archetipi.' },
  { id: 'affinity', label: 'AFFINITY', nota: 'la contaminazione: cosa tocca il corpo senza sostituirlo.' },
  { id: 'role', label: 'RUOLO', nota: 'come sta al mondo.' },
  { id: 'fashion', label: 'STILE', nota: 'la logica di vestizione.' },
  { id: 'mood', label: 'TEMPERAMENTO', nota: 'il carattere con cui nasce.' },
];

/* Le quattro voci "semplici" condividono la stessa forma — id, un campo di
   prosa inglese, e `it` — ma quel campo si chiama diverso per ognuna, perché
   così lo chiama il file vero. Tenerlo qui evita di doverlo ricordare fuori
   da questo modulo. */
export const SIMPLE_FIELD_NAME: Record<Exclude<TaxonomyAxis, 'family'>, string> = {
  affinity: 'effect',
  role: 'translation',
  fashion: 'language',
  mood: 'presence',
};

export interface ArchetypeDraft {
  id: string;
  structure: string;
  mass: ArchetypeMass;
}

export interface FamilyDraft {
  id: string;
  coreAnatomy: string;
  it: string;
  drivers: string;
  absoluteRule: string;
  fit: { signal: SignalKey; weight: number }[];
  archetypes: ArchetypeDraft[];
  supportsHair: boolean;
  supportsEyewear: boolean;
  humanoidityMin: number;
  humanoidityMax: number;
}

export interface SimpleDraft {
  id: string;
  it: string;
  descrizione: string;
}

export interface Proposta {
  id: string;
  asse: TaxonomyAxis;
  /** L'id della voce esistente da cui è partita, o null se è nuova di zecca. */
  basataSu: string | null;
  /** La richiesta originale di Vincenzo, in italiano. */
  richiesta: string;
  quando: number;
  stato: 'bozza' | 'approvata';
  family?: FamilyDraft;
  semplice?: SimpleDraft;
}

const CHIAVE = 'vinzmon.taxonomyProposals.v1';

function leggi(): Proposta[] {
  try {
    const raw = localStorage.getItem(CHIAVE);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? (v as Proposta[]) : [];
  } catch {
    return [];
  }
}

let proposte: Proposta[] = typeof localStorage === 'undefined' ? [] : leggi();
const ascoltatori = new Set<() => void>();

function salva() {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(proposte));
  } catch {
    /* senza scrittura la coda vale per questa sessione */
  }
  ascoltatori.forEach((f) => f());
}

export function elencoProposte(): Proposta[] {
  return proposte;
}

export function subscribeProposte(f: () => void): () => void {
  ascoltatori.add(f);
  return () => ascoltatori.delete(f);
}

export function salvaBozza(bozza: Omit<Proposta, 'id' | 'quando' | 'stato'>): Proposta {
  const nuova: Proposta = { ...bozza, id: `prop_${Date.now()}`, quando: Date.now(), stato: 'bozza' };
  proposte = [...proposte, nuova];
  salva();
  return nuova;
}

export function approva(id: string): void {
  proposte = proposte.map((p) => (p.id === id ? { ...p, stato: 'approvata' } : p));
  salva();
}

export function aggiorna(id: string, cambi: Partial<Pick<Proposta, 'family' | 'semplice'>>): void {
  proposte = proposte.map((p) => (p.id === id ? { ...p, ...cambi } : p));
  salva();
}

export function rimuovi(id: string): void {
  proposte = proposte.filter((p) => p.id !== id);
  salva();
}
