# VINZ.MON PROTOTYPE V1

**Decisione presa:** 2026-09-03. Vedi `docs/V2_ISSUES.md` per il backlog che questa decisione genera.

## Cos'è, ufficialmente

VINZ.MON, così com'è oggi su `claude/project-prototype-jxjc3d` /
https://fluffy-cocada-88715c.netlify.app, è dichiarato **PROTOTYPE V1**.

Purpose:
- product exploration
- interaction testing
- architecture discovery
- UX validation
- feature experimentation
- requirement discovery

NOT:
- production architecture
- final storage model
- final Chat architecture
- final Memory architecture

Un prototipo può contenere bug, architettura grezza e soluzioni
temporanee. Il suo scopo non è diventare perfetto in produzione — è
insegnarci cosa deve essere VINZ.MON finale.

---

## CURRENT DEVELOPMENT RULE

**Non si productionizza V1 di default.**

I problemi importanti si registrano normalmente come apprendimenti per V2
(`docs/V2_ISSUES.md`), non come inviti a un refactor largo di V1. Si
corregge V1 solo quando un problema:

- rende il prototipo materialmente inusabile
- blocca l'accesso a un'area importante
- impedisce di testare il concetto di prodotto
- crea perdita di dati o rischio di sicurezza inaccettabile

Tutto il resto: si registra, si continua a usare il prototipo così com'è.

---

## WHAT V1 PROVED

- Un .mon con identità visiva, voce e personalità propria è un'esperienza
  che regge — la generazione a Family/Affinity/Archetipi produce creature
  distinguibili, non varianti dello stesso personaggio.
- La chat come superficie primaria (non un pannello secondario) funziona
  come modello di interazione: leggere/scrivere ME, la memoria, le pagine,
  l'aspetto, tutto passa da lì in modo naturale.
- Gli strumenti locali (client-side, dati mai inviati al server se non per
  generare) sono un pattern valido per un'app single-user che deve restare
  economica ed evitare di esporre mesi di dati personali.
- Mem0 (retrieval semantico) aggiunge continuità reale percepita — il .mon
  "si ricorda" in un modo che il contesto della finestra da solo non dà.
- Un pannello DEV/LAB separato dall'app "vera" è stato indispensabile per
  scoprire e diagnosticare problemi altrimenti invisibili sul device.
- Il modello economico (SYNC, un solo asse invece di tre valute) è più
  semplice da spiegare e da vivere di quello originale a più valute.

## WHAT WE KEEP CONCEPTUALLY

- L'identità: VINZ.MON come entità unica con più forme, non più
  personaggi. Family/Affinity/Archetipi/rarità come sistema di
  generazione.
- ME come sorgente di verità sui dati reali (pasti, allenamenti, peso,
  obiettivi) — letta dagli strumenti, non indovinata.
- Il linguaggio e le interazioni collaudate: conferma esplicita prima di
  scrivere un pasto/allenamento, correzione invece di duplicazione,
  DEV → RARITÀ con soglie modificabili, ATTIVA VINZ.MON come installazione
  guidata.
- World/Narrative/storyLedger come concetto — la creatura che porta avanti
  un canone, non conversazioni isolate.
- Il principio "una sola fonte di verità server-side per dato condiviso" —
  è quello che V1 ha violato più spesso, ed è la lezione più costosa.

## KNOWN STRUCTURAL DEBT

- **Chat lifecycle**: proprietà del thread e del suo stato distribuita fra
  più meccanismi indipendenti (sessione locale non promossa, gate di
  storia, watcher di mutazione, attribuzione di operazione) che devono
  vincere corse l'uno contro l'altro invece di avere un unico proprietario
  deterministico. Vedi V2-001, V2-002, V2-003.
- **Persistenza**: localStorage/snapshot server monolitico usati come
  fonte condivisa per stato che cresce senza limite. Vedi V2-004, V2-005.
- **Memoria**: retrieval Mem0 dipende dal percorso di risposta scelto
  (BASE vs LOCAL_TOOLS), non da una regola esplicita; "salvato" non è
  sempre distinto da "recuperato". Vedi V2-006, V2-007, V2-008.
- **Osservabilità cresciuta ad hoc**: il Runtime Log è un registro
  globale condiviso fra sessioni/deploy diversi, usato anche per
  diagnosticare episodi live — genera falsi positivi quando eventi vecchi
  restano nella finestra "recente".

## WHAT SHOULD NOT BE CARRIED INTO V2

- L'attuale ciclo di vita della Chat (promozione della sessione locale,
  gate di ownership della storia, watcher di mutazione, attribuzione per
  finestra temporale).
- Il modello di promozione "prima riga = generazione".
- I compromessi di persistenza attuali (localStorage come cache che può
  competere con il server, snapshot server monolitico).
- Le patch specifiche del prototipo (fix successivi sullo stesso
  meccanismo di ownership) e l'accoppiamento architetturale accidentale
  che ne è derivato.
- Gli snapshot giganti di stato applicativo come modello di stato
  canonico.
- L'idratazione ad-hoc della storia (letture che possono sovrascrivere
  stato live se non esplicitamente protette).
- La strumentazione di debug costruita solo per salvare V1 (BLACK BOX,
  detector A-F, gate id) — utile ora, non un requisito per V2.

## WHAT THE FINAL REBUILD SHOULD START FROM

- `docs/PROTOTYPE_V1_STATUS.md` (questo file) e `docs/V2_ISSUES.md` (il
  backlog strutturato) come input primari.
- L'archivio runtime V2 Issues (`/api/v2-issues`, Netlify Blobs
  `vinzmon-v2-issues`) come fonte machine-readable dietro il markdown.
- La documentazione di prodotto/lore esistente (`docs/LORE.md`,
  `docs/IMMAGINARIO.md`, `docs/ME_MODEL_V1.md`, `docs/SPEC_MAP.md`) come
  riferimento di prodotto, visivo e comportamentale — non come vincolo
  architetturale.
- Il principio guida per V2: **una sola fonte di verità per dominio** — un
  proprietario della timeline della Chat, un contratto unico di memoria,
  una sorgente ME, un solo store server-side per dominio, una sola verità
  di progressione. Niente correttezza che dipende da più copie
  indipendenti che vincono corse fra loro.
