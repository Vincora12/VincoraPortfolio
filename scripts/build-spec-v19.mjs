/* ============================================================================
   MASTER SPEC v1.9 — generatore del documento

   Il documento non si scrive a mano: si genera da qui. Il motivo è lo stesso
   per cui `feature-check.mjs` esiste — in un progetto costruito a conversazione
   la cosa che si rompe non è il codice, è l'allineamento fra codice e
   documento. Tenere la sorgente del documento nel repository significa che
   cambia con lo stesso commit che cambia il codice.

   Richiede `docx`, che NON sta in package.json di proposito: serve solo a
   generare il documento, e non deve entrare nella build del sito.
     npm install docx --no-save && node scripts/build-spec-v19.mjs

   Uso:  node scripts/build-spec-v19.mjs
   Esce: VINZ_MON_MASTER_SPEC_v1.9.docx
   ========================================================================= */

import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { writeFileSync } from 'node:fs';

/* --- Aiutanti di impaginazione --------------------------------------------- */

const TABLE_W = 9360; // larghezza utile con margini da 1"

const h1 = (text) =>
  new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 } });

const h2 = (text) =>
  new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 260, after: 120 } });

const p = (text, opts = {}) =>
  new Paragraph({
    children: [new TextRun({ text, ...opts })],
    spacing: { after: 120 },
  });

/** Una regola con il suo stato. Una regola senza stato è un errore (v1.7 §4). */
const rule = (state, text) =>
  new Paragraph({
    children: [
      new TextRun({ text: `${state}  `, bold: true }),
      new TextRun({ text }),
    ],
    spacing: { after: 100 },
    indent: { left: 220 },
  });

const bullet = (text) =>
  new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 80 } });

const note = (text) =>
  new Paragraph({
    children: [new TextRun({ text, italics: true, color: '555555' })],
    spacing: { after: 160 },
    indent: { left: 220 },
  });

function table(headers, rows) {
  const widths = headers.map(() => Math.floor(TABLE_W / headers.length));

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (h, i) =>
        new TableCell({
          width: { size: widths[i], type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: 'EEEEEE' },
          children: [
            new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 19 })] }),
          ],
        }),
    ),
  });

  const bodyRows = rows.map(
    (cells) =>
      new TableRow({
        children: cells.map(
          (c, i) =>
            new TableCell({
              width: { size: widths[i], type: WidthType.DXA },
              children: [new Paragraph({ children: [new TextRun({ text: c, size: 19 })] })],
            }),
        ),
      }),
  );

  return new Table({
    columnWidths: widths,
    width: { size: TABLE_W, type: WidthType.DXA },
    rows: [headerRow, ...bodyRows],
  });
}

const spacer = () => new Paragraph({ text: '', spacing: { after: 120 } });

/* ============================================================================
   IL DOCUMENTO
   ========================================================================= */

const body = [];

/* --- Copertina ------------------------------------------------------------- */

