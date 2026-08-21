/* Verifica offline del contratto assistant-ui ↔ backend. Nessuna API key o rete. */
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'vinz-assistant-'));
const entry = join(dir, 'entry.ts');
const out = join(cwd, 'node_modules', '.vinz-assistant-check.mjs');

writeFileSync(
  entry,
  `
export { extractAnthropicSources, streamAnthropic } from '${cwd}/netlify/functions/_shared/providers.ts';
export { assistantRequestPreferences } from '${cwd}/netlify/functions/ai.ts';
export { resolveRoute } from '${cwd}/netlify/functions/_shared/routing.ts';
`,
);

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'error',
  external: ['@netlify/blobs'],
});

const m = await import(`file://${out}?v=${Date.now()}`);
let failures = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

console.log('\n═══ ASSISTANT-UI CONTRACT ═══\n');

const cloneSource = readFileSync(
  join(cwd, 'src/assistant-original/components/examples/chatgpt.tsx'),
  'utf8',
);
const cloneStyles = readFileSync(join(cwd, 'src/assistant-original/styles.css'), 'utf8');
const cloneMain = readFileSync(join(cwd, 'src/assistant-original/main.tsx'), 'utf8');
check(cloneSource.includes('RecordPlugin.create'), 'la dettatura usa il registratore audio VINZ.MON');
check(cloneSource.includes('scrollingWaveform: true'), 'l’onda scorre con l’audio reale');
check(cloneSource.includes('TRASCRIZIONE IN CORSO'), 'lo stato di trascrizione resta visibile');
check(cloneSource.includes('fetch("/api/transcribe"'), 'l’audio passa dal backend protetto');
check(cloneSource.includes('setPendingTranscript'), 'la trascrizione torna nel composer');
check(cloneStyles.includes('.vinz-record__wave.is-loading'), 'avvio e trascrizione hanno un loader dedicato');
check(!cloneMain.includes('WebSpeechDictationAdapter'), 'la vecchia dettatura browser non è più collegata');

const preferences = m.assistantRequestPreferences(
  { modelName: 'claude-sonnet-5', reasoningEffort: 'high' },
  'gpt-5.6-luna',
  'low',
);
check(preferences.modelName === 'claude-sonnet-5', 'config.modelName vince sul campo legacy');
check(preferences.effort === 'high', 'config.reasoningEffort arriva al backend');
check(
  m.resolveRoute('character-voice', preferences.modelName).provider === 'anthropic',
  'il modello selezionato sceglie il provider allowlisted corretto',
);
check(
  m.resolveRoute('character-voice', 'modello-inventato').model === 'gpt-5.6-terra',
  'un modello non allowlisted torna al predefinito',
);

const sources = m.extractAnthropicSources([
  {
    type: 'web_search_tool_result',
    content: [
      { type: 'web_search_result', title: 'Fonte A', url: 'https://example.com/a' },
      { type: 'web_search_result', title: 'Duplicata', url: 'https://example.com/a' },
      { type: 'web_search_result', title: 'Non valida', url: 'javascript:alert(1)' },
    ],
  },
  {
    type: 'text',
    text: 'https://inventata.example non deve diventare una fonte',
    citations: [
      { type: 'web_search_result_location', title: 'Fonte B', url: 'https://docs.example.org/b' },
    ],
  },
]);
check(sources.length === 2, 'le fonti arrivano solo dai campi strutturati e sono deduplicate');
check(sources[0]?.domain === 'example.com', 'il dominio è derivato in modo sicuro dalla URL');
check(!sources.some((source) => source.url.includes('inventata')), 'nessuna URL viene estratta dal testo');

const upstreamEvents = [
  { type: 'message_start', message: { model: 'claude-sonnet-5', usage: { input_tokens: 12 } } },
  { type: 'content_block_start', content_block: { type: 'server_tool_use', name: 'web_search' } },
  {
    type: 'content_block_start',
    content_block: {
      type: 'web_search_tool_result',
      content: [{ type: 'web_search_result', title: 'Risultato', url: 'https://example.com/result' }],
    },
  },
  { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Ciao' } },
  { type: 'content_block_delta', delta: { type: 'text_delta', text: ' mondo' } },
  {
    type: 'message_delta',
    usage: { output_tokens: 4, server_tool_use: { web_search_requests: 1 } },
  },
];
const upstreamBody = upstreamEvents.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
const originalFetch = globalThis.fetch;
const originalKey = process.env.ANTHROPIC_API_KEY;
process.env.ANTHROPIC_API_KEY = 'test-only';
globalThis.fetch = async () =>
  new Response(upstreamBody, { status: 200, headers: { 'content-type': 'text/event-stream' } });

try {
  const streamed = await m.streamAnthropic({
    model: 'claude-sonnet-5',
    system: [],
    turns: [],
    user: 'cerca',
    maxTokens: 100,
    webSearch: true,
  });
  check(streamed.ok, 'lo stream Anthropic viene aperto');
  if (streamed.ok) {
    const text = await new Response(streamed.body).text();
    const events = text
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice(6)));
    const types = events.map((event) => event.type);
    check(types.includes('search_started'), 'emette search_started');
    check(types.includes('source_found'), 'emette source_found con la fonte reale');
    check(types.filter((type) => type === 'answer_started').length === 1, 'emette answer_started una volta');
    check(
      events.filter((event) => event.type === 'answer_delta').map((event) => event.delta).join('') ===
        'Ciao mondo',
      'emette answer_delta senza perdere testo',
    );
    check(types.at(-1) === 'answer_completed', 'chiude con answer_completed');
  }
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
}

if (failures) {
  console.error(`\n${failures} controllo/i falliti.`);
  process.exit(1);
}
console.log('\nTutto coerente.\n');
