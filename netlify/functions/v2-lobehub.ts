/* ============================================================================
   /api/v2-lobehub — l'adattatore VINZ verso il servizio LobeHub

   🔒 ESISTE PER UNA RAGIONE SOLA: LA CHIAVE. L'API di LobeHub si autentica con
   una API key Bearer. Se il browser la conoscesse, sarebbe un segreto nel
   client — cioè un segreto pubblicato. Qui la chiave resta sul Mac, dentro
   `.env`, e il browser parla solo con il proprio Core con il token di VINZ che
   ha già.

   🔷 LOBEHUB RESTA STOCK. Nessuna patch upstream: questo file parla la REST API
   pubblica di LobeHub (`/api/v1`, pacchetto `@lobechat/openapi`), la stessa
   documentata da `/api/v1/openapi.json`. Aggiornare LobeHub vuol dire cambiare
   il tag dell'immagine, non toccare il suo codice. Vedi
   `docs/LOBEHUB_UPGRADE.md`.

   ⚠️ SUPERFICIE MINIMA, LETTURA PRIMA. Due operazioni: `health` e `chat`.
   Niente proxy generico verso un URL scelto dal client — un proxy così sarebbe
   un SSRF con il token di casa attaccato sopra.
   ========================================================================= */

import { authorize, denied, json } from './_shared/auth';

const TIMEOUT_MS = 60_000;

interface ChatBody {
  messages?: { role: 'user' | 'assistant' | 'system'; content: string }[];
}

function config(): { url: string; key: string; model?: string; provider?: string } | null {
  const url = (process.env.LOBEHUB_URL ?? '').trim().replace(/\/+$/, '');
  const key = (process.env.LOBEHUB_API_KEY ?? '').trim();
  if (!url || !key) return null;
  return {
    url,
    key,
    model: (process.env.LOBEHUB_MODEL ?? '').trim() || undefined,
    provider: (process.env.LOBEHUB_PROVIDER ?? '').trim() || undefined,
  };
}

async function call(path: string, init: RequestInit, key: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(path, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(request: Request): Promise<Response> {
  const auth = authorize(request);
  if (!auth.ok) return denied();

  const settings = config();

  if (request.method === 'GET') {
    if (!settings) {
      return json({
        configured: false,
        detail: 'LOBEHUB_URL o LOBEHUB_API_KEY non impostate nel .env del Core.',
      });
    }
    try {
      const response = await call(`${settings.url}/api/v1/health`, { method: 'GET' }, settings.key);
      return json({
        configured: true,
        online: response.ok,
        httpStatus: response.status,
        model: settings.model ?? null,
        provider: settings.provider ?? null,
        detail: response.ok ? 'Servizio LobeHub raggiungibile.' : `LobeHub ha risposto ${response.status}.`,
      });
    } catch (error) {
      return json({
        configured: true,
        online: false,
        detail: error instanceof Error ? error.message : 'LobeHub non raggiungibile.',
      });
    }
  }

  if (request.method !== 'POST') return json({ error: 'solo GET e POST' }, 405);
  if (!settings) return json({ error: 'LobeHub non è configurato su questo Core.' }, 503);

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return json({ error: 'body non leggibile' }, 400);
  }

  const messages = (body.messages ?? []).filter((message) => message.content?.trim());
  if (!messages.length) return json({ error: 'messages mancante o vuoto' }, 400);

  try {
    /* `stream` resta falso: lo schema di `/api/v1/chat` (v2.2.16) RIFIUTA
       `stream: true` e rimanda a `/responses`. Vedi docs/VINZMON_V2.md. */
    const response = await call(
      `${settings.url}/api/v1/chat`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages,
          ...(settings.model ? { model: settings.model } : {}),
          ...(settings.provider ? { provider: settings.provider } : {}),
          stream: false,
        }),
      },
      settings.key,
    );

    const payload = (await response.json().catch(() => null)) as
      | { content?: string; model?: string; provider?: string; error?: string; message?: string }
      | null;

    if (!response.ok) {
      return json(
        { error: payload?.error ?? payload?.message ?? `LobeHub ha risposto ${response.status}.` },
        response.status === 401 ? 502 : 502,
      );
    }

    return json({
      content: payload?.content ?? '',
      model: payload?.model ?? settings.model ?? null,
      provider: payload?.provider ?? settings.provider ?? null,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'LobeHub non raggiungibile.' }, 502);
  }
}
