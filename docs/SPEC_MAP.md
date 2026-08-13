# MAPPA DOCUMENTI → CODICE

Dove vive ogni regola. Serve a due cose: verificare che una regola sia stata
implementata, e sapere dove intervenire quando un documento cambia.

Il prototipo esegue **due** documenti, e i loro numeri di sezione **si
sovrappongono**. Qui e nei commenti del codice si distinguono così:

| Sigla | Documento | Copre |
|---|---|---|
| **MS** | `VINZ_MON_MASTER_SPEC_v1.8_SINGLE_SOURCE` | prodotto, schermate, design system, Mindline, progressione, pipeline asset |
| **GB** | `VINZ_MON_GENERATION_BIBLE_v2.1_PROMPT_COMPILER` | tassonomie, motore di generazione, rarità, prompt compiler |

Dove i due si toccano vince la bibbia sulle **tassonomie e sulla generazione**
(GB §1 e GB §29), la master spec su **tutto il resto**. Esempio di collisione da
tenere a mente: *MS §17* è accessibilità e fallback, *GB §17* è la selezione
della Family; *MS §12* sono le schermate, *GB §12* è APPEARANCE.

---

# PARTE A — GENERATION BIBLE v2.1

## Cataloghi (GB §2–§16)

Tutti in **`src/engine/generation-config.ts`**, come impone GB §29: *«All
probabilities and thresholds must be editable from ONE canonical
generation-config file.»* Versione corrente `GENERATION_CONFIG_VERSION = '2.2.0'`.

Le righe marcate 🔶 sono **scostamenti voluti** dalla bibbia, decisi dopo il
documento: sono spiegati uno per uno in [`OPEN_ITEMS.md`](OPEN_ITEMS.md).

| § | Regola | Simbolo |
|---|---|---|
| §2 | Segnali in ingresso normalizzati 0–100 | `SIGNAL_KEYS`, `SignalVector` |
| §2 | Personality Seed, Mood Latents, Novelty Memory | `engine/signals.ts` → `PERSONALITY_KEYS`, `LATENT_KEYS`, `NoveltyMemory` |
| §3 | 18 Family, con anatomia, driver, regola assoluta e formula di fit | `FAMILIES` |
| §3 | 🔶 SLIME esclusiva della radice — **rimossa**: niente radice canonica, niente Family SLIME | vedi OPEN_ITEMS; resta come Affinity in `AFFINITIES` |
| §4 | 107 archetipi, 5–6 per Family | `FamilyDef.archetypes` |
| §5 | 16 Affinity — contaminazione anatomica cross-family, non materiale | `AFFINITIES` |
| §6 | TINY / MEDIUM / GIANT: grammatica proporzionale, mai scalatura | `SIZES`, `SIZE_GRAMMAR` |
| §7 | 24 Role | `ROLES` |
| §8 | 18 Fashion | `FASHIONS` |
| §9 | Marcatori VINZ: 16 categorie di eyewear, 6 tagli, 3 stati | `EYEWEAR_CATEGORIES`, `HAIRCUTS`, `HAIR_STATES` |
| §9 | Anatomie senza capelli: si traduce, non si omette | `NO_HUMAN_HAIR_RULE`; `FamilyDef.supportsHair` |
| §10 | 16 Mood della creatura | `MOODS` |
| §11 | 13 input mood dichiarabili, max 3 al giorno | `MOOD_INPUTS`, `MOOD_INPUT_RULES` |
| §12 | APPEARANCE: quattro canoniche; DOODLE è linguaggio della BIO | `APPEARANCES`, `APPEARANCE_RULES` |
| §13 | 12 assi parametrici di voce | `VOICE_AXES` |
| §14 | 16 preset di voce | `VOICE_PRESETS` |
| §13 §14 §41 | 🔶 La voce compilata in un system prompt per l'AI | `ai/voicePrompt.ts` → `buildVoiceSystemPrompt` |
| §15 | 6 rarità con probabilità base e **gate di sblocco** | `RARITY_TIERS` |
| §16 | Rarity score a 7 componenti | `RARITY_SCORE_COMPONENTS` |
| §17–§23 | Ogni peso, penalità e finestra del motore | `ENGINE_WEIGHTS` |
| §23 | Categorie di Heritage e rapporto obiettivo | `HERITAGE_CATEGORIES`, `HERITAGE_TARGET_RATIO` |
| §28 | Regole di sicurezza e tono | `SAFETY_RULES` |

