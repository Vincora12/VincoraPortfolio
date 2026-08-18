/* ============================================================================
   CHI SERVE COSA (MASTER SPEC v1.13 §19.1)

   🔷 «Vorrei poter scegliere delle AI che non sono per forza Anthropic, vorrei
   sfondarti a mischiare.»

   Si può, e il modo giusto NON è sparpagliare nomi di modelli per il codice.
   Quello è il modo in cui si finisce legati a un fornitore senza essersene
   accorti: fra sei mesi «proviamo un altro modello per le foto» diventa una
   caccia a tutte le stringhe in tutti i file.

   Qui invece il codice non chiede mai «chiama Claude». Chiede una CAPACITÀ:
   mi serve una voce in personaggio, mi serve guardare un'immagine, mi serve
   pensare su una cosa difficile. Questa tabella — e solo questa — decide chi
   la serve.

   ⚠️ QUESTO FILE È L'UNICO POSTO DOVE CAMBIARE FORNITORE. Se un giorno ti
   trovi a scrivere il nome di un modello da qualche altra parte, quella riga è
   un errore: significa che quel pezzo di codice ha smesso di poter cambiare
   idea.

   🔒 E le capacità NON sono intercambiabili. `character-voice` chiede cose che
   non tutti i fornitori sanno fare — blocchi di sistema separati con la cache,
   un dialogo lungo, l'italiano con un carattere preciso. Il campo
   `requires` dice cosa serve, e c'è un controllo che rifiuta una tabella in
   cui una capacità è stata assegnata a un fornitore che non ce la fa.
   ========================================================================= */

export type Capability =
  /** La voce del .mon: personaggio, italiano, memoria lunga, cache. */
  | 'character-voice'
  /** Guardare una foto e dichiarare cosa c'è. Lavoro piccolo. */
  | 'vision-quick'
  /** Testo a basso costo: riflessione settimanale, classificazioni. */
  | 'text-cheap'
  /** Generare un'immagine di una creatura. */
  | 'image'
  /**
   * 🔷 v1.2 §10 — SCRIVERE il prompt di un'immagine.
   *
   * ⚠️ Non genera niente di visivo: prende i fatti che il motore ha già deciso
   * e li riscrive nella forma che un modello di immagini sa eseguire. È un
   * lavoro di scrittura tecnica, e succede UNA volta per creatura.
   */
  | 'prompt-compile';

export type Provider = 'anthropic' | 'google' | 'openai' | 'moonshot';

/** Cosa una capacità pretende da chi la serve. */
export interface Needs {
  /** Blocchi di sistema separati con `cache_control`. */
  promptCache?: boolean;
  /** Deve accettare immagini in ingresso. */
  vision?: boolean;
  /** Deve poter ragionare prima di rispondere. */
  thinking?: boolean;
  /** Deve produrre immagini. */
  imageOut?: boolean;
  /**
   * Deve saper cercare sul web dentro la stessa chiamata.
   *
   * ⚠️ Non è fra i requisiti di `character-voice`, e di proposito: la ricerca
   * è un extra per turno, non una condizione per dare la voce. Ma va
   * DICHIARATO lo stesso, perché chi sceglie deve sapere che spegnendo Opus
   * spegne anche la curiosità sul mondo (§22.7).
   */
  webSearch?: boolean;
}

const NEEDS: Record<Capability, Needs> = {
  'character-voice': { promptCache: true, thinking: true },
  'vision-quick': { vision: true },
  'text-cheap': {},
  image: { imageOut: true },
  /* Ragiona: deve risolvere i conflitti fra livelli — umanoidità contro nomi
     delle masse, densità contro numero di sistemi — che è precisamente quello
     che un concatenatore non sa fare. */
  'prompt-compile': { thinking: true },
};

