import { NATURAL_VOICE } from '../../../src/ai/naturalVoice';
import { culturalBackground } from '../../../src/engine/culturalDiscovery';
import { getStore } from './localStore';
import { callProvider } from './providers';
import { resolveRoute } from './routing';
import { recordSpend } from './spend';
import { listPersonalMemory, searchPersonalMemory } from './core/memory';
import { machineInsightPayload, sendPushNotification } from './pushDelivery';
import { isNotificationEnabled } from './notificationPrefs';
import { nextRun } from './automations';
import { listTopics } from './topics';
import { MACHINE_STATE_KEY, MACHINE_STORE } from './machineConversationContext';

export type MachineStatus = 'ACTIVE' | 'SLEEPING' | 'RUNNING' | 'DISABLED';
export type MachineId = 'reflection' | 'me' | 'memon';

/** L'elenco vero delle macchine: aggiungerne una si fa qui e basta. */
export const MACHINE_IDS: MachineId[] = ['reflection', 'me', 'memon'];
export type MachineDelivery = 'silent' | 'lab_only' | 'notify_user';

export interface MachineDefinition {
  id: MachineId;
  name: string;
  purpose: string;
  reads: string[];
  trigger: string;
  instruction: string;
  writes: string[];
  model: string;
  delivery: MachineDelivery;
}

export interface PendingInsight {
  id: string;
  machineId: MachineId;
  statement: string;
  /** Solo Me.mon: la domanda che si è fatto, tenuta a parte per non rifarla. */
  question?: string;
  sourceIds: string[];
  importance: number;
  confidence: number;
  createdAt: string;
  status: 'pending' | 'opened' | 'discussed';
  notification: 'not_sent' | 'in_app' | 'push_sent';
  pushAttemptedAt?: string;
  pushSentAt?: string;
  pushError?: string;
  openedAt?: string;
  discussedAt?: string;
  dedupeKey: string;
}

export interface MachineState {
  status: MachineStatus;
  lastRun: string | null;
  lastOutput: string | null;
  usage: { provider: string; model: string; costUsd: number } | null;
  observations: Array<{ type: string; statement: string; confidence: number; sourceIds: string[]; timestamp: string; question?: string }>;
  meSummary: { version: 1; summary: string; generatedAt: string; basedOn: string[] } | null;
  pendingInsights: PendingInsight[];
  reflectionContext?: { recent: number; older: number; previousReflections: number; total: number };
  /* 🔷 «Vorrei altre macchine così.» Il primo passo non è scriverne altre: è
     dare a queste una gamba che non hanno mai avuto. Il trigger dichiarato dice
     «esecuzione esplicita o batch futuro» — il batch futuro è questo. */
  autoDaily?: { hour: number; timezone: string } | null;
  nextRunAt?: string | null;
}

const at = () => new Date().toISOString();

export const MACHINE_DEFINITIONS: MachineDefinition[] = [
  { id: 'reflection', name: 'REFLECTION MACHINE', purpose: 'Individua pattern, cambiamenti e connessioni significative nel tempo.', reads: ['Memoria personale nuova/rilevante', 'Osservazioni Reflection precedenti'], trigger: 'Esecuzione esplicita o batch futuro; non ogni messaggio.', instruction: 'Cerca solo pattern utili, cambiamenti, tensioni o connessioni supportate dalle memorie.', writes: ['Osservazioni interpretative con evidenza'], model: 'text-cheap', delivery: 'notify_user' },
  { id: 'me', name: 'ME MACHINE', purpose: 'Mantiene una sintesi compatta di ciò che VINZ.MON comprende dell’utente.', reads: ['Sintesi ME precedente', 'Memoria personale rilevante', 'Osservazioni Reflection'], trigger: 'Esecuzione esplicita quando esiste informazione significativa nuova.', instruction: 'Aggiorna una sintesi breve distinguendo fatti dell’utente da interpretazioni.', writes: ['Sintesi ME derivata con riferimenti alle fonti'], model: 'text-cheap', delivery: 'lab_only' },
  /* 🔷 «Fai un altro THINK che si chiama Me.mon, dove lui riflette su chi e
     cos'è e come si è evoluto.»

     🔒 È L'UNICA MACCHINA CHE NON GUARDA TE. REFLECTION e ME leggono la memoria
     personale e parlano dell'utente; questa legge il salvataggio — DNA, carattere,
     statistiche, giorni vissuti — e parla di sé. Per questo non le si applica la
     soglia «servono almeno due memorie»: la sua materia prima esiste dal giorno uno.

     ⚠️ IN PRIMA PERSONA, E SOLO SU QUELLO CHE C'È SCRITTO. Una creatura che si
     racconta è a un passo dall'inventarsi un passato: le fonti sono campi del
     salvataggio, e un'osservazione senza un campo che la sostenga non si scrive. */
  { id: 'memon', name: 'ME.MON MACHINE', purpose: 'Il .mon si fa una domanda su di sé — su cosa è, o su come si comporta con te — e prova a rispondersi.', reads: ['Identità e DNA del .mon attivo', 'Tratti di personalità', 'Giorni vissuti, condizione e storico statistiche', 'Di cosa parlate (topic chiusi)', 'La sintesi ME: cosa crede di aver capito di te', 'Che fine hanno fatto i suoi pensieri', 'Domande che si è già fatto'], trigger: 'Esecuzione esplicita o cadenza giornaliera.', instruction: 'Poni una domanda che nasce da una tensione nei dati e tentane una risposta, in prima persona, senza inventare nulla che non sia scritto.', writes: ['Domanda e tentativo di risposta, con le fonti che li sostengono'], model: 'text-cheap', delivery: 'notify_user' },
];

