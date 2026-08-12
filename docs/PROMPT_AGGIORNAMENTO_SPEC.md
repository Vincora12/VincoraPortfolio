# Prompt per l'AI che aggiorna la MASTER SPEC

Da incollare all'AI che tiene aggiornato il documento. Prodotto il 2026-08-12,
dopo la lettura di `VINZ_MON_MASTER_SPEC_v1.6_IOS_APP_INTENTS_ROADMAP`.

---

Stai lavorando alla **VINZ.MON MASTER SPEC**. Il tuo compito non è aggiungere
un altro livello in fondo: è **consolidare il documento in una v1.7 unica e non
contraddittoria**.

## Il problema da risolvere

Il documento attuale è stratificato. Il corpo è la v1.0, e sopra ci sono
aggiornamenti v1.2, v1.3, v1.4, v1.5 e la roadmap iOS incollati in coda. Ogni
livello sostituisce pezzi dei precedenti, ma **il testo vecchio è rimasto
dentro, ancora marcato 🔒**. Il risultato è che regole opposte sono entrambe
dichiarate come decise, e chi implementa non può sapere quale vale.

Ci sono anche **numeri di sezione duplicati: due §34, due §35 e due §36**.

## Regole strutturali

1. **Una sola numerazione**, senza duplicati. Rinumera tutto.
2. **Quando una regola è superata, cancellala dal corpo.** Non lasciarla con
   una nota accanto. Tieni in fondo un'appendice `SUPERSEDED` con **una riga
   per regola rimossa**: cosa diceva, cosa la sostituisce. Serve a chi ha letto
   una versione vecchia, non è un archivio del testo intero.
3. **Un solo nome di prodotto.** Oggi il documento usa **DIGIVINZ** (§1),
   **VINZ.MON** (§49) e **VINZ.VERCE** (livelli nuovi). Scegline uno e
   applicalo ovunque, incluso il titolo. Se restano due nomi diversi per due
   cose diverse — il prodotto e la creatura — dillo esplicitamente in una riga
   all'inizio.
4. **Ogni regola tiene il suo stato**: 🔒 decisa, 🟡 da tarare, 🔴 rimandata.
   Una regola senza stato è un errore.
5. **Non ripetere le tassonomie della GENERATION BIBLE v2.1.** Quel documento
   resta la fonte di verità per Family, Archetipi, Affinity, Role, Fashion,
   Mood, Size, voce, rarità e prompt compiler. La MASTER SPEC deve **puntarci**,
   non ricopiarne i contenuti: due copie divergono alla prima modifica. Dove
   oggi la MASTER SPEC elenca valori di catalogo, sostituisci con un rimando.

## Decisioni da recepire

Queste sono state prese dopo la v1.6 e vanno scritte come canone.

### Progressione

- **Incubazione: 7 giorni.** Salta la ripetizione dei 28 giorni ovunque
  compaia. Se manca un giorno, l'incubazione **non si azzera**: il giorno resta
  aperto e l'hatch aspetta sette giorni validi.
- **Una sola valuta visibile: SYNC.** Niente XP, niente DISC come valute.
  Massimo **+1 SYNC per giorno di calendario**, qualunque sia la quantità di
  cose registrate.
- **Tre Daily Signals: FOOD, WORKOUT, MOOD.** Stati `UNKNOWN / KNOWN /
  NOT_APPLICABLE`. `WORKOUT = REST DAY` vale KNOWN. Configurabili da DEV.
- **Micro-Growth ogni 7 giorni sincronizzati**: stessa forma, un dettaglio che
  matura. Nome, Family e silhouette non cambiano.

### Form Evolution — correzione importante

La v1.6 dice che a 28 giorni la Form Evolution «diventa disponibile» ma non
dice se è obbligatoria né quanto cambia. Le due cose vanno fissate:

- **È un'offerta, non un obbligo.** A 28 giorni sincronizzati compare la
  possibilità. L'utente può rimandarla e continuare con la forma attuale senza
  perdere niente. La progressione non si blocca e i giorni continuano a
  contare.
- **La nuova forma resta nello stesso registro: non è una rigenerazione.**
  Una parte degli assi sopravvive, il resto cambia. Due esempi che devono
  restare possibili: *resta la Family e cambia tutto il resto*, oppure *resta
  tutto il resto e cambia solo la Family*.
  Scrivi la regola come **ancora di continuità**: a ogni Form Evolution il
  sistema sceglie quali assi tenere fermi, e non li può tenere fermi tutti né
  cambiarli tutti. Definisci le combinazioni ammesse.
  ⚠️ **Questa regola è in conflitto con GENERATION BIBLE §23**, che per i
  branch impone di cambiare almeno 4 assi su 7. Vanno riconciliate:
  §23 descriveva la nascita di una creatura diversa, qui parla la stessa
  entità che si trasforma. Dillo esplicitamente e correggi il rimando.

