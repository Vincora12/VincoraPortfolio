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
import { loadLocation } from '../engine/locationSignal';
import { ICON_NAME_LIST } from '../system/iconNames';
import { loadDeviceSignals } from '../engine/deviceSignals';

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
  /** 🔷 «Se un file è già nella cartella, deve essere sempre consultabile.»
      Un PDF o una foto non possono viaggiare dentro `content` (testo): questo
      canale a parte porta il documento vero fino al giro corrente, dove
      `replyWithLocalTools` (brain/stream.ts) lo allega davvero al messaggio —
      esattamente come un allegato mandato in chat, non come un risultato di
      strumento. Solo `leggi_documento_lavoro` lo popola oggi. */
  attachment?: { mediaType: string; data: string; filename?: string };
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
    name: 'crea_automazione',
    description: 'Automazione ricorrente: VINZ fa una cosa da solo e manda il risultato in chat. Per \u00abogni mattina\u2026\u00bb, \u00abogni luned\u00ec\u2026\u00bb, \u00abogni due ore\u2026\u00bb. SOLA LETTURA: cerca e riferisce, non registra niente in ME. Per una cosa sola usa programma_promemoria. Non inventare orari: chiedi.',
    schema: { type: 'object', properties: {
      titolo: { type: 'string', maxLength: 60 },
      descrizione: { type: 'string', maxLength: 2000, description: 'Cosa deve fare.' },
      cadenza: { type: 'string', enum: ['ogni_giorno', 'giorni_settimana', 'ogni_intervallo'] },
      ora: { type: 'integer', minimum: 0, maximum: 23 },
      minuti: { type: 'integer', minimum: 0, maximum: 59 },
      giorni: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 7 }, description: '1=luned\u00ec..7=domenica' },
      ogni_minuti: { type: 'integer', minimum: 30, maximum: 1440, description: 'due ore = 120' },
      dalle_ore: { type: 'integer', minimum: 0, maximum: 23 },
      alle_ore: { type: 'integer', minimum: 0, maximum: 23 },
      fuso: { type: 'string', description: 'IANA, es. Europe/Rome' },
      icona: { type: 'string', enum: [...ICON_NAME_LIST], description: 'Quella che descrive meglio il contenuto.' },
    }, required: ['titolo', 'descrizione', 'cadenza', 'icona'] },
  },
  {
    name: 'cambia_icona_progetto',
    description: 'Cambia l’icona del progetto a cui appartiene questa conversazione (Generale incluso). Usalo solo su richiesta esplicita, es. "non mi piace questa icona, mettine un\'altra" o "metti una fiamma". Non chiede il nome del progetto: è quello di questa chat.',
    schema: { type: 'object', properties: {
      icona: { type: 'string', maxLength: 8, description: 'Una sola emoji, quella che rappresenta meglio il progetto secondo te — scelta libera, non da un elenco chiuso. Es. 🔥, 💼, 🚀.' },
    }, required: ['icona'] },
  },
  {
    name: 'disegna_sezione_me',
    description: 'Disegna o modifica una tab della sezione ME per il progetto di questa chat — MAI per Generale, che resta la schermata salute fissa. Libertà totale di HTML/CSS: non un elenco di widget, un vero disegno tuo, tipo "il business plan di questo progetto" o "una timeline degli obiettivi". Vive isolato (iframe), non vede i dati veri dell\'app: scrivi contenuto autosufficiente (statico, o con un <script> tuo per semplici interazioni locali), mai una fetch verso l\'app. Fondo nero, testo chiaro, un solo font mono o sans coerente — niente sfondi bianchi o colori sgargianti a caso: deve sembrare nato dentro VINZ.MON, non incollato. Usalo solo su richiesta esplicita ("disegnami...", "fammi una tab per...", "cambia questa tab").',
    schema: { type: 'object', properties: {
      azione: { type: 'string', enum: ['aggiungi', 'aggiorna', 'rimuovi'], description: 'aggiungi = nuova tab; aggiorna = cambia etichetta e/o contenuto di una tab esistente; rimuovi = elimina una tab.' },
      tab_id: { type: 'string', description: 'Id della tab — richiesto per aggiornare o rimuovere. Leggi prima leggi_progetto se non lo conosci già.' },
      etichetta: { type: 'string', maxLength: 24, description: 'Nome breve della tab, in maiuscolo come le altre (es. "PIANO", "BUDGET"). Richiesto per aggiungi.' },
      html: { type: 'string', description: 'HTML e CSS completi del contenuto (uno <style> dentro va benissimo). Richiesto per aggiungi; opzionale per aggiorna se cambi solo l\'etichetta.' },
    }, required: ['azione'] },
  },
  {
    name: 'imposta_obiettivo_progetto',
    description: 'Scrive o sostituisce le istruzioni permanenti di questo progetto — la "ricetta" che leggi SEMPRE, a ogni messaggio, prima di rispondere qui dentro (le vedi anche dentro il campo "context" di leggi_progetto). Usalo quando l\'utente ti dice come vuole che tu lavori su QUESTO progetto in generale, non per una richiesta singola — es. "il tuo obiettivo qui è: quando ti do una spesa, aggiorna business-plan.md nella cartella di lavoro e poi ridisegna la tab collegata". Sostituisce le istruzioni esistenti per intero: se l\'utente vuole aggiungerne una nuova senza perdere le altre, includile tutte (leggi prima leggi_progetto se non le conosci già). Mai per Generale.',
    schema: { type: 'object', properties: {
      istruzioni: { type: 'string', maxLength: 4000, description: 'Testo completo delle istruzioni permanenti del progetto, non solo la parte nuova.' },
    }, required: ['istruzioni'] },
  },
  {
    name: 'mostra_superficie_html',
    description: 'Mostra una superficie HTML/CSS/JS interattiva direttamente in QUESTO messaggio della chat — arte generativa, una demo, una visualizzazione, un piccolo gioco: qualunque cosa vada vista/provata, non solo letta. A differenza di disegna_sezione_me (una tab fissa di un progetto), questa vale per un solo messaggio e funziona ovunque, anche su Generale. Libertà totale di HTML/CSS/JS. Vive isolata (iframe), non vede i dati veri dell\'app: contenuto autosufficiente, mai una fetch verso l\'app. IMPORTANTE per lo spazio: il riquadro ha una larghezza e un\'altezza fisse decise dalla chat, niente scroll — il tuo contenuto deve riempire esattamente il 100% di larghezza e 100% di altezza (unità relative o le dimensioni lette a runtime, es. window.innerWidth/innerHeight per un canvas), mai dimensioni fisse in pixel più grandi dello spazio disponibile. Fondo scuro coerente con la chat, niente sfondi bianchi a caso. Usala su richiesta esplicita, o quando segui una skill che genera chiaramente un output visivo/interattivo.',
    schema: { type: 'object', properties: {
      html: { type: 'string', description: 'HTML, CSS (in <style>) e JS (in <script>) completi e autosufficienti, pensati per riempire il 100% dello spazio disponibile senza mai richiedere scroll.' },
    }, required: ['html'] },
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
          enum: ['salute', 'protocollo', 'giornate', 'ricordi', 'posizione', 'dispositivo'],
          description:
            'salute = le sei statistiche e i loro andamenti; protocollo = la dieta e gli allenamenti dichiarati; giornate = cosa ha registrato negli ultimi giorni; ricordi = cosa vi siete detti; posizione = dove ha detto di essere l\'ultima volta; dispositivo = cosa sta ascoltando, la modalità Focus e la batteria, l\'ultima volta dichiarate (mai uno storico).',
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
    name: 'cerca_conversazione',
    description: 'Cerca fra i tratti di conversazione già chiusi e riassunti. Per «quando abbiamo parlato di X», «cosa ci eravamo detti su Y». Ricerca letterale su titoli e riassunti, non semantica: se non trova, dillo invece di ricostruire a memoria.',
    schema: { type: 'object', properties: {
      cerca: { type: 'string', maxLength: 200 },
    }, required: ['cerca'] },
  },
  {
    name: 'crea_file_testo',
    description: 'Prepara un vero documento scaricabile .txt/.md usando le Pagine esistenti o il progetto selezionato. Il risultato contiene il link reale con pulsante download: NON affermare che il download è già avvenuto. Richiede una richiesta esplicita di documento/file.',
    schema: { type: 'object', properties: { titolo: { type: 'string', maxLength: 60 }, testo: { type: 'string', maxLength: 40000 } }, required: ['titolo', 'testo'] },
  },
  {
    name: 'leggi_progetto',
    description: 'Legge istruzioni permanenti (impostale con imposta_obiettivo_progetto), contesto, gli export .txt/.md creati con crea_file_testo e le tab ME esistenti (con il loro id) SOLO del progetto selezionato dall’utente per questa chat. Non accede a progetti diversi o memoria personale. NON mostra i file di FILES — per quelli usa vedi_cartella_lavoro, una cosa diversa. Se nessun progetto è selezionato restituisce non disponibile.',
    schema: { type: 'object', properties: {} },
  },
  {
    name: 'leggi_sorgente_progetto',
    description: 'Legge/cerca testo nel contesto importato del progetto selezionato o in un documento esportato con crea_file_testo (nome). Restituisce path tecnico e righe. NON è accesso filesystem, repository GitHub o ricerca web: il codice va prima importato nel contesto del progetto. Ricerca letterale, massimo 80 righe.',
    schema: { type: 'object', properties: { nome: { type: 'string', description: 'Slug del documento esportato, ometti per contesto progetto.' }, cerca: { type: 'string', maxLength: 200 }, riga: { type: 'integer', minimum: 1 }, righe: { type: 'integer', minimum: 1, maximum: 80 } } },
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
  {
    name: 'leggi_calendario_google',
    description: 'Legge gli eventi del Google Calendar personale dell’utente, se collegato in FILES. Sola lettura: non crea, sposta o cancella eventi (per quello vedi programma_promemoria, che è il calendario interno di VINZ). Se non è collegato, dillo invece di inventare impegni.',
    schema: { type: 'object', properties: {
      da: { type: 'string', description: 'Inizio intervallo, ISO 8601 con offset/Z. Default: adesso.' },
      a: { type: 'string', description: 'Fine intervallo, ISO 8601 con offset/Z. Default: fra 7 giorni.' },
      massimo: { type: 'integer', minimum: 1, maximum: 50 },
    } },
  },
  {
    name: 'cerca_drive',
    description: 'Cerca file per nome in Google Drive dell’utente, se collegato in FILES (stesso account di Google Calendar). Sola lettura: nessuna scrittura o creazione file. Torna id, nome, tipo e link — usa leggi_file_drive per leggerne il contenuto.',
    schema: { type: 'object', properties: {
      cerca: { type: 'string', maxLength: 200 },
      massimo: { type: 'integer', minimum: 1, maximum: 30 },
    }, required: ['cerca'] },
  },
  {
    name: 'leggi_file_drive',
    description: 'Legge il contenuto testuale di un file Google Drive dato il suo id (da cerca_drive). Google Docs/Sheets/Slides si leggono come testo semplice; PDF, immagini e altri formati binari restano un link, non un tentativo di lettura che inventerebbe il contenuto.',
    schema: { type: 'object', properties: {
      id_file: { type: 'string' },
    }, required: ['id_file'] },
  },
  {
    name: 'cerca_email',
    description: 'Cerca email in Gmail dell’utente, se collegato in FILES (stesso account Google). Sintassi di ricerca uguale alla barra di Gmail (es. "from:ffuoco", "is:unread", "subject:recap"). Sola lettura: non invia, non cancella, non modifica email. Torna oggetto, mittente, data e un estratto breve — non il corpo intero.',
    schema: { type: 'object', properties: {
      cerca: { type: 'string', maxLength: 200 },
      massimo: { type: 'integer', minimum: 1, maximum: 20 },
    }, required: ['cerca'] },
  },
  {
    name: 'cerca_secondo_cervello',
    description: 'Cerca nelle note del vault Obsidian che l’utente ha collegato in FILES (sola lettura sui file .md locali). Se nessun vault è collegato, dillo invece di inventare cosa contiene.',
    schema: { type: 'object', properties: {
      cerca: { type: 'string', maxLength: 200 },
      massimo: { type: 'integer', minimum: 1, maximum: 20 },
    }, required: ['cerca'] },
  },
  {
    name: 'cerca_icloud',
    description: 'Cerca fra i documenti di testo nella cartella iCloud Drive che l’utente ha collegato in FILES (sola lettura, solo formati testuali: md/txt/csv/json/log/rtf/yaml — non PDF o immagini). Se nessuna cartella è collegata, dillo invece di inventare cosa contiene.',
    schema: { type: 'object', properties: {
      cerca: { type: 'string', maxLength: 200 },
      massimo: { type: 'integer', minimum: 1, maximum: 20 },
    }, required: ['cerca'] },
  },
  {
    name: 'vedi_cartella_lavoro',
    description: 'Mostra la struttura (file e cartelle) della cartella di questo progetto — È LA STESSA cosa che l\'utente vede in FILES, incluso tutto quello che carica lì con "Aggiungi file": non serve nessun collegamento, esiste già in automatico, una per progetto, sempre raggiungibile con questo strumento. Usala per sapere cosa c\'è già — sia caricato dall\'utente sia scritto da te — prima di scrivere o cancellare, o quando ti chiede di leggere "i file", "quello che ha caricato", "cosa c\'è nel progetto".',
    schema: { type: 'object', properties: {} },
  },
  {
    name: 'leggi_file_lavoro',
    description: 'Legge il contenuto testuale di un file dentro la cartella di questo progetto — compresi i file che l\'utente ha caricato da FILES con "Aggiungi file", non solo quelli scritti da te. Solo testo (md/txt/csv/json/log...): per PDF o immagini usa leggi_documento_lavoro. Se non conosci ancora il percorso esatto, chiama prima vedi_cartella_lavoro.',
    schema: { type: 'object', properties: {
      percorso: { type: 'string', description: 'Percorso relativo dentro la tua cartella, es. "note/idee.md".' },
    }, required: ['percorso'] },
  },
  {
    name: 'leggi_documento_lavoro',
    description: 'Allega DAVVERO a questo messaggio un PDF o un\'immagine già presenti nella cartella di questo progetto — non solo il nome, il documento vero, leggibile/visibile come se l\'utente te lo avesse appena mandato in chat. Usalo ogni volta che devi consultare un file caricato in passato e non più recente nella conversazione: un file in questa cartella resta consultabile per sempre, non solo finché "se lo ricorda" la chat. Se non conosci il percorso, chiama prima vedi_cartella_lavoro.',
    schema: { type: 'object', properties: {
      percorso: { type: 'string', description: 'Percorso relativo dentro la tua cartella, es. "preventivo.pdf".' },
    }, required: ['percorso'] },
  },
  {
    name: 'scrivi_file_lavoro',
    description: 'Crea o aggiorna un file di testo dentro la cartella di questo progetto — la stessa che l\'utente vede in FILES. Organizzala come vuoi, anche con sottocartelle nel percorso (si creano da sole). Mai fuori da questa cartella.',
    schema: { type: 'object', properties: {
      percorso: { type: 'string', description: 'Percorso relativo dentro la tua cartella, es. "ricerca/fonti.md".' },
      contenuto: { type: 'string' },
    }, required: ['percorso', 'contenuto'] },
  },
  {
    name: 'cancella_file_lavoro',
    description: 'Cancella un file o una cartella (con tutto il suo contenuto) dentro la cartella di questo progetto — compresi i file che l\'utente ci ha caricato, quindi chiedi conferma prima se non è ovvio che vada tolto. Funziona solo lì dentro.',
    schema: { type: 'object', properties: {
      percorso: { type: 'string' },
    }, required: ['percorso'] },
  },
  {
    name: 'chiama_connettore_personalizzato',
    description: 'Fa una richiesta GET a un connettore custom che l’utente ha configurato in FILES (nome, indirizzo, chiave). Usa id_connettore esattamente come mostrato lì. Nessuna scrittura: solo lettura di quello che quel servizio espone su quel percorso.',
    schema: { type: 'object', properties: {
      id_connettore: { type: 'string' },
      percorso: { type: 'string', description: 'Percorso relativo alla base del connettore, es. "eventi" o "status".' },
    }, required: ['id_connettore', 'percorso'] },
  },
  {
    name: 'leggi_skill',
    description: 'Legge il contenuto intero di una skill attiva (elencata come nome + descrizione nelle tue capacità) — istruzioni su COME fare un compito, non dati personali. Usalo quando il compito richiesto corrisponde chiaramente alla descrizione di una skill attiva, prima di improvvisare una procedura tua.',
    schema: { type: 'object', properties: {
      sorgente: { type: 'string', description: 'sourceId della skill, com’è nell’elenco delle capacità.' },
      id: { type: 'string', description: 'id della skill, com’è nell’elenco delle capacità.' },
    }, required: ['sorgente', 'id'] },
  },
  {
    name: 'gestisci_skill_locale',
    description: 'Crea, aggiorna o rimuove una skill scritta da te — una procedura su come fare un compito. A differenza di un file di progetto, una skill così creata vale SEMPRE, in ogni progetto e su Generale, non solo in questa chat: nasce già accesa. Usala solo su richiesta esplicita ("creami una skill per...", "salva questa procedura come skill", "modifica/cancella quella skill"). Puoi modificare o rimuovere solo le skill create così, mai quelle scaricate da un catalogo (quelle si gestiscono solo da FILES).',
    schema: { type: 'object', properties: {
      azione: { type: 'string', enum: ['crea', 'aggiorna', 'rimuovi'], description: 'crea = nuova skill; aggiorna = cambia nome/descrizione/contenuto di una skill che hai creato tu; rimuovi = eliminala.' },
      id: { type: 'string', description: 'Id della skill — richiesto per aggiornare o rimuovere, com’è nell’elenco delle capacità o nella risposta di "crea".' },
      nome: { type: 'string', maxLength: 120, description: 'Nome breve, es. "Riepilogo spese settimanale". Richiesto per crea.' },
      descrizione: { type: 'string', maxLength: 600, description: 'Una riga su quando usarla — decide se comparirà pertinente in una chat futura. Richiesto per crea.' },
      contenuto: { type: 'string', description: 'Solo il corpo in Markdown della skill (titolo, passi, esempi) — NIENTE frontmatter "---": nome e descrizione li mette già questo strumento, dai campi sopra. Richiesto per crea; opzionale per aggiorna se cambi solo nome/descrizione.' },
    }, required: ['azione'] },
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
        if (what === 'posizione') {
          const loc = loadLocation();
          if (!loc) return ok('Non lo so: non ha ancora mandato una posizione.');
          return ok(`${loc.text} (dichiarata il ${new Date(loc.at).toLocaleString('it-IT')})`);
        }
        if (what === 'dispositivo') {
          const dev = loadDeviceSignals();
          const parts: string[] = [];
          if (dev.nowPlaying) parts.push(`in ascolto: ${dev.nowPlaying.text} (${new Date(dev.nowPlaying.at).toLocaleString('it-IT')})`);
          if (dev.focus) parts.push(`focus: ${dev.focus.text} (${new Date(dev.focus.at).toLocaleString('it-IT')})`);
          if (dev.battery) parts.push(`batteria: ${dev.battery.percent}% (${new Date(dev.battery.at).toLocaleString('it-IT')})`);
          if (parts.length === 0) return ok('Non lo so: non ha ancora mandato nessun dato dal telefono.');
          return ok(parts.join('\n'));
        }
        return fail('Non so cosa guardare: usa salute, protocollo, giornate, ricordi, posizione o dispositivo.');
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
  const marker = '\n[TRUNCATED / ACCORCIATO: aggregate tool-result budget; request a narrower range next round]';
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
  let remaining = Math.min(9000, maxBytes - overhead);
  if (remaining < results.length * contentCost('[TRUNCATED]')) throw new RangeError('Tool-result identifiers exceed the aggregate budget.');
  const deferred = '[TRUNCATED / RIMANDATO: request this result in the next round]';
  // Reserve short operational receipts before allocating space to large reads.
  const reserved = results.map(r => contentCost(r.content) <= 400 ? contentCost(r.content) : contentCost(deferred));
  return results.map((r, index) => {
    const allocation = remaining - reserved.slice(index + 1).reduce((a, b) => a + b, 0);
    const content = contentCost(r.content) <= allocation ? r.content
      : allocation <= contentCost(deferred) ? deferred : fitContent(r.content, allocation);
    remaining -= contentCost(content);
    return { ...r, content };
  });
}
export function resultBlocks(results: readonly ToolResult[]): Record<string, unknown>[] {
  return budgetToolResults(results).map(resultBlock);
}

/* ============================================================================
   CONNETTORI ESTERNI — Google Calendar, vault Obsidian, servizi custom.

   🔒 STESSO PATTO DI PRIVACY DEL RESTO DI QUESTO FILE: girano nel browser,
   leggono con le credenziali che l'utente stesso ha collegato in
   FILES (`src/connectors/*`), e il server non li vede mai
   passare — vedi `src/connectors/types.ts` per il perché. */

async function executeGoogleCalendarTool(use: ToolUse, projectId: string | null): Promise<ToolResult> {
  const fail = (content: string): ToolResult => ({ id: use.id, content, isError: true });
  const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
  const { searchCalendarEvents, resolveCalendarIdForProject } = await import('../connectors/google');
  const now = Date.now();
  const da = str(args.da) || new Date(now).toISOString();
  const a = str(args.a) || new Date(now + 7 * 86_400_000).toISOString();
  if (!Number.isFinite(Date.parse(da)) || !Number.isFinite(Date.parse(a))) return fail('Date non valide: servono ISO 8601 con offset/Z.');
  const calendarId = resolveCalendarIdForProject(projectId);
  const result = await searchCalendarEvents(da, a, typeof args.massimo === 'number' ? args.massimo : 10, calendarId);
  if (!result.ok) return fail(result.error);
  return { id: use.id, content: JSON.stringify({ source: 'google-calendar', calendario: calendarId, da, a, eventi: result.events }) };
}

async function executeDriveSearchTool(use: ToolUse): Promise<ToolResult> {
  const fail = (content: string): ToolResult => ({ id: use.id, content, isError: true });
  const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
  const query = str(args.cerca);
  if (!query) return fail('Serve qualcosa da cercare.');
  const { searchDriveFiles } = await import('../connectors/google');
  const result = await searchDriveFiles(query, typeof args.massimo === 'number' ? args.massimo : 10);
  if (!result.ok) return fail(result.error);
  return { id: use.id, content: JSON.stringify({ source: 'google-drive', query, trovati: result.files.length, file: result.files }) };
}

async function executeDriveReadTool(use: ToolUse): Promise<ToolResult> {
  const fail = (content: string): ToolResult => ({ id: use.id, content, isError: true });
  const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
  const fileId = str(args.id_file);
  if (!fileId) return fail('Serve id_file.');
  const { readDriveFile } = await import('../connectors/google');
  const result = await readDriveFile(fileId);
  if (!result.ok) return fail(result.error);
  return { id: use.id, content: JSON.stringify({ source: 'google-drive', nome: result.name, testo: result.text }) };
}

async function executeGmailSearchTool(use: ToolUse): Promise<ToolResult> {
  const fail = (content: string): ToolResult => ({ id: use.id, content, isError: true });
  const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
  const query = str(args.cerca);
  if (!query) return fail('Serve qualcosa da cercare.');
  const { searchGmail } = await import('../connectors/google');
  const result = await searchGmail(query, typeof args.massimo === 'number' ? args.massimo : 10);
  if (!result.ok) return fail(result.error);
  return { id: use.id, content: JSON.stringify({ source: 'gmail', query, trovate: result.messages.length, email: result.messages }) };
}

async function executeVaultSearchTool(use: ToolUse): Promise<ToolResult> {
  const fail = (content: string): ToolResult => ({ id: use.id, content, isError: true });
  const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
  const query = str(args.cerca);
  if (!query) return fail('Serve qualcosa da cercare.');
  const { searchVault } = await import('../connectors/obsidian');
  const result = await searchVault(query, typeof args.massimo === 'number' ? args.massimo : 8);
  if (!result.ok) return fail(result.error);
  if (result.matches.length === 0) return { id: use.id, content: JSON.stringify({ source: 'obsidian-vault', query, trovati: 0, note: 'Nessuna nota corrisponde. Dillo: non ricostruire a memoria.' }) };
  return { id: use.id, content: JSON.stringify({ source: 'obsidian-vault', query, trovati: result.matches.length, risultati: result.matches.map((m) => ({ percorso: m.path, estratto: m.excerpt })) }) };
}

async function executeICloudSearchTool(use: ToolUse): Promise<ToolResult> {
  const fail = (content: string): ToolResult => ({ id: use.id, content, isError: true });
  const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
  const query = str(args.cerca);
  if (!query) return fail('Serve qualcosa da cercare.');
  const { searchICloudFolder } = await import('../connectors/icloud');
  const result = await searchICloudFolder(query, typeof args.massimo === 'number' ? args.massimo : 8);
  if (!result.ok) return fail(result.error);
  if (result.matches.length === 0) return { id: use.id, content: JSON.stringify({ source: 'icloud-drive', query, trovati: 0, note: 'Nessun documento corrisponde. Dillo: non ricostruire a memoria.' }) };
  return { id: use.id, content: JSON.stringify({ source: 'icloud-drive', query, trovati: result.matches.length, risultati: result.matches.map((m) => ({ percorso: m.path, estratto: m.excerpt })) }) };
}

/** Anche Generale ha la sua cartella (stessa chiave stabile GLOBAL_PROJECT_ID
    usata altrove per "il progetto quando non ce n'è uno selezionato"), con
    "Generale" come titolo invece del titolo interno 'GLOBAL' del progetto. */
async function projectForWorkspace(token: string | null, projectId: string | null): Promise<{ id: string; title: string } | null> {
  if (!token) return null;
  const { loadProject } = await import('../projects/client');
  const { GLOBAL_PROJECT_ID } = await import('../engine/projects');
  const project = await loadProject(token, projectId ?? GLOBAL_PROJECT_ID);
  return { id: project.id, title: projectId ? project.title : 'Generale' };
}

const NO_WORKSPACE = 'Token mancante: cartella di lavoro non disponibile.';

async function executeWorkspaceListTool(use: ToolUse, token: string | null, projectId: string | null): Promise<ToolResult> {
  const fail = (content: string): ToolResult => ({ id: use.id, content, isError: true });
  const project = await projectForWorkspace(token, projectId);
  if (!project) return fail(NO_WORKSPACE);
  const { loadWorkspace } = await import('../connectors/vinzWorkspace');
  try {
    const { root, tree } = await loadWorkspace(token, project.id, project.title);
    return { id: use.id, content: JSON.stringify({ source: 'cartella-lavoro', cartella: root, voci: tree }) };
  } catch (cause) {
    return fail(cause instanceof Error ? cause.message : 'Server locale non raggiungibile.');
  }
}

async function executeWorkspaceReadTool(use: ToolUse, token: string | null, projectId: string | null): Promise<ToolResult> {
  const fail = (content: string): ToolResult => ({ id: use.id, content, isError: true });
  const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
  const percorso = str(args.percorso);
  if (!percorso) return fail('Serve un percorso.');
  const project = await projectForWorkspace(token, projectId);
  if (!project) return fail(NO_WORKSPACE);
  const { readWorkspaceFile } = await import('../connectors/vinzWorkspace');
  const result = await readWorkspaceFile(token, project.id, project.title, percorso);
  if (!result.ok) return fail(result.error);
  return { id: use.id, content: JSON.stringify({ percorso, contenuto: result.content }) };
}

/** 🔷 «Se un file è già nella sua cartella, deve essere sempre consultabile
    — così non lo perde.» `leggi_file_lavoro` legge solo testo: un PDF o una
    foto letti così arriverebbero corrotti. Questo strumento li allega DAVVERO
    al messaggio (canale `attachment`, vedi ToolResult) invece di provare a
    descriverli come testo — VINZ può richiamarlo in ogni momento della
    conversazione, non solo quando il file è ancora "recente" in chat. */
async function executeWorkspaceDocumentTool(use: ToolUse, token: string | null, projectId: string | null): Promise<ToolResult> {
  const fail = (content: string): ToolResult => ({ id: use.id, content, isError: true });
  const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
  const percorso = str(args.percorso);
  if (!percorso) return fail('Serve un percorso.');
  const project = await projectForWorkspace(token, projectId);
  if (!project) return fail(NO_WORKSPACE);
  const { readWorkspaceBinaryFile } = await import('../connectors/vinzWorkspace');
  const result = await readWorkspaceBinaryFile(token, project.id, project.title, percorso);
  if (!result.ok) return fail(result.error);
  return {
    id: use.id,
    content: 'Documento allegato a questo messaggio: leggilo/guardalo direttamente qui sotto, non è più solo un nome di file.',
    attachment: { mediaType: result.mediaType, data: result.base64, filename: percorso.split('/').pop() },
  };
}

async function executeWorkspaceWriteTool(use: ToolUse, token: string | null, projectId: string | null): Promise<ToolResult> {
  const fail = (content: string): ToolResult => ({ id: use.id, content, isError: true });
  const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
  const percorso = str(args.percorso);
  const contenuto = typeof args.contenuto === 'string' ? args.contenuto : '';
  if (!percorso) return fail('Serve un percorso.');
  const project = await projectForWorkspace(token, projectId);
  if (!project) return fail(NO_WORKSPACE);
  const { writeWorkspaceFile } = await import('../connectors/vinzWorkspace');
  const result = await writeWorkspaceFile(token, project.id, project.title, percorso, contenuto);
  if (!result.ok) return fail(result.error);
  return { id: use.id, content: JSON.stringify({ scritto: true, percorso }) };
}

async function executeWorkspaceDeleteTool(use: ToolUse, token: string | null, projectId: string | null): Promise<ToolResult> {
  const fail = (content: string): ToolResult => ({ id: use.id, content, isError: true });
  const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
  const percorso = str(args.percorso);
  if (!percorso) return fail('Serve un percorso.');
  const project = await projectForWorkspace(token, projectId);
  if (!project) return fail(NO_WORKSPACE);
  const { deleteWorkspaceEntry } = await import('../connectors/vinzWorkspace');
  const result = await deleteWorkspaceEntry(token, project.id, project.title, percorso);
  if (!result.ok) return fail(result.error);
  return { id: use.id, content: JSON.stringify({ cancellato: true, percorso }) };
}

async function executeCustomConnectorTool(use: ToolUse): Promise<ToolResult> {
  const fail = (content: string): ToolResult => ({ id: use.id, content, isError: true });
  const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
  const id = str(args.id_connettore);
  const path = str(args.percorso);
  if (!id || !path) return fail('Servono id_connettore e percorso.');
  const { callCustomConnector } = await import('../connectors/custom');
  const result = await callCustomConnector(id, path);
  if (!result.ok) return fail(result.error);
  return { id: use.id, content: result.body };
}

/* 🔷 «Come "Aggiunto in ME", vorrei "Skill 'nome' usata".» L'etichetta sotto
   il messaggio (`updateLabel` in netlify-runtime.ts) vede solo `use.input` —
   per leggi_skill quello è {sorgente, id}, l'id tecnico (es.
   "skill-creator"), mai il nome leggibile. Il nome vero arriva solo qui,
   nella risposta di /api/skills — questa cache minuscola lo tiene pronto per
   l'etichetta senza toccare `ToolResult.content`, che deve restare il
   manifest vero e proprio per il modello, non un contenitore anche per la UI. */
const lastReadSkillNames = new Map<string, string>();
export function lastReadSkillName(sourceId: string, id: string): string | null {
  return lastReadSkillNames.get(`${sourceId}/${id}`) ?? null;
}

async function executeSkillTool(use: ToolUse, token: string | null): Promise<ToolResult> {
  const fail = (content: string): ToolResult => ({ id: use.id, content, isError: true });
  if (!token) return fail('Token mancante: lettura skill non disponibile.');
  const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
  const sourceId = str(args.sorgente);
  const id = str(args.id);
  if (!sourceId || !id) return fail('Servono sorgente e id della skill.');
  const url = `/api/skills?op=content&sourceId=${encodeURIComponent(sourceId)}&id=${encodeURIComponent(id)}`;
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const body = (await response.json().catch(() => null)) as { skill?: { name?: string }; manifest?: string; error?: string } | null;
  if (!response.ok || !body?.manifest) return fail(body?.error ?? 'Skill non leggibile.');
  if (body.skill?.name) lastReadSkillNames.set(`${sourceId}/${id}`, body.skill.name);
  return { id: use.id, content: body.manifest };
}

/** «Deve poter caricare sulla cartella con tutte le skill, che valgano per
    tutti i progetti.» A differenza di `scrivi_artifact_progetto` (dentro il
    progetto di questa chat), questo scrive in `data/skills/` — la stessa
    cartella di `leggi_skill` — quindi vale ovunque, non solo qui. */
async function executeManageSkillTool(use: ToolUse, token: string | null): Promise<ToolResult> {
  const fail = (content: string): ToolResult => ({ id: use.id, content, isError: true });
  if (!token) return fail('Token mancante: gestione skill non disponibile.');
  const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
  const azione = str(args.azione);

  const call = async (payload: Record<string, unknown>) => {
    const response = await fetch('/api/skills', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { skill?: { id: string; name: string; enabled: boolean }; ok?: boolean; error?: string } | null;
    return { ok: response.ok, body };
  };

  if (azione === 'crea') {
    const nome = str(args.nome);
    const descrizione = str(args.descrizione);
    const contenuto = typeof args.contenuto === 'string' ? args.contenuto : '';
    if (!nome || !descrizione || !contenuto.trim()) return fail('Servono nome, descrizione e contenuto della skill.');
    const { ok, body } = await call({ action: 'create', name: nome, description: descrizione, markdown: contenuto });
    if (!ok || !body?.skill) return fail(body?.error ?? 'Creazione non riuscita.');
    return { id: use.id, content: JSON.stringify({ creata: true, id: body.skill.id, nome: body.skill.name, attiva: body.skill.enabled, nota: 'Vale per tutti i progetti e per Generale, non solo questa chat.' }) };
  }

  const skillId = str(args.id);
  if (!skillId) return fail('Manca id: leggi_skill o le tue capacità per trovarlo, se non lo conosci.');

  if (azione === 'aggiorna') {
    const nome = str(args.nome);
    const descrizione = str(args.descrizione);
    const contenuto = typeof args.contenuto === 'string' ? args.contenuto : '';
    if (!nome && !descrizione && !contenuto.trim()) return fail('Serve almeno un nuovo nome, descrizione o contenuto.');
    const { ok, body } = await call({
      action: 'update', sourceId: 'local', id: skillId,
      ...(nome ? { name: nome } : {}), ...(descrizione ? { description: descrizione } : {}), ...(contenuto.trim() ? { markdown: contenuto } : {}),
    });
    if (!ok || !body?.skill) return fail(body?.error ?? 'Modifica non riuscita.');
    return { id: use.id, content: JSON.stringify({ aggiornata: true, id: body.skill.id, nome: body.skill.name }) };
  }
  if (azione === 'rimuovi') {
    const { ok, body } = await call({ action: 'uninstall', sourceId: 'local', id: skillId });
    if (!ok) return fail(body?.error ?? 'Rimozione non riuscita.');
    return { id: use.id, content: JSON.stringify({ rimossa: true, id: skillId }) };
  }
  return fail('Azione non riconosciuta: usa crea, aggiorna o rimuovi.');
}

/* 🔷 «Le skill non arrivano mai a VINZ quando risponde.» Il modello vede
   sempre nome+descrizione delle skill ACCESE (poche righe): il contenuto
   intero (fino a 33KB per skill, vedi data/skills/) arriva solo se poi
   chiama `leggi_skill` — non a ogni turno, per ogni skill installata. */
export async function loadEnabledSkillsSummary(token: string | null): Promise<string> {
  if (!token) return '';
  try {
    const response = await fetch('/api/skills?op=installed', { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) return '';
    const body = (await response.json()) as { skills?: { id: string; sourceId: string; name: string; description: string; enabled: boolean }[] };
    const active = (body.skills ?? []).filter((s) => s.enabled);
    if (active.length === 0) return '';
    return [
      '',
      '',
      'SKILL ATTIVE — procedure installate su come fare un compito, non dati personali. Se il compito richiesto corrisponde chiaramente a una di queste, chiama leggi_skill(sorgente, id) prima di improvvisare:',
      ...active.map((s) => `- ${s.name} (sorgente="${s.sourceId}", id="${s.id}")${s.description ? `: ${s.description}` : ''}`),
    ].join('\n');
  } catch {
    return '';
  }
}

async function executeTopicSearchTool(use: ToolUse, token: string | null): Promise<ToolResult> {
  const fail = (content: string): ToolResult => ({ id: use.id, content, isError: true });
  if (!token) return fail('Token mancante: ricerca non disponibile.');
  const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
  const query = str(args.cerca).trim();
  if (!query) return fail('Serve qualcosa da cercare.');

  const response = await fetch('/api/topics', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'search', query }),
  });
  if (!response.ok) return fail('Ricerca non riuscita.');
  const body = (await response.json()) as { topics?: { title: string; summary: string; startedAt: string; endedAt: string; messageCount: number }[] };
  const topics = body.topics ?? [];

  return {
    id: use.id,
    content: JSON.stringify({
      source: 'topic-index',
      query,
      trovati: topics.length,
      note: topics.length ? undefined : 'Nessun tratto corrisponde. Dillo: non ricostruire a memoria.',
      topics: topics.map((topic) => ({
        titolo: topic.title,
        riassunto: topic.summary,
        dal: topic.startedAt,
        al: topic.endedAt,
        messaggi: topic.messageCount,
      })),
    }),
  };
}

