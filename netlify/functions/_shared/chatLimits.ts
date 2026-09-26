/* ============================================================================
   TETTI CONDIVISI PER LA CHIACCHIERATA IN BACKGROUND

   🔷 `ai-chat-background.ts` rifà lo stesso giro testuale non-streaming che
   `ai.ts` fa già per `character-voice` — non lo chiama, perché una funzione
   Netlify non ne importa un'altra: gli stessi numeri vivono qui, letti da
   entrambe. Sono un sottoinsieme di `LIMITS` in `ai.ts` (solo i tetti che
   contano per la chat generale, non quelli del compilatore o degli
   strumenti) — se cambi uno dei due, cambia anche l'altro. */

export const CHAT_LIMITS = {
  systemChars: 40_000,
  userChars: 12_000,
  turns: 24,
  imageBytes: 5 * 1024 * 1024,
  maxTokens: 2000,
};

export interface ChatPreferencesInput {
  modelName?: string;
  reasoningEffort?: string;
}

export type ChatEffort = 'none' | 'low' | 'medium' | 'high';

/** Stessa traduzione di `assistantRequestPreferences` in `ai.ts`. */
export function resolveChatPreferences(config?: ChatPreferencesInput): { modelName?: string; effort?: ChatEffort } {
  const requestedEffort = config?.reasoningEffort;
  const effort: ChatEffort | undefined =
    requestedEffort === 'low' || requestedEffort === 'medium' || requestedEffort === 'high'
      ? requestedEffort
      : undefined;
  return {
    ...(config?.modelName ? { modelName: config.modelName } : {}),
    ...(effort ? { effort } : {}),
  };
}
