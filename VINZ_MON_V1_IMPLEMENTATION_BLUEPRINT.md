# VINZ.MON V1 — Implementation Blueprint

Stato: proposta da approvare prima dell’implementazione  
Data audit: 2026-08-20  
Repository verificato: 56.834 righe applicative/test, build TypeScript e Vite riuscita

## 1. Decisione di prodotto

V1 sarà un unico prodotto con due domini separati:

```text
VINZ.MON
├── Assistant: chat generalista, strumenti e dati personali
└── Game: obiettivi → azioni → progressione → Form → Dex
```

Il lavoro “mente viva” non è parte di V1. Diventa **VINZ.MIND**, progetto R&D futuro collegabile attraverso un’interfaccia di contesto. La priorità di V1 è rendere la chat realmente sostitutiva di ChatGPT nell’uso quotidiano, poi completare il ciclo di gioco.

## 2. Valutazione del repository

### Punti forti

- Motore Character Generator deterministico, versionato e ampiamente verificato.
- Character Data, Resolver e Character Master già separati abbastanza bene dalla UI.
- Astrazione server per Anthropic, OpenAI, Google e Moonshot già presente.
- Routing per capacità, cost ledger e tetto mensile server-side già presenti.
- Tool calling già funzionante per strumenti locali.
- Visione immagini già supportata dal backend.
- Progressione SYNC, Forms, lineage, Heritage e Dex già modellati.
- Persistenza locale, copia server e autenticazione personale già esistenti.
- Suite di verifica insolitamente ampia: build, feature audit, generatore, pacchetto asset, backend ed E2E.

### Problemi strutturali

- `src/state/store.ts` è un monolite di 3.812 righe: chat, gioco, AI, asset, DEV, memoria e UI sono accoppiati.
- La chat principale usa ancora la voce/persona del `.mon`; il laboratorio `/brain` è invece separato e incompleto.
- Esistono due sistemi conversazionali e due persistenze chat.
- Le “memorie” mescolano registri di vita utili al gioco con memoria psicologica del personaggio.
- Calendar reale, file e ricerca web generalista non sono completi.
- Dex e pipeline asset riflettono ancora sei asset storici, non Master → Toy/CEL/Doodle.
- Il bundle principale è 564 kB minificato e il code splitting attuale è in parte inefficace.
- Diversi documenti descrivono versioni precedenti e non possono più essere considerati autorità V1.

## 3. Classificazione KEEP / FIX / SIMPLIFY / REPLACE / DELETE / VINZ.MIND

### KEEP

- `engine/characterGenerator.ts`, `generation-config.ts`, rarity, signals, Heritage, naming e RNG.
- `CharacterData`, `MonRecord`, Form/evolution lineage e tracciamento della provenienza.
- Resolver creativo e relative lessons/custom resolver memory: servono al Character Master.
- `assets-pipeline/resolver/**`, limitatamente alla progettazione visiva.
- Provider adapters server, autenticazione, spend ledger e routing per capacità.
- Funzioni state/ingest, dopo separazione degli schemi.
- Vision backend e image generation con immagine di riferimento.
- Progressione deterministica e regola massimo +1 SYNC/giorno.
- Design system generale, PWA, responsive shell e componenti accessibili.
- Test del generatore, del backend e del Character Master.

### FIX

- Chat: unificare `/brain` e chat principale in una sola esperienza V1.
- Provider routing: convertirlo da “step del personaggio” a tier CHEAP/NORMAL/STRONG più capacità.
- Costi: prezzi configurabili e ledger leggibile per tier/capacità; evitare listini duplicati client/server.
- Tool loop: generalizzarlo e aggiungere conferma per scritture sensibili.
- Persistenza: schemi separati e sincronizzazione affidabile fra telefono e desktop.
- Image input: mantenere il flusso vision, ma aggiungere preview, correzione e allegato al messaggio.
- Game input: sostituire estrazione fragile da testo con tool strutturati validati.
- DEV: non deve essere pubblicamente accessibile nella V1 finale.

### SIMPLIFY

