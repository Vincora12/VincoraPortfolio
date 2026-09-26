#!/bin/sh
# POC Mem0 OSS + Ollama — esecuzione completa e riproducibile.
# Ogni file in tests/ è invocato come processo `node` a sé stante: dove il
# protocollo richiede "un nuovo processo" (test A e H), lo è per davvero,
# non simulato dentro un unico script.
set -e
cd "$(dirname "$0")"

echo "--- verifica Ollama e modelli richiesti ---"
curl -sf http://127.0.0.1:11434/api/version >/dev/null || { echo "Ollama non raggiungibile su 127.0.0.1:11434 — fallisce qui, non con un fallback cloud."; exit 1; }
for m in qwen2.5:14b nomic-embed-text; do
  curl -s http://127.0.0.1:11434/api/tags | grep -q "\"$m" || { echo "Modello mancante: $m — non scaricato automaticamente."; exit 1; }
done

mkdir -p data results backup restored-data

node tests/test-a1-write.mjs
node tests/test-a2-verify.mjs       # processo nuovo
node tests/test-b-correction.mjs
node tests/test-c-isolation.mjs
node tests/test-d-semantic.mjs
node tests/test-e-noise.mjs
node tests/test-f-deletion.mjs
node tests/test-g-model-independence.mjs   # processo nuovo, modello diverso
node tests/test-h-backup-restore.mjs
node tests/test-h2-restore-verify.mjs      # processo nuovo, storage ripristinato
node tests/test-i-correction-adapter.mjs   # fix nativo della correzione (search+update, no secondo archivio)

echo
echo "--- riepilogo ---"
for f in results/*.json; do
  status=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$f')).status)")
  printf '%-40s %s\n' "$(basename "$f")" "$status"
done
