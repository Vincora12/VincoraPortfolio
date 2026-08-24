# VINZ.LAB — a che punto siamo

Questa cartella è il pacchetto scritto con Codex, copiato qui **integro**: è la
specifica, non il codice. Il codice sta in `src/lab/`.

`VINZ_LAB_FULL_INTEGRATION.md` è la specifica canonica.
`CODEX_IMPLEMENT_VINZ_LAB.txt` elenca gli undici milestone.

## Fatto

| # | Milestone | Stato |
|---|---|---|
| 1 | ingresso `/#/lab` + LabApp + manifest dedicato + metadati iPhone | ✅ |
| 2 | guscio del laboratorio + quattro stanze sorelle | ✅ |
| 4 | DESIGN.LAB: preview a componenti veri + ispettore + guardiani | ✅ |

## Non ancora

| # | Milestone | Perché no |
|---|---|---|
| 3 | SOUL runtime + SOUL.LAB | Il pacchetto contiene `SoulLab.tsx`, che importa `soul/SoulOrb` e `soul/SoulController`: **quei due file nel pacchetto non ci sono**. Copiarlo romperebbe la build. La porta 👁 SOUL esiste e la stanza dice cosa manca. |
| 5 | proposte AI / A-B / versioni | Il pannello ha già il posto (`CREA PROPOSTA`) e il commento che dice cosa deve mandare al backend. Non è collegato. |
| 6–7 | CREATION.LAB e le modifiche AI mirate | Stanza dichiarata, vuota. |
| 8 | SYSTEM.LAB | Stanza dichiarata, vuota. |
| 9–10 | migrazione di DEV e rimozione del vecchio | 🔒 `DEV_PARITY_MATRIX.md`: «do not remove legacy DEV until parity is verified». Il pannello DEV di VINZ.MON è **intero e intatto**. |
| 11 | irrobustimento iPhone | Da fare sul telefono vero: qui non c'è un iPhone. |

## Scostamenti dal pacchetto, e perché

1. **Le porte sono quattro, non tre.** `LabApp.tsx` del pacchetto montava
   `SoulLab` su `#/lab/soul` ma non disegnava la porta: a SOUL si arrivava solo
   scrivendo l'indirizzo a mano.

2. **La CHAT è `src/screens/CompanionHome.tsx`.** Il registro del pacchetto
   puntava a `src/assistant-original/*` e a `@assistant-ui/react`: in questo
   repo non esistono e non sono mai esistiti.

3. **`brain.css` non viene importato.** L'esempio di `main.tsx` lo importava.
   Il Brain è stato progettato (vedi il blueprint) e mai costruito.

4. **Cambiare stanza non ricarica la pagina.** Il pacchetto faceva
   `window.location.reload()` a ogni click.

5. **Il campo nero si calcola, non si dichiara.** Dentro MON dipende dalla
   vista, e la vista in preview si può cambiare col dito.

6. **La cornice della preview è importata da `App.tsx`, non ricopiata.**
   `MonTab`, `MeTab` e `TabBar` sono ora esportate. Regola del pacchetto:
   «DO NOT COPY THE UI».

## Come si prova

    npm run verify:lab

21 prove: le cinque che il pacchetto chiede a parole, più quella che il
pacchetto non sa provare — che guardare una schermata nel laboratorio **non
scriva** niente in produzione.
