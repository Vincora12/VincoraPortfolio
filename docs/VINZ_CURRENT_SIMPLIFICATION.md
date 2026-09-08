# VINZ.MON — superficie quotidiana

«Apro VINZ e parlo.» Davanti resta poco, dietro resta tutto.

## Le tre sezioni quotidiane

| Sezione | Significato | Da dove vengono i dati |
|---|---|---|
| **CHAT** | Parlo con VINZ: una sola relazione continua | runtime chat esistente (`assistant-original`) |
| **ACT** | Quello che VINZ continua a fare nel tempo | `/api/calendar` — promemoria programmati reali |
| **FILES** | Il materiale che ho dato a VINZ | `/api/projects` — i file dello spazio GLOBAL |

Le tre sezioni stanno in alto, con un filetto sotto quella attiva. La barra in
basso è quella di sempre — CHAT · VINZ.MON · ME · SYNC — e non è cambiata:
dice in quale **area** sei, mentre le tre in alto dicono quale **sezione** della
superficie quotidiana stai guardando. ACT e FILES non compaiono in basso.

Codice: `src/daily/` (`DailySurface.tsx`, `ActPanel.tsx`, `FilesPanel.tsx`,
`daily.css`). `App.tsx` cambia in un punto solo: la chat viene avvolta dalla
superficie invece di essere montata da sola.

## CHAT — una sola relazione continua

Spariti dalla superficie quotidiana: schede delle conversazioni, «Nuova chat»,
switcher dei thread, elenco conversazioni, pannello Projects, sidebar.
Aprendo VINZ si torna sempre allo stesso filo.

**Non è stato toccato il context engine.** Una timeline continua per chi guarda
non vuol dire mandare tutta la cronologia al modello: finestra dei messaggi
recenti, sessioni tecniche, riassunti, recupero della memoria e persistenza
restano esattamente com'erano. È stata tolta la UI, non la gestione del
contesto.

I thread continuano a esistere nel runtime e sul server: nessuna conversazione
è stata cancellata, solo non c'è più un modo quotidiano per saltare da una
all'altra. La superficie completa (schede + Projects) resta montata nella
variante `embedded` della chat, quella che vive dentro il LAB: le conversazioni
vecchie si raggiungono da lì.

### La continuità mancava davvero, e non per colpa delle schede

🔴 «La chat non resta, se torno non vedo lo storico.»

`onThreadIdChange` salvava da sempre `active-thread`, ma **nessuno lo rileggeva**:
ogni apertura dell'app partiva da un thread NUOVO. Sul dispositivo di prova se ne
sono contati **18**, uno per avvio. Finché in cima c'erano le schede il difetto
era invisibile — la chat di ieri stava lì a un tocco — ma non era una relazione
continua: erano diciotto fili separati. Tolte le schede è venuto a galla.

`ResumeLastThread` (in `IntegratedChat.tsx`) riapre l'ultima conversazione.
Tre cose che sembrano dettagli e non lo sono:

1. **Il puntatore si legge all'import**, prima che il runtime monti: appena parte
   crea un thread nuovo e sovrascrive `active-thread`, quindi leggerlo dopo
   vorrebbe dire rileggere sempre la conversazione appena nata.
2. **Il flag «già fatto» sta nel modulo, non in un `useRef`**: cambiare thread fa
   rimontare tutto il sottoalbero del runtime, e un ref si azzererebbe — la
   ripresa ripartiva in cerchio creando un thread vuoto a ogni giro.
3. **Riprendere non è entrare in una stanza.** La riga «è entrato nella chat»
   viene inserita *importando* il repository esportato in quel momento: se scatta
   prima che `load()` abbia applicato lo storico, quel repository è vuoto,
   l'import lo sovrascrive e il gate viene marcato `live` — la cronologia già
   letta dal disco finisce buttata. La ripresa consuma l'ingresso di sessione
   (`claimSessionRoomEntry`) così la presenza non appende niente e lo storico
   arriva intero.

Verificato: mandato un messaggio, ricaricata la pagina, la stessa conversazione
riapre con quel messaggio e la sua risposta.

### I pulsanti di conferma

