# VINZ.MON V1 — Master Implementation Blueprint

Stato: architettura approvata e implementazione avviata  
Revisione: 2026-08-21  
Principio vincolante: **assistant-ui è la fondazione reale della Chat.**

## 1. Prodotto

```text
VINZ.MON
├── CHAT — assistant-ui + servizi VINZ.MON
├── GAMING — nativo VINZ.MON
├── DEX — nativo VINZ.MON
├── FORMS — nativo VINZ.MON
├── VINZ GAME ENGINE — nativo VINZ.MON
└── CHARACTER GENERATOR — nativo VINZ.MON
```

La Chat usa componenti e runtime assistant-ui per composer, messaggi, streaming, cronologia, allegati, Markdown, retry, stop e accessibilità. VINZ.MON concentra il codice proprietario su provider, strumenti personali, dati, gioco, evoluzione, Forms, Toy e Dex.

Open WebUI è stato valutato e scartato: richiederebbe un server persistente separato, un frontend SvelteKit difficile da integrare nel React esistente e vincoli di branding. Railway e altri server dedicati non fanno parte della V1.

## 2. Perché assistant-ui

- È una libreria React/TypeScript, quindi entra nell’app attuale senza sotto-app o iframe.
- Offre primitive Chat production-ready invece di un prodotto monolitico da forcare.
- Include streaming, stop, retry, auto-scroll, Markdown, allegati, thread e tool UI.
- Si collega a runtime custom, Vercel AI SDK, LangGraph o backend data-stream.
- Supporta modelli e provider diversi attraverso il backend scelto.
- Licenza MIT; nessun vincolo di branding Open WebUI.
- Funziona nell’attuale architettura Vite + Netlify Functions, senza server sempre acceso.

## 3. Architettura Chat

```text
assistant-ui React primitives
├── Thread / ThreadList
├── Message / Markdown
├── Composer / Attachments
├── Streaming / Stop / Retry
└── Local runtime + persistence adapter
          ↓
VINZ Chat Adapter
├── neutral system context
├── capability/model request
├── streaming normalization
├── image/file normalization
└── tool orchestration
          ↓
Netlify Functions
├── /api/ai
├── provider adapters
├── auth and rate limits
├── cost ledger
└── VINZ Tool Gateway
          ↓
OpenAI | Anthropic | Gemini | compatible providers
```

assistant-ui possiede il comportamento generico della Chat. Il VINZ Chat Adapter traduce i messaggi nel protocollo backend già esistente; non reimplementa componenti UI.

## 4. Cosa ereditiamo

- Struttura thread e messaggi.
- Composer, invio con Enter, stop e retry.
- Streaming state e aggiornamento progressivo.
- Markdown/code rendering.
- Attachment lifecycle per immagini e file testuali.
- Thread list, titoli, nuova chat e archiviazione.
- Copy action, error state, scroll-to-bottom e accessibilità.
- Primitive responsive personalizzabili con CSS VINZ.MON.

## 5. Cosa resta VINZ.MON

- App shell e navigazione Chat/Game/Dex/Forms.
- Autenticazione personale e cost control.
- Model routing e provider connections server-side.
- Web search policy e fonti.
- Tool personali e autorizzazione.
- Goals, food, workout, calendar e registri.
- Game Engine, progression, evolution e Forms.
- Character Generator, asset pipeline, Toy e Dex.

## 6. Provider e costi

Il frontend non contiene chiavi. Netlify Functions continuano a collegare provider e modelli:

- OpenAI
- Anthropic
- Gemini
- OpenAI-compatible provider
- modelli locali in futuro tramite adapter/gateway

Tier logici:

- CHEAP: intent, extraction e sintesi brevi.
- NORMAL: chat quotidiana, web e vision.
- STRONG: ragionamento difficile e Character Master.

Ogni turno registra modello, provider, strumenti, costo e latenza senza salvare chain-of-thought. Budget, tetto e fallback sono server-side.

## 7. VINZ Tool Gateway

```text
assistant-ui conversation
→ model native tool call
→ authorize → validate → confirm if needed → execute → audit
→ VINZ domain API
→ deterministic Game Engine where applicable
```

