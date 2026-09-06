/* ============================================================================
   IL MONDO, IL CANONE E IL REGISTRO NARRATIVO
   (VINZMON_COMPLETE_NARRATIVE_SYSTEM_FOR_CLAUDE v4 §10.2 · §13 · §14 · §15.1)

   🔷 «Inner World è uno strato narrativo persistente, non una modalità RPG
   con navigazione, missioni o combattimento.»

   ════════════════════════════════════════════════════════════════════════════
   IL MONDO APPARTIENE AL MON, NON ALLA FORMA. È la riga di §13 che decide
   tutta la struttura di questo file: «A World belongs to the MON's history,
   not only to the current form.»

   MASTER COMPLETION aggiorna il confine: TUNE mantiene lo stesso World,
   RISE apre un nuovo World e archivia quello precedente con il suo ledger.
   `store.ts:revealFormEvolution` applica questa distinzione alla rivelazione completata.
   Non c'è un World per ogni forma: più TUNE possono vivere nello stesso luogo.
   Il canone dei World precedenti rimane intatto nell'archivio.
   ════════════════════════════════════════════════════════════════════════════

   🔒 QUATTRO CATEGORIE EPISTEMICHE, E NON SONO PEDANTERIA (§15.1). Un'app che
   racconta storie sulla vita di qualcuno ha un modo preciso di fare danno:
   dire una cosa inventata con lo stesso tono di una cosa successa. Qui ogni
   voce del canone dichiara da dove viene, e la promozione da ipotesi a canone
   è un gesto esplicito — mai una cosa che succede da sola perché il modello
   ha scritto bene.

   🔒 E IL MONDO NON PRODUCE SYNC (§12). Nessuna funzione di questo file tocca
   la progressione. Il canone cresce perché succedono cose, non per premiare
   chi gioca di più: «Narrative play does not generate Sync.»
   ========================================================================= */

import type { MonRecord } from './types';
import { displayName } from './types';
import { CULTURAL_REFERENCES } from './generation-config';

/* --- §15.1 — da dove viene una cosa che il sistema afferma ----------------- */

/**
 * ⚠️ L'ORDINE NON È CASUALE: è una scala di autorità, dal più solido al più
 * fragile, e l'interfaccia la rispetta quando deve scegliere cosa mostrare.
 */
export type Epistemic =
  /** Successo davvero, e l'utente l'ha detto o registrato. */
  | 'FACT'
  /** Validato come vero DENTRO la storia. Non pretende di essere successo. */
  | 'WORLD_CANON'
  /** Un significato che ha dato l'utente. Persistente, e attribuito a lui. */
  | 'PLAYER_MEANING'
  /**
   * Una connessione proposta da VINZ.MON.
   *
   * 🔒 «Hypothesis; never silently promoted». Resta un'ipotesi finché qualcuno
   * non la conferma, e la promozione passa da `promoteConnection` — una
   * funzione con un nome, non un effetto collaterale.
   */
  | 'AI_CONNECTION';

/** Come si legge in italiano, dove va mostrata. */
export const EPISTEMIC_LABEL: Record<Epistemic, string> = {
  FACT: 'SUCCESSO DAVVERO',
  WORLD_CANON: 'CANONE',
  PLAYER_MEANING: 'L’HAI DETTO TU',
  AI_CONNECTION: 'IPOTESI',
};

/** Quello che sopravvive a un reset di interpretazione, e quello che no. */
export function isPersistent(kind: Epistemic): boolean {
  return kind !== 'AI_CONNECTION';
}

/* --- Il canone ------------------------------------------------------------- */

export type CanonKind =
  | 'origin'
  | 'evolution'
  | 'mega-evolution'
  | 'world-change'
  | 'return'
  | 'connection';

export interface CanonEvent {
  id: string;
  day: number;
  kind: CanonKind;
  epistemic: Epistemic;
  /** Il testo come lo legge l'utente. Una o due frasi, mai un paragrafo. */
  text: string;
  /** La forma che c'era quando è successo. Etichetta, non contenitore. */
  monName: string;
}

