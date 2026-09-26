# POC — Mem0 OSS + Ollama per VINZ.MON

**Data:** 2026-09-17 · **Ambiente:** isolato, `experiments/memory-poc/` · **Nessuna chiamata cloud a pagamento**

**Stato: NON completo.** Vedi ADDENDUM in fondo — la correzione ha un fix funzionante e verificato, ma memoria condivisa e continuità fra sessioni restano aperte. Nulla di questo file è integrato in produzione.

---

## A. STATO INIZIALE

| | |
|---|---|
| Repository | `Vincora12/VincoraPortfolio` |
| Branch | `codex/vinzmon-v2` (diversa da `claude/project-prototype-jxjc3d`, non cambiata) |
| HEAD | `e0aa64f` · 2026-09-12 |
| Working tree | 47 file (27 modificati + 20 non tracciati), **preesistenti**, non toccati da questo POC |
| Integrazione Mem0 preesistente | **Completa e mai eseguita**: `services/mem0/server.ts` (wrapper HTTP), `spike.ts` (test di fumo con isolamento per `userId`, persistenza), `server.test.ts`. Compilata (`dist/`), mai avviata in produzione |
| Backend attivo in produzione | `custom` (ME Model) — confermato da `/health` → `"memory":"custom-ready"` |

Nessun file reale è stato modificato. Verificato con hash MD5 di `data/mem0-*.sqlite` prima e dopo (**identici**) e `git status` (solo `experiments/` è nuovo).

---

## B. CONFIGURAZIONE POC

| Componente | Valore | Verificato come |
|---|---|---|
| `mem0ai` | 3.1.7, licenza Apache-2.0 | `services/mem0/node_modules/mem0ai/package.json` |
| Ollama | 0.33.3, già in esecuzione | `GET /api/version` |
| Modello generazione | `qwen2.5:14b` (14GB) | già installato, nessun download |
| Modello embedding | `nomic-embed-text` (768 dim) | già installato |
| Vector store | provider `"memory"` di mem0ai — **nome fuorviante**: è `better-sqlite3` reale su disco (`vectors` table: id, vector BLOB, payload TEXT) | letto il costruttore di `MemoryVectorStore`, `dist/oss/index.js:907-919` |
| History store | `sqlite` esplicito, file separato | `server.ts:11` |
| Storage scelto | **solo SQLite**, nessun servizio esterno (niente Qdrant/Chroma/Docker) | è l'unico provider fra quelli elencati in `VectorStoreFactory.create` (`index.js:14393-14440`) che non richiede un processo esterno |
| Percorsi dati | `experiments/memory-poc/data/mem0-{history,vectors}.sqlite` | isolati, mai `data/mem0-*.sqlite` del progetto |
| Codice riusato | `services/mem0/dist/server.js`, funzione `getMemory()` — **non modificato** | importato da `lib/setup.mjs` |

---

## C. RISULTATI

| Test | Esito | Prova |
|---|---|---|
| **A — Persistenza** | **PASS** | Processo 1 scrive "il mio gatto si chiama Pixel"; processo 2 (nuovo `node`, nessuna conversazione passata) lo ritrova cercando "Come si chiama il mio gatto?" — testo esatto presente nel risultato, non un 200 vuoto |
| **B — Correzione** | **FAIL** | Il secondo `add()` ("Atlas spostato a lunedì") ha prodotto evento `ADD`, non `UPDATE`: il fatto vecchio resta come ricordo indipendente. Peggio: in una ricerca semplice il fatto **superato** (venerdì, score 0.429) è ranked **sopra** quello **corretto** (lunedì, score 0.409) |
| **C — Isolamento fra Mon** | **PASS** | Segreto scritto per `agent_id=mon-a-private` non torna cercando con `agent_id=mon-b-private` (stesso `user_id`). **Scoperta aggiuntiva**: una memoria salvata SENZA `agentId` (destinata a essere "condivisa") **non torna** in nessuna ricerca filtrata per un `agent_id` specifico — verificato con `getAll`: il ricordo esiste nello store ma il filtro lo esclude sempre. `user_id`/`agent_id` sono un AND sui campi presenti, non un fallback |
| **D — Recupero semantico** | **PASS** | "Preferisco evitare i bar troppo turistici" trovato cercando "Che tipo di posto dovremmo scegliere per bere qualcosa?" — zero parole in comune |
| **E — Rumore** | **PASS** | Conversazione sintetica (saluti, un calcolo, ringraziamenti) → **zero** ricordi creati |
| **F — Cancellazione** | **PASS**, con riserva documentata | Il ricordo sparisce dalla ricerca attiva dopo `delete()`. Ma `m.history(id)` resta interrogabile e contiene il **testo in chiaro** del ricordo cancellato (`previous_value: "User's shoe size is 42.5"`, `is_deleted: 1`) in un file SQLite separato (`mem0-history.sqlite`) — è un registro di controllo, non un secondo indice ricercabile, ma il contenuto non sparisce dal disco |
| **G — Indipendenza dal modello** | **PASS** | Nuovo processo, `MEM0_LLM_MODEL=gpt-oss:20b` (diverso da quello usato in scrittura), stesso storage: ricordo trovato lo stesso. **Non è solo una scoperta empirica**: confermato nel sorgente che `search()` non chiama mai l'LLM (`index.js:17846-17910`, usa solo embedder + vector store) |
| **H — Backup e ripristino** | **PASS** | Storage reale = **2 file separati** (history + vettori) — copiarne uno solo avrebbe perso dati. Copiati entrambi, ripristinati in cartella pulita, nuovo processo: ricordo trovato |

