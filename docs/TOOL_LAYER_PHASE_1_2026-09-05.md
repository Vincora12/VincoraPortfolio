# VINZ.MON TOOL LAYER — PHASE 1

Il primo confine condiviso di capacità tecniche di sola lettura: la chat
normale di VINZ.MON può ora ispezionare davvero il proprio repository, e
Agent.lab (fase futura) può riusare esattamente lo stesso confine invece di
possederne una copia propria.

## INSPECT — cosa esisteva già

- La chat normale esegue i propri strumenti **lato client**
  (`src/ai/tools.ts`: `TOOLS`, `runTool(use, ctx)`), sincrono, legato allo
  stato di gioco (`ToolContext` costruito da `state/store.ts`'s
  `runMonTool`). Il server (`/api/ai`) sceglie SOLO quali strumenti chiamare
  (function-calling del modello) — non li esegue mai: torna `toolUses` al
  client, che li esegue e rimanda indietro i risultati
  (`src/brain/stream.ts`'s `replyWithLocalTools`).
- `shouldUseLocalTools(text)` (una regex, `TOOL_INTENT`) decide SE entrare
  nel loop-strumenti; se non entra, la chat risponde senza nessuno strumento
  disponibile (percorso "BASE", `netlify-runtime.ts`).
- Un'ispezione di codice reale esisteva già, ma **esclusivamente dentro
  Agent.lab**: `netlify/functions/_shared/agentLabFiles.ts` (validazione dei
  percorsi, radici consentite, filtro delle estensioni — costruita e
  verificata per AGENT.LAB V1), usata da `netlify/functions/agent-lab.ts`
  (un loop agentico completo, pensato per una chat tecnica separata).
- Il repository arriva in produzione tramite `included_files` di
  `netlify.toml`: Netlify non lascia leggere il filesystem sorgente a una
  funzione per conto proprio — bisogna dichiarare esplicitamente quali file
  copiare dentro il pacchetto della funzione al deploy. Questo meccanismo,
  non un accesso live al repository, è l'unica fonte reale possibile in
  produzione.

## COSA MANCAVA

La chat normale non aveva NESSUN modo di guardare il proprio codice, e non
riconosceva nemmeno le domande tecniche come tali (`TOOL_INTENT` non
conosce vocabolario come "codice", "file", "funzione", "repository").
`runTool`/`replyWithLocalTools` erano inoltre **sincroni per costruzione**:
un'ispezione richiede una chiamata di rete, che una funzione sincrona non
può fare.

## IL TOOL LAYER — dove vive il confine condiviso

`src/ai/toolLayer.ts` — nuovo, indipendente dallo stato di gioco:

- `CODE_TOOL_DEFS: ToolDef[]` — le due capacità (`code_search`, `code_read`;
  chiamate concettualmente "code.search"/"code.read" nel task — il nome
  tecnico usa l'underscore perché molti fornitori di function-calling
  rifiutano un punto nel nome dello strumento).
- `runToolLayerTool(use): Promise<ToolResult | undefined>` — l'esecuzione:
  `undefined` per qualunque strumento che non gli appartiene (così chi
  chiama ricade sul proprio dispatcher esistente senza duplicare l'elenco
  dei nomi), altrimenti una chiamata a `/api/code-tools` e la formattazione
  del risultato in testo che il modello legge — mai un'eccezione, mai un
  contenuto inventato.

Questo file non conosce `ToolContext`, salute, pagine o aspetto: Agent.lab
potrà importarlo domani senza tirarsi dietro nessuno stato applicativo.

## ESECUZIONE — dove gira davvero

`netlify/functions/code-tools.ts` — nuova funzione, minima:

- Riusa `_shared/agentLabFiles.ts` (`searchProjectFiles`, `readProjectFile`)
  **senza duplicarne la logica** — stessa validazione di percorso, stessa
  lista di radici consentite (`src/`, `netlify/`, `docs/`, pochi file di
  root), stesso filtro di estensioni testuali di AGENT.LAB V1.
- Autenticata con lo stesso `VINZMON_TOKEN` di ogni altra funzione
  (`_shared/auth.ts`) — nessun secondo sistema di identità.
- `netlify.toml` dichiara `included_files` anche per questa funzione (stesso
  elenco di `agent-lab`), perché senza quello il pacchetto non avrebbe
  nessun file da leggere in produzione.
- Perché una funzione separata e non dentro `agent-lab.ts`: Agent.lab è un
  loop agentico completo (LLM + più round di strumenti). La chat normale ha
  bisogno solo di UNA chiamata diretta — cerca, oppure leggi — senza montare
  un secondo giro di modello per rispondere "quale file gestisce X".

## COME LA CHAT NORMALE LO USA

`src/brain/stream.ts`:

- `isCodeInspectionIntent(text)` — nuova regex, riconosce domande tecniche
  ("il tuo codice", "quale file", "dove viene gestito/usato/implementato",
  "esiste già una funzione per", "repository", ...). Aggiunta come OR dentro
  `shouldUseLocalTools`, così una domanda tecnica entra nel loop-strumenti
  invece di cadere nel percorso BASE (senza nessuno strumento).
- Dentro `replyWithLocalTools`, quando l'intento è tecnico (e NON anche di
  salute — la salute vince in caso di ambiguità reale), il pool di strumenti
  disponibili diventa **solo** `CODE_TOOL_DEFS` — mai mescolato agli altri
  20 strumenti, così l'ispezione resta "on demand": niente contesto di
  repository infilato in ogni conversazione.
