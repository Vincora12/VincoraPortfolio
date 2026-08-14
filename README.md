# VINZ.MON — prototipo v1

Prototipo eseguibile di due documenti:

- **MASTER SPEC v1.8 — CONSOLIDATED** — prodotto, schermate, design system, Mindline, progressione, pipeline asset.
- **GENERATION BIBLE v2.1** — tassonomie, motore di generazione, rarità, prompt compiler.

Non è una demo visiva: serve a verificare che il modello regga **prima** che
esistano le API reali, così che sostituire i cheat di prototipo con i servizi
veri non richieda di riprogettare niente (MS §25).

```
npm install
npm run dev          # http://localhost:5173
```

Il pannello sviluppatore è nascosto: si apre solo con `?dev=1`.

```
http://localhost:5173/?dev=1
```

---

## Provalo online

Il repository è pronto per il deploy: `netlify.toml` porta build command, cartella
pubblicata e versione di Node. Su Netlify basta collegare il repository al progetto
**vinz-verce-prototype** e puntarlo al branch `claude/project-prototype-jxjc3d` —
da lì ogni push si pubblica da sé.

In alternativa, dalla propria macchina:

```
npm install && npm run build
npx netlify-cli deploy --prod --dir dist --site vinz-verce-prototype
```

**Sul telefono conviene aggiungerlo alla schermata Home**: `manifest.webmanifest`
e i meta iOS fanno aprire il prototipo a tutto schermo, senza barra del browser.
Sotto gli 860px la cornice finta sparisce e il frame diventa l'intera finestra.

**`?dev=1` resta raggiungibile anche online, di proposito.** MS §29 vieta i
controlli DEV *in produzione*, e questo non è un rilascio: senza DEV → TEMPO
un cambio di forma richiede 28 giorni veri e non si arriva mai a vederlo.
Il sito porta `robots.txt` e `noindex`, quindi resta fuori dai motori di ricerca,
ma chi ha l'URL entra.

**Cosa aspettarsi al primo avvio.** Lo stato vive nel `localStorage` di quel
browser: ogni dispositivo ha la sua partita, e svuotare i dati del sito ricomincia
da capo. I dati del giorno sono **simulati**, il Personality Seed è neutro finché
non esiste la schermata 03, e gli slot immagine sono vuoti per scelta (MS §18A).
Si prova il motore e l'interfaccia, non ancora il prodotto sui propri dati veri.

