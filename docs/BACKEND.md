# Il backend — cosa devi fare tu

Il codice c'è tutto e passa i controlli. Quello che segue non posso farlo io:
sono cose che vivono nel tuo account Netlify e nei pannelli dei fornitori.

Quindici minuti in tutto, una volta sola.

---

## 1. Genera il token

È il segreto che l'app e le Shortcut useranno per aprire le tue funzioni.
Deve essere lungo e casuale — non una password che ti ricordi.

Da terminale:

```bash
openssl rand -base64 32
```

Oppure su iPhone, in una Shortcut: *Ottieni testo casuale*. Basta che sia
lungo almeno 24 caratteri e non l'abbia mai visto nessuno.

**Copialo da qualche parte prima di andare avanti**: ti serve in due posti.

---

## 2. Le variabili su Netlify

`Site configuration → Environment variables`. Sei righe:

| variabile | cosa ci va | serve a |
|---|---|---|
| `VINZMON_TOKEN` | il token del punto 1 | far entrare solo te |
| `VINZMON_SHORTCUT_TOKEN` | **un secondo token, diverso dal primo** (stesso comando: `openssl rand -base64 32`) | far entrare solo le Shortcut di iPhone — facoltativo, serve solo se usi `/api/shortcut` |
| `ANTHROPIC_API_KEY` | la tua chiave Anthropic | la voce e la riflessione |
| `GOOGLE_API_KEY` | la chiave di Google AI Studio | la lettura delle foto |
| `OPENAI_API_KEY` | la tua chiave OpenAI | le immagini |
| `MOONSHOT_API_KEY` | la tua chiave Moonshot | serve **solo** se scegli Kimi K3 per la voce |

> 🔒 **`VINZMON_SHORTCUT_TOKEN` non è `VINZMON_TOKEN` con un altro nome.** È un
> secondo segreto apposta: quello vive anche dentro le Comandi di iOS, che non
> sono il tuo telefono sbloccato ma un file di configurazione di Apple. Se un
> giorno sospetti che sia uscito, lo cambi SOLO lì — le Shortcut smettono di
> funzionare finché non incolli il nuovo, ma l'app, la voce, le immagini, il
> salvataggio continuano esattamente come prima.

> 🔷 Il compilatore di prompt (v1.2 §10) usa la stessa `ANTHROPIC_API_KEY`: è una
> chiamata di testo per creatura, circa due centesimi, una volta ogni ventotto
> giorni. Senza chiave i prompt restano quelli deterministici e l'app funziona
> lo stesso.

> 🔷 **Non serve fare questo a mano.** Il pulsante **ATTIVA VINZ.MON** in alto
> nell'app genera il segreto, elenca le variabili, e dopo che le hai messe ti
> dice *quale* manca invece di limitarsi a non funzionare. Questa tabella resta
> come riferimento.

> ⚠️ **Se `VINZMON_TOKEN` manca, le funzioni si chiudono invece di aprirsi.**
> È voluto: un deploy in cui qualcuno si è dimenticato la variabile deve
> rompersi in modo evidente, non restare aperto in silenzio a chiunque passi.

Le chiavi dei fornitori puoi metterle una alla volta: senza `OPENAI_API_KEY`
smettono di funzionare solo le immagini, il resto va.

---

## 3. Il tetto di spesa, anche nella console

Sul server c'è già: **30 € al mese**, controllato prima di ogni chiamata, con
un avviso al 75%. Lo trovi in `netlify/functions/_shared/spend.ts`.

**Mettilo comunque anche nella console Anthropic** (`Settings → Limits`).
Sono due reti a maglia diversa:

- **il nostro** ferma l'app quando ha speso troppo, e sa dirti *perché*
- **quello della console** ferma tutto, anche una chiave finita in mano ad altri

Il secondo è l'ultimo muro. Il primo è quello che ti fa scoprire il problema
il giorno stesso invece che a fine mese.

---

## 4. Pubblica

```bash
git push          # è già fatto
```

Netlify ricostruisce da solo se il branch è collegato. Se non lo è, il deploy
va lanciato a mano dal pannello.

`npm run build` fa il typecheck anche delle funzioni: **una funzione rotta
ferma il deploy** invece di finire in produzione.

---

## 5. Incolla il token nell'app

Apri il sito con `?dev=1` → **DEV → VOCE → TOKEN**, e incolla lo stesso valore
di `VINZMON_TOKEN`.

Poi **DEV → VOCE → PROVA LA VOCE**. Se risponde, tutto funziona.

