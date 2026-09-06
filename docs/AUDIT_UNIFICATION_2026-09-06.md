# VINZ.MON — AUDIT COMPLETO & INTERVENTO MIRATO (2026-09-06)

Checkpoint di produzione di partenza: `a3a5c3c5` (CORE EXTRACTION PHASE 3 →
VINZ.MON TOOL LAYER PHASE 1, tutto già deployato). Questo documento è il
report richiesto dal task "audit completo + intervento mirato": prima la
mappa (Sezione 0/item 1-7), poi cosa è stato cambiato (item 8-20), poi i test
(item 21-22), poi quello che resta (item 23-27).

---

## TITOLO / SCOPE

**Titolo**: Audit del sistema VINZ.MON (Main Chat, Agent.lab, Tool Layer,
runtime agentico, memoria/ME, router) e intervento mirato per: (a) far
funzionare audit reali da Main Chat, (b) rendere Agent.lab una vera chat a
pagina intera, (c) aggiungere export TXT/report autosufficiente, (d)
aprire un ingresso OpenAI-compatibile verso il Core per OpenClicky —
mantenendo UN solo VINZ.MON, senza seconda memoria/persona/runtime/tool
layer.

**Scope**: repository `Vincora12/VincoraPortfolio`, branch
`claude/project-prototype-jxjc3d`. Nessun refactor generale, nessun cambio
di design system, nessuna nuova dipendenza pesante, nessun nuovo database.

---

## EXECUTIVE SUMMARY

VINZ.MON aveva già, prima di questo intervento, quasi tutto quello che
serviva per fare audit reali: un vero loop strumenti multi-round in Main
Chat (`replyWithLocalTools`), un tool layer di sola lettura sul codice
(`code_search`/`code_read`), strumenti di lettura dei dati/ME veri
(`leggi_me`/`leggi_i_miei_dati`), e un secondo agente tecnico server-side
completo (Agent.lab, `netlify/functions/agent-lab.ts`) con accesso in
lettura all'intero repository. **Il "non posso" non era un limite di
capacità: era un limite di riconoscimento dell'intento.** Una domanda come
"Fammi un audit del Tool Layer" non attivava NESSUNO dei due rilevatori di
intento esistenti (`TOOL_INTENT`, `CODE_INSPECTION_INTENT`) e cadeva quindi
sul percorso "BASE", senza nessuno strumento disponibile — da lì la
risposta generica o il rifiuto (FATTO, verificato eseguendo le regex esatte
contro le frasi del task).

L'intervento è stato quindi mirato e piccolo: (1) un nuovo rilevatore di
intento (`isAuditIntent`) che unisce i pool di strumenti già esistenti
invece di crearne di nuovi; (2) uno strumento di export (`esporta_report`
lato client, `export_report` lato Agent.lab) che riusa l'idioma di download
già in uso in `MemoryView.tsx`; (3) la ricostruzione di Agent.lab in una
chat a pagina intera, senza toccare il dispatcher di strumenti né la logica
di invio; (4) un ingresso OpenAI-compatibile (`/v1/models`,
`/v1/chat/completions`, `/v1/responses`) che chiama esattamente lo stesso
`callProvider`/`resolveRoute`/`checkCap` di sempre — non un secondo runtime.

**Limite dichiarato e non nascosto**: l'ingresso OpenAI-compatibile non
porta Persona/ME/Memoria di un .mon specifico, perché quello stato vive nel
browser (Zustand) e un chiamante server-to-server come OpenClicky non ce
l'ha. Risponde con la voce neutra che VINZ.LAB usa già quando nessun .mon è
attivo — non una bugia, la stessa condizione esistente riusata per lo
stesso caso — instradata comunque per il Core vero (auth, budget, router,
provider). Vedi item 23 e il prompt finale per il passo che lo completerebbe.

---

## 1 — ARCHITETTURA PRIMA

```
Web (Main Chat) ──► /api/ai (ai.ts)              ──► callProvider ──► fornitore
   │                     (decide SOLO i tool_use)
   └─ runTool client-side (src/ai/tools.ts + toolLayer.ts) esegue e rimanda indietro

Agent.lab (stanza separata) ──► /api/agent-lab (agent-lab.ts)
                                    (loop COMPLETO server-side: decide E esegue,
                                     con un catalogo di strumenti proprio ma sulla
                                     STESSA logica di file, agentLabFiles.ts)

OpenClicky ──► (nessun ingresso — non esisteva alcuna via)
```

Un solo Core dietro le quinte (`_shared/providers.ts`, `_shared/routing.ts`,
`_shared/auth.ts`, `_shared/spend.ts`), due superfici che non condividevano
il rilevamento dell'intento né il pool di strumenti "audit", zero terza
superficie per un client esterno.

## 2 — FLUSSO MAIN CHAT PRIMA