Quando VINZ sta per scrivere qualcosa nel registro, la domanda finale la scrive
**l'app**, non il modello (`brain/stream.ts` la aggiunge in coda quando esiste
uno stato «in attesa» tipizzato). È questo che rende affidabile il pulsante:
aggancia una frase letterale, non la prosa del giorno.

| Pulsante | Strumento | Domanda aggiunta dall'app |
|---|---|---|
| REGISTRA PASTO | `registra_pasto` | «Confermi che lo registro come **pranzo**?» |
| REGISTRA ALLENAMENTO | `registra_allenamento` | «Confermi che registro questo **allenamento** in ME?» |
| REGISTRA PESO | `registra_peso` | «Confermi che registro questo **peso** in ME?» |
| CREA PROMEMORIA | `programma_promemoria` | «Confermi che creo questo **promemoria**?» |
| CREA AUTOMAZIONE | `crea_automazione` | «Confermi che creo questa **automazione**?» |
| AGGIORNA PIANO | `imposta_piano_allenamento` | «Confermi che aggiorno il **piano di allenamento**?» |
| AGGIORNA DIETA | `imposta_dieta` | «Confermi che aggiorno la **dieta**?» |

Il tocco manda la conferma come messaggio utente, la stessa strada delle parole
scritte a mano che `confirms()` riconosce già: nessun percorso parallelo, nessuna
scrittura che salti il giro degli strumenti. Finché il sì non arriva, lo
strumento è **trattenuto** dal pool e il modello sa che non deve dire «fatto».

Due cose che sembrano dettagli e non lo sono:

- **Il promemoria prima si creava subito.** Adesso passa dalla conferma: un tocco
  in più, ma niente finisce in ACT senza che tu l'abbia visto.
- **«Imposta la dieta: colazione leggera, pranzo proteico…» finiva in «Confermi
  che lo registro come colazione?»**: `isMealLogIntent` vede i nomi dei pasti e
  non sa che la frase parla del piano. Un intento esplicito di dieta o di piano
  ora vince sul log del singolo pasto — la stessa precedenza che
  `isWorkoutLogIntent` applica già rispetto a `isWorkoutPlanIntent`.

Chi vuole aggiungerne un altro deve aggiungere **due** righe: la voce in
`CONFIRMABLE_ACTIONS` (`brain/stream.ts`) e quella in `CONFIRM_ACTIONS`
(`components/examples/chatgpt.tsx`). Senza stato in attesa niente pulsante: la
frase la scriverebbe il modello e il bottone comparirebbe a caso.

Restano **senza** pulsante, e apposta: le correzioni (`correggi_ultimo_*`, sono
già una richiesta esplicita), la memoria (`ricorda_di`, la cattura è ambientale),
artefatti e pagine (fuori dalla superficie quotidiana), aspetto e cambio
schermata (istantanei, reversibili, non scrivono nel registro).

## ACT — automazioni e promemoria

Due cose diverse, e la differenza è tutta qui:

| | Cosa fa | Ricorre? | Esegue? |
|---|---|---|---|
| **Automazione** | cerca sul web con la voce di VINZ e ti manda il risultato in chat | sì, ogni giorno a un'ora fissa | **sì** |
| **Promemoria** | ti dà una gomitata | no, una volta sola | no |

### Le automazioni (nuove)

Prima non esistevano, ed è per questo che «ogni mattina mandami le notizie» non
poteva funzionare: il promemoria del calendario è **monouso** (appena consegnato
scrive `reminderDelivery` e non scatta più) e non **esegue** niente — manda una
push generica, «Hai un promemoria da consultare», che non contiene nemmeno il
suo testo. Mancavano due cose diverse: la ricorrenza e l'esecuzione.

- **Motore:** `netlify/functions/_shared/automations.ts`. Gira sul battito che
  il Core aveva già per i promemoria (`runScheduler`, ogni 60 s): nessun secondo
  timer da tenere vivo.
- **Esecuzione:** `callProvider` con `webSearch: true` e il system prompt
  canonico (`loadCoreContext`), quindi l'automazione parla con l'identità e la
  persona vere, non con una voce neutra. La spesa passa da `checkCap` e
  `recordSpend` come tutto il resto — un'automazione quotidiana che sfonda il
  budget non se ne accorgerebbe da sola.
