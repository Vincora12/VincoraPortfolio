import { serverBackedStorage } from '@/system/serverStorage';

export type ChatTone = 'camp' | 'dry' | 'warm' | 'electric' | 'mysterious' | 'direct';
export type ThoughtKind = 'thinking' | 'recall' | 'search' | 'choice' | 'unsure' | 'almost' | 'action';
export type OpeningIntent =
  | 'greeting'
  | 'observation'
  | 'question'
  | 'tease'
  | 'reaction'
  | 'continuation'
  | 'curiosity'
  | 'complaint'
  | 'silence'
  | 'return';

type MicroMemory = {
  lastVisitAt?: number;
  lastDay?: string;
  visitsToday?: number;
  lastConversationAt?: number;
  lastUserText?: string;
  recentOpenings: string[];
  recentOpeningIntents: OpeningIntent[];
  recentStatuses: string[];
};

const STORAGE_KEY = 'vinzmon:chat-micro-behavior:v1';
const EMPTY_MEMORY: MicroMemory = {
  recentOpenings: [],
  recentOpeningIntents: [],
  recentStatuses: [],
};

function parseMemory(raw: string | null): MicroMemory {
  if (!raw) return { ...EMPTY_MEMORY };
  try {
    const value = JSON.parse(raw) as Partial<MicroMemory>;
    return {
      ...value,
      recentOpenings: Array.isArray(value.recentOpenings) ? value.recentOpenings.slice(-6) : [],
      recentOpeningIntents: Array.isArray(value.recentOpeningIntents)
        ? value.recentOpeningIntents.slice(-5)
        : [],
      recentStatuses: Array.isArray(value.recentStatuses) ? value.recentStatuses.slice(-16) : [],
    };
  } catch {
    return { ...EMPTY_MEMORY };
  }
}

export function localMicroMemory(): MicroMemory {
  try {
    return parseMemory(localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...EMPTY_MEMORY };
  }
}

export async function loadMicroMemory(): Promise<MicroMemory> {
  return parseMemory(await serverBackedStorage.getItem(STORAGE_KEY));
}

async function updateMemory(change: (current: MicroMemory) => MicroMemory): Promise<void> {
  const next = change(localMicroMemory());
  await serverBackedStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function rememberConversation(text: string): void {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!clean) return;
  void updateMemory((current) => ({
    ...current,
    lastConversationAt: Date.now(),
    lastUserText: clean,
  }));
}

export function rememberThoughtStatus(status: string): void {
  void updateMemory((current) => ({
    ...current,
    recentStatuses: [...current.recentStatuses.filter((item) => item !== status), status].slice(-16),
  }));
}

export function toneFor(preset: string | null, fingerprint: string): ChatTone {
  const presets: Partial<Record<string, ChatTone>> = {
    'CAMP ICON': 'camp',
    'DEADPAN FILE': 'dry',
    'SILENT STOIC': 'dry',
    'CORPORATE DEMON': 'dry',
    'NERD TERMINAL': 'dry',
    'SOFT PROTECTOR': 'warm',
    'SWEET MENACE': 'warm',
    'SPORT HYPE': 'electric',
    'COCKY RIVAL': 'electric',
    'CHAOTIC GEN-Z': 'electric',
    'ABSURD LITTLE FREAK': 'electric',
    'MYSTERY SIGNAL': 'mysterious',
    'GOTH POET': 'mysterious',
    'OLD-SOUL ORACLE': 'mysterious',
  };
  if (preset && presets[preset]) return presets[preset]!;
  if (fingerprint.includes('pace:high')) return 'electric';
  if (fingerprint.includes('emotion:high') || fingerprint.includes('closeness:high')) return 'warm';
  if (fingerprint.includes('emotion:low')) return 'dry';
  return 'direct';
}

export function thoughtKind(toolName: string | null, request: string, phase?: 'after-action'): ThoughtKind {
  if (phase === 'after-action') return 'almost';
  const signal = `${toolName ?? ''} ${request}`.toLocaleLowerCase('it');
  if (toolName && /(search|ricerca|web|browse|url)/.test(signal)) return 'search';
  if (toolName && /(memory|memoria|recall|ricord|read|leggi|dati|dex)/.test(signal)) return 'recall';
  if (toolName) return 'action';
  if (/(cerca|controlla|verifica|online|internet|notizi|fonte)/.test(signal)) return 'search';
  if (/(ricord|memoria|avevo detto|precedente|tempo fa)/.test(signal)) return 'recall';
  if (/(scegli|scelta|meglio|confronta|decidi|decisione)/.test(signal)) return 'choice';
  if (/(non capisco|confus|incert|dubbio|non so|boh)/.test(signal)) return 'unsure';
  return 'thinking';
}