---

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm run dev` | Avvia il prototipo |
| `npm run build` | Typecheck + build di produzione |
| `npm run typecheck` | Solo controllo dei tipi |
| `npm run verify` | Percorre l'app end-to-end in Chromium headless, cattura 44 screenshot in `screenshots/` e fallisce su qualunque errore di console |
| `VERIFY_BASE=<url> npm run verify` | La stessa camminata contro un sito già pubblicato (o `vite preview`), dove il bundle è minificato e i percorsi degli asset sono altri |
| `npm run verify:batch` | QA del generatore su 3000 `.mon`: tabelle di rarità di GB §26, distribuzioni, genoma dei nomi, Heritage, ancore di continuità di MS §9.1, copertura dei frammenti |
| `npm run verify:package` | Controlla il pacchetto Asset Request contro MS §22.2/§24.4/§13 e GB §30/§45/§48 |
| `npm run verify:features` | **Audit delle decisioni**: 61 controlli che ogni scelta presa in conversazione sia ancora nel codice. Fallisce se qualcuno rimette una cosa tolta o toglie una cosa messa |

`verify:batch` accetta un numero: `node scripts/batch-check.mjs 400` per un giro rapido.

**Perché quattro controlli e non uno.** I primi tre guardano che il prototipo
*funzioni*: che non esploda, che il motore produca creature valide, che il
pacchetto sia completo. Il quarto guarda una cosa diversa — che le **decisioni**
siano ancora dove le avevamo messe. In un progetto costruito a conversazione,
la regressione più probabile non è un errore di tipo: è che una scelta presa
tre settimane fa venga silenziosamente disfatta. `verify:features` è il modo di
accorgersene senza doversi fidare della memoria di nessuno.

Un esempio di cosa protegge: le rese italiane dei cataloghi (`it`) parlano
all'utente e possono essere evocative — «qualcosa di celeste gli è cresciuto
addosso» — mentre i campi `effect` / `language` / `translation` finiscono nei
prompt immagine e **devono restare descrittivi e concreti**, perché un modello
di immagini legge quelli. Sono due testi sulla stessa cosa, ed è facilissimo
accorciare il secondo pensando di star sistemando il primo. Il controllo lo
impedisce.

---

## Come si prova in due minuti

1. Apri `?dev=1`.
2. **SIGNAL SCAN**: dodici domande, una per schermata, poi `LOCK SIGNAL`
   (MS §12). Nessuna risposta nomina una Family e la schermata non mostra mai
   cosa stai spostando — se si potesse ottimizzare, sceglieresti la creatura
   invece di essere letto. Le risposte seminano i 16 assi di personalità di
   GB §2, ed è quello che più decide quale Family esce.
3. **Incubazione**: premi `+ 7 GIORNI SINCRONIZZATI`, poi `HATCH`.
   Nasce la prima forma, **estratta come tutte le altre**: due partite non
   cominciano dalla stessa creatura. Ha dati completi e **zero immagini**.
4. **Home**: scrivi qualcosa nel composer. Il `.mon` risponde con la sua voce
   (fallback deterministico, dichiarato come tale in interfaccia).
5. **DAILY SCAN**: rispondi ai tre segnali del giorno — CIBO, ALLENAMENTO,
   UMORE — e chiudi la giornata. È l'**unico** modo di guadagnare SYNC, e vale
   +1, una volta sola. La stessa schermata dichiara fino a 3 umori fra i 13 di
   GB §11, e dice a chiare lettere che un singolo giorno **non** assegna mai il
   Mood della creatura: entra in una finestra mobile di 14 giorni.
6. **DEV → TEMPO**: `+7 DAYS` un paio di volte. Guarda **ME**: i trend si
   muovono, i dati mai rilevati restano `UNKNOWN` e non diventano zero.
   Poi apri **GIORNI**: il calendario è una superficie primaria (MS §14).
   `●` sincronizzato, `◐` parziale, `○` vuoto, `◍` pausa; tocca un giorno e
   vedi i tre segnali con la loro provenienza. Nessuna casella è rossa e un
   giorno saltato non azzera niente.
   Su un giorno ancora aperto puoi premere `SEGNA COME PAUSA` — malattia,
   assenza. **Una pausa non dà SYNC** (in quei giorni VINZ.MON non ha potuto
   leggerti) ma non toglie niente, e finisce nelle memorie. Un giorno in cui
   stai male *e lo racconti* non è una pausa: è un giorno normale, da chiudere.
7. **DEV → MINDLINE**: spunta *forza MICRO-GROWTH*, poi `APRI MINDLINE SHIFT` →
   `LASCIA MATURARE`. La stessa identità matura: nome, Family, Affinity e
   Character DNA restano invariati e la schermata lo dichiara.
8. Torna in DEV, spunta *forza FORM EVOLUTION*, riapri lo shift →
   `GUARDA COSA CAMBIA`. La schermata dichiara **l'ancora di continuità** —
   quale dei cinque schemi di MS §9.1 è uscito e cosa resta com'è — e i tratti
   che passeranno, **senza** anticipare la forma nuova: a quel punto non è
   ancora stata generata. Si può sempre dire `NON ORA` senza perdere niente.
9. Conferma: la stessa entità prende una forma nuova. Apri **MINDLINE**: il
   cambio di forma si vede come una diramazione. Apri **HERITAGE DNA**: per
   ogni tratto c'è la forma d'origine e quella tradotta nella nuova anatomia
   (GB §23).
10. **DEV → PROMPT**: il prompt compilato, con la **provenienza espandibile** di
   ogni frammento — quale asse, quale priorità, quale voce di catalogo.
11. **Profilo → ASSET → ESPORTA ASSET REQUEST**: scarichi uno zip con i 7 prompt
    completi, i Character Data, `compiled_prompt.txt`, `fragment_ids.json` e
    `ASSET_MANIFEST.json`.
12. Genera le immagini con ChatGPT, poi **DEV → ASSET** e trascinale dentro:
    gli slot si risolvono da soli e nessun campo di identità cambia.

---

## Come nasce un `.mon`

L'ordine è quello autorevole a 20 passi di GB §24, e non è negoziabile: gli assi
di creatura si decidono **prima** di quelli di styling (GB §31, «CREATURE FIRST.
STYLING SECOND.»).

```
segnali reali          salute · umori dichiarati · personality seed ·
(engine/signals.ts)    profondità Mindline · novelty · affinità culturali
        │
        ▼