## Motore di selezione (GB §17–§24)

| § | Regola | File |
|---|---|---|
| §1 | Priorità di lettura degli assi | ordine dei passi in `characterGenerator.ts` |
| §17 | Fit 0–100, penalità di novità −25/−12/−5, ±12 culturale, ±8 rumore, estrazione fra le prime 6 | `characterGenerator.ts` → `resolveFamily`; `signals.ts` → `evaluateFit` |
| §18 | Archetipo 60/25/15, −30 su ripetizione | `resolveArchetype` |
| §19 | Affinity 45/25/20/10, −12 se coincide con la Family | `resolveAffinity` |
| §20 | Role 50/20/15/15, Fashion 55/20/15/10 | `resolveRole`, `resolveFashion` |
| §21 | Size Score + modificatore d'archetipo, soglie 38 / 68 | `resolveSize`; `SIZE_SCORE_WEIGHTS`, `SIZE_THRESHOLDS` |
| §22 | Finestra mood 14 giorni, ×2 sugli ultimi 3, tetto 18% per giorno | `signals.ts` → `computeMoodLatents` |
| §22 | Sotto Data Confidence 35 il mood resta neutro | `resolveMood`; `MOOD_CONFIDENCE_FLOOR`, `NEUTRAL_MOODS` |
| §23 | Heritage 1–3 tratti, sempre **tradotti** nella nuova anatomia | `engine/heritage.ts` → `selectHeritageOrigins`, `translateHeritage` |
| §23 | 🔶 «≥4 assi su 7» — **superata** da MS v1.8 §9.1 per le Form Evolution: ≥1 fermo, ≥1 cambiato | `countChangedAxes` resta come componente di rarità |
| §24 | Ordine autorevole a 20 passi | `generateMon`, passi numerati 1–20 nei commenti |
| §24 | Genoma dei nomi: inizia per V, contiene Z, finisce in `.mon`, unico in lineage | `engine/naming.ts` → `generateMonName`, `isValidMonName` |
| §24 | 🔶 Primo nodo: **estratto come tutti gli altri**, senza eredità | `generateFirstMon` |

## Rarità (GB §15, §16, §25, §26)

| § | Regola | File |
|---|---|---|
| §15 | Gate di sblocco per livello; UNCOMMON è l'unico disgiuntivo | `rarity.ts` → `isTierUnlocked`, `unlockedTiers` |
| §26 | Ridistribuzione delle quote bloccate | `rarity.ts` → `normalizePool` |
| §16 | Punteggio a 7 componenti | `rarity.ts` → `computeRarityScore` |
| §16 | Il punteggio è un **tetto**, non una garanzia | `rarity.ts` → `tierCapFromScore`, `rollRarity` |
| §25 | Sblocchi legati a profondità Mindline, giorni attivi, bond, branch | `UnlockContext` |
| §15 | Trigger nascosto di SINGULAR, mai esposto al giocatore | `UnlockContext.hiddenTriggerFired` — 🟡 vedi OPEN_ITEMS |

## Contratto dati (GB §27, §28, §29)