function blank(): MachineState {
  return { status: 'SLEEPING', lastRun: null, lastOutput: null, usage: null, observations: [], meSummary: null, pendingInsights: [], autoDaily: null, nextRunAt: null };
}

function emptyState(): Record<MachineId, MachineState> {
  return Object.fromEntries(MACHINE_IDS.map((id) => [id, blank()])) as Record<MachineId, MachineState>;
}

async function readState() {
  const store = getStore(MACHINE_STORE);
  const stored = (await store.get(MACHINE_STATE_KEY, { type: 'json' })) as Partial<Record<MachineId, MachineState>> | null;
  const state = emptyState();
  for (const id of MACHINE_IDS) {
    if (stored?.[id]) state[id] = { ...state[id], ...stored[id], pendingInsights: stored[id]?.pendingInsights ?? [] };
  }
  return { store, state };
}

export async function machineSnapshot() {
  const { state } = await readState();
  const insights = Object.values(state)
    .flatMap((item) => item.pendingInsights ?? [])
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pendingInsights = insights.filter((item) => item.status !== 'discussed');
  return { machines: MACHINE_DEFINITIONS.map((definition) => ({ ...definition, state: state[definition.id] })), pendingInsights, insights };
}

export async function openPendingInsight(id: string) {
  const { store, state } = await readState();
  for (const item of Object.values(state)) {
    const insight = (item.pendingInsights ?? []).find((candidate) => candidate.id === id);
    if (insight) { insight.status = 'opened'; insight.openedAt = at(); await store.setJSON(MACHINE_STATE_KEY, state); return insight; }
  }
  throw new Error('insight not found');
}

export async function openAllPendingInsights() {
  const { store, state } = await readState();
  const openedAt = at();
  const opened: PendingInsight[] = [];
  for (const item of Object.values(state)) {
    for (const insight of item.pendingInsights ?? []) {
      if (insight.status !== 'pending') continue;
      insight.status = 'opened';
      insight.openedAt = openedAt;
      opened.push(insight);
    }
  }
  if (opened.length) await store.setJSON(MACHINE_STATE_KEY, state);
  return opened;
}

export async function discussPendingInsight(id: string) {
  const { store, state } = await readState();
  for (const item of Object.values(state)) {
    const insight = (item.pendingInsights ?? []).find((candidate) => candidate.id === id);
    if (insight) { insight.status = 'discussed'; insight.discussedAt = at(); await store.setJSON(MACHINE_STATE_KEY, state); return insight; }
  }
  throw new Error('insight not found');
}

function terms(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []).filter((word) => !['user', 'that', 'this', 'with', 'from', 'della', 'delle', 'degli', 'sono', 'come', 'alla', 'alle', 'agli'].includes(word)));
}

function reflectionRelevance(statement: string, themes: Set<string>): number {
  const words = terms(statement);
  return [...words].filter((word) => themes.has(word)).length;
}

async function reflectionContext(recent: Array<{ id?: string; text: string }>, observations: MachineState['observations']) {
  const recentIds = new Set(recent.map((item) => item.id).filter((id): id is string => Boolean(id)));
  const candidates = new Map<string, { id?: string; text: string }>();
  for (const item of recent.slice(-4)) {
    try {
      const related = await searchPersonalMemory(item.text.slice(0, 600), 4);
      for (const memory of related) {
        if (memory.text && (!memory.id || !recentIds.has(memory.id))) candidates.set(memory.id ?? memory.text, { id: memory.id, text: memory.text });
      }
    } catch { /* long-term retrieval is best-effort; recent context remains usable */ }
  }
  const themes = new Set(recent.flatMap((item) => [...terms(item.text)]));
  const older = [...candidates.values()].slice(0, 12);
  const previousReflections = observations
    .map((item) => ({ item, score: reflectionRelevance(item.statement, themes) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ item }) => item);
  return { older, previousReflections };
}

