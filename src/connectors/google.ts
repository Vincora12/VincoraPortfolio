/// <reference path="./googleIdentity.d.ts" />
import { GOOGLE_CALENDAR_SCOPE } from './types';
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
 * «Connetti» chiede solo Calendar in lettura per adesso — Gmail e Drive sono
 * i prossimi in coda: stesso Client ID, basterà aggiungere lo scope quando
 * arriva il loro turno, senza ricollegare da capo Calendar.
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
      scope: GOOGLE_CALENDAR_SCOPE,
      callback: (response) => {
        if (!response.access_token) {
          resolve({ ok: false, error: response.error === 'access_denied' ? 'Accesso negato.' : 'Nessun token ricevuto.' });
          return;
        }
        saveGoogleConfig({
          clientId,
          scopes: (response.scope ?? GOOGLE_CALENDAR_SCOPE).split(' '),
          accessToken: response.access_token,
          expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
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
  saveGoogleConfig({ clientId: config.clientId, scopes: [], accessToken: null, expiresAt: null });
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
): Promise<{ ok: true; events: CalendarEventSummary[] } | { ok: false; error: string }> {
  const config = loadGoogleConfig();
  if (!isGoogleConnected() || !config.accessToken) return { ok: false, error: 'Google Calendar non collegato. Vai in LAB → CONNETTORI.' };

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('maxResults', String(Math.min(50, Math.max(1, maxResults))));
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');

  const response = await fetch(url, { headers: { authorization: `Bearer ${config.accessToken}` } });
  if (response.status === 401) {
    saveGoogleConfig({ ...config, accessToken: null, expiresAt: null });
    return { ok: false, error: 'Sessione Google scaduta. Ricollega da LAB → CONNETTORI.' };
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