- Il system prompt aggiunge, solo per quella richiesta, l'istruzione di
  onestà: usare `code_search`/`code_read` prima di rispondere, non
  affermare mai un percorso o un dettaglio implementativo non
  effettivamente recuperato tramite quegli strumenti.
- `run`/`runTool` (la catena `App.tsx` → `IntegratedChat` →
  `netlify-runtime.ts` → `stream.ts`) è stata allargata da sincrona ad
  "sincrona-o-Promise" (`ToolResult | Promise<ToolResult>`) — l'unico modo
  per far entrare una vera chiamata di rete in un meccanismo pensato per
  letture istantanee dallo stato locale. `App.tsx`'s `runChatTool` prova
  prima `runToolLayerTool` (Tool Layer) e SOLO se non è uno dei suoi
  strumenti ricade su `runMonTool` (stato di gioco) — `runMonTool` stesso
  resta identico, invariato, a zero rischio.

## SICUREZZA

- **Sola lettura assoluta**: nessuna funzione in `code-tools.ts` o
  `agentLabFiles.ts` scrive mai un file, esegue un comando, tocca git o crea
  un deploy. Non esiste un'API di scrittura in questi moduli — non è una
  promessa nel prompt, è l'assenza del codice che scriverebbe.
- **Traversal**: `resolveAllowedPath` (in `agentLabFiles.ts`, riusata) rifiuta
  ogni percorso con `..`, ogni percorso assoluto che esce dalla radice del
  repository, e ogni percorso fuori da `src/`, `netlify/`, `docs/` o dai
  pochi file di root consentiti.
