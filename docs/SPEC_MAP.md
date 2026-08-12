# MAPPA SPEC → CODICE

Dove vive ogni regola della MASTER SPEC v1.2. Serve a due cose: verificare che
una regola sia stata implementata, e sapere dove intervenire quando la spec
cambia.

---

## Mondo, creature, salute

| § | Regola | File |
|---|---|---|
| §2.2 | Ogni .mon è una verità parziale su VINZ e può incarnare una contraddizione | `engine/taxonomy.ts` → `CONTRADICTIONS`; `engine/characterGenerator.ts` → `generateCharacterDna` |
| §2.2 | Le creature conoscono VINZ ma non lo trattano da dio o padrone | `engine/voiceDna.ts` → `ADDRESS_FORMS` |
| §3 | FORM / ATK / SPD / DEF / REC / CARE | `engine/types.ts` → `STAT_KEYS`; `engine/health.ts` |
| §3 | CONDITION è lo stato del giorno, non una stat permanente | `engine/health.ts` → `computeCondition` |
| §3 | DISC separata dalle stat di salute | `engine/health.ts` → `computeDisc` |
| §3 | Il livello non scende mai | `engine/economy.ts` → `levelFromXp`; store → `grantXp` |
| §3 | Salute e punteggi di gioco tecnicamente separati | `engine/types.ts` → `HealthState` vs `Progression` |
| §3 | Dato mancante = UNKNOWN, mai negativo | `engine/types.ts` → `Signal = number \| 'unknown'`; `health.ts` → `formatSignal` |

## Generazione del personaggio

| § | Regola | File |
|---|---|---|
| §4 | Assi canonici e loro priorità di lettura | `engine/taxonomy.ts`; ordine di estrazione in `characterGenerator.ts` → `generateMon` |
| §4 | CREATURE FIRST, STYLING SECOND | `generateMon`: Family/Archetype/Affinity/Size/Role prima di Fashion |
| §4 | Genoma dei nomi: V… Z… `.mon`, nessun duplicato in lineage | `engine/naming.ts` → `generateMonName`, `isValidMonName` |
| §4 | La rarità è della configurazione, non della Family | `engine/rarity.ts` → `computeRarity` |
| §5 | APPEARANCE: esattamente quattro | `engine/taxonomy.ts` → `APPEARANCES` |
| §5 | DOODLE non è un Appearance, è il linguaggio della BIO | `screens/BioFile.tsx`; `assets-pipeline/promptCompiler.ts` → `compileBioDoodlePrompt` |
| §6 | Occhiali obbligatori dove anatomicamente plausibili | `taxonomy.ts` → `FamilyDef.supportsEyewear`; `characterGenerator.ts` → `generateFashion` |
| §6 | Stati di decolorazione, punte bionde = ricrescita | `taxonomy.ts` → `HAIR_BLEACH_STATES` |
| §6 | La moda non oscura mai la Family | vincolo scritto in ogni prompt: `promptCompiler.ts` → `compileCharacterBlock` |
| §16 | Domini culturali, campionati a sottoinsiemi, con punti ciechi | `taxonomy.ts` → `CULTURAL_DOMAINS`; `generateCharacterDna` |

## Mindline, evoluzione, eredità

| § | Regola | File |
|---|---|---|
| §7.1 | Il .mon attivo occupa il nodo corrente | `engine/mindline.ts`; store → `nodes` |
| §7.2 | CONTINUE/EVOLVE: stessa identità, si spende XP | `characterGenerator.ts` → `evolveMon`; store → `doContinue` |
| §7.3 | BRANCH: 1–3 tratti ereditati, tradotti nella nuova Family | `engine/heritage.ts` |
| §7.4 | Topologia tecnica, mai mappa fantasy | `engine/mindline.ts` → `layoutMindline`; `screens/MindlineMap.tsx` |
| §8.1 | Bio generata dal contesto reale di creazione | `characterGenerator.ts` → `generateBio` |
| §8.2 | Le memorie appartengono alla relazione e sopravvivono parzialmente al branch | `engine/simulation.ts` → `carryMemoriesThroughBranch` |
| §8.3 | Heritage visibile in Specimen e Mindline | `screens/SpecimenProfile.tsx`, `screens/HeritageDna.tsx` |

## Identità visiva e UI

| § | Regola | File |
|---|---|---|
| §9.2 | Vocabolario grafico: globo wireframe, cursore, cartella, floppy | `system/Icon.tsx`; favicon in `index.html` |
| §10.1 | Bianco campo primario, nero struttura | `styles/tokens.css` |
| §10.2 | Palette adattiva dal Color DNA, niente arcobaleno | `engine/colorDna.ts` → `applyColorDna`; `App.tsx` |
| §10.3 | Display Y2K + grotesk + monospaziato | `styles/tokens.css`, `styles/base.css` → `.t-display`, `.t-meta` |
| §10.4 | Bordi spessi, hard shadow, tab a cartella, composer persistente | `system/system.css`, `system/components.tsx` |
| §10.5 | Divieti espliciti | rispettati in `system.css` e `screens.css`; ripetuti nei prompt (`GLOBAL_DONTS`) |
| §11 | Navigazione MON / ME / MINDLINE | `App.tsx` → `TabBar` |
| §17 | Nessuna informazione critica veicolata dal solo colore | `SegmentedBar` con `readout`; `formatDelta`; check con etichetta OK/FAIL |
| §17 | Ogni superficie AI ha un fallback | `engine/voiceDna.ts` → `fallbackGreeting`, `fallbackReply`; segnalato in UI |
| §17 | Target di tocco accessibili | `.btn`, `.btn-icon`, `.field` a 44px |