async function executeAutomationTool(use: ToolUse, token: string | null): Promise<ToolResult> {
  const fail = (content: string): ToolResult => ({ id: use.id, content, isError: true });
  if (!token) return fail('Token mancante: automazioni non disponibili.');
  const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
  const cadence = str(args.cadenza);
  const payload: Record<string, unknown> = {
    action: 'create',
    title: str(args.titolo),
    prompt: str(args.descrizione),
    timezone: str(args.fuso) || Intl.DateTimeFormat().resolvedOptions().timeZone,
    icon: str(args.icona),
  };
  if (cadence === 'ogni_intervallo') {
    payload.cadence = 'interval';
    payload.everyMinutes = Number(args.ogni_minuti);
    if (args.dalle_ore !== undefined) payload.fromHour = Number(args.dalle_ore);
    if (args.alle_ore !== undefined) payload.toHour = Number(args.alle_ore);
  } else {
    payload.cadence = cadence === 'giorni_settimana' ? 'weekly' : 'daily';
    payload.hour = Number(args.ora);
    payload.minute = args.minuti === undefined ? 0 : Number(args.minuti);
    if (payload.cadence === 'weekly') {
      payload.days = Array.isArray(args.giorni) ? args.giorni.map(Number) : [];
    }
  }

  const response = await fetch('/api/automations', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => null)) as { automation?: { title: string; nextRunAt: string }; error?: string } | null;
  if (!response.ok || !body?.automation) return fail(body?.error ?? 'Creazione automazione non riuscita.');
  return {
    id: use.id,
    content: JSON.stringify({
      created: true,
      title: body.automation.title,
      firstRunAt: body.automation.nextRunAt,
      note: 'Read-only automation: it searches and reports, it cannot write to ME.',
    }),
  };
}

