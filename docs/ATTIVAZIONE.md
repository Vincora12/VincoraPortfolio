# Attivare VINZ.MON e fare prove sensate

Questa è la sequenza completa, in ordine. Ogni passo si può verificare prima di
passare al successivo: se qualcosa non va, sai **quale** pezzo manca invece di
guardare una schermata che dice «non funziona».

Senza niente di tutto questo l'app gira lo stesso — la creatura nasce, i giorni
si chiudono, i prompt si copiano. Quello che si accende qui sono due cose sole:
la **voce** (che ti risponda con parole sue) e il **compilatore** (che riscriva
i prompt immagine invece di concatenare frammenti).

---

## Prima di tutto: il tetto di spesa

Fallo **prima** di generare le chiavi, non dopo.

- **OpenAI** — platform.openai.com → Settings → Billing → *Limits*. Metti un
  budget mensile e una soglia di allarme.
- **Anthropic** — console.anthropic.com → Billing → *Spend limits*.

L'app ha già un tetto suo di **$34.60 al mese** (~30 €) e si blocca da sola con
un 402 quando lo raggiunge, ma quello difende solo da sé stessa: una chiave
senza tetto la può spendere qualunque altra cosa la usi. Il tetto del fornitore
è l'unica protezione che non si può aggiungere dopo.

---

## 1 · Collegare Netlify al repository

✅ **Fatto.** Il sito è **`fluffy-cocada-88715c.netlify.app`**, collegato a
`Vincora12/VincoraPortfolio` sul branch `claude/project-prototype-jxjc3d`. Da qui
in avanti ogni push si pubblica da sé; build command e publish directory arrivano
da `netlify.toml`.

> ⚠️ **È un sito nuovo, quindi è un'origine nuova.** Lo stato vive nel
> `localStorage`, che è legato all'indirizzo: il `.mon` che avevi sul vecchio
> indirizzo non si vede qui, e non è un guasto. Si riparte da zero.
>
> Per lo stesso motivo, se il sito va rinominato va fatto **adesso**: rinominarlo
> dopo cambia di nuovo l'URL e fa ricominciare un'altra volta. L'icona vecchia
> sulla schermata Home punta al sito vecchio — va tolta e rifatta.

**Verifica**: apri il sito con `?dev=1` e guarda l'intestazione. C'è la sigla del
commit. Se corrisponde all'ultimo push, il collegamento funziona. Se invece il
deploy è fallito, sta in *Deploys* → il primo della lista, con il log intero.

---

## 2 · Prendere il segreto

Il segreto fa aprire le funzioni solo a te. **Lo genera l'app da sola, una volta,
e lo salva.** Non cambia più: non c'è niente da inventare e niente da incollare.

