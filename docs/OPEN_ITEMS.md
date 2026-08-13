# VOCI APERTE — cosa resta da decidere

La **GENERATION BIBLE v2.1** ha chiuso quasi tutto quello che la MASTER SPEC §18
lasciava 🟡. Questo file registra cosa è ora canonico, cosa resta aperto, e le
poche interpretazioni che ho dovuto prendere leggendo il documento.

---

## ✅ Chiuse dalla bibbia

| Voce | Era 🟡 in §18 | Ora |
|---|---|---|
| Tassonomia FAMILY | «final complete Family taxonomy» | **18 Family** (§3), tutte estraibili — vedi lo scostamento qui sotto |
| Archetipi | — | **107** (§4), 5–6 per Family |
| Tassonomia AFFINITY | «final complete Affinity taxonomy» | **16** (§5), contaminazioni anatomiche cross-family |
| Pesi di rarità | «rarity weighting» | §15 probabilità base + gate di sblocco, §16 punteggio a 7 componenti, §26 tabelle di normalizzazione |
| Economia | «XP cost/economy, cadence for BRANCH» | 🔶 **chiusa altrove**: non c'è più un'economia. Vedi «SYNC» qui sotto |
| Estrazione colore | «adaptive colour extraction» | §27 `palette_dna`, derivata da Family + Affinity + Mood |
| Icon set e motion | — | non trattati dalla bibbia: restano come sono |

Tutti i valori vivono in **`src/engine/generation-config.ts`**, come impone §29:
«All probabilities and thresholds must be editable from one canonical
generation-config file.» Versione corrente: `2.2.0`.

---

## 🔶 Scostamenti voluti dalla bibbia

Decisioni di prodotto prese **dopo** il documento. Non sono errori di lettura e
non vanno "corrette": la bibbia va aggiornata, o resta la fonte per tutto il
resto tranne questi punti.

### Via la radice canonica, via la Family SLIME
**Versione:** `2.2.0`. **Dove:** `generation-config.ts`, `characterGenerator.ts`
→ `generateFirstMon`, `store.ts` → `hatch`.

La bibbia fissa un primo `.mon` uguale per tutti — `Vz.mon`, SLIME // ROOT (§3,
§17 step 1, §24). Adesso **il primo `.mon` si estrae come qualunque altro**:
due partite non cominciano dalla stessa creatura, e l'HATCH è già una sorpresa
invece di essere una formalità.

Caduta la radice, cade anche il motivo per cui SLIME esisteva come Family:
non aveva formula di fit e non entrava mai nell'estrazione pesata. Le Family
passano da 19 a **18**, tutte estraibili.

La materia gelatinosa **non sparisce dal mondo**: resta come AFFINITY, che è
esattamente quello che la regola assoluta di SLIME già prescriveva — «Later
slime influence is AFFINITY only». Un `.mon` con zone gelatinose, gocce e
membrane deformabili è ancora generabile; semplicemente non è più *di famiglia*
gelatinosa.

`verify:batch` controlla che dodici semi diversi diano almeno quattro Family
diverse al primo nodo, e che SLIME non compaia più come Family.

### Una sola valuta: SYNC, e una sola entità
**Versione:** MASTER SPEC v1.8 — CONSOLIDATED (§5–§9, §14, §23).
**Dove:** `src/engine/progression.ts` (sostituisce `economy.ts`, cancellato).

Il modello a tre valute — XP, DISC come valuta, EVOLUTION SYNC — è stato
sostituito da **SYNC**: quanti giorni VINZ.MON ha potuto leggere. Le due regole
che tengono in piedi il resto:

1. **Un giorno vale al massimo +1 SYNC.** Registrare dieci pasti o mandare cento
   messaggi migliora la qualità del contesto, non la velocità della crescita.
2. **La salute non compra progressione.** SYNC si guadagna presentandosi, non
   stando bene. I dati *formano* la creatura; non ne accelerano l'evoluzione.

Cadenza: 7 giorni sincronizzati all'HATCH, micro-growth ogni 7, Form Evolution
disponibile a 28. La Form Evolution è **un'offerta**: si può rimandare quanto si
vuole e i giorni continuano a contare.

**Ancora di continuità (§9.1).** Due regole assolute e simmetriche: **≥1 asse
resta fermo** (vietato «all axes changed», sarebbe una rigenerazione) e **≥1
asse cambia** (vietato «all axes unchanged», non sarebbe una forma nuova). In
mezzo, cinque schemi: MINIMAL, FOCUSED, MAJOR, FAMILY-ANCHORED, FAMILY-SHIFT.

