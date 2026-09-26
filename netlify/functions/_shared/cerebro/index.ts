/* CEREBRO registry — the one place that knows which runtime implements WORK.
   Replacing Hermes means adding another CerebroRuntime and returning it here. */
import { hermesCerebro } from '../v2/hermesAdapter';
import type { CerebroRuntime } from './contract';

export function activeCerebro(): CerebroRuntime {
  return hermesCerebro;
}

export type * from './contract';