- App shell e navigazione: Chat, Goals/Game, Dex, Settings; schermate narrative solo quando servono al ciclo.
- Modelli selezionabili: configurazione interna, non pannello pieno di scelte nell’uso normale.
- Character prompt pipeline: Resolver forte solo sul Character Master; derivati standardizzati.
- Stato Zustand: slice/domain store piccoli, non un’unica struttura globale.
- Signal Scan e protocollo iniziale: differibili; l’utente deve poter entrare subito in chat.

### REPLACE

- `src/brain/**` come applicazione separata: sostituire con il modulo Chat V1 integrato.
- `netlify/functions/brain.ts`: sostituire con API conversations/messages più allegati e metadata.
- `src/ai/voicePrompt.ts` come system prompt principale: sostituire con NeutralContextProvider.
- Chat array globale limitato a 60 messaggi: sostituire con conversazioni persistenti paginate.
- Asset type e manifest storici: sostituire con Master/Toy/CEL/Doodle.
- Dex scuro basato sul portrait: sostituire con gallery bianca basata sul Toy.

### DELETE dalla V1

- Entry point e pagina `/brain` dopo la migrazione della chat.
- Profile Portrait dedicato.
- Encounter Hero.
- Idle animation.
- Reaction pack generato, se gli sticker esistenti coprono le reazioni.
- Qualunque residuo sprite/sprite sheet/animazione.
- Forge/export UI relativa agli asset eliminati.
- Simulation/dev time e strumenti di prototipo non necessari alla V1 pubblicata.

### POSTPONE → VINZ.MIND

- `engine/memoryContext.ts` come memoria psicologica.
- `engine/opinions.ts`.
- `engine/notebook.ts` e `ai/notebook.ts`.
- `ai/reflect.ts`.
- `engine/unprompted.ts`.
- MoodState interno del personaggio e relativa superficie conversazionale.
- Voice DNA dinamico, personality scan come identità AI, autobiografia e relationship memory.
- Messaggi autonomi, riflessioni periodiche, auto-revisione e comportamento emergente.

Nota: i `mood_primary`, Personality Seed e segnali che influenzano **la generazione visiva** restano nel Game/Character Generator. Va rimosso solo il loro uso come psicologia della chat.

## 4. Dipendenze del Character Generator

La catena da preservare è:

```text
User/Game signals
→ GeneratorInput
→ Character Generator
→ CharacterData
→ Creative Resolver + resolver lessons/memory
→ CreativeResolution
→ Character Master prompt
→ Character Master image
```

Dipendenze da mantenere anche se chiamate “memory”:

- `assets-pipeline/resolver/memory.ts`: è memoria professionale del designer, non memoria del personaggio.
- `Lesson`, `customMemory`, teach resolver e taste history: contribuiscono al Character Master.
- `personality` e `moodHistory` dentro `GeneratorInput`: sono segnali di design, non coscienza.
- Character/voice DNA nei Character Data possono restare come metadati di design; non devono pilotare la chat V1.

Dipendenze non necessarie al Character Master:

- conversazioni recenti, opinioni, VoiceNote, MoodState interno, reflection e unprompted messages.

Prima di cancellare si aggiungerà un test di caratterizzazione che genera un set fisso di Character Master input/resolution e confronta struttura, prompt fingerprint e invarianti.

## 5. Architettura V1 proposta

```text
React/PWA
├── chat/
├── goals/
├── game/
├── forms/
├── dex/
├── character-assets/
└── settings/

application/
├── assistant-orchestrator
├── tool-registry
├── context-provider
└── model-router

server functions
├── chat
├── conversations
├── tools/calendar
├── state
├── assets
└── usage

storage
├── user-profile
├── conversations
├── goals/logs
├── game-state
├── forms
├── character-assets
└── usage-ledger
```

Regola: ogni dominio espone comandi e letture tipizzati; nessun dominio modifica direttamente lo stato di un altro.

## 6. Chat