Se dice *«token sbagliato, funzioni non pubblicate o rete assente»*, in ordine:
il token non coincide, il deploy non è passato, o le variabili non sono state
salvate.

---

## Le Shortcut di iPhone

La porta è `/api/ingest` ed è già aperta. Una Shortcut che manda i dati del
giorno:

1. **Ottieni contenuto dell'URL** → `https://<il-tuo-sito>/api/ingest`
2. Metodo: **POST**
3. Intestazioni: `Authorization` = `Bearer <il tuo token>`
4. Corpo richiesta: **JSON**

```json
{
  "steps": 8432,
  "workoutMinutes": 55,
  "sleepHours": 7,
  "note": "stasera pesce e verdure"
}
```

Tutti i campi sono facoltativi. La risposta è corta apposta, così puoi
mostrarla come notifica: `{"ok": true, "summary": "8432 passi · 55 min di
allenamento"}`.

**Automazione consigliata:** ogni sera alle 23, legge l'app Salute e manda
passi e allenamento. Da quel momento i dati arrivano senza che tu apra niente.

> 🔒 **Una cosa che questa porta non può fare, ed è una regola non un limite:**
> non può riempire l'**umore**. Nessun sensore sa come stai, e un'app che lo
> deduce dai passi ti sta raccontando una cosa su di te che non ha modo di
> sapere. L'umore lo dichiari tu scrivendo, o resta sconosciuto — che è un
> valore legittimo. Se una Shortcut manda un campo `mood`, viene ignorato.

---

## Le azioni da Siri e dall'Action Button

`/api/ingest` (sopra) è per un'automazione notturna che manda dati di
sensore. Questa è un'altra porta, per un'altra cosa: dettare «ho mangiato una
piadina» ad alta voce e ricevere subito una risposta vera — senza aprire
Safari.

1. **Ottieni contenuto dell'URL** → `https://<il-tuo-sito>/api/shortcut`
2. Metodo: **POST**
3. Intestazioni: `Authorization` = `Bearer <VINZMON_SHORTCUT_TOKEN>` — **non**
   il token dell'app, il secondo
4. Corpo richiesta: **JSON**

```json
{ "action": "meal", "text": "piadina con pollo e mozzarella" }
```

Risposta:

```json
{ "ok": true, "message": "Pasto registrato", "summary": "~700-850 kcal · proteine ~35-45 g", "confidence": "medium" }
```

Le azioni oggi accese sono `weight` (un numero in `"number"`, zero AI),
`checkin` (le tue parole in `"text"`, salvate così come sono — è COME STO),
`workout` (`"text"` libero, più `"number"` di minuti se lo sai) e `meal`
(`"text"`; la foto è una fase successiva). `DEV → SHORTCUT API` nell'app
mostra la stessa tabella con un esempio pronto da copiare e le ultime
chiamate davvero fatte.

> 🔷 Il .mon non applica il risultato all'istante: lo mette in una coda, come
> fa già `/api/ingest`, e lo scrive nella partita **con le stesse funzioni di
> un inserimento a mano** la prossima volta che apri l'app. Un pasto o un
> peso da Shortcut non correggono mai quello che hai già dichiarato tu quel
> giorno — stessa regola di sopra.

---

## Cosa cambia per te, in pratica

| | prima | adesso |
|---|---|---|
| la chiave del fornitore | nel browser del telefono | sul server, mai nel browser |
| se il segreto esce | spesa illimitata | al massimo il tetto del mese, e si cambia in un minuto |
| cancelli i dati di Safari | **perdi il .mon** | lo ritrovi: il server ha la copia |
| cambi telefono | ricominci | riprendi da dove eri |
| i dati di salute | simulati | possono arrivare dalle Shortcut |

---

## Se qualcosa non va

**«non autorizzato» (401)** — il token nell'app non coincide con
`VINZMON_TOKEN`. La risposta non dice mai *quale* dei due è sbagliato: è
un'informazione utile solo a chi sta provando a entrare. Il motivo vero è nei
log di Netlify.

**«tetto mensile raggiunto» (402)** — non è un guasto, è la tua decisione. Il
.mon torna alla voce deterministica finché non cambia il mese. Per alzarlo:
`MONTHLY_CAP_USD` in `spend.ts`.

**In sviluppo locale (`npm run dev`) l'AI non risponde** — normale: `vite`
serve solo i file statici, le funzioni non ci sono. L'app se ne accorge e usa
la voce deterministica invece di riempire la console di errori. Per provare le
funzioni in locale serve `netlify dev`.
