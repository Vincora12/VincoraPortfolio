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
    calendar: 'GIORNI',
    mindline: 'MINDLINE',
  },

  /* 00 INGRESSO (MS v1.9 §13.1) */
  splash: {
    enter: 'TOCCA PER ENTRARE',
  },

  /* 03 PERSONALITY / SIGNAL SCAN (MS v1.8 §12) */
  scan03: {
    title: 'SIGNAL SCAN',
    subtitle: 'PRIMA CHE COMINCI',
    next: 'AVANTI',
    pick: 'SCEGLI UNA RISPOSTA',
    back: 'INDIETRO',
    /* La CTA è vincolata dal documento: «Final CTA: LOCK SIGNAL». */
    lock: 'LOCK SIGNAL',
    /* Dice due cose vere e nessuna promessa: non si torna indietro dopo il
       lock, e non c'è una risposta giusta da indovinare. */
    note: 'Nessuna risposta è migliore di un’altra. Dopo LOCK SIGNAL non si cambia.',
  },

  /* 04 FIRST SIGNAL / INCUBATION — 🟡 terminologia provvisoria */
  incubation: {
    title: 'PRIMO SEGNALE',
    subtitle: 'INCUBAZIONE',
    day: 'GIORNO',
    stability: 'SIGNAL STABILITY',
    waiting:
      'Il sistema sta ancora leggendo. Basta presentarsi: ogni giorno chiuso è un giorno che conta, e saltarne uno non azzera niente.',
    ready: 'Il segnale è stabile.',
    hatch: 'HATCH',
    definitive: 'Questa scelta è definitiva.',
    notReady: 'Segnale non ancora stabile',
    todayTitle: 'LA GIORNATA DI OGGI',
    todayOpen: (n: number) => `${n}/3 segnali. Aprila per raccontarla.`,
    todayReady: 'Pronta da chiudere. Vale +1 giorno.',
    todayClosed: 'Chiusa. Conta.',
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
    sync: 'SYNC',
    bond: 'BOND',
    openProfile: 'PROFILO COMPLETO',
    fallbackNotice: 'risposta di fallback',
    recorded: 'registrato:',
    writing: 'sta trovando le parole…',
  },

  /* 07 REGISTRA (MS v1.9 §5.2) — un campo solo, niente moduli */
  input: {
    title: 'REGISTRA UN DATO',
    subtitle: 'Scrivi com’è andata, o fotografa. Al resto pensa lui.',
    field: 'Cosa è successo',
    placeholder: 'carbonara e poi palestra, peso 78, sono distrutto…',
    addPhoto: 'SCATTA O CARICA UNA FOTO',
    removePhoto: 'TOGLI LA FOTO',
    understood: 'HA CAPITO QUESTO',
    nothingYet: 'Ancora niente. Scrivi qualcosa o aggiungi una foto.',
    notApplicable: 'non si applica oggi',
    photoWithAi: 'la leggerà lui',
    photoNoAi: 'salvata — senza chiave API non può leggerla',
    /* La riga che rende l'interpretazione onesta: se ha capito male, si
       riscrive e basta. Nessun campo da correggere, nessun menu da cercare. */
    correctHint: 'Se ha capito male, riscrivi più chiaro: si aggiorna mentre scrivi.',
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

    /* v1.5 — i tre Daily Signals. È la parte che decide se il giorno conta. */
    signalsTitle: 'I TRE SEGNALI DI OGGI',
    signalsNote:
      'VINZ.MON prova a capire tre cose al giorno. Non deve andarti bene: deve solo sapere com’è andata.',
    known: 'LO SO',
    notApplicable: 'NON SI APPLICA',
    unknown: 'NON ANCORA',
    restDay: 'RIPOSO',
    ateSomething: 'HO MANGIATO',
    moodFromChips: 'lo dichiari qui sotto',
    moodPrivate: 'PREFERISCO NON DIRLO',
    closeDay: 'CHIUDI IL GIORNO · +1 SYNC',
    closeDayBlocked: 'MANCA QUALCOSA PER CHIUDERE',
    alreadyClosed: 'GIORNO GIÀ CHIUSO',
    closeRule:
      'Un giorno vale +1 SYNC, non di più. Registrare dieci volte migliora quello che VINZ.MON sa di te, non la sua velocità.',
  },

  /* 09 ME OVERVIEW */
  me: {
    title: 'ME',
    subtitle: 'LIVELLO DI VERITÀ ANALITICA',
    condition: 'CONDITION',
    conditionTitle: 'COME STAI OGGI',
    // Diceva cosa NON è. Chi legge per la prima volta ha bisogno di sapere
    // cosa È, e da dove esce il numero.
    conditionNote:
      'Le sei letture qui sotto, riassunte in un numero. Pesa di più il recupero. Vale solo per oggi: domani si ricalcola da capo.',
    /* 🔶 v1.9 §4.1 — la distinzione che la schermata lasciava indovinare. */
    preamble:
      'Qui c’è come stai. Non è un punteggio e non fa crescere niente: i dati di salute danno forma a VINZ.MON, non ne comprano l’evoluzione.',
    syncTitle: 'QUANTO TI HA LETTO',
    syncTotal: 'GIORNI IN TUTTO',
    syncInForm: 'IN QUESTA FORMA',
    syncNote:
      'Questa sì che fa crescere: è l’unica. Un giorno raccontato vale +1, che tu stia bene o male.',
    confidence: 'CONFIDENZA DEL DATO',
    unknownNote: 'I dati mancanti restano sconosciuti. Non contano come zero.',
    trend7: '7 GIORNI',
  },

  /* 11 MINDLINE SHIFT */
  shift: {
    title: 'MINDLINE SHIFT',
    subtitle: 'QUALCOSA È PRONTO A CAMBIARE',
    days: (n: number) => `${n} ${n === 1 ? 'giorno sincronizzato' : 'giorni sincronizzati'}`,
    growthTitle: 'MATURA',
    growthBody: 'Stessa forma. Un dettaglio si risolve.',
    growthAction: 'LASCIA MATURARE',
    formTitle: 'CAMBIA FORMA',
    formBody: 'Stessa entità, configurazione nuova.',
    formAction: 'GUARDA COSA CAMBIA',
    notEligible: 'NON ANCORA',
    hold: 'tieni premuto',
    stay: 'NON ORA',
    /* La frase che toglie l'ansia: rimandare non costa niente. */
    noRush: 'Rimandare non fa perdere niente. I giorni continuano a contare.',
  },

  /* 12 EVOLUTION — micro-growth */
  evolution: {
    title: 'MATURAZIONE',
    same: 'STESSA IDENTITÀ',
    from: 'DA',
    to: 'A',
    reveal: 'NUOVA FORMA',
    assets: 'Gli asset visivi vanno rigenerati dal profilo.',
    done: 'CONTINUA',
  },

  /* 13 FORM EVOLUTION */
  branch: {
    title: 'CAMBIO DI FORMA',
    subtitle: 'COSA RESTA',
    /* 🔶 Nessun addio: VINZ.MON è una entità sola e la forma è una sua
       configurazione. Il testo dice «diventa», mai «saluta». */
    lead: 'Questi tratti passano nella forma nuova, tradotti nella sua anatomia.',
    anchorTitle: 'ANCORA DI CONTINUITÀ',
    anchorNote: 'Non cambia tutto. Questi assi restano come sono.',
    unknownAhead: 'Il resto si riconfigura. Non è ancora stato generato.',
    current: 'ORA',
    becomes: 'DIVENTA',
    confirm: 'CAMBIA FORMA',
    back: 'NON ORA',
  },

  /* CALENDARIO — superficie primaria di v1.8 §14 */
  calendar: {
    title: 'CALENDARIO',
    subtitle: 'I GIORNI CHE CONTANO',
    nextTitle: 'PROSSIMO TRAGUARDO',
    eventNames: {
      hatch: 'LA PRIMA FORMA',
      'micro-growth': 'UNA MATURAZIONE',
      'form-evolution': 'UN CAMBIO DI FORMA',
    },
    ready: 'È disponibile adesso.',
    remaining: (n: number) =>
      `Mancano ${n} ${n === 1 ? 'giorno sincronizzato' : 'giorni sincronizzati'}.`,
    hint: 'Tocca un giorno per vedere cosa si sapeva.',
    todayOpen: (n: number) => `${n}/3 SEGNALI`,
    todayClosed: 'CHIUSO',
    todayGo: 'Raccontala →',
    todayDone: 'Vale +1. A domani.',
    notKnown: 'non si sapeva',
    /* §14 — «No red punishment language for missed days.» */
    openDay: 'Giorno aperto. Non è un giorno perso: la crescita aspetta, non torna indietro.',
    syncedOf: 'giorni sincronizzati su',
    noStreak: 'Non c’è nessuna serie da difendere.',

    /* 🔶 GRACE — una pausa dichiarata. Non dà SYNC, e la schermata lo dice
       prima che uno lo scopra da sé, perché scoprirlo dopo sarebbe una
       fregatura. Il tono non chiede scusa e non fa la predica. */
    graceReason: 'Cosa è successo (facoltativo)',
    graceePlaceholder: 'ero malato, ero via…',
    graceMark: 'SEGNA COME PAUSA',
    graceUndo: 'NON ERA UNA PAUSA',
    graceWas: 'Pausa:',
    graceGeneric: 'Una pausa. Non c’eri, e non serve dire perché.',
    graceRule:
      'Una pausa non dà SYNC: in quei giorni VINZ.MON non ha potuto leggerti, e far avanzare il contatore sarebbe una bugia. Ma non toglie niente e non azzera niente — la crescita aspetta.',
  },

  /* 15 SPECIMEN PROFILE */
  specimen: {
    title: 'SPECIMEN',
    tabs: {
      stats: 'STATS',
      identity: 'IDENTITÀ',
      bio: 'BIO',
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
    remembered: 'COSE CHE MI PORTO DIETRO',
    notes: 'APPUNTI',
    doodleCaption: 'come mi vedo io',
  },

  /* 17 MINDLINE */
  mindline: {
    title: 'MINDLINE',
    chapter: 'CAPITOLO',
    current: 'NODO CORRENTE',
    viewChapter: 'APRI IL NODO',
    nodes: 'NODI',
    hint: 'Tocca un nodo per aprirlo.',
    restore: 'TORNA A QUESTO NODO',
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
    carried: 'QUANDO ERA',
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
    sync: 'SYNC',
    waitingForImage: 'WAITING FOR IMAGE',
  },
} as const;