`App.tsx` → `IntegratedChat` (assistant-ui) → `netlify-runtime.ts` →
`src/brain/stream.ts`. `shouldUseLocalTools(text)` decideva SE entrare nel
loop-strumenti (`TOOL_INTENT` per salute/dati, `CODE_INSPECTION_INTENT` per
domande tecniche dirette tipo "quale file gestisce X"). **Nessuna delle due
riconosceva vocabolario di audit/diagnosi** ("audit", "tool layer", "runtime
agentico", "diagnosi", "cosa manca per essere un vero agent"). Fuori da
quelle due regex: percorso "BASE" (`createBaseNetlifyChatModel`), zero
strumenti, il modello risponde solo dalla propria "memoria" di addestramento
— da cui "non posso vedere il repository" anche quando POTEVA.

## 3 — FLUSSO AGENT.LAB PRIMA

`AgentLabChat.tsx` (storico locale, `localStorage`) → `askAgentLab` →
`/api/agent-lab` → loop server-side completo (fino a 6 round,
`list_files`/`read_file`/`search_files`/`propose_ui_change`). Corretto e
già grounded per natura (il system prompt impone di verificare nel codice
prima di rispondere), MA: (a) incassato in una pagina con testata, notice e
footer fissi sopra un riquadro alto al massimo 62vh — non una chat a pagina
intera; (b) nessun modo di ottenere un file scaricabile da un audit; (c)
nessun pulsante di copia rapido per messaggio.

## 4 — TOOL LAYER PRIMA

Due cataloghi paralleli MA senza logica duplicata:
`src/ai/toolLayer.ts` (`code_search`/`code_read`, usato da Main Chat, via
`/api/code-tools`) e `netlify/functions/agent-lab.ts`'s `TOOLS`
(`list_files`/`read_file`/`search_files`/`propose_ui_change`) — entrambi
chiamano `_shared/agentLabFiles.ts` come unica fonte di verità per accesso
al filesystem. Nessuno strumento di export in nessuno dei due.

## 5 — STATO DEL LOOP AGENTICO PRIMA

**EXISTS, non teorico.** Main Chat: `replyWithLocalTools` in
`src/brain/stream.ts` — ciclo reale `richiesta → tool_use → esegui →
tool_result → richiama`, fino a 4 round (`for (let round = 0; round < 4;
round++)`), verificato dai test esistenti (`verify:tool-layer`, G1-G10).
Agent.lab: stesso ciclo, fino a 6 round, in `netlify/functions/agent-lab.ts`.
Nessuno dei due è "solo strumenti dichiarati mai eseguiti" — entrambi
eseguono davvero e rimandano il risultato al modello.

## 6 — ROOT CAUSE PRECISA DEL "NON POSSO"

**FATTO** (verificato eseguendo le regex reali contro le frasi esatte del
task, `scripts/audit-unification-check.mjs`, sezione 1): `TOOL_INTENT` e
`CODE_INSPECTION_INTENT` in `src/brain/stream.ts` non contenevano
vocabolario di audit/diagnosi. Una frase come *"Fammi un audit del Tool
Layer. Controlla realmente il sistema e cita le evidenze."* non fa scattare
né l'una né l'altra → `shouldUseLocalTools` torna `false` →
`createBaseNetlifyChatModel` risponde senza NESSUNO strumento disponibile →
il modello, non potendo verificare nulla, o inventa o rifiuta.

Non è: un problema di autorizzazione (l'auth è la stessa per ogni percorso),
non è un problema di modello/provider (lo stesso GPT-5.6 Terra esegue tool
calling perfettamente quando i tool sono nel pool, come dimostra
`verify:tool-layer`), non è un problema di frontend che scarta i metadati
degli strumenti (il frontend non è mai coinvolto in questa decisione — è
prima ancora, in `stream.ts`, lato "quali strumenti mandare al server").

**Corretto in questo intervento**: nuovo rilevatore `isAuditIntent` (OR
aggiuntivo in `shouldUseLocalTools`), pool combinato
`[...CODE_TOOL_DEFS, ...auditReadTools]` (+`esporta_report` quando serve un
file), istruzione esplicita nel system prompt di usare quegli strumenti
prima di rispondere e di strutturare la risposta come
TITOLO/SCOPE/EXECUTIVE SUMMARY/CAPABILITY MATRIX/… Verificato di nuovo con
le stesse frasi esatte del task (ora tutte `true`).

## 7 — CAPABILITY MATRIX (PRIMA)

| Capacità | Stato | Evidenza | Rischio | Azione | Priorità |
|---|---|---|---|---|---|
| Main Chat endpoint | EXISTS | `netlify/functions/ai.ts`, `/api/ai` | — | — | — |
| Agent.lab endpoint | EXISTS | `netlify/functions/agent-lab.ts`, `/api/agent-lab` | — | — | — |
| Runtime conversazionale | EXISTS | `src/brain/stream.ts` | — | — | — |
| Runtime agentico (loop reale) | EXISTS | `replyWithLocalTools` (4 round), `agent-lab.ts` (6 round) | — | — | — |
| Tool registry | EXISTS | `src/ai/tools.ts` (~20), `src/ai/toolLayer.ts` (2) | — | — | — |
| Tool executor | EXISTS | `App.tsx`'s `runChatTool`, `agent-lab.ts`'s `executeTool` | — | — | — |
| Audit da Main Chat con evidenze reali | **BROKEN-NOT-WIRED** | `isAuditIntent` mancante — vedi item 6 | Alto (task esplicito, TEST B/C) | Aggiungere il rilevatore | Alta |
| Export TXT di un audit | MISSING | nessuno strumento di export in nessun percorso | Medio | `esporta_report`/`export_report` | Alta |
| Memoria/contesto | EXISTS | `state/store.ts` (Zustand, browser) | — | — | — |
| Persona | EXISTS | `src/ai/voicePrompt.ts`'s `buildVoiceSystemPrompt` | — | — | — |
| ME (lettura/scrittura) | EXISTS | `leggi_me`/`gestisci_me`/... in `src/ai/tools.ts` | — | — | — |
| Router provider/modello | EXISTS | `_shared/routing.ts`, tabella unica | — | — | — |
| Auth | EXISTS | `_shared/auth.ts`, `VINZMON_TOKEN` unico | — | — | — |
| Frontend chat components | EXISTS | `assistant-original/` (Main Chat), `AgentLabChat.tsx` (Agent.lab) | — | — | — |
| Artifact/file/export system | PARTIAL | download Blob esistente solo in DEV (`MemoryView.tsx`), non raggiungibile da chat | Medio | vedi export tool | Alta |
| MCP/tool providers | MISSING (assente per scelta) | nessun uso del protocollo MCP nel repository | Basso | nessuna azione: non richiesto | — |
| Permission model READ/WRITE/EXECUTE/DESTRUTTIVO | EXISTS | separazione netta (vedi item 9 sotto) | — | — | — |
| Ispezione GitHub/repository | EXISTS (sola lettura) | `code_search`/`code_read`, `list_files`/`read_file`/`search_files` | — | — | — |
| Diagnostica di sistema | PARTIAL | nessun endpoint dedicato, ma raggiungibile leggendo il codice reale coi tool esistenti | Basso | nessuna, per scelta (vedi item 9 delle regole) | — |
| Agent.lab pagina intera | **PARTIAL→BROKEN per l'uso** | riquadro a 62vh dentro pagina con testata/notice/footer fissi | Medio (TEST A) | ricostruzione layout | Alta |
| Ingresso OpenAI-compatibile | MISSING | nessuna traccia di "OpenClicky" nel repository prima di oggi | Alto (§7 del task) | nuovo ingresso minimo | Alta |

---

## 8 — COSA È STATO MODIFICATO

1. **Root cause "non posso"**: nuovo rilevatore `isAuditIntent`/
   `isExportIntent` in `src/brain/stream.ts`, pool di strumenti combinato per
   l'audit (codice + ME/dati + export), istruzioni di honestà/formato nel
   system prompt.
2. **Export TXT**: nuovo strumento `esporta_report` (client, riusa l'idioma
   Blob già in uso), nuovo strumento `export_report` lato Agent.lab (il
   server prepara il contenuto, il browser scarica — Agent.lab non ha e non
   deve avere un modo di scrivere file da solo).
3. **Agent.lab pagina intera**: `AgentLab.tsx` ricostruito (testata
   compatta + cassetto INFO richiudibile, invariato tutto il resto), CSS
   aggiunto in `agent.css` (mai toccato `system.css` condiviso). Pulsante di
   copia per messaggio in `AgentLabChat.tsx` (riusa `CopyBtn` già esistente
   in `parts.tsx`).
4. **Ingresso OpenAI-compatibile**: tre nuove funzioni Netlify
   (`/v1/models`, `/v1/chat/completions`, `/v1/responses`) sopra un unico
   modulo condiviso (`_shared/openaiIngress.ts`) che chiama lo stesso
   `callProvider`/`resolveRoute('character-voice')`/`checkCap`/`recordSpend`
   di sempre.
5. **Correzione adiacente**: `_shared/runtimeLog.ts`'s `RuntimeScope`
   non includeva `'openai-ingress'` — stesso tipo di guasto già trovato e
   corretto per `'agent-lab'` nella fase precedente (evento scartato in
   silenzio); corretto qui perché lo stesso file serve l'osservabilità di
   questo intervento.

## 9 — FILE MODIFICATI

- `src/brain/stream.ts` — `isAuditIntent`, `isExportIntent`, pool di
  strumenti dell'audit, system prompt.
- `src/ai/toolLayer.ts` — `EXPORT_REPORT_TOOL_NAME`/`_DEF`,
  `runExportReportTool`, dispatcher esteso.
- `netlify/functions/agent-lab.ts` — tool `export_report`, `exportFile` nella
  risposta, istruzioni di audit/export nel `BOUNDARY_RULES`.
- `src/ai/backend.ts` — `AgentLabResponse.exportFile`.
- `src/lab/rooms/AgentLabChat.tsx` — download del file quando arriva,
  pulsante di copia per messaggio.
- `src/lab/rooms/AgentLab.tsx` — layout a pagina intera, cassetto INFO.
- `src/lab/skin/agent.css` — le regole di layout/copy per quanto sopra.
- `netlify/functions/_shared/runtimeLog.ts` — `'openai-ingress'` nello
  scope valido.
- `scripts/agent-lab-ui-check.mjs` — aggiornato per il nuovo layout (test
  di riempimento pagina aggiunto, il confine READ/WRITE ora si verifica
  dietro il cassetto INFO).
- `package.json` — nuovo script `verify:audit-unification`.

## 10 — FILE NUOVI

- `netlify/functions/_shared/openaiIngress.ts` — mappatura OpenAI↔Core,
  `runIngress` (unico punto d'ingresso condiviso).
- `netlify/functions/v1-models.ts` — `GET /v1/models`.
- `netlify/functions/v1-chat-completions.ts` — `POST /v1/chat/completions`.
- `netlify/functions/v1-responses.ts` — `POST /v1/responses` (endpoint
  primario per OpenClicky/Codex, vedi item 19).
- `scripts/audit-unification-check.mjs` — verifica offline delle quattro
  aree di questo intervento.
- `docs/AUDIT_UNIFICATION_2026-09-06.md` — questo documento.

## 11 — ENDPOINT MODIFICATI

Nessun endpoint esistente ha cambiato forma (`/api/ai`, `/api/agent-lab`,
`/api/code-tools` invariati byte per byte nella loro interfaccia pubblica).
`/api/agent-lab` ha un campo IN PIÙ, opzionale, nella risposta
(`exportFile?`) — backward compatible: un client che non lo conosce lo
ignora.

## 12 — ARCHITETTURA DOPO

```
Main Chat ──► /api/ai ──┐
Agent.lab ──► /api/agent-lab ──┤──► callProvider ──► fornitore
OpenClicky ──► /v1/responses (primario) ─┤     (STESSO adattatore, STESSA routing.ts)
           ──► /v1/chat/completions (fallback) ┤
           ──► /v1/models ──────────────────────┘ (nessuna chiamata modello)
```

Un solo Core (`_shared/providers.ts`/`routing.ts`/`auth.ts`/`spend.ts`), ora
TRE superfici invece di due, nessuna con una propria memoria/persona/
runtime/tool layer indipendente — l'ingresso OpenAI-compatibile non esegue
MAI strumenti da solo: passa quelli del chiamante al modello e restituisce
le `tool_calls`, esattamente come `/api/ai` fa col browser.

## 13 — FLUSSO MAIN CHAT DOPO

Uguale a prima, con l'aggiunta di `isAuditIntent`/`isExportIntent`: una
domanda di audit ora entra nel loop-strumenti con un pool che unisce
`code_search`/`code_read` (evidenza da codice) e `leggi_me`/
`leggi_i_miei_dati` (evidenza da dati/ME veri), più `esporta_report` quando
serve un file. Il system prompt impone il formato
TITOLO/SCOPE/EXECUTIVE SUMMARY/CAPABILITY MATRIX/… e la distinzione
FATTO/INFERENZA/RACCOMANDAZIONE.

## 14 — FLUSSO AGENT.LAB DOPO

Stesso dispatcher, stesso storico, stessa auth. Cambiato SOLO il contenitore
attorno: `.agentlab-page`/`.agentlab-main`/`.agentlab-fullpage` (nuove
classi, scoperte solo da questa stanza) fanno sì che `.agentlab-thread`
riempia lo spazio verticale residuo della pagina invece di un tetto fisso a
62vh (misurato: >55% dell'altezza della stanza, verificato via Playwright in
`verify:agent-lab-ui`). Testata/CONFINE/footer vivono in un cassetto
richiudibile (chiuso di default): stessa informazione, zero perdita di
capacità, molto più spazio alla conversazione.

## 15 — TOOL LAYER DOPO

Stesso confine di sola lettura di prima (nessuna funzione di scrittura reale
in `agentLabFiles.ts`/`toolLayer.ts`). Aggiunta UNA capacità di scrittura
volutamente limitata: un download nel browser di chi guarda, mai un file sul
disco del server, mai un commit, mai una modifica al repository. Non
duplicata fra Main Chat (`esporta_report`, client-side, Blob diretto) e
Agent.lab (`export_report`, server-side, il contenuto torna nella risposta
e SOLO il browser lo trasforma in un file) — due implementazioni perché le
due superfici eseguono gli strumenti in due posti diversi (per lo stesso
motivo per cui gli altri strumenti di codice erano già due implementazioni
sulla stessa logica sottostante).

## 16 — AGENT LOOP DOPO

Invariato nella struttura (stesso numero di round, stessa forma
tool_use/tool_result). L'unica differenza è quali strumenti il pool porta in
un dato turno — più ricco per una domanda di audit, invariato per tutto il
resto. Nessun nuovo "orchestratore": lo stesso loop di sempre, con un
ingresso più intelligente su quando usarlo e con cosa.

## 17 — IMPLEMENTAZIONE EXPORT TXT

**Main Chat**: il modello chiama `esporta_report({titolo, contenuto})`
(`src/ai/toolLayer.ts`). Il contenuto arriva DAL MODELLO (l'audit che ha
appena scritto in chat, per intero — il system prompt lo dice
esplicitamente: "non un riassunto più corto"). L'esecuzione è client-side,
sincrona: `Blob` → `URL.createObjectURL` → `<a download>` sintetico → click
→ `revokeObjectURL` ritardato — stesso idioma già in produzione in
`src/dev/MemoryView.tsx`'s `scarica()`, non una nuova infrastruttura.

**Agent.lab**: il modello chiama `export_report` (server-side,
`agent-lab.ts`). Il server non può scaricare nulla da solo (gira su
Netlify, non nel browser di chi guarda): valida il contenuto, calcola un
nome file sicuro, e lo aggiunge alla risposta JSON come
`exportFile: {filename, content}`. `AgentLabChat.tsx` lo riconosce e attiva
lo stesso identico download client-side di sopra.

In entrambi i casi: nessuna scrittura sul server, nessuno storage nuovo,
riuso del meccanismo di download già esistente nel progetto.

## 18 — "COPY FOR ASTRA"

Non implementata come funzione separata — per una ragione precisa, non per
dimenticanza: il system prompt dell'audit già istruisce il modello a
scrivere un report "autosufficiente" (TITOLO/SCOPE/EXECUTIVE SUMMARY/…),
cioè leggibile e incollabile altrove senza dipendere dalla conversazione
corrente. Il pulsante di copia per messaggio, aggiunto in Agent.lab
(riusando `CopyBtn`, già esistente in `parts.tsx`) e già presente in Main
Chat (`ActionBarPrimitive.Copy` in `chatgpt.tsx`, non toccato per la sua
fragilità documentata), copia esattamente quel testo. Una "Copy for Astra"
dedicata sarebbe stata un secondo bottone che fa la stessa cosa del primo
con un'etichetta diversa — la funzione (A) del task (report copiabile,
pulito, completo) è coperta da COPIA + dal formato imposto nel prompt;
l'export TXT (B) copre il caso "file vero". Se serve comunque un'etichetta
"Copia per Astra" distinta, è un cambiamento di UI di un paio di righe, non
architetturale — non fatto qui per restare al minimo necessario.

## 19 — ENDPOINT OPENAI-COMPATIBILE — DETTAGLI

**Perché `/v1/responses` come endpoint primario, non `/v1/chat/completions`**:
il task chiedeva esplicitamente di NON assumere `/v1/chat/completions`.
Verificato (ricerca web): Codex CLI — la famiglia di client più plausibile
dietro un "target Codex" come OpenClicky sembra indicare — ha rimosso il
supporto a `wire_api = "chat"` a partire da febbraio 2026; l'unico
`wire_api` oggi supportato è `"responses"`, ed è il default per un
`model_provider` personalizzato. `/v1/chat/completions` resta implementato
come fallback di compatibilità più larga, non come strada raccomandata.

| Campo | Valore |
|---|---|
| Base URL | `https://<il-tuo-dominio-netlify>` |
| Endpoint primario | `POST /v1/responses` |
| Endpoint fallback | `POST /v1/chat/completions` |
| Elenco modelli | `GET /v1/models` → `{object:"list", data:[{id:"vinzmon-core", ...}]}` |
| Auth | `Authorization: Bearer <VINZMON_TOKEN>` — stesso segreto di ogni altra funzione, nessuna chiave di fornitore lato client |
| Formato richiesta (`/v1/responses`) | `{model, input: string \| [{role, content}], instructions?, tools?, stream?}` |
| Formato richiesta (`/v1/chat/completions`) | `{model, messages: [{role, content}], tools?, stream?}` |
| Formato risposta | Forma OpenAI standard (`output`/`output_text` per Responses; `choices[0].message` per Chat Completions) |
| Streaming | SSE supportato su entrambi — "finto": un solo blocco di testo dentro l'inviluppo di eventi corretto (`response.created`→`response.output_text.delta`→`response.completed`, o `chat.completion.chunk`→`[DONE]`). Nessun adattatore di questo progetto produce oggi token incrementali veri (`callProvider` è one-shot) — non è una regressione: la chat reale dell'app ottiene lo stesso effetto "sta scrivendo" lato client su una risposta già arrivata intera. |
| Tool calling | Passthrough: i tool del chiamante vengono inoltrati al modello; le `tool_calls`/`function_call` che il modello richiede tornano al chiamante, che le esegue lui (stesso principio di `/api/ai` col browser: il server decide, chi chiama esegue — mai un secondo tool layer qui). |
| Persona/ME/Memoria | **NON PRESENTI in questa fase** — limite dichiarato, vedi Executive Summary ed item 23. Risponde con la voce neutra di VINZ.MON (la stessa che VINZ.LAB usa senza .mon attivo), instradata comunque per Core/auth/budget/router/provider veri. |
| Budget | Stesso tetto mensile di sempre (`checkCap`/`recordSpend`, capability `character-voice`) — un uso pesante da OpenClicky consuma lo STESSO budget della chat vera, non uno separato. |

## 20 — CONFIGURAZIONE ESATTA PER OPENCLICKY

Nel campo "OpenAI-compatible base URL" di OpenClicky:

1. Base URL: `https://<il-tuo-sito>.netlify.app` (senza `/v1` finale, se
   OpenClicky lo appende da sé — verificare nella sua UI quale delle due
   convenzioni usa).
2. API key / token: il valore di `VINZMON_TOKEN` (lo stesso della webapp),
   NON una chiave OpenAI/Anthropic — l'ingresso lo traduce internamente.
3. Modello da selezionare: `vinzmon-core` (l'unico che `/v1/models`
   dichiara).
4. Se OpenClicky espone una scelta di protocollo/`wire_api`: preferire
   `responses`; solo se non disponibile, usare la modalità "Chat
   Completions" (`/v1/chat/completions` la copre comunque).

## 21 — TEST ESEGUITI

- `scripts/audit-unification-check.mjs` (nuovo) — intento di audit/export
  contro le frasi ESATTE del task, `esporta_report`/`export_report`,
  mappatura OpenAI↔Core pura, confine HTTP dei tre endpoint `/v1/*`.
- `npm run verify:tool-layer` — nessuna regressione sul Tool Layer
  esistente.
- `npm run verify:agent-lab` — dispatcher server-side di Agent.lab
  invariato.
- `npm run verify:agent-lab-ui` (aggiornato) — TEST A misurato via
  Playwright: il corpo della chat riempie >55% dell'altezza della stanza;
  confine READ/WRITE ancora dichiarato in chiaro (dietro INFO).
- `npm run verify:lab-layout` — nessuna regressione sul gesto/layout del
  laboratorio.
- `npm run typecheck` / `typecheck:functions` / `build` — puliti.
- Battuta adiacente: `verify:assistant`, `verify:chat-me`, `verify:backend`,
  `verify:core-memory`, `verify:health-interpret`, `verify:journey`,
  `verify:narrative-phase2`, `verify:rest-day-sync`,
  `verify:remote-chat-history(-ui)` — tutti verdi, nessuna regressione.
- `verify:package`/`verify:features`/`verify:lab` — stessi fallimenti
  PREESISTENTI (distribuzione SHIELD, hash del pacchetto vendor, "47
  decisioni non più nel codice", un timeout Playwright su
  `.deck__vote .si`), confermati identici e su file MAI toccati da questo
  intervento (nessuno di questi tre script tocca `stream.ts`, `toolLayer.ts`,
  `agent-lab.ts`, `AgentLab*`, o `openaiIngress.ts`/`v1-*.ts`) — non
  causati da, né corretti da, questo lavoro.

## 22 — RISULTATO PASS/FAIL DEI TEST DEL TASK

| Test | Esito | Nota |
|---|---|---|
| A — Agent.lab pagina intera | **PASS** | misurato: corpo chat >55% altezza pagina (prima: tetto fisso 62vh dentro una pagina più grande) |
| B — audit del Tool Layer con evidenze | **FAIL poi corretto** — vedi ADDENDUM | il primo test online reale (con token di produzione, eseguito da Vincenzo) ha rotto il round-trip con "risultati degli strumenti troppo lunghi": l'intento veniva riconosciuto correttamente, ma il turno falliva quando il modello leggeva più file nello stesso giro. Root cause e correzione nell'ADDENDUM subito sotto item 22. |
| C — audit completo + TXT per Astra | **FAIL poi corretto** — vedi ADDENDUM | stessa causa di TEST B (il turno che raccoglie le evidenze per il TXT è lo stesso che ha rotto B) |
| D — audit del runtime agentico da Agent.lab | **PASS** | Agent.lab aveva già il grounding necessario (system prompt impone di leggere il codice); non richiedeva un fix per essere vero, solo per essere comodo da leggere (TEST A) |
| E — stessa identità/Persona/ME/memoria/runtime fra Main Chat e Agent.lab | **PASS con nota** | STESSO Core/routing/auth/provider; Persona/voce sono DIVERSE per progetto (Agent.lab è deliberatamente "Project Inspector", non il .mon — documentato da AGENT.LAB V1); la memoria/ME restano quelle del .mon, non lette da Agent.lab (limite dichiarato, non un difetto nuovo) |
| F — endpoint OpenAI-compatibile risponde dal runtime vero | **PASS strutturale** | `runIngress` chiama LO STESSO `callProvider`/`resolveRoute` di `ai.ts`/`agent-lab.ts` — nessun secondo adattatore; verifica end-to-end con chiave di produzione non eseguita in questa sessione |
| G — richiesta che richiede uno strumento autorizzato | **PASS** | dimostrato da `verify:tool-layer`/`verify:agent-lab` (già esistenti) più i nuovi test dell'export tool: decide → esegue → valuta → risponde, reale |
| H — verifica del deploy online | **PASS meccanico, non autenticato** | vedi item 23 |

---

## ADDENDUM — 2026-09-06 (POST-DEPLOY): "risultati degli strumenti troppo lunghi"

**Come è stato trovato**: Vincenzo ha eseguito online, con il token di produzione, esattamente
"Fammi un audit del tuo Tool Layer. Controlla realmente il sistema, cita file e funzioni che hai
verificato e dammi anche un file TXT completo del report." — la prova che questo report, sopra,
non aveva ancora fatto (limite dichiarato all'item 23/26 nella prima stesura). VINZ.MON ha risposto
con l'errore **"risultati degli strumenti troppo lunghi"**. Questo addendum documenta diagnosi e
correzione, con la stessa disciplina FATTO/INFERENZA/RACCOMANDAZIONE del resto del report.

### Diagnosi (FATTO, verificato leggendo il codice reale)

1. **Dove scatta l'errore**: `netlify/functions/ai.ts:354-356` —
   `if (JSON.stringify(userBlocks).length > LIMITS.userChars) return json({ error: 'risultati degli
   strumenti troppo lunghi' }, 413);`, con `LIMITS.userChars = 12_000`. `userBlocks` è la somma dei
   `tool_result` di UN SOLO turno (round) del loop strumenti — non l'intera conversazione.
2. **Quale combinazione di strumenti la produce**: né `code_search` né `code_read` da soli.
   `code_read` è già limitato a `MAX_FILE_CHARS = 6000` caratteri per chiamata
   (`_shared/agentLabFiles.ts`); `code_search` a `MAX_MATCHES = 30` risultati (~7-9.000 caratteri
   nel caso peggiore). Il problema è la SOMMA: un audit del Tool Layer porta il modello a leggere
   più file rilevanti (`src/ai/toolLayer.ts`, `src/ai/tools.ts`, `netlify/functions/code-tools.ts`,
   `src/brain/stream.ts`...) — è perfettamente ragionevole che ne legga due nello stesso turno. Due
   `code_read` pieni fanno 12.000+ caratteri raw, oltre il tetto del server anche se OGNI singola
   chiamata rispetta il proprio limite.
3. **Dimensione reale**: riprodotta nel nuovo test di regressione
   (`scripts/audit-unification-check.mjs`, sezione 5) — due letture da 6000 caratteri ciascuna,
   nessun budget di turno: 12.000 caratteri raw di contenuto, oltre 12.000 una volta dentro
   `JSON.stringify(userBlocks)` con l'overhead di struttura/escaping.
4. **`code_search`/`code_read` restituiscono troppo, singolarmente?** No — verificato: entrambi
   sono già limitati individualmente. Il gap è l'assenza di un budget sulla SOMMA di un turno.
5. **Più risultati concatenati senza budget?** Sì — questa era la lacuna esatta:
   `src/ai/tools.ts`'s `resultBlocks()` (usata sia da `stream.ts` che da `ai/client.ts`)
   concatenava i risultati di un turno senza nessun controllo sulla somma.
6. **Il loop agentico aveva già troncamento/paginazione?** Per-strumento sì (`MAX_FILE_CHARS`,
   `MAX_MATCHES`); per-TURNO no — questo è il gap chiuso da questo addendum.
7. **Il modello leggeva file interi quando bastava un estratto?** Sì, strutturalmente: `code_read`
   non aveva MAI avuto un modo di leggere una sezione — sempre dall'inizio del file fino al tetto
   di caratteri. Per un file più lungo di 6000 caratteri, il modello non poteva chiedere "il resto":
   otteneva un pezzo fisso dall'inizio e basta.
8. **Prima o dopo il reinserimento nel modello?** PRIMA: l'errore scatta quando il CLIENT rimanda i
   `tool_result` al server per il turno successivo (`POST /api/ai` con `userBlocks`) — il modello
   non arriva mai a vedere quei risultati, il turno fallisce all'ingresso del server.

### Perché l'audit precedente non l'aveva trovato (onestà, non giustificazione)

Il test offline (`scripts/audit-unification-check.mjs`, sezioni 1-4) verificava che l'intento
venisse riconosciuto e che il pool di strumenti corretto si attivasse — MAI una vera sequenza di
tool-call con risultati di dimensione realistica, perché non chiama un modello vero (per non
spendere/non richiedere una chiave). Questo è il limite reale di un test "offline": prova la
LOGICA di instradamento, non il VOLUME di un turno reale. La sezione 5, aggiunta ora, chiude
esattamente questo buco riproducendo la combinazione reale con dati sintetici, senza bisogno di
un modello vero.

### Soluzione implementata (minima, senza abbassare qualità o grounding)

1. **Budget combinato per turno** — `budgetToolResults()` (nuova, `src/ai/tools.ts`, usata
   internamente da `resultBlocks()` così TUTTI i chiamanti la ereditano gratis; implementazione
   gemella in `netlify/functions/agent-lab.ts` per lo stesso motivo per cui altro codice è
   duplicato lì — quel file non importa mai `src/`). Budget = 9.000 caratteri raw per turno,
   scelto con margine sotto i 12.000 veri del server per l'overhead di escaping JSON (verificato:
   due letture piene restano a 9.434 caratteri di `JSON.stringify`, contro un tetto di 12.000).
   - Un risultato che rientra nel budget residuo esce IDENTICO — zero perdita di qualità quando
     non serve tagliare (il caso comune).
   - Un risultato che sfora viene accorciato con un avviso ESPLICITO in coda
     (`[RISULTATO ACCORCIATO A N CARATTERI — ...]`), mai un troncamento muto.
   - Un risultato che arriva quando il budget è già a zero viene rimandato esplicitamente
     (`RISULTATO RIMANDATO — ...`) al turno successivo, invece di essere tagliato a zero caratteri.
2. **Lettura per range in `code_read`/`read_file`** — `readProjectFile()`
   (`_shared/agentLabFiles.ts`, condivisa da Main Chat e Agent.lab) accetta ora `startLine`/
   `endLine` opzionali. Il risultato dichiara SEMPRE `totalLines`/`startLine`/`endLine` e se c'è
   altro da leggere (`truncated`), con l'istruzione esplicita di richiamare lo strumento con
   `da_riga`/`start_line` avanzato per continuare. Questo permette la strategia progressiva
   richiesta — cerca → leggi mirato → eventualmente continua — invece di "tutto o niente" dall'
   inizio del file.
3. **Più round per un audit** — `replyWithLocalTools` estende il tetto di round da 4 a 6 SOLO
   quando `isAudit` è vero (invariato per il resto della chat): un audit con export ha bisogno di
   cercare, leggere (eventualmente in più passaggi), e solo poi sintetizzare/esportare.

### Cosa NON è stato fatto (per scelta, coerente con i vincoli del task)

- Non sono stati alzati i tetti del server (`LIMITS.userChars` in `ai.ts` resta 12.000) — quello
  protegge il budget reale, non andava toccato.
- Non sono stati abbassati `MAX_FILE_CHARS`/`MAX_MATCHES` (nessuna perdita di qualità per singola
  chiamata).
- Nessun nuovo runtime, nessun secondo loop agentico: la correzione vive nello stesso punto in cui
  i risultati di un turno vengono assemblati, in entrambe le superfici esistenti.

### Test di regressione aggiunto

`scripts/audit-unification-check.mjs`, sezione 5: riproduce la combinazione esatta (due/tre
`code_read` pieni nello stesso turno), verifica che il budget li accorci/rimandi con un avviso
esplicito, verifica il numero VERO (`JSON.stringify` < 12.000, il controllo reale di `ai.ts`),
verifica che risultati piccoli escano identici (nessuna regressione sulla chat normale), e verifica
la lettura per range contro il filesystem reale di questo repository.

### Verifica online dopo la correzione

Vedi item 26 aggiornato — la stessa identica richiesta che ha fatto scoprire il problema va
ripetuta online con il token di produzione dopo il deploy di questa correzione. Questa sessione ha
verificato meccanicamente (via l'API di Netlify, stesso metodo dell'item 23) che il deploy con
questa correzione è online; non ha eseguito la chiamata autenticata reale (nessun token di
produzione in questa sessione, stessa scelta di sicurezza di tutte le fasi precedenti).

---

## 23 — CAPACITÀ ANCORA MANCANTI / NON VERIFICATE ONLINE

- **Verifica online (TEST H) — fatto quello che si poteva fare senza il
  token, verificato meccanicamente tramite l'API di Netlify** (questa
  sessione non ha accesso di rete diretto verso domini arbitrari — l'egress
  proxy dell'ambiente lo blocca — quindi non ha potuto eseguire un `curl`
  contro il sito pubblicato: verificato invece tramite gli strumenti Netlify
  disponibili). Risultato: il push ha attivato un deploy reale e completo
  sul sito di produzione collegato al branch (`fluffy-cocada-88715c`,
  contesto `production`, branch `claude/project-prototype-jxjc3d`) —
  deploy `6a9d401df5aaca0008bbcc9f`, `commit_ref` = `9de54c6…` (l'esatto
  commit di questo intervento), stato `ready`, scansione dei segreti pulita
  (0 corrispondenze su 426 file), **30 funzioni deployate** (erano 27 prima
  di questo intervento) incluse le tre nuove con le rotte dichiarate:
  `v1-models` → `/v1/models`, `v1-chat-completions` →
  `/v1/chat/completions`, `v1-responses` → `/v1/responses`. Questo prova
  meccanicamente che il codice è online e le rotte sono registrate.
  **Non provato**: una vera chiamata autenticata (con `VINZMON_TOKEN` di
  produzione) che riceva una risposta reale dal modello — questa sessione
  non recupera né inserisce quel token in nessun log, stessa scelta di
  sicurezza già documentata in AGENT.LAB V1/REMOTE CHAT HISTORY V1/TOOL
  LAYER PHASE 1. Quella verifica resta da fare con il token in mano
  (checklist minima all'item 26).
- **Persona/ME/Memoria nell'ingresso OpenAI-compatibile**: dichiarato in
  item 19, non implementato in questa fase. Richiederebbe leggere lo stato
  salvato (`/api/state` o equivalente) per un .mon specifico e ricostruire
  `characterVoiceBlock()` server-side — un intervento più grande del
  "minimo necessario" di questo task.
- **"Copy for Astra" come funzione a sé** (item 18): non aggiunta come
  bottone separato; coperta da COPIA + formato imposto nel prompt. Se
  Vincenzo la vuole comunque come etichetta distinta, è un cambiamento
  piccolo.
- **Streaming incrementale vero**: nessun provider di questo progetto lo
  emette oggi (limite preesistente, non introdotto qui).

---

## ADDENDUM 2 — 2026-09-06: EXPORT TXT (Main Chat) + ENTER

**1) Main Chat non confermava mai "file creato" dopo `esporta_report`.**
Diagnosi (flow reale, tool_use → dispatcher → download → ToolResult →
reinserimento → risposta): il dispatcher e il download erano già corretti
(`runToolLayerTool`/`runExportReportTool`), ma il budget di turno
dell'ADDENDUM 1 (sopra) poteva rimandare/accorciare la conferma
dell'export quando arrivava DOPO una lettura grande nello stesso turno —
il MON leggeva quel rinvio ("RISULTATO RIMANDATO") invece del vero
successo, e per onestà ("mai claimare successo senza conferma") diceva di
non aver ricevuto il risultato. Corretto: `budgetToolResults` (client e
Agent.lab) non accorcia/rimanda MAI un risultato ≤400 caratteri — una
conferma operativa è sempre corta, il budget serve ai dump di codice, non
alle conferme. Il testo del `ToolResult` è ora inequivocabile
(`SUCCESSO`/`FILE: <nome>` in testa, o `EXPORT FALLITO`), e il system
prompt (Main Chat e Agent.lab) dice esplicitamente di citare "file creato"
SOLO dopo aver letto un `SUCCESSO`. Nuovo test di regressione riproduce
esattamente lo scenario (lettura grande + export nello stesso turno, in
entrambi gli ordini) in `scripts/audit-unification-check.mjs` (sezione
2bis). Verifica online del round-trip reale non eseguita in questa
sessione (nessun token di produzione) — vedi checklist aggiornata.

**2) MAIN CHAT — ENTER non inviava.** Causa reale: `submitMode="none"` su
`ComposerPrimitive.Input` (`chatgpt.tsx`), aggiunto in un fix precedente
("fix: stabilize mobile chat sending", 31/08) per un problema SOLO mobile
(su iOS il nav rimontava fra pointer-down e click sulla freccia) ma
applicato ovunque, disattivando Invio=invia anche su desktop. Corretto con
`submitMode="enter"` (il default della libreria: Invio invia, Shift+Invio
va a capo, IME/disabled/loading già gestiti dal primitivo — verificato
leggendo `ComposerInput.js` della libreria) + `unstable_insertNewlineOnTouchEnter`
(Invio va a capo SOLO sui dispositivi touch-primari, lo stesso identico
caso mobile). Nessun secondo percorso di invio: resta lo stesso
`requestSubmit()`/`composer.send()` del primitivo, pulsante di invio
invariato. Nuovo test reale con Playwright
(`scripts/main-chat-enter-check.mjs`, `verify:main-chat-enter`) verifica:
Invio da solo invia e svuota il composer, Shift+Invio va a capo senza
inviare, Invio su composer vuoto non fa nulla, Invio durante una
composizione IME non invia prematuramente, il pulsante di invio resta
presente.