/* --- Il mondo -------------------------------------------------------------- */

export interface World {
  id: string;
  /** Come VINZ.MON lo ha indicizzato. Non è un titolo: è un riferimento. */
  name: string;
  /** Com'è adesso. Cambia con le evoluzioni, non riparte. */
  description: string;
  /** Il giorno in cui è emerso. */
  emergedOnDay: number;
  /** Il nome della forma con cui è emerso. Serve alla memoria, non al legame. */
  emergedWith: string;
  /** Identità narrativa stabile del luogo. Assente nei World legacy. */
  identity?: string;
  /** Riferimenti culturali del luogo, distinti dal Cultural DNA del Mon. */
  worldCulturalDna?: string[];
  /**
   * 🔷 Narrative System Phase 2 — presente solo sui World aperti da una RISE
   * (mega-evoluzione). Assente sui World seminati da `seedWorld` (nascita) e
   * su ogni World legacy: non si fabbrica una provenienza che non c'era.
   */
  previousWorldId?: string;
  canon: CanonEvent[];
}

/**
 * Seleziona in modo deterministico un piccolo Cultural DNA per il World.
 * Riusa lo stesso catalogo del Mon, ma applica segnali narrativi e novelty
 * per evitare di copiare semplicemente la forma che lo ha aperto.
 */
export function resolveWorldCulturalDna(record: MonRecord, seed: number): string[] {
  const source = new Set(record.data.cultural_dna ?? []);
  const narrative = `${record.data.narrativeDNA?.archetype ?? ''} ${record.data.narrativeDNA?.drive ?? ''} ${record.data.narrativeDNA?.contradiction ?? ''}`.toLowerCase();
  const hash = (text: string) => {
    let value = seed >>> 0;
    for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
    return value >>> 0;
  };
  const ranked = CULTURAL_REFERENCES.map((ref) => ({
    ref,
    score:
      hash(`${ref.id}:${narrative}`) +
      (source.has(ref.id) ? 0x18000000 : 0) +
      (narrative.includes(ref.signal.toLowerCase()) ? 0x08000000 : 0),
  })).sort((a, b) => b.score - a.score);
  const selected: string[] = [];
  const clusters = new Set<string>();
  for (const item of ranked) {
    if (selected.length >= 4) break;
    if (clusters.has(item.ref.cluster)) continue;
    clusters.add(item.ref.cluster);
    selected.push(item.ref.id);
  }
  return selected;
}

/* ============================================================================
   §10.2 — IL REGISTRO: COSA È STATO PIANTATO E COSA È STATO RACCOLTO

   🔷 «Before inventing new lore, inspect open setups and existing canon.
   Prefer callbacks, transformation and payoff over constant novelty.»

   ⚠️ È LA STESSA REGOLA DELLA VOCE, UN PIANO PIÙ SU. In `voicePrompt.ts` c'è
   già «NON RIPETERTI» sulle frasi; qui vale sulle IDEE. Un narratore senza
   registro non si accorge di aver già usato il corridoio tre volte, e la
   quarta volta il corridoio non significa più niente.
   ========================================================================= */

export interface Setup {
  id: string;
  summary: string;
  status: 'open' | 'paid_off' | 'abandoned';
  /** Quando è stato piantato: un filo aperto da mesi pesa diverso. */
  day: number;
}

export interface StoryLedger {
  /** Immagini che tornano. Poche: se sono venti non sono motivi, è rumore. */
  recurringMotifs: string[];
  /** Domande che il racconto ha lasciato aperte. */
  openThreads: string[];
  setups: Setup[];
  /** Cosa è già stato raccolto. Serve a non raccoglierlo due volte. */
  pastPayoffs: string[];
  /** Cose che il narratore ha già fatto e non deve rifare. */
  doNotRepeat: string[];
}

