# V2 ISSUES — requisiti registrati per la ricostruzione pulita

Backlog leggibile dei problemi imparati usando **VINZ.MON PROTOTYPE V1**
(`docs/PROTOTYPE_V1_STATUS.md`), destinati a informare **VINZ.MON V2**,
non a diventare inviti a rifattorizzare V1 adesso.

**Non è**: Mem0, cronologia della Chat, Runtime Log, localStorage, bug
reporting automatico. **È**: conoscenza di prodotto — cosa deve fare V2 —
decisa esplicitamente dall'utente, mai da un errore a caso.

## Come si aggiorna

La fonte canonica è runtime, server-side: `/api/v2-issues` (Netlify Blobs
`vinzmon-v2-issues`), scritta quando dici a VINZ.MON in Chat qualcosa come
*«Segna per la versione finale che X»*. Questo file è la sua
rappresentazione leggibile — va rigenerato/aggiornato a mano quando serve
consultarlo come documento di progetto, non è il posto dove editare.

`LAB → SYSTEM → V2 ISSUES` mostra l'elenco live in sola lettura.

⚠️ **Il negozio runtime parte vuoto.** I 8 issue qui sotto sono il set
iniziale curato alla chiusura del prototipo, scritti direttamente in
questo file dall'evidenza raccolta durante lo sviluppo — non sono ancora
nel negozio runtime. Per portarli anche lì, ridicendoli a VINZ.MON nello
stesso ordine si ottengono gli stessi ID (il server assegna `V2-NNN` in
sequenza da 1).

---

## V2-001 — First-turn integrity

AREA: CHAT
TYPE: BUG / ARCHITECTURE
OBSERVED IN: PROTOTYPE V1

OBSERVATION:
Il primo messaggio di una chat nuova (a volte con tutta la conversazione
successiva) può sparire dalla vista, mentre il contenuto risulta comunque
arrivato al modello/alla memoria. Confermato su device reale, con più
meccanismi distinti che producono lo stesso sintomo in momenti diversi
del ciclo di vita della sessione.

EXPECTED FINAL BEHAVIOR:
Il primo messaggio si comporta in modo deterministico e resta nella
conversazione, sempre — nessuna finestra in cui può sparire.

FINAL REQUIREMENT:
L'architettura finale della Chat deve avere un unico proprietario della
timeline e un unico percorso di invio deterministico (vedi V2-002).

STATUS: OPEN

---

## V2-002 — Single ownership della timeline di Chat

AREA: CHAT
TYPE: ARCHITECTURE
OBSERVED IN: PROTOTYPE V1

OBSERVATION:
In V1 più meccanismi indipendenti competono per lo stato del thread:
sessione locale non promossa, gate di ownership della storia,
attribuzione di operazione per finestra temporale, watcher di mutazione.
Ognuno risolve un sintomo, nessuno è l'unico proprietario — e quando un
meccanismo protegge il thread A, un altro può comunque agire sul thread B.

EXPECTED FINAL BEHAVIOR:
Un solo proprietario decide chi può scrivere sulla timeline in un dato
momento; nessuna correttezza dipende da più copie che vincono corse
runtime fra loro.

FINAL REQUIREMENT:
Un solo Chat timeline owner, un solo percorso di invio deterministico,
nessun guard basato su timing.

STATUS: OPEN

---

## V2-003 — History hydration non deve mai sovrascrivere stato live

AREA: CHAT
TYPE: ARCHITECTURE
OBSERVED IN: PROTOTYPE V1

OBSERVATION:
Una lettura di storia (locale o server) partita quando il thread era
ancora vuoto può risolversi DOPO che il thread è già cresciuto dal vivo, e
se applicata rimpiazza il contenuto reale con quello letto — vecchio o
vuoto. In V1 questo è stato mitigato con un gate esplicito, non escluso
per costruzione.

EXPECTED FINAL BEHAVIOR:
Una lettura di storia può idratare un thread vuoto, mai sostituire un
thread che ha già acquisito stato live.

FINAL REQUIREMENT:
Il contratto di history hydration deve essere strutturale (un thread con
stato live rifiuta ogni idratazione tardiva), non un guard aggiunto sopra
un'architettura che permette la corsa.

STATUS: OPEN

---

## V2-004 — localStorage non è un modello di stato condiviso scalabile

AREA: STORAGE
TYPE: ARCHITECTURE
OBSERVED IN: PROTOTYPE V1

OBSERVATION:
Lo stato applicativo cresce (memoria, giornate, cronologia) e
localStorage ha limiti pratici di dimensione e di sopravvivenza (Safari
iOS può liberarlo senza preavviso). In V1 localStorage funge sia da cache
sia, in alcuni percorsi, da fonte che può competere col server.

