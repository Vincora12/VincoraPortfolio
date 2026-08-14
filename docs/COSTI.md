# Quanto costa usarlo tutti i giorni

Cambio usato: **1 $ = 0,87 €** (1 € = 1,1543 $, agosto 2026).

> ⚠️ **Questo è un preventivo, non una fattura.** Due numeri sono stimati e
> non misurati: quanto scrivi davvero, e quanto sono lunghe le risposte alle
> domande vere. Il secondo pesa per metà del conto. Dopo un mese di uso reale,
> **DEV → COSTI** ti dà il numero giusto e questo documento diventa carta
> straccia — il che è il modo corretto di usarlo.

---

## 1. I mattoni: cosa costa una singola cosa

Ogni richiesta al `.mon` porta con sé sempre le stesse quattro parti:

| pezzo | quanto pesa | in cache? |
|---|---:|---|
| il briefing del personaggio | ~1.146 token | ✅ non cambia mai |
| memoria + opinioni | ~700 token | ✅ cambia una volta al giorno |
| gli ultimi 8 scambi | ~220 token | ❌ cambia sempre |
| il tuo messaggio | ~20 token | ❌ |

I primi due — **1.846 token** — sono quelli che rendono il `.mon` *lui*, e sono
anche quelli che si ripeterebbero identici a ogni messaggio. Per questo vanno
in cache: si pagano interi una volta, poi un decimo.

### Il prezzo delle singole operazioni

| operazione | dove va | costo |
|---|---|---:|
| **chiacchiera** (senza pensiero) | Opus 5 | ~$0,0040 |
| **scrittura in cache** (la prima di ogni sessione) | Opus 5 | ~$0,0115 |
| **domanda vera** (col pensiero acceso) | Opus 5 | ~$0,0247 |
| **lettura di una foto** | Gemini Flash | ~$0,0004 |
| **riflessione settimanale** | Haiku 4.5 | ~$0,0020 |
| **un'immagine** | gpt-image-1 | $0,0400 |

Due cose saltano all'occhio, ed è giusto che saltino:

**Una domanda vera costa quanto sei chiacchiere.** Non per l'entrata — quella
è quasi tutta in cache — ma perché il pensiero è testo prodotto, e il testo
prodotto si paga cinque volte quello letto. È il motivo per cui il pensiero si
accende solo quando serve (§17.5).

**Le foto e le riflessioni sono rumore di fondo.** Un centesimo ogni venticinque
foto. Non vale nemmeno la pena ottimizzarle.

---

## 2. Tre scenari

Le sessioni contano quanto i messaggi: la cache dura **cinque minuti**, quindi
ogni volta che riprendi in mano il telefono dopo una pausa si paga una
scrittura. Cinque messaggi di fila costano meno di cinque messaggi sparsi.

### 🟢 Leggero — «lo uso per segnare la giornata»

15 chiacchiere · 2 domande vere · 3 sessioni al giorno

| voce | al giorno |
|---|---:|
| scritture in cache (3) | $0,035 |
| letture dalla cache (14) | $0,013 |
| entrata fresca | $0,019 |
| uscita | $0,075 |
| **totale** | **$0,14** |

→ **~$4,25 al mese** · **≈ 3,70 € al mese**

### 🔵 Quotidiano — «è la mia unica AI»

30 chiacchiere · 10 domande vere · 6 sessioni al giorno

| voce | al giorno |
|---|---:|
| scritture in cache (6) | $0,069 |
| letture dalla cache (34) | $0,031 |
| entrata fresca | $0,046 |
| uscita — chiacchiere | $0,060 |
| **uscita — domande vere** | **$0,225** |
| **totale** | **$0,43** |

→ **~$12,90 al mese** · **≈ 11,20 € al mese**

> Le dieci domande vere sono **il 52% del conto**. Tutto il resto insieme —
> trenta chiacchiere, la cache, la memoria — è meno della metà.