| § | Regola | File |
|---|---|---|
| §27 | I 27 campi dei Character Data, nomi **alla lettera** in snake_case | `engine/types.ts` → `CharacterData` |
| §27 | `palette_dna` derivata da Family + Affinity + Mood | `engine/colorDna.ts` → `generatePaletteDna` |
| §28 | Nessuna vergogna su corpo, cibo, malattia o salute; nessuna Family come premio o punizione | `SAFETY_RULES`; rispettato in `signals.ts` e nelle schermate |
| §29 | Generation trace visibile solo in DEV | `GenerationResult.trace`; `dev/DevPanel.tsx` |
| §29 | Probabilità di Family mai esposte in produzione | nessuna schermata di prodotto legge `trace` |
| §29 | Riproducibilità: seed e versione di config su ogni record | `CharacterData.seed`, `generation_config_version` |

## Prompt compiler (GB §30–§48)

| § | Regola | File |
|---|---|---|
| §30 | Il prompt si **compila** da frammenti, non si chiede a un'etichetta breve | `assets-pipeline/compiler.ts` → `compilePrompt` |
| §30.1 | Schema del frammento: `id`, `axis`, `priority`, `positive`, `negative`, `requires`, `forbids`, `tags`, `conditional` | `assets-pipeline/fragments.ts` → `PromptFragment` |
| §30.2 | Ordine di priorità 1–12 e risoluzione dei conflitti | `AXIS_PRIORITY`; `compiler.ts` → `resolveConflicts` |
| §30 | Gli stessi Character Data compilano coerentemente in tutti e sette gli asset | verificato da `scripts/package-check.mjs` |
| §31 | CREATURE FIRST. STYLING SECOND. | `GLOBAL_FRAGMENTS` |
| §32–§45 | ~250 frammenti per asse | derivati dai cataloghi con 7 forme di template — vedi OPEN_ITEMS |
| §40 | Marcatori VINZ nei prompt | `MARKER_FRAGMENTS` |
| §41 | Character DNA | `CHARACTER_DNA_FRAGMENT` |
| §42–§44 | Heritage, appearance, rarità | `HERITAGE_FRAGMENT`, `ASSET_FRAGMENTS` |
| §45 | Sprite di rotazione: 8 frame su una riga, ancoraggio in basso al centro | `engine/assets.ts` → `ROTATION_SPEC`; `ASSET_FRAGMENTS.rotation_sprite` |
| §46 | Master compiler template | `compiler.ts` → assemblaggio finale |
| §47 | Esempio compilato di riferimento | confronto manuale da DEV → PROMPT |
| §48 | Prompt = funzione pura di (Character Data, tipo di asset, versione compiler) | `compilePrompt`, nessuno stato esterno |
| §48 | Export di `compiled_prompt.txt` e `fragment_ids.json` con le versioni | `assets-pipeline/exportPackage.ts` → `buildPackageFiles` |
| §48 | Ogni `fragment_id` emesso esiste in libreria | `compiler.ts` → `validateFragmentIds` |

---

# PARTE B — MASTER SPEC v1.8

> 🔶 **La v1.2 è superata dalla MASTER SPEC v1.8 — CONSOLIDATED.** Il documento
> unico ha una sua appendice di migrazione (§24) e questa mappa la segue. Dove
> la v1.2 e la v1.8 dicono cose diverse, vale la v1.8.

## Progressione — SYNC (MASTER SPEC v1.8 §5–§9)

