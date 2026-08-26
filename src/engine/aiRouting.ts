/* ============================================================================
   LE ROTTE AI — chi può servire ogni passo

   Prima stava scritta dentro `SystemLab.tsx`. Un motore non deve importare
   da una schermata per sapere quali modelli esistono, quindi è un file a
   parte anche ora che `SystemLab.tsx` resta l'unico a leggerlo.
   ========================================================================= */

export type ModelRoute = 'voice' | 'compiler' | 'image';

export const MODEL_ROUTES: readonly ModelRoute[] = ['voice', 'compiler', 'image'];

export const MODEL_CHOICES: Record<ModelRoute, string[]> = {
  voice: ['claude-opus-5', 'claude-sonnet-5', 'gpt-5.6-luna', 'gpt-5.6-terra', 'kimi-k3', 'kimi-k2.6'],
  compiler: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'claude-sonnet-5'],
  image: ['gpt-image-2', 'gpt-image-1'],
};
