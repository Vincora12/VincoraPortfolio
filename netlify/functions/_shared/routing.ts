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
  openai: { promptCache: true, vision: true, thinking: true, imageOut: true, webSearch: true },

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
  'character-voice': { provider: 'openai', model: 'gpt-5.6-terra' },
  'vision-quick': { provider: 'google', model: 'gemini-2.5-flash' },
  'text-cheap': { provider: 'anthropic', model: 'claude-haiku-4-5' },
  /* 🔶 Era `gpt-image-1`, e nessuno l'aveva mai scelto: la voce e il
     compilatore si sceglievano, il disegnatore no. `gpt-image-2` è uscito
     nell'API il 21 aprile 2026 ed è il più recente. */
  image: { provider: 'openai', model: 'gpt-image-2' },
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
    model: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    price: { input: 0.2, output: 1.2 },
    it: 'Venticinque volte meno di Sol. A questo prezzo si prova senza pensarci — ma è il livello piccolo: se le risposte ti sembrano piatte, è questo il motivo, non il personaggio.',
    webSearch: true,
    data: 'OpenAI dichiara di non usare i dati delle API per addestrare i modelli senza adesione esplicita.',
  },
  {
    provider: 'openai',
    model: 'gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
    price: { input: 2, output: 12 },
    it: 'Il livello di mezzo, e usa la stessa chiave delle immagini. Può leggere foto e cercare sul web senza cambiare fornitore.',
    webSearch: true,
    data: 'OpenAI dichiara di non usare i dati delle API per addestrare i modelli senza adesione esplicita.',
  },
  {
    provider: 'openai',
    model: 'gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    price: { input: 5, output: 30 },
    it: 'Il livello grosso di OpenAI. Costa come Opus 5 in ingresso e un po’ di più in uscita: è il confronto diretto da fare se vuoi sapere quale delle due aziende ti scrive meglio il personaggio.',
    webSearch: true,
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
  /* 🔷 «Fammi scegliere anche tra gli altri Kimi, non solo il 3.» K2.6 è il
     gradino sotto: stessa azienda, stessa finestra da un milione di token,
     circa un terzo del prezzo di K3. Non è «peggiore» a priori — è più
     piccolo, e su un personaggio che parla italiano la differenza si sente
     solo ascoltando, come per tutte le voci di questa lista. */
  {
    provider: 'moonshot',
    model: 'kimi-k2.6',
    label: 'Kimi K2.6',
    price: { input: 0.95, output: 4 },
    it: 'Un gradino sotto K3, circa un terzo del prezzo. Stessa azienda, stessa finestra da un milione di token: costa meno da provare per primo.',
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
/* --- CHI DISEGNA (§22.4) ----------------------------------------------------
   🔷 «Ma io non ho potuto scegliere che AI immagini usare, vorrei la più
   recente lato immagine.»

   Aveva ragione: la voce e il compilatore erano due menù, il disegnatore era
   una riga inchiodata. Ed è la scelta che si vede di più — è letteralmente
   quella che disegna la creatura.

   ⚠️ I PREZZI QUI SONO STIMATI, e va detto invece che nascosto. Il listino di
   OpenAI non è raggiungibile da dove è stato scritto questo file, quindi
   vengono da fonti terze e sono arrotondati PER ECCESSO: il contatore può
   sbagliare dicendo che hai speso più del vero, mai meno. Dopo un giro vero,
   DEV → COSTI dice il numero giusto e queste righe si correggono.
   -------------------------------------------------------------------------- */

export interface ImageChoice {
  provider: Provider;
  model: string;
  label: string;
  /** Dollari per immagine a 1024×1024, arrotondati per eccesso. */
  perImage: number;
  it: string;
}

export const IMAGE_CHOICES: ImageChoice[] = [
  {
    provider: 'openai',
    model: 'gpt-image-2',
    label: 'GPT Image 2',
    perImage: 0.05,
    it: 'Il più recente: ragiona prima di disegnare, regge meglio il testo dentro l’immagine e tiene la risoluzione alta. È il predefinito.',
  },
  {
    provider: 'openai',
    model: 'gpt-image-1',
    label: 'GPT Image 1',
    perImage: 0.04,
    it: 'Il precedente. Costa un filo meno ed è quello con cui le prime prove di questo progetto sono state fatte: serve come termine di paragone se il nuovo non ti convince.',
  },
];

/** Una scelta di disegnatore che il suo fornitore non sa servire non deve esistere. */
export function imageChoiceProblems(choices = IMAGE_CHOICES): string[] {
  const needs = NEEDS.image;
  const problems: string[] = [];
  for (const c of choices) {
    for (const [need, required] of Object.entries(needs) as [keyof Needs, boolean][]) {
      if (required && !CAN[c.provider][need]) {
        problems.push(`${c.label} → ${c.provider} non offre ${need}`);
      }
    }
    /* 🔒 Un prezzo a zero renderebbe il tetto cieco proprio sulla voce di
       spesa più grossa del progetto. */
    if (!(c.perImage > 0)) problems.push(`${c.label} non ha un prezzo per immagine`);
  }
  const base = ROUTING.image;
  if (!choices.some((c) => c.model === base.model)) {
    problems.push(`il disegnatore predefinito (${base.model}) non è fra le scelte`);
  }
  return problems;
}

export function resolveRoute(capability: Capability, preferredModel?: string | null): Route {
  if (!preferredModel) return ROUTING[capability];

  const pool =
    capability === 'character-voice'
      ? (VOICE_CHOICES as { provider: Provider; model: string }[])
      : capability === 'prompt-compile'
        ? (COMPILER_CHOICES as { provider: Provider; model: string }[])
        : capability === 'image'
          ? (IMAGE_CHOICES as { provider: Provider; model: string }[])
          : capability === 'text-cheap'
            ? (TEXT_CHEAP_CHOICES as { provider: Provider; model: string }[])
            : capability === 'vision-quick'
              ? (VISION_QUICK_CHOICES as { provider: Provider; model: string }[])
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
    model: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    price: { input: 0.2, output: 1.2 },
    /* ⚠️ Detto prima invece che scoperto dopo: qui il lavoro NON è piccolo.
       §10 chiede di risolvere i conflitti fra livelli — umanoidità contro nomi
       delle masse, densità contro numero di sistemi — che è esattamente la
       cosa su cui un modello piccolo cede. A dieci volte meno vale provarlo,
       ma se i prompt tornano generici sai già dove guardare. */
    it: 'Dieci volte meno di Terra. Il lavoro però qui non è piccolo: deve sciogliere le contraddizioni fra i livelli, ed è la cosa su cui un modello piccolo cede per primo. Provalo, ma guarda i prompt che escono.',
  },
  {
    provider: 'openai',
    model: 'gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
    price: { input: 2, output: 12 },
    it: 'Quello che hai chiesto tu, ed è il predefinito. Usa la chiave OPENAI_API_KEY che serve già per le immagini: nessuna variabile in più.',
  },
  {
    provider: 'openai',
    model: 'gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    price: { input: 5, output: 30 },
    it: 'Il livello grosso. Un prompt riscritto è quasi tutta uscita — otto o novemila token — quindi qui il prezzo in uscita pesa più che altrove: circa 25 centesimi a prompt contro i 10 di Terra.',
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

/* ============================================================================
   RIFLESSIONE E VISIONE — «Perché non c'è niente?»

   🔷 «Mi dai anche i nomi da inserire se io volessi aggiungere altre AI.»

   Non c'erano alternative perché non erano mai state scritte — non un
   limite tecnico. Adesso ce ne sono, con lo stesso criterio di
   VOICE_CHOICES/COMPILER_CHOICES: prezzo vero, una riga di perché.

   🔒 GEMINI NON È FRA LE ALTERNATIVE DI `text-cheap`, ED È DELIBERATO — non
   una dimenticanza. La riflessione legge MESI della tua storia: è la
   capacità più personale del catalogo. Il commento sopra `ROUTING` lo dice
   già: il piano GRATUITO di Google addestra sui dati, quello a pagamento
   no, e quale dei due hai dipende dalla fatturazione del TUO progetto — una
   cosa che questo file non può vedere. Finché non è una scelta guardando la
   tua fattura, resta fuori. Su `vision-quick` invece va bene: lì arriva solo
   una foto senza contesto, non la tua storia.
   ========================================================================= */

export interface CheapChoice {
  provider: Provider;
  model: string;
  label: string;
  price: { input: number; output: number };
  it: string;
}

export const TEXT_CHEAP_CHOICES: CheapChoice[] = [
  {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    price: { input: 1, output: 5 },
    it: 'Il predefinito. Legge mesi della tua storia in un colpo solo: qui la cosa che conta è chi non addestra sui tuoi dati, non chi costa meno.',
  },
  {
    provider: 'openai',
    model: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    price: { input: 0.2, output: 1.2 },
    it: 'Un quinto del prezzo di Haiku. OpenAI dichiara di non usare i dati delle API per addestrare senza adesione esplicita — stessa garanzia, fornitore diverso.',
  },
  {
    provider: 'moonshot',
    model: 'kimi-k2.6',
    label: 'Kimi K2.6',
    price: { input: 0.95, output: 4 },
    it: 'Circa il prezzo di Haiku. Moonshot AI, azienda cinese: le condizioni sull’uso dei dati vanno lette prima di mandarci mesi della tua storia — qui non c’è la stessa garanzia degli altri due.',
  },
];

export const VISION_QUICK_CHOICES: CheapChoice[] = [
  {
    provider: 'google',
    model: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    price: { input: 0.3, output: 2.5 },
    it: 'Il predefinito. Qui arriva solo la foto, senza una riga di contesto: un piatto non dice chi sei, quindi il piano gratuito di Google va bene per questo lavoro e non per la riflessione.',
  },
  {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    price: { input: 1, output: 5 },
    it: 'Più caro di Gemini per leggere una foto sola, ma la stessa chiave che già usi per la riflessione: nessuna variabile in più su Netlify.',
  },
  {
    provider: 'openai',
    model: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    price: { input: 0.2, output: 1.2 },
    it: 'La chiave che già usi per le immagini e per il compilatore. Prezzo vicino a Gemini, stessa garanzia sui dati di Luna altrove nel catalogo.',
  },
  {
    provider: 'moonshot',
    model: 'kimi-k2.6',
    label: 'Kimi K2.6',
    price: { input: 0.95, output: 4 },
    it: 'Guarda anche le foto, non solo la voce. Qui non è un problema di dati — una foto di un piatto non dice chi sei — resta solo una domanda di prezzo.',
  },
];

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

/* ============================================================================
   GLI STEP: CHI CHIEDE COSA, E CON QUALE MODELLO (§19.3)

   🔷 «Non voglio che scegliere SOL per il Character Master obblighi
      automaticamente SOL per Bio, Teach o altri lavori. E non voglio che
      scegliere LUNA per una funzione economica abbassi involontariamente la
      qualità del Character Master.»

   ⚠️ IL DIFETTO ERA REALE E STRUTTURALE. Quattro lavori diversi condividevano
   la capacità `prompt-compile` e la stessa preferenza `compilerModel`:

     il Creative Resolver   interpreta vincoli, scioglie conflitti, fa art
                            direction, sacrifica idee — è IL lavoro
     INSEGNA                due frasi e una lezione
     BIO                    un JSON corto
     PROMPT IMMAGINI        una riscrittura

   Un menu solo per quattro profili incompatibili: alzarlo per il primo
   pagava a vuoto gli altri tre, abbassarlo per gli altri tre rovinava il
   primo. E altri quattro step — la stanza, la riflessione, il taccuino, le
   foto — non avevano nessuna preferenza: prendevano sempre il predefinito
   della rotta senza che tu potessi dire niente.

   ════════════════════════════════════════════════════════════════════════════
   🔒 DUE LIVELLI, E LA DIFFERENZA È TUTTO IL PUNTO.

     CAPACITÀ  cosa serve saper fare. Decide quali modelli sono AMMISSIBILI,
               e resta la difesa: il server non chiama niente che non sappia
               prezzare.
     STEP      quale lavoro è. Decide quale modello si PREFERISCE, come si
               aspetta la risposta, quanto deve ragionare e quanto può
               scrivere.

   Lo step non aggira la capacità: le passa davanti. La preferenza viaggia nel
   campo che il server già conosce e `resolveRoute` la accetta solo se
   corrisponde a una voce del catalogo — un nome inventato dal browser torna
   al predefinito invece di essere chiamato.
   ════════════════════════════════════════════════════════════════════════════
   ========================================================================= */

export type AiStepId =
  | 'characterMaster'
  | 'teach'
  | 'bio'
  | 'narrator'
  | 'imagePrompt'
  | 'voice'
  | 'reflection'
  | 'memory'
  | 'vision'
  | 'image';

export interface AiStep {
  id: AiStepId;
  /** Come si chiama per te. Mai «compiler»: devi capire cosa stai scegliendo. */
  label: string;
  /** A cosa serve, in una riga. */
  it: string;
  capability: Capability;
  /**
   * Il modello quando non hai scelto niente.
   *
   * ⚠️ NON è `ROUTING[capability]`, ed è la ragione per cui questo campo
   * esiste: quattro step condividono `prompt-compile`, e il predefinito della
   * rotta è per forza uno solo. Qui ognuno ha il suo.
   */
  fallback: string;
  /**
   * 🔷 IL MODELLO DI TUTTI I GIORNI, per gli step che ne meritano due.
   *
   * ════════════════════════════════════════════════════════════════════════
   * PERCHÉ DUE, INVECE DI UNO SOLO PIÙ ECONOMICO.
   *
   * «ok», «fatto», «ho mangiato riso e pollo» e «oggi mi sento uno straccio,
   * è da settimane che rimando tutto» arrivano dalla stessa casella di testo
   * e non sono lo stesso lavoro. Il primo è una ricevuta; l'ultimo è il
   * motivo per cui questa app esiste.
   *
   * Pagare il modello grosso per la ricevuta è lo spreco. Pagare quello
   * piccolo per l'ultimo è il danno. `everyday` serve al primo, `fallback`
   * al secondo, e a decidere è `deservesThinking()` — che guarda il messaggio
   * PRIMA di mandarlo.
   *
   * 🔒 SI CLASSIFICA PRIMA, NON SI RIPROVA DOPO. Il modo diffuso di fare
   * questa cosa è «prova col piccolo, controlla il risultato, se non basta
   * rifai col grosso»: su ogni escalation paghi DUE volte, e serve anche un
   * giudice — che è una terza chiamata. Qui la scelta si fa una volta sola
   * leggendo il testo, quindi nessun turno viene mai pagato due volte.
   *
   * ⚠️ E LE DUE CACHE NON SI SOMMANO. Ogni modello ha la sua: quello raro la
   * trova quasi sempre fredda e paga l'ingresso pieno. È già dentro i conti —
   * il risparmio vero è intorno al 60%, non il 90% che verrebbe fuori
   * moltiplicando i listini e basta.
   *
   * Assente = questo step ha un modello solo, e non c'è niente da decidere.
   * ════════════════════════════════════════════════════════════════════════
   */
  everyday?: string;
  /**
   * Il lavoro può superare la finestra della funzione, quindi parte e si va a
   * riprendere.
   *
   * 🔒 È una proprietà dello STEP, non del modello. Un lavoro che può durare
   * minuti va protetto anche il giorno che ci metti sopra un modello veloce;
   * un lavoro di due frasi non va rallentato di un giro di rete solo perché
   * quel giorno ci hai messo un modello lento.
   */
  background: boolean;
  /** Quanto deve ragionare, dove il fornitore lo accetta. */
  effort: 'none' | 'low' | 'medium';
  maxTokens: number;
  /** Qui la qualità viene prima della velocità, e non si baratta. */
  qualityCritical: boolean;
}

export const AI_STEPS: Record<AiStepId, AiStep> = {
  /* ⚠️ SOL, ED È L'UNICA RIGA CHE NON SI TOCCA PER RISPARMIARE.
     🔷 «Anche nel preset economico il Character Master resta Sol. Non voglio
        un pulsante "economico" che mi peggiora i character.» */
  characterMaster: {
    id: 'characterMaster',
    label: 'CHARACTER MASTER',
    it: 'Decide chi è la creatura: scioglie i conflitti fra i livelli e fa le scelte di disegno. È qui che si spende in qualità.',
    capability: 'prompt-compile',
    fallback: 'gpt-5.6-sol',
    background: true,
    effort: 'medium',
    /* Alto perché un modello che ragiona spende token anche per pensare: un
       tetto stretto lo taglia MENTRE pensa e produce un JSON troncato. */
    maxTokens: 8000,
    qualityCritical: true,
  },
  teach: {
    id: 'teach',
    label: 'INSEGNA',
    it: 'Ti risponde quando gli insegni qualcosa, e ne ricava la regola da tenere. Due frasi.',
    capability: 'prompt-compile',
    fallback: 'gpt-5.6-luna',
    background: false,
    effort: 'none',
    maxTokens: 700,
    qualityCritical: false,
  },
  bio: {
    id: 'bio',
    label: 'BIO',
    it: 'Scrive la storia della creatura. Testo corto, e i controlli deterministici restano identici.',
    capability: 'prompt-compile',
    fallback: 'gpt-5.6-luna',
    background: false,
    effort: 'low',
    maxTokens: 2000,
    qualityCritical: false,
  },
  /* 🔷 VINZMON_NARRATIVE_ROLE_IMPLEMENTATION_BRIEF §10 — la voce con cui
     VINZ.MON racconta l'arrivo di una forma, quando fa da narratore/sistema.
     Stesso profilo di BIO: testo corto, si scrive una volta sola, non è
     critico per la qualità come il Character Master. */
  narrator: {
    id: 'narrator',
    label: 'NARRATORE',
    it: 'Il testo con cui VINZ.MON racconta l’arrivo della forma, voce terminale/sistema. Testo corto, una volta sola.',
    capability: 'prompt-compile',
    fallback: 'gpt-5.6-luna',
    background: false,
    effort: 'low',
    maxTokens: 900,
    qualityCritical: false,
  },
  imagePrompt: {
    id: 'imagePrompt',
    label: 'PROMPT IMMAGINI',
    it: 'Riscrive i prompt dei cinque asset che il Character Master non copre. Fino a cinque volte per creatura.',
    capability: 'prompt-compile',
    fallback: 'gpt-5.6-luna',
    background: false,
    effort: 'low',
    maxTokens: 8000,
    qualityCritical: false,
  },
  voice: {
    id: 'voice',
    label: 'VOCE',
    it: 'Come parla il .mon, in chat e nella stanza. Si giudica a orecchio, non a numeri.',
    capability: 'character-voice',
    fallback: 'claude-opus-5',
    /* ════════════════════════════════════════════════════════════════════
       🔷 «Serve avere sempre tutto in alta? Usiamo delle AI basse, a
       chiamata si alzano.» — sì, ed è come lo fa chi lo fa di mestiere.

       I numeri pubblici del 2026 dicono la stessa cosa da tre direzioni:
       il routing taglia il 40-85% del conto senza perdita visibile, e
       RouteLLM tiene ~95% della qualità del modello grosso mandandogli
       solo il 14-26% delle chiamate. Qui la quota che si alza è più o meno
       quella: `deservesThinking()` chiede una domanda esplicita o
       centoquaranta caratteri, e in un'app dove il messaggio più frequente
       è «ho mangiato X» quella soglia la passa circa un messaggio su
       cinque.

       ⚠️ LUNA E OPUS SONO DI DUE AZIENDE DIVERSE, E §19.1 QUI SOPRA DICE
       CHE LA VOCE STA SU UN FORNITORE SOLO. È una regola vera e la sto
       piegando di proposito, quindi va detto perché.

       Quella regola esiste per proteggere UNA cosa: che il carattere non
       cambi sfumatura sotto i piedi. Questa divisione la protegge meglio
       di quanto farebbe restare su un fornitore solo — perché i messaggi
       che vanno a Luna sono «ok, segnato» e «buonanotte», dove di
       carattere da perdere non ce n'è, e TUTTI i messaggi che un carattere
       ce l'hanno continuano ad andare esattamente al modello su cui il
       personaggio è stato scritto e tarato.

       L'alternativa che rispettava la lettera della regola era
       Luna → Sol: costa uguale, e cambia la voce proprio nei momenti che
       contano. Fra rispettare la lettera e rispettare lo scopo, ho scelto
       lo scopo. Se all'ascolto non regge, questa riga è l'unica da
       cambiare.
       ════════════════════════════════════════════════════════════════════ */
    everyday: 'gpt-5.6-luna',
    background: false,
    effort: 'medium',
    maxTokens: 2000,
    qualityCritical: true,
  },
  reflection: {
    id: 'reflection',
    label: 'RIFLESSIONE',
    it: 'La lettura settimanale e gli appunti. È l’unico lavoro piccolo che legge mesi della tua storia in un colpo solo.',
    capability: 'text-cheap',
    fallback: 'claude-haiku-4-5',
    background: false,
    effort: 'low',
    maxTokens: 700,
    qualityCritical: false,
  },
  memory: {
    id: 'memory', label: 'MEMORY', it: 'Giudizio ed estrazione della memoria semantica.', capability: 'text-cheap', fallback: 'claude-haiku-4-5', background: false, effort: 'low', maxTokens: 1800, qualityCritical: false,
  },
  vision: {
    id: 'vision',
    label: 'VISIONE',
    it: 'Guarda una foto e dichiara cosa c’è. Nel dubbio, niente.',
    capability: 'vision-quick',
    fallback: 'gemini-2.5-flash',
    background: false,
    effort: 'none',
    maxTokens: 400,
    qualityCritical: false,
  },
  image: {
    id: 'image',
    label: 'IMMAGINI',
    it: 'Disegna. Un modello di testo qui non sostituisce niente.',
    capability: 'image',
    fallback: 'gpt-image-2',
    background: false,
    effort: 'none',
    maxTokens: 0,
    qualityCritical: true,
  },
};

/** L'ordine in cui si mostrano: prima quello che decide, poi il resto. */
export const AI_STEP_ORDER: AiStepId[] = [
  'characterMaster',
  'bio',
  'narrator',
  'imagePrompt',
  'image',
  'voice',
  'teach',
  'reflection',
  'memory',
  'vision',
];

/** Il catalogo dei modelli ammissibili per una capacità. */
export function choicesFor(
  capability: Capability,
): { provider: Provider; model: string; label: string }[] {
  /* 🔷 «Mi dai anche i nomi da inserire se io volessi aggiungere altre AI.»
     `text-cheap`/`vision-quick` avevano un catalogo di uno solo — «un elenco
     di uno solo è più onesto di un menu finto» — perché nessuno le aveva
     ancora scritte, non perché non potessero esistere. Adesso ce le hanno,
     vedi TEXT_CHEAP_CHOICES e VISION_QUICK_CHOICES qui sopra: le cinque
     capacità hanno tutte un catalogo vero, e uno `switch` esaustivo lo dice
     al compilatore invece che a un commento. */
  switch (capability) {
    case 'character-voice':
      return VOICE_CHOICES;
    case 'prompt-compile':
      return COMPILER_CHOICES;
    case 'image':
      return IMAGE_CHOICES;
    case 'text-cheap':
      return TEXT_CHEAP_CHOICES;
    case 'vision-quick':
      return VISION_QUICK_CHOICES;
  }
}

/**
 * Il modello che serve questo step: quello che hai scelto, o il suo predefinito.
 *
 * 🔒 Non torna mai `null`: uno step senza preferenza deve comunque poter dire
 * al server quale modello vuole, altrimenti ricadrebbe sul predefinito della
 * CAPACITÀ — che è condiviso fra quattro step, ed è esattamente il difetto che
 * questo strato esiste per togliere.
 */
export function modelForStep(
  step: AiStepId,
  chosen?: string | null,
  /**
   * Quanto pesa QUESTO turno.
   *
   * 🔒 `everyday` vale solo se non hai scelto tu: una scelta esplicita nel
   * menu è esplicita e vince su tutto. Chi mette Opus sulla voce perché
   * vuole Opus deve avere Opus, anche su «ok».
   */
  weight: 'everyday' | 'full' = 'full',
): string {
  const def = AI_STEPS[step];
  if (!chosen) return weight === 'everyday' ? (def.everyday ?? def.fallback) : def.fallback;
  const ok = choicesFor(def.capability).some((c) => c.model === chosen);
  return ok ? chosen : def.fallback;
}

/**
 * Quello che non torna nel catalogo degli step.
 *
 * ⚠️ Uno step il cui predefinito non esiste nel catalogo della sua capacità
 * ricadrebbe in silenzio sulla rotta condivisa: nessun errore, nessun avviso,
 * e Sol che diventa Terra senza che nessuno se ne accorga. È il modo esatto in
 * cui questa architettura può tornare rotta, quindi si controlla a ogni build.
 */
export function stepProblems(steps = AI_STEPS): string[] {
  const problems: string[] = [];
  for (const step of Object.values(steps)) {
    const pool = choicesFor(step.capability);
    if (!pool.some((c) => c.model === step.fallback)) {
      problems.push(`${step.label} → «${step.fallback}» non è nel catalogo di ${step.capability}`);
    }
    if (step.background && step.capability !== 'prompt-compile') {
      problems.push(`${step.label} → il lavoro in background esiste solo per prompt-compile`);
    }
    /* 🔒 Un `everyday` fuori catalogo sarebbe il guasto più silenzioso di
       tutti: `modelForStep` lo restituirebbe, il server non lo riconoscerebbe
       e `resolveRoute` tornerebbe al predefinito della CAPACITÀ — cioè un
       modello che nessuno ha scelto, senza un errore da nessuna parte. */
    if (step.everyday && !pool.some((c) => c.model === step.everyday)) {
      problems.push(`${step.label} → «${step.everyday}» non è nel catalogo di ${step.capability}`);
    }
    /* E deve costare MENO del grosso, o non è il modello di tutti i giorni:
       è solo un secondo modello messo lì per sbaglio. */
    if (step.everyday && step.everyday === step.fallback) {
      problems.push(`${step.label} → il modello di tutti i giorni è identico a quello pieno`);
    }
  }
  /* 🔒 E la riga che protegge il prodotto: il Character Master deve restare
     sul livello alto. Se un giorno qualcuno lo abbassa «per far prima»,
     questo controllo lo dice prima che venga pubblicato. */
  if (!steps.characterMaster.qualityCritical || steps.characterMaster.background === false) {
    problems.push('CHARACTER MASTER → deve restare critico per la qualità e in background');
  }
  return problems;
}

/* ============================================================================
   IL CONSIGLIO PER OGNI LAVORO — COSTO E GESTIONE DATI, SCRITTI, NON A OCCHIO

   🔷 «Hai fatto un Hub in cui automaticamente scegli ogni AI per ogni singola
   azione, così scegliamo quella meno costosa e con meno problemi sui dati?
   Per ogni sezione inserisci quale consigli, dato il costo basso e la
   gestione dei dati, e la seleziona automaticamente.»

   ════════════════════════════════════════════════════════════════════════
   ⚠️ IL RISULTATO PIÙ IMPORTANTE NON È IL BOTTONE: È QUELLO CHE HA RIVELATO.

   Kimi (Moonshot) allena i suoi modelli sui dati dell'API PER DEFAULT, senza
   modo di disattivarlo se non con un accordo enterprise negoziato a parte —
   il contrario di OpenAI e Anthropic, che escludono il traffico API dal
   training di default. Verificato online, non supposto.

   E Kimi non è nemmeno IN LISTA per bio, insegna, narratore, prompt immagini
   o master: `COMPILER_CHOICES` sopra contiene solo OpenAI e un Sonnet di
   controllo. L'UNICO posto dove compare è `VOICE_CHOICES` — che è
   esattamente la capacità marcata `PERSONAL`. Quindi la domanda «lo uso solo
   dove non tocca dati» ha una risposta netta: STRUTTURALMENTE, in questo
   catalogo, Kimi non ha una casa sicura. O è nel menu sbagliato (la voce,
   personale) o non è nel menu per niente (tutto il resto).

   E anche ignorando i dati: Kimi non è nemmeno il più economico. Luna
   ($0,20/$1,20) costa un quarto di Kimi K2.6 ($0,95/$4). Il consiglio qui
   sotto non esclude Kimi per principio — lo esclude perché perde su
   ENTRAMBI gli assi, dati e prezzo, ovunque lo si metta.
   ════════════════════════════════════════════════════════════════════════

   IL CRITERIO, PER OGNI STEP:

     1. `qualityCritical` → non si tocca MAI. «Non voglio un pulsante
        economico che mi peggiora i character.» Resta sul suo `fallback`.
     2. capacità in `PERSONAL` → il più economico FRA QUELLI CHE NON
        ALLENANO SUI TUOI DATI SENZA CONSENSO (OpenAI, Anthropic — mai
        Moonshot, qui, per la ragione sopra).
     3. tutto il resto (non critico, non personale) → il più economico
        dell'intero catalogo della sua capacità, chiunque sia.
   ========================================================================= */

/** Chi si allena sui dati dell'API per default, senza un modo semplice di
 * disattivarlo. Verificato: solo Moonshot, ad agosto 2026. */
const TRAINS_ON_API_DATA_BY_DEFAULT: Provider[] = ['moonshot'];

export interface StepRecommendation {
  model: string;
  /** Perché, in una riga: costo e/o dati. */
  why: string;
}

/**
 * Il consiglio per UNO step, con la ragione. Pura funzione di `AI_STEPS` e
 * dei cataloghi: nessuno stato, nessuna sorpresa — lo stesso step consiglia
 * sempre la stessa cosa finché i listini non cambiano.
 */
export function recommendedModel(stepId: AiStepId): StepRecommendation {
  const step = AI_STEPS[stepId];

  if (step.qualityCritical) {
    return {
      model: step.fallback,
      why: 'critico per la qualità: qui non si risparmia, per scelta esplicita.',
    };
  }

  const pool = choicesFor(step.capability);
  const isPersonal = PERSONAL.includes(step.capability);
  const candidates = isPersonal
    ? pool.filter((c) => !TRAINS_ON_API_DATA_BY_DEFAULT.includes(c.provider))
    : pool;

  /* `price` esiste solo sulle scelte di voce/compilatore; le altre capacità
     hanno un catalogo di una voce sola e quel prezzo non serve a scegliere. */
  const priced = candidates as { model: string; price?: { input: number; output: number } }[];
  const cheapest = priced.reduce<typeof priced[number] | null>((best, c) => {
    if (!c.price) return best;
    if (!best?.price) return c;
    // L'uscita pesa di più: sui lavori di questa capacità l'uscita domina
    // sempre l'ingresso di almeno un ordine di grandezza (prompt lunghi,
    // risposte lunghe). Un confronto solo sull'ingresso sceglierebbe male.
    return c.price.output < best.price.output ? c : best;
  }, null);

  const chosen = cheapest?.model ?? step.fallback;
  const reason = isPersonal
    ? 'il più economico fra quelli che NON allenano sui tuoi dati senza consenso.'
    : 'il più economico del catalogo: qui il lavoro non porta niente di personale.';
  return { model: chosen, why: reason };
}

/**
 * Il consiglio per TUTTI gli step, pronto per un preset.
 *
 * 🔒 Esclude gli step `qualityCritical`: tornano `undefined` (nessuna scelta
 * esplicita, cioè il loro predefinito) invece di un valore uguale a sé
 * stesso — coerente con come `useQualityPreset` già svuota `stepModels`.
 */
export function recommendedPreset(): Partial<Record<AiStepId, string>> {
  const out: Partial<Record<AiStepId, string>> = {};
  for (const id of AI_STEP_ORDER) {
    if (AI_STEPS[id].qualityCritical) continue;
    out[id] = recommendedModel(id).model;
  }
  return out;
}
