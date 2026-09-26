# Memory V1 — Integrazione locale definitiva

**Data:** 2026-09-17 · **Sessione:** continuazione diretta del POC (`experiments/memory-poc/`)

**Verdetto: READY BEHIND FEATURE FLAG**

---

## A. Stato Git iniziale

| | |
|---|---|
| Repository | `Vincora12/VincoraPortfolio` |
| Branch | `codex/vinzmon-v2` (invariata, mai cambiata) |
| HEAD di partenza | `e0aa64f` · 2026-09-12 |
| Working tree | 48 percorsi non committati, tutti preesistenti da lavoro di stasera precedente a questo compito — nessuno toccato o perso |
| Server locale reale | in esecuzione, backend `custom`, mai riavviato durante questo lavoro |

Nessuna operazione distruttiva (`reset`/`clean`/`checkout` forzato/`stash`) eseguita.

---

## B. File modificati

**Nuovi:**
- `services/mem0/correctionAdapter.ts` — porting TS del POC (search+giudizio Ollama+update nativo, mutex FIFO per ambito)
- `netlify/functions/_shared/memoryV1.ts` — flag/guard, cattura idempotente, ripresa dopo riavvio, merge USER+MON
- `scripts/memory-v1-check.mjs` — test end-to-end sui moduli reali, storage isolato

**Modificati:**
- `services/mem0/server.ts` — `agentId` su add/search, endpoint `/memory/upsert`, `MEM0_TELEMETRY=false` alla sorgente
- `netlify/functions/_shared/mem0MemoryClient.ts` — `agentId` passthrough, nuova `upsertMem0()`, `agentId` preservato nei risultati di ricerca (necessario per il fix di isolamento, sezione E)
- `netlify/functions/_shared/core/memory.ts` — il ramo `'mem0'` di `writePersonalMemory`/`searchPersonalMemory` passa da Memory V1
- `server/core-server.ts` — guard contro il ripiego cloud silenzioso, scheduler esistente riprende le catture interrotte. **Contiene anche**, nello stesso file, modifiche di un lavoro precedente di stasera (chat in background) non toccate né rimosse — commit disclosurato esplicitamente
- `scripts/core-memory-check.mjs` — isolamento `VINZMON_DATA_DIR` (mancava, scritto nel db reale — vedi sezione E), più 5 controlli nuovi per Memory V1

**Non toccati, come richiesto:** Hermes, Voice DNA, evoluzioni, Narrative System, World, REFLECTION/ME/Me.mon, routing generale dei modelli. Nessun nuovo framework installato. Nessuna migrazione di ricordi reali.

---

## C. Come funziona il merge USER/MON/RELATIONSHIP

Mem0 ha solo tre dimensioni di scope native: `user_id`, `agent_id`, `run_id`. Lo schema usato:

- **USER globale** — scritto/cercato senza `agentId` (nessun mon attivo al momento della cattura)
- **MON privata + RELAZIONE** — scritto/cercato con `agentId = nome del mon attivo`, letto dallo stesso identificativo canonico che `coreContext.ts` già usava (`state.activeMonName`), non un secondo concetto. **Coincidono nello schema attuale**: l'unico scrittore per-mon è la cattura dalla chat, per natura relazionale — dichiarato esplicitamente in codice, non presentato come una separazione che non esiste.
- **PROGETTO** — parametro presente nella firma, **non collegato a nessun punto di chiamata reale**: l'autorizzazione per-progetto non è stata verificata in questo giro, e collegarla senza quella verifica avrebbe rischiato esattamente lo scope ambiguo che il punto 3 del compito vietava.

**Il merge** (`searchScopedPersonalMemory`): due ricerche native separate (USER e MON), unite in codice — non una singola query Mem0, perché **una ricerca con solo `user_id` non esclude i ricordi privati degli altri mon** (trovato con un test reale, sezione E). Il merge poi: filtra i nodi-entità (`entityType`), deduplica per testo normalizzato, ordina per punteggio, applica un budget in caratteri (1500 default — stessa convenzione di `LIMITS.userChars` in `ai.ts`, non un vero tokenizer).

---

## D. Interruzioni, retry e concorrenza