| Regola | Dove |
|---|---|
| Una sola valuta visibile: **SYNC**. Niente XP, niente livelli | `progression.ts`; una sola barra in `CompanionHome.tsx` |
| Massimo **+1 SYNC per giorno di calendario**, qualunque cosa si registri | `store.ts` → `syncDay`, guardia `syncAwarded` |
| Il SYNC lo dà l'utente chiudendo la giornata, non il passare del tempo | `store.ts` → `advanceOneDay` non ne assegna |
| Tre Daily Signals: **FOOD / WORKOUT / MOOD**, stati `UNKNOWN / KNOWN / NOT_APPLICABLE` | `progression.ts` → `DAILY_SIGNALS`; `screens/DailyScan.tsx` |
| `WORKOUT = REST DAY` conta come KNOWN | `isSignalKnown` — solo `UNKNOWN` è un buco |
| La simulazione non fabbrica l'umore: resta `UNKNOWN` finché non lo dici | `store.ts` → `advanceOneDay` riempie solo FOOD e WORKOUT |
| **Incubazione: 7 giorni sincronizzati**, e un giorno mancante non azzera niente | `PROGRESSION.incubationSyncDays`; `useIncubation` conta i sincronizzati |
| **Micro-Growth ogni 7**: stessa forma, un dettaglio matura | `PROGRESSION.microGrowthEvery`; `store.ts` → `doMicroGrowth` |
| **Form Evolution a 28**: è un'offerta, non un obbligo, e rimandarla non costa | `PROGRESSION.formEvolutionAt`; `MindlineShift.tsx` → `NON ORA` |
| §9.1 — una Form Evolution tiene fermo **≥1 asse** e ne cambia **≥1** | `planContinuity`; verificato da `verify:batch` |
| §9.1 — cinque schemi: MINIMAL / FOCUSED / MAJOR / FAMILY-ANCHORED / FAMILY-SHIFT | `EvolutionPattern`, `PATTERN_LABELS` |
| §9.1 — vietato «all axes unchanged»: se l'estrazione ripete la forma, un asse è forzato | `characterGenerator.ts` → passo «CONTINUITÀ — VINCOLO» |
| VINZ.MON è **una entità sola**: non muore, non viene sostituita, non si saluta | `NewBranch.tsx`; nessuna stringa di addio in `i18n/it.ts` |
| §14 — il calendario è una **superficie primaria**, con dettaglio e provenienza | `screens/SyncCalendar.tsx`, quarta voce di `TabBar` |
| §14 — nessuna casella rossa, nessuna serie da difendere | `i18n/it.ts` → `calendar.openDay`, `calendar.noStreak` |
| §12 — le 12 domande del Signal Scan, con le direzioni latenti | `engine/personalityScan.ts` → `SCAN_QUESTIONS` |
| §12 — una domanda per schermata, `01/12`, 2–4 risposte, CTA `LOCK SIGNAL` | `screens/PersonalityScan.tsx` |
| §12 — «Never ask the user to choose Family»: nessuna anteprima, nessun valore di catalogo | nessuna risposta nomina un asse; nessun feedback di direzione |
| §12 — la domanda 12 non tocca mai la rarità | `SCAN_QUESTIONS[11]`, nessun nudge su gate o punteggio |
| 🟡 §12 — i pesi numerici restano da tarare | `personalityScan.ts` → `NUDGE` |
| §20 — scala di rarità COMMON…**MYTHIC / SINGULAR** | `generation-config.ts` → `RARITIES` |
| 🔶 §14 — GRACE è una **pausa dichiarata** (malattia, assenza) e **non dà SYNC** | `store.ts` → `setDayGrace`; il perché in `progression.ts` |

## Mondo, creature, salute

| § | Regola | File |
|---|---|---|
| §2.2 | Ogni .mon è una verità parziale su VINZ e può incarnare una contraddizione | `characterGenerator.ts` → `generateCharacterDna` |
| §2.2 | Le creature conoscono VINZ ma non lo trattano da dio o padrone | `engine/voiceDna.ts` |
| §3 | FORM / ATK / SPD / DEF / REC / CARE | `engine/types.ts` → `STAT_KEYS`; `engine/health.ts` |
| §3 | CONDITION è lo stato del giorno, non una stat permanente | `health.ts` → `computeCondition` |
| §3 | DISC separata dalle stat di salute | `health.ts` → `computeDisc` |
| §3 | Salute e punteggi di gioco tecnicamente separati | `types.ts` → `HealthState` vs `Progression` |
| §3 | Dato mancante = UNKNOWN, mai negativo | `types.ts` → `Signal = number \| 'unknown'` |

## Mindline, evoluzione, eredità

