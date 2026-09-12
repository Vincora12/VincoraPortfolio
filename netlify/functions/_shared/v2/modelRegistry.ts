import { LOCAL_CHEAP_ROUND_MODEL, resolveRoute, type Capability, type Provider } from '../routing';
import type { RunProfile } from './contracts';

export interface RunModelRoute { provider: Provider; model: string; billingCapability: Capability; local: boolean }

const PROFILE_CAPABILITY: Record<RunProfile, Capability> = {
  chat: 'character-voice',
  'project-chat': 'character-voice',
  automation: 'character-voice',
  lab: 'prompt-compile',
  inspection: 'prompt-compile',
  coding: 'prompt-compile',
};

/** Small declarative registry. A caller can require local; cloud is an explicit profile/policy choice. */
export function resolveRunModel(profile: RunProfile, preference?: string): RunModelRoute {
  const capability = PROFILE_CAPABILITY[profile];
  const localPreferred = preference === 'local' || (!preference && (profile === 'chat' || profile === 'project-chat' || profile === 'automation'));
  if (localPreferred) return { provider: 'ollama', model: LOCAL_CHEAP_ROUND_MODEL, billingCapability: capability, local: true };
  const route = resolveRoute(capability, preference);
  return { ...route, billingCapability: capability, local: route.provider === 'ollama' };
}
