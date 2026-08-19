/* ============================================================================
   QUANTO CI METTE OGNI STEP, MISURATO SUL SERIO

   🔷 «Voglio poter confrontare BIO Luna → 1.4s, TEACH Luna → 0.9s, CHARACTER
      MASTER Sol → 32.7s. Così possiamo decidere in base ai dati veri.»

   ⚠️ MISURATO, NON STIMATO. In questa sessione ho sbagliato due volte a
   dedurre i tempi da numeri che misuravano altro, e tutte e due le volte la
   deduzione ha guidato una decisione di architettura. Qui non si stima
   niente: si registra l'ultima chiamata vera di ogni step.

   🔒 VIVE FUORI DA ZUSTAND, come il contatore della spesa. È telemetria, non
   stato di prodotto: non deve finire nei salvataggi, non deve viaggiare sul
   server, e non deve comparire negli export. Un numero che dice «ieri Luna ci
   ha messo 1,4s» non è una cosa che vuoi ritrovare fra sei mesi dentro il
   file di una creatura.
   ========================================================================= */

import type { AiStepId } from '../../netlify/functions/_shared/routing';

export interface StepRun {
  /** Il modello che ha risposto DAVVERO, non quello che avevamo chiesto. */
  model: string;
  ms: number;
  background: boolean;
  ok: boolean;
  /** Perché è andata storta, quando è andata storta. */
  why?: string;
  at: number;
}

const runs = new Map<AiStepId, StepRun>();
const listeners = new Set<() => void>();

export function noteRun(step: AiStepId, run: Omit<StepRun, 'at'>): void {
  runs.set(step, { ...run, at: Date.now() });
  listeners.forEach((l) => l());
}

export function lastRuns(): [AiStepId, StepRun][] {
  return [...runs.entries()];
}

export function lastRun(step: AiStepId): StepRun | null {
  return runs.get(step) ?? null;
}

export function subscribeToRuns(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
