# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Il proprietario di VINZ.MON usa il prodotto come spazio personale di conversazione e lavoro continuo.

## Product Purpose

VINZ.MON riunisce chat, progetti, file, artefatti, promemoria e strumenti in un ambiente personale gestito localmente.

## Operating Context

Le conversazioni possono essere globali oppure legate a un progetto. Un progetto conserva un contesto distinto, i documenti e gli artefatti associati. Il servizio gira sul Mac locale ed è raggiungibile anche tramite Tailscale/HTTPS.

## Capabilities and Constraints

Projects è una funzione principale del prodotto, non un’impostazione secondaria. Devono restare disponibili chat, Projects, Artifacts, Calendar, Tools, SQLite, Mem0 locale e la logica di gioco. Le modifiche all’interfaccia non devono compromettere il Local Core Server o il servizio launchd.

## Brand Commitments

Nome del prodotto: VINZ.MON. L’interfaccia usa una voce italiana diretta e personale.

## Evidence on Hand

La schermata attuale del pannello Projects è disponibile nell’immagine fornita dall’utente in questa conversazione. Il codice sorgente del pannello è in `src/assistant-original/conversation-options.tsx` e `src/assistant-original/conversation-options.css`.

## Product Principles

- Il progetto selezionato deve rendere evidente il contesto di lavoro corrente.
- Chat, file e artefatti devono restare collegati senza trasformare la conversazione in un pannello amministrativo.
- Le funzioni principali devono essere comprensibili anche quando non esistono ancora progetti o file.