/** Cosa ciascun fornitore sa fare, per come lo usiamo qui. */
const CAN: Record<Provider, Needs> = {
  anthropic: { promptCache: true, vision: true, thinking: true, webSearch: true },
  google: { vision: true, thinking: true, imageOut: true },
  /* 🔶 `promptCache: true` da quando OpenAI serve anche del testo: la cache è
     implicita come su Moonshot — prefisso identico e primo. Le regole del
     compilatore sono in cima e non cambiano mai, quindi aggancia. */
  /* ⚠️ `webSearch: false` significa «questo codice non la sa chiedere», non
     «il fornitore non ce l'ha». OpenAI la serve sull'API Responses, che qui
     non è collegata. Vedi la nota su GPT-5.6 Terra in `VOICE_CHOICES`. */
  openai: { promptCache: true, vision: true, thinking: true, imageOut: true, webSearch: false },

  /* ⚠️ `promptCache: true` QUI SIGNIFICA UNA COSA DIVERSA, e la differenza va
     capita o il risparmio non arriva.

     Anthropic la cache la MARCHI: dici tu dove finisce il pezzo che non
     cambia. Moonshot la fa da sé, riconoscendo il prefisso identico fra una
     richiesta e l'altra — come OpenAI. Il risultato in bolletta è lo stesso
     (un decimo sul pezzo ripetuto), ma c'è una condizione che sull'altro non
     esisteva: il prefisso deve essere IDENTICO e PRIMO, byte per byte.

     Cioè: se un giorno qualcosa che cambia — l'ora, un contatore, l'umore —
     finisse in cima al briefing invece che nel blocco della memoria, con
     Anthropic non succederebbe niente e con Moonshot la cache non aggancerebbe
     MAI. Stesso codice, dieci volte il prezzo, nessun errore. */
  moonshot: { promptCache: true, vision: true, thinking: true, webSearch: false },
};

export interface Route {
  provider: Provider;
  model: string;
}

/* ============================================================================
   LA TABELLA.

   Le scelte, e il perché — che conta più dei nomi:

   • LA VOCE resta su un fornitore solo, ed è di proposito. Su tutto il resto
     mescolare conviene; sulla voce no. È il prodotto: uno che funziona bene
     batte due che funzionano a metà, e un carattere che cambia sfumatura
     quando cambia fornitore non è più un carattere.

   • LE FOTO vanno su Gemini perché il lavoro è banale — «guarda e dichiara,
     nel dubbio niente» — e lì c'è un piano gratuito.
     ⚠️ E lì ci va SOLO la foto, senza una riga di contesto. Una foto di un
     piatto non dice chi sei; la conversazione sì.

   • LE IMMAGINI su OpenAI perché è quello con cui le prove sono già state
     fatte e funzionano. Nessun motivo tecnico di cambiare una cosa che va, e
     il prompt di un'immagine descrive una creatura, non te.

   • ⚠️ LA RIFLESSIONE SETTIMANALE (`text-cheap`) NON va sul gratuito, ed è
     una correzione a me stesso: l'avevo messa lì insieme alle foto perché è
     «un lavoro piccolo», e lo è — ma è l'unica cosa piccola che legge MESI
     della tua storia in un colpo solo. È il posto peggiore dove risparmiare.

     Resta su Anthropic, dove i dati non alimentano l'addestramento. Costa
     circa venti centesimi l'anno: il risparmio era zero e il prezzo sarebbe
     stato la cosa che questo progetto protegge.

     (Anche il piano a PAGAMENTO di Google non addestra sui dati. Se un giorno
     accendi la fatturazione su quel progetto, questa riga può tornare su
     Gemini in modo legittimo — ma va deciso guardando la fattura, non
     dimenticato.)
   ========================================================================= */

export const ROUTING: Record<Capability, Route> = {
  'character-voice': { provider: 'anthropic', model: 'claude-opus-5' },
  'vision-quick': { provider: 'google', model: 'gemini-2.5-flash' },
  'text-cheap': { provider: 'anthropic', model: 'claude-haiku-4-5' },
  image: { provider: 'openai', model: 'gpt-image-1' },
  /* Sonnet e non Opus: è un lavoro lungo in uscita ma vincolato — i fatti
     arrivano già decisi, va scritta la forma. Costa circa due centesimi per
     creatura, una volta ogni ventotto giorni. */
  /* 🔶 Era Sonnet, scelto da me in silenzio. Il predefinito è quello che hai
     chiesto tu, ed è anche il più economico: $2/$12 contro $3/$15. */
  'prompt-compile': { provider: 'openai', model: 'gpt-5.6-terra' },
};

