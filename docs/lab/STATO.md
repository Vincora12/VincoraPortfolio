# VINZ.LAB — a che punto siamo

## Come è fatto, adesso

**Le pagine sono quelle disegnate da Vincenzo.** Stanno in `docs/lab/design/`
— i cinque `index.html` del pacchetto — e sono la fonte visiva: il CSS in
`src/lab/skin/` è copiato da lì, non riscritto. Le stanze React sono quelle
pagine tradotte, con dietro il motore vero al posto dei dati finti.

🔴 **Non era così alla prima passata.** Avevo copiato nel repo solo i `.md`
del pacchetto e lasciato fuori i cinque HTML: `docs/lab/design/` non esisteva.
Senza quei file davanti ho rifatto il disegno da capo, con le linguette a
cartella del pannello DEV — cioè ho buttato via il lavoro già fatto e l'ho
sostituito con qualcosa di più confuso. Questo file esiste anche per
ricordarlo: **la fonte visiva sta nel repo, non nella memoria di chi
implementa.**

## Le quattro stanze

| Stanza | Disegno | Cosa c'è dietro, davvero |
|---|---|---|
| 🧬 CREATION | `creation-lab.html` | Il flusso a 32 passi con gli ID canonici; quali partono da soli alla schiusa e quali no; cosa ha deciso l'ULTIMA generazione (`lastTrace`); **il duello che impara i tuoi gusti**; il Character Data del .mon attivo; le lezioni vere. |
| 👻 SOUL | `soul-lab.html` | Il renderer SVG: corpo, codina, faccia procedurale, sei strati di movimento, colore dal `.mon` attivo, umore che modula e non sostituisce. Snapshot JSON + passaggio a parole. |
| 🖥 DESIGN | `design-lab.html` | Dentro il telefono, l'iframe che monta le **schermate React vere** con i guardiani che bloccano ogni scrittura. Token letti dal foglio vivo, non ricopiati. |
| ⚙️ SYSTEM | `system-lab.html` | `/api/setup` e `/api/ping` veri; scelta dei modelli; giorni, segnali, deriva e override della simulazione; memorie, umore, opinioni, Build Mode; telemetria delle chiamate. |

## Il pannello DEV resta

`npm run verify:parity` elenca **capacità**, non file: per ognuna dice se si
può fare nel laboratorio o solo da DEV.

Adesso: **18 su 33**. Le 15 che mancano sono l'elenco di cosa resta da
riempire dentro le pagine disegnate — resolver, insegnamento, bio AI, prompt,
import e forgia degli asset, cataloghi, rarità, distribuzioni, prove dei
designer, prova della voce, strumenti, costi, attivazione, reset.

🔒 Finché quella lista non è vuota, DEV non si tocca: toglierlo adesso vuol
dire perdere quindici cose.

## Come si prova

    npm run verify:parity   # cosa vive nel lab e cosa solo in DEV
    npm run verify:lab      # 62 prove con un browser vero

`verify:lab` apre ogni stanza e **sfoglia ogni scheda una per una**, perché
una scheda può essere montata benissimo e aprirsi vuota — e un controllo sul
codice non se ne accorge. Verifica anche che le classi a schermo siano quelle
del disegno, e che non torni il guscio inventato.

## Difetti trovati guardando, non leggendo

- **I comandi sparivano in tema scuro.** `<button>` non eredita il colore: il
  browser gli dà `ButtonText`, che in tema scuro è bianco. Su fondo bianco,
  metà dei comandi erano riquadri vuoti. Il disegno è dichiaratamente chiaro,
  quindi `src/lab/skin/_base.css` lo dichiara.
- **La chat nella preview si vedeva a pezzi.** Il foglio del clone lo importa
  `IntegratedChat`, che la preview non monta apposta (migrerebbe l'archivio
  delle conversazioni). Sembrava che la chat vera fosse fatta male.
- **Il telefono di DESIGN.LAB era alto un quarto.** Nel disegno dentro
  `.phone` c'erano dei `div`; qui c'è un `<iframe>`, e un iframe senza altezza
  dichiarata non riempie il genitore.
- **La codina della Soul si strozzava** a due terzi, spezzandosi in due pezzi
  con un filo in mezzo: il nastro si incrociava sull'ultimo tornante.
- **`angry` era identico ad `annoyed`**: palpebra bassa più inclinazione si
  sommavano e chiudevano gli occhi.
- **Avevo costruito la cosa sbagliata al posto del duello.** Nella scheda
  BUILD c'era già disegnato un banco di allenamento a coppie: due creature, tu
  scegli, e lui impara. Io ci avevo messo un confronto a parità di seme —
  invisibile per giunta, perché nel CSS `.compare` nasce `display:none` e si
  accende con `.compare.show`, e avevo portato il markup senza l'interruttore.

## Non ancora fatto