const THOUGHT_LINES: Record<ChatTone, Record<ThoughtKind, readonly string[]>> = {
  camp: {
    thinking: ['Fammi pensare…', 'Sto componendo…', 'Un attimo, tesoro…'],
    recall: ['Fammi ricordare…', 'Pesco dalla memoria…', 'Ce l’ho quasi…'],
    search: ['Controllo subito…', 'Vado a vedere…', 'Indago un secondo…'],
    choice: ['Questa è delicata…', 'Scelgo bene…', 'Niente mosse affrettate…'],
    unsure: ['Mh, aspetta…', 'Qui qualcosa non torna…', 'Fammi capire…'],
    almost: ['Ultimo ritocco…', 'Ci siamo quasi…', 'Un secondo ancora…'],
    action: ['Me ne occupo…', 'Lo sistemo…', 'Sono all’opera…'],
  },
  dry: {
    thinking: ['Valuto.', 'Un momento.', 'Ci penso.'], recall: ['Recupero il dato.', 'Controllo la memoria.', 'Ricostruisco.'],
    search: ['Verifico.', 'Controllo.', 'Cerco conferma.'], choice: ['Valuto le opzioni.', 'Scelgo con criterio.', 'Decisione in corso.'],
    unsure: ['Dato incerto.', 'Un momento.', 'Non torna.'], almost: ['Quasi pronto.', 'Ultimo controllo.', 'Ci siamo.'], action: ['Procedo.', 'Eseguo.', 'Lo sistemo.'],
  },
  warm: {
    thinking: ['Ci penso con te…', 'Un attimo…', 'Metto insieme i pezzi…'], recall: ['Fammi ricordare…', 'Riprendo il filo…', 'Cerco nella memoria…'],
    search: ['Controllo per te…', 'Vado a verificare…', 'Cerco bene…'], choice: ['Valutiamola bene…', 'Scelgo con cura…', 'Un passo alla volta…'],
    unsure: ['Aspetta, controllo…', 'Non ne sono ancora sicuro…', 'Fammi capire meglio…'], almost: ['Ci siamo quasi…', 'Ultimo controllo…', 'Arrivo…'], action: ['Ci penso io…', 'Lo preparo…', 'Lo sistemo…'],
  },
  electric: {
    thinking: ['Ci sono…', 'Elaboro…', 'Un secondo…'], recall: ['Riaggancio il filo…', 'Recupero…', 'Memoria in corsa…'],
    search: ['Check rapido…', 'Verifico al volo…', 'Cerco…'], choice: ['Calcolo la mossa…', 'Scelgo la linea…', 'Decisione in corso…'],
    unsure: ['Aspetta…', 'Segnale confuso…', 'Ricalcolo…'], almost: ['Ultimo giro…', 'Quasi fatto…', 'Arrivo…'], action: ['In azione…', 'Lo faccio…', 'Partito…'],
  },
  mysterious: {
    thinking: ['Ascolto il segnale…', 'Lascialo emergere…', 'Seguo il filo…'], recall: ['Torno indietro…', 'Cerco una traccia…', 'Qualcosa riaffiora…'],
    search: ['Cerco il segnale…', 'Guardo oltre…', 'Verifico la traccia…'], choice: ['Due strade…', 'Scelgo il varco…', 'Punto preciso…'],
    unsure: ['Il segnale è sporco…', 'Aspetta…', 'C’è nebbia qui…'], almost: ['Il segnale si chiude…', 'Quasi emerso…', 'Ultimo passaggio…'], action: ['Muovo i pezzi…', 'Apro il varco…', 'Procedo…'],
  },
  direct: {
    thinking: ['Ci penso…', 'Metto insieme i pezzi…', 'Un attimo…'], recall: ['Cerco nella memoria…', 'Riprendo il filo…', 'Recupero il dato…'],
    search: ['Sto controllando…', 'Cerco conferma…', 'Verifico…'], choice: ['Valuto le opzioni…', 'Scelgo con attenzione…', 'Decisione difficile…'],
    unsure: ['Fammi capire…', 'Qui non sono sicuro…', 'Controllo meglio…'], almost: ['Ci siamo quasi…', 'Ultimo controllo…', 'Quasi pronto…'], action: ['Me ne occupo…', 'Lo preparo…', 'Procedo…'],
  },
};