/* ============================================================================
   CAMBIARE CHI DÀ LA VOCE, SENZA PERDERE CHI È (§19.2)

   🔷 «Vorrei poter cambiare fornitore senza perdere quello che è l'AI, ma
   tanto la memoria ce l'abbiamo noi.»

   Ed è esattamente così, ed è il motivo per cui questa cosa si può fare senza
   rischi. Guarda cosa NON sta dal fornitore:

     • i ricordi              → `state/store.ts`, nel tuo browser
     • la mindline e il dex   → idem
     • l'umore e le opinioni  → idem
     • il carattere           → `CharacterData`, estratto dai tuoi segnali
     • come parla             → `voiceDna`, calcolato qui

   Dal fornitore sta UNA cosa sola: la macchina che, ricevuto tutto quanto,
   sceglie le parole della prossima frase. Non conosce il .mon fra una
   richiesta e l'altra — glielo raccontiamo ogni volta da capo. Cambiarla è
   come cambiare la penna: la calligrafia cambia un po', quello che c'è scritto
   nel quaderno no.

   🔒 QUINDI L'UNICO RISCHIO È LA SFUMATURA, e si giudica ascoltando. Per
   questo la scelta è tua e reversibile in un tocco, invece che una riga di
   codice che dovrei cambiare io — su una cosa che si valuta a orecchio,
   decidere al posto tuo sarebbe la scelta sbagliata anche se azzeccassi.
   ========================================================================= */

export interface VoiceChoice {
  provider: Provider;
  model: string;
  /** Come si chiama per te. */
  label: string;
  /** Dollari per milione di token, in ingresso e in uscita. */
  price: { input: number; output: number };
  /** Cosa cambia davvero, in una riga. */
  it: string;
  /**
   * Con questa scelta il .mon può ancora guardare fuori?
   *
   * 🔒 Non è un dettaglio da nascondere in fondo: §22.7 gli ha dato la
   * curiosità del mondo, e una scelta che gliela toglie deve dirlo prima, non
   * dopo — altrimenti è uno strumento che sembra esserci e non fa niente.
   */
  webSearch: boolean;
  /**
   * Dove finiscono le tue conversazioni.
   *
   * 🔒 Riga obbligatoria, e deve dire quello che si sa — non quello che fa
   * comodo. `character-voice` porta cosa mangi, come ti alleni e come stai:
   * è la capacità che §19.1 marca come PERSONAL, e scegliere senza leggere
   * questa riga vorrebbe dire sceglierla alla cieca.
   */
  data: string;
}

/**
 * Chi può dare la voce al .mon.
 *
 * ⚠️ Solo fornitori che soddisfano `NEEDS['character-voice']` — cache dei
 * prompt e ragionamento. `voiceChoiceProblems()` lo verifica invece di
 * fidarsi di questo commento.
 */
