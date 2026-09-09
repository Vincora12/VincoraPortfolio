import type { CustomConnector } from './types';
import { loadCustomConnectors, saveCustomConnectors } from './store';

export function listCustomConnectors(): CustomConnector[] {
  return loadCustomConnectors();
}

export function upsertCustomConnector(connector: CustomConnector): void {
  const list = loadCustomConnectors();
  const i = list.findIndex((c) => c.id === connector.id);
  if (i >= 0) list[i] = connector;
  else list.push(connector);
  saveCustomConnectors(list);
}

export function removeCustomConnector(id: string): void {
  saveCustomConnectors(loadCustomConnectors().filter((c) => c.id !== id));
}

const MAX_RESPONSE_CHARS = 4000;

/**
 * Un GET generico verso un servizio che l'utente ha collegato lui stesso.
 * Nessuna scrittura — è un modo di far leggere a VINZ un sito qualunque con
 * la sua chiave, non un client REST completo. Se il servizio non risponde
 * con CORS aperto, la richiesta fallisce nel browser: è un limite del
 * servizio scelto, non qualcosa che questo connettore possa aggirare.
 */
export async function callCustomConnector(
  id: string,
  path: string,
): Promise<{ ok: true; body: string } | { ok: false; error: string }> {
  const connector = loadCustomConnectors().find((c) => c.id === id);
  if (!connector) return { ok: false, error: `Nessun connettore custom con id "${id}". Controlla LAB → CONNETTORI.` };

  let url: URL;
  try {
    url = new URL(path.replace(/^\//, ''), connector.baseUrl.endsWith('/') ? connector.baseUrl : `${connector.baseUrl}/`);
  } catch {
    return { ok: false, error: 'Percorso non valido.' };
  }

  try {
    const response = await fetch(url, {
      headers: connector.headerValue ? { [connector.headerName || 'Authorization']: connector.headerValue } : {},
    });
    const text = await response.text();
    if (!response.ok) return { ok: false, error: `${connector.name} ha risposto ${response.status}: ${text.slice(0, 300)}` };
    return { ok: true, body: text.slice(0, MAX_RESPONSE_CHARS) };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? `Richiesta non riuscita: ${cause.message}` : 'Richiesta non riuscita.' };
  }
}