| § | Regola | File |
|---|---|---|
| §7.1 | Il .mon attivo occupa il nodo corrente | `engine/mindline.ts`; store → `nodes` |
| §7.2 | 🔶 MICRO-GROWTH: stessa identità, un dettaglio matura — niente costo | `characterGenerator.ts` → `evolveMon`; `progression.ts` → `microGrowthEvery` |
| §7.3 | 🔶 FORM EVOLUTION: la stessa entità cambia forma, con un'ancora di continuità | `progression.ts` → `CONTINUITY_ANCHORS`; `characterGenerator.ts` → `ctx.continuity` |
| §7.3 | Tratti ereditati e tradotti | `engine/heritage.ts` (regole di GB §23) |
| §7.4 | Topologia tecnica, mai mappa fantasy | `mindline.ts` → `layoutMindline`; `screens/MindlineMap.tsx` |
| §8.1 | Bio generata dal contesto reale di creazione | `characterGenerator.ts` → `generateBio` |
| §8.2 | 🔶 Le memorie sono della relazione: archivio unico, la forma è un metadato | `store.ts` → `confirmFormEvolution` non filtra; `screens/Memories.tsx` |
| §8.3 | Heritage visibile in Specimen e Mindline | `screens/SpecimenProfile.tsx`, `screens/HeritageDna.tsx` |

## Identità visiva e UI

| § | Regola | File |
|---|---|---|
| §9.2 | Vocabolario grafico: globo wireframe, cursore, cartella, floppy | `system/Icon.tsx` |
| §10.1 | Bianco campo primario, nero struttura | `styles/tokens.css` |
| §10.2 | Palette adattiva, niente arcobaleno | `engine/colorDna.ts` → `applyPaletteDna`, `ensureContrastOnWhite` |
| §10.3 | Display Y2K + grotesk + monospaziato | `styles/tokens.css`, `styles/base.css` |
| §10.4 | Bordi spessi, hard shadow, tab a cartella, composer persistente | `system/system.css`, `system/components.tsx` |
| §10.5 | Divieti espliciti | `system.css`, `screens.css`; ripetuti nei frammenti globali |
| §11 | Navigazione MON / ME / MINDLINE | `App.tsx` → `TabBar` |
| §17 | Nessuna informazione critica veicolata dal solo colore | `SegmentedBar` con `readout` |
| §17 | Ogni superficie AI ha un fallback | `voiceDna.ts` → `fallbackGreeting`, `fallbackReply`; `ai/client.ts` non lancia mai |
| §17 | La UI dichiara quando sta usando il fallback | `CompanionHome.tsx` → `bubble__flag` |
| §17 | Target di tocco accessibili | `.btn`, `.btn-icon`, `.field` a 44px |
| — | `.mon` è un'estensione di file: si legge in minuscolo light | `system/MonName.tsx` |
| — | 🔶 `vinz.mon` è il nome comune della specie, accanto al nome proprio | `system/MonName.tsx` → `SpeciesName`; `SPECIES_NAME` |

## Schermate (MS §12)

| # | Schermata | File |
|---|---|---|
| 03 | PERSONALITY / SIGNAL SCAN | `screens/PersonalityScan.tsx` |
| 04 | FIRST SIGNAL / INCUBATION | `screens/Incubation.tsx` |
| 05 | FIRST ENCOUNTER | `screens/Encounter.tsx` (`variant="first"`) |
| 06 | MON / COMPANION HOME | `screens/CompanionHome.tsx` |
| 07 | UNIVERSAL INPUT | `screens/UniversalInput.tsx` |
| 08 | DAILY SCAN | `screens/DailyScan.tsx` (input mood di GB §11) |
| 09 | ME OVERVIEW | `screens/MeOverview.tsx` |
| 11 | MINDLINE SHIFT | `screens/MindlineShift.tsx` |
| 12 | EVOLUTION (maturazione) | `screens/Evolution.tsx` |
| 13 | CAMBIO DI FORMA | `screens/NewBranch.tsx` |
| — | 🔶 CALENDARIO (superficie primaria, v1.8 §14) | `screens/SyncCalendar.tsx` |
| 14 | NEW ENCOUNTER | `screens/Encounter.tsx` (`variant="new"`) |
| 15 | SPECIMEN PROFILE | `screens/SpecimenProfile.tsx` |
| 16 | BIO / PERSONAL FILE | `screens/BioFile.tsx` |
| 17 | MINDLINE | `screens/MindlineMap.tsx` |
| 18 | HERITAGE DNA | `screens/HeritageDna.tsx` |
| 19 | MEMORIES | `screens/Memories.tsx` |
| 20 | HISTORY / YEAR RECAP | `screens/History.tsx` |