- Interfaccia ChatGPT-like integrata come pagina iniziale.
- Thread multipli: crea, rinomina automaticamente, elenca, riapre e archivia.
- Streaming, stop, retry, edit/resend e copia.
- Markdown sicuro, code blocks, link e tabelle.
- Stato esplicito per upload, ricerca, tool, errore e riconnessione.
- Cronologia server con cache locale offline; paginazione dei messaggi.
- Mobile first: composer ancorato, safe areas, tastiera, allegati e touch target.
- Nessuna personalità custom al Checkpoint 1.

La base utile di `/brain` da migrare è: streaming, abort, append-only event log e conversazioni. Non va mantenuta come prodotto separato.

## 7. ContextProvider

```ts
interface ContextProvider {
  buildContext(input: ContextRequest): Promise<ContextBundle>;
}
```

V1 implementa solo:

- `NeutralContextProvider`: comportamento generalista, lingua dell’utente, sicurezza, preferenza per risposte concise.
- In fase finale, `StaticPersonaContextProvider` sostituibile.

`FutureVinzMindContextProvider` resta solo un contratto documentato, senza codice cognitivo.

## 8. Provider e model routing

Separare due decisioni:

1. capacità richiesta: text, vision, web, file, image-generation;
2. qualità: CHEAP, NORMAL, STRONG.

Il router decide usando complessità, allegati, strumenti, esplicita richiesta di qualità, fallback e budget residuo. La configurazione è server-side e semplice da cambiare.

- CHEAP: intent, extraction, reaction, summaries, tool preparation.
- NORMAL: chat quotidiana, vision, ricerca normale.
- STRONG: ragionamento difficile, decisioni importanti, creatività complessa e Character Master.

Non usare euristiche nascoste irreversibili: ogni turn trace registra tier, provider, model, strumenti, costo stimato e motivo del routing.

## 9. Cost control

- Un’unica tabella prezzi server-side aggiornata e testata.
- Ledger per mese, tier, provider, modello e capacità.
- Budget obiettivo €30; valuta di visualizzazione EUR, contabilità del provider nella valuta reale.
- Avviso al 75%, routing più conservativo oltre 85%, blocco rigido solo al tetto.
- STRONG resta disponibile quando esplicitamente necessario, salvo tetto raggiunto.
- Rate limit personale e limite di concorrenza oltre al bearer token.
- Mostrare Budget/Used/Remaining in Settings, non nel flusso chat salvo avvisi.

## 10. Tool layer

Contratto unico:

```ts
ToolDefinition<Input, Output>
authorize → validate → preview? → execute → audit
```

Categorie V1:

- `calendar.search`, `calendar.create`
- `web.search`, `web.read`
- `goals.read`, `goals.create`, `goals.update`
- `food.log`, `food.read`
- `workout.log`, `workout.read`
- `game.read`
- `dex.read`, `form.read`

Letture possono avvenire automaticamente. Le scritture ad alto impatto mostrano una conferma sintetica quando i dati sono ambigui. Ogni chiamata produce audit metadata, ma non pensieri interni.

## 11. Immagini e vision

- Upload da fotocamera, libreria e drag/drop.
- Compressione client, controllo MIME/dimensione, preview e rimozione.
- Vision generalista via NORMAL.
- Cibo: il modello propone interpretazione e confidenza; se quantità/ingredienti sono incerti chiede conferma prima di `food.log`.
- Il messaggio conserva riferimento all’allegato e risultato strutturato, non soltanto una frase.
- Immagini sensibili non finiscono nei log applicativi; retention configurata esplicitamente.

## 12. Web research

- Usare una capacità web provider-neutral nell’orchestrator.
- V1 minimo: ricerca + apertura/lettura + risposta con fonti cliccabili e data.
- Separare risultato di ricerca da testo del modello per poter cambiare provider.
- Limite di ricerche per turno e costo contabilizzato.
- Dichiarare quando l’informazione non è stata verificata.

L’attuale web search Anthropic è riutilizzabile come primo adapter, ma non deve restare una condizione speciale dentro la chat.

## 13. Files

