# Vinz.mon_v2

Seconda versione di VINZ.MON, nello stesso repository, nella stessa build e
sullo stesso dominio della versione attuale. Serve a confrontare due
architetture della chat tenendo la Current intatta e utilizzabile.

## Selettore

```text
vinz.mon                → SELETTORE (scegli versione)
vinz.mon/#/current      → VINZ.MON, la versione attuale
vinz.mon/#/v2           → Vinz.mon_v2
vinz.mon/#/p/<slug>     → pagina del .mon (Current, come prima)
vinz.mon/#/artifact/…   → lettore artefatti (Current, come prima)
vinz.mon/lab            → VINZ.LAB (invariato)
```

Si usa il **frammento**, non il percorso. Il percorso è già impegnato (`/lab` è
un documento suo su disco) e il Core Server serve `dist/` come sito statico
senza router: un frammento non viaggia mai al server, quindi `#/v2` sopravvive
al refresh senza una sola regola di riscrittura in `netlify.toml` o nel Core.

La regola è **asimmetrica apposta** (`src/version/entry.ts`): solo il frammento
vuoto apre il selettore, qualunque altro frammento sconosciuto cade su Current.
Ogni link profondo già esistente continua a entrare dov'entrava prima.

L'ultima versione scelta si ricorda (`vinzmon.version.last`) ma **non decide**:
non c'è nessun rimbalzo automatico. Se una versione si rompe, la radice resta la
via d'uscita verso l'altra.

### Tornare al selettore

Linguetta sul bordo destro a metà altezza (`src/version/VersionSwitch.tsx`),
chiusa è larga 18px. Montata da `main.tsx` come **fratello** di `<App />`, non
come figlio: la barra di navigazione di VINZ non cambia in nessuna delle due
versioni. Stava in alto a destra nella prima stesura e copriva «Nuova chat»
della Current — verificato nel browser, e per questo spostata.

## Confini del codice

| Cartella | Appartiene a |
|---|---|
| `src/version/` | selettore, condiviso |
| `src/v2/` | solo Vinz.mon_v2 |
| `netlify/functions/v2-lobehub.ts` | solo V2 (adattatore) |
| tutto il resto di `src/` | Current, riusato da V2 in sola lettura |

V2 **importa** dalla Current, non la copia e non la modifica: `TabBar`,
`MonTab`, `MeTab`, `OverlayScreen`, `TodayChecklistScreen`, `Markdown`,
`useApp`. MON, ME e SYNC in V2 sono letteralmente le stesse schermate sugli
stessi dati. L'unica cosa che V2 sostituisce è la **chat**.

### Cosa è cambiato nella Current

Quattro modifiche, tutte minime:

1. `src/main.tsx` — i due rami di boot nuovi (selettore, V2).
2. `src/App.tsx` — a riposo l'indirizzo è `#/current` invece della radice nuda
   (3 punti: l'effetto sull'overlay e due `replaceState` di casi rari). Senza,
   ogni refresh dentro l'app tornerebbe al selettore.
3. `src/App.tsx` — `export` davanti a `OverlayScreen`.
4. `server/core-server.ts` — registrata la rotta `/api/v2-lobehub`.

Nessun comportamento della versione attuale cambia, a parte l'indirizzo a
riposo e la radice, che adesso è il selettore.

## Architettura della chat V2

```text
                    Vinz.mon_v2
                         │
                   VINZ SHELL V2
              bottom nav VINZ (TabBar)
                         │
          ┌──────────────┴──────────────┐
          │                             │
        CHAT                     MON / ME / SYNC
          │                    (schermate Current)
          ▼
   ChatEngine (src/v2/chat/engine.ts)
          │
    ┌─────┴──────┐
    ▼            ▼
 lobehub      vinz-core
    │            │
/api/v2-lobehub  /v1/chat/completions
    │            │
    ▼            ▼
LobeHub stock   VINZ Local Core
  /api/v1       identity, Persona, ME
                strumenti VINZ
```

### Perché LobeHub come servizio separato

Valutate: (A) servizio separato, (B) backend LobeHub + UI VINZ, (C) pacchetti
LobeHub selettivi, (D) microfrontend, (E) adapter.

**Scelta: A + E.** I pacchetti del monorepo LobeHub (`@lobechat/model-runtime`,
`agent-runtime`, `context-engine`, `tool-runtime`…) sono tutti
`"private": true`: non esistono su npm, quindi (C) e (B) vorrebbero dire
vendorizzare o forkare il monorepo — l'opposto dell'aggiornabilità richiesta.
LobeHub 2.2.16 espone invece una **REST API pubblica e versionata**
(`packages/openapi`, montata su `/api/v1`, spec viva su `/api/v1/openapi.json`,
CORS attivo, autenticazione Bearer con API key). Consumarla da fuori è una
strada ufficialmente supportata: zero patch upstream, aggiornamento = cambio del
tag dell'immagine, rollback = tag precedente.

(D) è escluso perché la UI di LobeHub è un'app Next.js completa con la sua
sidebar: farla convivere con la shell VINZ significherebbe due navigazioni.
L'iframe è escluso per requisito.

### Chi esegue gli strumenti

Gli strumenti VINZ girano nel **client** (`src/v2/chat/tools.ts`), mai dentro il
motore: la stessa definizione vale per entrambi e nessuno dei due deve conoscere
lo store di VINZ.

