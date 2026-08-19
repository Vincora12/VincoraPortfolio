/* ============================================================================
   IL LAVORO LUNGO NON SI ASPETTA: SI VA A RIPRENDERE

   🔷 «Io voglio far funzionare l'app con Sol. Che devi fare?»

   ⚠️ IL PROBLEMA NON ERA IL RAGIONAMENTO, ERA CHI ASPETTA.

   Sol è il modello che ragiona più a fondo, e ragionare richiede minuti. La
   nostra funzione ne ha dieci di secondi. Finora l'ho affrontata dalla parte
   sbagliata — abbassando il ragionamento finché ci stesse — e il risultato è
   che scegliere Sol costava il doppio senza dare niente in più: un Terra caro.

   🔒 LA MODALITÀ IN BACKGROUND ROVESCIA LA DOMANDA. Non «quanto può pensare
   prima che la funzione muoia», ma «chi tiene il filo mentre pensa». Con
   `background: true` il lavoro parte da OpenAI e resta lì:

     PARTENZA   una chiamata che torna subito con un identificativo
     ATTESA     nessuno aspetta: la funzione è già finita
     RITIRO     ogni tanto si chiede «è pronto?», ed è un'altra chiamata corta

   Nessuna delle tre supera i dieci secondi, perché nessuna delle tre aspetta
   il modello. Il tempo lo tiene OpenAI, che non ha un muro.

   ⚠️ E VUOLE L'API RESPONSES, non `/v1/chat/completions`. È un protocollo
   diverso — `input` invece di `messages`, `instructions` per il sistema,
   `reasoning: { effort }` invece di `reasoning_effort` — quindi vive in un
   file suo invece di crescere dentro l'adattatore esistente. Quello continua
   a servire la voce, che una risposta la vuole subito.

   🔒 IL RISULTATO RESTA DA OPENAI DIECI MINUTI. È tanto per un prompt e poco
   per dimenticarsene: se chiudi l'app mentre pensa, riaprendo entro dieci
   minuti l'identificativo è ancora buono.
   ========================================================================= */

import type { Usage } from './spend';

const URL_BASE = 'https://api.openai.com/v1/responses';

export interface StartResult {
  ok: boolean;
  /** L'identificativo da riportare per chiedere se è pronto. */
  jobId?: string;
  error?: string;
}

export type JobStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export interface PollResult {
  ok: boolean;
  status: JobStatus;
  /** C'è solo quando è finito. */
  text?: string;
  usage: Usage;
  error?: string;
}

export interface BackgroundRequest {
  model: string;
  /** Il blocco di sistema, già unito. */
  instructions: string;
  /** Il messaggio da cui deve partire. */
  user: string;
  maxTokens: number;
  /**
   * Quanto deve ragionare.
   *
   * 🔒 QUI SI PUÒ CHIEDERE SUL SERIO. Sulla strada sincrona `medium` era una
   * condanna a morte; qui non c'è nessun orologio da rispettare, e infatti è
   * l'unica ragione per cui Sol ha senso.
   */
  effort: 'none' | 'low' | 'medium' | 'high';
}

function key(): string | null {
  return process.env.OPENAI_API_KEY ?? null;
}

/** Fa partire il lavoro. Torna subito: non aspetta niente. */
export async function startBackground(req: BackgroundRequest): Promise<StartResult> {
  const k = key();
  if (!k) return { ok: false, error: 'OPENAI_API_KEY mancante' };

  try {
    const res = await fetch(URL_BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${k}` },
      body: JSON.stringify({
        model: req.model,
        instructions: req.instructions,
        input: req.user,
        max_output_tokens: req.maxTokens,
        reasoning: { effort: req.effort },
        /* 🔒 `store: true` non è un'opzione: senza, non ci sarebbe niente da
           andare a riprendere. È la condizione della modalità in background. */
        background: true,
        store: true,
      }),
    });

    if (!res.ok) {
      return { ok: false, error: `openai ${res.status}: ${(await res.text()).slice(0, 300)}` };
    }

    const body = (await res.json()) as { id?: string };
    return body.id
      ? { ok: true, jobId: body.id }
      : { ok: false, error: 'OpenAI non ha restituito un identificativo' };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Chiede se è pronto. Anche questa torna subito. */
export async function pollBackground(jobId: string): Promise<PollResult> {
  const k = key();
  if (!k) return { ok: false, status: 'failed', usage: {}, error: 'OPENAI_API_KEY mancante' };

  try {
    const res = await fetch(`${URL_BASE}/${encodeURIComponent(jobId)}`, {
      headers: { authorization: `Bearer ${k}` },
    });

    if (!res.ok) {
      return {
        ok: false,
        status: 'failed',
        usage: {},
        error: `openai ${res.status}: ${(await res.text()).slice(0, 300)}`,
      };
    }

    const body = (await res.json()) as {
      status?: string;
      output?: { type?: string; content?: { type?: string; text?: string }[] }[];
      error?: { message?: string } | null;
      incomplete_details?: { reason?: string } | null;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        input_tokens_details?: { cached_tokens?: number };
      };
    };

    const status = (body.status ?? 'in_progress') as JobStatus;
    const cached = body.usage?.input_tokens_details?.cached_tokens ?? 0;
    const usage: Usage = {
      /* 🔒 Gli input scontati si contano a parte, come sull'altra strada: il
         totale li comprende, e sommarli due volte gonfierebbe il conto proprio
         dove stiamo risparmiando. */
      inputTokens: Math.max(0, (body.usage?.input_tokens ?? 0) - cached),
      outputTokens: body.usage?.output_tokens ?? 0,
      cacheReadTokens: cached,
    };

    if (status !== 'completed') {
      return {
        ok: status === 'queued' || status === 'in_progress',
        status,
        usage,
        error:
          body.error?.message ??
          body.incomplete_details?.reason ??
          (status === 'failed' ? 'il lavoro è fallito senza motivo dichiarato' : undefined),
      };
    }

    return { ok: true, status, text: textOf(body.output ?? []), usage };
  } catch (err) {
    return { ok: false, status: 'failed', usage: {}, error: String(err) };
  }
}

/**
 * Il testo dentro la risposta.
 *
 * ⚠️ L'uscita è un ELENCO di pezzi, e i pezzi di ragionamento stanno lì in
 * mezzo insieme al testo. Prendere il primo pezzo darebbe il ragionamento
 * invece della risposta: si tengono solo quelli che dicono di essere testo.
 */
export function textOf(output: { content?: { type?: string; text?: string }[] }[]): string {
  return output
    .flatMap((item) => item.content ?? [])
    .filter((c) => c.type === 'output_text')
    .map((c) => c.text ?? '')
    .join('')
    .trim();
}