## Schermate (§12)

| # | Schermata | File |
|---|---|---|
| 04 | FIRST SIGNAL / INCUBATION | `screens/Incubation.tsx` |
| 05 | FIRST ENCOUNTER | `screens/Encounter.tsx` (`variant="first"`) |
| 06 | MON / COMPANION HOME | `screens/CompanionHome.tsx` |
| 07 | UNIVERSAL INPUT | `screens/UniversalInput.tsx` |
| 09 | ME OVERVIEW | `screens/MeOverview.tsx` |
| 11 | MINDLINE SHIFT | `screens/MindlineShift.tsx` |
| 12 | EVOLUTION | `screens/Evolution.tsx` |
| 13 | NEW BRANCH | `screens/NewBranch.tsx` |
| 14 | NEW ENCOUNTER | `screens/Encounter.tsx` (`variant="new"`) |
| 15 | SPECIMEN PROFILE | `screens/SpecimenProfile.tsx` |
| 16 | BIO / PERSONAL FILE | `screens/BioFile.tsx` |
| 17 | MINDLINE | `screens/MindlineMap.tsx` |
| 18 | HERITAGE DNA | `screens/HeritageDna.tsx` |
| 19 | MEMORIES | `screens/Memories.tsx` |
| 20 | HISTORY / YEAR RECAP | `screens/History.tsx` |

**Non implementate in v1** (scelta di scope concordata, non omissioni):
01 SYSTEM BOOT, 02 THE PACT, 03 PERSONALITY / SIGNAL SCAN, 08 DAILY SCAN,
10 WEEKLY REPORT, 21 SETTINGS.
Il campo `UserState.scanAnswers` esiste già e attende la schermata 03.

## Contratti dati

| § | Regola | File |
|---|---|---|
| §13 | Contratto dati del Specimen Profile | `screens/SpecimenProfile.tsx`, tab IDENTITÀ |
| §13 | Vietati campi come `species`, `class`, `protector` | tipo chiuso in `engine/types.ts` → `CharacterData` |
| §21.1 | Output strutturato minimo | `engine/types.ts` → `CharacterData` |
| §21 | Ordine della pipeline di generazione | `characterGenerator.ts` → `generateMon`, passi numerati 1–16 |
| §21.2 | Un .mon è valido senza immagini | `engine/assets.ts` → `emptyAssetStatus`; `system/AssetSlot.tsx` |

## Pipeline asset

| § | Regola | File |
|---|---|---|
| §18A | Mai inventare arte del personaggio | `system/AssetSlot.tsx` → `AssetPlaceholder` |
| §22.1 | Prompt completi, non brief | `assets-pipeline/promptCompiler.ts` |
| §22.1 | Character Master è l'unica fonte di verità visiva | ogni prompt derivato lo cita esplicitamente |
| §22.2 | Contenuto del pacchetto | `assets-pipeline/exportPackage.ts` → `buildPackageFiles` |
| §22.3 | Import contro `asset_id`, senza toccare i Character Data | `assets-pipeline/assetStore.ts`; store → `markAssetResolved` |
| §23 | Sette tipi di asset canonici | `engine/assets.ts` → `ASSET_TYPES` |
| §24.1 | 8 frame, una riga, 0…315 orario, ancoraggio in basso al centro | `engine/assets.ts` → `ROTATION_SPEC` |
| §24.2 | Lista di consistenza assoluta | `promptCompiler.ts` → `compileRotationPrompt` |
| §24.3 | Template del compilatore di rotazione | `promptCompiler.ts` → `compileRotationPrompt` |
| §24.4 | Forma esatta della voce di manifest | `assets-pipeline/manifest.ts` → `buildManifest` |
| §24.5 | Drag orizzontale, con fallback al Character Master | `system/AssetSlot.tsx` → `RotationViewer` |

## Prototipo e simulazione

| § | Regola | File |
|---|---|---|
| §20.1 | Voci del pannello DEV | `dev/DevPanel.tsx` |
| §20.2 | Batch di soli dati strutturati + metriche di QA | `dev/BatchGenerator.tsx`; `scripts/batch-check.mjs` |
| §25 | Confini di servizio preservati | `engine/*` e `assets-pipeline/*` sono funzioni pure, senza React |
| §26 | Criteri di accettazione | `scripts/verify-screens.mjs`; checklist nel README |
