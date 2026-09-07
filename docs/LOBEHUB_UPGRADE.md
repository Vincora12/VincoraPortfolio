# Aggiornare LobeHub senza rompere Vinz.mon_v2

Versione fissata oggi: **`v2.2.16`** (release stabile del 2026-09-04).

Il patto è semplice: **LobeHub resta stock**. Non c'è nessun fork, nessuna patch
upstream, nessun file di LobeHub modificato. Vinz.mon_v2 parla soltanto la sua
REST API pubblica `/api/v1`, generata da `packages/openapi` e descritta dallo
spec vivo su `/api/v1/openapi.json`. Aggiornare significa cambiare un tag.

Superficie che usiamo, e nient'altro:

| Endpoint | Uso |
|---|---|
| `GET /api/v1/health` | healthcheck dell'adattatore |
| `POST /api/v1/chat` | una risposta, non in streaming |

Autenticazione: `Authorization: Bearer <API key>`, creata dentro LobeHub.
Se l'aggiornamento tocca solo altre rotte, non ci riguarda.

## Prima accensione (non ancora fatta)

Il Mac non ha Docker: prima di tutto va installato, oppure LobeHub va avviato
dai sorgenti con il suo Postgres. Poi:

1. Avviare LobeHub su una porta libera — **non** 8787 (Core VINZ) né 8788 (Mem0).
   Consigliata `3210`.
2. Creare una API key dentro LobeHub.
3. Nel `.env` del Core VINZ:
   ```sh
   LOBEHUB_URL=http://127.0.0.1:3210
   LOBEHUB_API_KEY=<la chiave>
   ```
4. Riavviare il Core: `launchctl kickstart -k gui/$(id -u)/mon.vinz.core`
5. Verificare l'adattatore (deve dire `"online": true`):
   ```sh
   curl -s -H "authorization: Bearer $VINZMON_TOKEN" http://127.0.0.1:8787/api/v2-lobehub
   ```

## Procedura di aggiornamento

### 1. Controllare la release

```sh
curl -s https://api.github.com/repos/lobehub/lobehub/releases/latest | grep tag_name
```

Prendere solo release **non** prerelease. Le `-canary.N` non si seguono mai.

### 2. Leggere cosa cambia sulla nostra superficie

```sh
curl -s https://raw.githubusercontent.com/lobehub/lobehub/<tag>/packages/openapi/src/types/chat.type.ts
curl -s https://raw.githubusercontent.com/lobehub/lobehub/<tag>/packages/openapi/src/routes/chat.route.ts
```

Se `ChatServiceParamsSchema` o il path di `/chat` cambiano, l'unico file da
adeguare è `netlify/functions/v2-lobehub.ts`. È l'unico punto del progetto che
conosce il formato di LobeHub — per costruzione.

### 3. Aggiornare il pin

Cambiare il tag dell'immagine (o del checkout) e la riga
`LOBEHUB_VERSION` in `docs/VINZMON_V2.md`.

### 4. Avviare e verificare

```sh
# healthcheck diretto di LobeHub
curl -s http://127.0.0.1:3210/api/v1/health

# healthcheck attraverso l'adattatore VINZ
curl -s -H "authorization: Bearer $VINZMON_TOKEN" http://127.0.0.1:8787/api/v2-lobehub

# una risposta vera
curl -s -X POST -H "authorization: Bearer $VINZMON_TOKEN" -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"ciao"}]}' \
  http://127.0.0.1:8787/api/v2-lobehub
```

### 5. Test dell'adattatore

- senza token → `401`
- token valido e LobeHub spento → `{"configured":true,"online":false}`, mai un 500
- token valido e LobeHub acceso → `{"online":true}`

### 6. Test della chat

Aprire `vinz.mon/#/v2`. La pastiglia **LobeHub** deve essere selezionabile e
verde. Inviare un messaggio e riceverne uno vero. Poi selezionare **VINZ Local
Core** e verificare che gli strumenti VINZ girino ancora.

### 7. Test mobile

Da iPhone, stesso indirizzo: bottom nav a quattro voci, chat, MON, ME, refresh.

### 8. Rollback

Rimettere il tag precedente e riavviare LobeHub. Se serve escluderlo subito
senza toccare il servizio, basta svuotare `LOBEHUB_URL` nel `.env` del Core e
riavviarlo: V2 torna sul motore `vinz-core` e continua a funzionare. Nessuna
modifica al codice, nessun deploy.

## Regola di allarme

Se per far funzionare un aggiornamento servisse modificare file **dentro**
LobeHub, fermarsi: vuol dire che stiamo uscendo dalla REST API pubblica e che
l'architettura va rivalutata, non rattoppata.
