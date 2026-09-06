# REMOTE CHAT HISTORY V1 — cosa è canonico, come si sincronizza, cosa NON è garantito

Obiettivo del task: la chat di VINZ.MON deve essere la stessa su più
dispositivi, senza riscrivere la chat né la sua UI. Questo documento dice
dov'è la verità, come arriva ad ogni dispositivo, cosa succede quando due
dispositivi scrivono insieme, e il limite reale rimasto.

## Cosa esisteva già (INSPECT)

Il codice, non il blueprint, era già più avanti di quanto il task presupponesse:

- **`IntegratedChat.tsx`** monta `useRemoteThreadListRuntime` con un adapter
  costruito da `createLocalStorageAdapter` (`@assistant-ui/core`), passandogli
  `serverBackedStorage` (`src/system/serverStorage.ts`) come storage. Questo
  NON è localStorage puro: `serverBackedStorage.getItem`/`setItem` fanno da
  ponte verso `/api/user-data`, una funzione Netlify già esistente che scrive
  su **Netlify Blobs** (`vinzmon-user-data`, `consistency:'strong'`).
- `createLocalStorageAdapter` è il pezzo che dà ad assistant-ui l'intero
  contratto `RemoteThreadListAdapter` (list/initialize/rename/archive/delete)
  E il `ThreadHistoryAdapter` (load/append) di UN thread — usando lo storage
  fornito come una chiave-valore generica. Le due chiavi che scrive:
  `assistant-ui-official-chatgpt:threads` (indice dei thread) e
  `assistant-ui-official-chatgpt:messages:<remoteId>` (il repository di UN
  thread).
- `migrateStoragePrefix()` esisteva già e gira ad ogni mount di
  `IntegratedChat`: per ogni chiave locale sotto quel prefisso, se il server
  non ce l'ha la spinge su; se il server ce l'ha già, non la sovrascrive.
  Idempotente per costruzione — non l'ho scritta, l'ho verificata e riusata.
- L'autenticazione era già a segreto condiviso singolo (`VINZMON_TOKEN`,
  confronto a tempo costante, `_shared/auth.ts`) — lo stesso boundary di ogni
  altra funzione dell'app (`/api/state`, `/api/machines`, ...). Non esiste un
  concetto di "utente diverso": l'app è per una persona sola, di proposito
  (vedi il commento in `auth.ts`).

## Il problema reale che NON esisteva già

`createLocalStorageAdapter` fa, per ogni append/rename/archive/delete:
**leggi tutta la chiave, muta un pezzo in memoria, riscrivi tutta la
chiave**. Il suo `KeyedMutationQueue` serializza questo per UNA scheda del
browser — non protegge da NULLA fra due dispositivi diversi (o due schede).
Due client che scrivono la stessa chiave (lo stesso thread, o l'indice dei
thread) nella stessa finestra di tempo potevano sovrascriversi a vicenda:
esattamente G5/G6 del task.

## SOURCE OF TRUTH

**Il server (Netlify Blobs, tramite `/api/user-data`) è la fonte di verità.**
Il client tiene una copia in `localStorage` — mai una seconda fonte
concorrente: ogni lettura reale (`getItem`) interroga il server quando c'è un
token, e il locale è usato solo come cache/fallback quando la rete manca.

## COME SI SINCRONIZZA — la modifica di questo task

**Non si è toccato `createLocalStorageAdapter` (vendor) né la chat.** Si è
reso `/api/user-data` capace di scritture condizionali, e `serverStorage.ts`
capace di usarle **solo per le due chiavi della cronologia chat**:

- `netlify/functions/user-data.ts` — GET ora torna anche l'`etag` di Netlify
  Blobs (`getWithMetadata`). PUT accetta due header opzionali:
  - `If-Match: <etag>` → scrive solo se l'etag corrisponde ancora
    (`store().set(key, value, {onlyIfMatch: etag})`);
  - `X-Only-If-New: 1` → scrive solo se la chiave non esiste ancora
    (`{onlyIfNew: true}`).
  Senza nessuno dei due header, la PUT resta **esattamente com'era**:
  incondizionata. Ogni altro consumatore di questo endpoint generico
  (tuning assi/cataloghi, design tokens, config runtime, chat-trace, icone e
  colori dei thread) non manda questi header e non vede alcun cambiamento.
  Un conflitto (etag non combacia, o la chiave esiste già) torna **409** con
  il valore e l'etag correnti — mai un errore muto.

- `src/system/serverStorage.ts` — traccia in memoria l'ultimo etag letto per
  chiave. `setItem` su `...:threads` o `...:messages:<id>` manda `If-Match`
  se conosce l'etag, altrimenti `X-Only-If-New`. Su un 409, **unisce** (non
  sovrascrive) il valore che stava per scrivere con quello corrente del
  server (`src/system/chatHistoryMerge.ts`) e ritenta, fino a 3 volte. Ogni
  altra chiave continua a fare la PUT incondizionata di sempre.

- `src/system/chatHistoryMerge.ts` — le due funzioni di unione, pure,
  testate isolatamente:
  - `mergeMessageRepositories`: unione dei messaggi per id — nessun
    messaggio scritto da nessuno dei due lati viene mai perso. Sullo stesso
    id vince la versione più recente di QUESTO client (tipicamente la
    propria risposta ancora in streaming). `headId` va al messaggio più
    recente per `createdAt` fra i due candidati.
  - `mergeThreadLists`: unione dei thread per `remoteId` — un thread creato
    da un client non sparisce mai per una scrittura concorrente dell'indice.
    Sullo stesso `remoteId`, vince il campo di chi sta ritentando (l'azione
    in corso su QUESTO client).