Tool V1:

- `calendar.search`, `calendar.create`
- `goals.read`, `goals.create`, `goals.update`
- `food.log`, `food.read`
- `workout.log`, `workout.read`
- `game.readState`
- `dex.read`
- `form.read`

L’utente parla normalmente e non seleziona manualmente i tool. Letture sicure possono essere automatiche; scritture ambigue richiedono conferma. Ogni scrittura è autorizzata, validata, idempotente e auditabile.

Esempio: “Mi sono allenato oggi” → `workout.log` → evento di dominio → Game Engine → progressione → risposta conversazionale.

## 8. Web, immagini, file e calendario

- **Web:** capacità server provider-neutral con fonti cliccabili e data.
- **Immagini:** attachment assistant-ui → adapter vision → modello multimodale.
- **File:** assistant-ui gestisce selezione/stato; parsing e limiti sono server-side per i formati complessi.
- **Calendar:** provider server-side con OAuth, scope minimo e conferma per data/timezone ambigue.

V1 iniziale mantiene immagini e file testuali già supportati. PDF/DOCX e persistenza file server arrivano prima del Checkpoint 1.

## 9. Persistenza

```text
assistant-ui storage
├── thread metadata
├── messages
├── local attachments metadata
└── current Chat preferences

VINZ.MON server data
├── user profile
├── goals/logs
├── game events/state
├── forms/assets
└── usage/tool audit
```

La prima integrazione usa l’adapter localStorage ufficiale assistant-ui. Prima dell’uso quotidiano cross-device, thread e messaggi passano a un adapter remoto VINZ.MON usando lo stesso runtime: la UI non cambia.

Le vecchie conversazioni custom saranno importate o archiviate prima della rimozione del vecchio schema. Nessuna cancellazione senza backup e conteggio prima/dopo.

## 10. Deployment

- VINZ.MON resta su Netlify.
- assistant-ui viene incluso nel bundle React.
- AI, strumenti e segreti restano nelle Netlify Functions.
- Nessun container, Railway, VPS o server sempre acceso.
- Costi fissi infrastrutturali aggiuntivi: nessuno nella prima V1; restano costi Netlify oltre soglia e consumo dei provider AI.
- Bundle Chat caricato separatamente dalla shell quando possibile.

## 11. Mobile

- Composer ancorato con safe area e tastiera virtuale.
- Upload da fotocamera/file picker.
- Thread drawer a tutto schermo su telefono.
- Touch target accessibili, nessun overflow orizzontale.
- Stessa UI su desktop e mobile.
- Persistenza remota necessaria per continuità telefono/desktop al Checkpoint 1.

## 12. Migrazione del codice Chat

### KEEP

- `src/brain/stream.ts` come adapter temporaneo provider/tools.
- Provider adapters, auth, web search e cost ledger server-side.
- Tool definitions e logica di dominio, da spostare progressivamente dietro API.
- Test funzionali Chat.
- App shell e navigazione VINZ.MON.

### ADAPT

- `src/brain/Brain.tsx`: diventa composizione di primitive assistant-ui, non UI custom.
- `src/brain/brain.css`: solo tema/layout VINZ.MON; nessuna logica Chat.
- `replyWithLocalTools`: migrare verso tool parts native assistant-ui e gateway server.
- Persistenza locale: sostituire con remote thread adapter per cross-device.
- `netlify/functions/ai.ts`: mantenere protocollo stream stabile e provider-neutral.
- Test Playwright: puntare alle primitive visibili e ai workflow, non al vecchio DOM.

### DELETE dopo migrazione verificata

- Vecchio store Brain e doppio schema conversazioni.
- Composer, history drawer, streaming state e copy/retry implementati manualmente.
- Route standalone `/brain` quando non serve più come harness.
- Markdown renderer Chat duplicato.
- File/attachment UI custom.
- Qualunque dipendenza o codice Open WebUI/Railway.

## 13. Gaming deterministico

```text
REAL LIFE → GOALS → TRACKED ACTIONS → DOMAIN EVENTS
→ VINZ GAME ENGINE → EVOLUTION → FORM → DEX
```

