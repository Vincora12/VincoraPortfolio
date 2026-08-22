import type { BrainMessage } from './store/types';
import { TOOLS, assistantTurn, resultBlocks, type ToolResult, type ToolUse } from '../ai/tools';

export type ChatCost = { costUsd: number; model?: string };

/** Legge soltanto il token tecnico già salvato dall'app principale. */
export function savedToken(): string | null {
  try {
    const raw = localStorage.getItem('vinzmon.prototype.v4');
    const parsed = raw ? (JSON.parse(raw) as { state?: { token?: unknown } }) : null;
    return typeof parsed?.state?.token === 'string' ? parsed.state.token : null;
  } catch {
    return null;
  }
}

export async function streamReply(
  turns: BrainMessage[],
  user: string,
  signal: AbortSignal,
  onChunk: (chunk: string) => void,
  image?: { mediaType: string; data: string },
  voiceModel?: string | null,
): Promise<ChatCost> {
  const token = savedToken();
  if (!token) throw new Error('Prima attiva VINZ.MON: manca il token.');

  const system = [{
    text: [
      'You are VINZ.MON, a high-quality general personal AI assistant.',
      'Be accurate, useful, direct and natural. Do not roleplay or simulate emotions or consciousness.',
      'Answer in the language used by the user. When the user writes Italian, use natural Italian.',
      'Prefer concise answers unless detail is useful or requested.',
      'If current information is needed, use web search and distinguish verified facts from inference.',
    ].join(' '),
  }];

  const response = await fetch('/api/ai', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      capability: 'character-voice',
      voiceModel,
      stream: false,
      system,
      webSearch: !image,
      ...(image ? { image } : {}),
      turns: turns.map(({ role, content, context }) => ({
        role,
        content: context ? `${content}\n\n[ALLEGATO]\n${context}` : content,
      })),
      user,
      maxTokens: 2000,
    }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.json().catch(() => null) as { error?: string; reason?: string } | null;
    throw new Error(detail?.reason ?? detail?.error ?? `Richiesta fallita (${response.status}).`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = await response.json() as { text?: string; costUsd?: number; model?: string };
    if (!body.text) throw new Error(image ? 'Non sono riuscito a leggere l’immagine.' : 'La risposta è arrivata vuota.');
    onChunk(body.text);
    return { costUsd: body.costUsd ?? 0, model: body.model };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) onChunk(chunk);
  }
  return { costUsd: 0 };
}

const TOOL_INTENT = /\b(miei dati|mia salute|come sto|dormit\w*|allenat\w*|allenamento|palestra|workout|corsa|camminata|mangiat\w*|bevut\w*|pasto|colazione|pranzo|cena|spuntino|merenda|extra|calorie|proteine|peso|dieta|giornat\w*|protocollo|ricordami|promemoria|pagina|aspetto|schermata)\b/i;

export type ChatMealSlot = 'colazione' | 'spuntino' | 'pranzo' | 'merenda' | 'cena' | 'extra';
export type MealConfirmation = {
  status: 'needs-confirmation' | 'confirmed';
  slot: ChatMealSlot;
};

export function isMealLogIntent(text: string): boolean {
  if (/^\s*(?:cosa|che cosa|quanto|quanti|quante)\b.*\b(?:mangiat\w*|bevut\w*)/i.test(text)) return false;
  if (/\bnon\s+ho\s+(?:mangiato|bevuto)\b/i.test(text)) return false;
  return /\b(?:ho\s+(?:mangiato|bevuto)|(?:mangio|bevo)\b|pasto|colazione|pranzo|cena|spuntino|merenda|snack|registra(?:mi)?\s+(?:questo\s+)?pasto)\b/i.test(text);
}

/** Usa il loop strumenti solo quando la richiesta riguarda dati o azioni locali. */
export function shouldUseLocalTools(text: string): boolean {
  return TOOL_INTENT.test(text);
}

/** Le registrazioni esplicite non devono dipendere dalla buona volontà del modello. */
export function requiredWriteTool(text: string): string | undefined {
  if (/\b(?:mi\s+sono\s+allenat\w*|ho\s+fatto\s+[^.!?]*(?:allenamento|palestra|workout|corsa|camminata|cardio|lower|upper)|registra(?:mi)?\s+(?:questo\s+)?allenamento)\b/i.test(text)) {
    return 'registra_allenamento';
  }
  if (/\b(?:peso|sono)\s*(?:oggi\s*)?(?:circa\s*)?\d+(?:[.,]\d+)?\s*kg\b/i.test(text)) {
    return 'registra_peso';
  }
  return undefined;
}

