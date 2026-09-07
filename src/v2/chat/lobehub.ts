/* ============================================================================
   MOTORE «lobehub» — il servizio LobeHub self-hosted

   Il browser NON parla mai con LobeHub direttamente: parla con
   `/api/v2-lobehub` sul Local Core, che tiene la API key. Vedi
   `netlify/functions/v2-lobehub.ts`.

   ⚠️ COSA NON FA ANCORA. `/api/v1/chat` di LobeHub 2.2.16 non accetta né
   `tools` né `stream`: gli strumenti VINZ, su questo motore, andranno esposti
   come server MCP registrato dentro LobeHub (`/api/v1/mcp-servers`) e non sono
   ancora collegati. Con questo motore la chat risponde davvero, ma senza
   strumenti; con `vinz-core` gli strumenti girano. È scritto nei documenti e
   si vede nel pannello attività — non viene simulato.
   ========================================================================= */

import { useApp } from '@/state/store';

import { EngineError, type ChatEngine, type EngineReply, type HealthState, type SendOptions } from './engine';

const ENDPOINT = '/api/v2-lobehub';

interface HealthPayload {
  configured?: boolean;
  online?: boolean;
  detail?: string;
}

interface ChatPayload {
  content?: string;
  model?: string;
  error?: string;
}

function token(): string | null {
  return useApp.getState().token;
}

export const lobehubEngine: ChatEngine = {
  id: 'lobehub',
  label: 'LobeHub',

  async health(signal): Promise<HealthState> {
    const auth = token();
    if (!auth) return { status: 'unconfigured', detail: 'VINZ.MON non è attivo: manca il token del Core.' };

    try {
      const response = await fetch(ENDPOINT, {
        headers: { authorization: `Bearer ${auth}` },
        cache: 'no-store',
        signal,
      });
      if (!response.ok) return { status: 'offline', detail: `Il Core ha risposto ${response.status}.` };

      const payload = (await response.json()) as HealthPayload;
      if (!payload.configured) {
        return { status: 'unconfigured', detail: payload.detail ?? 'Servizio LobeHub non configurato.' };
      }
      return payload.online
        ? { status: 'online', detail: payload.detail ?? 'Servizio LobeHub raggiungibile.' }
        : { status: 'offline', detail: payload.detail ?? 'Servizio LobeHub non raggiungibile.' };
    } catch {
      return { status: 'offline', detail: 'Il Core non risponde.' };
    }
  },

  async send({ turns, signal }: SendOptions): Promise<EngineReply> {
    const auth = token();
    if (!auth) throw new EngineError('VINZ.MON non è attivo: manca il token.');

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` },
      body: JSON.stringify({ messages: turns.map((turn) => ({ role: turn.role, content: turn.content })) }),
      signal,
    });

    const payload = (await response.json().catch(() => null)) as ChatPayload | null;
    if (!response.ok) throw new EngineError(payload?.error ?? `LobeHub ha risposto ${response.status}.`);

    return { text: payload?.content?.trim() ?? '', model: payload?.model, toolRuns: [] };
  },
};