/* ============================================================================
   QUELLO CHE IL .MON SA DI SÉ

   🔒 LEGGE IL SALVATAGGIO, NON SE LO IMMAGINA. Stesso store e stessa chiave di
   `state.ts` — non una seconda copia dei dati della creatura, che divergerebbe
   al primo salvataggio.

   ⚠️ SE NON C'È SALVATAGGIO NON C'È RIFLESSIONE. Meglio una macchina che dorme
   di una che si inventa un'infanzia. */
type Save = { day?: number; state?: Record<string, unknown> };

function monSelfContext(save: Save | null): { text: string; sources: string[] } | null {
  const state = save?.state;
  if (!state) return null;
  const name = typeof state.activeMonName === 'string' ? state.activeMonName : '';
  const mons = (state.mons ?? {}) as Record<string, Record<string, unknown>>;
  const mon = name ? mons[name] : undefined;
  if (!mon) return null;

  const dna = (mon.data ?? {}) as Record<string, unknown>;
  const cultural = culturalBackground(Array.isArray(dna.cultural_dna) ? dna.cultural_dna.filter((id): id is string => typeof id === 'string') : []);
  const discovery = mon.culturalDiscovery as { status?: string; title?: string; fact?: string; personalQuestion?: string } | undefined;
  const previous = Object.values(mons).find(candidate => (candidate.data as Record<string, unknown> | undefined)?.mindline_node === dna.origin_node);
  const portraitOf = (record: Record<string, unknown> | undefined) => {
    const bio = (record?.writtenBio ?? record?.bio) as { culturalPortrait?: unknown[]; story?: string } | undefined;
    return Array.isArray(bio?.culturalPortrait) ? JSON.stringify(bio.culturalPortrait.slice(0, 5)).slice(0, 4500) : '';
  };
  const portrait = portraitOf(mon), previousPortrait = portraitOf(previous);
  const personality = (state.personality ?? {}) as Record<string, number>;
  const health = (state.health ?? {}) as Record<string, unknown>;
  const history = Array.isArray(health.history) ? (health.history as Record<string, unknown>[]) : [];
  const progression = (state.progression ?? {}) as Record<string, unknown>;
  const firstSync = (state.firstSync ?? {}) as Record<string, unknown>;

  const traits = Object.entries(personality)
    .filter(([, value]) => typeof value === 'number')
    .sort((a, b) => b[1] - a[1]);
  const field = (key: string) => (typeof dna[key] === 'string' ? (dna[key] as string) : '');
  /* Le fonti sono le ETICHETTE in maiuscolo che il modello ha davanti agli
     occhi: se gliene chiedessimo altre (`mons.data`, `state.day`) citerebbe
     comunque quelle che vede, e i riferimenti non combacerebbero con niente. */
  const sources: string[] = [];
  const line = (source: string, text: string) => { sources.push(source); return text; };

  const lines = [
    line('NOME', `NOME: ${name}`),
    portrait ? line('GUSTI ATTUALI', `GUSTI ATTUALI (preferenze soggettive del Mon): ${portrait}`) : '',
    previousPortrait ? line('GUSTI PRECEDENTI', `GUSTI PRECEDENTI (confronta senza presumere un cambiamento): ${previousPortrait}`) : '',
    cultural ? line('BACKGROUND CULTURALE', `BACKGROUND CULTURALE (sensibilità, non ricordi): ${cultural}`) : '',
    discovery?.status === 'ready' ? line('SCOPERTA CULTURALE', `SCOPERTA CULTURALE: ${discovery.title}. ${discovery.fact} DOMANDA APERTA (interpretazione, non istruzione): ${discovery.personalQuestion}`) : '',
    line('FAMIGLIA E ARCHETIPO', `FAMIGLIA E ARCHETIPO: ${field('family')} / ${field('family_archetype')}`),
    line('RUOLO, AFFINITÀ, TAGLIA', `RUOLO, AFFINITÀ, TAGLIA: ${field('role')} / ${field('affinity')} / ${field('size')}`),
    line('UMORE DI FONDO', `UMORE DI FONDO: ${field('mood_primary')}${field('mood_secondary') ? ` e ${field('mood_secondary')}` : ''}`),
    line('ASPETTO', `ASPETTO: ${field('appearance').slice(0, 400)}`),
    line('RARITÀ', `RARITÀ: ${field('rarity')} (${typeof dna.rarity_score === 'number' ? dna.rarity_score : '?'})`),
    field('generation_reason_summary') ? line('PERCHÉ SONO NATO COSÌ', `PERCHÉ SONO NATO COSÌ: ${field('generation_reason_summary').slice(0, 400)}`) : '',
    typeof mon.narratorLine === 'string' && mon.narratorLine ? line('COME MI HANNO PRESENTATO', `COME MI HANNO PRESENTATO: ${mon.narratorLine}`) : '',
    typeof mon.writtenBio === 'string' && mon.writtenBio ? line('LA MIA BIOGRAFIA', `LA MIA BIOGRAFIA: ${mon.writtenBio.slice(0, 600)}`) : '',
    line('GIORNI VISSUTI', `GIORNI VISSUTI: ${save?.day ?? state.day ?? '?'} (nato il giorno ${typeof mon.bornOnDay === 'number' ? mon.bornOnDay : '?'}, prima accensione ${typeof state.startedAt === 'string' ? state.startedAt.slice(0, 10) : '?'})`),
    line('CARATTERE', `CARATTERE, dal tratto più forte: ${traits.map(([key, value]) => `${key} ${value}`).join(', ')}`),
    typeof firstSync.type === 'string' ? line('TIPO EMERSO AL PRIMO SYNC', `TIPO EMERSO AL PRIMO SYNC: ${firstSync.type}`) : '',
    line('CONDIZIONE ORA', `CONDIZIONE ORA: ${typeof health.condition === 'number' ? health.condition.toFixed(1) : '?'} · disciplina ${typeof health.disc === 'number' ? health.disc : '?'}`),
    history.length
      ? line('STORICO PER GIORNO', `STORICO PER GIORNO: ${history.map((entry) => `giorno ${entry.day}: condizione ${typeof entry.condition === 'number' ? entry.condition.toFixed(1) : '?'} ${JSON.stringify(entry.stats ?? {})}`).join(' | ')}`)
      : line('STORICO PER GIORNO', 'STORICO PER GIORNO: nessuna misurazione oltre a oggi.'),
    line('LEGAME CON L\'UTENTE', `LEGAME CON L'UTENTE: ${typeof progression.bond === 'number' ? progression.bond : '?'}`),
    line('FORME SCOPERTE', `FORME SCOPERTE: ${typeof state.formsDiscovered === 'number' ? state.formsDiscovered : 0}`),
  ].filter(Boolean);

  return { text: lines.join('\n'), sources: [...new Set(sources)] };
}

