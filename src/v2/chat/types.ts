export type V2Role = 'user' | 'assistant';

export type V2ToolStatus = 'running' | 'ok' | 'error';

export interface V2ToolRun {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: V2ToolStatus;
  result?: string;
  error?: string;
  ms?: number;
}

export interface V2Message {
  id: string;
  role: V2Role;
  text: string;
  createdAt: number;
  /** Vuoto per i messaggi che non hanno fatto lavorare nessuno strumento. */
  toolRuns?: V2ToolRun[];
  /** Quale motore ha prodotto la risposta: si vede nel dettaglio attività. */
  engine?: string;
  model?: string;
  failed?: boolean;
}

export interface V2Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: V2Message[];
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