export async function replyWithLocalTools(
  turns: BrainMessage[],
  user: string,
  signal: AbortSignal,
  onChunk: (chunk: string) => void,
  run: (use: ToolUse) => ToolResult,
  voiceModel?: string | null,
  images: { mediaType: string; data: string }[] = [],
  mealConfirmation?: MealConfirmation,
): Promise<ChatCost> {
  const token = savedToken();
  if (!token) throw new Error('Prima attiva VINZ.MON: manca il token.');

  const system = [{
    text: [
      'You are VINZ.MON, a neutral high-quality personal AI assistant.',
      'Answer in the user language. Use tools whenever the answer depends on personal data or the user asks for an action.',
      'Never claim an action succeeded unless its tool result confirms it. Be concise and natural.',
      'The five fixed meal moments are: colazione, spuntino, pranzo, merenda, cena. Additional food is extra.',
      mealConfirmation?.status === 'needs-confirmation'
        ? `Analyze the food and estimate nutrition, but DO NOT call registra_pasto and do not ask the final confirmation question. The app will ask whether it is ${mealConfirmation.slot}.`
        : '',
      mealConfirmation?.status === 'confirmed'
        ? `The user has just confirmed the proposed meal type: ${mealConfirmation.slot}. Call registra_pasto now and use exactly that meal type.`
        : '',
    ].join(' '),
  }];
  const history: Array<{ role: 'user' | 'assistant'; content: unknown }> = turns.map(
    ({ role, content, context }) => ({
      role,
      content: context ? `${content}\n\n[ALLEGATO]\n${context}` : content,
    }),
  );
  let currentUser = user;
  let userBlocks: Record<string, unknown>[] | undefined;
  let totalCostUsd = 0;
  let lastModel: string | undefined;
  /* Il backend accetta al massimo 12 strumenti per richiesta. Quelli salute
     sono in testa al catalogo; il limite evita che una frase come «ho
     mangiato una banana» venga rifiutata prima ancora che il modello la legga. */
  const availableTools = TOOLS.slice(0, 12).filter(
    (tool) => mealConfirmation?.status !== 'needs-confirmation' || tool.name !== 'registra_pasto',
  );
  const forcedWrite = mealConfirmation?.status === 'confirmed'
    ? 'registra_pasto'
    : requiredWriteTool(user);

  for (let round = 0; round < 4; round++) {
    const response = await fetch('/api/ai', {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        capability: 'character-voice',
        voiceModel,
        system,
        turns: history,
        user: currentUser,
        ...(round === 0 && images.length ? { images } : {}),
        ...(userBlocks ? { userBlocks } : {}),
        tools: round < 3 ? availableTools : [],
        ...(round === 0 && forcedWrite ? { toolChoice: forcedWrite } : {}),
        webSearch: true,
        effort: 'none',
        maxTokens: 2000,
      }),
    });
    const body = await response.json().catch(() => null) as {
      text?: string;
      toolUses?: ToolUse[];
      error?: string;
      reason?: string;
      costUsd?: number;
      model?: string;
    } | null;
    if (!response.ok || !body) {
      throw new Error(body?.reason ?? body?.error ?? `Richiesta fallita (${response.status}).`);
    }
    totalCostUsd += body.costUsd ?? 0;
    lastModel = body.model ?? lastModel;

    const uses = body.toolUses ?? [];
    if (uses.length === 0) {
      if (!body.text?.trim()) throw new Error('La risposta è arrivata vuota.');
      const confirmation = mealConfirmation?.status === 'needs-confirmation'
        ? `\n\nConfermi che lo registro come **${mealConfirmation.slot === 'extra' ? 'extra / spuntino aggiuntivo' : mealConfirmation.slot}**?`
        : '';
      onChunk(`${body.text.trim()}${confirmation}`);
      return { costUsd: totalCostUsd, model: lastModel };
    }

    if (round === 0 && currentUser) history.push({ role: 'user', content: currentUser });
    history.push(assistantTurn(body.text ?? '', uses) as { role: 'assistant'; content: unknown });
    userBlocks = resultBlocks(uses.map((use) => {
      if (use.name !== 'registra_pasto' || mealConfirmation?.status !== 'confirmed') return run(use);
      const input = typeof use.input === 'object' && use.input ? use.input as Record<string, unknown> : {};
      return run({ ...use, input: { ...input, pasto: mealConfirmation.slot } });
    }));
    currentUser = '';
  }

  throw new Error('La richiesta ha usato troppi passaggi. Prova a dividerla in due.');
}