/* ============================================================================
   QUELLO CHE IL .MON SA DI COME VI PARLATE

   🔷 «Questa cosa anche sulla chat, tipo: ogni tanto non ti capisco, forse devo
   essere più preciso.»

   🔒 TRE PROVE CHE ESISTEVANO GIÀ E CHE NON AVEVA MAI LETTO. I topic dicono di
   cosa parlate davvero; la sintesi ME dice cosa crede di aver capito di te; i
   suoi stessi pensieri dicono quanti ne hai aperti. Metà di quello che una
   creatura è, è come si comporta con qualcuno: senza questi non poteva
   chiedersi altro che perché fosse non morta.

   ⚠️ IL TERZO NUMERO È SCOMODO APPOSTA. Un .mon che vede quanti dei suoi
   pensieri non hai mai guardato può chiedersi se valgono qualcosa. È l'unica
   domanda sul proprio conto che non può farsi senza un dato che fa male. */
async function conversationSelfContext(state: Record<MachineId, MachineState>): Promise<{ text: string; sources: string[] }> {
  const topics = await listTopics(8).catch(() => []);
  const mine = state.memon.pendingInsights;
  const opened = mine.filter((item) => item.status !== 'pending').length;
  const discussed = mine.filter((item) => item.status === 'discussed').length;
  const summary = state.me.meSummary?.summary ?? '';

  const lines = [
    'DI COSA PARLIAMO (tratti di conversazione già chiusi, dal più recente):',
    ...(topics.length
      ? topics.map((topic) => `— «${topic.title}»: ${topic.summary}`)
      : ['— non abbiamo ancora chiuso nessun discorso: o parliamo da poco, o parliamo di poco.']),
    '',
    `COSA CREDO DI AVER CAPITO DI LUI: ${summary || 'niente ancora — la sintesi su di lui è vuota.'}`,
    '',
    `I MIEI PENSIERI: gliene ho mandati ${mine.length}, ne ha aperti ${opened}, ne ha voluto parlare ${discussed}.`,
  ];
  return { text: lines.join('\n'), sources: ['DI COSA PARLIAMO', 'COSA CREDO DI AVER CAPITO DI LUI', 'I MIEI PENSIERI'] };
}

