# VINZ.VERCE — prototipo v1

Prototipo eseguibile di due documenti:

- **MASTER SPEC v1.2** — prodotto, schermate, design system, Mindline, pipeline asset.
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
l'incubazione dura 28 giorni veri e non si arriva mai a vedere un `.mon`.
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
| `npm run verify` | Percorre l'app end-to-end in Chromium headless, cattura 37 screenshot in `screenshots/` e fallisce su qualunque errore di console |
| `VERIFY_BASE=<url> npm run verify` | La stessa camminata contro un sito già pubblicato (o `vite preview`), dove il bundle è minificato e i percorsi degli asset sono altri |
| `npm run verify:batch` | QA del generatore su 3000 `.mon`: tabelle di rarità di GB §26, distribuzioni, genoma dei nomi, Heritage, copertura dei frammenti |
| `npm run verify:package` | Controlla il pacchetto Asset Request contro MS §22.2/§24.4/§13 e GB §30/§45/§48 |

`verify:batch` accetta un numero: `node scripts/batch-check.mjs 400` per un giro rapido.

---

## Come si prova in due minuti

1. Apri `?dev=1`.
2. **Incubazione**: premi `+ 7 GIORNI` quattro volte, poi `HATCH`.
   Nasce il primo `.mon`, **estratto come tutti gli altri**: due partite non
   cominciano dalla stessa creatura. Ha dati completi e **zero immagini**.
3. **Home**: scrivi qualcosa nel composer. Il `.mon` risponde con la sua voce
   (fallback deterministico, dichiarato come tale in interfaccia).
4. **DAILY SCAN**: dichiara fino a 3 umori del giorno fra i 13 di GB §11.
   La schermata dice a chiare lettere che un singolo giorno **non** assegna mai
   il Mood della creatura: entra in una finestra mobile di 14 giorni.
5. **DEV → TEMPO**: `+7 DAYS` un paio di volte. Guarda **ME**: i trend si
   muovono, i dati mai rilevati restano `UNKNOWN` e non diventano zero.
6. **DEV → MINDLINE**: spunta *forza CONTINUE*, poi `APRI MINDLINE SHIFT` →
   `EVOLVE`. La stessa identità cambia forma: nome, Family, Affinity e
   Character DNA restano invariati e la schermata lo dichiara.
7. Torna in DEV, spunta *forza BRANCH*, riapri lo shift → `NUOVO SEGNALE`.
   La schermata mostra i tratti che passeranno **senza** anticipare la nuova
   identità: a quel punto il nuovo `.mon` non è ancora stato generato.
8. Conferma: nasce un `.mon` nuovo. Apri **MINDLINE**: la deviazione si vede
   come deviazione. Apri **HERITAGE DNA**: per ogni tratto c'è la forma
   d'origine e quella tradotta nella nuova anatomia (GB §23).
9. **DEV → PROMPT**: il prompt compilato, con la **provenienza espandibile** di
   ogni frammento — quale asse, quale priorità, quale voce di catalogo.
10. **Profilo → ASSET → ESPORTA ASSET REQUEST**: scarichi uno zip con i 7 prompt
    completi, i Character Data, `compiled_prompt.txt`, `fragment_ids.json` e
    `ASSET_MANIFEST.json`.
11. Genera le immagini con ChatGPT, poi **DEV → ASSET** e trascinale dentro:
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

Oggi ne passa una superficie sola: **la presentazione alla nascita**. Il primo
messaggio esiste sempre e viene dalla voce deterministica; se c'è una chiave,
l'AI sta già scrivendo la vera presentazione e quella riga viene sostituita
quando arriva. Se la chiamata fallisce, resta il fallback, dichiarato come
tale in interfaccia — è quello che impone MS §17.

**La chiave sta nel browser.** La incolli da DEV → VOCE e resta nel
`localStorage` di quel dispositivo. Non passa da nessun server nostro, ma
chiunque apra quel browser può leggerla: va bene finché il prototipo è di una
persona sola, e prima di darlo a qualcun altro va spostata dietro una funzione
serverless. Cambia un file solo, `src/ai/client.ts`.

L'SDK viene caricato con un import dinamico: chi non usa la voce non ne
scarica i 156 kB.

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
    economy.ts       XP ed eleggibilità — 🟡 provvisorio
    simulation.ts    Eventi, memorie, passaggio al branch (MS §8.2)
    assets.ts        I sette tipi di asset canonici (MS §23)

  assets-pipeline/   Pipeline manuale che sta al posto dell'image API (MS §22)
    fragments.ts       Libreria dei frammenti nello schema di GB §30.1
    compiler.ts        Resolver di GB §30.2 + template di GB §46
    manifest.ts        ASSET_MANIFEST.json nella forma di MS §24.4
    exportPackage.ts   Lo zip di MS §22.2 + i file di GB §48
    assetStore.ts      Import e persistenza in IndexedDB (MS §22.3)

  system/            Design system (MS §10.4), slot asset, resa di `.mon`
  screens/           Le 16 schermate implementate
  dev/               DEV://VINZ.VERCE — mai visibile senza dev mode
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
| 2 | Innescare entrambi i percorsi CONTINUE e BRANCH | DEV → MINDLINE → forzature, poi shift |
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

Schermate di MS §12 fuori scope: **01** SYSTEM BOOT, **02** THE PACT,
**03** PERSONALITY / SIGNAL SCAN, **10** WEEKLY REPORT, **21** SETTINGS.
Non sono omissioni: sono scope concordato. La 03 è quella che pesa davvero —
finché non esiste, il Personality Seed di GB §2 resta neutro e il motore lavora
solo su salute e umori.

La generazione è **locale e deterministica**. Il generatore AI che scriverà i
Character Data è il passo successivo, deciso: arriva dopo il documento
canonico, e questo motore gli resta sotto come fallback (MS §17, «ogni
superficie AI ha un fallback»).

Quel che i due documenti lasciano ancora aperto — economia XP, durata
dell'incubazione, trigger nascosto di SINGULAR, affinità culturali, il font
VINZ-HEAD — è elencato voce per voce in
[`docs/OPEN_ITEMS.md`](docs/OPEN_ITEMS.md), con dove sta e cosa serve per
chiuderlo. Insieme alle poche interpretazioni che ho preso leggendo la bibbia.

---

WHITE FIRST. BLACK STRUCTURAL. SIGNAL ALWAYS.
