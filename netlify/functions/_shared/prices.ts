/* ============================================================================
   MODEL PRICES — one table for the whole system (vNext Step 6)

   Read by the server spending ledger (`spend.ts`, the cap that blocks) and by
   the browser estimates (`src/ai/usage.ts`, DEV → COSTI). Pure data, no
   imports: safe in both bundles. Dollars per million tokens.
   ========================================================================= */

export interface ModelPrice {
  /** Dollari per milione di token in ingresso. */
  input: number;
  output: number;
  /** Dollari per immagine, per i modelli che generano immagini. */
  perImage?: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  /* Moonshot sconta la cache del 90% come Anthropic, quindi la formula di
     `costOf` vale identica. ⚠️ Ma solo perché l'adattatore SOTTRAE i token in
     cache da quelli in ingresso: lì arrivano già sommati, e senza quella
     sottrazione questa riga conterebbe due volte lo stesso pezzo. */
  'kimi-k3': { input: 3, output: 15 },
  'kimi-k2.6': { input: 0.95, output: 4 },
  /* GPT-5.6: l'uscita costa esattamente sei volte l'ingresso su tutti i
     livelli. Terra è quello che compila i prompt. */
  'gpt-5.6-terra': { input: 2, output: 12 },
  'gpt-5.6-luna': { input: 0.2, output: 1.2 },
  'gpt-5.6-sol': { input: 5, output: 30 },
  'grok-4.6': { input: 2, output: 6 },
  /* ⚠️ Stimati e arrotondati PER ECCESSO: un contatore che sottostima è peggio
     di uno che non c'è. Dopo un giro vero, DEV → COSTI dice il numero giusto.

     🔶 `perImage` ERA 0.05 E ARROTONDAVA PER DIFETTO — il listino di agosto
     2026 dà ~$0,053 a 1024×1024 in qualità `medium`, cioè il default. La riga
     diceva «per eccesso» e faceva il contrario. Adesso il numero base è la
     qualità media e i tre livelli hanno un moltiplicatore loro. */
  'gpt-image-2': { input: 0, output: 0, perImage: 0.06 },
  'gpt-image-1': { input: 0, output: 0, perImage: 0.04 },
  /* 🔷 «Metti che si può scaricare un LLM locale che aiuta nei lavori minimi
     e diminuisce la spesa.» Zero qui non è la bugia che il commento sopra
     `UNKNOWN` mette in guardia — quella riguarda un modello che NON
     conosciamo e a cui NON vogliamo dare zero per pigrizia. Questi li
     conosciamo: girano sul Mac, non c'è una chiamata a un fornitore da
     pagare. Zero è il prezzo vero, non una stima ottimistica. */
  'llama3.2:3b': { input: 0, output: 0 },
  'qwen2.5:3b-instruct': { input: 0, output: 0 },
  'phi3.5:3.8b': { input: 0, output: 0 },
  'gemma2:2b': { input: 0, output: 0 },
  'qwen2.5:1.5b-instruct': { input: 0, output: 0 },
  /* The local voice/CEREBRO choices (routing.ts VOICE_CHOICES): known, on the Mac, free. */
  'gpt-oss:20b': { input: 0, output: 0 },
  'qwen2.5:14b': { input: 0, output: 0 },
};