Un dettaglio che il documento non poteva prevedere: con lo schema MINIMAL
restano fermi sei assi su sette, e l'unico libero può riestrarre il valore che
aveva già — catalogo piccolo, stessi segnali in ingresso. Il generatore lo
intercetta e forza un cambio. Su 150 trasformazioni di prova scatta 4–5 volte:
non è un caso teorico.

Un vincolo strutturale che §9.1 non nomina: un **archetipo appartiene a una
Family sola** (GB §4), quindi non si può ancorare l'archetipo lasciando libera
la Family, e se la Family cambia l'archetipo cambia per forza. È l'eccezione
obbligata all'edge case B — «Family changes while every other evolvable axis
remains».

Questo supera GB §23, che per i branch imponeva ≥4 assi su 7 cambiati: §23
descriveva la nascita di una creatura diversa. §9.1 lo dice esplicitamente —
«Update the Bible accordingly».

**GRACE (§14).** Il documento lo elencava fra gli stati canonici del giorno
senza dire mai cosa lo facesse scattare. Deciso: è una **pausa dichiarata** —
malattia, ricovero, giorni in cui non c'eri — che **non dà SYNC**.

La seconda metà è la parte che conta. SYNC misura quanti giorni VINZ.MON ha
potuto leggerti, non quanto sei stato bene: se in quei giorni non c'eri, non ti
ha letto, e far avanzare il contatore sarebbe una bugia sulla relazione — lo
stesso peccato che §5 vieta quando proibisce di dedurre l'umore dai sensori. E
se GRACE desse SYNC, la strada più corta per crescere diventerebbe dichiararsi
malati.

A cosa serve allora, visto che §7 dice già che saltare un giorno non azzera
niente? A distinguere **un buco da un pezzo di vita**. La progressione non
cambia — aspetta, come già faceva — ma il calendario smette di essere un
registro di assenze, e la pausa entra nella memoria: VINZ.MON sa che non c'eri.

⚠️ Una giornata in cui sei malato **e lo racconti** non è GRACE: è una giornata
normale e va sincronizzata. Stare male è esattamente il contesto che questo
prodotto vuole. GRACE è per i giorni in cui non hai potuto nemmeno aprire l'app.

**Una entità sola.** VINZ.MON non muore e non passa la relazione a nessun altro.
Le forme sono sue configurazioni, le memorie sono un archivio unico e la forma è
un metadato sul ricordo. Per questo `carryMemoriesThroughBranch` è stato
rimosso e nessuna schermata dice più «saluta».

### Il Signal Scan semina la personalità
**Versione:** MASTER SPEC v1.8 §12. **Dove:** `src/engine/personalityScan.ts`,
`src/screens/PersonalityScan.tsx`.

§12 nomina vettori latenti descrittivi — `presence`, `silhouette_tension`,
`body_plan_bias`… — che non sono lo schema del motore: il generatore legge i 16
assi di `PERSONALITY_KEYS` (GB §2). Ogni risposta quindi spinge quegli assi
**nella direzione** che §12 descrive.

È l'interpretazione che rende lo scan una cosa vera invece che un questionario
decorativo, ed è verificata: `verify:batch` costruisce tre profili di risposte e
controlla che la Family più probabile cambi fra loro.

Due vincoli del documento che il codice tiene esplicitamente:
- «Never ask the user to choose Family» — nessuna risposta nomina un valore di
  catalogo, e la schermata non mostra nessuna anteprima di cosa sta spostando.
  Se l'utente potesse ottimizzare, sceglierebbe la creatura.
- La domanda 12 «never direct rarity» — non tocca né la rarità né i suoi gate.

### La chiave API vive nel browser
**Dove:** `src/ai/client.ts`, `src/state/store.ts` → `apiKey`.

Decisione di prototipo: la chiave la incolla l'utente da DEV → VOCE e resta
nel `localStorage` del dispositivo. Non transita da nessun server nostro, ma
chiunque apra quel browser può leggerla, e così può qualunque script caricato
nella pagina.

**Regge finché il prototipo è di una persona sola.** Prima di darlo a chiunque
altro va spostata dietro una funzione serverless — il che richiede il deploy
collegato a GitHub, perché con lo zip trascinato le funzioni non partono.
Cambia un file solo: `client.ts` è l'unico punto che sa dove sta la chiave.

### `vinz.mon` è il nome della specie
**Dove:** `generation-config.ts` → `SPECIES_NAME`, `system/MonName.tsx` →
`SpeciesName`.

