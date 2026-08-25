/* ============================================================================
   LE ROTTE AI — chi può servire ogni passo

   Prima stava scritta dentro `SystemLab.tsx`, dove serviva. Adesso serve
   anche a `labAssistant.ts`, che non è un componente React: un motore non
   deve importare da una schermata per sapere quali modelli esistono. Un
   file solo, letto da entrambi.
   ========================================================================= */

export type ModelRoute = 'voice' | 'compiler' | 'image';

export const MODEL_ROUTES: readonly ModelRoute[] = ['voice', 'compiler', 'image'];

export const MODEL_CHOICES: Record<ModelRoute, string[]> = {
  voice: ['claude-opus-5', 'claude-sonnet-5', 'gpt-5.6-luna', 'gpt-5.6-terra', 'kimi-k3'],
  compiler: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'claude-sonnet-5'],
  image: ['gpt-image-2', 'gpt-image-1'],
};