1. Apri il sito
2. In alto c'è **ATTIVA VINZ.MON** — toccalo
   *(se non lo vedi, è già salvato: DEV → INIZIO → RIVEDI L'ATTIVAZIONE)*
3. Passo 1 · **IL SEGRETO** — tocca **COPIA**

⚠️ Su Netlify, una volta salvato come segreto, **non si può rileggere**. Se ti
serve su un secondo dispositivo, copialo da qui prima — oppure sul dispositivo
nuovo apri *HO GIÀ UN SEGRETO ALTROVE* e incollalo lì.

## 3 · Mettere le variabili su Netlify

*Site configuration* → **Environment variables** → **Add a variable**.

| Nome | Valore | Serve per |
|---|---|---|
| `VINZMON_TOKEN` | il segreto del passo 2 | far aprire le funzioni solo a te — **l'unica davvero obbligatoria** |
| `OPENAI_API_KEY` | platform.openai.com → API keys | le immagini, chi scrive i prompt, **e la voce** se scegli GPT-5.6 Terra |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys | la voce con Claude, e la riflessione settimanale (quella solo lui) |
| `GOOGLE_API_KEY` | aistudio.google.com → Get API key | leggere le foto dei piatti |
| `MOONSHOT_API_KEY` | platform.moonshot.ai → API keys | solo se scegli Kimi K3 per la voce |

**Nessuna chiave di fornitore è obbligatoria da sola: ne serve almeno una che
sappia dare la voce.** Con la sola `OPENAI_API_KEY` funzionano voce, prompt e
immagini — cioè si può partire con un fornitore solo e aggiungerne dopo.

L'unica cosa che nessun altro sa fare è la **riflessione settimanale**, che resta
su Anthropic.

**Le due opzioni del modulo, e cosa scegliere.**

*Scopes* — sul piano gratuito il radio è bloccato su **Specific scopes**, ma le
spunte sotto dicono già *Builds*, *Functions*, *Runtime*. L'unica che conta è
**Functions**: è lì che gira il codice che legge `process.env`. *Post processing*
è l'iniezione di snippet nell'HTML e non ci riguarda. Quindi va bene com'è.

*Contains secret values* — **spuntala**. Il valore diventa leggibile solo dal
codice che gira sui server di Netlify, non più dall'interfaccia, dall'API o dalla
CLI. Il prezzo è che non potrai rileggerlo: il segreto salvalo anche altrove.

*Values* — spuntando «segreta», Netlify **obbliga** a *Different value for each
deploy context*. Non è un problema: compila **Production** e basta. Il sito è
servito dal branch di produzione, quindi è quello il contesto che conta.
*Deploy Previews* e *Branch deploys* servono alle anteprime delle pull request e
possono restare vuoti.

**Poi ripubblica.** Le variabili nuove entrano in vigore solo con un deploy
nuovo: *Deploys* → **Trigger deploy** → *Deploy site*. È l'errore più comune e
si manifesta come «il segreto non coincide» anche quando coincide.

---

## 4 · Controllare

Torna sul sito, **ATTIVA VINZ.MON**, passo 3 · **CONTROLLA**. Non c'è niente da
incollare: il segreto è già qui.

Tre righe dicono cosa è vero e cosa no:

| | |
|---|---|
| **IL SEGRETO, QUI** | generato e salvato in questo browser |
| **LO STESSO, SU NETLIFY** | il server ci apre, oppure no |
| **UNA CHIAVE CHE PARLA** | almeno una fra OpenAI, Anthropic e Moonshot |

Se la seconda dice `NO`, quasi sempre è perché **non hai ripubblicato** dopo aver
messo la variabile: le variabili nuove entrano in vigore solo con un deploy nuovo.

1. Premi **CONTROLLA ADESSO**
2. Passo 2 · **LE CHIAVI** si popola da solo: ogni variabile dice `C'È` o
   `NON C'È`. Lo dice il server, non il browser — e non torna mai il contenuto,
   solo se esiste. Nessuna è obbligatoria da sola: quello che serve è che
   almeno una sappia dare la voce, e se manca lo dice in chiaro.
3. In alto lo stato passa da `NON ANCORA ATTIVO` ad **`ATTIVO`**.

Il segreto resta in questo browser. Ogni dispositivo va attivato una volta.

Se qualcosa non torna, il messaggio dice **una causa sola** e cosa guardare:

- *«Le funzioni non rispondono»* → il deploy non è ancora finito, o stai
  girando in locale, dove `/api` non esiste.
- *«Il segreto qui e quello su Netlify non coincidono»* → o l'hai incollato
  incompleto, o non hai ripubblicato dopo averlo messo su Netlify.
- *«VINZMON_TOKEN non è configurato sul server»* → passo 3 saltato.

---

## 5 · Scegliere chi risponde e chi scrive

Due decisioni separate, con due criteri diversi.

**Passo 4 · CHI DÀ LA VOCE** — porta le tue conversazioni. Si sceglie a
orecchio, e ogni opzione dice dove finiscono i dati. C'è un pulsante di prova:
manda una frase vera e ti fa vedere la risposta.

Sei opzioni, con il prezzo scritto sotto ognuna:

| Voce | $/milione (in / out) | Nota |
|---|---|---|
| GPT-5.6 Luna | $0,20 / $1,20 | il livello piccolo: venticinque volte meno di Sol |
| GPT-5.6 Terra | $2 / $12 | il livello di mezzo, stessa chiave delle immagini |
| Kimi K3 | $3 / $15 | Moonshot, azienda cinese: leggi le condizioni sui dati |
| Claude Sonnet 5 | $3 / $15 | |
| Claude Opus 5 | $5 / $25 | quello con cui il personaggio è stato scritto e tarato |
| GPT-5.6 Sol | $5 / $30 | il livello grosso di OpenAI |

Nessuna di queste righe dice quanto costa *un messaggio*, ed è voluto: dipende
da quanto scrivi e da quanto risponde. Il conto vero, dopo un po' d'uso, sta in
**DEV → SPESA → COSTI**.

**GPT-5.6 Cyber** ($12,50 / $75) esiste e non è nella lista: richiede
un'approvazione a parte, è pensato per ricerca di vulnerabilità e costa sei
volte Sol. Sarebbe un pulsante che fallisce.

Solo le due opzioni Anthropic hanno la ricerca sul web — non perché OpenAI non
ce l'abbia, ma perché il nostro adattatore non la sa ancora chiedere.

Quelle la cui chiave manca sono spente, non nascoste.

**Passo 5 · CHI SCRIVE I PROMPT** — porta solo la descrizione di una creatura,
mai te. Si sceglie sui risultati visivi. Qui il costo per uso si può dire,
perché il tetto d'uscita di una riscrittura è fissato a 8000 token:

| Compilatore | $/milione | a prompt | a creatura (6) |
|---|---|---:|---:|
| GPT-5.6 Luna | $0,20 / $1,20 | ~$0,01 | ~$0,06 |
| GPT-5.6 Terra *(predefinito)* | $2 / $12 | ~$0,10 | ~$0,58 |
| Claude Sonnet 5 | $3 / $15 | ~$0,12 | ~$0,72 |
| GPT-5.6 Sol | $5 / $30 | ~$0,24 | ~$1,44 |

⚠️ Su Luna guarda cosa esce prima di tenerlo: qui il lavoro non è piccolo —
deve sciogliere le contraddizioni fra i livelli (umanoidità contro nomi delle
masse, densità contro numero di sistemi) ed è la cosa su cui un modello piccolo
cede per primo.

**Passo 6 · CHI DISEGNA** — prende quella descrizione e ne fa un'immagine.
**GPT Image 2** (predefinito, il più recente: ragiona prima di disegnare e regge
meglio il testo dentro l'immagine) o **GPT Image 1**, il precedente, quello con
cui sono state fatte le prime prove di questo progetto.

È la voce di spesa più grossa: sei immagini per creatura, quattro o cinque
centesimi l'una.

Le opzioni la cui chiave manca sono spente, non nascoste: si vede subito cosa
mancherebbe per accenderle.

---

## 6 · Le prove sensate

Da qui in poi serve `?dev=1`.

### Il prompt riscritto contro quello concatenato

È la prova che conta: verificare che il compilatore §10 risolva davvero i
personaggi deformi.

1. **DEV → CREATURA → GENERA** — nasce un `.mon` nuovo
2. **DEV → CREATURA → PROMPT IMMAGINI** — c'è il prompt concatenato:
   265 frammenti, il conteggio dei caratteri, la provenienza di ogni blocco
3. **RISCRIVI CON L'AI** — il compilatore lo riscrive una volta
4. **VEDI QUELLO DI PRIMA** commuta fra i due testi: stesso `.mon`, stessi
   fatti, due scritture. **COPIA IL PROMPT** copia quello che stai guardando.
5. Incolla in un modello di immagini e confronta i risultati

**Si scrive una volta sola per creatura**, di proposito: un prompt che cambia a
ogni tocco produrrebbe sei immagini di sei creature diverse. Per un altro giro,
genera un altro `.mon`.

Se la riscrittura perde un vincolo — famiglia, umanoidità, proporzioni, colori —
viene **buttata**, non rattoppata, e resta quella di prima. Te lo dice.

### I character designer, uno per volta

**DEV → CREATURA → PROVE** — è il protocollo §12: fissa tutto tranne un asse e
fa nascere creature vere dal generatore, non campi sovrascritti. Serve a capire
quale designer ti piace davvero prima di spegnere gli altri.

### Accendere e spegnere quello che piace

**DEV → CREATURA → CATALOGHI** — Family, Affinity, Appearance, designer. Quello
che spegni non esce più. `RIPORTA AI PREDEFINITI` torna alla configurazione di
partenza, non riaccende tutto.

### La voce, sul serio

**DEV → VOCE → PROVA** manda una frase e mostra la risposta col modello scelto.
**DEV → VOCE → UMORE E OPINIONI** fa vedere cosa il `.mon` sa e come si sente:
è quello che entra nel briefing prima di ogni risposta.

### Arrivare a una forma nuova

**DEV → TEMPO → `+7 GIORNI`**. La micro-crescita è a 7 giorni sincronizzati, il
cambio di forma a 28. Senza questo pulsante servirebbero 28 giorni veri.

### Quanto stai spendendo

**DEV → SPESA → COSTI** — il contatore vero, quello che il server tiene. Al 75%
del tetto avvisa; a 100% le chiamate si fermano con un 402 dichiarato, non con
un errore.

---

## Cosa resta simulato

Perché le prove valgano quello che valgono, e non di più:

- **I dati del giorno sono finti** (`engine/health.ts` → `simulateDayInput`).
  I dati di salute veri non sono ancora collegati.
- **Il Personality Seed è neutro** finché non esiste la schermata 03.
- **Gli slot immagine nascono vuoti**, per scelta (MS §18A): le immagini si
  mettono a mano, ed è esattamente quello che stai provando.
- **Lo stato vive nel `localStorage`** di quel browser: ogni dispositivo ha la
  sua partita.

Si prova il motore, la voce e i prompt. Non ancora il prodotto sui tuoi dati.