## MIGRATION (G7)

Non è stata scritta: esisteva già (`migrateStoragePrefix`), ed è idempotente
per costruzione: al primo avvio di un dispositivo con cronologia solo
locale, la spinge sul server (ora tramite `X-Only-If-New`, quindi se un
ALTRO dispositivo la sta migrando nello stesso istante, il conflitto si
risolve con `mergeMessageRepositories`/`mergeThreadLists` invece che con una
corsa cieca). Ai riavvii successivi il server ce l'ha già: nessuna riscrittura,
nessun duplicato.

## CONCURRENCY — semantica scelta e limite reale

- **Esistenza mai persa**: nessun thread, nessun messaggio scritto da
  qualunque dispositivo sparisce mai per una scrittura concorrente. Provato
  con test reali (unione, non asserzioni sulla fiducia) in
  `scripts/remote-chat-history-check.mjs`.
- **Limite dichiarato**: se DUE dispositivi modificano lo STESSO campo di
  METADATA dello STESSO thread nella stessa finestra di conflitto (es. uno
  rinomina, l'altro lo rinomina diversamente, esattamente nello stesso
  istante), vince chi ritenta per ultimo — non è garantito che sopravvivano
  entrambe le modifiche di quel campo specifico. L'ESISTENZA del thread è
  comunque sempre garantita. Per un'app a un solo utente su pochi dispositivi
  propri, è un limite accettabile e onesto per un Prototype V1, non un bug
  nascosto.
- `headId` in un vero conflitto di branching (due rami diversi dallo stesso
  punto) usa un'euristica per `createdAt`, non una vera fusione di rami:
  nessun messaggio si perde, ma quale head "vince" visivamente può non
  essere perfetto.

## OFFLINE / FAILURE (G8)

Un fallimento di rete (in lettura o in scrittura) non blocca né corrompe:
`getItem` torna la cache locale, `setItem` scrive comunque in locale prima di
tentare la rete e si arrende silenziosamente dopo il fallimento (il prossimo
`setItem` su quella chiave riparte da un `getItem` fresco). Un conflitto che
persiste oltre i tentativi consentiti (3) si arrende allo stesso modo: mai un
loop infinito, mai un crash.

## AUTH (G9)

Nessun cambiamento: `/api/user-data` richiede lo stesso `VINZMON_TOKEN` di
ogni altra funzione. Non esiste un ID utente scelto dal client: la chiave
è solo un namespace dentro lo spazio dell'unico utente autorizzato — lo
stesso boundary già in uso in tutta l'app.

## ATTACHMENTS

Non toccati. Il repository dei messaggi continua a portare i metadata degli
allegati così come `createLocalStorageAdapter` li scrive già; il merge unisce
i messaggi (allegati inclusi, come parte del messaggio) senza mai duplicare
un file binario — non è stata creata nessuna nuova File Library.

## OBSERVABILITY

Un solo evento nuovo, `CHAT_STORAGE_CONFLICT` (`scope:'chat'`), con `status`
`START` per ogni tentativo di unione+ritentativo e `FAIL` solo se anche
l'ultimo tentativo fallisce. Mai il contenuto dei messaggi — solo la chiave
(troncata a 80 caratteri), chi ha chiamato e il numero di tentativo.

## COME È STATO VERIFICATO

- `npm run verify:remote-chat-history` (35 asserzioni, nessun mock finto):
  le funzioni di unione pure; il client (`serverStorage.ts`) con `fetch`
  finto (nessuna chiave non-chat manda mai condizioni — zero regressione per
  tuning/config/chat-trace); il server (`user-data.ts`) con `@netlify/blobs`
  sostituito da un negozio finto che riproduce la VERA semantica
  onlyIfNew/onlyIfMatch/etag (via `alias` di esbuild, non uno stub che dice
  sempre "ok").
- `npm run verify:remote-chat-history-ui` (Playwright, mobile+desktop):
  G10 — la chat resta visivamente e funzionalmente la stessa (composer,
  contenitore, digitazione, reload) — nessun pixel cambiato.
- `verify:assistant`, `verify:chat-me`, `verify:backend`,
  `verify:agent-lab*`, `verify:lab-layout` — tutti verdi, nessuna
  regressione sulle funzionalità adiacenti che condividono `serverStorage.ts`.
- typecheck, typecheck:functions, build — puliti.

## LIMITE REALE ONESTO

**Non è stata eseguita una prova end-to-end contro due browser reali collegati
alla produzione** (G2–G7 "dal vivo"): richiederebbe il vero `VINZMON_TOKEN` di
produzione, che questo ambiente non recupera deliberatamente (stessa
decisione di sicurezza già presa per AGENT.LAB V1 — non vale la pena portare
un segreto reale in un sandbox di sviluppo per un test che l'evidenza
meccanica sopra copre già con la stessa semantica vera). L'evidenza sopra
(server + client + merge, con un negozio finto che si comporta esattamente
come Blobs su un conflitto reale) è la prova più forte ottenibile senza
quel token. La verifica "dal vivo" — due dispositivi reali che vedono la
stessa cronologia — va fatta dall'utente stesso una volta online, aprendo la
chat da due telefoni/browser diversi con lo stesso VINZ.MON attivato.