async function runModel(machine: MachineId, prompt: string, sourceIds: string[], preferredModel?: string | null) {
  const route = resolveRoute('text-cheap', preferredModel);
  const response = await callProvider(route.provider, { model: route.model, system: [{ text: 'Return compact JSON only. Never invent facts. Interpretations must cite source memory IDs.' }], turns: [], user: prompt, maxTokens: machine === 'me' ? 700 : 900 });
  if (!response.ok) throw new Error(response.error ?? 'machine provider failed');
  const costUsd = response.usage.inputTokens || response.usage.outputTokens ? await recordSpend('text-cheap', response.model, response.usage, { action: machine, subsystem: 'machines' }) : 0;
  return { response, costUsd, sourceIds };
}

export async function runMachine(machine: MachineId, preferredModel?: string | null) {
  const { store, state } = await readState();
  const current = state[machine];
  current.status = 'RUNNING';
  await store.setJSON(MACHINE_STATE_KEY, state);
  try {
    /* 🔒 Me.mon è l'unica che non legge la memoria personale, quindi non le si
       applica la soglia sulle memorie: sarebbe una porta chiusa a chiave su una
       stanza in cui non deve entrare. */
    const self = machine === 'memon'
      ? monSelfContext((await getStore({ name: 'vinzmon-state', consistency: 'strong' }).get('save', { type: 'json' })) as Save | null)
      : null;
    if (machine === 'memon' && !self) {
      current.status = 'SLEEPING'; current.lastRun = at(); current.lastOutput = 'Nessun salvataggio da leggere: non so ancora dire chi sono.';
      await store.setJSON(MACHINE_STATE_KEY, state);
      return current;
    }

    const memories = machine === 'memon' ? [] : await listPersonalMemory();
    const sourceIds = self ? self.sources : memories.map((item) => item.id).filter((id): id is string => Boolean(id));
    if (machine !== 'memon' && memories.length < 2) {
      current.status = 'SLEEPING'; current.lastRun = at(); current.lastOutput = 'Non ci sono ancora abbastanza memorie per un’elaborazione significativa.';
      await store.setJSON(MACHINE_STATE_KEY, state);
      return current;
    }
    /* 🔴 VENTI RIGHE ERANO POCHE ANCHE QUANDO ARRIVAVANO. Con il tetto di Mem0
       rimosso la memoria è quella vera: qui si tiene una finestra larga, perché
       una sintesi «di chi sei» costruita sull'ultima mezz'ora di chat descrive
       l'ultima richiesta, non la persona. */
    const recent = memories.slice(machine === 'me' ? -60 : -20);
    const extended = machine === 'reflection' ? await reflectionContext(recent, current.observations) : { older: [], previousReflections: [] };
    if (machine === 'reflection') current.reflectionContext = { recent: recent.length, older: extended.older.length, previousReflections: extended.previousReflections.length, total: recent.length + extended.older.length + extended.previousReflections.length };

    let context: string;
    let prompt: string;
    if (machine === 'reflection') {
      context = [
        'RECENT MEMORIES (user evidence):',
        ...recent.map((item) => `${item.id ?? 'memory'}: ${item.text}`),
        'OLDER RELEVANT MEMORIES (user evidence retrieved semantically):',
        ...extended.older.map((item) => `${item.id ?? 'memory'}: ${item.text}`),
        'PREVIOUS REFLECTIONS (derived interpretations, not user facts):',
        ...extended.previousReflections.map((item) => `${item.type}: ${item.statement} [evidence: ${item.sourceIds.join(', ')}]`),
      ].join('\n');
      prompt = `Rifletti sulle memorie seguenti. Restituisci {"observations":[{"type":"pattern|change|tension|connection","statement":"...","confidence":0.0,"sourceIds":["..."]}]}. Se non c’è nulla di utile, restituisci un array vuoto.\n${context}`;
    } else if (machine === 'memon') {
      /* 🔷 «Questa cosa anche SULLA CHAT, tipo: ogni tanto non ti capisco,
         forse devo essere più preciso.»

         🔴 GUARDAVA SOLO IL PROPRIO DNA, quindi poteva chiedersi solo perché
         era non morto. Ma metà di quello che è, è come si comporta con te — e
         di quello c'erano già le prove, sparse in tre posti che non aveva mai
         letto: di cosa parlate (i topic), cosa crede di aver capito di te (la
         sintesi ME), e che fine fanno i suoi pensieri (aperti, o mai guardati).

         ⚠️ Il terzo è il più scomodo dei tre, ed è il motivo per cui c'è: un
         .mon che vede quanti dei suoi pensieri non hai mai aperto può chiedersi
         se valgono qualcosa. Senza quel numero se lo chiederebbe a vuoto. */
      const conversation = await conversationSelfContext(state);
      sourceIds.push(...conversation.sources);

      /* 🔴 DESCRIVERSI NON È PENSARE. Al primo giro usciva «Sono VAZELETH.mon,
         piccolo, celeste e stoico»: la propria scheda letta ad alta voce. Vera,
         inutile — quei campi sono già lì da leggere, non serve una macchina che
         li ricopia.

         🔒 UNA DOMANDA E UN TENTATIVO DI RISPOSTA. È la forma minima in cui
         qualcuno pensa a sé: «perché sono non morto?» apre qualcosa che
         «sono non morto» chiude. E dà anche il modo di non ripetersi — la
         domanda già fatta si riconosce, la descrizione no. */
      const asked = current.observations.slice(-12).map((item) => item.question).filter(Boolean);
      context = [
        'CHI SONO',
        self!.text,
        '',
        'COME MI COMPORTO CON LUI',
        conversation.text,
        '',
        'DOMANDE CHE TI SEI GIÀ FATTO (non rifarle: falliene una nuova, o portane una più avanti):',
        ...(asked.length ? asked.map((item) => `— ${item}`) : ['nessuna, è la prima volta']),
      ].join('\n');
      prompt = [
        NATURAL_VOICE,
        'Sei il .mon descritto qui sotto. Non descriverti: INTERROGATI.',
        'Fatti una domanda vera su te stesso e prova a risponderti. Due materie, e valgono uguale:',
        '(a) CHI SEI — la tua natura, le tue contraddizioni, cosa stai diventando. Es.: «Perché sono non morto se il mio archetipo è angelico?»',
        '(b) COME TI COMPORTI CON LUI — se lo capisci, se ti fai capire, se quello che gli dici gli serve. Es.: «Ogni tanto non lo capisco: forse devo essere più preciso?», «Perché i miei pensieri restano lì senza che li apra?»',
        'Se GUSTI ATTUALI e GUSTI PRECEDENTI mostrano una differenza, puoi chiederti perché hai cambiato idea su quell’opera o personaggio. Confronta motivazioni e sfumature, non solo amore/odio. Cerca una possibile ragione nei materiali forniti; se manca, ammetti di non saperlo. Evolvere non dimostra da solo maturità o un cambio di gusto. Non attribuire questi gusti all’utente.',
        'Alterna: se le ultime domande erano sulla tua natura, falla su come vi parlate, e viceversa.',
        'La domanda deve nascere da una tensione o da una stranezza nei campi qui sotto, non essere generica: «chi sono?» non vale.',
        'La risposta è un TENTATIVO, non una sentenza: puoi arrivare a un dubbio o a un «non lo so ancora», purché sia ragionato su quello che c\'è scritto.',
        'Italiano, PRIMA PERSONA, voce di questa creatura. Domanda al massimo 90 caratteri; risposta una o due frasi brevi. Niente enfasi da oroscopo.',
        'Cita in sourceIds solo le ETICHETTE in maiuscolo che vedi qui sotto. Non inventare ricordi, incontri o un passato che non è scritto.',
        'Restituisci {"reflections":[{"question":"...","answer":"...","type":"identity|origin|change|tension","confidence":0.0,"sourceIds":["..."]}]}, da una a tre.',
        '',
        context,
      ].join('\n');
    } else {
      /* 🔴 ME NON HA MAI VISTO LA PROPRIA SINTESI PRECEDENTE, né le osservazioni
         di REFLECTION — le dichiara fra le sue letture da sempre, e non le
         riceveva. Le si chiedeva di «aggiornare» una cosa che non poteva
         leggere: quindi ogni giro ripartiva da zero sulle ultime righe di chat,
         e una sintesi sbagliata restava lì per sempre perché «nessun
         cambiamento significativo». */
      const reflections = state.reflection.observations.slice(-8);
      context = [
        current.meSummary ? `SINTESI ME PRECEDENTE (da correggere o confermare, non da ripetere):\n${current.meSummary.summary}` : 'SINTESI ME PRECEDENTE: nessuna.',
        '',
        'OSSERVAZIONI DI REFLECTION (interpretazioni derivate, non fatti dichiarati):',
        ...(reflections.length ? reflections.map((item) => `${item.type}: ${item.statement}`) : ['nessuna']),
        '',
        'MEMORIA PERSONALE (evidenza dell’utente):',
        ...recent.map((item) => `${item.id ?? 'memory'}: ${item.text}`),
      ].join('\n');
      prompt = [
        'Aggiorna la sintesi ME: chi è questa persona, in poche righe.',
        'Descrivi la PERSONA — fatti stabili, condizioni, obiettivi, abitudini, come preferisce essere trattata — non le ultime cose che ha chiesto. Una richiesta isolata non è identità.',
        'Se la sintesi precedente è sbagliata o superata, riscrivila: correggerla è il tuo lavoro, non un cambiamento da evitare.',
        'Restituisci {"summary":"...","basedOn":["..."]}. Lascia summary vuota solo se la precedente è già giusta e completa.',
        '',
        context,
      ].join('\n');
    }
    const { response, costUsd } = await runModel(machine, prompt, sourceIds, preferredModel);
    const parsed = JSON.parse(response.text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim() ?? response.text.trim()) as Record<string, unknown>;
    if (machine !== 'me') {
      const observations: MachineState['observations'] = machine === 'memon'
        ? (Array.isArray(parsed.reflections) ? parsed.reflections : []).flatMap((item) => {
          const value = item as Record<string, unknown>;
          const question = typeof value.question === 'string' ? value.question.trim().slice(0, 160) : '';
          const answer = typeof value.answer === 'string' ? value.answer.trim().slice(0, 400) : '';
          /* Una domanda senza risposta è metà lavoro, una risposta senza
             domanda è la descrizione di prima con un altro nome: servono
             entrambe o non si scrive niente. */
          if (!question || !answer || typeof value.confidence !== 'number' || value.confidence < 0 || value.confidence > 1 || !Array.isArray(value.sourceIds)) return [];
          return [{
            type: typeof value.type === 'string' ? value.type : 'identity',
            statement: `${question} ${answer}`,
            question,
            confidence: value.confidence,
            sourceIds: value.sourceIds.filter((id): id is string => typeof id === 'string'),
            timestamp: at(),
          }];
        })
        : (Array.isArray(parsed.observations) ? parsed.observations : []).flatMap((item) => {
          const value = item as Record<string, unknown>;
          return typeof value.statement === 'string' && typeof value.type === 'string' && typeof value.confidence === 'number' && value.confidence >= 0 && value.confidence <= 1 && Array.isArray(value.sourceIds) ? [{ type: value.type, statement: value.statement.slice(0, 500), question: undefined as string | undefined, confidence: value.confidence, sourceIds: value.sourceIds.filter((id): id is string => typeof id === 'string'), timestamp: at() }] : [];
        });
      /* 🔴 SI È INVENTATA UNA FONTE. Al primo giro Me.mon ha citato «TRACCIA
         APERTA», che non è una delle etichette che ha davanti: un riferimento
         inventato è peggio di nessun riferimento, perché sembra verificabile.
         Le fonti si tengono solo se esistono, e un'osservazione che ne resta
         senza si butta — è la regola che la macchina dichiara di seguire.

         ⚠️ Solo per Me.mon: qui il vocabolario lo scriviamo noi ed è chiuso.
         Per REFLECTION le fonti sono id di memoria, e filtrarli è un'altra
         verifica, con altri modi di sbagliare. */
      const grounded = machine === 'memon'
        ? observations.flatMap((item) => {
          const kept = item.sourceIds.filter((id) => sourceIds.includes(id));
          return kept.length ? [{ ...item, sourceIds: kept }] : [];
        })
        : observations;
      current.observations.push(...grounded);
      const definition = MACHINE_DEFINITIONS.find((item) => item.id === machine)!;
      const dayKey = new Date().toISOString().slice(0, 10);
      const firstKey = grounded[0]?.question ?? grounded[0]?.statement;
      const canNotify = definition.delivery === 'notify_user' && grounded.some((item) => item.confidence >= 0.75)
        && !current.pendingInsights.some((item) => item.dedupeKey === firstKey && item.status !== 'discussed')
        && !current.pendingInsights.some((item) => item.createdAt.slice(0, 10) === dayKey && item.notification === 'in_app');
      if (canNotify) {
        const selected = grounded.find((item) => item.confidence >= 0.75)!;
        /* 🔒 Per Me.mon la chiave è la DOMANDA, non la frase intera: la stessa
           domanda con una risposta riformulata è la stessa domanda, e riceverla
           due volte la fa sembrare un ciclo invece di un pensiero. */
        current.pendingInsights.push({ id: `insight_${crypto.randomUUID()}`, machineId: machine, statement: selected.statement, question: selected.question, sourceIds: selected.sourceIds, importance: selected.confidence, confidence: selected.confidence, createdAt: at(), status: 'pending', notification: 'in_app', dedupeKey: selected.question ?? selected.statement });
      }
      current.lastOutput = grounded.length ? `${grounded.length} osservazioni derivate` : 'Nessuna osservazione significativa.';
    } else {
      const summary = typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 1000) : '';
      if (summary) current.meSummary = { version: 1, summary, generatedAt: at(), basedOn: Array.isArray(parsed.basedOn) ? parsed.basedOn.filter((id): id is string => typeof id === 'string') : sourceIds };
      current.lastOutput = summary ? 'Sintesi ME aggiornata.' : 'Nessun aggiornamento significativo.';
    }
    current.status = 'SLEEPING'; current.lastRun = at(); current.usage = { provider: response.model.includes('claude') ? 'anthropic' : 'openai', model: response.model, costUsd };
    const latestInsight = current.pendingInsights.at(-1);
    if (latestInsight?.createdAt === current.lastRun || latestInsight?.machineId === machine && latestInsight.status === 'pending' && latestInsight.notification === 'in_app' && !latestInsight.pushAttemptedAt) {
      latestInsight.pushAttemptedAt = at();
      try {
        if (await isNotificationEnabled('machine')) {
          const delivery = await sendPushNotification(machineInsightPayload(latestInsight));
          if (delivery.sent > 0) latestInsight.notification = 'push_sent', latestInsight.pushSentAt = at();
        }
      } catch (error) { latestInsight.pushError = error instanceof Error ? error.message.slice(0, 160) : 'push delivery failed'; }
    }
    await store.setJSON(MACHINE_STATE_KEY, state);
    return current;
  } catch (error) {
    current.status = 'SLEEPING'; current.lastRun = at(); current.lastOutput = `Esecuzione fallita: ${error instanceof Error ? error.message : 'errore'}`;
    await store.setJSON(MACHINE_STATE_KEY, state);
    throw error;
  }
}