body.push(
  new Paragraph({
    children: [new TextRun({ text: 'VINZ.MON', bold: true, size: 56 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
  }),
  new Paragraph({
    children: [new TextRun({ text: 'MASTER SPEC v1.9 — SINGLE SOURCE', size: 28 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
  }),
  new Paragraph({
    children: [
      new TextRun({
        text: 'Consolida la v1.8 e recepisce le decisioni prese costruendo il prototipo',
        italics: true,
        color: '555555',
      }),
    ],
    alignment: AlignmentType.CENTER,
    spacing: { after: 320 },
  }),
);

body.push(
  p('CANONICAL NAMING — PRODOTTO / APP / UNIVERSO: VINZ.MON. ENTITÀ / COMPAGNO: VINZ.MON. Trasformazione con nome: VINZ.MON // FORM: VAZIEL.mon. DIGIVINZ e VINZ.VERCE sono nomi deprecati.'),
);

body.push(
  h2('Come leggere gli stati'),
  rule('🔒', 'DECISA — non si tocca senza cambiare il documento.'),
  rule('🟡', 'DA TARARE — la direzione è decisa, i numeri no.'),
  rule('🔴', 'RIMANDATA — non serve alla fase corrente.'),
  rule('🔶', 'NUOVA IN v1.9 — decisa costruendo, non prevista dalla v1.8.'),
);

/* --- 0. Cosa cambia -------------------------------------------------------- */

body.push(h1('0 · COSA CAMBIA RISPETTO ALLA v1.8'));

body.push(
  p('La v1.8 era il primo documento non contraddittorio, e regge. Quello che segue non la corregge: la completa nei punti in cui costruire il prototipo ha fatto emergere una decisione che sulla carta non si poteva vedere.'),
  p('Le sezioni nuove sono nove, e nessuna nasce da un ripensamento. Sette nascono da un uso reale dell\'app, due da un vincolo tecnico che il documento non poteva conoscere.'),
);

body.push(spacer());
body.push(
  table(
    ['SEZIONE', 'COSA AGGIUNGE', 'DA DOVE NASCE'],
    [
      ['§2.4', 'Il .mon è maschile, in voce e in immagine', 'è estratto dai segnali di una persona che è un uomo'],
      ['§4.1', 'Salute e progressione separate anche a schermo', 'CONDITION, DISC e SYNC sembravano tre punteggi dello stesso gioco'],
      ['§5.1', 'Estrazione naturale dalla chat', 'la v1.8 §13 la annunciava senza definirla'],
      ['§5.2', 'Una sola superficie di registrazione, senza moduli', 'classificare prima di raccontare è l\'ordine sbagliato'],
      ['§7.1', 'Si registra anche durante l\'incubazione', 'buco: l\'incubazione conta giorni sincronizzati ma non c\'era come chiuderli'],
      ['§8.1', 'BIO in prima persona, dentro il profilo', 'era una scheda tecnica in terza persona'],
      ['§13.1–13.4', 'Ingresso, rivelazione, un tocco solo, copy vs prompt', 'presenza e attrito'],
      ['§14.1', 'Calendario a date reali', '«GIORNO 8» è come conta il prototipo, non come si guarda il tempo'],
      ['§15.1', 'L\'archivio memorie non ha superfici di prodotto', 'leggerlo rompe l\'illusione del ricordo'],
      ['§18.1', 'Registro dei costi AI', 'la v1.8 §18 lo chiedeva senza definirlo'],
      ['§23.1–23.2', 'Otto asset, griglie definite, ordine di produzione', 'vincolo tecnico dei modelli di immagini'],
    ],
  ),
);

/* --- 2.4 Genere ------------------------------------------------------------ */

body.push(h1('2.4 · GENERE 🔶'));

body.push(
  rule('🔒', 'VINZ.MON è maschile e parla di sé al maschile.'),
  rule('🔒', 'Non è un costume né un tratto di catalogo: è una costante di identità, come i marcatori VINZ.'),
  rule('🔒', 'In italiano si sente in ogni frase — «sono stanco», mai «sono stanca». Nessun accordo femminile su di sé, mai.'),
  rule('🔒', 'Il genere non è mai un argomento di conversazione: è semplicemente com\'è.'),
  rule('🔒', 'Vale anche sull\'immagine. La creatura si legge come maschile attraverso proporzione, postura, struttura del volto e presenza, TRADOTTE nell\'anatomia della sua Family.'),
  rule('🔒', 'VIETATO aggiungere marcatori umani di genere a un corpo non umano. Una Family non umanoide si legge maschile per massa, posa e lineamenti.'),
);

body.push(
  note('Perché sta nel documento e non solo nel codice: se testo e immagine divergono su questo, raccontano due persone diverse, e nessuna delle due è quella che l\'utente ha davanti.'),
);

/* --- 4.1 --------------------------------------------------------------------*/

body.push(h1('4.1 · SALUTE E PROGRESSIONE, ANCHE A SCHERMO 🔶'));

body.push(
  p('§4 diceva già «Health truth and game progression stay separate». Era vero nel modello e falso nell\'interfaccia: CONDITION, DISC, CONFIDENZA DEL DATO e SYNC comparivano nella stessa pagina, e sembravano quattro punteggi dello stesso gioco.'),
);

body.push(
  rule('🔒', 'La schermata ME dichiara in testa, a parole, che quello che segue NON è un punteggio e non fa crescere niente.'),
  rule('🔒', 'SYNC compare separato, in fondo, dichiarato come l\'unica cosa che fa crescere.'),
  rule('🔶', 'DISC esce dall\'interfaccia. Era l\'ultimo residuo del modello a valute — un voto su quanto sei costante — e quella informazione la dà il calendario mostrando i giorni invece di riassumerli.'),
  rule('🔶', 'DATA CONFIDENCE esce dall\'interfaccia di prodotto. È un concetto del motore — quanto il generatore si fida della finestra recente — non un fatto sulla persona. Resta in DEV.'),
);

/* --- 5.1 --------------------------------------------------------------------*/

body.push(h1('5.1 · ESTRAZIONE NATURALE DALLA CHAT 🔶'));

body.push(
  p('La v1.8 §13 diceva «Daily Scan → Replace with Daily Signals + natural extraction» senza definire l\'estrazione. Questa è la definizione.'),
);

body.push(
  rule('🔒', 'Scrivere in chat riempie i Daily Signals. «Oggi palestra e poi carbonara, sono distrutto» riempie CIBO, ALLENAMENTO e UMORE da solo.'),
  rule('🔒', 'Quello che il sistema ha capito È SEMPRE VISIBILE sotto il messaggio. Registrare in silenzio è peggio che non registrare: senza riscontro non sai se hai già detto una cosa.'),
  rule('🔒', 'L\'estrazione non sovrascrive MAI un segnale già dichiarato a mano. Una parola pescata in una frase vale meno di un pulsante premuto.'),
  rule('🔒', 'L\'estrazione non inventa. Se una cosa non è nel testo, il segnale resta UNKNOWN — la stessa regola di §5 sui sensori.'),
  rule('🔒', 'Lo strato deterministico è la base, non il ripiego: è istantaneo, funziona senza chiave API ed è verificabile. L\'AI ci sta sopra e può solo AGGIUNGERE segnali, mai toglierne o correggerne.'),
);

body.push(
  h2('Il confine con la pausa'),
  rule('🔒', 'Dire di stare male NON è una pausa. Se lo racconti è una giornata normale e vale +1 SYNC come tutte le altre: raccontare com\'è andata è esattamente ciò che il prodotto vuole.'),
  rule('🔒', 'La pausa (GRACE) è per i giorni in cui non c\'eri, e si dichiara al passato.'),
);

/* --- 5.2 --------------------------------------------------------------------*/

body.push(h1('5.2 · REGISTRARE: UNA SUPERFICIE SOLA 🔶'));

body.push(
  p('La schermata di input aveva quattro voci da scegliere — CAMERA, TELL, MEASURE, WORKOUT — e poi una nota. Il problema non era la grafica: costringeva a CLASSIFICARE PRIMA DI RACCONTARE. Uno sa cosa gli è successo, non in quale casella il sistema lo mette.'),
);

body.push(
  rule('🔒', 'Nessun campo preimpostato. Un campo di testo libero e una foto.'),
  rule('🔒', 'L\'interpretazione gira mentre si scrive e si vede prima di confermare, non dopo.'),
  rule('🔒', 'Se il sistema capisce male, si riscrive più chiaro. Nessun campo da correggere, nessun menu da cercare.'),
  rule('🔒', 'Una foto è un\'alternativa allo scrivere, non un allegato.'),
  rule('🔒', 'Il modello che legge la foto riporta SOLO ciò che è visibile, e mai un umore da un volto: gli stati soggettivi li dichiara la persona.'),
  rule('🔒', 'Le MISURE si scrivono nella frase — «peso 78», «dormito 6 ore» — e alimentano le sei stat di §4. Non sono un quarto Daily Signal e NON danno SYNC.'),
);

/* --- 7.1 --------------------------------------------------------------------*/

body.push(h1('7.1 · REGISTRARE DURANTE L\'INCUBAZIONE 🔶'));

body.push(
  rule('🔒', 'Durante l\'incubazione si registra e si chiude la giornata esattamente come dopo.'),
);

body.push(
  note('Era un buco, non una scelta: l\'incubazione conta giorni SINCRONIZZATI (§7) e un giorno lo chiude l\'utente (§6), ma la navigazione appariva solo dopo l\'HATCH. La soglia era irraggiungibile se non da DEV.'),
);

/* --- 8.1 --------------------------------------------------------------------*/

body.push(h1('8.1 · BIO / FILE PERSONALE 🔶'));

body.push(
  rule('🔒', 'La BIO è scritta IN PRIMA PERSONA dal .mon. È il suo quaderno, non un referto del sistema su di lui.'),
  rule('🔒', 'Racconta come è nata la forma citando i segnali veri che erano in campo alla generazione. «Sono arrivato il giorno 8. Il tuo corpo teneva e non ti stavi trattando bene. Io sono venuto fuori da lì in mezzo.»'),
  rule('🔒', 'Non è colore aggiunto sopra: le frasi sono la traduzione romanzata delle stat che il motore aveva davanti.'),
  rule('🔒', 'Vive dentro il profilo, accanto a STATS e IDENTITÀ. Parla della stessa cosa di cui parlano quelle.'),
  rule('🔒', 'Registro da blocco note: righe da quaderno, margine, appunti.'),
  rule('🔒', 'Il DOODLE compare a metà pagina, mentre si scorre — non in cima. In cima annuncia una scheda; a metà è un disegno fatto mentre si scriveva.'),
  rule('🔒', 'Il DOODLE resta il linguaggio visivo della sola BIO e non è un Appearance (GB §12).'),
);

/* --- 9.1 nota di implementazione ------------------------------------------- */

body.push(h1('9.1 · ANCORA DI CONTINUITÀ — due precisazioni 🔶'));

body.push(
  p('La regola della v1.8 resta intatta: ≥1 asse ancorato, ≥1 asse cambiato, cinque schemi. Costruirla ha fatto emergere due cose che il documento non poteva prevedere.'),
);

body.push(
  rule('🔒', 'VINCOLO ATTIVO, NON SOLO DICHIARATO. Con lo schema MINIMAL restano fermi sei assi su sette, e l\'unico libero può riestrarre il valore che aveva già: catalogo piccolo, stessi segnali. Il generatore DEVE intercettarlo e forzare un cambio. Su 150 trasformazioni di prova scatta 4–5 volte: non è un caso teorico.'),
  rule('🔒', 'L\'ARCHETIPO NON SI ANCORA DA SOLO. Un archetipo appartiene a una Family sola (GB §4): non si può tenere fermo l\'archetipo lasciando libera la Family, e se la Family cambia l\'archetipo cambia per forza. È l\'eccezione obbligata all\'edge case B, «Family changes while every other evolvable axis remains».'),
);

/* --- 13 ---------------------------------------------------------------------*/

body.push(h1('13.1 · SCHERMATA D\'INGRESSO 🔶'));

body.push(
  rule('🔒', 'All\'apertura dell\'app: solo VINZ.MON, che si muove. Nessun dato, nessuna barra, nessun riassunto.'),
  rule('🔒', 'È l\'unica superficie del prodotto che non serve a fare qualcosa. §2 dice «companion-first, dashboard-second»: questa è la differenza fra dirlo e farlo.'),
  rule('🔒', 'Compare a ogni apertura, non una volta sola: è un saluto, non un onboarding.'),
  rule('🔒', 'Si passa oltre al primo tocco, e da sé dopo pochi secondi. Nessuno resta bloccato davanti a una schermata che non chiede niente.'),
  rule('🔒', 'Senza sprite non si inventa arte (§18A): si anima quello che c\'è già.'),
);

body.push(h1('13.2 · RIVELAZIONE DI UNA FORMA 🔶'));

body.push(
  rule('🔒', 'La rivelazione ha tre battute: campo pieno, il nome che arriva, la creatura che sale, i dati alla fine.'),
  rule('🔒', 'Si salta tutta al primo tocco. Un momento che non si può saltare diventa un ostacolo la seconda volta che lo vedi.'),
);

body.push(h1('13.3 · UN TOCCO SOLO PER REGISTRARE 🔶'));

body.push(
  rule('🔒', 'Il «+» del composer apre direttamente la registrazione, non un menu.'),
  rule('🔒', 'BIO sta nel profilo, le memorie non si aprono, l\'umore è una delle cose che si raccontano registrando. Non esiste più un menu di mezzo.'),
);

body.push(h1('13.4 · TESTO DI INTERFACCIA E TESTO DEI PROMPT 🔶'));

body.push(
  p('Ogni voce di catalogo ha due descrizioni della stessa cosa, e servono a due lettori diversi.'),
);

body.push(spacer());
body.push(
  table(
    ['CAMPO', 'LETTORE', 'REGISTRO'],
    [
      ['it', 'la persona, in interfaccia', 'evocativo, in italiano — «qualcosa di celeste gli è cresciuto addosso»'],
      ['effect / language / translation', 'il modello di immagini', 'concreto, in inglese — «secondary wings, rings, feathers, multiple eyes»'],
    ],
  ),
);
body.push(spacer());

body.push(
  rule('🔒', 'Non si scambiano mai. Il testo di interfaccia non entra nei prompt e i prompt non compaiono in interfaccia.'),
  rule('🔒', 'Accorciare una descrizione visiva per renderla più bella da leggere è una regressione: il modello di immagini legge quella.'),
);

/* --- 14 ---------------------------------------------------------------------*/

body.push(h1('14.1 · CALENDARIO A DATE REALI 🔶'));

body.push(
  rule('🔒', 'Il calendario mostra date vere: mese, giorni della settimana, numeri del mese. «GIORNO 8» è come conta il prototipo, non come una persona guarda il proprio tempo.'),
  rule('🔒', 'Oggi compare in grande, in testa, ed è da lì che si apre la giornata per raccontarla.'),
  rule('🔒', 'I giorni fuori partita si vedono ma non fanno niente: un calendario mostra anche i giorni in cui non è successo nulla.'),
  rule('🔒', 'Nessuna casella rossa, nessun linguaggio di punizione, nessuna serie da difendere.'),
);

body.push(h1('14.2 · GRACE — definizione 🔶'));

body.push(
  p('La v1.8 §14 elencava GRACE fra gli stati canonici senza dire mai cosa lo facesse scattare.'),
);

body.push(
  rule('🔒', 'GRACE è una PAUSA DICHIARATA: malattia, ricovero, giorni in cui non c\'eri.'),
  rule('🔒', 'GRACE NON DÀ SYNC. SYNC misura quanti giorni VINZ.MON ha potuto leggerti: se non c\'eri, non ti ha letto, e far avanzare il contatore sarebbe una bugia sulla relazione.'),
  rule('🔒', 'Se GRACE desse SYNC, la strada più corta per crescere diventerebbe dichiararsi malati.'),
  rule('🔒', 'Si dichiara sui giorni ancora aperti, è sempre reversibile, e un giorno che ha già dato SYNC non si può marcare.'),
  rule('🔒', 'Il motivo è facoltativo. Chiederlo come condizione sarebbe la vergogna che §4 vieta.'),
  rule('🔒', 'Una pausa entra nella memoria: il punto non è il calendario, è che VINZ.MON se ne accorga.'),
);

body.push(
  note('A cosa serve, visto che §7 dice già che saltare un giorno non azzera niente: a distinguere un buco da un pezzo di vita. La progressione non cambia — aspetta, come già faceva — ma il calendario smette di essere un registro di assenze.'),
);

/* --- 15.1 -------------------------------------------------------------------*/

body.push(h1('15.1 · L\'ARCHIVIO NON SI LEGGE 🔶'));

body.push(
  rule('🔒', 'L\'archivio delle memorie NON ha superfici di prodotto. Esiste, si riempie e alimenta la voce; nessuna schermata lo apre.'),
  rule('🔒', 'Resta ispezionabile solo in DEV.'),
);

body.push(
  note('Un compagno che si ricorda una cosa e te la tira fuori in una frase è magia. Lo stesso ricordo letto in una lista con data e categoria è un database — e vedere il database dietro spegne la prima cosa, senza riaccenderla più.'),
);

/* --- 18.1 -------------------------------------------------------------------*/

body.push(h1('18.1 · REGISTRO DEI COSTI 🔶'));

body.push(
  rule('🔒', 'Ogni chiamata AI registra sottosistema, modello, token in ingresso e in uscita, e una stima di costo.'),
  rule('🔒', 'La lettura è divisa per sottosistema: serve sapere COSA costa, non solo quanto.'),
  rule('🟡', 'I prezzi sono cablati e stimati. Sono l\'unico dato del progetto non verificabile dal codice: cambiano quando vuole chi vende il modello. La schermata DEVE dichiararli come stime.'),
  rule('🔒', 'Il registro è telemetria di sviluppo, non stato di prodotto: non si persiste e non entra negli export.'),
);

body.push(
  h2('AI per le immagini'),
  rule('🔴', 'NON collegata, per scelta. La pipeline immagini è manuale (§22): il prototipo compila i prompt e li esporta, le immagini le genera una persona e le reimporta.'),
  rule('🔒', 'Collegarla richiede un modello che accetti un\'immagine di riferimento. Senza, i 25 frame di un .mon non restano lo stesso personaggio — vedi §23.2.'),
);

/* --- 23 ---------------------------------------------------------------------*/

body.push(h1('23.1 · ASSET: OTTO TIPI 🔶'));

body.push(spacer());
body.push(
  table(
    ['ASSET', 'FRAME', 'GRIGLIA', 'A COSA SERVE'],
    [
      ['CHARACTER MASTER', '1', '—', 'fonte di verità visiva'],
      ['PROFILE PORTRAIT', '1', '—', 'profilo, nodi, notifiche'],
      ['ROTATION SPRITE', '8', '8 × 1', 'rotazione a trascinamento'],
      ['IDLE ANIMATION 🔶', '6', '6 × 1', 'ingresso e presenza viva'],
      ['EXPRESSION SHEET 🔶', '6', '3 × 2', 'il volto in chat'],
      ['ENCOUNTER HERO', '1', '—', 'rivelazione'],
      ['BIO DOODLE', '1', '—', 'solo BIO'],
      ['SIGIL', '1', '—', 'marchio monocromo'],
    ],
  ),
);
body.push(spacer());

body.push(
  rule('🔶', 'IDLE ANIMATION — ciclo di respiro a 6 frame, riprodotto ping-pong. Movimento minimo: massa che sale e scende, spostamento di peso, moto secondario su ciò che l\'anatomia ha davvero. Piedi fermi, inquadratura identica in ogni frame.'),
  rule('🔶', 'EXPRESSION SHEET — sei espressioni in griglia fissa: NEUTRAL, WARM, AMUSED, ALERT, LOW, INTENSE. L\'ordine è vincolato: l\'app legge il riquadro per posizione.'),
  rule('🔒', 'Sei e non sedici. I Mood di catalogo sono l\'identità della creatura, non il suo stato momentaneo: sedici versioni consistenti sono irrealistiche e nessuno distinguerebbe due vicine. Sei coprono il registro di una conversazione.'),
  rule('🔒', 'L\'espressione mostrata si sceglie da ciò che il .mon ha appena scritto, non dall\'umore di fondo. È presentazione, non un dato: non entra da nessuna parte.'),
);

body.push(h1('23.2 · ORDINE DI PRODUZIONE 🔶'));

body.push(
  p('Totale per .mon: 8 generazioni, 25 frame disegnati.'),
);

body.push(spacer());
body.push(
  table(
    ['STADIO', 'ASSET', 'INGRESSO'],
    [
      ['0 — fonte di verità', 'CHARACTER MASTER', 'solo testo'],
      ['1 — derivati', 'PORTRAIT · ROTATION · IDLE · ESPRESSIONI · HERO', 'testo + immagine dello stadio 0'],
      ['2 — altri linguaggi', 'BIO DOODLE · SIGIL', 'testo + stadio 0 per la sola identità'],
    ],
  ),
);
body.push(spacer());

body.push(
  rule('🔒', 'Dallo stadio 1 in poi il prompt DEVE essere accompagnato dall\'immagine dello stadio 0, dichiarata come unica fonte di verità visiva. Dove testo e riferimento non concordano, vince il riferimento.'),
  rule('🔒', 'Il CHARACTER MASTER non allega sé stesso: lì il riferimento non esiste ancora, ed è esattamente il motivo per cui va generato per primo.'),
);

body.push(
  note('Un modello di immagini non riproduce lo stesso personaggio due volte partendo dallo stesso testo, per quanto il testo sia dettagliato. La consistenza si ottiene mostrandogli la faccia, non descrivendogliela meglio. È il vincolo che rende impossibile generare tutto in parallelo.'),
);

/* --- Invarianti -------------------------------------------------------------*/

body.push(h1('24 · INVARIANTI DI IMPLEMENTAZIONE'));

body.push(
  p('La v1.8 ne elencava quindici e valgono tutte. Queste si aggiungono.'),
);

[
  'Il .mon è maschile, in voce e in immagine.',
  'La chat registra: nessuna seconda superficie per dire le stesse cose.',
  'Quello che il sistema ha capito è sempre visibile prima della conferma.',
  'Una lettura automatica non corregge mai una dichiarazione dell\'utente.',
  'Le misure non danno SYNC.',
  'GRACE non dà SYNC.',
  'Dire di stare male non è una pausa.',
  'L\'archivio memorie non ha superfici di prodotto.',
  'Il testo di interfaccia non entra nei prompt immagine.',
  'Ogni asset derivato porta il CHARACTER MASTER come riferimento.',
  'Una forma nuova non è mai identica alla precedente.',
  'Nessun pulsante che non fa niente.',
].forEach((t) => body.push(bullet(t)));

/* --- Superseded -------------------------------------------------------------*/

body.push(h1('25 · SUPERATO — INDICE DI MIGRAZIONE'));

body.push(spacer());
body.push(
  table(
    ['RIMOSSO', 'SOSTITUITO DA'],
    [
      ['Menu di input a quattro voci', 'un campo libero e una foto (§5.2)'],
      ['DISC come metrica di prodotto', 'il calendario, che mostra i giorni (§4.1)'],
      ['DATA CONFIDENCE in interfaccia', 'resta in DEV (§4.1)'],
      ['BIO come schermata separata', 'scheda del profilo, in prima persona (§8.1)'],
      ['BIO in terza persona', 'la scrive lui (§8.1)'],
      ['Archivio memorie navigabile', 'solo DEV (§15.1)'],
      ['Reaction pack generico', 'expression sheet 3 × 2 indicizzabile (§23.1)'],
      ['Sette tipi di asset', 'otto: si aggiunge IDLE ANIMATION (§23.1)'],
      ['Generazione asset senza ordine', 'tre stadi con riferimento obbligatorio (§23.2)'],
      ['GRACE non definito', 'pausa dichiarata che non dà SYNC (§14.2)'],
      ['Calendario a numeri di giorno', 'date reali (§14.1)'],
      ['Incubazione senza registrazione', 'si registra come sempre (§7.1)'],
    ],
  ),
);
body.push(spacer());

/* --- Aperte -----------------------------------------------------------------*/

body.push(h1('26 · ANCORA APERTE'));

body.push(
  rule('🟡', 'PESI DEL SIGNAL SCAN — le direzioni di §12 sono canoniche, i coefficienti numerici no. Vivono in un file solo.'),
  rule('🟡', 'PREZZI DEI MODELLI — cablati e da ricontrollare (§18.1).'),
  rule('🟡', 'TRIGGER NASCOSTO DI SINGULAR — GB §15 lo richiede ma non definisce l\'evento.'),
  rule('🟡', 'AFFINITÀ CULTURALI — gli otto tag esistono e alimentano i segnali, ma nessuna superficie li fa dichiarare.'),
  rule('🔴', 'AI PER LE IMMAGINI — richiede un modello con immagine di riferimento e un posto dove mettere i file che non sia il browser.'),
  rule('🔴', 'CHIAVE API DIETRO UNA FUNZIONE — oggi vive nel browser. Regge finché il prototipo è di una persona sola.'),
);

/* --- Chiusura ---------------------------------------------------------------*/

body.push(h1('27 · COSA NON CAMBIA'));

[
  'Il modello di salute a sei stat, CONDITION come stato del giorno, la separazione fra salute e progressione.',
  'Dato mancante = sconosciuto, mai fallimento.',
  'Nessuna vergogna su corpo, cibo, malattia o salute. Nessuna Family come premio o punizione.',
  'Malattia, viaggio e riposo non vengono puniti.',
  'SYNC unica valuta, massimo +1 al giorno.',
  'Incubazione a 7 giorni sincronizzati, micro-growth ogni 7, Form Evolution offerta a 28.',
  'VINZ.MON è una entità sola: non muore, non viene sostituita, nessuna schermata dice addio.',
  'SLIME è Affinity, non Family. DOODLE è BIO, non Appearance.',
  'La GENERATION BIBLE v2.1 resta la fonte unica per le tassonomie e il prompt compiler.',
].forEach((t) => body.push(bullet(t)));

/* --- Documento --------------------------------------------------------------*/

const doc = new Document({
  creator: 'VINZ.MON',
  title: 'VINZ.MON MASTER SPEC v1.9',
  description: 'Consolida la v1.8 e recepisce le decisioni prese costruendo il prototipo',
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 21 } },
      heading1: {
        run: { font: 'Calibri', size: 30, bold: true, color: '111111' },
        paragraph: { spacing: { before: 360, after: 160 } },
      },
      heading2: {
        run: { font: 'Calibri', size: 24, bold: true, color: '333333' },
        paragraph: { spacing: { before: 240, after: 120 } },
      },
    },
  },
  sections: [
    {
      properties: {
        page: { size: { width: 12240, height: 15840 } },
      },
      children: body,
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync('VINZ_MON_MASTER_SPEC_v1.9.docx', buffer);
console.log(`✓ VINZ_MON_MASTER_SPEC_v1.9.docx — ${body.length} blocchi`);
