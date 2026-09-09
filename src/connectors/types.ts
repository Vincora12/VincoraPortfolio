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

/* 🔷 «Nel progetto ffuoco un calendario diverso rispetto al progetto
   generale, che è il mio personale.» Un solo account Google ha già più
   calendari al suo interno (API `calendarList`) — non serve un secondo
   accesso OAuth per progetto, basta lasciare che ogni progetto scelga QUALE
   calendario di quell'account usare. `projectId: null` è il jolly «tutti i
   progetti»: lo stesso jolly che ProjectPill usa per «Generale». */
export interface GoogleCalendarChoice {
  id: string;
  label: string;
  projectId: string | null;
}

export interface GoogleConnectorConfig {
  /** L'utente crea il proprio OAuth Client ID su console.cloud.google.com — non ne generiamo uno per lui. */
  clientId: string;
  scopes: string[];
  accessToken: string | null;
  /** Epoch ms. Il flusso è token-only (nessun refresh token): scaduto, si chiede di ricollegare. */
  expiresAt: number | null;
  /** Assegnazioni progetto → calendario. Vuoto = tutti usano "primary". */
  calendars: GoogleCalendarChoice[];
}

export interface ObsidianConnectorConfig {
  /** Solo il nome della cartella per mostrarlo in LAB — l'handle vero vive in IndexedDB, non è serializzabile in JSON. */
  vaultLabel: string | null;
  /** null = tutti i progetti; altrimenti solo quello. Un vault solo, non una lista: chi ne vuole due lo chiede. */
  projectId: string | null;
}

/* 🔷 Apple non offre un'API di lettura diretta di iCloud Drive per un'app web
   di terze parti — niente OAuth possibile qui. Ma iCloud Drive sincronizza
   già i file su questo Mac (~/Library/Mobile Documents/com~apple~CloudDocs),
   e il browser sa aprire una cartella locale con lo stesso permesso usato
   per Obsidian: nessun account Apple Developer, funziona subito. */
export interface ICloudConnectorConfig {
  folderLabel: string | null;
  projectId: string | null;
}

export interface CustomConnector {
  id: string;
  name: string;
  baseUrl: string;
  headerName: string;
  headerValue: string;
  note?: string;
  /** null = tutti i progetti. */
  projectId: string | null;
}

export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
export const GOOGLE_GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
/** Un solo COLLEGA chiede tutto: Calendar, Drive, Gmail. Un consenso solo, non tre. */
export const GOOGLE_SCOPES = [GOOGLE_CALENDAR_SCOPE, GOOGLE_DRIVE_SCOPE, GOOGLE_GMAIL_SCOPE].join(' ');