FAMILY  ·  ARCHETIPO  ·  AFFINITY  ·  SIZE      ← la creatura
        │
        ▼
ROLE  ·  FASHION  ·  MARCATORI VINZ  ·  MOOD    ← lo styling
        │
        ▼
RARITÀ    gate di sblocco → pool rinormalizzato →
          punteggio a 7 componenti come TETTO → tiro pesato
        │
        ▼
character_data.json    27 campi, tipo chiuso, seed e versione di config
```

Nessun numero vive nel motore: cataloghi, pesi e soglie stanno tutti in
**`src/engine/generation-config.ts`**, come impone GB §29. Sono 18 Family,
107 archetipi, 16 Affinity, 24 Role, 18 Fashion, 16 Mood, 16 preset di voce e
6 rarità.

Ogni creatura ha il suo nome proprio — inizia per V, contiene Z, finisce in
`.mon` — ma la specie si chiama **`vinz.mon`**: si possono chiamare tutte così,
come si dice «un gatto» di un gatto che ha già un nome.

Ogni generazione è **riproducibile**: stesso seed e stessa versione di config
danno lo stesso `.mon`. Cambiare i pesi non riscrive i `.mon` già nati, che
conservano la versione con cui sono venuti al mondo.

---

## Come nasce un prompt

GB §30: *«The website must not ask an image model to invent a VINZ.MON from a
short label. It must compile one deterministic image-generation prompt from
modular fragments.»*

I frammenti sono materializzati nello schema esatto di GB §30.1 e assemblati
secondo l'ordine di priorità 1–12 di GB §30.2. Il compilatore è una **funzione
pura** di (Character Data, tipo di asset, versione compiler): stessi dati in
ingresso, stesso prompt in uscita, sempre.

Conseguenza verificata dalla macchina: i sette asset di uno stesso `.mon`
compilano **dagli stessi frammenti di identità**. Non è una promessa scritta nel
testo del prompt, è un controllo di `verify:package`.

---

## La voce

Il compilatore di prompt non serve solo alle immagini. Lo stesso principio —
non chiedere a un modello di inventare un personaggio da un'etichetta, ma
compilargli un briefing dai Character Data — vale per il testo:
`voice_preset` (§14), i 12 assi parametrici (§13), il Character DNA (§41), il
mood corrente e le regole di sicurezza di §28 diventano il system prompt di
quella creatura. È in `src/ai/voicePrompt.ts`, funzione pura come tutto il
resto, ed è leggibile da **DEV → VOCE**.

Ne passano la presentazione alla nascita, ogni risposta in conversazione, la
lettura delle foto e la riflessione settimanale. Il primo messaggio esiste
sempre; se la chiamata fallisce resta il fallback, dichiarato come tale in
interfaccia — è quello che impone MS §17.

### ✅ La chiave non sta più nel browser

Qui c'era un avviso: la chiave dell'API viveva nel `localStorage`, ed era una
scelta dichiarata, accettabile per un prototipo di una persona sola. Ha smesso
di esserlo quando questa è diventata l'app di tutti i giorni con un budget
vero dietro.

Adesso ogni chiamata passa da **`/api/ai`**, una funzione Netlify che tiene le
chiavi, applica il **tetto di spesa** e sceglie il fornitore. Il browser ha
solo un token che apre quelle funzioni: se esce, chi ce l'ha può spendere al
massimo il tetto del mese, e si disinnesca cambiando una variabile.

Il codice non chiede mai «chiama Claude»: chiede una **capacità** — una voce
in personaggio, guardare una foto, pensare su una cosa difficile — e
`netlify/functions/_shared/routing.ts` decide chi la serve. È l'unico posto
dove si cambia fornitore.

Il salvataggio è passato dalla stessa strada: lo stato vive anche su
**`/api/state`**, quindi cancellare i dati di Safari non fa più perdere il
`.mon`. E **`/api/ingest`** è la porta per le Shortcut di iPhone.

> 📄 **[docs/BACKEND.md](docs/BACKEND.md)** — le quattro variabili da mettere
> su Netlify, come generare il token, e la Shortcut che manda i dati del
> giorno. Quindici minuti, una volta sola.

L'SDK di Anthropic è uscito dalle dipendenze del browser: adesso è una `fetch`
verso casa propria.

---

## Perché non ci sono immagini dei `.mon`

MS §18A vieta di sostituire l'arte canonica con disegni CSS, icone generiche o
character art inventata. Non ho nessun asset canonico, quindi **non ne ho
inventati**: ogni slot vuoto mostra `ASSET_nn // WAITING FOR IMAGE` con il tipo,
lo scopo e come ottenerlo.

