# VOCI APERTE — cosa NON è stato congelato

Questo file esiste per il contratto di §0A: *«TO FINALIZE means Claude may
propose options, but must not silently choose one and make it canonical»* e
*«Claude may explore, prototype or recommend, but must label assumptions and
wait for approval before freezing the system»*.

Tutto quello che segue è **implementato ma non canonico**. Ogni voce vive in un
unico punto del codice, marcato `PROVISIONAL — NOT CANONICAL`, ed è modificabile
senza toccare nient'altro.

---

## 🟡 Aperte in §18, decise in modo provvisorio per far girare il prototipo

### Tassonomie complete FAMILY e AFFINITY
**Dove:** `src/engine/taxonomy.ts`
**Cosa ho messo:** 10 Family (ANGEL, BEAST, INSECT, AQUATIC, REPTILE, AVIAN,
CONSTRUCT, PLANT, SPECTRE, AMORPHOUS) con 4–5 archetipi ciascuna, e 12 Affinity
(ELECTRIC, CHROME, GLASS, PAPER, SMOKE, MAGNETIC, CERAMIC, LIQUID, STATIC,
VELVET, BONE, NEON).
**Come l'ho costruita:** ogni Family descrive **anatomia primaria** e ogni
Affinity descrive che cosa succede **al corpo**, mai un colore o un costume —
è il vincolo di §4. Ogni Family dichiara anche se l'anatomia supporta capelli e
occhiali, perché §6 rende gli occhiali obbligatori solo dove sono plausibili.
**Serve da te:** la lista definitiva. Aggiungere o togliere voci non richiede
modifiche altrove.

### Pesi e soglie di rarità
**Dove:** `src/engine/rarity.ts` (pesi dei fattori), `taxonomy.ts`
(`RARITY_THRESHOLDS`).
**Cosa ho messo:** la rarità non si estrae, si **calcola** dalla configurazione
uscita — §4 dice «rarity of the specific generated configuration/outcome».
Sette fattori: tensione Family×Affinity, tensione Size×Role, Appearance,
numero di tratti Heritage, Fashion, Season, stadio evolutivo.
**Taratura attuale**, misurata con `node scripts/batch-check.mjs 3000`:
≈55% COMMON · 27% UNCOMMON · 13% RARE · 4,5% ANOMALOUS · 0,6% SINGULAR.
**Serve da te:** conferma della curva. Rimisura sempre col comando qui sopra
dopo aver cambiato i pesi.

### Costo XP di CONTINUE/EVOLVE e cadenza di BRANCH
**Dove:** `src/engine/economy.ts` → `DEFAULT_ECONOMY`.
**Cosa ho messo:** costo base 400 XP con crescita ×1,6 per stadio; 35 XP per
giorno registrato, 45 per allenamento, 60 per memoria; 500 XP per livello;
BRANCH disponibile dopo 14 giorni con lo stesso .mon, **oppure** subito se il
Bond è rimasto sotto il 25% — l'idea è che un percorso che non ha attecchito
possa chiudersi prima.
**Come tararla senza codice:** DEV → ECONOMIA. Tutti i valori sono editabili a
runtime.

### Algoritmo di estrazione del colore adattivo e sua accessibilità
**Dove:** `src/engine/colorDna.ts`.
**Il punto:** §10.2 dice che Character Primary e Accent sono **campionati dal
Color DNA del .mon**. Ma l'immagine del .mon non esiste ancora, quindi qui il
colore è **derivato dall'Affinity** invece che campionato da un pixel.
**Quando arriveranno gli asset** questa funzione va sostituita da un
campionamento reale sul Character Master, mantenendo la stessa firma e lo stesso
contratto: `onPrimary` calcolato per contrasto, accento scurito fino a 3:1 sul
bianco (`ensureContrastOnWhite`).

### Terminologia di incubazione dopo l'abbandono di DIGIVINZ
**Dove:** `src/i18n/it.ts` → blocco `incubation`; durata in
`src/state/store.ts` → `INCUBATION_DAYS = 28`.
**Cosa ho messo:** «PRIMO SEGNALE / INCUBAZIONE», 28 giorni, con «SIGNAL
STABILITY» preso dal board. Non ho inventato un nome nuovo per l'oggetto: nella
schermata è un contenitore di sistema, non un «uovo».

### Tipografia di produzione
**Dove:** `src/styles/tokens.css` → `--font-display`.
**Cosa ho messo:** **Archivo Variable** (asse di larghezza 62–125 + corsivo
reale) al posto di **VINZ-HEAD**, che non esiste come file. È la scelta che più
si avvicina alla grammatica di §10.3 — ultra-bold, largo, compatto, inclinato in
avanti — e le varianti outline si ottengono con `-webkit-text-stroke`, senza un
secondo file.
Inter Variable e IBM Plex Mono coprono UI e metadata come indicato dal board.
**Serve da te:** il `.woff2` di VINZ-HEAD. Sostituirlo è una riga in `tokens.css`
più l'import in `main.tsx`.

### Icon set e linguaggio di motion definitivi
**Dove:** `src/system/Icon.tsx`, durate in `tokens.css`.
**Cosa ho messo:** 33 pittogrammi disegnati a codice, 24×24, tratto 1,8,
derivati dal vocabolario di §9.2 (globo wireframe senza continenti, cursore a
freccia, cartella, floppy). Sostituibili uno per uno.

---

## Assunzioni che ho preso e che vale la pena rileggere

**FASHION come asse composito.** §4 dice che l'asse FASHION copre «outfit logic,
eyewear, haircut, footwear, accessories, material/styling attitude». Quindi
occhiali e capelli stanno **dentro** `fashion`, come `FashionSolution`, invece di
essere campi nuovi al livello superiore — che §13 vieterebbe.

**Il campo nero per le superfici evento.** Il board mostra incubazione, hatch,
new encounter e mindline su fondo nero, mentre le superfici quotidiane restano
bianche. Ho replicato questa inversione come regola (`[data-field='ink']`),
citando il board come fonte. Non è «dark mode»: §10.5 vieta il dark luxury
sci-fi come default.

**Le memorie che sopravvivono al branch.** §8.2 dice che possono sopravvivere
«in transformed/partial form». Ho scelto il 35% di sopravvivenza e una
riscrittura che conserva la sensazione e perde il dettaglio
(`carryMemoriesThroughBranch`). La percentuale è arbitraria.

**Durata dell'incubazione a 28 giorni.** Presa dal board («DAY 18 / 28»).

---

## Cosa NON ho toccato perché 🔒 LOCKED

- APPEARANCE: esattamente quattro (TOY / INK / CEL / ELASTIC). DOODLE non è un
  Appearance ed è confinato alla BIO.
- SIZE: TINY / MEDIUM / GIANT, con grammatica proporzionale e non scalatura.
- Navigazione: MON / ME / MINDLINE, senza destinazioni aggiunte.
- Genoma dei nomi: inizia per V, contiene Z, finisce in `.mon`, nessun duplicato
  in lineage.
- Heritage: 1–3 tratti, sempre tradotti nella nuova Family.
- Sprite di rotazione: 8 frame, una riga, 0/45/…/315 in senso orario,
  ancoraggio in basso al centro.
- Contratto dati del Specimen Profile: nessun campo fuori dagli assi canonici.
- Contenuto del pacchetto Asset Request: i file di §22.2.