**Cattura resistente ai riavvii**: prima di chiamare Mem0, si scrive un record in `getStore('vinzmon-memory-v1-jobs')` (stesso SQLite già usato per `vinzmon-evolution`), chiave derivata da `messageId` (stabile, già esistente — nessun nuovo identificativo). Un secondo tentativo con lo stesso `messageId` trova il lavoro già fatto (skip) o lo riprende se rimasto a metà oltre 3 minuti (il triplo del caso più lento osservato, 50,3s a freddo). Nessuna transazione SQLite resta aperta durante la chiamata a Ollama — ogni scrittura di stato è una singola istruzione `setJSON`, già tornata prima della chiamata lenta.

**Concorrenza search→giudizio→update**: mutex FIFO in-processo, per ambito (`userId::agentId`), dentro `services/mem0/correctionAdapter.ts`. Le richieste si accodano nell'ordine di ARRIVO, non di completamento — quindi una elaborazione più vecchia non può scavalcare una più recente indipendentemente da quale delle due chiamate a Ollama risponde più lentamente. **Limite dichiarato**: il mutex vive in memoria di UN processo Node. Corretto per l'architettura di oggi (Local Core Server ne avvia esattamente uno), non per un'eventuale futura replica su più processi.

**Guasto Ollama**: nessun fallback cloud automatico — `startLocalMem0()` ora rifiuta esplicitamente di partire se `MEM0_LLM_PROVIDER`/`MEM0_EMBEDDER_PROVIDER` non sono `ollama` (prima poteva passare silenziosamente la vera `OPENAI_API_KEY` al servizio — trovato durante questa integrazione, corretto).

---

## E. Risultati dei test — con prove concrete

Tutti eseguiti su storage isolato (`/tmp/memv1-check/`, mai `data/vinzmon.sqlite` reale), servizio Mem0 dedicato su porta separata (8798), dati sintetici. Script: `scripts/memory-v1-check.mjs`, eseguibile di nuovo in qualunque momento.

