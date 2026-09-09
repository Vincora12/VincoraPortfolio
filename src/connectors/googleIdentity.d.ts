/* Il minimo di Google Identity Services (GIS) per il flusso "token client":
   niente client secret, niente redirect server-side — l'app riceve un access
   token direttamente nel browser. Non è nella lib DOM di TypeScript perché è
   uno script esterno di Google, non uno standard web. */

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
}

interface GoogleTokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

interface Window {
  google?: {
    accounts: {
      oauth2: {
        initTokenClient(config: {
          client_id: string;
          scope: string;
          callback: (response: GoogleTokenResponse) => void;
          error_callback?: (error: { type: string }) => void;
        }): GoogleTokenClient;
        revoke(accessToken: string, done?: () => void): void;
      };
    };
  };
}