Checkpoint 1 supporta PDF, testo, Markdown e immagini; DOCX se il parsing è affidabile.

- Upload temporaneo autenticato.
- Estrazione testo server-side con limiti di dimensione/pagine.
- File grandi: chunking e sintesi progressiva, non intero file nel prompt.
- Consenso esplicito prima di conservare un file oltre il turno.
- Stato visibile: caricamento, lettura, fallimento e rimozione.

## 14. Calendar

- Integrare un provider reale dietro `CalendarProvider`.
- OAuth con scope minimo; token cifrati/server-side, mai nel browser.
- `search`: intervallo, timezone, calendari selezionati e compleanni quando disponibili.
- `create`: titolo, inizio, fine, timezone, luogo/note; conferma se data o timezone sono ambigue.
- Nessun aggiornamento/cancellazione in prima iterazione, salvo necessità emersa al test.
- La vista “GIORNI” di gioco resta distinta dal calendario esterno.

## 15. Goals, food e workout

### Goals

- Obiettivo con id, titolo, metrica, target, periodo, stato e timezone.
- Progress update attraverso log verificabili.
- Nessun goal cambia direttamente una Form.

### Food

- Registro semplice: timestamp, descrizione, foto opzionale, quantità/confidenza, correzioni.
- V1 non pretende precisione nutrizionale clinica.
- Nessun giudizio morale; dati mancanti restano sconosciuti.

### Workout

- Tipo, durata, intensità opzionale, note e provenienza.
- Import Shortcut può continuare, ma scrive nello stesso schema degli strumenti chat.

## 16. Game Engine

Input normalizzati → eventi di dominio → aggiornamento deterministico.

```text
Goal/food/workout/habit events
→ DailyGameSummary
→ SYNC/consistency/objective progress
→ Evolution eligibility
```

- Nessun modello decide punti, rarità o evoluzione.
- Ogni variazione deve essere spiegabile da eventi registrati.
- Mantenere il principio attuale: salute/benessere non sono premio o punizione.
- Evitare farming: cap giornalieri e idempotency key.
- Progression config versionata e migrazioni esplicite.

## 17. Forms ed evolution

- VINZ.MON resta una sola entità con più Forms.
- Conservare Form corrente, Forms sbloccate, lineage, condizioni, rarity e metadata.
- Mantenere almeno un’ancora di continuità e almeno un cambiamento.
- Evolution Engine riceve solo GameState normalizzato.
- L’AI può spiegare lo stato ma non sovrascriverlo.
- Eliminare terminologia psicologica dove non serve al sistema di Form.

## 18. Character asset pipeline

Nuovo contratto:

```text
CharacterData
→ Creative Resolver (STRONG)
→ Character Master
→ parallel:
   ├── Toy
   ├── CEL
   └── Doodle
```

### Character Master

- Fonte canonica.
- Mantiene Resolver, Character Data, design DNA, cultural DNA, lessons e qualità alta.
- Generazione in background con stato recuperabile.
- Nessuna regressione accettata senza confronto visuale e prompt fingerprint.

### Toy

- Derivato dal Master con riferimento immagine obbligatorio.
- Collezionabile 3D, fedele a silhouette, proporzioni, palette e dettagli.
- È l’asset principale del Dex.

### CEL e Doodle

- Template standardizzati; “preserva il personaggio, cambia presentazione”.
- Nessun nuovo passaggio Resolver.
- Immagine Master sempre allegata.

### Ottimizzazione

- Toy/CEL/Doodle lanciati in parallelo.
- Aggiornamento progressivo appena ogni asset arriva.
- Job idempotenti, retry individuale, cache per `(master hash, template version, model)`.
- Prompt e modello più economici dei Master quando la qualità resta sufficiente.

## 19. Asset da rimuovere

- `profile_portrait`
- `encounter_hero`
- `reaction_pack` generato
- `idle_animation`
- qualunque rotation/sprite/animation residuo

Aggiornare in modo coordinato: AssetType, status map, manifest, export/import, prompt fragments, UI slot, test e feature audit. Non lasciare job invisibili.