| Test | Esito | Prova |
|---|---|---|
| **A — Memoria condivisa** | **PASS** | MON_A recupera sia il fatto USER (Roma) sia il proprio privato; MON_B recupera Roma ma NON il privato di MON_A |
| **B — Isolamento** | **PASS** | Una ricerca senza `agentId` non vede il privato di nessun mon |
| **C — Correzione** | **PASS** | Atlas venerdì→lunedì: la ricerca restituisce solo il valore corrente, il vecchio non è più presente |
| **D — Concorrenza** | **PASS** | Due correzioni simultanee sullo stesso fatto: nessuna riga afferma il valore vecchio come attuale, nessun errore mascherato da successo |
| **E — Interruzione** | **NON eseguito come kill di processo reale** — verificato per costruzione (job idempotente per messageId, ripreso dallo scheduler) ma non con un vero `kill -9` a metà scrittura in questo giro |
| **F — Retry** | **PASS** | Un secondo tentativo con lo stesso `messageId` non richiama Mem0 (`warnings: ["memory v1: already_done"]`), verificato con `lastMem0Path === undefined` |
| **G — Nuova sessione** | **PASS** | Fatto recuperato da una ricerca senza rimandare alcuna conversazione |
| **H — Filtraggio** | **PASS** | Nessun nodo-entità nei risultati scoped |
| **I — Prestazioni** | Vedi sezione F sotto |
| **Guard privacy/cloud** | **PASS** | Senza `MEM0_LLM_PROVIDER=ollama`, la scrittura rifiuta esplicitamente (`assertMemoryV1Ready` lancia) |
| **Rete** | **PASS** | `lsof` durante una scrittura reale: solo connessioni verso `127.0.0.1:8798` (l'istanza di prova), nessuna esterna |

### Un bug trovato e corretto DURANTE questa integrazione (non nel POC)

Una ricerca Mem0 filtrata per `{user_id}` soltanto **non significa "solo ricordi senza agent_id"** — significa "non controllare affatto l'agent_id", quindi restituiva ANCHE i ricordi privati di ogni mon. Nella prima versione di `searchScopedPersonalMemory`, MON_B recuperava correttamente il fatto USER ma **anche** il fatto privato di MON_A attraverso la gamba "USER" del merge. Trovato con il test A reale (non ipotizzato), corretto filtrando lato applicazione (`!row.agentId`) usando un campo che ho dovuto aggiungere al ritorno di `searchMem0` per poterlo controllare. Riverificato dopo il fix: PASS pulito.

### Un secondo problema preesistente, scoperto per necessità

`scripts/core-memory-check.mjs` non isolava mai `VINZMON_DATA_DIR`: la modalità 'custom' scrive nel registro di spesa reale (`getStore('vinzmon-spend')`) tramite `recordSpend`, e senza isolamento quella scrittura finiva davvero in `data/vinzmon.sqlite` — verificato empiricamente (mtime del WAL file cambiato dopo una chiamata di prova). Non introdotto da me, ma dovevo toccare questo file comunque: corretto isolando `VINZMON_DATA_DIR` in cima allo script, riverificato che il WAL reale resta invariato dopo il run.

---

## F. Prestazioni (dati reali, non nuovi rispetto al POC)

Nessuna nuova misurazione sistematica in questo turno — i numeri restano quelli del POC (`experiments/memory-poc/REPORT.md`, sezione D), confermati coerenti nei nuovi test: `add()` 1,6–50s (freddo/caldo), `search()` 150–650ms. **Punto I del compito ("misura la latenza della chat con memoria disattivata, recupero attivo e consolidamento in corso") NON eseguito con la chat reale** — richiederebbe accendere il flag sul server che serve davvero l'app, vedi sezione H.

---

## G. Stato del feature flag

**SPENTO.** `VINZMON_MEMORY_WRITER_MODE` non è impostato in `.env` — verificato di nuovo alla fine di questo lavoro (`grep` restituisce 0 righe). Il server reale, in esecuzione per tutta questa sessione, riporta ancora `"memory":"custom-ready"`. Nessun comportamento dell'app cambia per effetto di questo commit finché quella variabile non viene impostata a mano.

---

## H. Stato di commit, push, deploy

- **Commit**: fatto, `a78bc1e`, branch `codex/vinzmon-v2` (invariata). Selettivo: solo i file di Memory V1 + il POC citato nei commenti del nuovo codice — le ~25 modifiche preesistenti di stasera (chat in background, UI, service worker) restano deliberatamente fuori, intatte, non toccate.
- **Push**: **non eseguito**. La branch non ha un upstream remoto configurato — sarebbe la prima pubblicazione di questa branch su GitHub, un'azione più grande di un push ordinario a una branch già tracciata. Non l'ho eseguita senza una conferma esplicita per questo passo specifico.
- **Deploy**: **non eseguito**, e non tentato. Il sito/servizio reale che l'utente usa dal telefono è il Local Core Server già in esecuzione, mai riavviato in questo lavoro — resta esattamente com'era.

---

## I. Problemi residui

1. **Test end-to-end nella chat reale (sezione 9 del compito): NON ESEGUITO.** Richiederebbe accendere il flag sul processo che serve davvero l'app dal telefono e riavviarlo — lo stesso tipo di azione che stanotte ha già causato un'interruzione reale del servizio. Lasciato fuori per prudenza esplicita, come il compito stesso permette ("se non puoi eseguire questo test in sicurezza... indica NON ESEGUITO").
2. **Test E (interruzione con kill reale del processo): non eseguito come kill effettivo**, solo verificato per costruzione.
3. **La correzione non incatena affidabilmente più di due versioni ravvicinate dello stesso fatto** (già noto dal POC, riconfermato nel test di concorrenza: due correzioni quasi simultanee sono rimaste due righe distinte, nessuna delle due false come valore attuale, ma nemmeno fuse in una sola).
4. **`memory-reset.ts` non ripulisce i record di `vinzmon-memory-v1-jobs`** — innocuo (sono solo marcatori di idempotenza per messageId ormai non più riusabili), ma non completo.
5. **Il mutex di concorrenza è per-processo** — corretto per l'architettura di oggi, da rivedere se mai si aggiungesse un secondo processo mem0.
6. **`PROJECT` non è collegato** a nessuna autorizzazione reale — deliberatamente, vedi sezione C.

---

## J. Conclusione

**READY BEHIND FEATURE FLAG.**

Non READY FOR CONTROLLED USE: il test end-to-end nella chat reale non è stato eseguito, e senza quello non posso dire con certezza cosa succede quando un utente vero, nell'app vera, chiede una correzione — solo che i meccanismi sotto sono stati verificati uno per uno, con prove, su storage isolato.

Non NEEDS FIXES: non ci sono difetti aperti che blocchino l'attivazione controllata — i due bug trovati durante questa integrazione (isolamento USER/MON, test che scriveva nel DB reale) sono stati corretti e riverificati nello stesso turno.

Non BLOCKED: niente ha impedito di completare il lavoro nel suo perimetro — la scelta di non eseguire il test end-to-end reale è stata una scelta di prudenza, non un limite tecnico o ambientale.
