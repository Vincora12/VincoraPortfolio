import type { BrainMessage } from './store/types';
import { TOOLS, assistantTurn, resultBlocks, type ToolResult, type ToolUse } from '../ai/tools';

export type ChatCost = { costUsd: number; model?: string };
export type ChatFileInput = { mediaType: string; data: string; filename: string };

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

const TOOL_INTENT = /\b(miei dati|mia salute|come sto|\bme\b|dormit\w*|allenat\w*|allenamento|palestra|workout|programma|piano|scheda|calendario|agenda|lista|riepilogo|sezione|blocco|corsa|camminata|mangiat\w*|bevut\w*|pasto|colazione|pranzo|cena|spuntino|merenda|extra|calori\w*|kcal|protein\w*|carbo\w*|grass\w*|macro|peso|dieta|barcode|codice a barre|etichetta|obiettiv\w*|target|corregg\w*|modific\w*|giornat\w*|protocollo|ricordami|promemoria|pagina|aspetto|schermata)\b/i;

export type ChatMealSlot = 'colazione' | 'spuntino' | 'pranzo' | 'merenda' | 'cena' | 'extra';
export type MealConfirmation = {
  status: 'needs-confirmation' | 'confirmed';
  slot: ChatMealSlot;
};
export type WorkoutConfirmation = { status: 'needs-confirmation' | 'confirmed' };

const WEEKDAY = String.raw`(?:lune(?:di)?|martedi|mercoledi|giovedi|venerdi|sabato|domenica)`;
const WORKOUT_ACTIVITY = String.raw`(?:allenament\w*|palestra|workout|hip\s*hop|danza|yoga|pilates|cors\w*|nuoto|calcio|tennis|padel|boxe|crossfit)`;

/** Distingue un allenamento programmato da uno già svolto. */
export function isWorkoutPlanIntent(text: string): boolean {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const mentionsPlan = /\b(?:piano|programma|scheda)\b/i.test(normalized)
    && /\b(?:allenament\w*|palestra|workout)\b/i.test(normalized);
  const schedulesDay = new RegExp(
    String.raw`\b(?:inserisc\w*|aggiung\w*|mett\w*|programm\w*|pianific\w*|spost\w*|modific\w*)\b[^.!?]*\b(?:allenament\w*|palestra|workout)\b[^.!?]*\b${WEEKDAY}\b|\b${WEEKDAY}\b[^.!?]*\b(?:inserisc\w*|aggiung\w*|mett\w*|programm\w*|pianific\w*|spost\w*|modific\w*)\b[^.!?]*\b(?:allenament\w*|palestra|workout)\b`,
    'i',
  ).test(normalized);
  const schedulesNamedActivity = new RegExp(
    String.raw`\b(?:inserisc\w*|aggiung\w*|mett\w*|programm\w*|pianific\w*|spost\w*|modific\w*)\b[^.!?]*\b${WORKOUT_ACTIVITY}\b[^.!?]*\b${WEEKDAY}\b|\b${WEEKDAY}\b[^.!?]*\b(?:inserisc\w*|aggiung\w*|mett\w*|programm\w*|pianific\w*|spost\w*|modific\w*)\b[^.!?]*\b${WORKOUT_ACTIVITY}\b`,
    'i',
  ).test(normalized);
  return mentionsPlan || schedulesDay || schedulesNamedActivity;
}

export function isMealLogIntent(text: string): boolean {
  if (/^\s*(?:cosa|che cosa|quanto|quanti|quante)\b.*\b(?:mangiat\w*|bevut\w*)/i.test(text)) return false;
  if (/\bnon\s+ho\s+(?:mangiato|bevuto)\b/i.test(text)) return false;
  return /\b(?:ho\s+(?:mangiato|bevuto)|(?:mangio|bevo)\b|pasto|colazione|pranzo|cena|spuntino|merenda|snack|registra(?:mi)?\s+(?:questo\s+)?pasto)\b/i.test(text);
}

