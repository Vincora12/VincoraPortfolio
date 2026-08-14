/* ============================================================================
   I TRE FORNITORI, DIETRO UNA PORTA SOLA (MASTER SPEC v1.13 §19.4)

   Ogni adattatore prende la stessa richiesta normalizzata e restituisce la
   stessa risposta normalizzata. Chi chiama non sa e non deve sapere chi ha
   risposto — se lo sapesse, cambiare fornitore tornerebbe a essere una
   modifica al codice invece di una riga in `routing.ts`.

   ⚠️ La normalizzazione NON è un livellamento al minimo comune. La richiesta
   porta anche cose che non tutti sanno fare — i blocchi di sistema con la
   cache, il ragionamento — e ogni adattatore usa quello che il suo fornitore
   offre e ignora il resto. È `routing.ts` a garantire che una capacità non
   finisca su un fornitore che le serve a metà.

   🔒 Nessun adattatore lancia verso l'alto: restituiscono un esito con
   `ok: false`. La regola di §17 — «ogni superficie AI ha un fallback» — vale
   anche qui, e una funzione serverless che esplode restituisce un 500 opaco
   che nel browser diventa indistinguibile da «internet non va».
   ========================================================================= */

import type { Provider } from './routing';
import type { Usage } from './spend';

/* --- La forma comune -------------------------------------------------------- */

export interface SystemBlock {
  text: string;
  /** Metti in cache tutto quello che sta fin qui. Ignorato da chi non sa farlo. */
  cache?: boolean;
}

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ImageInput {
  mediaType: string;
  /** base64 senza il prefisso `data:`. */
  data: string;
}

export interface ProviderRequest {
  model: string;
  system: SystemBlock[];
  turns: Turn[];
  /** L'ultimo messaggio, quello a cui si risponde. */
  user: string;
  image?: ImageInput;
  maxTokens: number;
  /** Ragiona prima di rispondere. Chi non sa farlo lo ignora. */
  thinking?: boolean;
}

export interface ProviderResult {
  ok: boolean;
  text: string;
  usage: Usage;
  /** Il modello che ha risposto davvero: con un fallback può differire. */
  model: string;
  /** Solo per i log del server. */
  error?: string;
}

function fail(model: string, error: string): ProviderResult {
  return { ok: false, text: '', usage: {}, model, error };
}

/* --- Anthropic --------------------------------------------------------------
   L'unico che usa i blocchi di sistema separati con la cache, ed è il motivo
   per cui la voce sta qui: il briefing del personaggio non cambia mai e dal
   secondo messaggio in poi costa un decimo.
   -------------------------------------------------------------------------- */

async function anthropic(req: ProviderRequest): Promise<ProviderResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return fail(req.model, 'ANTHROPIC_API_KEY mancante');

  const content: unknown[] = [];
  if (req.image) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: req.image.mediaType, data: req.image.data },
    });
  }
  content.push({ type: 'text', text: req.user });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens,
        fallbacks: 'default',
        output_config: { effort: 'low' },
        // Il ragionamento si spegne dove non serve: su due frasi in
        // personaggio non aggiunge niente e l'uscita si paga cinque volte
        // l'entrata. Lo decide chi chiama, non questo file.
        ...(req.thinking ? {} : { thinking: { type: 'disabled' } }),
        system: req.system.map((b) => ({
          type: 'text',
          text: b.text,
          ...(b.cache ? { cache_control: { type: 'ephemeral' } } : {}),
        })),
        messages: [...req.turns, { role: 'user', content }],
      }),
    });

    if (!res.ok) return fail(req.model, `anthropic ${res.status}: ${await res.text()}`);

    const body = (await res.json()) as {
      model?: string;
      stop_reason?: string;
      content?: { type: string; text?: string }[];
      usage?: Record<string, number>;
    };

    if (body.stop_reason === 'refusal') return fail(req.model, 'rifiuto del modello');

    const text = (body.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
      .trim();

    return {
      ok: text.length > 0,
      text,
      model: body.model ?? req.model,
      usage: {
        inputTokens: body.usage?.input_tokens ?? 0,
        outputTokens: body.usage?.output_tokens ?? 0,
        cacheReadTokens: body.usage?.cache_read_input_tokens ?? 0,
        cacheWriteTokens: body.usage?.cache_creation_input_tokens ?? 0,
      },
    };
  } catch (err) {
    return fail(req.model, String(err));
  }
}

/* --- Google -----------------------------------------------------------------
   Serve solo la lettura delle foto. I blocchi di sistema qui diventano una
   sola istruzione: Gemini non ha il concetto di più blocchi con cache, e
   fingere il contrario produrrebbe una richiesta che sembra ottimizzata e non
   lo è.
   -------------------------------------------------------------------------- */

async function google(req: ProviderRequest): Promise<ProviderResult> {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return fail(req.model, 'GOOGLE_API_KEY mancante');

  const parts: unknown[] = [];
  if (req.image) {
    parts.push({ inline_data: { mime_type: req.image.mediaType, data: req.image.data } });
  }
  parts.push({ text: req.user });

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system.map((b) => b.text).join('\n\n') }] },
          contents: [
            ...req.turns.map((t) => ({
              role: t.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: t.content }],
            })),
            { role: 'user', parts },
          ],
          generationConfig: { maxOutputTokens: req.maxTokens },
        }),
      },
    );

    if (!res.ok) return fail(req.model, `google ${res.status}: ${await res.text()}`);

    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: Record<string, number>;
    };

    const text = (body.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim();

    return {
      ok: text.length > 0,
      text,
      model: req.model,
      usage: {
        inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  } catch (err) {
    return fail(req.model, String(err));
  }
}

/* --- OpenAI: immagini -------------------------------------------------------
   L'unica capacità che passa da qui, ed è quella su cui le prove sono già
   state fatte. Restituisce base64, non un URL: un URL scadrebbe prima che
   l'immagine sia stata importata, e ci ritroveremmo con uno slot vuoto e
   nessun errore.
   -------------------------------------------------------------------------- */

export interface ImageResult {
  ok: boolean;
  /** base64 PNG. */
  data: string;
  usage: Usage;
  error?: string;
}

export async function generateImage(model: string, prompt: string): Promise<ImageResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, data: '', usage: {}, error: 'OPENAI_API_KEY mancante' };

  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        prompt,
        size: '1024x1024',
        background: 'transparent',
        n: 1,
      }),
    });

    if (!res.ok) {
      return { ok: false, data: '', usage: {}, error: `openai ${res.status}: ${await res.text()}` };
    }

    const body = (await res.json()) as { data?: { b64_json?: string }[] };
    const data = body.data?.[0]?.b64_json ?? '';

    return { ok: data.length > 0, data, usage: { images: 1 } };
  } catch (err) {
    return { ok: false, data: '', usage: {}, error: String(err) };
  }
}

/* --- Il dispacciatore -------------------------------------------------------- */

const ADAPTERS: Record<Provider, (r: ProviderRequest) => Promise<ProviderResult>> = {
  anthropic,
  google,
  // Le immagini non passano da qui: hanno una forma di risposta diversa e
  // fingere che sia la stessa produrrebbe un tipo che mente.
  openai: async (r) => fail(r.model, 'openai serve solo le immagini, via generateImage'),
};

export function callProvider(provider: Provider, req: ProviderRequest): Promise<ProviderResult> {
  return ADAPTERS[provider](req);
}