**7 PASS su 8 test funzionali. 1 FAIL documentato (correzione).**

---

## D. PRESTAZIONI

**Hardware:** Mac, 10 core CPU, 24 GB RAM. **Modelli:** qwen2.5:14b (generazione), nomic-embed-text (embedding), entrambi su GPU locale (`ollama ps`: 100% GPU). **Campione: 1 misurazione per scenario — non una media.** Questo è il limite principale della sezione: numeri singoli, non statistiche.

| Operazione | Tempo | Condizione |
|---|---|---|
| `add()` — **a freddo** (primo caricamento del modello 14GB in GPU) | **50.313 s** | Test A1, prima chiamata della sessione |
| `add()` — a caldo (modello già in GPU) | 1,6 – 7,2 s (osservato su 5 chiamate: 1558, 3773, 3788, 5743, 7182 ms) | Test B, D, E e verifica dedicata |
| `search()` | 0,15 – 0,65 s (osservato su 6 chiamate) | Non chiama l'LLM: solo embedder + query SQLite |
| `delete()` | incluso nel ciclo di Test F, non isolato | — |

**Perché la variazione 1,6–7,2 s sull'`add()` a caldo**: non misurato a fondo — dipende probabilmente dalla lunghezza del testo/messaggi passati (il test E, rumore, con 6 messaggi ma zero estrazioni, è il più veloce; il test B, con due frasi su un evento con data, il più lento). **NON VERIFICATO** come causa esatta: servirebbe un campione più grande a parità di lunghezza input.

**RAM:** processo `llama-server` di Ollama con qwen2.5:14b caricato: **14,3 GB RSS** osservato con `ps aux` durante i test. Il processo Node del POC non è stato misurato separatamente (limite dichiarato).

**Impatto su una chat interattiva durante l'elaborazione:** **NON VERIFICATO**. Non è stato eseguito un test di chat simultanea a un `add()` in corso — richiederebbe orchestrare due processi in parallelo e misurare la latenza percepita dell'uno mentre l'altro gira, non fatto in questo giro. Quello che *è* verificato: 14,3 GB di RAM occupati stabilmente dal modello di generazione durante l'estrazione è una cifra che **compete** con qualunque altro modello locale (es. Hermes, se usa Ollama) in esecuzione nello stesso momento sulla stessa GPU — non dimostra rallentamento, dimostra contesa possibile.

---

## E. CONFRONTO CON IL BACKEND CUSTOM

Il backend custom **non è stato modificato per competere**, come richiesto. Il confronto è quindi asimmetrico: Mem0 testato dal vivo, custom valutato sui dati già raccolti nell'audit precedente (store `me-model-v1` **assente** dal database di produzione).

| Aspetto | Mem0 OSS + Ollama (testato ora) | Backend custom (da audit precedente) |
|---|---|---|
| Scrittura | Funziona, verificata | **Mai avvenuta**: store vuoto, nessun evento di spesa nel registro |
| Recupero | Semantico reale (Test D), via embedding | Grep per parole letterali (`filterByQuery`, `core/memory.ts:128`) |
| Correzione | **FAIL** — crea un secondo ricordo, non aggiorna | Non testabile: nessun dato. Ma il modello dati custom ha `validFrom`/`validTo`/sostituzione esplicita **progettati apposta** — un concetto che Mem0 OSS in questa configurazione non dimostra di avere |
| Isolamento Mon | **Nativo** (`agent_id`), verificato | Nessun concetto equivalente nello schema custom — tutto è per-utente |
| Cancellazione | Sparisce dalla ricerca, resta in un log di controllo separato | Non verificato |
| Dipendenze | Ollama (già presente), `better-sqlite3` (già compilato) | Nessuna nuova |
| Backup | 2 file SQLite | 1 file SQLite (`vinzmon.sqlite`, tabella unica) — **più semplice** |
| Telemetria esterna | **Presente di default**, disattivabile (vedi sezione F) | Nessuna (tutto passa dai provider AI già scelti dal progetto) |
| Maturità del codice di integrazione | Wrapper HTTP scritto e testato con uno spike, mai collegato al runtime VINZ.MON | Collegato al runtime, mai popolato |

