# VINZ.VERCE — prototipo v1

Prototipo eseguibile della MASTER SPEC v1.2. Non è una demo visiva: serve a
verificare che il modello di prodotto — schema Character Data, logica Mindline,
Heritage, slot asset — regga **prima** che esistano le API reali, così che
sostituire i cheat di prototipo con i servizi veri non richieda di
riprogettare niente (§25).

```
npm install
npm run dev          # http://localhost:5173
npm run dev -- --open
```

Il pannello sviluppatore è nascosto: si apre solo con `?dev=1`.

```
http://localhost:5173/?dev=1
```

---

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm run dev` | Avvia il prototipo |
| `npm run build` | Typecheck + build di produzione |
| `npm run typecheck` | Solo controllo dei tipi |
| `npm run verify` | Percorre l'app end-to-end in Chromium headless, cattura 28 screenshot in `screenshots/` e fallisce su qualunque errore di console |
| `npm run verify:package` | Controlla il pacchetto Asset Request contro §22.2, §24.2, §24.4, §13 e §21.1 |
| `npm run verify:batch` | QA del generatore: distribuzioni, varianza, genoma dei nomi, coerenza Heritage |

---

## Come si prova in due minuti

1. Apri `?dev=1`.
2. **Incubazione**: premi `+ 7 GIORNI` quattro volte, poi `HATCH`.
   Nasce il primo .mon, con dati completi e **zero immagini**.
3. **Home**: scrivi qualcosa nel composer. Il .mon risponde con la sua voce
   (fallback deterministico, dichiarato come tale in interfaccia).
4. **DEV → TEMPO**: `+7 DAYS` un paio di volte. Guarda **ME**: i trend si
   muovono, i dati mai rilevati restano `UNKNOWN` e non diventano zero.
5. **DEV → MINDLINE**: spunta *forza CONTINUE*, poi `APRI MINDLINE SHIFT` →
   `EVOLVE`. La stessa identità cambia forma: nome, Family, Affinity e
   Character DNA restano invariati e la schermata lo dichiara.
6. Torna in DEV, spunta *forza BRANCH*, riapri lo shift → `NUOVO SEGNALE`.
   La schermata mostra i tratti che passeranno **senza** anticipare la nuova
   identità: a quel punto il nuovo .mon non è ancora stato generato.
7. Conferma: nasce un .mon nuovo. Apri **MINDLINE**: la deviazione si vede come
   deviazione. Apri **HERITAGE DNA**: per ogni tratto c'è la forma d'origine e
   quella tradotta nella nuova anatomia.
8. **Profilo → ASSET → ESPORTA ASSET REQUEST**: scarichi uno zip con i 7 prompt
   completi, i Character Data e `ASSET_MANIFEST.json`.
9. Genera le immagini con ChatGPT, poi **DEV → ASSET** e trascinale dentro:
   gli slot si risolvono da soli e nessun campo di identità cambia.

---

## Perché non ci sono immagini dei .mon

§18A vieta di sostituire l'arte canonica con disegni CSS, icone generiche o
character art inventata. Non ho nessun asset canonico, quindi **non ne ho
inventati**: ogni slot vuoto mostra `ASSET_nn // WAITING FOR IMAGE` con il tipo,
lo scopo e come ottenerlo.

È il comportamento richiesto da §21.2 e §26: un .mon è **valido come dato
strutturato anche a slot tutti vuoti**, e nessuna schermata si blocca per un
asset mancante.

Il percorso per riempirli è quello di §22:

```
PROTOTIPO → CHARACTER DATA → ASSET REQUEST GENERATOR →
PROMPT + ASSET_MANIFEST.json → CHATGPT → ASSET GENERATI →
IMPORT → SLOT RISOLTI
```

---

## Struttura

