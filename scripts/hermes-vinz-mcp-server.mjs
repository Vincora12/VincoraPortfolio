import readline from 'node:readline';

const coreUrl = (process.env.VINZMON_CORE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const token = process.env.VINZMON_TOKEN || '';

const tools = [
  {
    name: 'vinz_leggi_me',
    description: 'Legge il diario ME canonico di VINZ.MON: pasti, allenamenti, peso, dieta, piano e obiettivi. Non modifica nulla.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'vinz_registra_pasto',
    description: 'Registra un pasto in ME. Usalo solo quando le istruzioni del turno dicono esplicitamente che la conferma è autorizzata. request_id deve essere quello indicato nelle istruzioni.',
    inputSchema: {
      type: 'object', required: ['request_id', 'slot', 'description', 'kcal', 'protein', 'carbs', 'fat'], additionalProperties: false,
      properties: {
        request_id: { type: 'string' }, slot: { type: 'string', enum: ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena', 'extra'] },
        description: { type: 'string' }, kcal: { type: 'number' }, protein: { type: 'number' }, carbs: { type: 'number' }, fat: { type: 'number' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      },
    },
  },
  {
    name: 'vinz_registra_allenamento',
    description: 'Registra un allenamento in ME, solo dopo conferma autorizzata nelle istruzioni del turno.',
    inputSchema: { type: 'object', required: ['request_id', 'details', 'minutes'], additionalProperties: false, properties: { request_id: { type: 'string' }, title: { type: 'string' }, details: { type: 'string' }, minutes: { type: 'number' } } },
  },
  {
    name: 'vinz_registra_peso',
    description: 'Registra il peso in ME, solo dopo conferma autorizzata nelle istruzioni del turno.',
    inputSchema: { type: 'object', required: ['request_id', 'kg'], additionalProperties: false, properties: { request_id: { type: 'string' }, kg: { type: 'number' } } },
  },
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function callTool(name, args) {
  if (!token) throw new Error('VINZMON_TOKEN non configurato per il bridge Hermes.');
  const requestId = typeof args.request_id === 'string' ? args.request_id : '';
  const forwarded = { ...args };
  delete forwarded.request_id;
  const response = await fetch(`${coreUrl}/api/hermes-tools`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ tool: name, request_id: requestId, arguments: forwarded }), signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({ error: `VINZ.MON HTTP ${response.status}` }));
  if (!response.ok) throw new Error(body.message || body.error || `VINZ.MON HTTP ${response.status}`);
  return { content: [{ type: 'text', text: JSON.stringify(body) }] };
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', async (line) => {
  let request;
  try { request = JSON.parse(line); } catch { return; }
  if (request.method === 'notifications/initialized') return;
  const base = { jsonrpc: '2.0', id: request.id };
  try {
    if (request.method === 'initialize') {
      send({ ...base, result: { protocolVersion: request.params?.protocolVersion || '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'vinzmon', version: '1.0.0' } } });
    } else if (request.method === 'tools/list') {
      send({ ...base, result: { tools } });
    } else if (request.method === 'tools/call') {
      send({ ...base, result: await callTool(request.params?.name, request.params?.arguments || {}) });
    } else if (request.id !== undefined) {
      send({ ...base, error: { code: -32601, message: 'Method not found' } });
    }
  } catch (error) {
    send({ ...base, result: { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] } });
  }
});