**Conclusione onesta di questa sezione**: Mem0 OSS **funziona meglio di quanto il backend custom stia facendo oggi**, semplicemente perché il custom non sta facendo nulla. Non è una prova che Mem0 sia architettonicamente superiore al design del custom — è una prova che il custom, **spento**, perde a chiunque sia acceso.

---

## F. RISCHI

1. **Telemetria esterna attiva di default** — **verificato concretamente**, non assunto. Durante il primo `add()` di questo POC, `lsof` ha mostrato una connessione TCP stabilita verso `3.41.202.157:443` (AWS, reverse DNS su `amazonaws.com`), corrispondente a `https://us.i.posthog.com/i/v0/e/` — endpoint e chiave di progetto **fissi nel pacchetto** (`dist/oss/index.js:14768-14769`). Disattivabile con `MEM0_TELEMETRY=false` (variabile letta alla riga 14766) — **verificato di nuovo con `lsof` dopo la correzione: zero connessioni non-loopback**. Qualunque integrazione futura DEVE impostare questa variabile esplicitamente; il default del pacchetto non lo fa.
2. **Correzione dei fatti non affidabile** (Test B) — se usato oggi per "chi sei ora", rischia di presentare informazioni superate come più rilevanti di quelle correnti.
3. **Perdita silenziosa di "memoria condivisa"** (Test C) — se VINZ.MON avesse fatti a livello utente (non legati a un Mon) e li cercasse sempre con un filtro `agent_id`, quei fatti diventerebbero invisibili senza errore.
4. **Cancellazione non totale** — il testo resta nello storico dopo `delete()`. Rilevante se un giorno servisse una cancellazione "vera" (richiesta dell'utente, revoca di un consenso).
5. **Duplicazione della memoria con Hermes** — non testato qui (fuori perimetro dichiarato), ma il rischio architetturale resta: Hermes ha la propria sessione/trascrizione; se anche Mem0 estraesse fatti dalle stesse conversazioni, due sistemi indipendenti scriverebbero interpretazioni potenzialmente diverse dello stesso evento.
6. **Costo in tempo del primo avvio**: 50 secondi di attesa a freddo per il primo `add()` della sessione. Se il modello di generazione mem0 scarica dalla GPU dopo inattività (osservato: TTL di pochi minuti in `ollama ps`), questo costo si ripete a ogni ripresa dopo una pausa.
7. **Dipendenze del pacchetto non auditate oltre `better-sqlite3` e `ollama`** — `mem0ai` è un pacchetto grande (supporta decine di provider cloud mai usati qui); non è stato fatto un audit delle sue dipendenze transitive.

---

## G. DECISIONE TECNICA

## **GO CON RISERVE**

Mem0 OSS + Ollama **supera** i criteri di persistenza, isolamento, recupero semantico, assenza di falsi positivi, indipendenza dal modello di generazione e backup/ripristino — tutti verificati con prove concrete, non con l'avvio dell'SDK. Il costo in tempo e RAM è reale ma compatibile con un uso non sincrono (esattamente il modello "background" già adottato stanotte per la chat).

**Non è un GO pieno per tre motivi verificati, non ipotetici:**
1. La correzione dei fatti **non funziona** nella configurazione di default (Test B) — e per un'AI che deve "sapere come sei cambiato", è l'esatto meccanismo che serve.
2. La memoria "condivisa fra Mon" **sparisce silenziosamente** se non gestita esplicitamente (Test C) — un pattern d'uso plausibile per VINZ.MON (identità dell'utente, non del singolo Mon) rischia di non funzionare mai senza che nessuno se ne accorga.
3. La telemetria esterna è attiva di default — non bloccante (si disattiva con una riga), ma **deve** essere verificata a ogni upgrade del pacchetto, non solo impostata una volta.

Nessuno di questi tre è un problema di infrastruttura locale — sono tutti comportamenti della libreria stessa, riproducibili, non legati a Ollama o a questo Mac.

---

## H. PROSSIMO INTERVENTO MINIMO (se si procede)

**Non ancora implementato.** Se la direzione viene confermata, l'integrazione graduale più piccola e corretta è:

