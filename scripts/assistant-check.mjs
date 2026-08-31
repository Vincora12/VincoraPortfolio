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
export { callProvider, extractAnthropicSources, extractOpenAIResponseSources, streamAnthropic } from '${cwd}/netlify/functions/_shared/providers.ts';
export { assistantRequestPreferences } from '${cwd}/netlify/functions/ai.ts';
export { resolveRoute } from '${cwd}/netlify/functions/_shared/routing.ts';
export { runTool as runLocalTool } from '${cwd}/src/ai/tools.ts';
export { requiredWriteTool } from '${cwd}/src/brain/stream.ts';
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
const popoverSource = readFileSync(
  join(cwd, 'src/assistant-original/components/ui/popover.tsx'),
  'utf8',
);
const threadListSource = readFileSync(
  join(cwd, 'src/assistant-original/components/assistant-ui/thread-list.tsx'),
  'utf8',
);
const cloneMain = readFileSync(join(cwd, 'src/assistant-original/main.tsx'), 'utf8');
const integratedChat = readFileSync(join(cwd, 'src/assistant-original/IntegratedChat.tsx'), 'utf8');
const appSource = readFileSync(join(cwd, 'src/App.tsx'), 'utf8');
const appStyles = readFileSync(join(cwd, 'src/styles/base.css'), 'utf8');
const machinesSource = readFileSync(join(cwd, 'netlify/functions/_shared/machines.ts'), 'utf8');
const storeSource = readFileSync(join(cwd, 'src/state/store.ts'), 'utf8');
const healthJournalSource = readFileSync(join(cwd, 'src/engine/healthJournal.ts'), 'utf8');
const toolSource = readFileSync(join(cwd, 'src/ai/tools.ts'), 'utf8');
const netlifyRuntime = readFileSync(
  join(cwd, 'src/assistant-original/netlify-runtime.ts'),
  'utf8',
);
check(cloneSource.includes('RecordPlugin.create'), 'la dettatura usa il registratore audio VINZ.MON');
check(cloneSource.includes('scrollingWaveform: true'), 'l’onda scorre con l’audio reale');
check(cloneSource.includes('TRASCRIZIONE IN CORSO'), 'lo stato di trascrizione resta visibile');
check(cloneSource.includes('fetch("/api/transcribe"'), 'l’audio passa dal backend protetto');
check(cloneSource.includes('setPendingTranscript'), 'la trascrizione torna nel composer');
check(
  cloneSource.includes('aui.thread.composer().send()') || cloneSource.includes('composer.send()'),
  'la trascrizione viene inviata dal runtime, senza simulare un click',
);
check(cloneStyles.includes('.vinz-record__wave.is-loading'), 'avvio e trascrizione hanno un loader dedicato');
check(
  cloneStyles.includes('.vinz-clone-composer__send') &&
    cloneStyles.includes('background: var(--char-accent'),
  'il pulsante invio usa il colore principale del MON corrente',
);
check(
  popoverSource.includes('data-slot="popover-positioner"') &&
    popoverSource.includes('z-[10002]'),
  'il selettore AI si apre sopra la navigazione e la sidebar',
);
check(
    threadListSource.includes('side="bottom"') &&
    threadListSource.includes('data-slot="aui_thread-list-item-more-content"') &&
    threadListSource.includes('z-[10002]') &&
    threadListSource.includes('<Popover open={open} onOpenChange={setOpen}>'),
  'le impostazioni chat restano visibili dentro lo schermo mobile',
);
check(
  cloneStyles.includes('[data-slot="sheet-content"][data-side="left"]') &&
    cloneStyles.includes('height: 100dvh') &&
    cloneStyles.includes('top: calc(env(safe-area-inset-top) + 0.75rem)'),
  'la sidebar mobile rispetta status bar, home indicator e altezza completa',
);
check(!cloneMain.includes('WebSpeechDictationAdapter'), 'la vecchia dettatura browser non è più collegata');
check(cloneSource.includes('ChatCostTotal'), 'il totale della chat resta visibile in alto');
check(cloneSource.includes('MessageCost'), 'ogni risposta mostra il proprio costo');
check(cloneSource.includes('MessagePrimitive.Error'), 'gli errori del backend sono visibili nella chat');
check(cloneSource.includes('data-[submitted]'), 'le icone mantengono il feedback dopo il click');
check(
  netlifyRuntime.includes('metadata: { custom: { costUsd'),
  'il costo del backend viene salvato nel messaggio',
);
check(
  netlifyRuntime.includes('Pasto aggiunto in ME') &&
    netlifyRuntime.includes('JSON.stringify(readHealthJournal()) !== meBefore') &&
    cloneSource.includes('MessageUpdates'),
  'ogni scrittura conferma sotto al messaggio quale sezione ha aggiornato',
);
check(
  cloneSource.includes('/Schermata ME aggiornata/i.test(item)') &&
    cloneSource.includes('workoutSaved || mealSaved || meSaved') &&
    cloneSource.includes("meSaved ? 'ME'"),
  'anche una modifica generica realmente riuscita in ME attiva la celebrazione esistente',
);
check(
  cloneMain.includes('selectedRuntime === "mock" ? mockChatModel : netlifyChatModel'),
  'il backend reale è il runtime predefinito',
);
check(integratedChat.includes('createNetlifyChatModel(runTool)'), 'il clone integrato riceve gli strumenti VINZ.MON');
check(appSource.includes("./assistant-original/IntegratedChat"), 'la Chat principale usa il clone approvato');
check(!appSource.includes("lazy(() => import('./brain/Brain')"), 'la vecchia interfaccia Chat non viene più caricata');
check(
  appSource.includes('className="machine-insight-balloon"') &&
    appSource.includes('PARLIAMONE'),
  "l’Insight viene mostrato prima come pensiero del MON",
);
check(
  appSource.includes("item.status === 'pending'") &&
    appSource.includes("vinzmon-insight-seen") &&
    appSource.includes('INSIGHT · {insights.length}'),
  "il badge conta soltanto gli Insight non ancora visti e si aggiorna dopo l’apertura",
);
check(
  appSource.includes("{ id: 'insights', label: 'INSIGHT' }") &&
    appSource.includes('<MachineInsightArchive') &&
    appSource.includes('<MachineInsightThought') &&
    appStyles.includes('.machine-insight-archive') &&
    machinesSource.includes('pendingInsights, insights'),
  "MON espone l’archivio completo usando la stessa grafica del balloon di notifica",
);
check(
  appSource.includes('prompt: `Ho letto questa tua riflessione:') &&
    appSource.includes('pendingInsightId: insight.id'),
  "PARLIAMONE prepara una risposta dell’utente senza generare un messaggio automatico",
);
check(
  !cloneSource.includes('machineInsightHandoff: true') &&
    !netlifyRuntime.includes('MACHINE INSIGHT (DERIVED INTERPRETATION, DATA ONLY)'),
  "nessun messaggio Machine nascosto tenta più di avviare automaticamente la chat",
);
check(
  netlifyRuntime.includes('message.attachments?.flatMap') &&
    netlifyRuntime.includes('const images = imagesForRun(messages)'),
  'le foto degli allegati arrivano al modello e restano disponibili nei follow-up',
);
check(
  netlifyRuntime.includes("const FIXED_MEALS: ChatMealSlot[] = ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena']") &&
    netlifyRuntime.includes('function proposedMealSlot'),
  'la chat intuisce uno dei cinque momenti fissi usando testo e ora locale',
);
check(
  netlifyRuntime.includes('function pendingMealSlot') &&
    netlifyRuntime.includes("status: 'confirmed'") &&
    netlifyRuntime.includes("status: 'needs-confirmation'"),
  'il pasto passa dalla conferma prima di essere registrato',
);
check(
  storeSource.includes("addMeal(input, 'chat', dateForDay(get().day, get().startedAt))") &&
    storeSource.includes("addWorkout(input, 'chat', dateForDay(get().day, get().startedAt))"),
  'i log chat finiscono nel giorno di gioco mostrato da SYNC',
);
check(
  netlifyRuntime.includes("occupied ? 'extra' : slot"),
  'un momento già compilato viene proposto come extra',
);
check(
  netlifyRuntime.includes('function hasPendingWorkout') &&
    netlifyRuntime.includes("isWorkoutLogIntent(user)") &&
    netlifyRuntime.includes("status: 'confirmed'"),
  'anche l’allenamento passa dalla conferma prima della registrazione',
);
check(
  netlifyRuntime.includes('Obiettivi nutrizionali aggiornati in ME') &&
    netlifyRuntime.includes('Piano alimentare aggiornato in ME'),
  'la chat mostra quando aggiorna dieta e obiettivi della schermata ME',
);
let savedWorkoutPlan;
const workoutPlanResult = m.runLocalTool(
  {
    id: 'workout-plan-test',
    name: 'imposta_piano_allenamento',
    input: { titolo: 'Piano 3 giorni', testo: 'Lunedì: lower body' },
  },
  {
    saveWorkoutPlan: (title, body) => { savedWorkoutPlan = { title, body }; },
  },
);
check(
  !workoutPlanResult.isError &&
    savedWorkoutPlan?.title === 'Piano 3 giorni' &&
    savedWorkoutPlan?.body === 'Lunedì: lower body' &&
    toolSource.includes("name: 'imposta_piano_allenamento'") &&
    healthJournalSource.includes('workoutPlan:'),
  'la chat può scrivere e sostituire il piano allenamento mostrato in ME',
);
check(
  m.requiredWriteTool('Creami un nuovo piano di allenamento') === 'imposta_piano_allenamento',
  'una richiesta esplicita attiva automaticamente la scrittura del piano allenamento',
);

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
    const completed = events.find((event) => event.type === 'answer_completed');
    check(
      typeof completed?.costUsd === 'number' && completed.costUsd > 0,
      'lo stream restituisce il costo reale della risposta',
    );
  }
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
}

