/* ============================================================================
   STRINGHE — ITALIANO

   Convenzione, letta dal board: la lingua parlata dell'app è l'italiano, ma
   i nomi di sistema restano in inglese maiuscolo — MON / ME / MINDLINE,
   EVOLUTION SYNC, RARE, SIGNAL STABILITY, WAITING FOR IMAGE.
   Non è un bilinguismo casuale: è la stessa distinzione fra voce del prodotto
   e metadata tecnico che regge tutta la tipografia di §10.3.

   🟡 §18 — la terminologia definitiva di incubazione dopo l'abbandono del nome
   DIGIVINZ non è ancora fissata. Le voci marcate qui sotto sono provvisorie.
   ========================================================================= */

export const t = {
  nav: {
    mon: 'MON',
    me: 'ME',
    mindline: 'MINDLINE',
  },

  /* 04 FIRST SIGNAL / INCUBATION — 🟡 terminologia provvisoria */
  incubation: {
    title: 'PRIMO SEGNALE',
    subtitle: 'INCUBAZIONE',
    day: 'GIORNO',
    stability: 'SIGNAL STABILITY',
    waiting: 'Il sistema sta ancora leggendo. Non c’è niente da fare: continua a vivere.',
    ready: 'Il segnale è stabile.',
    hatch: 'HATCH',
    definitive: 'Questa scelta è definitiva.',
    notReady: 'Segnale non ancora stabile',
  },

  /* 05 / 14 ENCOUNTER */
  encounter: {
    firstTitle: 'PRIMO INCONTRO',
    newTitle: 'NUOVO INCONTRO',
    welcome: 'BENVENUTO A CASA',
    enter: 'ENTRA',
  },

  /* 06 MON / COMPANION HOME */
  home: {
    composerPlaceholder: 'Scrivi a',
    evolutionSync: 'EVOLUTION SYNC',
    bond: 'BOND',
    openProfile: 'PROFILO COMPLETO',
    fallbackNotice: 'risposta di fallback',
  },

  /* 07 UNIVERSAL INPUT */
  input: {
    title: 'COSA VUOI FARE?',
    subtitle: 'Scegli come interagire con il mondo.',
    camera: 'CAMERA',
    cameraHint: 'Scatta o carica una foto',
    tell: 'TELL ME',
    tellHint: 'Racconta qualcosa',
    measure: 'MEASURE',
    measureHint: 'Sincronizza un dato',
    workout: 'WORKOUT',
    workoutHint: 'Registra un allenamento',
    notePlaceholder: 'Aggiungi una nota (facoltativo)',
    confirm: 'REGISTRA',
    cancel: 'ANNULLA',
  },

  /* 08 DAILY SCAN — input mood di §11 */
  scan: {
    title: 'DAILY SCAN',
    moodTitle: 'COME STAI OGGI',
    rule: 'Fino a 3 al giorno. Un solo giorno non decide mai come sarà il tuo .mon: quello che dichiari entra in una finestra di 14 giorni, dove gli ultimi 3 pesano il doppio e nessun giorno singolo può contare più del 18%.',
    latentTitle: 'FINESTRA LATENTE',
    latentNote: 'È questo che il generatore legge, non il singolo giorno.',
    confidenceTitle: 'DATA CONFIDENCE',
    lowConfidence:
      'Con pochi dati il sistema usa un umore neutro invece di inventarne uno forte.',
    missingTitle: 'SEGNALI NON LETTI',
    missingNote: 'Restano sconosciuti. Non contano come zero e non peggiorano niente.',
    syncNow: 'SINCRONIZZA UN DATO',
    confirm: 'REGISTRA',
  },

  /* 09 ME OVERVIEW */
  me: {
    title: 'ME',
    subtitle: 'LIVELLO DI VERITÀ ANALITICA',
    condition: 'CONDITION',
    conditionNote: 'Stato di oggi, non una statistica permanente.',
    disc: 'DISC',
    discNote: 'Costanza nel collaborare col sistema.',
    confidence: 'CONFIDENZA DEL DATO',
    unknownNote: 'I dati mancanti restano sconosciuti. Non contano come zero.',
    trend7: 'TREND 7 GIORNI',
  },

  /* 11 MINDLINE SHIFT */
  shift: {
    title: 'MINDLINE SHIFT',
    subtitle: 'IL PERCORSO SI DIVIDE QUI',
    continueTitle: 'CONTINUA',
    continueBody:
      'Resti con lo stesso .mon. La stessa identità evolve: sviluppo, mutazione, legame più profondo.',
    continueAction: 'EVOLVE',
    branchTitle: 'DEVIA',
    branchBody:
      'Saluti il .mon attuale e segui una deviazione della Mindline. Nasce un nuovo .mon, che porta con sé 1–3 tratti riconoscibili.',
    branchAction: 'NUOVO SEGNALE',
    notEligible: 'NON DISPONIBILE',
    stay: 'NON ORA',
  },

  /* 12 EVOLUTION */
  evolution: {
    title: 'EVOLUZIONE',
    same: 'STESSA IDENTITÀ',
    spent: 'XP SPESI',
    from: 'DA',
    to: 'A',
    done: 'CONTINUA',
  },

  /* 13 NEW BRANCH */
  branch: {
    title: 'NUOVA DEVIAZIONE',
    subtitle: 'COSA SOPRAVVIVE',
    lead: 'Questi tratti passeranno al prossimo .mon, tradotti nella sua anatomia.',
    unknownAhead: 'Chi arriva non è ancora stato generato.',
    goodbye: 'SALUTA',
    confirm: 'SEGUI LA DEVIAZIONE',
    back: 'TORNA INDIETRO',
  },

  /* 15 SPECIMEN PROFILE */
  specimen: {
    title: 'SPECIMEN',
    tabs: {
      stats: 'STATS',
      identity: 'IDENTITÀ',
      lineage: 'LINEAGE',
      assets: 'ASSET',
    },
    exportPackage: 'ESPORTA ASSET REQUEST',
    exporting: 'PREPARO IL PACCHETTO…',
    rotate: 'DRAG ORIZZONTALE PER RUOTARE',
  },

  /* 16 BIO / PERSONAL FILE */
  bio: {
    title: 'BIO',
    subtitle: 'FILE PERSONALE',
    remembered: 'DETTAGLI RICORDATI',
    notes: 'ANNOTAZIONI',
  },

  /* 17 MINDLINE */
  mindline: {
    title: 'MINDLINE',
    chapter: 'CAPITOLO',
    current: 'NODO CORRENTE',
    viewChapter: 'APRI IL NODO',
    nodes: 'NODI',
  },

  /* 18 HERITAGE DNA */
  heritage: {
    title: 'HERITAGE DNA',
    subtitle: 'COSA È PASSATO E COME',
    was: 'ERA',
    now: 'ORA',
    none: 'Nodo di origine: non eredita da nessuno.',
    from: 'DA',
  },

  /* 19 MEMORIES */
  memories: {
    title: 'MEMORIE',
    subtitle: 'ARCHIVIO DELLA RELAZIONE',
    empty: 'Ancora nessuna memoria. Servono giorni vissuti insieme.',
    carried: 'ARRIVATA DA UN ALTRO NODO',
  },

  /* 20 HISTORY */
  history: {
    title: 'EVOLUTION TIMELINE',
    subtitle: 'FORME',
    born: 'COMPARSO',
    retired: 'LASCIATO',
    active: 'ATTIVO',
  },

  /* Comune */
  common: {
    unknown: 'sconosciuto',
    close: 'Chiudi',
    back: 'Indietro',
    day: 'GIORNO',
    level: 'LIVELLO',
    xp: 'XP',
    waitingForImage: 'WAITING FOR IMAGE',
  },
} as const;