async function executeReminderTool(use: ToolUse, token: string | null, projectId: string | null = null): Promise<ToolResult> {
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
    return ((await response.json()) as { events: Row[] }).events.filter(({ event }) => (event.projectId ?? null) === projectId);
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
    input = row ? { ...row.event, title, reminderAt, timezone } : { title, start: reminderAt, reminderAt, timezone, category: 'task', notes: '', status: 'planned', projectId };
    if (row && row.event.status !== 'planned') return fail('L’evento è annullato/completato: non viene riattivato implicitamente.');
    // Stable technical key makes an exact repeated request idempotent without another store.
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([title, reminderAt, timezone, ...(projectId ? [projectId] : [])])));
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

/** Cambia l'icona del progetto a cui è agganciata QUESTA chat — non chiede
    il nome: lo scope della conversazione già lo dice, come `crea_file_testo`. */
async function executeProjectIconTool(use: ToolUse, token: string | null, projectId: string | null): Promise<ToolResult> {
  const fail = (content: string): ToolResult => ({ id: use.id, content, isError: true });
  if (!token) return fail('Token mancante: progetti non disponibili.');
  const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
  const icon = str(args.icona);
  const { loadProject, mutateProject } = await import('../projects/client');
  const { GLOBAL_PROJECT_ID, isValidProjectIcon } = await import('../engine/projects');
  if (!isValidProjectIcon(icon)) return fail('Icona non valida: serve una sola emoji, non testo.');
  const id = projectId ?? GLOBAL_PROJECT_ID;
  const project = await loadProject(token, id);
  await mutateProject(token, { action: 'set-icon', projectId: project.id, revision: project.revision, icon });
  return { id: use.id, content: JSON.stringify({ changed: true, projectId: project.id, projectTitle: project.title, icon }) };
}