## 20. Dex

- Fondo bianco ottico.
- Griglia responsiva di Toy, nome sotto, pochissima UI.
- Niente ambienti 3D o card decorative.
- Progressive loading e placeholder neutrali.
- Filtri solo se il numero di Forms li rende davvero necessari.

Dettaglio: Toy grande come hero; nome, rarity, lineage/evolution e metadata essenziali; galleria Master/CEL/Doodle secondaria.

## 21. Reactions e sticker

- Sono presentazione, non stato emotivo.
- Selezione CHEAP o deterministica da intent/tone della risposta.
- Nessun token STRONG.
- Nessun Reaction Pack nuovo: riusare sticker esistenti se adeguati; altrimenti posticipare.

## 22. Persistenza e sincronizzazione

Separare gli schemi:

- UserProfile
- Conversation/Message/Attachment
- Goal/Log
- GameState/GameEvent
- Form/CharacterAsset
- ProviderSettings
- UsageLedger

Server è autorità per dati cross-device; IndexedDB è cache/offline. Ogni scrittura usa id stabile, timestamp, schema version e idempotency key. Le conversazioni mantengono event log append-only ma hanno viste materializzate efficienti.

Backup/export personale in JSON; import validato. Migrazioni mai basate sul semplice cambio di chiave localStorage.

## 23. Desktop e mobile

- Stessa PWA e stessi dati su entrambi.
- Test viewport iPhone e desktop ad ogni checkpoint.
- Gestire safe area, tastiera virtuale, upload fotocamera, share sheet e installazione PWA.
- Nessuna funzione essenziale esclusiva di DEV o desktop.
- URL stabile prima dell’uso quotidiano, perché OAuth e PWA dipendono dall’origine.

## 24. Sicurezza e privacy

- Chiavi provider solo server-side.
- Sostituire progressivamente il bearer condiviso con sessione personale/OAuth passkey o magic link prima di conservare calendar token e file.
- Scope calendar minimo e revocabile.
- Validazione schema e limiti payload su ogni funzione.
- Rate limiting, CSRF protection per sessioni cookie, audit delle scritture tool.
- Cifratura/segreti gestiti dal provider di deploy; niente token nei log.
- Content Security Policy e controllo dipendenze.
- Funzioni DEV disabilitate in produzione.
- Policy chiara per retention/eliminazione di chat, foto e file.

## 25. Migrazione

1. Congelare test di caratterizzazione del Character Master.
2. Introdurre nuovi tipi di dominio senza cambiare UI.
3. Migrare streaming/persistenza Brain nella Chat V1.
4. Migrare la vecchia chat in conversazione “Archivio VINZ.MON”, senza importare psicologia.
5. Separare registri utili (food/workout/goals) dalle memorie cognitive.
6. Attivare NeutralContextProvider e disconnettere voice personality.
7. Rimuovere `/brain` e i moduli VINZ.MIND solo dopo verifica import graph.
8. Migrare GameState preservando Form e asset esistenti.
9. Aggiungere nuovi asset type; mantenere temporaneamente lettura legacy per vecchie Forms.
10. Eliminare generatori legacy dopo migrazione/backup riusciti.

Ogni migrazione distruttiva richiede export automatico precedente e conteggio degli oggetti prima/dopo.

## 26. Testing

### Da mantenere

- Build/typecheck frontend e functions.
- Batch generator e invarianti Character Data.
- Resolver/Character Master contract.
- Backend auth, spend e provider routing.
- E2E principali.

### Da aggiungere

- Chat streaming/stop/retry e persistenza cross-device.
- Tool loop multi-step e validazione degli input.
- Calendar timezone/OAuth/errori.
- Vision + correzione food.
- File upload, limiti e cancellazione.
- Model routing CHEAP/NORMAL/STRONG.
- Ledger e comportamento vicino al budget.
- Event idempotency e Game Engine deterministico.
- Asset derivati paralleli, retry singolo e cache.
- Dex responsive e visual regression bianco/Toy.
- Migrazioni da salvataggi reali anonimizzati.
- Security tests su auth, authorization e payload.

