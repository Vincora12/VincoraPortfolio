/* ============================================================================
   CONNETTORI ESTERNI

   🔷 «Mi manca collegare Google, second brain e tanti altri connettori a cui
   lui può attingere informazioni.»

   🔒 STESSA LEGGE DI PRIVACY DEGLI STRUMENTI IN `ai/tools.ts`: girano nel
   browser, non sul server. Un token Google, il permesso a una cartella
   Obsidian o la chiave di un servizio custom restano su questo Mac — mai
   spediti a una funzione Netlify per essere salvati altrove. Per questo la
   configurazione vive in `localStorage`/IndexedDB (vedi `store.ts` e
   `idbHandle.ts`), non in `.env` come le chiavi AI in `secrets.ts`: quelle
   servono al server per parlare con i modelli, queste servono al browser per
   parlare con i tuoi account personali. */

export interface GoogleConnectorConfig {
  /** L'utente crea il proprio OAuth Client ID su console.cloud.google.com — non ne generiamo uno per lui. */
  clientId: string;
  scopes: string[];
  accessToken: string | null;
  /** Epoch ms. Il flusso è token-only (nessun refresh token): scaduto, si chiede di ricollegare. */
  expiresAt: number | null;
}

export interface ObsidianConnectorConfig {
  /** Solo il nome della cartella per mostrarlo in LAB — l'handle vero vive in IndexedDB, non è serializzabile in JSON. */
  vaultLabel: string | null;
}

export interface CustomConnector {
  id: string;
  name: string;
  baseUrl: string;
  headerName: string;
  headerValue: string;
  note?: string;
}

export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