Nessun modello assegna punti, rarità o evoluzione. L’AI legge, spiega e registra tramite tool; il Game Engine decide in modo deterministico, versionato e idempotente.

## 14. Character Generator

```text
CharacterData → Creative Resolver (STRONG) → Character Master
→ in parallelo: Toy | CEL | Doodle
```

- Character Master resta canonico e conserva Resolver, design DNA, cultural DNA e lessons.
- Toy/CEL/Doodle usano direttamente il Master.
- Non rieseguire il Resolver per i derivati.
- Rimuovere Encounter, Profile image, Sprite, Sprite sheet, animation pipeline e animated preview.
- Le memory del Resolver creativo restano: sono design, non psicologia Chat.

## 15. Toy e Dex

- Toy è la rappresentazione principale.
- Fondo bianco ottico.
- Griglia responsive, Toy hero, nome Form e metadata minimi.
- Nessun ambiente 3D decorativo o chrome superfluo.
- Master/CEL/Doodle secondari nel dettaglio.

## 16. VINZ.MIND rinviato

Fuori V1: evolving personality, autonomous cognition, artificial consciousness, psychological development, deep identity, inner life/DREAM, self-reflection, opinioni/notebook cognitivo, messaggi autonomi e mood interno come driver Chat.

La personality arriva soltanto dopo il checkpoint funzionale. Prima si usa un assistente neutrale di alta qualità.

## 17. Checkpoint Chat

Fermarsi per il test utente soltanto quando è realistico dire: “posso usare VINZ.MON Chat invece di aprire ChatGPT”.

Verificare:

- conversazione naturale e qualità modello;
- streaming, stop, retry e messaggi lunghi;
- cronologia, ricerca e persistenza cross-device;
- immagini e comprensione visiva;
- PDF/testo/documenti;
- web research con fonti;
- tool automatici multi-step;
- calendar search/create;
- goals/food/workout/game/dex/form;
- conferme, idempotenza e audit;
- provider fallback e cost control;
- mobile, tastiera, upload e navigation;
- errori, loading, riconnessione e provider down;
- auth, authorization, export e cancellazione.

## 18. Roadmap

### Phase 1 — assistant-ui foundation

- Primitive Chat, runtime, thread list, attachments e Markdown.
- Neutral assistant, provider adapter e local persistence.

### Phase 2 — Everyday capabilities

- Remote threads cross-device.
- Web, vision, PDF/files e calendar.
- Tool Gateway, confirmations e cost controls.
- Import/archive della Chat precedente.

### CHECKPOINT 1 — Everyday Chat

Test utente e correzione. Nessuna personality finale.

### Phase 3 — Gaming e logging

Goals, food, workout, eventi e progression.

### Phase 4 — Evolution e Forms

Eligibility, evolution e Form state.

### Phase 5 — Character pipeline

Protezione Master, Toy/CEL/Doodle paralleli e rimozione legacy.

### Phase 6 — Dex

Gallery bianca Toy-first.

### Phase 7 — Stabilisation

Security, migrations, mobile, performance, backup e test end-to-end.

### Final phase — Personality

Benchmark fisso e static persona layer; nessun VINZ.MIND.

## 19. Criteri di accettazione

- assistant-ui possiede i pattern e il runtime UI Chat.
- VINZ.MON non mantiene un secondo composer/history/streaming engine.
- Nessun server sempre acceso è necessario.
- Provider e modelli sono sostituibili.
- Tool automatici, autorizzati, auditabili e idempotenti.
- Chat sincronizzata fra telefono e desktop prima del Checkpoint 1.
- Gaming deterministico da eventi reali.
- Forms producono Master, Toy, CEL e Doodle in parallelo.
- Dex bianco e Toy-first.
- Nessun VINZ.MIND in V1.

## 20. Raccomandazione finale

Continuare con **assistant-ui come fondazione Chat React**, mantenendo Netlify e il backend provider-neutral esistente. Personalizzare soltanto tema, navigazione e integrazioni VINZ.MON.

La priorità immediata è completare il Checkpoint Chat: persistenza remota, file completi, web, vision, calendar e tool affidabili. Gaming/Dex/Forms non vanno modificati prima del primo test utente della Chat.