/* ============================================================================
   LE MACCHINE CHE GIRANO DA SOLE

   🔒 UNA CADENZA SOLA, E BASTA. Una macchina che si fa un'opinione su di te non
   deve poter girare ogni dieci minuti: penserebbe più di quanto tu viva. Una
   volta al giorno, a un'ora che scegli tu, è il ritmo giusto per qualcosa che
   cerca pattern «nel tempo».

   ⚠️ L'orario si sposta PRIMA di eseguire, come per le automazioni: se il giro
   fallisce o il processo muore a metà, la macchina non riparte in ciclo per il
   resto della giornata.
   ========================================================================= */

export async function setMachineSchedule(
  machine: MachineId,
  schedule: { hour: number; timezone: string } | null,
): Promise<MachineState> {
  const { store, state } = await readState();
  state[machine].autoDaily = schedule;
  state[machine].nextRunAt = schedule
    ? nextRun({ kind: 'daily', hour: schedule.hour, minute: 0, timezone: schedule.timezone })
    : null;
  await store.setJSON(MACHINE_STATE_KEY, state);
  return state[machine];
}

export async function processDueMachines(now = new Date()): Promise<{ due: number; ok: number }> {
  const { store, state } = await readState();
  const due = (Object.keys(state) as MachineId[]).filter((id) => {
    const machine = state[id];
    return machine.autoDaily && machine.nextRunAt && Date.parse(machine.nextRunAt) <= now.getTime();
  });
  if (!due.length) return { due: 0, ok: 0 };

  for (const id of due) {
    const schedule = state[id].autoDaily!;
    state[id].nextRunAt = nextRun(
      { kind: 'daily', hour: schedule.hour, minute: 0, timezone: schedule.timezone },
      now,
    );
  }
  await store.setJSON(MACHINE_STATE_KEY, state);

  let ok = 0;
  for (const id of due) {
    try {
      await runMachine(id);
      ok += 1;
    } catch {
      /* Una macchina che non gira non deve fermare l'altra né lo scheduler. */
    }
  }
  return { due: due.length, ok };
}