export function emptyLedger(): StoryLedger {
  return { recurringMotifs: [], openThreads: [], setups: [], pastPayoffs: [], doNotRepeat: [] };
}

/**
 * Il registro come lo legge il modello, prima di scrivere.
 *
 * 🔒 IN NEGATIVO PRIMA CHE IN POSITIVO. Le righe che contano davvero sono
 * «non rifare questo» e «questi fili sono aperti»: un modello a cui dai solo
 * i motivi ricorrenti li usa TUTTI, ogni volta, e li consuma in tre giri.
 */
export function ledgerBlock(ledger: StoryLedger): string {
  const open = ledger.setups.filter((s) => s.status === 'open');
  const lines: string[] = [];

  if (ledger.doNotRepeat.length > 0) {
    lines.push('COSE CHE HAI GIÀ FATTO E NON DEVI RIFARE:');
    lines.push(...ledger.doNotRepeat.slice(-8).map((d) => `- ${d}`));
    lines.push('');
  }
  if (open.length > 0) {
    lines.push('FILI ANCORA APERTI — raccoglierne uno vale più che aprirne un altro:');
    lines.push(...open.slice(-6).map((s) => `- (giorno ${s.day}) ${s.summary}`));
    lines.push('');
  }
  if (ledger.openThreads.length > 0) {
    lines.push('DOMANDE RIMASTE SENZA RISPOSTA:');
    lines.push(...ledger.openThreads.slice(-5).map((q) => `- ${q}`));
    lines.push('');
  }
  if (ledger.recurringMotifs.length > 0) {
    lines.push(
      `IMMAGINI CHE TORNANO (usane AL MASSIMO una, e solo se serve): ${ledger.recurringMotifs.slice(-6).join(' · ')}`,
    );
    lines.push('');
  }
  if (ledger.pastPayoffs.length > 0) {
    lines.push(`GIÀ RACCOLTO, non richiuderlo di nuovo: ${ledger.pastPayoffs.slice(-5).join(' · ')}`);
  }

  return lines.length > 0
    ? lines.join('\n')
    : 'REGISTRO VUOTO: è la prima volta che racconti questo mondo. Puoi piantare, non raccogliere.';
}

/* --- Scrivere nel registro e nel canone ------------------------------------ */

/** Aggiunge una voce al canone senza mai riscrivere quelle vecchie. */
export function withCanon(world: World, event: CanonEvent): World {
  /* 🔒 Un id già presente non si aggiorna: si ignora. Il canone è un registro,
     e un registro che si può correggere a posteriori non è un registro. */
  if (world.canon.some((e) => e.id === event.id)) return world;
  return { ...world, canon: [...world.canon, event] };
}

/**
 * Promuove un'ipotesi del modello a canone.
 *
 * 🔒 ESISTE COME FUNZIONE CON UN NOME proprio per questo: §15.1 dice «never
 * silently promoted», e l'unico modo di garantirlo è che la promozione non
 * possa succedere per distrazione dentro un'altra operazione.
 */
export function promoteConnection(world: World, eventId: string): World {
  return {
    ...world,
    canon: world.canon.map((e) =>
      e.id === eventId && e.epistemic === 'AI_CONNECTION' ? { ...e, epistemic: 'WORLD_CANON' } : e,
    ),
  };
}

/** Chiude un setup dichiarando come è stato raccolto. */
export function payOff(ledger: StoryLedger, setupId: string, how: string): StoryLedger {
  return {
    ...ledger,
    setups: ledger.setups.map((s) => (s.id === setupId ? { ...s, status: 'paid_off' } : s)),
    pastPayoffs: [...ledger.pastPayoffs, how].slice(-24),
  };
}

/* --- Il mondo come lo legge il modello ------------------------------------- */