1. **Impostare `MEM0_TELEMETRY=false`** in `services/mem0/server.ts` (una riga, prima di ogni altra modifica) — indipendentemente da qualunque altra decisione.
2. **Estendere `services/mem0/server.ts`** per accettare `agentId` in `/memory/add` e `/memory/search` (oggi solo `userId` — vedi `server.ts:22`) — necessario per usare l'isolamento per Mon già dimostrato qui.
3. **Verificare la correzione con un prompt diverso** prima di fidarsene: passare `add()` messaggi come conversazione (`{role,content}[]` con entrambe le frasi nello stesso turno) invece di due chiamate separate, e ripetere il Test B — non è stato provato in questo POC e potrebbe cambiare l'esito.
4. **Decidere esplicitamente** se le ricerche di VINZ.MON devono includere anche la memoria "a livello utente" oltre a quella del Mon attivo (due chiamate `search()` da unire) — oggi non succede da sola.
5. Solo dopo 1-4: collegare `searchPersonalMemory`/`writePersonalMemory` (`netlify/functions/_shared/core/memory.ts`) al backend `mem0`, che **esiste già come opzione** (`memoryBackendMode()`) ma non è mai stato verificato funzionante fino a questo POC.

**File da toccare, quando si deciderà di procedere (non ora):**
- `services/mem0/server.ts` — telemetria, `agentId`
- `netlify/functions/_shared/core/memory.ts` — già pronto a ricevere `mem0` come backend, nessuna modifica strutturale prevista
- `.env` — `VINZMON_MEMORY_WRITER_MODE=mem0`, `MEM0_LLM_PROVIDER=ollama`, ecc. (mai attivato in produzione oggi)

Il backend custom **non va rimosso**. Resta il proprietario di identità, DNA ed evoluzioni, come richiesto.

---

## ADDENDUM — riuso nativo prima di implementare (2026-09-17, stessa giornata)

Richiesta: verificare se la correzione si risolve con operazioni native di
Mem0 (update/metadata/filtri) invece di un secondo sistema di
versionamento, implementare solo ciò che manca davvero, garantire
atomicità, e non integrare in produzione se un salvataggio blocca la
risposta.

### Causa esatta del FAIL di Test B — letta nel sorgente, non ipotizzata

`mem0ai` 3.1.7 (la versione installata) **non usa più** il vecchio modello
"confronta col fatto esistente e decidi ADD/UPDATE/DELETE". `add()` ora è
puramente additivo: `ADDITIVE_EXTRACTION_PROMPT` dice letteralmente
all'LLM *"Your sole operation is ADD"* (`node_modules/mem0ai/dist/oss/index.js:5509`).

Ma l'LLM **sa** riconoscere una correzione: lo schema di estrazione ha un
campo `linked_memory_ids` con l'istruzione esplicita di collegare un fatto
nuovo quando è *"updated/shifted preference"* di uno esistente
(`index.js:5996`, `index.js:5547`). Il problema è che quel collegamento
viene **calcolato e poi scartato**: `addToVectorStore` costruisce la riga
da salvare senza mai leggere `linked_memory_ids` (`index.js:17608-17612`),
e il valore restituito da `add()` ha `event` scritto letteralmente come la
stringa fissa `"ADD"` per ogni riga (`index.js:17805-17809`) — non è un
flag di configurazione mancante, è così nel codice compilato.

**Risposta alla domanda posta: NO, non è risolvibile con la sola
configurazione nativa** — perché il segnale necessario non arriva mai
all'API pubblica di `add()`. **È risolvibile con operazioni native
(`search()` + `update()`), senza un secondo archivio**, rifacendo — fuori
dalla libreria — il solo pezzo di decisione che la libreria butta via.

### Cosa è stato implementato — `lib/correctionAdapter.mjs`

`upsertPersonalMemory(mem, {userId, agentId, text, ...})`:

1. `mem.add()` nativo (estrazione/normalizzazione invariate).
2. `mem.search()` nativo per il candidato più simile nello stesso ambito
   (stesso `agent_id`), soglia di score **0.35** — vedi limite sotto.
3. **Un'unica chiamata locale a Ollama** (stesso modello già configurato,
   nessun servizio nuovo) per decidere se è davvero una correzione — è il
   solo pezzo di logica che non esiste già in Mem0 in questa versione.
4. Se sì: `mem.update()` nativo sulla riga **vecchia**, poi `mem.delete()`
   della riga doppia che `add()` aveva appena creato.

Nessuna tabella nuova, nessun indice parallelo, nessuna modifica a
`mem0ai` o a `services/mem0/`.

