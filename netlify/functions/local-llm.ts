/* ============================================================================
   LLM LOCALE — «si può scaricare un LLM locale che aiuta nei lavori minimi
   e diminuisce la spesa»

   🔷 Ollama, non un motore di inferenza scritto da zero: è già lo standard
   per girare un modello sul Mac, parla il protocollo di OpenAI (riuso diretto
   di `openAiProtocol`, vedi `providers.ts`) e sa scaricare i modelli da sé.
   Questo endpoint non sostituisce Ollama — lo installa l'utente da
   ollama.com, come per una chiave API — gli fa solo da porta: dice se è
   acceso, cosa è già scaricato, e scarica qualunque modello della libreria
   Ollama tu scelga (ollama.com/library) — non solo i 5 suggeriti.

   🔒 VALIDAZIONE DI FORMA, NON PIÙ UN ELENCO CHIUSO. «Voglio collegare i vari
   modelli e scaricarli io se voglio» — quindi `model` non è più ristretto ai
   nomi di `TEXT_CHEAP_CHOICES`: basta che assomigli davvero a un tag Ollama
   (`SAFE_MODEL_NAME`). Resta comunque un download verso Ollama stesso, mai
   verso un URL arbitrario: la richiesta va sempre e solo a `${base()}/api/pull`.

   ⚠️ NIENTE TIMEOUT DA RISPETTARE. Scaricare un modello da 2-4 GB richiede
   minuti, non secondi — su una vera funzione Netlify sarebbe stato ucciso a
   dieci secondi. Questo server (`server/core-server.ts`) non ha quel limite:
   è un processo Node che vive per conto suo, quindi una POST che aspetta il
   download è onesta, non un modo di fallire in silenzio. */

import { authorize, denied, json } from './_shared/auth';
import { TEXT_CHEAP_CHOICES } from './_shared/routing';

function base(): string {
  return (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
}

const RECOMMENDED = TEXT_CHEAP_CHOICES.filter((c) => c.provider === 'ollama');

/** Tag Ollama valido: `nome`, `nome:tag`, o `namespace/nome:tag`. Niente URL, niente percorsi. */
const SAFE_MODEL_NAME = /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?(\/[a-z0-9]([a-z0-9._-]*[a-z0-9])?)?(:[a-z0-9]([a-z0-9._-]*[a-z0-9])?)?$/i;

async function handleGet(request: Request): Promise<Response> {
  const auth = authorize(request);
  if (!auth.ok) {
    console.warn('[local-llm] richiesta rifiutata:', auth.reason);
    return denied();
  }
  let online = false;
  let installed: string[] = [];
  try {
    const response = await fetch(`${base()}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (response.ok) {
      online = true;
      const body = (await response.json()) as { models?: { name?: string; model?: string }[] };
      installed = (body.models ?? []).flatMap((m) => (m.model ?? m.name ? [String(m.model ?? m.name)] : []));
    }
  } catch {
    online = false;
  }
  return json({
    online,
    installed,
    recommended: RECOMMENDED.map((c) => ({ model: c.model, label: c.label, it: c.it })),
  });
}

async function handlePost(request: Request): Promise<Response> {
  const auth = authorize(request);
  if (!auth.ok) {
    console.warn('[local-llm] richiesta rifiutata:', auth.reason);
    return denied();
  }
  let body: { action?: string; model?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'body non leggibile' }, 400);
  }
  if (body.action !== 'pull') return json({ error: 'azione non supportata' }, 400);
  const model = (body.model ?? '').trim();
  if (!model || model.length > 100 || !SAFE_MODEL_NAME.test(model)) return json({ error: 'nome modello non valido' }, 400);

  try {
    const response = await fetch(`${base()}/api/pull`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, stream: false }),
    });
    if (!response.ok) {
      return json({ ok: false, error: `Ollama ha risposto ${response.status}: ${(await response.text()).slice(0, 300)}` }, 502);
    }
    const result = (await response.json()) as { status?: string };
    return json({ ok: result.status === 'success', status: result.status ?? 'sconosciuto' });
  } catch (error) {
    return json({ ok: false, error: `Ollama non risponde: ${error instanceof Error ? error.message : 'errore sconosciuto'}` }, 502);
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'GET') return handleGet(request);
  if (request.method === 'POST') return handlePost(request);
  return json({ error: 'solo GET o POST' }, 405);
}

export const config = { path: '/api/local-llm' };