- **Segreti**: `.env`, `secret`, `credential`, `.pem`, `.key`, `id_rsa` sono
  rifiutati per nome, in profondità — anche se non dovrebbero mai finire nel
  pacchetto della funzione. Il contenuto letto è sempre testo sorgente: dove
  il codice usa `process.env.X`, quello che si vede è il NOME della
  variabile, mai il valore (il valore vive solo nell'ambiente Netlify).
- **Stessa autenticazione di sempre**: `VINZMON_TOKEN`, lo stesso confine
  già in uso ovunque nell'app — nessun secondo sistema di identità, nessun
  ID scelto liberamente dal client.
- **Runtime Log limitato**: solo nome dello strumento, esito, durata,
  numero di risultati e il percorso richiesto (mai il contenuto) —
  `ALLOWED_META` in `_shared/runtimeLog.ts` scarta qualunque altro campo per
  costruzione, verificato con un test reale che ci prova a infilare un
  campo di contenuto e lo vede sparire.

## LIMITI — dichiarati, non nascosti

- **Le due capacità sono di sola lettura per scelta di Fase 1** — nessuna
  scrittura, modifica, commit o deploy è raggiungibile da questi strumenti,
  per nessuna via.
- **Riconoscimento dell'intento tecnico basato su regex**, non su
  comprensione semantica — copre le frasi indicate nel task e formulazioni
  simili, ma una domanda tecnica formulata in modo molto indiretto potrebbe
  non attivare il pool degli strumenti di codice (in quel caso la chat
  risponde come prima di questo task: dalla propria memoria, senza
  ispezione — non peggio di oggi, semplicemente non migliorato per quel
  caso specifico).
- **`code_search` è una ricerca testuale semplice** (case-insensitive,
  sottostringa), non un indice semantico — stessa limitazione già accettata
  per Agent.lab.
- **Correzione adiacente, non nuova a questo task**: `sanitizeRuntimeEvent`
  (`_shared/runtimeLog.ts`) validava lo scope `'agent-lab'` contro una
  lista che non lo includeva — ogni evento Agent.lab veniva scartato in
  silenzio dalla scrittura del 4 settembre. Corretto qui perché è la STESSA
  funzione che questo task usa per la propria osservabilità.

## AGENT.LAB — come riuserà questo

`agent-lab.ts` potrà, quando arriverà quella fase, chiamare
`CODE_TOOL_DEFS`/`runToolLayerTool` esattamente come fa oggi la chat
normale, oppure (essendo già server-side) importare direttamente
`_shared/agentLabFiles.ts` come fa già — in entrambi i casi, MAI una
seconda implementazione della validazione dei percorsi o del filtro delle
estensioni: quella vive in un unico posto (`_shared/agentLabFiles.ts`) da
prima di questo task, e continua a vivere lì.

## GAUNTLET — risultato sintetico

| # | Verifica | Esito |
|---|---|---|
| G1 | "Puoi leggere il tuo codice?" innesca uno strumento reale | PASS — `isCodeInspectionIntent`/`shouldUseLocalTools` verificati con le frasi esatte del task |
| G2 | "Dove viene gestito RISE?" trova un file reale | PASS — ricerca vera contro il filesystem reale, trova RISE in file veri (narrativeContext.ts, world.ts, ...) |
| G3 | code_read legge un file consentito | PASS — legge `src/engine/progression.ts`, contenuto verificato |
| G4 | Traversal (`../../etc/passwd`) rifiutato | PASS |
| G5 | Percorso assoluto rifiutato | PASS |
| G6 | Nessun segreto leggibile | PASS — `.env` rifiutato, nessun valore di token nella risposta |
| G7 | Fallimento onesto, mai inventato | PASS — zero risultati e file inesistente tornano messaggi espliciti |
| G8 | Chat ordinaria invariata | PASS — small talk non attiva nessuno strumento tecnico |
| G9 | Memoria/chat/salute/journey invariati | PASS — intera batteria di test adiacenti verde, comportamento salute non toccato |
| G10 | Runtime Log limitato, senza contenuto sorgente | PASS — verificato iniettando un campo di contenuto e vedendolo scartato |
| G11 | UI mobile/desktop invariata | PASS — verifica Playwright, nessuna differenza visiva |
| G12 | Produzione funziona davvero | Verificato meccanicamente (funzione deployata, dimensione del pacchetto coerente con un repository davvero incluso, confine auth vivo e verificato in produzione) — il giro autenticato completo (una vera domanda "puoi leggere il tuo codice?" in chat) richiede il token reale di produzione, che questa sessione non recupera deliberatamente (stessa scelta di sicurezza di AGENT.LAB V1/REMOTE CHAT HISTORY V1) |

## VALIDAZIONE

`npm run verify:tool-layer` — 39 asserzioni, tre livelli (intento, layer
client + handler server VERO contro il filesystem reale di questo
repository, confine HTTP), nessun mock che dica sempre "successo".
Typecheck, build, e l'intera batteria adiacente (assistant, chat-me,
backend, agent-lab\*, lab-layout, remote-chat-history\*, core-memory,
save-control, health-interpret, rest-day-sync, narrative-phase2, journey)
verdi. `verify:features`/`verify:lab` — stesso fallimento preesistente di
prima di questo task, confermato identico.