- **Consegna:** il runner lascia il risultato in una casella; è il **client**
  (`AutomationInbox` in `IntegratedChat.tsx`) a portarlo in chat come messaggio
  di VINZ, dalla stessa porta di tutti, `aui.thread.append`. Scriverlo dal server
  vorrebbe dire combattere con il gate dello storico e con la copia viva del
  repository che tiene il browser. L'ack arriva **dopo** l'append: se la pagina
  muore a metà il risultato resta in casella e arriva al giro dopo — meglio due
  volte che perso.
- **Cadenza concordata a voce.** Tre forme, campi tipizzati e non una stringa
  cron (nessuno vuole dedurre da cinque campi separati da spazi a che ora gli
  arriva la sveglia):
  - `ogni_giorno` — tutti i giorni a un'ora fissa;
  - `giorni_settimana` — «ogni lunedì e giovedì alle 9:30»;
  - `ogni_intervallo` — «ogni due ore», con **finestra oraria** opzionale
    («dalle 8 alle 20»). La finestra non è un lusso: senza, «ogni due ore»
    significa anche alle 3 di notte. Minimo 30 minuti.
- **Creazione parlando:** «Ogni due ore dalle 8 alle 20 controlla le novità» →
  VINZ riepiloga cadenza, finestra e fuso → pulsante `CREA AUTOMAZIONE` →
  compare in ACT. Lo strumento è `crea_automazione`.
- **La riga «Ogni giorno / Ultima / Prossima» adesso è vera**, perché il record
  la tiene davvero. Sui promemoria non compare: lì quei dati non esistono.

**Sola lettura, per scelta.** Un'automazione cerca e riferisce. Non registra
pasti, allenamenti, peso, piani o promemoria, e il prompt glielo dice. La
conferma esplicita che protegge quelle scritture non si aggira facendola fare a
un timer mentre dormi.

**Limiti dichiarati:** massimo 20 automazioni, 3 per tick, intervallo minimo 30
minuti. Non c'è il mensile («il primo del mese») e non si modifica un'automazione
esistente a voce: si mette in pausa o si elimina da ACT e si ricrea. Sul cambio dell'ora legale una singola esecuzione
può slittare di un'ora — niente libreria di fusi, si lavora sullo scarto che
`Intl` dichiara. Su un thread ancora non promosso la consegna aspetta il giro
successivo, perché l'append resterebbe appeso alla barriera di inizializzazione.

### I promemoria

Restano quelli di prima: `programma_promemoria`, una data, una push. Ora passano
dalla conferma come tutto il resto.

## FILES

Nessuna infrastruttura nuova: i file sono i `ProjectFile` dello spazio GLOBAL,
con le mutazioni `upload-files` e `remove-files` che il progetto già aveva.
Limiti del backend, non inventati qui: 5 MB per file, 40 file, 20 MB in tutto.
Elenco, caricamento (multiplo), eliminazione, tipo e peso. Niente cartelle,
niente Drive, niente dashboard.

**Limite dichiarato:** i file caricati **non** sono ancora leggibili dalla chat.
`buildProjectContext` porta al modello istruzioni e contesto del progetto, non i
file, e gli strumenti `leggi_progetto` / `leggi_sorgente_progetto` leggono il
testo importato e gli artefatti, non gli allegati. FILES oggi è il posto dove il
materiale sta e persiste; il collegamento alla chat è il passo successivo.

## LAB

Il LAB è il posto delle funzioni tecniche. Adesso ha cinque stanze:
CREATION, SYSTEM, AGENT e le due nuove.

### TRACE (`/lab/trace`)

Osservabilità, non prodotto quotidiano. Due viste: **SCAMBIO** (percorso della
risposta, esito, modello, persona, composizione del system, passi) e **LIVE
DEBUG** (lo stesso componente che SYSTEM.LAB già montava, non riscritto).

Il «NERD TERMINAL» che stava nel menu di ogni messaggio della chat è stato
tolto dalla superficie quotidiana.

**Bug preesistente corretto per far funzionare tutto questo:**
`persistChatTrace` scriveva con `If-Match: vinzmon-new`, che `user-data` legge
come un etag da confrontare — su una chiave nuova nessun confronto può riuscire,
quindi ogni salvataggio tornava 409 e **nessun trace è mai stato scritto** da
quando il runtime è passato al Local Core. Adesso usa `X-Only-If-New`, e in più
salva un puntatore `chat-trace:last`: serve perché il LAB è un documento a parte
e non condivide la memoria della pagina della chat.

