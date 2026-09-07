/* ============================================================================
   IL MOTORE DELLA CHAT V2

   Un'interfaccia sola, due implementazioni vere:

     lobehub    → il servizio LobeHub self-hosted, REST `/api/v1` (stock)
     vinz-core  → il Local Core Server di VINZ, `/v1/chat/completions`

   🔒 NESSUN MOTORE FINTO. Se LobeHub non è configurato o non risponde, V2 NON
   simula una risposta: lo dichiara e, se il Core è disponibile, offre di
   ricadere lì — una scelta esplicita, visibile in testa alla conversazione.

   ⚠️ CHI ESEGUE GLI STRUMENTI. Gli strumenti VINZ girano nel client (vedi
   `tools.ts`), mai dentro il motore: così la stessa definizione vale per
   entrambi e nessuno dei due deve conoscere lo store di VINZ.
   ========================================================================= */

import type { V2ToolRun } from './types';

export type EngineId = 'lobehub' | 'vinz-core';

export type HealthState =
  | { status: 'online'; detail: string }
  | { status: 'offline'; detail: string }
  | { status: 'unconfigured'; detail: string };

export interface EngineTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface SendOptions {
  turns: EngineTurn[];
  signal: AbortSignal;
  /** Segnala che uno strumento è partito/finito, per il pannello attività. */
  onToolRun(run: V2ToolRun): void;
}

export interface EngineReply {
  text: string;
  model?: string;
  toolRuns: V2ToolRun[];
}

export interface ChatEngine {
  id: EngineId;
  label: string;
  health(signal?: AbortSignal): Promise<HealthState>;
  send(options: SendOptions): Promise<EngineReply>;
}

export class EngineError extends Error {}