Il giro con `vinz-core` non usa il protocollo `role: 'tool'` di OpenAI: l'ingresso
del Core comprime la conversazione in un ultimo turno utente
(`mapMessagesToRequest`), quindi un secondo giro che finisse con un messaggio
`tool` lascerebbe quel turno vuoto e il fornitore rifiuterebbe la richiesta. Il
risultato torna indietro come blocco di sistema e la domanda originale resta
l'ultimo turno utente. Lo strumento gira davvero e il suo output vero entra
davvero nella risposta.

## Servizi, porte, env

| Servizio | Porta | Note |
|---|---|---|
| VINZ.MON Core (Current + V2 + selettore) | `8787` | invariato, launchd `mon.vinz.core` |
| Mem0 OSS locale | `8788` | invariato, solo loopback |
| LobeHub self-hosted | `3210` (consigliata) | **non ancora avviato**, servizio separato |

Variabili nuove nel `.env` del Core, tutte opzionali:

```sh
LOBEHUB_URL=http://127.0.0.1:3210
LOBEHUB_API_KEY=<API key creata dentro LobeHub>
LOBEHUB_MODEL=                 # opzionale
LOBEHUB_PROVIDER=              # opzionale
```

Finché mancano, `/api/v2-lobehub` risponde `{"configured": false}` e V2 lo dice
in chiaro nella barra del motore. Nessun valore inventato.

**LOBEHUB_VERSION = v2.2.16** (release stabile del 2026-09-04; le `2.2.17-*` sono
canary e non vanno seguite).

## Sicurezza

- La API key di LobeHub sta solo nel `.env` del Core. Il browser parla con
  `/api/v2-lobehub` usando il token VINZ che ha già: **nessun segreto nel client**.
- `/api/v2-lobehub` richiede `authorize()` come ogni altra rotta del Core; senza
  token risponde 401 (verificato).
- Nessun proxy generico: due sole operazioni, `health` e `chat`. Un proxy verso
  un URL scelto dal client sarebbe un SSRF con il token di casa attaccato sopra.
- Strumenti VINZ **read-first**: nessuna scrittura in memoria, nessun filesystem,
  nessun terminale, nessun accesso ai segreti. Timeout 8s.

## Proprietà dei dati

**Memoria.** La memoria personale di VINZ (ME Model, Mem0, SQLite) resta la sola
sorgente di verità. V2 non scrive memoria. LobeHub non ha una seconda memoria
personale attiva: la sua non viene usata perché la chat V2 non passa dai suoi
Topic. Quando ci passerà, la sua memoria automatica va disattivata o isolata
prima.

**Conversazioni.** Sorgente di verità attuale: `localStorage`, chiave
`vinzmon.v2.conversations.v1`, namespace suo. Non sono i Topic di LobeHub e non
sono le conversazioni della Current: i tre insiemi non si toccano.

**Projects.** Non toccati. I Projects di VINZ restano canonici e V2 non li
proietta ancora verso LobeHub. Nessun secondo sistema che possa divergere,
perché il secondo sistema non è stato acceso.

## Cosa funziona davvero

- Selettore, ingresso in entrambe le versioni, ritorno al selettore, refresh.
- V2: shell VINZ, bottom nav a quattro voci, MON, ME, SYNC (schermate Current).
- V2: conversazioni reali, persistenti al refresh, con titolo dalla prima domanda.
- V2: risposta reale dal Local Core, con identità e Persona VINZ composte dal Core.
- V2: strumento VINZ reale end-to-end — `vinz_get_active_mon` chiamato dal
  modello, eseguito sullo store vero, risultato visibile nel pannello attività.
- V2: «Chat engine unavailable» quando nessun motore risponde; MON/ME/SYNC
  restano raggiungibili.

## Cosa NON funziona ancora

- **Il motore LobeHub non è mai stato eseguito.** Il client e l'adattatore sono
  scritti contro il contratto reale di 2.2.16 e verificati fino al punto in cui
  dicono «non configurato», ma nessuna risposta è mai arrivata da LobeHub: il Mac
  non ha Docker installato. Finché non si avvia il servizio, il motore `lobehub`
  resta spento e disabilitato nella UI.
- Streaming token-per-token: nessuno dei due motori lo fa oggi. `/api/v1/chat` di
  LobeHub rifiuta `stream: true` (rimanda a `/responses`), e l'ingresso del Core
  emette la risposta in un chunk unico. Non c'è finta progressività.
- Strumenti VINZ sul motore LobeHub: andranno esposti come server MCP registrato
  in LobeHub (`/api/v1/mcp-servers`). Con `lobehub` selezionato oggi la chat
  risponde ma senza strumenti.
- Allegati, file, artefatti, Projects, subagent, MCP: non collegati.
- Onboarding (uovo, scansione, incubazione): resta della Current. Se il
  salvataggio non è in fase `live`, V2 lo dice e rimanda alla Current.

## Avvio, stop, rollback

L'app: nessun comando nuovo. `npm run build` e il Core serve `dist/`; selettore,
Current e V2 sono lo stesso deployment.

LobeHub, quando lo si accende, è un servizio **separato**: non riusare la porta
8787, non toccare launchd `mon.vinz.core`, non toccare SQLite né Mem0.

### Togliere V2 senza toccare la Current

1. `rm -rf src/v2 src/version netlify/functions/v2-lobehub.ts`
2. In `src/main.tsx`: togliere i due rami `selector`/`v2` e i due `VersionSwitch`.
3. In `src/App.tsx`: rimettere `''` al posto di `'#/current'` nei tre punti.
4. In `server/core-server.ts`: togliere import e rotta `/api/v2-lobehub`.
5. `npm run build`.

La Current torna esattamente com'era. Nessun dato della Current è stato
migrato, spostato o riscritto per V2.