| # | Cosa | Perché no |
|---|---|---|
| 5 | proposte AI di design, A/B, versioni | Serve il giro backend che restituisce una modifica **strutturata**, mai testo da eseguire. |
| 7 | modifiche AI mirate dentro CREATION | Stessa ragione. |
| 9 | le 15 capacità che restano solo in DEV | Vanno riempite dentro le pagine disegnate, non aggiunte a lato. |
| 10 | togliere DEV | Solo quando `verify:parity` non elenca più niente sotto SOLO DEV. |
| 11 | irrobustimento iPhone | Da fare sul telefono vero. |

## SOUL: perché non è il file del pacchetto

`implementation/src/lab/soul/SoulLab.tsx` importava `../../soul/SoulOrb` e
`../../soul/SoulController`: due file che nel pacchetto **non ci sono**.
Copiarlo avrebbe rotto la build al primo `tsc`.

Quindi il renderer è stato costruito da zero seguendo
`SOUL_V1_IMPLEMENTATION_BRIEF.md` e `reference/soul-master-sketch.png`, dentro
la pagina disegnata in `soul-lab.html`.

⚠️ **Una differenza dichiarata:** il disegno v3.2 dice «per adesso lavoriamo
solo su pallina + faccia, la codina non esiste ancora nel renderer»; il brief
v1 la chiama essenziale. Qui c'è, ma il cursore `WISP HEIGHT` a 0 la fa
sparire — così la scelta resta di Vincenzo invece di essere murata da me.


## Il duello: come impara i tuoi gusti

🔷 «Un A/B test dovrebbe funzionare che mi genera random dei mon ed io scelgo
quale mi piace, così lui inizia ad imparare.»

Sta in CREATION → **BUILD**, ed era già disegnato in `creation-lab.html`.

1. **Blocchi il perimetro**: FAMILY → ARCHETYPE → SIZE. Quello che non scegli
   resta libero di variare.
2. **TRAIN THIS SCOPE** genera N coppie di creature *diverse fra loro*, con il
   generatore vero. `WHY THIS? / TRACE` mostra la traccia vera del motore.
3. **Voti**: A / B / BOTH / NO, con un commento.
4. Dopo abbastanza voti compare **COSA HO IMPARATO**, e con un gesto esplicito
   diventa una **lezione vera** che il resolver legge — `teachResolver`, la
   stessa strada di DEV → INSEGNA.

Tre cose che questo banco fa e che è facile sbagliare:

- **Un valore conta solo quando ha battuto un valore diverso.** Se ANGEL sta da
  tutte e due le parti, il fatto che «vinca» non dice niente: vinceva comunque.
- **Sotto i 3 scontri non si dichiara niente.** Una regola imparata da un caso
  solo entra nel prompt del resolver e ci resta.
- **BOTH e NO restano nel registro ma non contano.** Dicono che ti piacciono
  tutte e due o nessuna, non quale preferisci.

🔒 Il perimetro si blocca **spegnendo il catalogo** per il tempo della
generazione — non esiste un «generami un ANGEL»: la Family la sceglie il
motore dal catalogo. Il catalogo torna com'era in un `finally`, anche se la
generazione fallisce.

🔒 I voti stanno in `vinzlab.training.v1`, separata da `vinzmon.prototype.v4`:
un allenamento non deve poter toccare la creatura vera.


## Il LAB è collegato al .mon? Sì, davvero

Non è un'app a parte e non è una sandbox: **legge e scrive la stessa memoria**
di VINZ.MON (`vinzmon.prototype.v4`), quindi la stessa creatura.

Verificato con un browser vero:

| | giorno | build mode |
|---|---|---|
| app normale, prima | 1 | off |
| il LAB legge | 1 | off |
| `RUN 1 COMPLETE DAY` dentro il LAB | **2** | off |
| `TURN ON BUILD MODE` dentro il LAB | 2 | **on** |
| riapro l'app normale | **2** | **on** |

Quali stanze scrivono, in concreto:

| Stanza | Scrive? |
|---|---|
| ⚙️ SYSTEM · SIMULATION | **sì** — giorni, segnali, deriva, override. Irreversibile: un giorno passato non torna. |
| ⚙️ SYSTEM · MEMORY | **sì** — la Build Mode è quella vera, vale anche nella chat normale. |
| ⚙️ SYSTEM · AI | **sì** — la scelta del modello è quella che userà il .mon. |
| 🧬 CREATION · BUILD | no per le creature (nascono e si buttano), **sì** se premi INSEGNA. |
| 🧬 CREATION · FLOW / STATE / HISTORY | no, solo lettura. |
| 🖥 DESIGN | no: i guardiani bloccano scritture e richieste. |
| 👻 SOUL | no: legge il colore del .mon, esce un file. |