```
src/
  engine/            Dominio puro. Nessun React. Sono i confini di servizio
                     futuri (§25): sostituibili uno a uno con chiamate HTTP.
    types.ts         Schema Character Data — tipo CHIUSO (§21.1, §13)
    taxonomy.ts      Assi canonici (§4) — 🟡 provvisorio, vedi OPEN_ITEMS
    taxonomyIt.ts    Rese brevi in italiano per la UI
    rng.ts           PRNG seminato: ogni generazione è riproducibile
    characterGenerator.ts  Pipeline di §21, passi numerati
    naming.ts        Genoma dei nomi V… Z… .mon
    colorDna.ts      Palette adattiva + contrasto (§10.2)
    voiceDna.ts      Genoma di scrittura + fallback (§14, §17)
    rarity.ts        Rarità calcolata dalla configurazione (§4)
    heritage.ts      Selezione e traduzione dei tratti (§7.3)
    mindline.ts      Grafo dei nodi e layout topologico (§7.4)
    health.ts        FORM/ATK/SPD/DEF/REC/CARE, CONDITION, DISC (§3)
    economy.ts       XP ed eleggibilità — 🟡 provvisorio
    simulation.ts    Eventi, memorie, passaggio al branch (§8.2, §20)
    assets.ts        I sette tipi di asset canonici (§23)

  assets-pipeline/   Pipeline manuale che sta al posto dell'image API (§22)
    promptCompiler.ts  Prompt completi, non brief (§22.1, §24.3)
    manifest.ts        ASSET_MANIFEST.json nella forma di §24.4
    exportPackage.ts   Lo zip di §22.2
    assetStore.ts      Import e persistenza in IndexedDB (§22.3)

  system/            Design system (§10.4) + slot asset e rotazione
  screens/           Le 15 schermate di §12 implementate in v1
  dev/               DEV://VINZ.VERCE (§20) — mai visibile senza dev mode
  state/store.ts     Orchestrazione e persistenza
  i18n/it.ts         Stringhe

docs/
  SPEC_MAP.md        Dove vive ogni regola della spec
  OPEN_ITEMS.md      Cosa NON è stato congelato, e perché
```

---

## Criteri di accettazione §26

| # | Criterio | Come si verifica |
|---|---|---|
| 1 | Simulare più settimane senza attendere tempo reale | DEV → TEMPO → `+7 DAYS`, `+30 DAYS`, `NEXT MINDLINE SHIFT` |
| 2 | Innescare entrambi i percorsi CONTINUE e BRANCH | DEV → MINDLINE → forzature, poi shift |
| 3 | Generare .mon strutturati senza immagini | ogni .mon nasce con `assetStatus` tutto `waiting` |
| 4 | Batch-generare candidati per QA | DEV → GENERA → `GENERATE 10/50/200`, con distribuzioni e controlli |
| 5 | Esportare un pacchetto Asset Request completo | Profilo → ASSET → `ESPORTA ASSET REQUEST` |
| 6 | Prompt di rotazione tecnicamente sufficiente | `02_ROTATION_SPRITE_PROMPT.txt`: griglia, angoli, consistenza assoluta, registrazione, output |
| 7 | Gli asset importati compaiono subito | DEV → ASSET → trascina; risolve contro il manifest |
| 8 | Nessun asset mancante blocca il flusso | segnaposto espliciti ovunque; `npm run verify` percorre tutto a slot vuoti |
| 9 | Nessun controllo DEV senza dev mode | il pannello e il suo trigger esistono solo con `?dev=1` |
| 10 | Sostituire la pipeline manuale con un'API non richiede riprogettare | `engine/` e `assets-pipeline/` sono funzioni pure dietro firme stabili |

`npm run verify` copre 1, 2, 3, 8 e 9 in automatico, e fallisce su qualunque
errore di console.

---

## Cosa NON c'è in v1

Schermate di §12 fuori scope in questa versione: **01** SYSTEM BOOT, **02** THE
PACT, **03** PERSONALITY / SIGNAL SCAN, **08** DAILY SCAN, **10** WEEKLY REPORT,
**21** SETTINGS. Non sono omissioni: sono scope concordato. Il campo
`UserState.scanAnswers` esiste già e aspetta la schermata 03.

Le voci che la spec marca 🟡 TO FINALIZE sono implementate come **configurazione
tarabile**, non come canone. Sono elencate una per una in
[`docs/OPEN_ITEMS.md`](docs/OPEN_ITEMS.md), con dove stanno e cosa serve per
chiuderle.

---

WHITE FIRST. BLACK STRUCTURAL. SIGNAL ALWAYS.
