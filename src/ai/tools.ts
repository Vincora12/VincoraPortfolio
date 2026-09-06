/* ============================================================================
   GLI STRUMENTI (MASTER SPEC v1.17 §21)

   🔷 «Vorrei che lui riuscisse a gestire dei file o creare una pagina
   personalizzata. Altri strumenti che servono deve averli tutti.»

   ════════════════════════════════════════════════════════════════════════════
   FINO A IERI IL .MON SAPEVA SOLO PARLARE.

   `ask()` mandava dei messaggi e tornava del testo. Non poteva guardare i tuoi
   dati: vedeva solo quello che gli infilavamo noi nel prompt, scelto in
   anticipo da del codice che non sa cosa stai per chiedere. Se gli domandavi
   «quanto ho dormito questa settimana» poteva solo rispondere con quello che
   per caso era in quel riassunto.

   Gli strumenti ribaltano la cosa: invece di indovinare prima cosa gli
   servirà, gli si dà il modo di andare a prenderlo.
   ════════════════════════════════════════════════════════════════════════════

   🔒 GLI STRUMENTI GIRANO QUI, NEL BROWSER. Non sul server, e non è un
   dettaglio di comodità: i dati stanno qui. Un server che sapesse eseguirli
   dovrebbe prima farseli mandare tutti — mesi di salute, ricordi, protocollo —
   e sarebbe esattamente il contrario di quello che questo progetto fa. Il
   server vede passare i NOMI degli strumenti e i risultati che il modello
   deve leggere, mai l'archivio.

   L'unica eccezione dichiarata è la ricerca sul web, che gira dal fornitore
   perché è lui ad avere una connessione a internet e un indice.

   ⚠️ E GLI STRUMENTI CHE SCRIVONO NON SONO COME QUELLI CHE LEGGONO. Leggere
   una cosa sbagliata produce una frase sbagliata. Scrivere una cosa sbagliata
   resta. Quindi ogni strumento che scrive passa dai controlli di `pages.ts` e
   torna indietro un errore leggibile invece di applicare a metà.
   ========================================================================= */

import type { HealthState, Memory } from '../engine/types';
import { STAT_KEYS, isKnown } from '../engine/types';
import { STAT_LABELS, trend } from '../engine/health';
import type { Protocol } from '../engine/protocol';
import { describeDiet, describeTraining } from '../engine/protocol';
import type { DailySync } from '../engine/progression';
import { DAILY_SIGNALS } from '../engine/progression';
import type { Page, NewPage } from '../engine/pages';
import { pagesDigest } from '../engine/pages';
import { MANOPOLE } from '../engine/skin';
import { PEZZI } from '../engine/layout';
import type { EnergyProfile } from '../engine/dailyEnergy';
import type { CalendarEvent, CalendarEventInput } from '../engine/calendarEvents';

/* --- La forma di uno strumento ---------------------------------------------- */

export interface ToolDef {
  name: string;
  description: string;
  schema: Record<string, unknown>;
}

