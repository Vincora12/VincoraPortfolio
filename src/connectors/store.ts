import type { CustomConnector, GoogleConnectorConfig, ObsidianConnectorConfig } from './types';

const KEYS = {
  google: 'vinzmon.connectors.google',
  obsidian: 'vinzmon.connectors.obsidian',
  custom: 'vinzmon.connectors.custom',
} as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage pieno o negato: la config resta valida solo per questa sessione */
  }
}

export function loadGoogleConfig(): GoogleConnectorConfig {
  return read<GoogleConnectorConfig>(KEYS.google, { clientId: '', scopes: [], accessToken: null, expiresAt: null });
}

export function saveGoogleConfig(config: GoogleConnectorConfig): void {
  write(KEYS.google, config);
}

export function loadObsidianConfig(): ObsidianConnectorConfig {
  return read<ObsidianConnectorConfig>(KEYS.obsidian, { vaultLabel: null });
}

export function saveObsidianConfig(config: ObsidianConnectorConfig): void {
  write(KEYS.obsidian, config);
}

export function loadCustomConnectors(): CustomConnector[] {
  return read<CustomConnector[]>(KEYS.custom, []);
}

export function saveCustomConnectors(list: CustomConnector[]): void {
  write(KEYS.custom, list);
}
