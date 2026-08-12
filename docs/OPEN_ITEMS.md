# VOCI APERTE — cosa resta da decidere

La **GENERATION BIBLE v2.1** ha chiuso quasi tutto quello che la MASTER SPEC §18
lasciava 🟡. Questo file registra cosa è ora canonico, cosa resta aperto, e le
poche interpretazioni che ho dovuto prendere leggendo il documento.

---

## ✅ Chiuse dalla bibbia

| Voce | Era 🟡 in §18 | Ora |
|---|---|---|
| Tassonomia FAMILY | «final complete Family taxonomy» | **19 Family** (§3), 18 estraibili + SLIME riservata alla radice |
| Archetipi | — | **113** (§4), 5–6 per Family |
| Tassonomia AFFINITY | «final complete Affinity taxonomy» | **16** (§5), contaminazioni anatomiche cross-family |
| Pesi di rarità | «rarity weighting» | §15 probabilità base + gate di sblocco, §16 punteggio a 7 componenti, §26 tabelle di normalizzazione |
| Economia | «XP cost/economy, cadence for BRANCH» | §25 sblocchi; l'economia XP resta locale (vedi sotto) |
| Estrazione colore | «adaptive colour extraction» | §27 `palette_dna`, derivata da Family + Affinity + Mood |
| Icon set e motion | — | non trattati dalla bibbia: restano come sono |

Tutti i valori vivono in **`src/engine/generation-config.ts`**, come impone §29:
«All probabilities and thresholds must be editable from one canonical
generation-config file.» Versione corrente: `2.1.0`.

---

## 🟡 Ancora aperte

### Economia XP di CONTINUE/EVOLVE
**Dove:** `src/engine/economy.ts` → `DEFAULT_ECONOMY`.
La bibbia definisce gli sblocchi di rarità (§25) ma non il costo in XP di
un'evoluzione. Restano i valori provvisori: costo base 400 XP con crescita
×1,6, 35 XP per giorno registrato, 500 XP per livello. Tarabili da DEV →
ECONOMIA.

### Durata dell'incubazione
**Dove:** `src/state/store.ts` → `INCUBATION_DAYS = 28`.
Presa dal board («DAY 18 / 28»). §25 dice solo che in simulazione non serve
attendere davvero.

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

**§3 nome della radice.** Il documento scrive `Vz.mon` in minuscolo misto. La
UI applica il maiuscolo display a tutti i nomi, quindi compare come `VZ.mon`.
Se il minuscolo è voluto, va tolta la trasformazione per quel caso.

**§32–§45 frammenti derivati.** I ~250 frammenti di prompt sono lo stesso testo
con dentro un valore di catalogo diverso. Li genero dai cataloghi con sette
forme di template invece di copiarli, così non possono divergere dai dati con
cui il personaggio è stato generato. Sono comunque materializzati nello schema
esatto di §30.1, e `npm run verify:batch` controlla che ogni voce di catalogo
produca il suo frammento.

---

## 🔒 Non toccabili senza cambio di documento

- **19 Family**, con SLIME esclusiva di `Vz.mon` (§3).
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