Ogni creatura ha il suo nome proprio, generato col genoma di §24 step 17 —
inizia per V, contiene Z, finisce in `.mon`. Ma si possono chiamare tutte
`vinz.mon`, come si dice «un gatto» di un gatto che ha già un nome. Compare in
minuscolo, perché è un nome comune, accanto alla forma nell'intestazione della
home e dell'incontro, e come riga SPECIE nel profilo.

---

## 🟡 Ancora aperte

### Trigger nascosto di SINGULAR
**Dove:** `src/engine/rarity.ts` → `UnlockContext.hiddenTriggerFired`.
§15 lo richiede ma dice esplicitamente che «the generator never exposes exact
hidden trigger logic to the player». Il campo esiste ed è cablato; **quale
evento lo faccia scattare non è definito da nessun documento**. Oggi si attiva
solo da DEV.

### Pesi numerici del Signal Scan
**Dove:** `src/engine/personalityScan.ts` → `NUDGE` e i campi `nudge`.

La schermata 03 adesso c'è, e il seme non è più neutro. Ma §12 è esplicito:
«Directional mappings below are canonical; **numeric weights require
calibration**». Le direzioni sono quelle del documento; i numeri — quanto pesa
ogni risposta su ogni asse — sono miei.

Stanno tutti in un file solo, quindi tararli è una modifica sola. Oggi una
risposta sposta un asse di 6, 10 o 15 punti da una base di 50: `verify:batch`
misura lo scostamento dal neutro (~80–84% con risposte coerenti) e controlla
che profili diversi portino a Family diverse.

### Affinità culturali
**Dove:** `src/engine/generation-config.ts` → `CULTURAL_TAGS`.
Gli 8 tag ci sono e alimentano i segnali, ma nessuna superficie li fa dichiarare
all'utente. Oggi restano vuoti.

### Tipografia di produzione
Archivo Variable sostituisce **VINZ-HEAD**, che non esiste come file. Resta una
proposta: sostituirlo è una riga in `tokens.css`.

---

## Interpretazioni che ho preso leggendo la bibbia

Sono i punti dove il documento ammetteva più di una lettura. Se una è sbagliata,
si corregge in un posto solo.

**§21 Size Score.** «0.30 FORM + 0.20 ATK + 0.15 DEF + 0.10 energy + 0.10
confidence + 0.15 archetype morphology modifier» — i primi cinque pesi sommano
0.85. Ho normalizzato quei cinque a 1.00, perché §6 chiama MEDIUM «default
center state»: con segnali a metà scala il punteggio deve dare 50, non 42.
Il modificatore d'archetipo si somma dopo come scostamento −25…+25 («before
normalization»). Con l'altra lettura GIANT era irraggiungibile.

**§15 gate di UNCOMMON.** «Mindline Depth ≥ 2 **OR** 7 verified active days» è
l'unico cancello disgiuntivo del documento; tutti gli altri sono congiunzioni.
Implementato come tale.

**§16 punteggio come tetto.** «Tier score is a CAP, not a guarantee. The
weighted rarity roll still applies among eligible tiers.» Quindi si tira sul
pool **intersezione** fra livelli sbloccati e livelli sotto il tetto, poi
rinormalizzato.

**§32–§45 frammenti derivati.** I ~250 frammenti di prompt sono lo stesso testo
con dentro un valore di catalogo diverso. Li genero dai cataloghi con sette
forme di template invece di copiarli, così non possono divergere dai dati con
cui il personaggio è stato generato. Sono comunque materializzati nello schema
esatto di §30.1, e `npm run verify:batch` controlla che ogni voce di catalogo
produca il suo frammento.

---

## 🔒 Non toccabili senza cambio di documento

- **18 Family**, tutte estraibili (§3, con lo scostamento qui sopra).
- **APPEARANCE**: quattro canoniche; DOODLE è linguaggio della BIO, non un
  Appearance (§12).
- **SIZE**: TINY / MEDIUM / GIANT, grammatica proporzionale e mai scalatura (§6).
- **Ordine di generazione** a 20 passi (§24) e priorità di lettura (§1).
- **Genoma dei nomi**: inizia per V, contiene Z, finisce in `.mon`, unico in
  lineage (§24 step 17).
- **Heritage** 1–3, sempre tradotto, mai copiato (§23).
- **Sprite di rotazione**: 8 frame su una riga, ancoraggio in basso al centro (§45).
- **Contratto Character Data** di §27, e il divieto di campi fuori dagli assi.
- **§28 sicurezza e tono**: nessuna vergogna su corpo, cibo, malattia o salute;
  nessuna Family come premio o punizione.
- **§29**: config unico e versionato, generation trace solo in DEV, probabilità
  di Family mai esposte in produzione.