### Verifica end-to-end (Test I) — PASS

Stesso scenario del Test B, stavolta via l'adapter: "Atlas venerdì" poi
"Atlas spostato a lunedì". Risultato: **una sola riga attiva**
("...rescheduled to launch on Monday, September 21, 2026"), venerdì
sparito dalla ricerca. `results/test-i-correction-adapter.json`.

**Controllo negativo** (non nel protocollo originale, aggiunto perché
necessario): due fatti scollegati ma sullo stesso "argomento" testuale
("progetto Atlas" / "progetto Borealis") — l'adapter li ha tenuti
**entrambi attivi**, nessuna fusione errata. Score sotto soglia, il giudice
Ollama non è nemmeno stato interpellato.

**Limite dichiarato, non nascosto**: la soglia 0.35 e il controllo
negativo si basano su **tre casi totali**. Non è un valore validato su
scala — è il minimo per dimostrare che il meccanismo funziona e non fonde
alla cieca. Prima di un uso reale servirebbe un campione più largo.

### Atomicità — letta in `updateMemory()`, non assunta

`mem.update()` esegue: 1) UNA istruzione SQL (`UPDATE vectors SET
vector=?, payload=? WHERE id=?`, `index.js:1191`) sulla riga esistente —
atomica per garanzia di SQLite, prima o dopo, mai a metà; 2) una scrittura
**separata**, su un **file SQLite diverso** (lo storico), senza una
transazione che unisca le due (`index.js:18323-18349`).

**Cosa può davvero succedere se il processo si interrompe:**
- Fra il passo 1 e il passo 2 → la ricerca mostra già il fatto nuovo, ma
  lo storico non registra l'evento. Rischio reale, ma innocuo per la
  chat: nessuno vede un fatto sbagliato.
- Fra `update()` (passo 4 dell'adapter) e il successivo `delete()` della
  riga doppia → **nella peggiore delle ipotesi restano due copie dello
  STESSO fatto corretto** (mai una vecchia e una nuova in conflitto — è
  per questo che l'ordine è update-poi-delete, e non il contrario).

**Non garantito, dichiarato esplicitamente**: se il processo si
interrompe fra il passo 2 (`add()` crea la riga doppia) e il passo 4
(`update()`+`delete()`), la riga doppia resta agli atti come ricordo
indipendente — non conflittuale, ma non ripulita. Nessun meccanismo di
recupero automatico per questo caso specifico è stato costruito: fuori
perimetro di questo POC.

### Blocco della risposta — verificato sul codice reale, non sul POC

Il timore (giustificato: `add()` misura fino a 50 s a freddo) è che
integrare Mem0 blocchi la chat. Verificato dove tocca davvero il flusso
di produzione:

- **Scrittura** — `captureChatMemoryForClient` è chiamata con `void`
  (mai attesa) in [`netlify-runtime.ts:1119`](../../src/assistant-original/netlify-runtime.ts). Il ramo lento
  (`add()`, 1,6-50 s con Mem0) **è già** fuori dal percorso sincrono della
  risposta — non per una modifica fatta oggi, era già così.
- **Lettura** — `resolveChatContext` **è** atteso in modo sincrono, riga
  [`netlify-runtime.ts:1123`](../../src/assistant-original/netlify-runtime.ts), prima di costruire la risposta.
  Ma è la `search()`, misurata **150-650 ms** in questo POC (mai chiama
  l'LLM, vedi Test G) — non il ramo lento.

**Conclusione verificata**: il punto che preoccupa (50 secondi) è la
scrittura, ed è già strutturalmente non-bloccante nel codice attuale. Il
punto sincrono (lettura) è già veloce coi dati misurati qui. **Questo non
è un via libera all'integrazione** — nessun file di produzione è stato
toccato, `VINZMON_MEMORY_WRITER_MODE` resta `custom` — è la risposta alla
domanda "dov'è il punto minimo", non l'attivazione di quel punto.

### Memory V1 — NON dichiarata completa

Per istruzione esplicita, e perché è vero:
- **Correzione**: risolta con un meccanismo nativo, verificata end-to-end
  **nel POC**. Mai eseguita nel flusso reale di VINZ.MON.
- **Memoria condivisa fra Mon** (Test C): gap ancora aperto, nessun fix
  costruito in questo giro.
- **Continuità fra sessioni**: mai testata end-to-end nel flusso reale —
  solo dentro l'ambiente isolato del POC.

Restano da fare, in quest'ordine, prima di poter chiamare qualunque cosa
"Memory V1": (1) memoria condivisa, (2) continuità in produzione, (3)
integrazione vera dietro un interruttore spento di default.
