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
| 🧬 CREATION | `creation-lab.html` | Il flusso a 32 passi con gli ID canonici; quali partono da soli alla schiusa e quali no; cosa ha deciso l'ULTIMA generazione (`lastTrace`); A/B che chiama `generateFirstMon` a parità di seme; il Character Data del .mon attivo; le lezioni vere. |
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
    npm run verify:lab      # 47 prove con un browser vero

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
- **Il banco A/B sembrava morto.** Girava, generava e chiamava `setEsito` — ma
  nel CSS del disegno `.compare` nasce `display:none` e si accende con
  `.compare.show`: avevo portato il markup e non l'interruttore. Stesso
  difetto dei pulsanti bianchi su bianco.
- **E non aveva niente da confrontare:** generava due volte con lo stesso seme
  e le stesse impostazioni, quindi le colonne erano identiche per costruzione.
  Adesso a sinistra c'è la creatura con le impostazioni **di serie**, a destra
  quella con le **tue**, e le impostazioni vengono rimesse com'erano.
- **E il messaggio mentiva:** usava `isCatalogTuned()`, che dice «c'è qualcosa
  di spento» — e qualcosa è spento sempre, perché alcune voci nascono spente.
  Diceva «hai delle impostazioni tue» a chi non aveva toccato niente.

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