export const VOICE_CHOICES: VoiceChoice[] = [
  /* 🔷 «Per adesso metto tutto ChatGPT, mi conviene per provare se funziona.»
     Prima la voce si poteva scegliere solo fra Anthropic e Moonshot, quindi
     partire con una chiave sola era possibile per i prompt e le immagini ma
     NON per la voce — cioè per la cosa che questa schermata dice di accendere.
     Era un limite mio, non del fornitore: serve `promptCache` e `thinking`, e
     OpenAI ha entrambe. */
  {
    provider: 'openai',
    model: 'gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
    price: { input: 2, output: 12 },
    it: 'La più economica delle quattro, e usa la stessa chiave delle immagini: con questa si parte con un fornitore solo. Qui dentro non cerca ancora sul web.',
    /* ⚠️ `false` perché `CAN.openai.webSearch` è `false` — e quel `false`
       descrive NOI, non OpenAI.

       🔶 «Ma certo che OpenAI cerca nel web.» Vero, e la frase di prima diceva
       il contrario. OpenAI la ricerca ce l'ha: è uno strumento ospitato
       sull'API Responses (`/v1/responses`, `tools: [{ type: 'web_search' }]`).
       Il nostro adattatore parla con `/v1/chat/completions` e passa solo le
       funzioni nostre, quindi quello strumento non è raggiungibile da qui.
       Collegarlo vuol dire un secondo adattatore, non una riga.

       Finché non c'è, questo campo resta `false`: promettere la ricerca in
       una schermata che serve a decidere sarebbe peggio che non averla. */
    webSearch: false,
    data: 'OpenAI dichiara di non usare i dati delle API per addestrare i modelli senza adesione esplicita.',
  },
  {
    provider: 'anthropic',
    model: 'claude-opus-5',
    label: 'Claude Opus 5',
    price: { input: 5, output: 25 },
    it: 'Quello con cui il personaggio è stato scritto e tarato. È il metro di paragone, non necessariamente il migliore per te.',
    webSearch: true,
    data: 'Anthropic dichiara di non usare i dati delle API per addestrare i modelli.',
  },
  {
    provider: 'moonshot',
    model: 'kimi-k3',
    label: 'Kimi K3',
    price: { input: 3, output: 15 },
    it: 'Circa il 40% in meno. Finestra da un milione di token. Sulla voce in italiano e in personaggio non è mai stato provato qui: lo scopri parlandoci.',
    webSearch: false,
    data: 'Moonshot AI, azienda cinese. Le condizioni sull’uso dei dati vanno lette prima di mandarci le tue conversazioni: non do per scontato che siano come quelle di Anthropic, e non ho modo di verificarlo dall’interno dell’app.',
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    price: { input: 3, output: 15 },
    it: 'Stesso fornitore, stesso prezzo di Kimi, un gradino sotto Opus. È il confronto onesto da fare prima di cambiare azienda: forse quello che cerchi è solo spendere meno.',
    webSearch: true,
    data: 'Anthropic dichiara di non usare i dati delle API per addestrare i modelli.',
  },
];

/**
 * La rotta di una capacità, tenendo conto della scelta fatta nell'app.
 *
 * 🔒 La preferenza arriva dal browser, quindi NON ci si fida: deve
 * corrispondere a una voce di `VOICE_CHOICES`, altrimenti si torna alla
 * tabella. Senza questo controllo, chi ha il token potrebbe far chiamare al
 * server un modello qualsiasi — compreso uno che non sappiamo prezzare, e il
 * tetto di spesa smetterebbe di sapere cosa sta contando.
 */
export function resolveRoute(capability: Capability, preferredModel?: string | null): Route {
  if (!preferredModel) return ROUTING[capability];

  const pool =
    capability === 'character-voice'
      ? (VOICE_CHOICES as { provider: Provider; model: string }[])
      : capability === 'prompt-compile'
        ? (COMPILER_CHOICES as { provider: Provider; model: string }[])
        : null;
  if (!pool) return ROUTING[capability];

  const choice = pool.find((c) => c.model === preferredModel);
  return choice ? { provider: choice.provider, model: choice.model } : ROUTING[capability];
}

/** Una scelta di voce che il suo fornitore non sa servire non deve esistere. */
export function voiceChoiceProblems(choices = VOICE_CHOICES): string[] {
  const needs = NEEDS['character-voice'];
  const problems: string[] = [];

  for (const c of choices) {
    for (const [need, required] of Object.entries(needs) as [keyof Needs, boolean][]) {
      if (required && !CAN[c.provider][need]) {
        problems.push(`${c.label} → ${c.provider} non offre ${need}`);
      }
    }
    if (c.data.trim().length === 0) problems.push(`${c.label} non dice dove finiscono i dati`);
    /* Una scelta che promette la ricerca a un fornitore che non ce l'ha
       sarebbe una bugia nella schermata che serve a decidere. */
    if (c.webSearch && !CAN[c.provider].webSearch) {
      problems.push(`${c.label} promette la ricerca sul web che ${c.provider} non serve`);
    }
  }

  /* La tabella di partenza deve essere fra le scelte, o «torna com'era» non
     sarebbe raggiungibile dall'app. */
  const base = ROUTING['character-voice'];
  if (!choices.some((c) => c.model === base.model)) {
    problems.push(`la voce predefinita (${base.model}) non è fra le scelte`);
  }

  return problems;
}