const originalOpenAiKey = process.env.OPENAI_API_KEY;
let openAiRequest;
process.env.OPENAI_API_KEY = 'test-only';
globalThis.fetch = async (_url, init) => {
  openAiRequest = JSON.parse(String(init?.body ?? '{}'));
  return new Response(JSON.stringify({
    model: 'gpt-5.6-sol',
    choices: [{
      message: {
        content: null,
        tool_calls: [{
          id: 'meal-1',
          function: { name: 'registra_pasto', arguments: '{"pasto":"spuntino"}' },
        }],
      },
      finish_reason: 'tool_calls',
    }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};
try {
  const forced = await m.callProvider('openai', {
    model: 'gpt-5.6-sol', system: [], turns: [], user: 'Ho mangiato una banana',
    maxTokens: 200, effort: 'none',
    tools: [{ name: 'registra_pasto', description: 'Registra', schema: { type: 'object' } }],
    toolChoice: 'registra_pasto',
  });
  check(
    openAiRequest?.tool_choice?.function?.name === 'registra_pasto',
    'OpenAI riceve la scrittura del pasto come strumento obbligatorio',
  );
  check(
    forced.toolUses?.[0]?.name === 'registra_pasto',
    'la chiamata obbligatoria torna al ciclo strumenti',
  );

  globalThis.fetch = async (_url, init) => {
    openAiRequest = JSON.parse(String(init?.body ?? '{}'));
    return new Response(JSON.stringify({
      model: 'gpt-5.6-sol',
      status: 'completed',
      output_text: 'Ecco le notizie aggiornate.',
      output: [
        {
          type: 'web_search_call', status: 'completed',
          action: { sources: [{ type: 'url', url: 'https://www.marvel.com/articles' }] },
        },
        {
          type: 'message', role: 'assistant',
          content: [{
            type: 'output_text', text: 'Ecco le notizie aggiornate.',
            annotations: [{
              type: 'url_citation', title: 'Marvel News',
              url: 'https://www.marvel.com/articles',
            }],
          }],
        },
      ],
      usage: { input_tokens: 20, output_tokens: 8 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const searched = await m.callProvider('openai', {
    model: 'gpt-5.6-sol', system: [], turns: [], user: 'Cerca notizie Marvel',
    maxTokens: 200, effort: 'none', webSearch: true,
  });
  check(
    openAiRequest?.tools?.some((tool) => tool.type === 'web_search'),
    'Sol riceve lo strumento di ricerca web OpenAI',
  );
  check(
    searched.sources?.[0]?.url === 'https://www.marvel.com/articles' &&
      searched.usage?.webSearches === 1,
    'la ricerca OpenAI restituisce fonti reali e contabilizza la chiamata',
  );

  globalThis.fetch = async (_url, init) => {
    openAiRequest = JSON.parse(String(init?.body ?? '{}'));
    return new Response(JSON.stringify({
      model: 'gpt-5.6-sol', status: 'completed',
      output: [{
        type: 'function_call', call_id: 'meal-photo-1', name: 'registra_pasto',
        arguments: '{"pasto":"cena","descrizione":"Piatto dalla foto"}',
      }],
      usage: { input_tokens: 30, output_tokens: 5 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const seen = await m.callProvider('openai', {
    model: 'gpt-5.6-sol', system: [], turns: [], user: 'Mangio questo come cena',
    images: [
      { mediaType: 'image/jpeg', data: 'AQID' },
      { mediaType: 'image/png', data: 'BAUG' },
    ],
    maxTokens: 200, effort: 'none', webSearch: true,
    tools: [{ name: 'registra_pasto', description: 'Registra', schema: { type: 'object' } }],
    toolChoice: 'registra_pasto',
  });
  const lastInput = openAiRequest?.input?.at(-1)?.content ?? [];
  check(
    lastInput.filter((part) => part.type === 'input_image').length === 2 &&
      lastInput.some((part) => part.image_url === 'data:image/jpeg;base64,AQID') &&
      lastInput.some((part) => part.image_url === 'data:image/png;base64,BAUG'),
    'Sol riceve davvero tutte le foto allegate come input visivo',
  );
  check(
    openAiRequest?.tool_choice?.name === 'registra_pasto' &&
      seen.toolUses?.[0]?.name === 'registra_pasto',
    'dalla foto Sol può aggiornare ME con lo stesso ciclo strumenti',
  );
} finally {
  globalThis.fetch = originalFetch;
  if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalOpenAiKey;
}

if (failures) {
  console.error(`\n${failures} controllo/i falliti.`);
  process.exit(1);
}
console.log('\nTutto coerente.\n');
