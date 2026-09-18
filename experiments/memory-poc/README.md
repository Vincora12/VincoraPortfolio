# POC — Mem0 OSS + Ollama come motore di memoria per VINZ.MON

Esperimento isolato e non distruttivo. Non tocca `data/vinzmon.sqlite`
(il database reale), non tocca `data/mem0-*.sqlite` (i file del servizio
Mem0 di produzione, mai avviati durante questo POC), non fa commit, non fa
deploy, non attiva REFLECTION/ME/Me.mon.

## Cosa riusa e cosa no

Riusa **senza modificarlo** `services/mem0/dist/server.js` — la funzione
`getMemory()` già scritta e già configurata per Ollama. Non ricrea un
secondo adattatore Mem0: `lib/setup.mjs` importa quel file, gli passa un
ambiente isolato (percorsi SQLite dentro questa cartella, `NODE_ENV=test`
per non fargli aprire un secondo server HTTP sulla porta 8788) e basta.

## Requisiti verificati prima di ogni run

- Ollama in ascolto su `127.0.0.1:11434`
- Modelli già installati: `qwen2.5:14b` (generazione), `nomic-embed-text`
  (embedding) — nessuno scaricato per questo POC
- Nessuna chiave `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` raggiunge il codice:
  `lib/setup.mjs` le cancella esplicitamente dall'ambiente del processo
  prima di importare `mem0ai`

## Esecuzione

```bash
./run-all.sh
```

Oppure un test alla volta (utile per i test A e H, che per protocollo
vanno eseguiti come processi `node` separati e successivi):

```bash
node tests/test-a1-write.mjs
node tests/test-a2-verify.mjs
```

I risultati, con le prove grezze (non solo PASS/FAIL), finiscono in
`results/*.json`.

## Pulizia

Tutto lo stato del POC vive dentro questa cartella:

```bash
rm -rf data backup restored-data results
```

Non tocca nient'altro nel repository. `lib/` e `tests/` sono codice, non
dati: puoi lasciarli.

## Limiti dichiarati

- Un solo run per test, non una media su più ripetizioni — vedi
  `REPORT.md`, sezione D, per il campione esatto e cosa NON è stato
  misurato.
- `MEM0_TELEMETRY=false` è impostato in `lib/setup.mjs` — **verificato**
  con `lsof` durante l'esecuzione che senza questa riga mem0ai contatta
  `us.i.posthog.com` per default (vedi `REPORT.md`, sezione F).