### Identità

- **VINZ.MON è una sola entità.** Non muore, non viene sostituita, non passa la
  relazione a un'altra creatura. Le forme sono configurazioni della stessa
  persona. Formato canonico: `VINZ.MON // FORM: VAZIEL.mon`.
- **Vz.mon non esiste.** Nessuna creatura radice, nessun nome di partenza.
- **SLIME non è una Family.** Resta disponibile come Affinity.
- **Una memoria sola, continua.** La forma è un metadato sul ricordo, non un
  contenitore separato. Nessuna schermata deve dire o suggerire che si saluta
  qualcuno.

### Appearance

- **Le Appearance canoniche sono quattro**: DESIGNER TOY 3D, INK, CEL, ELASTIC
  CARTOON.
- **DOODLE non è una Appearance.** È il linguaggio visivo della BIO / file
  personale e basta. La §54 della v1.6 va corretta: elenca cinque stili e
  include DOODLE fra le Appearance canoniche. Il master prompt di DOODLE resta,
  ma spostato fra gli asset della BIO, non fra le Appearance.

## Contraddizioni interne da chiudere

Per ognuna, il documento oggi dichiara **entrambe** le versioni come decise.

| Dove | Cosa dice | Cosa deve dire |
|---|---|---|
| §3 vs v1.4 | 28 giorni di SCANNING 🔒 / 7 giorni | 7 giorni |
| §7 vs §36 vs v1.4 | mutazione ogni 5–10 giorni 🔒 / «non cambiare finché non deciso» 🟡 / ogni 7 giorni sincronizzati | ogni 7 giorni sincronizzati |
| §36 «Consistency notes» | Vz.mon è la radice, SLIME è sua 🔒 | rimuovere: la v1.2 cancella Vz.mon |
| §34.1 | SLIME esclusiva di Vz.mon 🔒 | rimuovere per lo stesso motivo |
| §54 vs GENERATION BIBLE §12 | cinque Appearance con DOODLE / quattro, DOODLE solo BIO | quattro, DOODLE solo BIO |
| §53 vs GENERATION BIBLE §15 | bande COMMON…**LEGENDARY / SECRET** / COMMON…**MYTHIC / SINGULAR** | **decidere e allineare i due documenti**: i primi quattro livelli coincidono, gli ultimi due hanno nomi diversi |
| §1 vs §49 vs v1.2+ | DIGIVINZ / VINZ.MON / VINZ.VERCE | un nome solo |

## Cosa manca e va scritto

- **Le domande della schermata di Personality Scan.** S03 definisce solo il
  formato: una domanda per schermata, indice tipo `07 / 12`, 2–4 risposte
  (alcune testuali, alcune silhouette/materiali/simboli), CTA `LOCK SIGNAL`,
  e il divieto assoluto di far scegliere la Family. **Le domande vere non
  esistono.** Servono, con l'indicazione di quale vettore latente alimenta
  ciascuna risposta.
- **La MINDLINE è usata ma mai definita** in questo documento: compare solo
  nei livelli nuovi, dati per scontati. Ora che le forme non sono creature
  separate, va ridefinito cosa significa un ramo. Se la definizione vive nella
  MASTER SPEC v1.2 §7, dillo e rimanda.
- **Il rapporto con le 31 schermate di §19.** Sono un'architettura UX completa
  e diversa da quella su cui è stato costruito il prototipo. Va detto se §19
  è ancora valida, se è superata dai livelli nuovi, o quali schermate
  sopravvivono.

## Cosa NON cambiare

- Il modello di salute a sei stat (FORM / ATK / SPD / DEF / REC / CARE),
  CONDITION come stato del giorno, la separazione fra salute e punteggi di
  gioco.
- «Dato mancante = sconosciuto, mai fallimento».
- Il divieto di vergogna su corpo, cibo, malattia o salute, e il divieto di
  trattare una Family come premio o punizione.
- Il Prompt Compiler e le regole di identità visiva.
- Il fatto che malattia, viaggio e riposo non vengano puniti.

## Come deve uscire

Un documento unico, leggibile dall'inizio alla fine senza dover sapere cosa è
stato scritto prima. Se una sezione non si può risolvere perché manca una
decisione, marcala 🔴 e **dillo in una lista in cima**, invece di lasciare due
regole opposte nel corpo.