EXPECTED FINAL BEHAVIOR:
localStorage è solo cache/fallback per l'uso offline — mai una copia che
compete per essere la verità.

FINAL REQUIREMENT:
Una sola fonte di verità server-side per dominio di dato condiviso;
localStorage rigenerabile da lì, mai l'inverso.

STATUS: OPEN

---

## V2-005 — Snapshot server monolitico non è un modello di stato scalabile

AREA: STORAGE
TYPE: ARCHITECTURE
OBSERVED IN: PROTOTYPE V1

OBSERVATION:
`/api/state` salva l'intero stato applicativo come un unico blob JSON con
un tetto fisso (2 MB, `netlify/functions/state.ts`). È già stato
necessario distinguere esplicitamente un salvataggio troppo grande da un
guasto di rete perché i due si confondevano lato client.

EXPECTED FINAL BEHAVIOR:
Lo stato che cresce senza limite naturale (memoria, cronologia, giornate)
non deve vivere nello stesso blob che deve restare piccolo e veloce da
scrivere ad ogni interazione.

FINAL REQUIREMENT:
Dominio per dominio: uno store per tipo di dato che cresce, invece di un
unico snapshot applicativo con un tetto condiviso.

STATUS: OPEN

---

## V2-006 — Contratto di memoria: salvato, recuperato, ricordato

AREA: MEMORY
TYPE: ARCHITECTURE
OBSERVED IN: PROTOTYPE V1

OBSERVATION:
V1 ha più sistemi paralleli che si chiamano tutti "memoria" in qualche
forma: `Memory[]` locale (`buildMemoryBlock`), promemoria (`ricorda_di`,
che scrive un reminder anche se il metodo si chiama `remember`), e
retrieval semantico Mem0. La distinzione fra "salvato", "recuperato dal
retrieval" e "il .mon se lo ricorda davvero adesso" non è esplicita nel
codice né nella conversazione.

EXPECTED FINAL BEHAVIOR:
Un utente (o uno sviluppatore) può sempre distinguere: è stato salvato?
È stato recuperato in questa conversazione? Il .mon lo sta usando adesso?

FINAL REQUIREMENT:
Un contratto di memoria esplicito con questi tre stati distinti, e un
solo sistema canonico invece di tre che si sovrappongono nel nome.

STATUS: OPEN

---

## V2-007 — Coerenza del routing rispetto al retrieval di memoria

AREA: MEMORY
TYPE: ARCHITECTURE
OBSERVED IN: PROTOTYPE V1

OBSERVATION:
`src/assistant-original/netlify-runtime.ts` instrada ogni messaggio su due
percorsi (BASE, LOCAL_TOOLS) in base a un'euristica testuale
(`shouldUseLocalTools`). Solo BASE esegue retrieval Mem0; LOCAL_TOOLS lo
salta sempre, per costruzione — non per una decisione esplicita legata al
contenuto del messaggio. Un messaggio che tocca sia dati ME sia qualcosa
che il .mon dovrebbe ricordare perde il retrieval senza che nessuno lo
decida davvero.

EXPECTED FINAL BEHAVIOR:
Il retrieval di memoria non dipende accidentalmente da quale percorso di
risposta è stato scelto per altri motivi (strumenti locali disponibili).

FINAL REQUIREMENT:
La decisione "recupera memoria per questo turno" deve essere esplicita e
indipendente dal routing fra percorsi di risposta.

STATUS: OPEN

---

## V2-008 — Salvataggio esplicito della memoria

AREA: MEMORY
TYPE: FEATURE / ARCHITECTURE
OBSERVED IN: PROTOTYPE V1

OBSERVATION:
Ogni messaggio utente attiva una cattura semantica automatica
("fire-and-forget... isolata dalla latenza della risposta",
`netlify-runtime.ts`) con inferenza generica (`infer:true`-style), senza
un percorso distinto per quando l'utente dice esplicitamente "ricorda
questo". Le due cose — inferenza automatica e richiesta esplicita — non
hanno contratti diversi.

EXPECTED FINAL BEHAVIOR:
Quando l'utente dice esplicitamente "ricorda questo", il salvataggio è
deterministico e confermato — non affidato alla stessa inferenza generica
di ogni altro messaggio.

FINAL REQUIREMENT:
Un percorso di salvataggio esplicito della memoria, distinto dalla
cattura automatica per inferenza, con conferma solo dopo persistenza
riuscita — lo stesso principio già applicato qui per V2 Issues stesso
(vedi CAPTURE FLOW in `src/ai/v2Issues.ts`).

STATUS: OPEN
