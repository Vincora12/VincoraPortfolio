/// <reference path="./googleIdentity.d.ts" />
import { GOOGLE_SCOPES } from './types';
import { loadGoogleConfig, saveGoogleConfig } from './store';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let gisLoading: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoading) return gisLoading;
  gisLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Identity Services non raggiungibile.'));
    document.head.appendChild(script);
  });
  return gisLoading;
}

export function isGoogleConnected(): boolean {
  const config = loadGoogleConfig();
  return Boolean(config.accessToken && config.expiresAt && config.expiresAt > Date.now());
}

export function googleClientId(): string {
  return loadGoogleConfig().clientId;
}

export function saveGoogleClientId(clientId: string): void {
  saveGoogleConfig({ ...loadGoogleConfig(), clientId: clientId.trim() });
}

/**
 * Un COLLEGA chiede Calendar + Drive + Gmail insieme, tutti in sola lettura:
 * un consenso solo, non uno per servizio, e mai bisogno di ricollegare da
 * capo quando VINZ impara a usare il servizio successivo.
 */
export async function connectGoogle(): Promise<{ ok: true } | { ok: false; error: string }> {
  const clientId = googleClientId();
  if (!clientId) return { ok: false, error: 'Manca il Client ID Google. Creane uno su console.cloud.google.com e incollalo qui sopra.' };
  try {
    await loadGis();
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : 'Google Identity Services non raggiungibile.' };
  }
  if (!window.google?.accounts?.oauth2) return { ok: false, error: 'Google Identity Services non disponibile.' };

  return new Promise((resolve) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPES,
      callback: (response) => {
        if (!response.access_token) {
          resolve({ ok: false, error: response.error === 'access_denied' ? 'Accesso negato.' : 'Nessun token ricevuto.' });
          return;
        }
        saveGoogleConfig({
          clientId,
          scopes: (response.scope ?? GOOGLE_SCOPES).split(' '),
          accessToken: response.access_token,
          expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
          calendars: loadGoogleConfig().calendars,
        });
        resolve({ ok: true });
      },
      error_callback: (error) => resolve({ ok: false, error: `Google ha rifiutato la richiesta: ${error.type}` }),
    });
    client.requestAccessToken();
  });
}

export function disconnectGoogle(): void {
  const config = loadGoogleConfig();
  if (config.accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(config.accessToken);
  }
  saveGoogleConfig({ clientId: config.clientId, scopes: [], accessToken: null, expiresAt: null, calendars: [] });
}

/**
 * Un solo account Google ha già più calendari (personale, lavoro…): la
 * scelta per progetto sceglie TRA QUESTI, non richiede un secondo accesso.
 */
export async function listGoogleCalendars(): Promise<{ ok: true; calendars: { id: string; label: string }[] } | { ok: false; error: string }> {
  const config = loadGoogleConfig();
  if (!isGoogleConnected() || !config.accessToken) return { ok: false, error: 'Google Calendar non collegato.' };
  const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { authorization: `Bearer ${config.accessToken}` },
  });
  if (!response.ok) return { ok: false, error: `Google ha risposto ${response.status}.` };
  const body = (await response.json()) as { items?: { id: string; summary?: string }[] };
  return { ok: true, calendars: (body.items ?? []).map((c) => ({ id: c.id, label: c.summary ?? c.id })) };
}

/** null = tutti i progetti. Un calendario alla volta per progetto: riassegnarlo lo sposta, non lo duplica. */
export function assignCalendarToProject(calendarId: string, label: string, projectId: string | null): void {
  const config = loadGoogleConfig();
  const others = config.calendars.filter((c) => c.id !== calendarId);
  saveGoogleConfig({ ...config, calendars: [...others, { id: calendarId, label, projectId }] });
}

export function unassignCalendar(calendarId: string): void {
  const config = loadGoogleConfig();
  saveGoogleConfig({ ...config, calendars: config.calendars.filter((c) => c.id !== calendarId) });
}

/** Nessuna assegnazione per questo progetto → quella generale, se c'è → "primary". */
export function resolveCalendarIdForProject(projectId: string | null): string {
  const { calendars } = loadGoogleConfig();
  return calendars.find((c) => c.projectId === projectId)?.id
    ?? calendars.find((c) => c.projectId === null)?.id
    ?? 'primary';
}

export interface CalendarEventSummary {
  title: string;
  start: string;
  end: string;
}

/**
 * Legge solo, e solo gli eventi già passati/futuri richiesti — nessuna
 * scrittura sul calendario reale dell'utente da questo connettore.
 */
export async function searchCalendarEvents(
  timeMin: string,
  timeMax: string,
  maxResults = 10,
  calendarId = 'primary',
): Promise<{ ok: true; events: CalendarEventSummary[] } | { ok: false; error: string }> {
  const config = loadGoogleConfig();
  if (!isGoogleConnected() || !config.accessToken) return { ok: false, error: 'Google Calendar non collegato. Vai in FILES.' };

  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('maxResults', String(Math.min(50, Math.max(1, maxResults))));
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');

  const response = await fetch(url, { headers: { authorization: `Bearer ${config.accessToken}` } });
  if (response.status === 401) {
    saveGoogleConfig({ ...config, accessToken: null, expiresAt: null });
    return { ok: false, error: 'Sessione Google scaduta. Ricollega da FILES.' };
  }
  if (!response.ok) return { ok: false, error: `Google Calendar ha risposto ${response.status}.` };

  const body = (await response.json()) as { items?: { summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }[] };
  const events = (body.items ?? []).map((item) => ({
    title: item.summary ?? '(senza titolo)',
    start: item.start?.dateTime ?? item.start?.date ?? '',
    end: item.end?.dateTime ?? item.end?.date ?? '',
  }));
  return { ok: true, events };
}