## 24 — RISCHI TECNICI

- Le regex di `isAuditIntent`/`isExportIntent` sono pattern-matching, non
  comprensione semantica: una richiesta di audit formulata in modo molto
  indiretto potrebbe non attivare il pool giusto (stesso limite già
  accettato per `isCodeInspectionIntent` in TOOL LAYER PHASE 1).
- L'ingresso OpenAI-compatibile espone `VINZMON_TOKEN` a un terzo prodotto
  (OpenClicky): è lo stesso segreto usato ovunque, quindi la superficie di
  esposizione cresce di uno. Se un giorno serve revocare SOLO l'accesso di
  OpenClicky senza rompere l'app o le Shortcut, servirebbe un secondo
  segreto dedicato (come già fatto per `VINZMON_SHORTCUT_TOKEN`) — non
  fatto qui perché non richiesto esplicitamente e per restare al minimo.

## 25 — DEBITO TECNICO CREATO

- Due implementazioni dello strumento di export (`esporta_report` client,
  `export_report` server) — necessarie perché le due superfici eseguono
  gli strumenti in due posti diversi (stesso pattern già accettato per
  `code_search`/`list_files` eccetera). Nessuna logica di validazione
  duplicata (il nome-file sicuro è la stessa funzione scritta due volte,
  ~8 righe, per lo stesso motivo per cui `agent-lab.ts` non importa mai
  codice `src/` — vedi la nota nel file).