**Non implementate** (scope concordato, non omissioni): 01 SYSTEM BOOT,
02 THE PACT, 03 PERSONALITY / SIGNAL SCAN, 10 WEEKLY REPORT, 21 SETTINGS.
La 03 è quella che pesa: finché non esiste, il Personality Seed di GB §2 resta
neutro. Il campo `UserState.scanAnswers` la aspetta già.

## Pipeline asset

| § | Regola | File |
|---|---|---|
| §18A | Mai inventare arte del personaggio | `system/AssetSlot.tsx` → `AssetPlaceholder` |
| §21.2 | Un .mon è valido senza immagini | `engine/assets.ts` → `emptyAssetStatus` |
| §22.1 | Prompt completi, non brief | `assets-pipeline/compiler.ts` |
| §22.2 | Contenuto del pacchetto | `exportPackage.ts` → `buildPackageFiles` |
| §22.3 | Import contro `asset_id`, senza toccare i Character Data | `assets-pipeline/assetStore.ts` |
| §23 | Sette tipi di asset canonici | `engine/assets.ts` → `ASSET_TYPES` |
| §24.4 | Forma esatta della voce di manifest | `assets-pipeline/manifest.ts` → `buildManifest` |
| §24.5 | Drag orizzontale, con fallback al Character Master | `system/AssetSlot.tsx` → `RotationViewer` |

## Prototipo e simulazione

| § | Regola | File |
|---|---|---|
| §20.1 | Voci del pannello DEV | `dev/DevPanel.tsx` |
| §20.2 | Batch di soli dati strutturati + metriche di QA | `dev/BatchGenerator.tsx`; `scripts/batch-check.mjs` |
| §20 | Anteprima del prompt compilato con provenienza dei frammenti | `dev/PromptPreview.tsx` |
| §25 | Confini di servizio preservati | `engine/*` e `assets-pipeline/*` sono funzioni pure, senza React |
| §26 | Criteri di accettazione | `scripts/verify-screens.mjs`; tabella nel README |

---

## Cosa è verificato dalla macchina

Non tutte le regole qui sopra sono controllabili automaticamente. Queste lo sono,
e falliscono la build se si rompono:

| Controllo | Comando |
|---|---|
| Le tabelle di normalizzazione di GB §26 si riproducono esatte | `npm run verify:batch` |
| Il primo nodo varia fra le partite; SLIME non è più una Family | `npm run verify:batch` |
| Ogni voce di catalogo produce il suo frammento di prompt | `npm run verify:batch` |
| Genoma dei nomi e unicità in lineage | `npm run verify:batch` |
| Heritage 1–3, sempre tradotto e mai copiato | `npm run verify:batch` |
| Nessun .mon nasce con asset risolti | `npm run verify:batch` |
| I sette asset compilano dagli stessi frammenti di identità (GB §30) | `npm run verify:package` |
| Ogni `fragment_id` esportato esiste in libreria (GB §48) | `npm run verify:package` |
| Il prompt di rotazione contiene le 12 istruzioni tecniche di GB §45 | `npm run verify:package` |
| I 27 campi di GB §27, e nessun campo vietato da MS §13 | `npm run verify:package` |
| Nessuna schermata produce errori di console | `npm run verify` |