/* ============================================================================
   CHI SCRIVE I PROMPT (§10)

   🔷 «Sì, sarà ChatGPT.» — e io l'avevo mandato su Anthropic senza dirtelo.

   ⚠️ È lo stesso conflitto d'interesse della voce, e stavolta l'ho fatto in
   silenzio: ho scelto il fornitore di casa mia per una capacità nuova senza
   nominare la scelta. Quindi diventa una scelta tua, come la voce.

   🔒 Qui NON vale il ragionamento sulla privacy che vincola la voce: la
   richiesta porta la descrizione di una creatura — famiglia, proporzioni,
   colori — e niente di te. È il motivo per cui `prompt-compile` non sta in
   `PERSONAL`, ed è anche il motivo per cui la scelta è libera.
   ========================================================================= */

export interface CompilerChoice {
  provider: Provider;
  model: string;
  label: string;
  price: { input: number; output: number };
  it: string;
}

export const COMPILER_CHOICES: CompilerChoice[] = [
  {
    provider: 'openai',
    model: 'gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
    price: { input: 2, output: 12 },
    it: 'Quello che hai chiesto tu, ed è anche il più economico dei due. Usa la chiave OPENAI_API_KEY che serve già per le immagini: nessuna variabile in più.',
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    price: { input: 3, output: 15 },
    it: 'Quello che avevo scelto io. Usa la chiave che serve già per la voce. Tienilo come confronto, non come predefinito.',
  },
];

/** Una scelta di compilatore che il suo fornitore non sa servire non deve esistere. */
export function compilerChoiceProblems(choices = COMPILER_CHOICES): string[] {
  const needs = NEEDS['prompt-compile'];
  const problems: string[] = [];
  for (const c of choices) {
    for (const [need, required] of Object.entries(needs) as [keyof Needs, boolean][]) {
      if (required && !CAN[c.provider][need]) {
        problems.push(`${c.label} → ${c.provider} non offre ${need}`);
      }
    }
  }
  const base = ROUTING['prompt-compile'];
  if (!choices.some((c) => c.model === base.model)) {
    problems.push(`il compilatore predefinito (${base.model}) non è fra le scelte`);
  }
  return problems;
}

/**
 * Le capacità la cui richiesta contiene cose che TI riguardano.
 *
 * Non è una nota di stile: è la regola che decide dove NON si può risparmiare.
 * Un piano gratuito quasi sempre significa che i dati alimentano
 * l'addestramento, e la conversazione con il .mon contiene cosa mangi, come ti
 * alleni e come stai. `image` porta solo la descrizione di una creatura,
 * `vision-quick` una foto senza contesto: quelle possono stare ovunque.
 */
export const PERSONAL: Capability[] = ['character-voice', 'text-cheap'];

/* ⚠️ `prompt-compile` NON è nell'elenco, e va detto perché: la richiesta porta
   la descrizione di una creatura — famiglia, colori, proporzioni — e non porta
   niente di te. È l'unica capacità nuova che poteva sembrare personale e non
   lo è, e la differenza è la stessa di `image`. */

/**
 * Verifica che la tabella non chieda a un fornitore una cosa che non sa fare.
 *
 * Serve perché il modo tipico di rompersi, qui, è silenzioso: si sposta la
 * voce su un fornitore senza cache, tutto continua a funzionare, e il conto
 * decuplica senza un errore. Questo controllo gira nei test, non a runtime.
 */
export function routingProblems(routing = ROUTING): string[] {
  const problems: string[] = [];

  for (const [capability, route] of Object.entries(routing) as [Capability, Route][]) {
    const needs = NEEDS[capability];
    const can = CAN[route.provider];

    for (const [need, required] of Object.entries(needs) as [keyof Needs, boolean][]) {
      if (required && !can[need]) {
        problems.push(`${capability} → ${route.provider} non offre ${need}`);
      }
    }

    if (route.model.trim().length === 0) {
      problems.push(`${capability} non ha un modello`);
    }
  }

  return problems;
}

/**
 * 🔒 I dati personali non finiscono su un piano gratuito.
 *
 * Oggi passa perché `text-cheap` è su Gemini — che HA un piano gratuito — ma
 * la riflessione settimanale legge i tuoi ricordi. È una contraddizione vera
 * fra la tabella e la regola, e va vista: il controllo la segnala invece di
 * lasciarla sepolta.
 */
export function personalDataOnFreeTier(routing = ROUTING): Capability[] {
  const FREE_TIER: Provider[] = ['google'];
  return PERSONAL.filter((c) => FREE_TIER.includes(routing[c].provider));
}