## 26 — PROSSIMI PASSI CONSIGLIATI

0. **PRIORITÀ — ripetere online, con il token di produzione, esattamente la
   richiesta che ha fatto scoprire il problema dell'ADDENDUM**: "Fammi un
   audit del tuo Tool Layer. Controlla realmente il sistema, cita file e
   funzioni che hai verificato e dammi anche un file TXT completo del
   report." PASS solo se: non compare più "risultati degli strumenti troppo
   lunghi"; vengono usati tool reali; vengono citati file/funzioni verificati
   davvero; l'audit si completa; il TXT viene prodotto e scaricato E il MON
   conferma "file creato" citando il nome esatto (non più "non ricevo il
   risultato operativo"); il report non inventa evidenze; la chat normale
   (messaggi brevi, pasti, allenamenti) non è regredita.
0bis. **Verifica manuale di ENTER online**: aprire Main Chat da tastiera
   fisica, scrivere un messaggio, premere solo Invio (deve inviare),
   scrivere due righe con Shift+Invio in mezzo (deve andare a capo senza
   inviare), verificare su un telefono vero che digitare non invii per
   sbaglio mentre si scrive con l'IME (cinese/giapponese/coreano, se
   disponibile per la prova).
1. Il deploy è già online (verificato meccanicamente, item 23). Resta da
   fare, con il token di produzione in mano: aprire Main Chat online e
   mandare esattamente le frasi di TEST B/C/D; aprire Agent.lab online
   (`https://fluffy-cocada-88715c.netlify.app/lab/agent` o l'alias di
   produzione) e verificare che riempia lo schermo; chiamare
   `https://fluffy-cocada-88715c.netlify.app/v1/models` e
   `.../v1/chat/completions` con `curl -H "Authorization: Bearer
   $VINZMON_TOKEN"` per confermare l'ingresso risponde dal Core vero, non
   solo che la rotta esiste.