/**
 * 🔒 IL CANONE ARRIVA IN ORDINE E CON LE ETICHETTE. Senza le etichette il
 * modello legge venti righe tutte ugualmente vere e ne deduce che può
 * inventarne una ventunesima dello stesso peso — che è esattamente il modo in
 * cui un'ipotesi diventa biografia senza che nessuno l'abbia decisa.
 */
export function worldBlock(world: World | null): string {
  if (!world) return 'NESSUN MONDO ANCORA: quello che scrivi adesso è la prima cosa che esiste.';

  const recent = world.canon.slice(-10);
  return [
    `IL MONDO: ${world.name}`,
    world.description,
    `Emerso il giorno ${world.emergedOnDay}, con ${displayName(world.emergedWith)}.`,
    /* 🔷 Narrative System Phase 2 — GOAL 5: il World Cultural DNA esisteva già
       (`resolveWorldCulturalDna`) ma nessun prompt lo leggeva mai. È tono e
       vocabolario del LUOGO, non anatomia del .mon — resta fuori dal
       compilatore immagini di proposito (vedi `promptFor.ts`, mai importato
       qui). */
    ...(world.worldCulturalDna && world.worldCulturalDna.length > 0
      ? [`RIFERIMENTI CULTURALI DEL LUOGO (tono, non aspetto fisico del .mon): ${world.worldCulturalDna.join(', ')}`]
      : []),
    '',
    recent.length > 0 ? 'QUELLO CHE È GIÀ VERO QUI (non contraddirlo):' : 'Il canone è ancora vuoto.',
    ...recent.map((e) => `- [${EPISTEMIC_LABEL[e.epistemic]}] giorno ${e.day}: ${e.text}`),
  ].join('\n');
}

/* ============================================================================
   §14 — RETURN / «RIPARTI DA QUI»

   🔷 «Return is not loading an old save. The user returns as their current
   self. The current MON form returns. Past canon remains intact while the
   World may have changed.»

   ⚠️ LA DIFFERENZA CON UN SALVATAGGIO È TUTTO IL PUNTO, e vale la pena dirla
   in codice invece che solo a parole: caricare un salvataggio ti riporta a
   com'eri. Un Return ti fa tornare in un posto che è andato avanti senza di
   te, con addosso il tempo che è passato. Per questo la funzione qui sotto
   riceve `elapsedDays` e il MON DI ADESSO — non quello di allora.
   ========================================================================= */

export interface ReturnContext {
  world: World;
  /** La forma con cui si torna: quella attuale, non quella di quando si è usciti. */
  record: MonRecord;
  /** Giorni passati dall'ultima voce del canone. */
  elapsedDays: number;
  ledger: StoryLedger;
}

export function returnBlock(ctx: ReturnContext): string {
  const last = ctx.world.canon.at(-1);
  return [
    worldBlock(ctx.world),
    '',
    `CHI TORNA: ${displayName(ctx.record.data.name)}, la forma di ADESSO.`,
    last
      ? `L’ULTIMA COSA SUCCESSA QUI risale al giorno ${last.day}: ${last.text}`
      : 'Non è ancora successo niente qui dentro.',
    ctx.elapsedDays > 0
      ? `SONO PASSATI ${ctx.elapsedDays} GIORNI. Il posto è andato avanti senza di voi: non è come l’avete lasciato, e non è un’altra cosa.`
      : 'Il tempo passato è poco: il posto è quasi come lo avete lasciato.',
    '',
    ledgerBlock(ctx.ledger),
  ].join('\n');
}

/* --- Il mondo appena nato -------------------------------------------------- */

/**
 * Il primo mondo, deterministico.
 *
 * 🔒 DETERMINISTICO PERCHÉ DEVE ESISTERE SEMPRE. Stessa regola della bio e del
 * narratore (MASTER SPEC §17): una creatura nata senza chiave AI deve avere
 * comunque un mondo, altrimenti il Return e il canone sarebbero funzioni che
 * girano a vuoto proprio per chi non ha ancora attivato niente.
 */
