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

## ACT — cosa è vero e cosa no

**È vero:** VINZ ha un solo tipo di attività programmata reale, il promemoria
del calendario. Lo scheduler del Local Core lo controlla ogni cinque minuti
(`reminder-tick`), lo consegna via push e ne registra l'esito. ACT mostra quelli:
titolo, quando, stato reale (Attivo / In attesa / Notifica inviata / Notifica non
inviata / Completato / Annullato) e la disattivazione, che spegne il promemoria
lasciando l'evento nel calendario.

**Non è vero, e infatti non c'è:** non esiste un motore di ricorrenze. Non
esistono «Daily», «Next run», cadenze o azioni che si ripetono da sole. Sono
informazioni che il backend non ha, quindi ACT non le mostra e non le inventa.

**Creazione dalla chat:** funziona, ed è reale — lo strumento
`programma_promemoria` (list/create/update/cancel) esiste già nel tool layer.
«Ricordami di controllare il preventivo domani alle 10» crea un ACT che compare
nell'elenco. Un ACT ricorrente («ogni mattina controlla…») **non** è
realizzabile oggi: servirebbe prima un motore di ricorrenze.

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

1. ACT non ha ricorrenze: solo attività a data fissa.
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