export function isWorkoutLogIntent(text: string): boolean {
  if (isWorkoutPlanIntent(text)) return false;
  if (/^\s*(?:cosa|che cosa|quanto|quanti|quante)\b.*\b(?:allenat\w*|cors\w*|camminat\w*)/i.test(text)) return false;
  if (/\bnon\s+(?:mi\s+sono\s+allenat\w*|ho\s+fatto\s+(?:allenamento|sport))\b/i.test(text)) return false;
  return /\b(?:mi\s+sono\s+allenat\w*|ho\s+(?:corso|camminato|nuotato|pedalato)|ho\s+fatto\s+[^.!?]*(?:allenamento|palestra|workout|corsa|camminata|cardio|lower|upper)|(?:registra|aggiungi|segna(?:lo)?)\w*\s+[^.!?]*(?:allenament\w*|sport|workout|corsa|camminata)|allenamento\s+(?:completato|fatto)|corsa\s+\d|camminata\s+\d)\b/i.test(text);
}

/** Usa il loop strumenti solo quando la richiesta riguarda dati o azioni locali. */
export function shouldUseLocalTools(text: string): boolean {
  return TOOL_INTENT.test(text);
}

/** Le registrazioni esplicite non devono dipendere dalla buona volontà del modello. */
export function requiredWriteTool(text: string): string | undefined {
  if (isWorkoutPlanIntent(text)
    || /\b(?:crea|scrivi|prepara|imposta|fammi|salva|aggiorna)\w*\b[^.!?]*\b(?:piano|programma|scheda)\b[^.!?]*\b(?:allenamento|allenamenti|palestra|workout)\b/i.test(text)
    || /\b(?:piano|programma|scheda)\b[^.!?]*\b(?:allenamento|allenamenti|palestra|workout)\b[^.!?]*\b(?:crea|scrivi|prepara|imposta|fammi|salva|aggiorna)\w*\b/i.test(text)) {
    return 'imposta_piano_allenamento';
  }
  if (/\b(?:peso|sono)\s*(?:oggi\s*)?(?:circa\s*)?\d+(?:[.,]\d+)?\s*kg\b/i.test(text)) {
    return 'registra_peso';
  }
  if (/\b(?:crea|aggiung\w*|inserisc\w*|modific\w*|spost\w*|elimin\w*|rimuov\w*)\b[^.!?]*\b(?:calendario|agenda|lista|riepilogo|sezione|blocco)\b/i.test(text)) return 'gestisci_me';
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
  workoutConfirmation?: WorkoutConfirmation,
  files: ChatFileInput[] = [],
): Promise<ChatCost> {
  const token = savedToken();
  if (!token) throw new Error('Prima attiva VINZ.MON: manca il token.');

  const workoutPlanContext = isWorkoutPlanIntent(user)
    ? run({ id: 'read-workout-plan', name: 'leggi_me', input: { sezione: 'sport' } }).content
    : '';
  const system = [{
    text: [
      'You are VINZ.MON, a neutral high-quality personal AI assistant.',
      'Answer in the user language. Use tools whenever the answer depends on personal data or the user asks for an action.',
      'Never claim an action succeeded unless its tool result confirms it. Be concise and natural.',
      'The five fixed meal moments are: colazione, spuntino, pranzo, merenda, cena. Additional food is extra.',
      images.length
        ? 'The user attached one or more real images. Inspect them directly: never say that you cannot see them. If they show food, identify visible foods, preparation, sauces and a plausible portion; estimate kcal, protein, carbohydrates and fat, clearly marking estimates and asking only for details that materially change the result. Do not invent hidden ingredients. Use all attached images together when one shows the dish and another shows a menu, label or portion reference.'
        : '',
      files.length
        ? 'Read every attached PDF directly. If it is a diet or training plan, summarize it faithfully before proposing any change; distinguish values explicitly written in the document from your own estimates. Never claim that a PDF was unreadable unless the provider actually returns an error.'
        : '',
      mealConfirmation?.status === 'needs-confirmation'
        ? `Analyze the food and estimate nutrition, but DO NOT call registra_pasto and do not ask the final confirmation question. The app will ask whether it is ${mealConfirmation.slot}.`
        : '',
      mealConfirmation?.status === 'confirmed'
        ? `The user has just confirmed the proposed meal type: ${mealConfirmation.slot}. Call registra_pasto now and use exactly that meal type.`
        : '',
      workoutConfirmation?.status === 'needs-confirmation'
        ? 'Analyze the workout, but DO NOT call registra_allenamento and do not ask the final confirmation question. The app will ask it.'
        : '',
      workoutConfirmation?.status === 'confirmed'
        ? 'The user has just confirmed the workout. Call registra_allenamento now.'
        : '',
      'The AI may read and update every ME journal field through its dedicated tools: diet, nutrition targets, meals, completed workouts, workout plan, weight and period goal. It may also create, update, remove and reorder safe ME blocks with gestisci_me, including calendars, lists, notes and metrics. Calendar entries must use one item per event formatted as "Lunedì 08:00-09:00 · Title · Details", and belong in DIET or SPORT. Use gestisci_me when the request does not fit a fixed field. Never directly invent or edit VINZ.MON game stats; they are deterministic.',
      workoutPlanContext
        ? `The user is editing the workout schedule. Here is the current ME SPORT data: ${workoutPlanContext}. Preserve every existing day not explicitly changed, then call imposta_piano_allenamento. A weekday request refers to the plan, never to a completed workout.`
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
  const healthToolNames = new Set([
    'leggi_i_miei_dati', 'leggi_me', 'registra_pasto', 'correggi_ultimo_pasto',
    'registra_allenamento', 'correggi_ultimo_allenamento', 'registra_peso',
    'correggi_ultimo_peso', 'imposta_dieta', 'imposta_piano_allenamento', 'imposta_obiettivi_nutrizionali', 'gestisci_me',
  ]);
  const explicitWrite = requiredWriteTool(user);
  const isHealthRequest = Boolean(explicitWrite)
    || /\b(me|salute|pasto|mangiat\w*|bevut\w*|colazione|spuntino|pranzo|merenda|cena|extra|calori\w*|protein\w*|carbo\w*|grass\w*|macro|diet\w*|allenament\w*|allenat\w*|palestra|workout|corsa|camminata|peso|kg|obiettiv\w*)\b/i.test(user)
    || Boolean(mealConfirmation || workoutConfirmation);
  const toolPool = isHealthRequest
    ? TOOLS.filter((tool) => healthToolNames.has(tool.name))
    : TOOLS.filter((tool) => !healthToolNames.has(tool.name) || tool.name === 'leggi_i_miei_dati');
  const availableTools = toolPool.slice(0, 12).filter((tool) => {
    if (tool.name === 'registra_pasto') return mealConfirmation?.status === 'confirmed';
    if (tool.name === 'registra_allenamento') return workoutConfirmation?.status === 'confirmed';
    if (tool.name === 'correggi_ultimo_pasto' && mealConfirmation?.status === 'needs-confirmation') return false;
    if (tool.name === 'correggi_ultimo_allenamento' && workoutConfirmation?.status === 'needs-confirmation') return false;
    return true;
  });
  const forcedWrite = mealConfirmation?.status === 'confirmed'
    ? 'registra_pasto'
    : workoutConfirmation?.status === 'confirmed'
      ? 'registra_allenamento'
    : explicitWrite;

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
        ...(round === 0 && files.length ? { files } : {}),
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
        : workoutConfirmation?.status === 'needs-confirmation'
          ? '\n\nConfermi che registro questo **allenamento** in ME?'
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