### SKILLS (`/lab/skills`)

Due viste: **INSTALLED** e **STORE**.

- **Sorgente reale:** `anthropics/skills` su GitHub, formato SKILL.md. Il
  registro è un elenco (`SOURCES` in `netlify/functions/skills.ts`): aggiungere
  una sorgente è aggiungere una riga. VINZ non è accoppiato a un solo store.
- **Catalogo:** 19 skill reali con nome, descrizione, numero di file, peso e la
  bandiera «contiene script». Letto dal Mac, non dal browser; un solo colpo
  all'API di GitHub per l'albero completo, poi i SKILL.md da `raw`. Cache 30
  minuti.
- **Ispezione prima dell'installazione:** provenienza, link all'origine, peso,
  presenza di script, elenco completo dei file e il testo di SKILL.md.
- **Installazione reale:** i file vengono scaricati e scritti in
  `<data>/skills/<sorgente>__<id>/`, con `metadata.json`. Enable, disable e
  uninstall funzionano davvero.

**Modello di sicurezza:**

- Una skill nasce **spenta**. Accenderla è un gesto separato, dopo l'ispezione.
- **Niente viene eseguito.** Non esiste un runtime che lanci gli script di una
  skill, e questo endpoint non ne esegue nessuno: scarica e scrive, basta.
- Nessun permesso automatico: shell, filesystem, rete e segreti restano fuori.
- Si scarica solo dentro il percorso dichiarato dalla sorgente, solo id che
  passano `^[a-z0-9][a-z0-9-]{0,63}$`, con tetti su numero (40) e peso dei file
  (512 KB l'uno, 2 MB in tutto). Nessun proxy verso URL scelti dal client.
- L'endpoint richiede il token VINZ come ogni altra rotta; senza, 401.

**Limite dichiarato:** una skill installata e accesa **non entra ancora nel
prompt della chat**. SKILLS.LAB oggi le porta sul Mac e le governa; il
collegamento al runtime è il passo successivo, e finché non c'è, «attiva»
significa «marcata come attiva», non «in uso».

**Separazione:** SKILLS = come VINZ fa una cosa. MEMORY = cosa sa. IDENTITY =
chi è. TOOLS = cosa può usare. Nelle skill non finiscono dati personali, e
SKILL.md non è memoria utente.

## Cosa è stato tolto dalla superficie quotidiana

- schede delle conversazioni e «Nuova chat»
- switcher / elenco dei thread
- pannello Projects e sidebar della chat
- Artifacts come sezione quotidiana
- NERD TERMINAL (trace) dal menu dei messaggi

## Cosa è stato preservato

Dati e backend di Projects e Artifacts (nessuna cancellazione, nessuna
migrazione), thread e cronologia chat, MON, ME, SYNC, Persona e voce, memoria e
Mem0, meal e workout logging con la loro conferma esplicita, Calendar,
tool layer, Local Core, SQLite, launchd, Tailscale/HTTPS, bottom navigation,
LAB esistente, architettura Netlify.

## Limiti reali, in una lista

1. Le automazioni non si modificano a voce dopo la creazione: pausa o elimina da
   ACT e ricrea. Manca anche la cadenza mensile.
2. I file di FILES non sono ancora leggibili dalla chat.
3. Le skill installate non sono ancora collegate al prompt.
4. `isWorkoutLogIntent` è sensibile alla forma della frase: «Mi sono allenato
   oggi: 45 minuti di arrampicata» apre la conferma e registra; «Allenamento
   oggi: 45 minuti di arrampicata. Registralo.» no. È comportamento
   preesistente, non introdotto qui.
5. Le conversazioni nate prima di questa correzione restano diciotto fili
   separati: la superficie quotidiana ne riapre uno, gli altri si raggiungono
   dalla chat del LAB, che ha ancora le schede. Da qui in avanti il filo è uno.
6. La radice del dominio mostra il selettore di versione introdotto con
   Vinz.mon_v2: VINZ.MON current si apre da `#/current`. Se la priorità diventa
   «apro e parlo» senza passaggi, la radice va riportata su current lasciando V2
   su `#/v2` — una riga in `src/version/entry.ts`.