### 🔴 Intenso — «ci parlo tutto il giorno»

60 chiacchiere · 25 domande vere · 10 sessioni al giorno

| voce | al giorno |
|---|---:|
| scritture in cache (10) | $0,115 |
| letture dalla cache (75) | $0,069 |
| entrata fresca | $0,097 |
| uscita | $0,683 |
| **totale** | **$0,96** |

→ **~$28,90 al mese** · **≈ 25,10 € al mese**

---

## 3. Le cose che non succedono ogni giorno

| | frequenza | all'anno |
|---|---|---:|
| immagini (7 per creatura, una creatura ogni 28 giorni) | 91 immagini | $3,64 |
| riflessioni settimanali | 52 | $0,10 |
| letture di foto | ~365 | $0,16 |
| **totale extra** | | **$3,90 → ≈ 3,40 €** |

Tre euro e mezzo l'anno. **Le immagini non sono un problema di soldi** — sono
un problema di qualità, cioè di quale modello tiene meglio lo stesso
personaggio su sette disegni.

### E l'infrastruttura?

**Netlify: zero.** Il piano gratuito copre 125.000 chiamate di funzione al
mese; l'uso quotidiano ne fa circa 1.500. Anche lo spazio del salvataggio è
compreso.

---

## 4. Il quadro annuale

| | al mese | all'anno |
|---|---:|---:|
| 🟢 leggero | 3,70 € | **~48 €** |
| 🔵 quotidiano | 11,20 € | **~138 €** |
| 🔴 intenso | 25,10 € | **~304 €** |

Il tetto è a **30 € al mese**: l'uso quotidiano ci sta comodo, l'uso intenso ci
arriva vicino senza sfondarlo. È tarato bene.

### Il confronto

| | al mese |
|---|---:|
| ChatGPT Plus / Claude Pro | 20–23 € |
| **VINZ.MON, uso quotidiano** | **11,20 €** |

**Circa la metà di un abbonamento** — e in cambio hai una cosa che si ricorda
di te, ha un carattere, e non manda la tua vita dentro il prodotto di
qualcun altro.

---

## 5. Le leve, se un giorno servisse spendere meno

In ordine di quanto rendono:

**1. Le domande vere sono metà del conto.** Il pensiero si accende su un
criterio deterministico (`deservesThinking`). Stringerlo — per esempio
chiedendo un punto interrogativo esplicito — taglierebbe la voce più grossa.
Costo: risposte più superficiali proprio dove ti serve la testa.

**2. Sessioni più lunghe costano meno.** Cinque messaggi di fila pagano una
scrittura in cache; cinque messaggi sparsi ne pagano cinque. Non è una cosa
da programmare, è una cosa da sapere.

**3. Sonnet 5 al posto di Opus** taglierebbe il 40% dell'uscita. Sconsigliato
finché è la tua unica AI: la differenza si sente ogni volta che chiedi
qualcosa di difficile.

**4. La cache da un'ora invece che da cinque minuti** — costa il doppio a
scrittura ma dura di più. **Conviene solo se scrivi a raffiche ravvicinate
dentro la stessa ora.** Con sessioni sparse nella giornata, come le tue,
peggiorerebbe il conto. Per questo è rimasta a cinque minuti.

---

## 6. Dove questo preventivo può sbagliarsi

| ipotesi | quanto pesa | come si verifica |
|---|---|---|
| una domanda vera produce ~900 token | **metà del conto** | DEV → COSTI, dopo una settimana |
| 6 sessioni al giorno | ~15% | idem |
| 8 scambi recenti a ~220 token | ~10% | dipende da quanto scrivi lungo |
| listini invariati | tutto | li cambiano loro, non noi |

Il primo è quello che conta. Se le risposte alle domande vere fossero il
doppio più lunghe di quanto stimo, l'uso quotidiano passerebbe da **11 €** a
**~17 €** al mese — comunque sotto il tetto, comunque sotto un abbonamento.