/** Disegna/modifica/rimuove una tab ME del progetto di QUESTA chat. Mai per
    GLOBAL_PROJECT_ID: `updateProject` lo rifiuta comunque server-side, ma
    dirlo subito qui evita un giro a vuoto quando lo scope è Generale. */
const MAX_HTML_SURFACE_CHARS = 20_000;

/** «Una superficie html in un box suo, sempre dentro la chat.» Niente da
    salvare da nessuna parte: il contenuto vive solo per questo messaggio, lo
    legge direttamente `netlify-runtime.ts` da `use.input.html` per metterlo
    nei metadata del messaggio — questo esecutore serve solo a validarlo. */
async function executeHtmlSurfaceTool(use: ToolUse): Promise<ToolResult> {
  const fail = (content: string): ToolResult => ({ id: use.id, content, isError: true });
  const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
  const html = typeof args.html === 'string' ? args.html.trim() : '';
  if (!html) return fail('Manca il contenuto HTML.');
  if (html.length > MAX_HTML_SURFACE_CHARS) return fail(`Contenuto troppo lungo (massimo ${MAX_HTML_SURFACE_CHARS} caratteri).`);
  return { id: use.id, content: JSON.stringify({ mostrata: true }) };
}

/** 🔷 «Dobbiamo dargli sempre una sorta di obiettivo del progetto così sa
    come lavorarci.» `project.instructions` esisteva già ed è già letta a
    ogni messaggio di questo progetto (`buildProjectContext`, in
    `resolveChatContext`) — mancava solo un modo per scriverla DALLA CHAT:
    prima era raggiungibile solo da una schermata di impostazioni che
    nell'uso reale non si apre mai (stesso destino di Artefatti). */