export function seedWorld(record: MonRecord, day: number): World {
  const d = record.data;
  const affinity = d.affinity.toLowerCase();
  const id = `world_${d.mindline_node}`;
  const worldCulturalDna = resolveWorldCulturalDna(record, day);
  return {
    id,
    name: `SOGLIA ${d.affinity}`,
    description: `Un posto che si è aperto insieme a ${displayName(d.name)} e che porta i segni della sua affinità ${affinity}. Nessuno lo ha ancora attraversato fino in fondo.`,
    identity: `Una soglia nata con ${displayName(d.name)}: un luogo ancora aperto, segnato da ${worldCulturalDna.join(', ')}.`,
    worldCulturalDna,
    emergedOnDay: day,
    emergedWith: d.name,
    canon: [
      {
        id: `canon_origin_${d.mindline_node}`,
        day,
        kind: 'origin',
        epistemic: 'WORLD_CANON',
        text: `${displayName(d.name)} è arrivato, e con lui questo posto.`,
        monName: d.name,
      },
    ],
  };
}

/* ============================================================================
   RISE — Narrative System Phase 2, decisione canonica

   🔷 «TUNE → VINZ.MON evolve → STESSO World. RISE → VINZ.MON megaevolve →
   World NUOVO.» Fino a qui il codice reale trattava evoluzione e
   mega-evoluzione allo stesso modo (`revealFormEvolution` in `store.ts`
   chiamava `withCanon` identico per entrambe) — CORE EXTRACTION PHASE 3 lo ha
   tracciato e documentato come discrepanza, non lo ha corretto perché
   correggerlo era lavoro di Narrative. Questa è quella decisione, presa.

   🔒 TUNE resta esattamente com'era: la sezione qui sopra (§13 nel commento
   di store.ts, «il mondo non riparte, si stratifica») continua a valere per
   l'evoluzione ordinaria. RISE è l'eccezione dichiarata, non una riscrittura
   della regola generale.
   ========================================================================= */

/**
 * Il World dopo una RISE: non uno strato dello stesso posto — una soglia
 * nuova, con una provenienza dichiarata.
 *
 * 🔒 NON È UN SECONDO GENERATORE. Riusa `resolveWorldCulturalDna`, lo stesso
 * schema id (`world_<mindline_node>`, sempre univoco: ogni forma ha il suo
 * nodo) e la stessa garanzia di `seedWorld` — un World deterministico che
 * esiste anche senza chiave AI. Quello che cambia è solo cosa ci si
 * costruisce sopra: qui c'è un `previousWorldId` e il canone si apre con un
 * evento `world-change`, non `origin` — quel posto non nasce dal nulla,
 * arriva da un altro.
 */
export function riseWorld(previous: World, record: MonRecord, day: number): World {
  const d = record.data;
  const affinity = d.affinity.toLowerCase();
  const id = `world_${d.mindline_node}`;
  const worldCulturalDna = resolveWorldCulturalDna(record, day);
  return {
    id,
    name: `SOGLIA ${d.affinity}`,
    description: `Un posto che si è aperto quando ${displayName(d.name)} ha lasciato ${previous.name} — uno strato che quel posto non arrivava a mostrare, segnato dall'affinità ${affinity}. Nessuno lo ha ancora attraversato fino in fondo.`,
    identity: `Una soglia aperta da una RISE, dopo ${previous.name}: segnata da ${worldCulturalDna.join(', ')}.`,
    worldCulturalDna,
    emergedOnDay: day,
    emergedWith: d.name,
    previousWorldId: previous.id,
    canon: [
      {
        id: `canon_world-change_origin_${d.mindline_node}`,
        day,
        kind: 'world-change',
        epistemic: 'WORLD_CANON',
        text: `${displayName(d.name)} è arrivato qui lasciandosi dietro ${previous.name}. Quello che era vero là non smette di esserlo: qui comincia un'altra pagina.`,
        monName: d.name,
      },
    ],
  };
}