🔴 E questo **mancava a schermo**. CREATION porta scritto «PRODUCTION = READ
ONLY» ed è vero lì — ma quella frase, letta all'ingresso, si estende da sola
al resto ed è falsa in SYSTEM. Adesso SIMULATION e MEMORY hanno il loro
cartello.

⚠️ **Con la chiave attiva le modifiche vanno anche sul server** e da lì su
qualsiasi altro dispositivo: non restano nel browser dove le hai fatte.


## Le immagini del duello

🔷 «Si devono generare delle immagini: la clicco, l'avvio, e poi lui mi manda
la notifica quando è pronto e faccio l'A/B test.»

In BUILD c'è l'interruttore **CON IMMAGINI**, e dice quante ne stai per pagare
prima di partire (due per duello). Le carte si riempiono man mano.

⚠️ **Un limite vero, da sapere.** Le immagini non si possono generare sul
server e lasciare lì: la strada in background di `/api/ai` esiste solo per il
TESTO — `startBackground` manda istruzioni e riceve parole. Le immagini passano
da `/v1/images/generations`, che è sincrono. Quindi:

- il lavoro gira **nella pagina**;
- se resti con l'app aperta, arriva la notifica e basta;
- se chiudi l'app il disegno **si ferma dove è arrivato**;
- ma **non si perde**: ogni immagine finita è già in IndexedDB, e riaprendo il
  laboratorio riprende da lì invece di ripagare.

🔒 Una alla volta, di proposito: sedici richieste insieme sbattono tutte
insieme contro il tetto di spesa e si perdono tutte e sedici. In fila, il primo
rifiuto ferma il resto.

🔒 La notifica passa da `registration.showNotification` e non da
`new Notification`: su iPhone, in un'app della schermata Home, quest'ultima non
esiste.

## Modificare il flusso

Ogni passo che si può toccare porta i suoi comandi dentro il `<details>`:

- **cataloghi** (Family, affinità, ruolo, stile, umore, resa, designer) →
  acceso / spento;
- **pesi** (ottica, stato dei capelli, taglio) → da 0 a 5.

E ognuno ha **PROVA · 200 CREATURE**, che genera davvero e conta cosa è uscito.

🔷 L'esempio di Vincenzo, verificato: `OPTICAL EDITORIAL` esce al 7,5% quando
tutto è a caso; spinto a ×5 sale al 22,5%.

🔒 A pesi tutti uguali il motore genera **identico a prima**, bit per bit:
`pick` fa `floor(rng()*n)` e `pickWeighted` con pesi a 1 consuma lo stesso
singolo `rng()`. Se `verify:batch` diventa rosso senza che nessuno abbia
toccato un peso, è `axisTuning.ts` ad aver sbagliato.


## «Nasce sempre ANGEL»

🔷 «In questo momento la generazione fa solo ANGEL. Devo vedere una sezione
dove questa cosa è selezionata — nel flow — e devo poterla disabilitare.»

Era vero. **Misurato: 400 generazioni, 100% ANGEL.** E non lo diceva niente.

⚠️ La causa NON era quella che sembrava. In `store.ts` c'è
`allowedArchetypes: angelArchetypesForStage(0)` — una scala di archetipi
d'angelo — ma quello **non blocca la Family**: se esce DRAGON,
`archetypePool` ripiega su tutti gli archetipi del drago. Togliendolo, restava
comunque 100% ANGEL.

La causa vera era `TEST_PHASE` in `generation-config.ts`:

    enabled: true, family: 'ANGEL', size: 'TINY', characterDesigner: 'KEN SUGIMORI'

Tre assi fermi, scritti nel codice, senza nessun comando.

**La fase non è un difetto.** È un'ancora chiesta apposta: se ogni creatura
cambia anche specie, taglia e disegnatore, non si capisce mai se due forme
sono diverse per merito del generatore o perché sono due cose diverse. Quello
che era sbagliato è che fosse **invisibile e immobile**.

Adesso:

- il flusso lo dice **in cima**, prima di ogni altro cartello;
- il comando sta **dentro** i passi 04 FAMILY, 07 SIZE e 11.5 CHARACTER DESIGN
  DNA — la domanda «perché esce sempre un angelo?» nasce guardando la Family,
  e la risposta deve stare lì;
- si spegne, si cambia valore, e si rimette com'era nel codice.

Misurato dopo:

| | famiglie |
|---|---|
| fase attiva (predefinito) | ANGEL 100% |
| fase spenta | 17 famiglie, la più alta al 7,8% |
| fase ferma su DRAGON | DRAGON 100% |
| rimessa com'era | ANGEL 100% |

🔒 **Il generatore e il prompt del resolver leggono la stessa fase.** Se
`taste.ts` avesse continuato a leggere la costante, il prompt avrebbe detto
«FAMILY = ANGEL» mentre nasceva un DRAGON: la creatura sarebbe arrivata con
addosso le istruzioni per un angelo. Nessun errore, risultato sbagliato con
l'aria di essere giusto.
