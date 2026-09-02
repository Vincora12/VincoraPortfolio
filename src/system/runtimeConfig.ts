import type { AiStepId } from '../../netlify/functions/_shared/routing';
import { serverBackedStorage } from './serverStorage';
import { setLocalStorageItem } from './localStorageDiagnostics';

export type RuntimeConfig = {
  taxonomyVersion: 'v1' | 'v2';
  voiceModel: string | null;
  compilerModel: string | null;
  imageModel: string | null;
  stepModels: Partial<Record<AiStepId, string>>;
};

const KEY = 'vinzmon.runtimeConfig.v1';
const LEGACY_TAXONOMY_KEY = 'vinzmon.taxonomyDescriptions.catalog';

function defaults(): RuntimeConfig {
  return {
    taxonomyVersion: localStorage.getItem(LEGACY_TAXONOMY_KEY) === 'v2' ? 'v2' : 'v1',
    voiceModel: null,
    compilerModel: null,
    imageModel: null,
    stepModels: {},
  };
}

function parse(raw: string | null): RuntimeConfig {
  const base = defaults();
  if (!raw) return base;
  try {
    const value = JSON.parse(raw) as Partial<RuntimeConfig>;
    return {
      taxonomyVersion: value.taxonomyVersion === 'v2' ? 'v2' : 'v1',
      voiceModel: typeof value.voiceModel === 'string' ? value.voiceModel : null,
      compilerModel: typeof value.compilerModel === 'string' ? value.compilerModel : null,
      imageModel: typeof value.imageModel === 'string' ? value.imageModel : null,
      stepModels: value.stepModels && typeof value.stepModels === 'object' ? value.stepModels : {},
    };
  } catch { return base; }
}

export function runtimeConfig(): RuntimeConfig {
  if (typeof localStorage === 'undefined') return {
    taxonomyVersion: 'v1', voiceModel: null,
    compilerModel: null, imageModel: null, stepModels: {},
  };
  return parse(localStorage.getItem(KEY));
}

export async function updateRuntimeConfig(patch: Partial<RuntimeConfig>): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  const next = { ...runtimeConfig(), ...patch };
  await serverBackedStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent<RuntimeConfig>('vinzmon-runtime-config', { detail: next }));
}

export async function pullRuntimeConfig(): Promise<RuntimeConfig> {
  if (typeof localStorage === 'undefined') return runtimeConfig();
  const config = parse(await serverBackedStorage.getItem(KEY));
  await serverBackedStorage.setItem(KEY, JSON.stringify(config));
  setLocalStorageItem('system/runtimeConfig legacy taxonomy', LEGACY_TAXONOMY_KEY, config.taxonomyVersion);
  return config;
}