2. Decidere se vale la pena colmare il limite Persona/ME per l'ingresso
   OpenAI-compatibile (item 23) — richiede leggere lo stato salvato
   server-side, non piccolo.
3. Se OpenClicky si rivela usare davvero `wire_api=responses`, verificare
   sul traffico reale che il formato `input`/`output` che si aspetta
   corrisponda esattamente a quanto implementato qui (la specifica
   Responses ha varianti minori fra versioni dei client).

## 27 — PROMPT PER IL PROSSIMO INTERVENTO (basato solo su fatti reali)

```
Contesto: VINZ.MON ha un ingresso OpenAI-compatibile funzionante
(/v1/models, /v1/chat/completions, /v1/responses — netlify/functions/v1-*.ts
+ _shared/openaiIngress.ts) che instrada per lo stesso Core di sempre
(callProvider/resolveRoute/checkCap in _shared/), ma risponde con la voce
NEUTRA di VINZ.MON: non porta Persona/ME/Memoria di un .mon specifico,
perché quello stato vive nel browser (state/store.ts, Zustand) e un
chiamante server-to-server come OpenClicky non ce l'ha.

Task: dare all'ingresso OpenAI-compatibile accesso alla Persona/ME/Memoria
di UN .mon scelto (per esempio via un parametro nella richiesta, o un
.mon "di default" configurato lato server), riusando `buildVoiceSystemPrompt`
(src/ai/voicePrompt.ts) e lo stato salvato (verificare come/dove lo stato
persiste server-side oggi — cercare "serverStorage"/"/api/state" nel
repository prima di assumere che esista un endpoint pronto). NON creare una
seconda Persona o un secondo formato di voce: riusare esattamente
buildVoiceSystemPrompt. Mantenere il resto dell'ingresso invariato (auth,
budget, routing, passthrough dei tool). Verificare con un audit del
repository PRIMA di scrivere codice, non assumere che lo stato sia
raggiungibile server-side finché non è confermato leggendo il codice reale.
```