export interface ToolUse {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResult {
  id: string;
  /** Quello che il modello legge. Sempre testo: è la lingua che capisce. */
  content: string;
  isError?: boolean;
}

/**
 * Tutto quello che uno strumento può leggere o toccare.
 *
 * Passa come oggetto invece di leggere lo store da dentro perché così gli
 * strumenti si possono provare senza montare l'app — ed è l'unico modo di
 * verificarli quando le chiavi non ci sono ancora.
 */
export interface ToolContext {
  day: number;
  health: HealthState;
  protocol: Protocol;
  days: Record<number, DailySync>;
  memories: readonly Memory[];
  pages: readonly Page[];
  monName: string | null;
  /** Scrive una pagina nuova. Torna il nome nell'indirizzo, o l'errore. */
  writePage: (input: NewPage) => { ok: boolean; slug?: string; error?: string };
  /** Cambia una sezione di una pagina esistente. */
  updatePage: (slug: string, heading: string, body: string) => { ok: boolean; error?: string };
  /** Mette un promemoria. */
  remember: (text: string, inDays: number, everyDays: number | null) => { ok: boolean; error?: string };
  /** Com'è l'aspetto adesso, a parole. */
  skinNow: () => string;
  /** Cambia una manopola d'aspetto, o spiega perché no. §10 — catalogo chiuso. */
  changeSkin: (what: string, value: string) => { ok: boolean; error?: string };
  /** Rimette l'aspetto di fabbrica — colori E disposizione. */
  resetSkin: () => void;
  /** Cosa è nascosto o spostato adesso, a parole. */
  layoutNow: () => string;
  /** Nasconde o rimostra un pezzo dichiarato. §13 — catalogo chiuso. */
  showPiece: (id: string, visible: boolean) => { ok: boolean; error?: string };
  /** Sposta un pezzo dentro la sua colonna. */
  movePiece: (id: string, at: number) => { ok: boolean; error?: string };
  readMe: (section: 'today' | 'diet' | 'sport' | 'progress' | 'all') => string;
  logMeal: (input: { slot: 'colazione' | 'spuntino' | 'pranzo' | 'merenda' | 'cena' | 'extra'; description: string; kcal: number; protein: number; carbs: number; fat: number }) => void;
  updateMeal: (slot: 'colazione' | 'spuntino' | 'pranzo' | 'merenda' | 'cena' | 'extra', patch: Partial<{ slot: 'colazione' | 'spuntino' | 'pranzo' | 'merenda' | 'cena' | 'extra'; description: string; kcal: number; protein: number; carbs: number; fat: number }>) => boolean;
  logWorkout: (input: { title: string; details: string; minutes: number; burnedKcal?: number; energySource?: 'measured' | 'estimated' }) => void;
  updateWorkout: (patch: Partial<{ title: string; details: string; minutes: number; burnedKcal: number; energySource: 'measured' | 'estimated' }>) => boolean;
  /** Deterministic energy calculation over the existing health journal. */
  readEnergy?: (profile?: EnergyProfile) => string;
  logWeight: (kg: number) => void;
  updateWeight: (kg: number) => boolean;
  saveDiet: (title: string, text: string) => void;
  saveWorkoutPlan: (title: string, text: string) => void;
  configureTargets: (targets: Partial<{ kcal: number; protein: number; carbs: number; fat: number }>) => void;
  configureHealth: (focus: 'today' | 'diet' | 'sport' | 'progress', goal: string) => void;
  manageMe: (input: { action: 'create' | 'update' | 'delete' | 'move'; id?: string; section?: 'today' | 'diet' | 'sport'; type?: 'text' | 'list' | 'calendar' | 'metric'; title?: string; content?: string; items?: string[]; position?: number }) => { ok: boolean; id?: string; error?: string };
}

/* ============================================================================
   IL CATALOGO

   I nomi sono in italiano di proposito. Il briefing della voce è in italiano,
   la conversazione è in italiano: un `write_page` in mezzo è una crepa da cui
   il modello scivola nel registro sbagliato, e si sente nella risposta.
   ========================================================================= */

export const TOOLS: ToolDef[] = [
  {
    name: 'programma_promemoria',
    description: 'Promemoria reali server-side, una sola volta. Azioni list/create/update/cancel. Solo su richiesta esplicita dell’utente; prima di modificare/annullare leggi list per id/versione. Create/update richiedono data ISO con offset/Z e fuso IANA esplicito; chiedi chiarimento se manca una data certa. Non inventare orari. Controllo circa ogni5min, push solo se abilitata; mai promettere consegna. Cancel disattiva il promemoria ma conserva l’evento calendario.',
    schema: { type: 'object', properties: { azione: { type: 'string', enum: ['list', 'create', 'update', 'cancel'] }, id: { type: 'string' }, versione: { type: 'string' }, titolo: { type: 'string', maxLength: 160 }, quando: { type: 'string', description: 'Data ISO8601 completa con Z/offset esplicito.' }, fuso: { type: 'string', description: 'Fuso IANA, es. Europe/Rome.' } }, required: ['azione'] },
  },
  {
    name: 'calcola_energia_giornaliera',
    description: 'Calcolo deterministico dai registri ME di oggi: calorie alimentari, allenamenti, recorded net (NON deficit). BMR/TDEE solo con età adulta, altezza, peso, sesso per formula e fattore attività extra-allenamento realmente forniti. Non inventare input mancanti, non trattare stime come misure.',
    schema: { type: 'object', properties: {
      ageYears: { type: 'number' }, heightCm: { type: 'number' }, weightKg: { type: 'number' },
      formulaSex: { type: 'string', enum: ['male', 'female'] }, nonWorkoutActivityFactor: { type: 'number' },
    } },
  },
  {
    name: 'leggi_i_miei_dati',
    description:
      'Guarda i dati veri di Vincenzo invece di tirare a indovinare. Usalo ogni volta che una risposta dipende da come sta andando davvero: come ha dormito, se si è allenato, cosa ha dichiarato di mangiare, cosa vi siete detti. Meglio guardare che supporre.',
    schema: {
      type: 'object',
      properties: {
        cosa: {
          type: 'string',
          enum: ['salute', 'protocollo', 'giornate', 'ricordi'],
          description:
            'salute = le sei statistiche e i loro andamenti; protocollo = la dieta e gli allenamenti dichiarati; giornate = cosa ha registrato negli ultimi giorni; ricordi = cosa vi siete detti.',
        },
        giorni: {
          type: 'integer',
          description: 'Quanti giorni indietro guardare. Da 1 a 60. Vale per giornate e ricordi.',
        },
      },
      required: ['cosa'],
    },
  },
  {
    name: 'leggi_me',
    description: 'Legge i dati reali mostrati nella schermata ME: pasti, allenamenti svolti, piano di allenamento, peso, dieta, obiettivi nutrizionali e obiettivo del periodo. Usalo prima di correggere o modificare dati esistenti.',
    schema: { type: 'object', properties: {
      sezione: { type: 'string', enum: ['today', 'diet', 'sport', 'progress', 'all'] },
    }, required: ['sezione'] },
  },
  {
    name: 'registra_pasto',
    description: 'Registra in ME un pasto già confermato dall’utente. I cinque momenti fissi sono colazione, spuntino, pranzo, merenda e cena; usa extra per pasti ulteriori.',
    schema: { type: 'object', properties: {
      pasto: { type: 'string', enum: ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena', 'extra'] },
      descrizione: { type: 'string' }, kcal: { type: 'number' }, proteine: { type: 'number' }, carboidrati: { type: 'number' }, grassi: { type: 'number' },
    }, required: ['pasto', 'descrizione', 'kcal', 'proteine', 'carboidrati', 'grassi'] },
  },
  {
    name: 'correggi_ultimo_pasto',
    description: 'Corregge l’ultima registrazione del momento indicato in ME. Leggi prima ME e cambia soltanto i campi richiesti dall’utente.',
    schema: { type: 'object', properties: {
      pasto: { type: 'string', enum: ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena', 'extra'] },
      nuovo_pasto: { type: 'string', enum: ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena', 'extra'] },
      descrizione: { type: 'string' }, kcal: { type: 'number' }, proteine: { type: 'number' }, carboidrati: { type: 'number' }, grassi: { type: 'number' },
    }, required: ['pasto'] },
  },
  {
    name: 'registra_allenamento',
    description: 'Registra nella sezione ME un allenamento già confermato dall’utente. kcal_bruciate è opzionale: solo se noto o stimato esplicitamente; fonte_energia measured solo per misurazione dichiarata, estimated per stima. Non inventare zero per dato mancante.',
    schema: { type: 'object', properties: { titolo: { type: 'string' }, dettagli: { type: 'string' }, minuti: { type: 'number' }, kcal_bruciate: { type: 'number' }, fonte_energia: { type: 'string', enum: ['measured', 'estimated'] } }, required: ['titolo', 'dettagli', 'minuti'] },
  },
  {
    name: 'correggi_ultimo_allenamento',
    description: 'Corregge l’ultimo allenamento registrato in ME. Leggi prima ME e cambia soltanto i campi richiesti.',
    schema: { type: 'object', properties: { titolo: { type: 'string' }, dettagli: { type: 'string' }, minuti: { type: 'number' }, kcal_bruciate: { type: 'number' }, fonte_energia: { type: 'string', enum: ['measured', 'estimated'] } } },
  },
  {
    name: 'registra_peso',
    description: 'Registra nella sezione ME una nuova misurazione del peso.',
    schema: { type: 'object', properties: { kg: { type: 'number' } }, required: ['kg'] },
  },
  {
    name: 'correggi_ultimo_peso',
    description: 'Corregge l’ultima misurazione del peso già presente in ME.',
    schema: { type: 'object', properties: { kg: { type: 'number' } }, required: ['kg'] },
  },
  {
    name: 'imposta_dieta',
    description: 'Salva nella sezione DIETA un piano alimentare fornito dall’utente, anche estratto da un file allegato. Conserva indicazioni, pasti e quantità senza inventare dati mancanti.',
    schema: { type: 'object', properties: { titolo: { type: 'string' }, testo: { type: 'string' } }, required: ['titolo', 'testo'] },
  },
  {
    name: 'imposta_piano_allenamento',
    description: 'Crea o sostituisce il piano di allenamento mostrato in ME → SPORT. Organizza giorni, esercizi, serie, ripetizioni, recuperi e note usando soltanto le informazioni concordate con l’utente.',
    schema: { type: 'object', properties: { titolo: { type: 'string' }, testo: { type: 'string' } }, required: ['titolo', 'testo'] },
  },
  {
    name: 'imposta_obiettivi_nutrizionali',
    description: 'Modifica i target mostrati in ME per calorie e macronutrienti. Cambia solo i valori esplicitamente richiesti; non inventare quelli mancanti.',
    schema: { type: 'object', properties: {
      kcal: { type: 'number' }, proteine: { type: 'number' }, carboidrati: { type: 'number' }, grassi: { type: 'number' },
    } },
  },
  {
    name: 'gestisci_me',
    description: 'Controlla ME con blocchi sicuri: crea, aggiorna, elimina o riordina calendari, liste, note e metriche in OGGI, DIETA o SPORT. Per i calendari usa un elemento per appuntamento nel formato "Lunedì 08:00-09:00 · Titolo · Dettagli": così sarà visibile e cliccabile nel calendario. Prima di update/delete/move usa leggi_me per trovare l’id reale.',
    schema: { type: 'object', properties: { azione: { type: 'string', enum: ['create', 'update', 'delete', 'move'] }, id: { type: 'string' }, sezione: { type: 'string', enum: ['today', 'diet', 'sport'] }, tipo: { type: 'string', enum: ['text', 'list', 'calendar', 'metric'] }, titolo: { type: 'string' }, contenuto: { type: 'string' }, elementi: { type: 'array', items: { type: 'string' } }, posizione: { type: 'integer' } }, required: ['azione'] },
  },
  {
    name: 'crea_file_testo',
    description: 'Prepara un vero documento scaricabile .txt/.md usando le Pagine esistenti o il progetto selezionato. Il risultato contiene il link reale con pulsante download: NON affermare che il download è già avvenuto. Richiede una richiesta esplicita di documento/file.',
    schema: { type: 'object', properties: { titolo: { type: 'string', maxLength: 60 }, testo: { type: 'string', maxLength: 40000 } }, required: ['titolo', 'testo'] },
  },
  {
    name: 'leggi_progetto',
    description: 'Legge istruzioni, contesto e indice documenti SOLO del progetto selezionato dall’utente per questa chat. Non accede a progetti diversi o memoria personale. Se nessun progetto è selezionato restituisce non disponibile.',
    schema: { type: 'object', properties: {} },
  },
  {
    name: 'leggi_sorgente_progetto',
    description: 'Legge/cerca testo nel contesto importato del progetto selezionato o in un suo documento salvato (nome). Restituisce path tecnico e righe. NON è accesso filesystem, repository GitHub o ricerca web: il codice va prima importato nel contesto del progetto. Ricerca letterale, massimo 80 righe.',
    schema: { type: 'object', properties: { nome: { type: 'string', description: 'Slug artifact, ometti per contesto progetto.' }, cerca: { type: 'string', maxLength: 200 }, riga: { type: 'integer', minimum: 1 }, righe: { type: 'integer', minimum: 1, maximum: 80 } } },
  },
  {
    name: 'scrivi_artifact_progetto',
    description: 'Crea o aggiorna un documento Markdown privato nel progetto selezionato. Per aggiornare leggi prima il documento e fornisci nome e revisione_progetto letta. Non pubblica su internet, non deploya VINZ.MON, non modifica altre fonti. Restituisce URL stabile solo dopo conferma server e verifica.',
    schema: { type: 'object', properties: { titolo: { type: 'string', maxLength: 60 }, markdown: { type: 'string', maxLength: 40000 }, nome: { type: 'string' }, revisione_progetto: { type: 'integer' } }, required: ['titolo', 'markdown'] },
  },
  {
    name: 'elenca_le_pagine',
    description:
      'Le pagine che hai già scritto per lui. Guardale prima di scriverne una nuova: se una c’è già, si aggiorna invece di farne una seconda quasi uguale.',
    schema: { type: 'object', properties: {} },
  },
  {
    name: 'leggi_una_pagina',
    description: 'Il contenuto di una pagina, per sapere cosa c’è già scritto prima di cambiarla.',
    schema: {
      type: 'object',
      properties: { nome: { type: 'string', description: 'Il nome breve della pagina.' } },
      required: ['nome'],
    },
  },
  {
    name: 'scrivi_una_pagina',
    description:
      'Crea una pagina che resta e che lui può ritrovare senza scorrere la chat: la dieta del periodo, il programma di palestra, l’itinerario di un viaggio. Scrivila in markdown — titoli, elenchi, tabelle, spunte. Falla quando serve un documento, non per rispondere a una domanda: una risposta si dice parlando.',
    schema: {
      type: 'object',
      properties: {
        titolo: { type: 'string', description: 'Breve, riconoscibile. Massimo 60 caratteri.' },
        markdown: { type: 'string', description: 'Il contenuto della pagina, in markdown.' },
        appuntala: {
          type: 'boolean',
          description: 'Vero se deve stare in cima all’elenco perché riguarda il periodo di adesso.',
        },
      },
      required: ['titolo', 'markdown'],
    },
  },
  {
    name: 'aggiorna_una_pagina',
    description:
      'Cambia UNA sezione di una pagina, lasciando intatto tutto il resto. Se la sezione non esiste viene aggiunta in fondo. Usa questo invece di riscrivere tutto: riscrivendo si perde quello che c’era.',
    schema: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Il nome breve della pagina.' },
        sezione: { type: 'string', description: 'Il titolo della sezione da sostituire.' },
        testo: { type: 'string', description: 'Il nuovo contenuto della sezione, in markdown.' },
      },
      required: ['nome', 'sezione', 'testo'],
    },
  },
  /* ════════════════════════════════════════════════════════════════════════
     🔷 «Permetti all'AI di poter modificare la UI — solo la UI, l'estetica.»

     ⚠️ NON PRENDE CSS, E NON È PIGRIZIA. Un campo libero che finisce in un
     foglio di stile può spegnere l'app — testo bianco su bianco, la barra
     nascosta — e l'unica strada per tornare indietro passa dall'app che nel
     frattempo non si vede. Qui il modello sceglie DENTRO un catalogo chiuso
     (`engine/skin.ts`), come sceglie dentro le tassonomie di generazione.

     🔒 Restano fuori i colori dei segnali e l'accento del personaggio: i primi
     perché §17 li accoppia a una parola, e un rosso che diventa verde fa
     mentire la parola; il secondo perché è chi è lui, non una preferenza.
     ════════════════════════════════════════════════════════════════════════ */
  {
    name: 'cambia_aspetto',
    description: [
      'Cambia UNA cosa dell’aspetto dell’app. Solo estetica: colori, spessori, spazi, carattere.',
      'Non puoi scrivere CSS e non puoi toccare niente che non sia in questo elenco.',
      '',
      'Cosa puoi cambiare:',
      ...MANOPOLE.map((m) => `- ${m.id} → ${m.cosa}`),
      '',
      'I colori si scrivono #rrggbb. Le misure in pixel. Le scelte con il loro nome.',
      'Per rimettere tutto com’era: usa "reset" come cosa.',
      'Cambia una manopola alla volta e digli cosa hai fatto, non incollargli i valori.',
    ].join('\n'),
    schema: {
      type: 'object',
      properties: {
        cosa: { type: 'string', description: 'Il nome della manopola, o "reset".' },
        valore: { type: 'string', description: 'Il valore nuovo. Vuoto se cosa è "reset".' },
      },
      required: ['cosa'],
    },
  },
  {
    name: 'guarda_aspetto',
    description:
      'Dice com’è l’aspetto adesso e cosa è già stato cambiato. Usalo prima di cambiare, per non rifare una cosa già fatta.',
    schema: { type: 'object', properties: {} },
  },
  /* ════════════════════════════════════════════════════════════════════════
     🔷 «Vorrei anche togliere pulsanti e spostare elementi, e immaginarmi le
        schermate in modo diverso.»

     ⚠️ NON È MANIPOLAZIONE DEL DOM. Il modello non descrive un elemento e non
     scrive un selettore: nomina un pezzo che esiste nel catalogo. Da lì il
     codice — non lui — scrive due sole forme di regola, «nascondi» e «metti in
     posizione N».

     🔒 Tre pezzi non si possono nascondere, ed è la ragione per cui questo
     strumento può esistere: la barra in fondo, il campo per scrivere e la
     scorciatoia DEV sono le tre strade per dirgli di rimettere le cose a
     posto. Un catalogo che permettesse di nascondere il campo di testo
     sarebbe un catalogo usabile una volta sola.
     ════════════════════════════════════════════════════════════════════════ */
  {
    name: 'cambia_schermata',
    description: [
      'Nasconde, rimostra o sposta un pezzo delle schermate. Solo disposizione: non crea niente di nuovo.',
      '',
      'I pezzi che ci sono:',
      ...PEZZI.map((p) => `- ${p.id} (${p.dove}) → ${p.cosa}${p.riordinabile ? '' : ' · solo nascondere'}`),
      '',
      'azione: "nascondi" | "mostra" | "sposta". Con "sposta" serve anche posizione (1 = in cima).',
      'La barra in fondo, il campo di testo e il pulsante DEV non si toccano: servono a disfare.',
      'Un pezzo alla volta. Poi digli cosa hai fatto con parole tue.',
    ].join('\n'),
    schema: {
      type: 'object',
      properties: {
        pezzo: { type: 'string', description: 'Il nome del pezzo.' },
        azione: { type: 'string', enum: ['nascondi', 'mostra', 'sposta'] },
        posizione: { type: 'number', description: 'Solo con "sposta". 1 = in cima.' },
      },
      required: ['pezzo', 'azione'],
    },
  },
  {
    name: 'guarda_schermata',
    description: 'Dice quali pezzi sono nascosti o spostati adesso. Guarda prima di cambiare.',
    schema: { type: 'object', properties: {} },
  },
  {
    name: 'ricorda_di',
    description:
      'LEGACY: promemoria interno basato sui giorni di gioco, non su orari reali e senza timer server. Per una data/orario reale usa programma_promemoria. Non promettere notifiche puntuali con questo strumento.',
    schema: {
      type: 'object',
      properties: {
        cosa: { type: 'string', description: 'Cosa gli dirai quel giorno. Una frase.' },
        fra_giorni: { type: 'integer', description: 'Fra quanti giorni. 0 = oggi.' },
        ogni_giorni: {
          type: 'integer',
          description: 'Se si ripete, ogni quanti giorni. Omettilo se è una volta sola.',
        },
      },
      required: ['cosa', 'fra_giorni'],
    },
  },
];

/** I nomi, per i controlli. */
export const TOOL_NAMES = TOOLS.map((t) => t.name);

/* ============================================================================
   L'ESECUZIONE
   ========================================================================= */

const clampDays = (n: unknown, fallback: number): number => {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.max(1, Math.min(60, v));
};

function healthReport(health: HealthState): string {
  const lines = STAT_KEYS.map((k) => {
    const entry = health.stats[k];
    if (!isKnown(entry.value)) return `${k} (${STAT_LABELS[k]}): non lo so ancora`;
    const t = trend(health, k, 7);
    const arrow = isKnown(t) ? (t > 1 ? `in salita (+${t})` : t < -1 ? `in discesa (${t})` : 'stabile') : 'senza andamento';
    return `${k} (${STAT_LABELS[k]}): ${entry.value} su 100, ${arrow}, affidabilità ${Math.round(entry.confidence * 100)}%`;
  });

  const cond = isKnown(health.condition) ? `${health.condition} su 100` : 'sconosciuta';
  const disc = isKnown(health.disc) ? `${health.disc} su 100` : 'sconosciuta';

  return [
    `CONDIZIONE DI OGGI: ${cond}`,
    `COSTANZA NEL REGISTRARE: ${disc}`,
    '',
    ...lines,
    '',
    'I valori vanno da 0 a 100. Un dato che manca è «non lo so», mai uno zero.',
  ].join('\n');
}

function daysReport(days: Record<number, DailySync>, today: number, back: number): string {
  const out: string[] = [];

  for (let d = today; d > today - back && d > 0; d--) {
    const day = days[d];
    if (!day) continue;
    const parts = DAILY_SIGNALS.map((key) => {
      const sig = day.signals?.[key];
      if (!sig || sig.status === 'UNKNOWN') return null;
      return `${key}: ${sig.status === 'KNOWN' ? (sig.note ?? 'sì') : sig.status}`;
    }).filter(Boolean);

    if (parts.length > 0) out.push(`Giorno ${d} (${day.status}) — ${parts.join(' · ')}`);
  }

  if (out.length === 0) return `Negli ultimi ${back} giorni non ha registrato niente.`;
  return out.join('\n');
}

function memoriesReport(memories: readonly Memory[], today: number, back: number): string {
  const recent = memories.filter((m) => today - m.day <= back);
  if (recent.length === 0) return `Negli ultimi ${back} giorni non c’è niente di segnato.`;

  return recent
    .slice(-30)
    .map((m) => `Giorno ${m.day} (${m.kind}): ${m.title}${m.text ? ` — ${m.text}` : ''}`)
    .join('\n');
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Esegue uno strumento e torna quello che il modello leggerà.
 *
 * ⚠️ Non lancia MAI. Un'eccezione qui interromperebbe il giro e lascerebbe la
 * conversazione senza risposta; un errore raccontato invece il modello lo
 * legge e si corregge da solo — che è la differenza fra «l'app si è rotta» e
 * «ha detto che quella pagina non c'era».
 */
function workoutEnergyInput(args: Record<string, unknown>): { burnedKcal?: number; energySource?: 'measured' | 'estimated' } | string {
  if (args.kcal_bruciate === undefined) return args.fonte_energia === undefined ? {} : 'La fonte energia richiede anche il valore kcal_bruciate.';
  if (typeof args.kcal_bruciate !== 'number' || !Number.isFinite(args.kcal_bruciate) || args.kcal_bruciate < 0 || args.kcal_bruciate > 100000) return 'Calorie bruciate non valide.';
  if (args.fonte_energia !== 'measured' && args.fonte_energia !== 'estimated') return 'Specifica fonte_energia: measured per misura dichiarata, estimated per stima.';
  return { burnedKcal: args.kcal_bruciate, energySource: args.fonte_energia };
}

export function runTool(use: ToolUse, ctx: ToolContext): ToolResult {
  const args = (use.input ?? {}) as Record<string, unknown>;
  const fail = (msg: string): ToolResult => ({ id: use.id, content: msg, isError: true });
  const ok = (msg: string): ToolResult => ({ id: use.id, content: msg });

  try {
    switch (use.name) {
      case 'calcola_energia_giornaliera': {
        if (!ctx.readEnergy) return fail('Calcolo energia non disponibile in questo runtime. Non stimare input mancanti.');
        const profile: EnergyProfile = {};
        for (const key of ['ageYears', 'heightCm', 'weightKg', 'nonWorkoutActivityFactor'] as const) {
          if (args[key] === undefined) continue;
          if (typeof args[key] !== 'number' || !Number.isFinite(args[key])) return fail('Input energetico non valido.');
          profile[key] = args[key];
        }
        if (args.formulaSex !== undefined) {
          if (args.formulaSex !== 'male' && args.formulaSex !== 'female') return fail('Sesso per formula non valido.');
          profile.formulaSex = args.formulaSex;
        }
        return ok(ctx.readEnergy(profile));
      }
      case 'leggi_me': {
        const section = str(args.sezione) as 'today' | 'diet' | 'sport' | 'progress' | 'all';
        if (!['today', 'diet', 'sport', 'progress', 'all'].includes(section)) return fail('Sezione ME non valida.');
        return ok(ctx.readMe(section));
      }
      case 'registra_pasto': {
        const slot = str(args.pasto) as 'colazione' | 'spuntino' | 'pranzo' | 'merenda' | 'cena' | 'extra';
        if (!['colazione', 'spuntino', 'pranzo', 'merenda', 'cena', 'extra'].includes(slot)) return fail('Il tipo di pasto non è valido.');
        const numbers = [args.kcal, args.proteine, args.carboidrati, args.grassi].map(Number);
        if (numbers.some((value) => !Number.isFinite(value) || value < 0)) return fail('I valori nutrizionali non sono validi.');
        ctx.logMeal({ slot, description: str(args.descrizione), kcal: numbers[0]!, protein: numbers[1]!, carbs: numbers[2]!, fat: numbers[3]! });
        return ok('Pasto registrato in ME.');
      }
      case 'correggi_ultimo_pasto': {
        const slots = ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena', 'extra'] as const;
        const slot = str(args.pasto) as typeof slots[number];
        if (!slots.includes(slot)) return fail('Il tipo di pasto da correggere non è valido.');
        const patch: Partial<{ slot: typeof slots[number]; description: string; kcal: number; protein: number; carbs: number; fat: number }> = {};
        const nextSlot = str(args.nuovo_pasto) as typeof slots[number];
        if (nextSlot) {
          if (!slots.includes(nextSlot)) return fail('Il nuovo tipo di pasto non è valido.');
          patch.slot = nextSlot;
        }
        if (typeof args.descrizione === 'string' && args.descrizione.trim()) patch.description = args.descrizione.trim();
        for (const [source, target] of [['kcal', 'kcal'], ['proteine', 'protein'], ['carboidrati', 'carbs'], ['grassi', 'fat']] as const) {
          if (args[source] === undefined) continue;
          const value = Number(args[source]);
          if (!Number.isFinite(value) || value < 0) return fail('Uno dei valori nutrizionali non è valido.');
          patch[target] = value;
        }
        if (!Object.keys(patch).length) return fail('Non hai indicato cosa correggere.');
        if (!ctx.updateMeal(slot, patch)) return fail(`Non trovo un pasto “${slot}” da correggere.`);
        return ok('Pasto corretto in ME.');
      }
      case 'registra_allenamento': {
        const minutes = Number(args.minuti);
        if (!Number.isFinite(minutes) || minutes < 0) return fail('La durata non è valida.');
        const energy = workoutEnergyInput(args);
        if (typeof energy === 'string') return fail(energy);
        ctx.logWorkout({ title: str(args.titolo), details: str(args.dettagli), minutes, ...energy });
        return ok('Allenamento registrato in ME.');
      }
      case 'correggi_ultimo_allenamento': {
        const patch: Partial<{ title: string; details: string; minutes: number; burnedKcal: number; energySource: 'measured' | 'estimated' }> = {};
        const energy = workoutEnergyInput(args);
        if (typeof energy === 'string') return fail(energy);
        Object.assign(patch, energy);
        if (typeof args.titolo === 'string' && args.titolo.trim()) patch.title = args.titolo.trim();
        if (typeof args.dettagli === 'string' && args.dettagli.trim()) patch.details = args.dettagli.trim();
        if (args.minuti !== undefined) {
          const minutes = Number(args.minuti);
          if (!Number.isFinite(minutes) || minutes < 0) return fail('La durata non è valida.');
          patch.minutes = minutes;
        }
        if (!Object.keys(patch).length) return fail('Non hai indicato cosa correggere.');
        if (!ctx.updateWorkout(patch)) return fail('Non trovo un allenamento da correggere.');
        return ok('Allenamento corretto in ME.');
      }
      case 'registra_peso': {
        const kg = Number(args.kg);
        if (!Number.isFinite(kg) || kg < 20 || kg > 400) return fail('Il peso non sembra valido.');
        ctx.logWeight(kg);
        return ok('Peso aggiornato in ME.');
      }
      case 'correggi_ultimo_peso': {
        const kg = Number(args.kg);
        if (!Number.isFinite(kg) || kg < 20 || kg > 400) return fail('Il peso non sembra valido.');
        if (!ctx.updateWeight(kg)) return fail('Non trovo un peso da correggere.');
        return ok('Ultimo peso corretto in ME.');
      }
      case 'imposta_dieta': {
        const title = str(args.titolo); const text = str(args.testo);
        if (!title || !text) return fail('Titolo o contenuto della dieta mancanti.');
        ctx.saveDiet(title, text);
        return ok('Dieta salvata nella sezione ME → DIETA.');
      }
      case 'imposta_piano_allenamento': {
        const title = str(args.titolo); const text = str(args.testo);
        if (!title || !text) return fail('Titolo o contenuto del piano di allenamento mancanti.');
        ctx.saveWorkoutPlan(title, text);
        return ok('Piano di allenamento salvato nella sezione ME → SPORT.');
      }
      case 'imposta_obiettivi_nutrizionali': {
        const targets: Partial<{ kcal: number; protein: number; carbs: number; fat: number }> = {};
        for (const [source, target] of [['kcal', 'kcal'], ['proteine', 'protein'], ['carboidrati', 'carbs'], ['grassi', 'fat']] as const) {
          if (args[source] === undefined) continue;
          const value = Number(args[source]);
          if (!Number.isFinite(value) || value <= 0) return fail('Uno degli obiettivi nutrizionali non è valido.');
          targets[target] = value;
        }
        if (!Object.keys(targets).length) return fail('Non hai indicato alcun obiettivo nutrizionale.');
        ctx.configureTargets(targets);
        return ok('Obiettivi nutrizionali aggiornati in ME.');
      }
      case 'gestisci_me': {
        const result = ctx.manageMe({ action: str(args.azione) as 'create' | 'update' | 'delete' | 'move', id: str(args.id) || undefined, section: (str(args.sezione) || undefined) as 'today' | 'diet' | 'sport' | undefined, type: (str(args.tipo) || undefined) as 'text' | 'list' | 'calendar' | 'metric' | undefined, title: args.titolo === undefined ? undefined : str(args.titolo), content: args.contenuto === undefined ? undefined : str(args.contenuto), items: Array.isArray(args.elementi) ? args.elementi.map(str) : undefined, position: args.posizione === undefined ? undefined : Number(args.posizione) });
        if (!result.ok) return fail(result.error ?? 'Modifica ME non riuscita.');
        return ok(`Schermata ME aggiornata${result.id ? ` (blocco ${result.id})` : ''}.`);
      }
      case 'leggi_i_miei_dati': {
        const what = str(args.cosa);
        const back = clampDays(args.giorni, 7);

        if (what === 'salute') return ok(healthReport(ctx.health));
        if (what === 'protocollo') {
          const diet = describeDiet(ctx.protocol.diet);
          const training = describeTraining(ctx.protocol.training);
          if (!diet && !training) return ok('Non ha ancora dichiarato né dieta né allenamenti.');
          return ok(
            [diet ? `DIETA: ${diet}` : 'DIETA: non dichiarata', training ? `ALLENAMENTI: ${training}` : 'ALLENAMENTI: non dichiarati'].join('\n'),
          );
        }
        if (what === 'giornate') return ok(daysReport(ctx.days, ctx.day, back));
        if (what === 'ricordi') return ok(memoriesReport(ctx.memories, ctx.day, back));
        return fail('Non so cosa guardare: usa salute, protocollo, giornate o ricordi.');
      }

      case 'elenca_le_pagine':
        return ok(pagesDigest(ctx.pages));

      case 'leggi_una_pagina': {
        const name = str(args.nome);
        const page = ctx.pages.find((p) => p.slug === name || p.title.toLowerCase() === name.toLowerCase());
        if (!page) return fail(`Non c’è nessuna pagina che si chiama «${name}».\n${pagesDigest(ctx.pages)}`);
        return ok(`# ${page.title}\n\n${page.markdown}`);
      }

      case 'crea_file_testo':
      case 'scrivi_una_pagina': {
        const markdown = use.name === 'crea_file_testo' ? (typeof args.testo === 'string' ? args.testo : '') : typeof args.markdown === 'string' ? args.markdown : '';
        if (use.name === 'crea_file_testo' && (!markdown.trim() || markdown.length > 40000 || /data:(?:image|application)\/[^;]+;base64,/i.test(markdown))) return fail('File vuoto, troppo lungo o contenente dati binari. Nessun documento creato.');
        const res = ctx.writePage({
          title: str(args.titolo),
          markdown,
          pinned: args.appuntala === true,
        });
        if (!res.ok || !res.slug) return fail(res.error ?? 'La pagina non è stata scritta.');
        if (use.name === 'crea_file_testo') return ok(`Documento preparato nelle Pagine. Link reale: #/p/${res.slug}. La pagina offre SCARICA .TXT e SCARICA .MD; l'utente deve premere il pulsante. Non è stato avviato un download automatico o un invio esterno.`);
        return ok(
          `Fatto. La pagina esiste e lui la trova in ME, oppure all’indirizzo #/p/${res.slug}. Diglielo con parole tue: non incollargli il contenuto, ce l’ha già.`,
        );
      }

      case 'aggiorna_una_pagina': {
        const res = ctx.updatePage(str(args.nome), str(args.sezione), typeof args.testo === 'string' ? args.testo : '');
        if (!res.ok) return fail(res.error ?? 'La pagina non è stata aggiornata.');
        return ok('Fatto. La sezione è cambiata, il resto della pagina è rimasto com’era.');
      }

      case 'guarda_aspetto':
        return ok(ctx.skinNow());

      case 'cambia_aspetto': {
        const cosa = str(args.cosa).toLowerCase();
        if (cosa.length === 0) return fail('Manca cosa cambiare.');

        if (cosa === 'reset') {
          ctx.resetSkin();
          return ok('Fatto: aspetto rimesso com’era di fabbrica.');
        }

        const valore = str(args.valore);
        if (valore.length === 0) return fail(`Manca il valore nuovo per «${cosa}».`);

        const res = ctx.changeSkin(cosa, valore);
        /* 🔒 L'errore torna al MODELLO, non all'utente: è scritto per farlo
           correggere da solo — «fuori scala, sta fra 0 e 24» — invece di
           finire in faccia a chi sta solo chiacchierando. */
        if (!res.ok) return fail(res.error ?? 'Non si può cambiare così.');
        return ok(`Fatto: «${cosa}» adesso è ${valore}. Si vede subito. Se non gli piace, dillo e lo rimetto.`);
      }

      case 'guarda_schermata':
        return ok(ctx.layoutNow());

      case 'cambia_schermata': {
        const pezzo = str(args.pezzo);
        const azione = str(args.azione).toLowerCase();
        if (pezzo.length === 0) return fail('Manca quale pezzo.');

        if (azione === 'nascondi' || azione === 'mostra') {
          const res = ctx.showPiece(pezzo, azione === 'mostra');
          if (!res.ok) return fail(res.error ?? 'Non si può.');
          return ok(
            azione === 'nascondi'
              ? `Fatto: «${pezzo}» non si vede più. Per rimetterlo basta che me lo dica.`
              : `Fatto: «${pezzo}» è tornato.`,
          );
        }

        if (azione === 'sposta') {
          const at = typeof args.posizione === 'number' ? args.posizione : NaN;
          const res = ctx.movePiece(pezzo, at);
          if (!res.ok) return fail(res.error ?? 'Non si può.');
          return ok(`Fatto: «${pezzo}» adesso è in posizione ${Math.round(at)}.`);
        }

        return fail('L’azione è "nascondi", "mostra" o "sposta".');
      }

      case 'ricorda_di': {
        const text = str(args.cosa);
        const inDays = typeof args.fra_giorni === 'number' ? Math.max(0, Math.round(args.fra_giorni)) : -1;
        const every =
          typeof args.ogni_giorni === 'number' && args.ogni_giorni > 0
            ? Math.round(args.ogni_giorni)
            : null;

        if (text.length === 0) return fail('Manca cosa devo ricordargli.');
        if (inDays < 0) return fail('Manca fra quanti giorni.');

        const res = ctx.remember(text, inDays, every);
        if (!res.ok) return fail(res.error ?? 'Il promemoria non è stato messo.');
        return ok(
          every
            ? `Fatto: glielo dirò fra ${inDays} giorni e poi ogni ${every}.`
            : `Fatto: glielo dirò il giorno ${ctx.day + inDays}.`,
        );
      }

      default:
        return fail(`Non ho uno strumento che si chiama «${use.name}».`);
    }
  } catch (err) {
    console.warn('[tools] strumento fallito:', use.name, err);
    return fail('Quello strumento non ha funzionato. Rispondi con quello che sai già.');
  }
}

/* ============================================================================
   I BLOCCHI DA RIMANDARE INDIETRO

   Il fornitore vuole sapere cosa aveva chiesto e cosa gli è stato risposto,
   nella sua grammatica. Sono due turni: quello che ha detto lui, e quello con
   i risultati.
   ========================================================================= */

export function assistantTurn(text: string, uses: readonly ToolUse[]): Record<string, unknown> {
  const content: Record<string, unknown>[] = [];
  /* ⚠️ Un blocco di testo VUOTO fa rifiutare la richiesta, e il caso capita
     sempre: quando il modello chiama uno strumento senza dire niente prima.
     Si mette solo se c'è qualcosa dentro. */
  if (text.trim().length > 0) content.push({ type: 'text', text });
  for (const u of uses) content.push({ type: 'tool_use', id: u.id, name: u.name, input: u.input });
  return { role: 'assistant', content };
}

const TOOL_RESULT_BUDGET_BYTES = 10000;
const encoder = new TextEncoder();
const bytes = (text: string) => encoder.encode(text).byteLength;
const resultBlock = (r: ToolResult) => ({
    type: 'tool_result',
    tool_use_id: r.id,
    content: r.content,
    ...(r.isError ? { is_error: true } : {}),
});
const contentCost = (text: string) => bytes(JSON.stringify(text)) - 2;
function safePrefix(text: string, length: number): string {
  // Never introduce a dangling UTF-16 surrogate while shortening Unicode output.
  const end = text.charCodeAt(length - 1);
  const next = text.charCodeAt(length);
  return text.slice(0, end >= 0xd800 && end <= 0xdbff && next >= 0xdc00 && next <= 0xdfff ? length - 1 : length);
}
function fitContent(text: string, budget: number): string {
  if (contentCost(text) <= budget) return text;
  const marker = '\n[TRUNCATED: aggregate tool-result budget]';
  const suffix = contentCost(marker) <= budget ? marker : '[TRUNCATED]';
  if (contentCost(suffix) > budget) throw new RangeError('Tool result identifiers leave no room for a truthful truncation marker.');
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (contentCost(safePrefix(text, middle) + suffix) <= budget) low = middle;
    else high = middle - 1;
  }
  return safePrefix(text, low) + suffix;
}
/** One aggregate wire budget, including JSON escaping/IDs, not a per-tool cap. */
export function budgetToolResults(results: readonly ToolResult[], maxBytes = TOOL_RESULT_BUDGET_BYTES): ToolResult[] {
  const original = results.map(resultBlock);
  if (bytes(JSON.stringify(original)) <= maxBytes) return results.map((r) => ({ ...r }));
  const overhead = bytes(JSON.stringify(results.map((r) => resultBlock({ ...r, content: '' }))));
  let remaining = maxBytes - overhead;
  if (remaining < results.length * contentCost('[TRUNCATED]')) throw new RangeError('Tool-result identifiers exceed the aggregate budget.');
  return results.map((r, index) => {
    const allocation = Math.floor(remaining / (results.length - index));
    const content = fitContent(r.content, allocation);
    remaining -= contentCost(content);
    return { ...r, content };
  });
}
export function resultBlocks(results: readonly ToolResult[]): Record<string, unknown>[] {
  return budgetToolResults(results).map(resultBlock);
}

async function executeReminderTool(use: ToolUse, token: string | null): Promise<ToolResult> {
  const fail = (content: string): ToolResult => ({ id: use.id, content, isError: true });
  if (!token) return fail('Token mancante: promemoria non disponibile.');
  const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
  const action = str(args.azione);
  if (!['list', 'create', 'update', 'cancel'].includes(action)) return fail('Azione promemoria non valida.');
  type Row = { event: CalendarEvent; version: string };
  const headers = { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const read = async (): Promise<Row[]> => {
    const response = await fetch('/api/calendar', { headers });
    if (!response.ok) throw new Error('CALENDAR_READ_FAILED');
    return ((await response.json()) as { events: Row[] }).events;
  };
  const rows = await read();
  if (action === 'list') return { id: use.id, content: JSON.stringify({ source: 'canonical-calendar', reminders: rows.filter((row) => row.event.reminderAt).map(({event,version}) => ({ id: event.id, version, title: event.title, when: event.reminderAt, timezone: event.timezone, status: event.status, notification: event.reminderDelivery ?? 'not attempted' })) }) };
  const row = action !== 'create' ? rows.find(({event}) => event.id === str(args.id)) : null;
  if (action !== 'create' && (!row || row.version !== str(args.versione))) return fail('Id/versione promemoria mancante o obsoleta. Usa list prima di modificarlo. Nessuna scrittura.');
  let input: CalendarEventInput;
  let id: string;
  if (action === 'cancel') {
    input = { ...row!.event, reminderAt: null };
    id = row!.event.id;
  } else {
    const title = str(args.titolo); const when = str(args.quando); const timezone = str(args.fuso);
    if (!title || title.length > 160 || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(when) || !Number.isFinite(Date.parse(when)) || Date.parse(when) <= Date.now()) return fail('Servono titolo e data futura ISO completa di offset/Z, confermati dall’utente. Non scegliere un orario arbitrario.');
    try { if (!timezone) throw new Error(); new Intl.DateTimeFormat('it', { timeZone: timezone }); } catch { return fail('Serve un fuso orario IANA esplicito e valido.'); }
    const reminderAt = new Date(when).toISOString();
    input = row ? { ...row.event, title, reminderAt, timezone } : { title, start: reminderAt, reminderAt, timezone, category: 'task', notes: '', status: 'planned' };
    if (row && row.event.status !== 'planned') return fail('L’evento è annullato/completato: non viene riattivato implicitamente.');
    // Stable technical key makes an exact repeated request idempotent without another store.
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([title, reminderAt, timezone])));
    id = row?.event.id ?? `reminder_${Array.from(new Uint8Array(digest)).slice(0, 16).map((n) => n.toString(16).padStart(2, '0')).join('')}`;
    const existing = !row && rows.find(({event}) => event.id === id);
    if (existing) return { id: use.id, content: JSON.stringify({ status: 'already-exists', id, when: existing.event.reminderAt ?? null, eventStatus: existing.event.status, note: 'Nessun duplicato creato. Se disattivato, aggiorna esplicitamente usando id/versione.' }) };
  }
  const response = await fetch('/api/calendar', { method: row ? 'PUT' : 'POST', headers, body: JSON.stringify({ id, ...(row ? { version: row.version } : {}), event: input }) });
  if (!response.ok) return fail(response.status === 409 ? 'Conflitto: rileggi i promemoria. Nessun successo confermato.' : 'Salvataggio promemoria non confermato. Non promettere la notifica.');
  const verified = (await read()).find(({event}) => event.id === id);
  const consistent = verified && (action === 'cancel' ? !verified.event.reminderAt : verified.event.reminderAt === input.reminderAt && verified.event.title === input.title);
  if (!consistent) return fail('Salvataggio accettato ma rilettura non coerente: controlla il calendario prima di ripetere.');
  return { id: use.id, content: JSON.stringify({ status: action === 'cancel' ? 'reminder-disabled-event-preserved' : 'saved-and-read-back', id, when: verified.event.reminderAt ?? null, timezone: verified.event.timezone, notification: 'Server check approximately every 5 minutes. Push requires existing permission/subscription; user delivery is not confirmed.', url: '#reminders' }) };
}

/** Same catalog; only server-owned project operations need asynchronous execution. */
export async function executeRuntimeTool(
  use: ToolUse,
  localRun: (use: ToolUse) => ToolResult | Promise<ToolResult>,
  scope: { token: string | null; projectId?: string | null },
): Promise<ToolResult> {
  const fail = (content: string): ToolResult => ({ id: use.id, content, isError: true });
  const ok = (content: string): ToolResult => ({ id: use.id, content });
  try {
    if (use.name === 'programma_promemoria') return await executeReminderTool(use, scope.token);
    const isProjectTool = ['leggi_progetto', 'leggi_sorgente_progetto', 'scrivi_artifact_progetto'].includes(use.name);
    const projectFile = use.name === 'crea_file_testo' && !!scope.projectId;
    if (!isProjectTool && !projectFile) return await localRun(use);
    if (!scope.projectId) return fail('Nessun progetto selezionato per questa chat. Chiedi all’utente di selezionarlo da Projects. Nessun altro progetto è stato letto.');
    if (!scope.token) return fail('Archivio progetti non autorizzato: token mancante.');
    const { loadProject, mutateProject } = await import('../projects/client');
    const { artifactHref, buildProjectContext } = await import('../engine/projects');
    const project = await loadProject(scope.token, scope.projectId);
    const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
    if (use.name === 'leggi_progetto') return ok(JSON.stringify({ projectId: project.id, revision: project.revision, source: 'authenticated-project-store', context: buildProjectContext(project), artifacts: project.artifacts.map((p) => ({ slug: p.slug, title: p.title, revision: p.revision, url: artifactHref(project.id, p.slug) })) }));
    if (use.name === 'leggi_sorgente_progetto') {
      const slug = str(args.nome);
      const artifact = slug ? project.artifacts.find((p) => p.slug === slug) : null;
      if (slug && !artifact) return fail('Documento non trovato nel progetto selezionato.');
      const source = artifact?.markdown ?? project.context;
      const lines = source.split('\n');
      const query = str(args.cerca).slice(0, 200);
      const start = Math.max(1, Math.min(lines.length || 1, Math.floor(Number(args.riga) || 1)));
      const count = Math.max(1, Math.min(80, Math.floor(Number(args.righe) || 40)));
      const matching = lines.map((text, i) => ({ line: i + 1, text })).filter((line) => query ? line.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()) : line.line >= start);
      return ok(JSON.stringify({ projectId: project.id, projectRevision: project.revision, source: `project:${project.id}/${artifact ? `artifacts/${artifact.slug}` : 'context'}`, scope: 'imported project text only; not filesystem/GitHub/web access', totalLines: lines.length, matchCount: query ? matching.length : undefined, truncated: matching.length > count, lines: matching.slice(0, count) }));
    }
    const slug = str(args.nome);
    if (slug && args.revisione_progetto !== project.revision) return fail(`Revisione progetto richiesta o obsoleta. Leggi il documento attuale prima di aggiornare. Revisione corrente: ${project.revision}. Nessuna modifica applicata.`);
    const markdown = projectFile ? (typeof args.testo === 'string' ? args.testo : '') : typeof args.markdown === 'string' ? args.markdown : '';
    const saved = await mutateProject(scope.token, { action: 'save-artifact', projectId: project.id, revision: project.revision, ...(slug ? { slug } : {}), title: str(args.titolo), markdown });
    const artifact = slug ? saved.artifacts.find((p) => p.slug === slug) : saved.artifacts[saved.artifacts.length - 1];
    if (!artifact) return fail('Il server ha risposto ma non ha restituito il documento. Non dichiarare il salvataggio verificato.');
    const checked = await loadProject(scope.token, project.id);
    const persisted = checked.artifacts.find((p) => p.slug === artifact.slug);
    if (!persisted || persisted.markdown !== markdown || persisted.revision !== artifact.revision) return fail('Salvataggio accettato ma rilettura non coerente: non ripetere automaticamente la creazione, rileggi il progetto.');
    return ok(JSON.stringify({ status: 'saved-and-read-back', projectId: project.id, projectRevision: checked.revision, slug: artifact.slug, artifactRevision: artifact.revision, url: artifactHref(project.id, artifact.slug), access: 'private/authenticated', download: 'TXT and Markdown download buttons on the real artifact page; not downloaded automatically', published: false }));
  } catch {
    return fail('Strumento non completato o verifica non disponibile. Non affermare che il risultato esiste, è stato pubblicato o consegnato. Verifica lo stato prima di ripetere una scrittura.');
  }
}
