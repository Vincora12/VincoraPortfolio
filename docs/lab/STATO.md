# VINZ.LAB — a che punto siamo

Questa cartella è il pacchetto scritto con Codex, copiato qui **integro**: è la
specifica, non il codice. Il codice sta in `src/lab/`.

`VINZ_LAB_FULL_INTEGRATION.md` è la specifica canonica.
`CODEX_IMPLEMENT_VINZ_LAB.txt` elenca gli undici milestone.

## Fatto

| # | Milestone | Stato |
|---|---|---|
| 1 | ingresso `/#/lab` + LabApp + manifest dedicato + metadati iPhone | ✅ |
| 2 | guscio del laboratorio + quattro stanze sorelle | ✅ |
| 3 | SOUL runtime + SOUL.LAB (LIVE / SHAPE / FACE / MOTION / COLOR / HISTORY) | ✅ |
| 4 | DESIGN.LAB: preview a componenti veri + ispettore + guardiani | ✅ |
| 6 | CREATION.LAB: flusso vero, cataloghi, rarità, distribuzioni | ✅ |
| 8 | SYSTEM.LAB: setup, AI, simulazione, memoria, consumi | ✅ |
| 9 | migrazione della parità DEV → LAB, con controllo automatico | ✅ |

## Non ancora

| # | Milestone | Perché no |
|---|---|---|
| 5 | proposte AI di design / A-B / versioni | Il pannello ha il posto (`CREA PROPOSTA`) e il commento che dice cosa deve mandare al backend. Non è collegato a nessun modello. |
| 7 | modifiche AI mirate dentro CREATION | Stessa ragione: serve il giro backend che restituisce una modifica STRUTTURATA, mai testo da eseguire. |
| 10 | togliere il vecchio DEV | **La parità è verde** (`npm run verify:parity`), quindi adesso si può — ma è una decisione, non un passo tecnico, e va presa guardando il laboratorio sul telefono. |
| 11 | irrobustimento iPhone | Da fare sul telefono vero: qui non c'è un iPhone. |

## Come si prova

    npm run verify:parity   # ogni strumento di DEV vive anche nel laboratorio
    npm run verify:lab      # 39 prove con un browser vero

`verify:parity` legge dal codice cosa monta `DevPanel` e cosa montano le
stanze, e fallisce se una sezione è rimasta indietro o è finita in due posti.
È la riga che autorizza il milestone 10: finché è rossa, togliere DEV è
togliere e basta.

`verify:lab` apre le stanze in un browser e le sfoglia scheda per scheda —
13 in CREATION, 10 in SYSTEM — perché una scheda montata può benissimo
aprirsi vuota, e un controllo sul codice non se ne accorge.

## Scostamenti dal pacchetto, e perché

1. **Le porte sono quattro, non tre.** `LabApp.tsx` del pacchetto montava
   `SoulLab` su `#/lab/soul` ma non disegnava la porta: a SOUL si arrivava solo
   scrivendo l'indirizzo a mano.

2. **La CHAT monta `ChatSurface`, non `IntegratedChat`.** La superficie è
   quella vera; il runtime sotto vive in memoria. `IntegratedChat` migra le
   conversazioni salvate e parla col thread adapter sul server: aprire
   DESIGN.LAB avrebbe migrato l'archivio delle chat.

3. **`brain.css` viene importato**, perché `src/brain/` adesso esiste.

4. **Cambiare stanza non ricarica la pagina.** Il pacchetto faceva
   `window.location.reload()` a ogni click.

5. **Il campo nero si calcola, non si dichiara.** Dentro MON dipende dalla
   vista, e la vista in preview si può cambiare col dito.

5b. **ME non ha più le sue due schede.** I calendari sono scesi dentro dieta e
   sport. `MeTab` tiene `view`/`onView` nella firma ma non li usa.

6. **La cornice della preview è importata da `App.tsx`, non ricopiata.**
   `MonTab`, `MeTab` e `TabBar` sono ora esportate. Regola del pacchetto:
   «DO NOT COPY THE UI».

## Come si prova

    npm run verify:lab

23 prove: le cinque che il pacchetto chiede a parole, più quella che il
pacchetto non sa provare — che guardare una schermata nel laboratorio **non
scriva** niente in produzione.


## Trovato durante la fusione (non è roba del laboratorio)

Il branch si era mosso di ~100 commit mentre il laboratorio veniva costruito.
Fusi senza forzare niente; unico conflitto vero, `MeTab`, risolto tenendo il
corpo nuovo. Ma due cose restano rotte, e non sono state toccate perché non
sono mie da decidere:

1. **`npm install` fallisce.** `@schedule-x/calendar@4.6.1` vuole
   `temporal-polyfill@0.3.0`, `package.json` chiede `^1.0.4`. Anche `npm ci`
   fallisce. Qui ci si è installati con `--legacy-peer-deps`; se Netlify
   installa senza quel flag, **il deploy non parte**.

2. **15 decisioni non sono più nel codice** (`npm run verify:features`).
   Fallivano già prima della fusione — verificate una per una contro
   `origin`. Alcune sono decisioni cambiate di proposito (il calendario non è
   più una schermata a sé) e vogliono l'ago ripuntato; altre sembrano
   regressioni vere (il sigillo tornato globo, il palco che mostra
   un'immagine mentre ne approvi un'altra, la preferenza dal browser che
   torna a essere un comando). Vanno guardate una per una.


## SOUL, e perché non è il file del pacchetto

`implementation/src/lab/soul/SoulLab.tsx` importava `../../soul/SoulOrb` e
`../../soul/SoulController`: due file che nel pacchetto **non ci sono**.
Copiarlo avrebbe rotto la build al primo `tsc`.

Quindi la Soul è stata costruita da zero seguendo `SOUL_V1_IMPLEMENTATION_BRIEF.md`
e, soprattutto, `reference/soul-master-sketch.png` — che il brief stesso
dichiara «primary visual source of truth». Corpo tondo imperfetto, una fiamma
a zig-zag, due occhi e una bocca. React + SVG + CSS, nessuna libreria.

Le tre facce dello schizzo sono le tre ancore, e la cosa che le tiene insieme
è che sono **lo stesso occhio**: cambia dove arriva la palpebra e di quanto è
inclinata. Assonnato e arrabbiato hanno la palpebra alla stessa altezza —
uno dritta, l'altro obliqua. Se fossero tre forme disegnate a parte sarebbero
tre creature diverse che si somigliano.

Due difetti trovati guardando i render, non leggendo il codice:
la fiamma era alta il doppio della testa e si leggeva come un fulmine di
passaggio; e `angry` sommava palpebra bassa e inclinazione, chiudendo gli
occhi fino a renderlo identico ad `annoyed` — nessun errore, nessuna
eccezione, solo due facce uguali. Adesso `verify:lab` confronta i path veri
dell'SVG delle tre ancore e fallisce se ne restano meno di tre distinte.