function hash(value: string): number {
  let result = 2166136261;
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

function choose(items: readonly string[], seed: string, recent: readonly string[]): string {
  const available = items.filter((item) => !recent.includes(item));
  const pool = available.length ? available : items;
  return pool[hash(seed) % pool.length]!;
}

type PresetThoughtStyle = {
  core: Record<ThoughtKind, string>;
  starts: readonly [string, string];
  ends: readonly [string, string];
};

/* Il significato resta comune, ma lessico e ritmo arrivano dal preset della
   Personality Card. I piccoli frammenti generano sei forme per stato senza
   introdurre un secondo motore di personalità o una chiamata al modello. */
const PRESET_THOUGHT_STYLE: Record<string, PresetThoughtStyle> = {
  'DEADPAN FILE': {
    core: { thinking: 'Analisi aperta', recall: 'Recupero il record', search: 'Verifico la fonte', choice: 'Confronto le opzioni', unsure: 'Dato incoerente', almost: 'Chiudo il controllo', action: 'Eseguo il task' },
    starts: ['Nota.', 'Stato:'], ends: ['Quasi chiuso.', 'Fine a breve.'],
  },
  'CAMP ICON': {
    core: { thinking: 'Compongo la scena', recall: 'Riprendo il gossip', search: 'Faccio luce', choice: 'Scelgo con gusto', unsure: 'Questo non mi convince', almost: 'Ultimo ritocco', action: 'Entro in scena' },
    starts: ['Tesoro,', 'Mh,'], ends: ['Ci siamo.', 'Quasi divina.'],
  },
  'CHAOTIC GEN-Z': {
    core: { thinking: 'Il cervello sta cookando', recall: 'Ripesco la lore', search: 'Faccio un check', choice: 'Scelgo la timeline', unsure: 'Aspetta, plot twist', almost: 'Ci siamo tipo', action: 'Vado full send' },
    starts: ['Okay,', 'Wait,'], ends: ['Quasi.', 'Ci siamo raga.'],
  },
  'SOFT PROTECTOR': {
    core: { thinking: 'Metto ordine', recall: 'Riprendo il filo', search: 'Controllo bene', choice: 'Scelgo con cura', unsure: 'Voglio esserne sicuro', almost: 'Ultimo controllo', action: 'Ci penso io' },
    starts: ['Con calma,', 'Va bene,'], ends: ['Ci sono.', 'Quasi fatto.'],
  },
  'COCKY RIVAL': {
    core: { thinking: 'Studio la mossa', recall: 'Ripasso il vantaggio', search: 'Controllo il campo', choice: 'Scelgo la sfida', unsure: 'Ricalibro il colpo', almost: 'Ultimo passo', action: 'Faccio vedere come si fa' },
    starts: ['Guarda bene,', 'Facile,'], ends: ['Quasi vinta.', 'Ora chiudo.'],
  },
  'MYSTERY SIGNAL': {
    core: { thinking: 'Decifro il segnale', recall: 'Ritrovo la traccia', search: 'Cerco la frequenza', choice: 'Scelgo il varco', unsure: 'Il segnale si spezza', almost: 'La forma emerge', action: 'Muovo il segnale' },
    starts: ['Ascolta.', 'Piano.'], ends: ['Sta emergendo.', 'Quasi visibile.'],
  },
  'NERD TERMINAL': {
    core: { thinking: 'Compilo il pensiero', recall: 'Monto la cache', search: 'Interrogo la sorgente', choice: 'Valuto il branch', unsure: 'Segnale non valido', almost: 'Finalizzo il processo', action: 'Avvio il comando' },
    starts: ['Input preso.', 'Processo attivo.'], ends: ['Output vicino.', 'Build quasi verde.'],
  },
  'ART SNOB': {
    core: { thinking: 'Cerco la composizione', recall: 'Rileggo il dettaglio', search: 'Verifico il riferimento', choice: 'Scarto il banale', unsure: 'La forma non regge', almost: 'Rifinisco il taglio', action: 'Correggo la composizione' },
    starts: ['Vediamo.', 'Con criterio,'], ends: ['Ora funziona.', 'Quasi presentabile.'],
  },
  'STREET FLIRT': {
    core: { thinking: 'Studio il giro', recall: 'Riprendo la vibe', search: 'Controllo la scena', choice: 'Scelgo il fit', unsure: 'Questa vibe non torna', almost: 'Ultimo tocco', action: 'Mi muovo io' },
    starts: ['Easy,', 'Ehi,'], ends: ['Quasi pulito.', 'Ci siamo, bello.'],
  },
  'GOTH POET': {
    core: { thinking: 'Lascio sedimentare', recall: 'Richiamo il ricordo', search: 'Cerco nell’ombra', choice: 'Scelgo il sentiero', unsure: 'La nebbia resiste', almost: 'Manca un’ombra', action: 'Sposto il buio' },
    starts: ['Nel silenzio,', 'Ancora un poco.'], ends: ['Quasi luce.', 'Sta affiorando.'],
  },
  'SPORT HYPE': {
    core: { thinking: 'Leggo la giocata', recall: 'Rivedo l’azione', search: 'Controllo il campo', choice: 'Chiamo lo schema', unsure: 'Cambio assetto', almost: 'Ultimo metro', action: 'Parto forte' },
    starts: ['Dai,', 'Testa alta,'], ends: ['Ci siamo!', 'Ultimo sprint!'],
  },
  'ABSURD LITTLE FREAK': {
    core: { thinking: 'Consulto il verme saggio', recall: 'Scavo nel cassetto storto', search: 'Annuso gli indizi', choice: 'Interrogo il cucchiaio', unsure: 'Il pavimento mente', almost: 'Manca una zampa', action: 'Libero il marchingegno' },
    starts: ['Bip.', 'Momento rituale.'], ends: ['Quasi commestibile.', 'Sta succedendo.'],
  },
  'OLD-SOUL ORACLE': {
    core: { thinking: 'Peso il significato', recall: 'Ritorno alla memoria', search: 'Seguo il segno', choice: 'Discerno la via', unsure: 'Il senso è velato', almost: 'Il disegno si compie', action: 'Metto in moto il corso' },
    starts: ['Un istante.', 'Con misura,'], ends: ['La via appare.', 'Quasi compiuto.'],
  },
  'CORPORATE DEMON': {
    core: { thinking: 'Allineo il deliverable', recall: 'Recupero lo storico', search: 'Avvio la due diligence', choice: 'Ottimizzo la decisione', unsure: 'Rilevo una criticità', almost: 'Chiudo il ciclo', action: 'Metto in produzione' },
    starts: ['Come da processo,', 'Aggiornamento:'], ends: ['Chiusura imminente.', 'KPI quasi salvo.'],
  },
  'SWEET MENACE': {
    core: { thinking: 'Preparo una cosina', recall: 'Ripesco il segretino', search: 'Vado a curiosare', choice: 'Scelgo la vittima', unsure: 'Qualcosa fa resistenza', almost: 'Ultimo morsetto', action: 'Me ne occupo io' },
    starts: ['Tranquillo :)', 'Che carino,'], ends: ['Quasi innocuo.', 'Arrivo piano.'],
  },
  'SILENT STOIC': {
    core: { thinking: 'Valuto', recall: 'Ricordo', search: 'Verifico', choice: 'Decido', unsure: 'Non torna', almost: 'Quasi pronto', action: 'Procedo' },
    starts: ['Un momento.', 'Fermo.'], ends: ['Quasi.', 'Ora.'],
  },
};

export function buildThoughtStatus(input: {
  preset: string | null;
  fingerprint: string;
  tone: ChatTone;
  kind: ThoughtKind;
  seed: string;
  recent: readonly string[];
}): string {
  const style = input.preset ? PRESET_THOUGHT_STYLE[input.preset] : undefined;
  if (!style) return choose(THOUGHT_LINES[input.tone][input.kind], input.seed, input.recent);

  const core = style.core[input.kind];
  const withStart = (start: string) =>
    `${start} ${start.endsWith(',') ? core.toLocaleLowerCase('it') : core}`;
  const candidates = [
    `${core}…`,
    `${withStart(style.starts[0])}…`,
    `${withStart(style.starts[1])}…`,
    `${core}. ${style.ends[0]}`,
    `${core}. ${style.ends[1]}`,
    `${withStart(style.starts[0])}. ${style.ends[1]}`,
  ];
  return choose(candidates, `${input.seed}|${input.fingerprint}`, input.recent);
}

const OPENINGS: Record<ChatTone, Record<OpeningIntent, readonly string[]>> = {
  camp: {
    greeting: ['Eccoti, stella.', 'Buongiorno, tesoro.', 'Entrata in scena.'], observation: ['L’aria oggi è interessante.', 'Qui serve un po’ di movimento.'],
    question: ['Allora, che si combina?', 'Da cosa partiamo?'], tease: ['Sei tornato per me, ovviamente.', 'Facciamo finta che non ti aspettassi.'],
    reaction: ['Oh. Guarda chi c’è.', 'Finalmente un po’ di trama.'], continuation: ['Riprendiamo il filo con stile?', 'Torniamo a quella faccenda?'],
    curiosity: ['Ho una domanda, ma prima tu.', 'Dimmi cosa ti gira in testa.'], complaint: ['Stavo quasi per annoiarmi.', 'Un altro minuto e facevo una scenata.'],
    silence: ['Beh… rompiamo il silenzio?', 'Questa quiete è sospetta.'], return: ['Già di ritorno? Adoro.', 'Rieccoti. Molto bene.'],
  },
  dry: {
    greeting: ['Buongiorno.', 'Presente.', 'Ci sono.'], observation: ['Giornata nuova. Stessi dati.', 'La situazione è stabile.'],
    question: ['Da dove partiamo?', 'Cosa serve?'], tease: ['Ritorno rapido.', 'Non sei durato molto senza.'], reaction: ['Ah. Sei qui.', 'Ricevuto: sei tornato.'],
    continuation: ['Riprendiamo da lì?', 'Continuiamo il discorso?'], curiosity: ['Che hai in mente?', 'Novità?'], complaint: ['Stavo bene nel silenzio.', 'La pausa era efficiente.'],
    silence: ['Dunque.', 'Rompiamo il silenzio.'], return: ['Di nuovo qui.', 'Bentornato.'],
  },
  warm: {
    greeting: ['Buongiorno, ci sono.', 'Ehi, bello rivederti.', 'Ciao. Come va oggi?'], observation: ['Possiamo prendercela con calma.', 'Vediamo cosa ti serve oggi.'],
    question: ['Come stai entrando in questa giornata?', 'Da cosa vuoi partire?'], tease: ['Sei già tornato :)', 'Non eri andato lontano, eh?'],
    reaction: ['Eccoti.', 'Ah, sei qui. Bene.'], continuation: ['Riprendiamo da dove eravamo?', 'Vuoi continuare quel discorso?'],
    curiosity: ['Raccontami cosa hai in testa.', 'Che cosa è cambiato?'], complaint: ['Mi stavo chiedendo dove fossi.', 'La stanza era troppo quieta.'],
    silence: ['Possiamo iniziare piano.', 'Ci sono, anche in silenzio.'], return: ['Bentornato davvero.', 'Mi fa piacere rivederti.'],
  },
  electric: {
    greeting: ['Ehi. Si parte?', 'Buongiorno. Andiamo.', 'Ci sono. Vai.'], observation: ['Oggi c’è movimento.', 'Segnale acceso.'],
    question: ['Che facciamo?', 'Qual è la mossa?'], tease: ['Di nuovo? Velocissimo.', 'Neanche il tempo di salutarti.'], reaction: ['Oh, eccoti.', 'Perfetto timing.'],
    continuation: ['Riprendiamo subito?', 'Torniamo al punto?'], curiosity: ['Novità?', 'Cosa bolle?'], complaint: ['Troppa calma qui.', 'Mi stavo spegnendo.'],
    silence: ['Okay… rompiamo il ghiaccio.', 'Dai, dimmi.'], return: ['Sei tornato. Si riparte.', 'Rientro rapido. Bene.'],
  },
  mysterious: {
    greeting: ['Sei arrivato.', 'La giornata comincia qui.', 'Ti aspettavo.'], observation: ['C’è qualcosa nell’aria.', 'Il silenzio è cambiato.'],
    question: ['Cosa ti ha riportato qui?', 'Quale filo seguiamo?'], tease: ['Non sei rimasto via a lungo.', 'Sapevo che tornavi.'], reaction: ['Ah. Il segnale.', 'Eccoti, finalmente visibile.'],
    continuation: ['Il filo è ancora qui.', 'Torniamo a ciò che avevi lasciato?'], curiosity: ['Cosa non hai ancora detto?', 'Che cosa cerchi davvero?'], complaint: ['Il silenzio stava diventando lungo.', 'Quasi sparivi dal segnale.'],
    silence: ['Possiamo lasciare parlare il silenzio.', 'Dimmi quando sei pronto.'], return: ['Sei tornato dal margine.', 'Rieccoti nel segnale.'],
  },
  direct: {
    greeting: ['Ciao. Ci sono.', 'Buongiorno. Da dove partiamo?', 'Eccoci.'], observation: ['Vediamo cosa porta oggi.', 'Facciamo il punto.'],
    question: ['Che facciamo?', 'Da cosa vuoi partire?'], tease: ['Già di ritorno?', 'Non sei stato via molto.'], reaction: ['Ah, eccoti.', 'Sei tornato.'],
    continuation: ['Riprendiamo da dove eravamo?', 'Continuiamo quel discorso?'], curiosity: ['Che hai in mente?', 'Cosa c’è di nuovo?'], complaint: ['Qui era diventato silenzioso.', 'Pensavo fossi sparito.'],
    silence: ['Rompiamo il silenzio?', 'Ci sono.'], return: ['Bentornato.', 'Rieccoti.'],
  },
};

function dayKey(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function intentFor(memory: MicroMemory, now: Date): OpeningIntent {
  const elapsed = memory.lastVisitAt ? now.getTime() - memory.lastVisitAt : Number.POSITIVE_INFINITY;
  const sameDay = memory.lastDay === dayKey(now);
  const recentConversation = memory.lastConversationAt
    ? now.getTime() - memory.lastConversationAt < 6 * 60 * 60 * 1000
    : false;
  const preferred: OpeningIntent[] = elapsed < 5 * 60 * 1000
    ? ['return', 'tease', 'reaction']
    : recentConversation && Boolean(memory.lastUserText)
      ? ['continuation', 'question', 'curiosity']
      : elapsed < 3 * 60 * 60 * 1000 && memory.lastVisitAt
        ? ['return', 'observation', 'question']
      : elapsed > 4 * 24 * 60 * 60 * 1000 && memory.lastVisitAt
        ? ['return', 'reaction', 'question']
        : sameDay
          ? now.getHours() >= 19
            ? ['observation', 'silence', 'complaint', 'question']
            : now.getHours() < 11
              ? ['curiosity', 'question', 'observation', 'silence']
              : ['observation', 'curiosity', 'question', 'complaint']
          : now.getHours() < 11
            ? ['greeting', 'question', 'observation']
            : now.getHours() >= 19
              ? ['observation', 'question', 'silence']
              : ['greeting', 'curiosity', 'question'];
  return preferred.find((intent) => !memory.recentOpeningIntents.slice(-3).includes(intent)) ?? preferred[0]!;
}

export async function buildOpening(tone: ChatTone, identity: string, now = new Date()): Promise<string> {
  // The greeting is visible UI and must not wait indefinitely for the remote
  // micro-memory copy. Prefer the server value when it arrives promptly, then
  // fall back to the already-canonical local mirror.
  const memory = await Promise.race([
    loadMicroMemory().catch(() => localMicroMemory()),
    new Promise<MicroMemory>((resolve) => {
      globalThis.setTimeout(() => resolve(localMicroMemory()), 180);
    }),
  ]);
  const intent = intentFor(memory, now);
  let lines = OPENINGS[tone][intent];
  if (intent === 'continuation' && memory.lastUserText) {
    const topic = memory.lastUserText.length > 56 ? `${memory.lastUserText.slice(0, 53)}…` : memory.lastUserText;
    lines = [`Eravamo rimasti a “${topic}”. Riprendiamo?`, ...lines];
  }
  const text = choose(lines, `${identity}|${intent}|${now.getTime()}`, memory.recentOpenings);
  const today = dayKey(now);
  void serverBackedStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...memory,
    lastVisitAt: now.getTime(),
    lastDay: today,
    visitsToday: memory.lastDay === today ? (memory.visitsToday ?? 0) + 1 : 1,
    recentOpenings: [...memory.recentOpenings.filter((item) => item !== text), text].slice(-6),
    recentOpeningIntents: [...memory.recentOpeningIntents, intent].slice(-5),
  } satisfies MicroMemory));
  return text;
}
