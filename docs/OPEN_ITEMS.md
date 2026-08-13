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
**Versione:** MASTER SPEC v1.4/v1.5, più le decisioni prese dopo la v1.6.
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

**Ancora di continuità.** Una Form Evolution non è una rigenerazione: un
sottoinsieme di assi resta fermo — «resta la famiglia», «cambia solo la
famiglia», «restano presenza e ruolo» — e il resto si riconfigura. È l'opposto
della pressione di GB §23, che per i branch imponeva di cambiare almeno 4 assi
su 7: §23 descriveva la nascita di una creatura diversa, qui è la stessa entità
che si trasforma. `verify:batch` controlla entrambe le direzioni: gli assi
ancorati non cambiano mai, e fuori dall'ancora cambia sempre qualcosa.

**Una entità sola.** VINZ.MON non muore e non passa la relazione a nessun altro.
Le forme sono sue configurazioni, le memorie sono un archivio unico e la forma è
un metadato sul ricordo. Per questo `carryMemoriesThroughBranch` è stato
rimosso e nessuna schermata dice più «saluta».

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

### Nomi degli ultimi due livelli di rarità
**Dove:** `src/engine/generation-config.ts` → `RARITIES`.
I primi quattro livelli coincidono fra i documenti (COMMON, UNCOMMON, RARE,
EPIC). Gli ultimi due no: la MASTER SPEC §53 dice **LEGENDARY / SECRET**, la
GENERATION BIBLE §15 dice **MYTHIC / SINGULAR**. Il codice segue la bibbia.
Va deciso e allineato in un documento solo.

### Le 31 schermate di MS §19
**Dove:** nessun file.
Sono un'architettura UX completa e diversa da quella su cui è costruito il
prototipo. Non è chiaro se §19 sia ancora valida, superata dai livelli nuovi
del documento, o valida a metà. Finché non lo è, il prototipo resta sulle 16
schermate di §12.

### Trigger nascosto di SINGULAR
**Dove:** `src/engine/rarity.ts` → `UnlockContext.hiddenTriggerFired`.
§15 lo richiede ma dice esplicitamente che «the generator never exposes exact
hidden trigger logic to the player». Il campo esiste ed è cablato; **quale
evento lo faccia scattare non è definito da nessun documento**. Oggi si attiva
solo da DEV.

### Personality Seed
**Dove:** `src/engine/signals.ts` → `neutralPersonality()`.
§2 elenca i vettori latenti, ma la schermata **03 PERSONALITY / SIGNAL SCAN**
che dovrebbe seminarli non è ancora implementata. Finché non c'è, il seme è
neutro (tutto a 50) e le formule di fit di §17 lavorano solo su salute e umori.
È la lacuna che più limita la varietà delle Family generate.

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