## 27. Rischi principali

1. **Regressione Character Master**: proteggere prima del cleanup.
2. **Scope chat troppo ampio**: Checkpoint 1 deve puntare all’uso reale, non a ogni feature di ChatGPT.
3. **Calendar auth**: richiede identità utente più forte del token condiviso.
4. **Dati esistenti**: separare senza perdere Forms e asset.
5. **Provider drift/listini**: configurazione e verifica periodica.
6. **Netlify timeouts**: usare job asincroni per generazione e parsing pesante.
7. **Tool writes errati**: schema, preview e idempotenza.
8. **Bundle e monolite**: refactor incrementale, non riscrittura totale.
9. **E2E ancorati a decisioni obsolete**: sostituire gradualmente i feature checks, non disattivarli in massa.

## 28. Roadmap autonoma

### Phase 0 — Safety rails

- Snapshot dati e test Character Master.
- Nuovi domain types e migration harness.
- Spezzare store iniziando da assistant e conversations.

### Phase 1 — Chat foundation

- Chat integrata, threads, streaming, retry/stop, Markdown, mobile.
- NeutralContextProvider.
- Provider/tier router e usage ledger unificato.
- Persistenza server + cache locale.

### Phase 2 — Everyday capabilities

- Vision/upload immagini.
- Web search con fonti.
- File support.
- Tool orchestrator.
- Calendar search/create.
- Errori, loading e sicurezza.

### CHECKPOINT 1 — ChatGPT-like Chat

Stop e test utente soltanto quando è ragionevole chiedere: “posso usarla invece di ChatGPT per le attività quotidiane?”. Correggere i problemi emersi prima di continuare.

### Phase 3 — Goals and logging

- Goals, food e workout schemas/UI/tools.
- Migrazione ingest e registri esistenti.

### Phase 4 — Game and Forms

- Event-driven Game Engine.
- Progressione, eligibility, evolution e Form state.

### Phase 5 — Character pipeline

- Conservazione qualità Master.
- Nuovi Toy/CEL/Doodle paralleli.
- Rimozione completa asset legacy.

### Phase 6 — Dex

- Gallery bianca Toy-first e dettaglio.

### Phase 7 — Stabilisation

- Migrazioni finali, sicurezza, mobile, performance, backup e test completi.

### CHECKPOINT 2 — Complete V1

Verifica end-to-end: Chat → input reale → Goals → GameState → Evolution → Form → Master/Toy/CEL/Doodle → Dex.

### Final phase — Personality casting

- Benchmark conversazionale fisso.
- Ricerca di personas/cards aperte come riferimento.
- Scelta e integrazione tramite `StaticPersonaContextProvider`.
- Nessuna modifica all’orchestrator o al Game Engine.

## 29. Criteri di accettazione finali

- La chat copre conversazione, ragionamento, web, immagini, file e calendario con affidabilità quotidiana.
- Le scritture tool sono confermabili, verificabili e persistenti.
- Il budget mensile è comprensibile e realmente applicato.
- Goals/log producono eventi; il Game Engine produce progressione deterministica.
- Le Forms evolvono senza decisioni arbitrarie del modello.
- Ogni nuova Form produce Master, Toy, CEL e Doodle; i derivati partono in parallelo.
- Il Dex è una gallery bianca Toy-first.
- Desktop e telefono condividono dati.
- Nessun modulo VINZ.MIND gira nella V1.
- La personalità è un layer sostituibile applicato solo dopo la validazione funzionale.

## 30. Raccomandazione finale

Procedere con questa direzione. Il repository non va riscritto: possiede già motore di generazione, backend AI, cost control e progressione di valore. Va invece **decomposto**, unificando la chat e rimuovendo la psicologia sperimentale senza toccare la pipeline creativa del Character Master.

La prima implementazione, dopo approvazione, deve iniziare dai safety rails e dalla Chat foundation. Nessun altro lavoro sul Brain/YuriOS va sviluppato nella V1.