È il comportamento richiesto da MS §21.2 e §26: un `.mon` è **valido come dato
strutturato anche a slot tutti vuoti**, e nessuna schermata si blocca per un
asset mancante.

```
PROTOTIPO → CHARACTER DATA → PROMPT COMPILER →
7 PROMPT + fragment_ids.json + ASSET_MANIFEST.json → CHATGPT →
ASSET GENERATI → IMPORT → SLOT RISOLTI
```

---

## Struttura

```
src/
  engine/            Dominio puro. Nessun React. Sono i confini di servizio
                     futuri (MS §25): sostituibili uno a uno con chiamate HTTP.
    generation-config.ts  UNICA fonte di cataloghi, pesi e soglie (GB §29)
    signals.ts       Personality seed, mood latents, novelty (GB §2, §11, §22)
    types.ts         Character Data — i 27 campi di GB §27, tipo CHIUSO
    rng.ts           PRNG seminato: ogni generazione è riproducibile
    characterGenerator.ts  I 20 passi di GB §24, numerati nei commenti
    rarity.ts        Gate, normalizzazione e tetto (GB §15, §16, §26)
    naming.ts        Genoma dei nomi V… Z… .mon
    colorDna.ts      palette_dna + contrasto (GB §27, MS §10.2)
    voiceDna.ts      16 preset, 12 assi, fallback (GB §13, §14)
    heritage.ts      Selezione e traduzione dei tratti (GB §23)
    mindline.ts      Grafo dei nodi e layout topologico (MS §7.4)
    health.ts        FORM/ATK/SPD/DEF/REC/CARE, CONDITION, DISC (MS §3)
    progression.ts   SYNC, Daily Signals, cadenza, ancore di continuità
    simulation.ts    Eventi e memorie (MS §8.2)
    assets.ts        I sette tipi di asset canonici (MS §23)

  assets-pipeline/   Pipeline manuale che sta al posto dell'image API (MS §22)
    fragments.ts       Libreria dei frammenti nello schema di GB §30.1
    compiler.ts        Resolver di GB §30.2 + template di GB §46
    manifest.ts        ASSET_MANIFEST.json nella forma di MS §24.4
    exportPackage.ts   Lo zip di MS §22.2 + i file di GB §48
    assetStore.ts      Import e persistenza in IndexedDB (MS §22.3)

  system/            Design system (MS §10.4), slot asset, resa di `.mon`
  screens/           Le 16 schermate implementate
  dev/               DEV://VINZ.MON — mai visibile senza dev mode
  state/store.ts     Orchestrazione e persistenza
  i18n/it.ts         Stringhe

docs/
  SPEC_MAP.md        Dove vive ogni regola dei due documenti
  OPEN_ITEMS.md      Cosa NON è stato congelato, e perché
```