/** Un fetch autenticato verso una qualunque API Google — stessa gestione del token scaduto per Calendar/Drive/Gmail. */
async function googleFetch(url: string | URL): Promise<{ ok: true; response: Response } | { ok: false; error: string }> {
  const config = loadGoogleConfig();
  if (!isGoogleConnected() || !config.accessToken) return { ok: false, error: 'Google non collegato. Vai in FILES.' };
  const response = await fetch(url, { headers: { authorization: `Bearer ${config.accessToken}` } });
  if (response.status === 401) {
    saveGoogleConfig({ ...config, accessToken: null, expiresAt: null });
    return { ok: false, error: 'Sessione Google scaduta. Ricollega da FILES.' };
  }
  if (!response.ok) return { ok: false, error: `Google ha risposto ${response.status}.` };
  return { ok: true, response };
}

export interface DriveFileSummary {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink: string;
}

/** Cerca per nome — la stessa ricerca che fai tu nella barra di Drive. Sola lettura. */
export async function searchDriveFiles(query: string, maxResults = 10): Promise<{ ok: true; files: DriveFileSummary[] } | { ok: false; error: string }> {
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', `name contains '${query.replace(/'/g, "\\'")}' and trashed = false`);
  url.searchParams.set('pageSize', String(Math.min(30, Math.max(1, maxResults))));
  url.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime,webViewLink)');
  url.searchParams.set('orderBy', 'modifiedTime desc');
  const result = await googleFetch(url);
  if (!result.ok) return result;
  const body = (await result.response.json()) as { files?: DriveFileSummary[] };
  return { ok: true, files: body.files ?? [] };
}

const GOOGLE_DOC_EXPORT_MIME: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
};

const MAX_DRIVE_TEXT_CHARS = 20_000;

/** Solo testo. Google Docs/Sheets/Slides si esportano come testo semplice; un file già di testo si legge diretto; il resto (PDF, immagini…) resta un link, non un tentativo di decodifica che produrrebbe rumore. */
export async function readDriveFile(fileId: string): Promise<{ ok: true; name: string; text: string } | { ok: false; error: string }> {
  const metaResult = await googleFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,webViewLink`);
  if (!metaResult.ok) return metaResult;
  const meta = (await metaResult.response.json()) as { name: string; mimeType: string; webViewLink?: string };

  const exportMime = GOOGLE_DOC_EXPORT_MIME[meta.mimeType];
  const isPlainText = meta.mimeType.startsWith('text/') || meta.mimeType === 'application/json';
  if (!exportMime && !isPlainText) {
    return { ok: true, name: meta.name, text: `[${meta.mimeType}, non leggibile come testo qui — link: ${meta.webViewLink ?? '(nessuno)'}]` };
  }

  const contentUrl = exportMime
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMime)}`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
  const contentResult = await googleFetch(contentUrl);
  if (!contentResult.ok) return contentResult;
  const text = (await contentResult.response.text()).slice(0, MAX_DRIVE_TEXT_CHARS);
  return { ok: true, name: meta.name, text };
}

export interface GmailMessageSummary {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

function gmailHeader(headers: { name?: string; value?: string }[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

/** Cerca con la stessa sintassi della barra di ricerca Gmail (es. "from:ffuoco", "is:unread"). Sola lettura. */
export async function searchGmail(query: string, maxResults = 10): Promise<{ ok: true; messages: GmailMessageSummary[] } | { ok: false; error: string }> {
  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  listUrl.searchParams.set('q', query);
  listUrl.searchParams.set('maxResults', String(Math.min(20, Math.max(1, maxResults))));
  const listResult = await googleFetch(listUrl);
  if (!listResult.ok) return listResult;
  const list = (await listResult.response.json()) as { messages?: { id: string }[] };

  const messages: GmailMessageSummary[] = [];
  for (const { id } of list.messages ?? []) {
    const detailUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`);
    detailUrl.searchParams.set('format', 'metadata');
    detailUrl.searchParams.append('metadataHeaders', 'Subject');
    detailUrl.searchParams.append('metadataHeaders', 'From');
    detailUrl.searchParams.append('metadataHeaders', 'Date');
    const detailResult = await googleFetch(detailUrl);
    if (!detailResult.ok) continue;
    const detail = (await detailResult.response.json()) as { snippet?: string; payload?: { headers?: { name?: string; value?: string }[] } };
    messages.push({
      id,
      subject: gmailHeader(detail.payload?.headers, 'Subject') || '(senza oggetto)',
      from: gmailHeader(detail.payload?.headers, 'From'),
      date: gmailHeader(detail.payload?.headers, 'Date'),
      snippet: detail.snippet ?? '',
    });
  }
  return { ok: true, messages };
}