async function executeProjectGoalTool(use: ToolUse, token: string | null, projectId: string | null): Promise<ToolResult> {
  const fail = (content: string): ToolResult => ({ id: use.id, content, isError: true });
  if (!token) return fail('Token mancante: progetti non disponibili.');
  const { GLOBAL_PROJECT_ID } = await import('../engine/projects');
  if (!projectId || projectId === GLOBAL_PROJECT_ID) return fail('Generale non ha istruzioni di progetto personalizzabili: servono un progetto selezionato.');
  const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
  const istruzioni = typeof args.istruzioni === 'string' ? args.istruzioni.trim() : '';
  if (!istruzioni) return fail('Servono le istruzioni da salvare.');
  const { loadProject, mutateProject } = await import('../projects/client');
  const project = await loadProject(token, projectId);
  if (project.trashedAt) return fail('Questo gruppo è nel cestino. Ripristinalo prima di usarlo.');
  const saved = await mutateProject(token, { action: 'update', projectId: project.id, revision: project.revision, title: project.title, instructions: istruzioni, context: project.context });
  return { id: use.id, content: JSON.stringify({ saved: true, istruzioni: saved.instructions }) };
}

async function executeMeSectionTool(use: ToolUse, token: string | null, projectId: string | null): Promise<ToolResult> {
  const fail = (content: string): ToolResult => ({ id: use.id, content, isError: true });
  if (!token) return fail('Token mancante: progetti non disponibili.');
  const { loadProject, mutateProject } = await import('../projects/client');
  const { GLOBAL_PROJECT_ID, ME_TAB_LIMITS } = await import('../engine/projects');
  if (!projectId || projectId === GLOBAL_PROJECT_ID) {
    return fail('La sezione ME di Generale è la schermata salute e non si personalizza. Questo vale solo per gli altri progetti — chiedi di cambiare progetto prima.');
  }
  const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
  const azione = str(args.azione);
  const project = await loadProject(token, projectId);
  if (azione === 'aggiungi') {
    const etichetta = str(args.etichetta);
    const html = typeof args.html === 'string' ? args.html : '';
    if (!etichetta) return fail('Manca l’etichetta della tab.');
    if (!html.trim()) return fail('Manca il contenuto HTML della tab.');
    if ((project.meTabs?.length ?? 0) >= ME_TAB_LIMITS.tabs) return fail(`Massimo ${ME_TAB_LIMITS.tabs} tab per progetto: rimuovine una prima di aggiungerne un’altra.`);
    const saved = await mutateProject(token, { action: 'add-me-tab', projectId: project.id, revision: project.revision, label: etichetta, html });
    const tab = saved.meTabs?.at(-1);
    return { id: use.id, content: JSON.stringify({ created: true, tabId: tab?.id, label: tab?.label, revisione: tab?.revision, tabs: saved.meTabs?.map((t) => ({ id: t.id, label: t.label, revisione: t.revision })) }) };
  }
  const tabId = str(args.tab_id);
  if (!tabId) return fail('Manca tab_id: leggi_progetto per vedere le tab esistenti e i loro id.');
  if (!project.meTabs?.some((t) => t.id === tabId)) return fail('Tab non trovata su questo progetto.');
  if (azione === 'rimuovi') {
    await mutateProject(token, { action: 'remove-me-tab', projectId: project.id, revision: project.revision, tabId });
    return { id: use.id, content: JSON.stringify({ removed: true, tabId }) };
  }
  if (azione === 'aggiorna') {
    const etichetta = typeof args.etichetta === 'string' ? args.etichetta.trim() : undefined;
    const html = typeof args.html === 'string' ? args.html : undefined;
    if (!etichetta && !html) return fail('Serve almeno una nuova etichetta o un nuovo contenuto.');
    const saved = await mutateProject(token, { action: 'update-me-tab', projectId: project.id, revision: project.revision, tabId, ...(etichetta ? { label: etichetta } : {}), ...(html ? { html } : {}) });
    const tab = saved.meTabs?.find((t) => t.id === tabId);
    return { id: use.id, content: JSON.stringify({ updated: true, tabId, label: tab?.label, revisione: tab?.revision }) };
  }
  return fail('Azione non riconosciuta: usa aggiungi, aggiorna o rimuovi.');
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
    if (use.name === 'programma_promemoria') return await executeReminderTool(use, scope.token, scope.projectId ?? null);
    if (use.name === 'crea_automazione') return await executeAutomationTool(use, scope.token);
    if (use.name === 'cambia_icona_progetto') return await executeProjectIconTool(use, scope.token, scope.projectId ?? null);
    if (use.name === 'disegna_sezione_me') return await executeMeSectionTool(use, scope.token, scope.projectId ?? null);
    if (use.name === 'imposta_obiettivo_progetto') return await executeProjectGoalTool(use, scope.token, scope.projectId ?? null);
    if (use.name === 'mostra_superficie_html') return await executeHtmlSurfaceTool(use);
    if (use.name === 'cerca_conversazione') return await executeTopicSearchTool(use, scope.token);
    if (use.name === 'leggi_calendario_google') return await executeGoogleCalendarTool(use, scope.projectId ?? null);
    if (use.name === 'cerca_drive') return await executeDriveSearchTool(use);
    if (use.name === 'leggi_file_drive') return await executeDriveReadTool(use);
    if (use.name === 'cerca_email') return await executeGmailSearchTool(use);
    if (use.name === 'cerca_secondo_cervello') return await executeVaultSearchTool(use);
    if (use.name === 'cerca_icloud') return await executeICloudSearchTool(use);
    if (use.name === 'vedi_cartella_lavoro') return await executeWorkspaceListTool(use, scope.token, scope.projectId ?? null);
    if (use.name === 'leggi_file_lavoro') return await executeWorkspaceReadTool(use, scope.token, scope.projectId ?? null);
    if (use.name === 'leggi_documento_lavoro') return await executeWorkspaceDocumentTool(use, scope.token, scope.projectId ?? null);
    if (use.name === 'scrivi_file_lavoro') return await executeWorkspaceWriteTool(use, scope.token, scope.projectId ?? null);
    if (use.name === 'cancella_file_lavoro') return await executeWorkspaceDeleteTool(use, scope.token, scope.projectId ?? null);
    if (use.name === 'chiama_connettore_personalizzato') return await executeCustomConnectorTool(use);
    if (use.name === 'leggi_skill') return await executeSkillTool(use, scope.token);
    if (use.name === 'gestisci_skill_locale') return await executeManageSkillTool(use, scope.token);
    const isProjectTool = ['leggi_progetto', 'leggi_sorgente_progetto'].includes(use.name);
    const projectFile = use.name === 'crea_file_testo';
    if (!isProjectTool && !projectFile) return await localRun(use);
    if (!scope.token) return fail('Archivio progetti non autorizzato: token mancante.');
    const { loadProject, mutateProject } = await import('../projects/client');
    const { artifactHref, buildProjectContext, GLOBAL_PROJECT_ID } = await import('../engine/projects');
    const project = await loadProject(scope.token, scope.projectId ?? GLOBAL_PROJECT_ID);
    if (project.trashedAt) return fail('Questo gruppo è nel cestino. Ripristinalo prima di usarlo.');
    const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
    /* 🔷 «Non ha la possibilità di cancellare o modificare tab esistenti in
       ME.» Non era che rifiutasse: `disegna_sezione_me` già gestisce
       aggiorna/rimuovi, ma per farlo serve un `tab_id` — e l'unico posto
       indicato per trovarlo ("leggi_progetto per vedere le tab esistenti e i
       loro id", vedi lo schema di `disegna_sezione_me` e il messaggio di
       errore sotto) non le includeva mai nella risposta. Senza id da
       leggere, aggiorna/rimuovi non erano mai raggiungibili su una tab non
       appena creata nello stesso turno. */
    if (use.name === 'leggi_progetto') return ok(JSON.stringify({ projectId: project.id, revision: project.revision, source: 'authenticated-project-store', context: buildProjectContext(project), artifacts: project.artifacts.map((p) => ({ slug: p.slug, title: p.title, revision: p.revision, url: artifactHref(project.id, p.slug) })), meTabs: (project.meTabs ?? []).map((t) => ({ id: t.id, label: t.label, revisione: t.revision ?? 1 })) }));
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
    /* 🔷 Con scrivi_artifact_progetto tolto, questo blocco serve solo più
       crea_file_testo — che non ha mai avuto nome/revisione_progetto nel suo
       schema, quindi crea sempre un nuovo export, mai un aggiornamento per
       slug. */
    const markdown = typeof args.testo === 'string' ? args.testo : '';
    const saved = await mutateProject(scope.token, { action: 'save-artifact', projectId: project.id, revision: project.revision, title: str(args.titolo), markdown });
    const artifact = saved.artifacts[saved.artifacts.length - 1];
    if (!artifact) return fail('Il server ha risposto ma non ha restituito il documento. Non dichiarare il salvataggio verificato.');
    const checked = await loadProject(scope.token, project.id);
    const persisted = checked.artifacts.find((p) => p.slug === artifact.slug);
    if (!persisted || persisted.markdown !== markdown || persisted.revision !== artifact.revision) return fail('Salvataggio accettato ma rilettura non coerente: non ripetere automaticamente la creazione, rileggi il progetto.');
    return ok(JSON.stringify({ status: 'saved-and-read-back', projectId: project.id, projectRevision: checked.revision, slug: artifact.slug, artifactRevision: artifact.revision, url: artifactHref(project.id, artifact.slug), access: 'private/authenticated', download: 'TXT and Markdown download buttons on the real artifact page; not downloaded automatically', published: false }));
  } catch {
    return fail('Strumento non completato o verifica non disponibile. Non affermare che il risultato esiste, è stato pubblicato o consegnato. Verifica lo stato prima di ripetere una scrittura.');
  }
}