**Doppia lingua, per scelta.** Le descrizioni lunghe in inglese finiscono nei
prompt di generazione immagini; le rese brevi in italiano compaiono in UI. I
nomi di sistema (Family, Archetipo, Affinity…) restano in maiuscolo inglese
ovunque, perché sono identificatori.

---

## Criteri di accettazione MS §26

| # | Criterio | Come si verifica |
|---|---|---|
| 1 | Simulare più settimane senza attendere tempo reale | DEV → TEMPO → `+7 DAYS`, `+30 DAYS`, `NEXT MINDLINE SHIFT` |
| 2 | Innescare micro-growth e cambio di forma | DEV → MINDLINE → forzature, poi shift |
| 3 | Generare `.mon` strutturati senza immagini | ogni `.mon` nasce con `asset_manifest_status` tutto `waiting` |
| 4 | Batch-generare candidati per QA | DEV → GENERA → `GENERATE 10/50/200`; `npm run verify:batch` |
| 5 | Esportare un pacchetto Asset Request completo | Profilo → ASSET → `ESPORTA ASSET REQUEST` |
| 6 | Prompt di rotazione tecnicamente sufficiente | `02_ROTATION_SPRITE_PROMPT.txt`: griglia 8×1, angoli espliciti, consistenza assoluta, ancoraggio, output |
| 7 | Gli asset importati compaiono subito | DEV → ASSET → trascina; risolve contro il manifest |
| 8 | Nessun asset mancante blocca il flusso | segnaposto espliciti ovunque; `npm run verify` percorre tutto a slot vuoti |
| 9 | Nessun controllo DEV senza dev mode | il pannello e il suo trigger esistono solo con `?dev=1` |
| 10 | Sostituire la pipeline manuale con un'API non richiede riprogettare | `engine/` e `assets-pipeline/` sono funzioni pure dietro firme stabili |

`npm run verify` copre 1, 2, 3, 8 e 9 in automatico, e fallisce su qualunque
errore di console.

---

## Cosa NON c'è in v1

Schermate fuori scope: **01** SYSTEM BOOT, **02** THE PACT, **10** WEEKLY
REPORT, **21** SETTINGS. Non sono omissioni: sono scope concordato.

La **03 PERSONALITY / SIGNAL SCAN** era la lacuna che pesava — finché non
esisteva, il Personality Seed di GB §2 restava neutro e il motore lavorava solo
su salute e umori. Adesso c'è: MS v1.8 §12 ha fissato le dodici domande, e
`verify:batch` controlla che profili di risposte diversi portino davvero a
Family diverse.

Restano fuori, per fase: architettura della memoria a cinque strati (MS §15),
file e connettori (§16–§17), router multi-AI (§18), App Intents iOS (§22).

La generazione è **locale e deterministica**. Il generatore AI che scriverà i
Character Data è il passo successivo, deciso: arriva dopo il documento
canonico, e questo motore gli resta sotto come fallback (MS §17, «ogni
superficie AI ha un fallback»).

Quel che i documenti lasciano ancora aperto — trigger nascosto di SINGULAR,
affinità culturali, i nomi degli ultimi due livelli di rarità, il font
VINZ-HEAD — è elencato voce per voce in
[`docs/OPEN_ITEMS.md`](docs/OPEN_ITEMS.md), con dove sta e cosa serve per
chiuderlo. Insieme alle poche interpretazioni che ho preso leggendo la bibbia.

---

WHITE FIRST. BLACK STRUCTURAL. SIGNAL ALWAYS.
