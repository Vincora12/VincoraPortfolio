import type {
  ChatModelAdapter,
  ThreadAssistantMessagePart,
  ThreadMessage,
} from "@assistant-ui/react";
import {
  replyWithLocalTools,
  savedToken,
  isMealLogIntent,
  isWorkoutLogIntent,
  shouldUseLocalTools,
  type ChatMealSlot,
  type MealConfirmation,
  type WorkoutConfirmation,
  type ActionConfirmation,
  type ConfirmableAction,
  CONFIRMABLE_ACTIONS,
  requiredWriteTool,
  type ChatCost,
} from "@/brain/stream";
import type { BrainMessage } from "@/brain/store/types";
import { executeRuntimeTool, loadEnabledSkillsSummary, type ToolResult, type ToolUse } from "@/ai/tools";
import { readHealthJournal } from "@/engine/healthJournal";
import { useApp } from "@/state/store";
import type { ContextDecision } from '@/ai/contextSelection';
import { resolveChatContext } from '@/ai/chatContext';
import { buildCapabilitySummary } from "@/ai/toolLayer";
import { typingRhythmFor, liveRevealDurationMs, type TypingRhythm } from "@/engine/typingRhythm";
import { persistChatTrace, recordChatTrace, systemPromptComposition, traceClock, type ChatTrace } from "@/ai/chatTrace";
import { voiceCard } from "@/engine/voiceCard";
import { captureChatMemoryForClient } from "@/assistant-original/chat-memory-feedback";
import { postChatClientError, postChatDiagnostic, postRuntimeEvent } from "@/system/runtimeLog";
import { createV2Issue } from "@/ai/backend";
import { activeThreadId, consumeTopicContext, readWatermark, topicArchive } from "./conversation-topics";
import { classifyV2Issue, isV2IssueIntent, v2IssueConfirmationText } from "@/ai/v2Issues";

type Source = { title: string; url: string; domain?: string };
type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  webSearches?: number;
};
type StreamEvent =
  | { type: "search_started" }
  | { type: "source_found"; source: Source }
  | { type: "thinking_delta"; delta: string }
  | { type: "answer_started" }
  | { type: "answer_delta"; delta: string }
  | {
      type: "answer_completed";
      model: string;
      usage: Usage;
      costUsd: number;
      sources: Source[];
    }
  | { type: "error"; message: string };

function textOf(message: ThreadMessage | undefined): string {
  if (!message) return "";
  return message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .trim();
}

type ChatImage = { mediaType: string; data: string };
type ChatFile = { mediaType: string; data: string; filename: string };
type MonReaction = { monName: string; index: number; label: string };

const REACTION_LABELS = ["NEUTRAL", "WARM", "AMUSED", "ALERT", "LOW", "INTENSE"] as const;

function textHash(text: string): number {
  let result = 5381;
  for (const char of text) result = ((result << 5) + result) ^ char.charCodeAt(0);
  return result >>> 0;
}

/**
 * Lo sticker è una reazione, non una decorazione automatica. Compare solo
 * quando il testo contiene un'emozione leggibile e la personalità è abbastanza
 * espressiva; la scelta resta deterministica per non cambiare ricaricando.
 */
function reactionForAnswer(text: string): MonReaction | null {
  const app = useApp.getState();
  const record = app.activeMonName ? app.mons[app.activeMonName] : null;
  if (!record || record.data.asset_manifest_status.reaction_pack !== "resolved") return null;

  const lower = text.toLocaleLowerCase("it");
  let index = -1;
  if (/mi dispiace|trist|stanc|pesante|male|delus|solitudine|mancanza/.test(lower)) index = 4;
  else if (/ahah|haha|lol|divert|ridere|assurdo|buff|scherz/.test(lower)) index = 2;
  else if (/attenzione|occhio|aspetta|sorpres|davvero\?|cosa\?!|ma che/.test(lower)) index = 3;
  else if (/importante|basta|assolutamente|non farlo|devi|deciso|arrabbi|serio/.test(lower)) index = 5;
  else if (/grazie|bello|bravo|perfetto|felice|content|mi piace|ti voglio|insieme|bene così/.test(lower)) index = 1;
  if (index < 0) return null;

  const expressiveness = record.data.voice_dna.emotion ?? 50;
  const chance = expressiveness > 70 ? 3 : expressiveness < 35 ? 1 : 2;
  if (textHash(`${record.data.name}|${text}`) % 5 >= chance) return null;
  return { monName: record.data.name, index, label: REACTION_LABELS[index]! };
}

/** assistant-ui tiene gli allegati separati dal testo del messaggio. */
function imagesOf(message: ThreadMessage | undefined): ChatImage[] {
  if (!message) return [];
  const attachmentParts = message.attachments?.flatMap((attachment) => attachment.content ?? []) ?? [];
  const parts = [...message.content, ...attachmentParts];
  const found = new Map<string, ChatImage>();
  for (const part of parts) {
    if (part.type !== "image" || typeof part.image !== "string") continue;
    const match = part.image.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match?.[1] || !match[2]) continue;
    found.set(part.image, { mediaType: match[1], data: match[2] });
  }
  return [...found.values()].slice(0, 4);
}

function filesOf(message: ThreadMessage | undefined): ChatFile[] {
  if (!message) return [];
  const parts = [...message.content, ...(message.attachments?.flatMap((item) => item.content ?? []) ?? [])];
  return parts.flatMap((part) => part.type === "file" && part.mimeType === "application/pdf"
    ? [{ mediaType: part.mimeType, data: part.data, filename: part.filename ?? "documento.pdf" }]
    : []).slice(0, 2);
}

/**
 * La foto corrente vince. Nei follow-up che la citano, riusa l'ultimo gruppo
 * di foto: così «non vedi la foto?» non perde il contesto visivo.
 */
function imagesForRun(messages: readonly ThreadMessage[], forcePrevious = false): ChatImage[] {
  const last = messages.at(-1);
  const current = imagesOf(last);
  if (current.length) return current;
  const user = textOf(last);
  if (!forcePrevious && !/\b(foto|immagin\w*|allegat\w*|ved\w*|guard\w*|quest\w*|piatto|porzion\w*|calori\w*|ingredient\w*)\b/i.test(user)) {
    return [];
  }
  for (let index = messages.length - 2; index >= Math.max(0, messages.length - 6); index--) {
    const previous = messages[index];
    if (previous?.role !== "user") continue;
    const images = imagesOf(previous);
    if (images.length) return images;
  }
  return [];
}

const FIXED_MEALS: ChatMealSlot[] = ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena'];
const localDay = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

function proposedMealSlot(text: string, at = new Date()): ChatMealSlot {
  const normalized = text.toLocaleLowerCase('it-IT');
  let slot: ChatMealSlot;
  if (/\b(extra|altro|altra|aggiuntiv\w*)\b/.test(normalized)) slot = 'extra';
  else slot = FIXED_MEALS.find((name) => normalized.includes(name)) ?? (() => {
    const hour = at.getHours() + at.getMinutes() / 60;
    if (hour < 10.5) return 'colazione';
    if (hour < 12) return 'spuntino';
    if (hour < 15) return 'pranzo';
    if (hour < 18) return 'merenda';
    return 'cena';
  })();
  if (slot === 'extra') return slot;
  const day = localDay(at);
  const occupied = readHealthJournal().meals.some(
    (meal) => meal.slot === slot && localDay(new Date(meal.at)) === day,
  );
  return occupied ? 'extra' : slot;
}

const CHAT_MEAL_SLOTS = new Set<ChatMealSlot>([
  'colazione', 'spuntino', 'pranzo', 'merenda', 'cena', 'extra',
]);

/**
 * Trova la risposta conversazionale che precede l'ultimo messaggio utente.
 * Le reazioni del MON sono messaggi assistant reali per assistant-ui, ma non
 * aprono un nuovo turno: non devono quindi spezzare una conferma operativa.
 */
function precedingConversationAssistant(messages: readonly ThreadMessage[]): ThreadMessage | undefined {
  for (let index = messages.length - 2; index >= 0; index--) {
    const message = messages[index];
    if (!message) continue;
    if (message.role === 'user') return undefined;
    if (message.role !== 'assistant') continue;
    if (message.metadata.custom.monReactionOnly === true) continue;
    return message;
  }
  return undefined;
}

/**
 * La proposta del pasto appartiene allo stato del turno, non alla formulazione
 * visibile scelta dal Mon. Il fallback sul testo mantiene compatibili le chat
 * create prima dell'introduzione dei metadati strutturati.
 */
export function pendingMealSlot(messages: readonly ThreadMessage[]): ChatMealSlot | undefined {
  const previous = precedingConversationAssistant(messages);
  if (!previous) return undefined;
  const rawSlot = (previous.metadata.custom as {
    pendingMeal?: { slot?: unknown };
  }).pendingMeal?.slot;
  if (typeof rawSlot === 'string' && CHAT_MEAL_SLOTS.has(rawSlot as ChatMealSlot)) {
    return rawSlot as ChatMealSlot;
  }
  const match = textOf(previous).match(
    /Confermi che lo registro come \*\*(colazione|spuntino|pranzo|merenda|cena|extra)(?:\s*\/[^*]+)?\*\*\?/i,
  );
  return match?.[1]?.toLocaleLowerCase('it-IT') as ChatMealSlot | undefined;
}

/** Accetta anche le conferme operative naturali usate dopo una proposta. */
export const confirms = (text: string) => /^\s*(?:s[iì]|yes|yep|yeah|sure|confermo|ok(?:ay)?|va bene|esatto|corretto|vai(?:\s+(?:pure|inserisci|registra|procedi))?|inserisci|registra|procedi|fallo|segna(?:lo)?(?:\s+in\s+me)?)(?=\s|[.!?,;:]|$)/i.test(text);

/* V2 ISSUE CAPTURE — VINZ.MON PROTOTYPE V1 → V2 (docs/PROTOTYPE_V1_STATUS.md,
   docs/V2_ISSUES.md, src/ai/v2Issues.ts). Stesso punto e stessa forma di
   `isImageCreationIntent`/`runImageCreation` qui sotto: un intento
   deterministico intercettato PRIMA che il messaggio raggiunga il modello
   o il loop degli strumenti, apposta per restare fuori da Composer,
   promozione e ownership del thread — di quelli non si tocca più niente
   per questo lavoro. Nessuna chiamata AI: solo regex e parole chiave
   (classifyV2Issue), come richiesto esplicitamente per tenere il costo a
   zero. Conferma solo DOPO che il salvataggio server è riuscito davvero —
   mai un "segnato" ottimistico prima di saperlo. */
async function* runV2IssueCapture(user: string) {
  const token = savedToken();
  if (!token) {
    yield { content: [{ type: "text" as const, text: "Prima attiva VINZ.MON: manca il token." }] };
    return;
  }
  const { title, area, type, observation } = classifyV2Issue(user);
  const result = await createV2Issue(token, { title, area, type, observation });
  const text = result.failure || !result.data?.issue
    ? v2IssueConfirmationText({ ok: false })
    : v2IssueConfirmationText({ ok: true, issue: result.data.issue, merged: result.data.merged });
  yield { content: [{ type: "text" as const, text }] };
}

function isImageCreationIntent(text: string): boolean {
  return /\b(?:genera|crea|disegna|fammi|realizza|produci|modifica|trasforma|ritocca)\b[^.!?]{0,100}\b(?:foto|immagine|ritratto|illustrazione|render|versione)\b|\b(?:fammi vedere|mostrami)\b[^.!?]{0,100}\b(?:come (?:starei|sarei)|in versione)\b/i.test(text);
}

async function* runImageCreation(messages: readonly ThreadMessage[], abortSignal: AbortSignal) {
  const token = savedToken();
  if (!token) throw new Error("Prima attiva VINZ.MON: manca il token.");
  const prompt = textOf(messages.at(-1));
  const reference = imagesForRun(messages, true)[0]?.data;
  yield { content: [{ type: "text" as const, text: reference ? "Sto modificando l’immagine…" : "Sto creando l’immagine…" }] };
  const response = await fetch("/api/ai", {
    method: "POST",
    signal: abortSignal,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ capability: "image", prompt, size: "1024x1024", ...(reference ? { reference } : {}) }),
  });
  const body = await response.json().catch(() => null) as { image?: string; reason?: string; error?: string; costUsd?: number; model?: string } | null;
  if (!response.ok || !body?.image) throw new Error(body?.reason ?? body?.error ?? "Immagine non generata");
  yield {
    content: [{ type: "image" as const, image: `data:image/png;base64,${body.image}`, filename: "vinz-mon-image.png" }],
    metadata: { custom: { costUsd: body.costUsd ?? 0, model: body.model } },
  };
}

function hasPendingWorkout(messages: readonly ThreadMessage[]): boolean {
  const previous = precedingConversationAssistant(messages);
  return Boolean(previous
    && /Confermi che registro questo \*\*allenamento\*\* in ME\?/i.test(textOf(previous)));
}

/** Recupera una modifica al piano proposta dall'AI e appena confermata. */
function pendingWorkoutPlanProposal(messages: readonly ThreadMessage[]): string | undefined {
  const previous = precedingConversationAssistant(messages);
  if (!previous) return undefined;
  const proposal = textOf(previous);
  const normalized = proposal.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const asksToAdd = /\bvuoi\s+(?:aggiungere|inserire|programmare|spostare|modificare)\b/i.test(normalized);
  const hasDay = /\b(?:lune(?:di)?|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/i.test(normalized);
  const hasActivity = /\b(?:allenament\w*|palestra|workout|hip\s*hop|danza|yoga|pilates|cors\w*|nuoto|calcio|tennis|padel|boxe|crossfit)\b/i.test(normalized);
  return asksToAdd && hasDay && hasActivity ? proposal : undefined;
}

/* ============================================================================
   LE AZIONI CHE ASPETTANO UN SÌ

   Stesso disegno di pasto e allenamento: la domanda in coda alla risposta
   precedente È lo stato. Non c'è una seconda memoria da tenere allineata, e il
   pulsante in chat aggancia la stessa frase letterale.
   ========================================================================= */
const ACTION_BY_TOOL: Record<string, ConfirmableAction> = {
  registra_peso: 'peso',
  imposta_piano_allenamento: 'piano',
};

/** «Ricordami…» sì, «ricorda che…» no: il secondo è memoria, non un promemoria. */
const REMINDER_INTENT = /\b(?:ricordami|promemoria|reminder)\b/i;
/* ⚠️ VA PROVATA PRIMA DEL PROMEMORIA. «Ogni lunedì ricordami le uscite»
   contiene «ricordami», ma non è un promemoria: quello scade una volta e ti dà
   una gomitata, questa si ripete e FA il lavoro. Chi arriva primo decide.

   ⚠️ E DEVE COPRIRE TUTTE LE CADENZE, non solo «ogni mattina». La prima
   versione conosceva solo i momenti del giorno, quindi «ogni lunedì» e «ogni
   due ore» cadevano fuori e non diventavano automazioni. */
/* 🔴 E GLI ACCENTI VANNO TOLTI PRIMA DI CONFRONTARE. In JavaScript `\b` è
   ASCII: dopo la «ì» di «lunedì» non esiste confine di parola, quindi
   `luned[ìi]\b` non aggancia mai «Ogni lunedì e giovedì…». È lo stesso motivo
   per cui `isWorkoutPlanIntent` normalizza prima di guardare — qui si fa
   uguale invece di inventare una seconda strada. */
const WEEKDAY_WORD = '(?:lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)';
const COUNT_WORD = '(?:\\d+|due|tre|quattro|cinque|sei|otto|dieci|dodici|mezz)';
const AUTOMATION_INTENT = new RegExp(
  String.raw`\bogni\s+(?:mattina|giorno|sera|pomeriggio|notte|settimana|${COUNT_WORD}\s*(?:minut\w*|or[ae]|giorn\w*)|${WEEKDAY_WORD})\b`
    + String.raw`|\btutti\s+i\s+(?:giorni|${WEEKDAY_WORD})\b`
    + String.raw`|\bquotidianament\w*\b`,
  'i',
);

const withoutAccents = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const DIET_INTENT =
  /\b(?:impost\w*|aggiorn\w*|cambi\w*|modific\w*|salv\w*|cre\w*|scriv\w*)\b[^.!?]*\b(?:dieta|piano\s+alimentare|regime\s+alimentare)\b|\b(?:dieta|piano\s+alimentare|regime\s+alimentare)\b[^.!?]*\b(?:impost\w*|aggiorn\w*|cambi\w*|modific\w*|salv\w*|cre\w*|scriv\w*)\b/i;

function proposedAction(text: string): ConfirmableAction | undefined {
  const tool = requiredWriteTool(text);
  if (tool && ACTION_BY_TOOL[tool]) return ACTION_BY_TOOL[tool];
  if (AUTOMATION_INTENT.test(withoutAccents(text))) return 'automazione';
  if (REMINDER_INTENT.test(text)) return 'promemoria';
  if (DIET_INTENT.test(text)) return 'dieta';
  return undefined;
}

function pendingAction(messages: readonly ThreadMessage[]): ConfirmableAction | undefined {
  const previous = precedingConversationAssistant(messages);
  if (!previous) return undefined;
  const text = textOf(previous);
  return (Object.keys(CONFIRMABLE_ACTIONS) as ConfirmableAction[]).find(
    (action) => text.includes(CONFIRMABLE_ACTIONS[action].question),
  );
}

/* ============================================================================
   IL CONTESTO CHE SI MANDA DAVVERO

   🔴 PRIMA: il client spediva TUTTA la cronologia a ogni messaggio e il server
   ne teneva gli ultimi 24 turni (`LIMITS.turns`). Il resto viaggiava per essere
   buttato — banda sprecata all'andata e amnesia all'arrivo: di quello che c'era
   prima non restava una riga.

   🔷 ADESSO: si mandano i messaggi del tratto ANCORA APERTO, e i tratti chiusi
   arrivano come riassunti dentro il prompt di sistema. Meno byte e più memoria
   insieme: è la ragione per cui i topic valgono la pena.

   🔒 SENZA SEGNALIBRO NON CAMBIA NIENTE. Prima accensione, riassunto mai
   riuscito, id non più trovato: si manda tutto, come prima. Un indice assente
   non deve accorciare la conversazione. */
let topicWatermark: string | null = null;

function topicAwareHistory(conversation: BrainMessage[]): BrainMessage[] {
  if (!topicWatermark) return conversation;
  const index = conversation.findIndex((message) => message.id === topicWatermark);
  return index === -1 ? conversation : conversation.slice(index + 1);
}

function toBrainMessages(messages: readonly ThreadMessage[]): BrainMessage[] {
  return messages.flatMap((message) => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    return [{
      id: message.id,
      ts: message.createdAt.toISOString(),
      role: message.role,
      content: textOf(message),
    } satisfies BrainMessage];
  });
}

async function foodBarcodeContext(text: string, token: string, signal: AbortSignal): Promise<string> {
  const barcode = text.match(/(?:^|\D)(\d{8,14})(?:\D|$)/)?.[1];
  if (!barcode) return '';
  const response = await fetch(`/api/food?barcode=${barcode}`, {
    signal,
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) return '';
  const body = await response.json() as { found?: boolean; source?: string; product?: unknown };
  return body.found
    ? `\n\n[DATI BARCODE VERIFICATI — ${body.source}]\n${JSON.stringify(body.product)}`
    : `\n\n[BARCODE ${barcode}: prodotto non trovato nel database]`;
}

/* ============================================================================
   «PASTO AGGIUNTO IN ME» — ma per OGNI azione, non solo per i pasti

   🔒 SOLO CIÒ CHE CAMBIA QUALCOSA. Le letture non producono niente: se ogni
   `leggi_me` lasciasse una riga, sotto una risposta normale ci sarebbe un muro
   di spunte e nessuna direbbe più niente. Chi vuole vedere anche le letture ha
   già «Attività · N», che le conta tutte ed è richiudibile.

   🔒 SOLO SE È ANDATA BENE. Chi chiama questa funzione lo fa dopo aver
   scartato i risultati in errore: una spunta su una scrittura fallita sarebbe
   una bugia con l'icona giusta.

   ⚠️ Alcuni strumenti fanno più cose (`programma_promemoria` elenca, crea,
   aggiorna e annulla), quindi l'etichetta guarda anche l'input: «Promemoria
   creato» e «Promemoria disattivato» non sono la stessa notizia, e `list` non
   è una notizia affatto. */
function updateLabel(use: ToolUse, projectId?: string | null): string | null {
  const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
  const action = typeof args.azione === 'string' ? args.azione : '';

  switch (use.name) {
    /* --- Salute e ME --- */
    case 'registra_pasto': return 'Pasto aggiunto in ME';
    case 'correggi_ultimo_pasto': return 'Pasto corretto in ME';
    case 'registra_allenamento': return 'Allenamento aggiunto in ME';
    case 'correggi_ultimo_allenamento': return 'Allenamento corretto in ME';
    case 'registra_peso': return 'Peso aggiornato in ME';
    case 'correggi_ultimo_peso': return 'Peso corretto in ME';
    case 'imposta_dieta': return 'Piano alimentare aggiornato in ME';
    case 'imposta_piano_allenamento': return 'Piano allenamento aggiornato in ME';
    case 'imposta_obiettivi_nutrizionali': return 'Obiettivi nutrizionali aggiornati in ME';
    case 'gestisci_me':
      return action === 'create' ? 'Blocco aggiunto in ME'
        : action === 'update' ? 'Blocco aggiornato in ME'
        : action === 'delete' ? 'Blocco eliminato da ME'
        : action === 'move' ? 'Blocchi riordinati in ME'
        : 'Schermata ME aggiornata';

    /* --- Tempo --- */
    case 'programma_promemoria':
      return action === 'create' ? 'Promemoria creato'
        : action === 'update' ? 'Promemoria aggiornato'
        : action === 'cancel' ? 'Promemoria disattivato'
        : null;
    case 'crea_automazione': return 'Automazione creata';
    case 'ricorda_di': return 'Promemoria interno segnato';

    /* --- Documenti ---
       ⚠️ «Progetto» non è vocabolario della superficie quotidiana: là quella
       parola è stata tolta, e FILES è il posto dove il materiale sta. Sotto
       resta lo spazio GLOBAL, ma è impianto, non una cosa da nominare. Con uno
       scope di progetto attivo — cioè dentro il LAB, dove i Projects esistono
       ancora — la parola torna giusta, quindi l'etichetta segue lo scope
       invece di sceglierne una e sbagliarla metà delle volte. */
    case 'crea_file_testo': return projectId ? 'File aggiunto al progetto' : 'File aggiunto in FILES';
    case 'scrivi_artifact_progetto': return 'Documento salvato nel progetto';
    case 'scrivi_una_pagina': return 'Pagina creata';
    case 'aggiorna_una_pagina': return 'Pagina aggiornata';

    /* --- Interfaccia --- */
    case 'cambia_aspetto':
      return typeof args.cosa === 'string' && args.cosa.toLowerCase() === 'reset'
        ? 'Aspetto ripristinato'
        : 'Aspetto cambiato';
    case 'cambia_schermata':
      return action === 'nascondi' ? 'Elemento nascosto'
        : action === 'mostra' ? 'Elemento mostrato'
        : 'Schermata cambiata';

    /* Letture e ricerche: nessuna riga, per scelta. */
    default: return null;
  }
}

async function* runWithLocalTools(
  messages: readonly ThreadMessage[],
  abortSignal: AbortSignal,
  runTool: (use: ToolUse) => ToolResult | Promise<ToolResult>,
  modelName?: string,
  mealConfirmation?: MealConfirmation,
  workoutConfirmation?: WorkoutConfirmation,
  actionConfirmation?: ActionConfirmation,
  workoutPlanProposal?: string,
  shared?: { systemPrompt: string; requestId: string; projectId?: string; contextSelection?: ContextDecision[] },
) {
  const last = messages.at(-1);
  let user = workoutPlanProposal
    ? `Confermo questa modifica al piano di allenamento: ${workoutPlanProposal}`
    : textOf(last);
  const token = savedToken();
  if (token) user += await foodBarcodeContext(user, token, abortSignal);
  const images = imagesForRun(
    messages,
    mealConfirmation?.status === 'confirmed' || workoutConfirmation?.status === 'confirmed',
  );
  const files = filesOf(last);
  const history = topicAwareHistory(toBrainMessages(messages.slice(0, -1)));
  let answer = "";
  const chunks: string[] = [];
  let waiting: (() => void) | null = null;
  let finished = false;
  let failure: unknown;
  let cost: ChatCost = { costUsd: 0 };
  const updates: string[] = [];
  const activity: Array<{ tool: string; status: 'RUNNING' | 'PASS' | 'FAIL'; durationMs?: number }> = [];
  let activityChanged = false;
  const notifyActivity = () => { activityChanged = true; waiting?.(); waiting = null; };
  const meBefore = JSON.stringify(readHealthJournal());

  const runAndDescribe = async (use: ToolUse): Promise<ToolResult> => {
    const entry = { tool: use.name, status: 'RUNNING' as 'RUNNING' | 'PASS' | 'FAIL', durationMs: 0 };
    activity.push(entry);
    const startedAt = performance.now();
    notifyActivity();
    let result: ToolResult;
    try {
      result = await executeRuntimeTool(use, runTool, { token, projectId: shared?.projectId });
      entry.status = result.isError ? 'FAIL' : 'PASS';
    } catch (error) { entry.status = 'FAIL'; throw error; }
    finally { entry.durationMs = Math.round(performance.now() - startedAt); notifyActivity(); }
    if (result.isError) return result;
    const label = updateLabel(use, shared?.projectId);
    if (label && !updates.includes(label)) updates.push(label);
    return result;
  };

  const request = replyWithLocalTools(
    history,
    user,
    abortSignal,
    (chunk) => {
      chunks.push(chunk);
      waiting?.();
      waiting = null;
    },
    runAndDescribe,
    modelName,
    images,
    mealConfirmation,
    workoutConfirmation,
    actionConfirmation,
    files,
    shared,
  )
    .then((result) => { cost = result; })
    .catch((error: unknown) => { failure = error; })
    .finally(() => {
      finished = true;
      waiting?.();
      waiting = null;
    });

  while (!finished || chunks.length > 0 || activityChanged) {
    if (activityChanged) {
      activityChanged = false;
      yield { content: answer ? [{ type: 'text' as const, text: answer }] : [], metadata: { custom: { activity: activity.map((item) => ({ ...item })) } } };
    }
    if (finished && chunks.length === 0) break;
    if (chunks.length === 0) {
      await new Promise<void>((resolve) => { waiting = resolve; });
      continue;
    }
    answer += chunks.shift() ?? "";
    yield { content: [{ type: "text" as const, text: answer }] };
  }
  await request;
  if (failure) throw failure;
  if (JSON.stringify(readHealthJournal()) !== meBefore && updates.length === 0) {
    updates.push("Schermata ME aggiornata");
  }
  yield {
    content: [{ type: "text" as const, text: answer }],
    metadata: {
      custom: {
        costUsd: cost.costUsd,
        model: cost.model ?? modelName,
        traceId: cost.traceId,
        updates,
        activity,
        monReaction: reactionForAnswer(answer),
        ...(mealConfirmation?.status === 'needs-confirmation'
          ? { pendingMeal: { slot: mealConfirmation.slot } }
          : {}),
      },
    },
  };
}

function sourcePart(source: Source): ThreadAssistantMessagePart {
  return {
    type: "source",
    sourceType: "url",
    id: source.url,
    url: source.url,
    title: source.title,
  };
}

function searchPart(done: boolean): ThreadAssistantMessagePart {
  return {
    type: "tool-call",
    toolName: done ? "Ricerca web completata" : "Ricerca web in corso",
    toolCallId: "vinz-web-search",
    args: {},
    argsText: "{}",
    ...(done ? { result: { completed: true } } : {}),
  };
}

function withText(
  parts: ThreadAssistantMessagePart[],
  text: string,
): ThreadAssistantMessagePart[] {
  return text ? [...parts, { type: "text", text }] : [...parts];
}

/** Anche i provider che restituiscono la risposta tutta insieme la mostrano
 * come scrittura, non come un blocco che compare di colpo. Il testo resta già
 * completo lato dati: questa funzione controlla soltanto la sua presentazione.
 *
 * PRODUCT FIX (2026-09-06) — «le risposte lunghe devono comparire molto più
 * in fretta»: le prime ~20 parole restano ESATTAMENTE come prima (il ritmo
 * percepibile che racconta il carattere); oltre, il tempo totale è vincolato
 * al budget di `liveRevealDurationMs` (centralizzato in typingRhythm.ts) e le
 * parole restanti si spartiscono quel poco che avanza — quale che sia la
 * lunghezza della risposta, l'utente non aspetta mai un testo già arrivato. */
async function* writtenSnapshots(
  text: string,
  abortSignal: AbortSignal,
  rhythm: TypingRhythm,
): AsyncGenerator<string> {
  const reducedMotion = typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    yield text;
    return;
  }

  const words = text.match(/\S+\s*/g) ?? [text];

  const CHARACTER_WORDS = 20;
  const characterWordCount = Math.min(CHARACTER_WORDS, words.length);
  // Un ritmo percepibile anche su iPhone: la parola cresce con la propria
  // lunghezza e la punteggiatura introduce vere micro-pause. Prima venivano
  // mostrate tre parole ogni 24 ms, quindi l'effetto sembrava istantaneo.
  const characterPause = (word: string) => {
    const basePause = Math.min(210, Math.max(72, word.trim().length * 22));
    return basePause
      + (/[.!?][\s\n]*$/.test(word) ? 220 : /[,;:][\s\n]*$/.test(word) ? 110 : 0);
  };
  // Il budget per il "resto" viene dalla curva pura di typingRhythm.ts,
  // confrontata con se stessa al confine delle 20 parole — non da una somma
  // basata sulla lunghezza delle singole parole (quella sopra, che decide
  // solo il ritmo delle prime 20): così il resto è sempre esattamente la
  // quota che la curva dice, indipendentemente da quanto sono lunghe le
  // parole vere del messaggio.
  const remainingWords = words.length - characterWordCount;
  const remainingBudgetMs = remainingWords > 0
    ? liveRevealDurationMs(rhythm, words.length) - liveRevealDurationMs(rhythm, characterWordCount)
    : 0;
  const perWordRemainingMs = remainingWords > 0 ? remainingBudgetMs / remainingWords : 0;

  let shown = "";
  for (let index = 0; index < words.length; index += 1) {
    if (abortSignal.aborted) return;
    const word = words[index];
    shown += word;
    yield shown;
    const pause = index < characterWordCount ? characterPause(word) : perWordRemainingMs;
    if (pause > 0) await new Promise<void>((resolve) => setTimeout(resolve, pause));
  }
}

/** Runtime reale predefinito. Il mock locale resta disponibile con `?runtime=mock`. */
function createBaseNetlifyChatModel(shared: { systemPrompt: string; requestId: string; contextSelection?: ContextDecision[] }): ChatModelAdapter {
  return {
  async *run({ messages, abortSignal, context }) {
    postChatDiagnostic('CHAT_BASE_MODEL_START', 'base-model');
    const token = savedToken();
    if (!token) {
      const error = new Error("Prima attiva VINZ.MON: manca il token.");
      postChatClientError('base-auth', error);
      throw error;
    }

    const modelName = context.config?.modelName;
    const requestId = shared.requestId;
    const startedAt = Date.now();
    const reasoningEffort = context.config?.reasoningEffort;
    /* 🔷 «Non solo Claude, tutti i ragionamenti, anche OpenAI.» Il server sa
       rispondere in streaming a entrambe le famiglie ora (vedi
       `streamOpenAiResponses` in providers.ts); qui basta non chiudere la
       porta a chi comincia per "gpt-". */
    const useStream = (modelName?.startsWith("claude-") || modelName?.startsWith("gpt-")) ?? false;
    const last = messages.at(-1);
    const images = imagesForRun(messages);
    const files = filesOf(last);
    const app = useApp.getState();
    const activeMon = app.activeMonName ? app.mons[app.activeMonName] : null;
    const systemPrompt = shared.systemPrompt;
    const clock = traceClock();
    clock.mark("SYSTEM PROMPT", activeMon ? `voce vera · ${systemPrompt.length} caratteri` : "neutro");
    const saveTrace = async (model: string | null, error: string | null, retrieved: string[] = []) => {
      const card = activeMon ? voiceCard(activeMon) : null;
      const trace: ChatTrace = {
        originatingUserMessageId: [...messages].reverse().find((item) => item.role === "user")?.id,
        path: "diretto",
        characterVoice: Boolean(activeMon),
        systemChars: systemPrompt.length,
        contextSelection: shared.contextSelection,
        systemPromptComposition: systemPromptComposition([
          { name: activeMon ? "CHARACTER VOICE" : "NEUTRAL ASSISTANT", text: systemPrompt },
        ]),
        model,
        effort: reasoningEffort ?? null,
        toolRounds: [],
        totalMs: clock.elapsed(),
        error,
        steps: clock.steps(),
        at: Date.now(),
        ...(activeMon && card ? {
          personality: {
            monName: activeMon.data.name,
            voicePreset: activeMon.data.voice_preset,
            writingFingerprint: card.fingerprint,
            ...(card.writingStyle?.reactions ? { reactions: card.writingStyle.reactions } : {}),
          },
        } : {}),
        ...(retrieved.length ? { context: retrieved, contextKind: "sources" as const } : {}),
      };
      recordChatTrace(trace);
      return persistChatTrace(trace);
    };
    clock.mark("RICHIESTA", "POST /api/ai · capability character-voice");
    postChatDiagnostic('CHAT_AI_FETCH_START', 'ai-fetch');
    let response: Response;
    try {
      response = await fetch("/api/ai", {
      method: "POST",
      signal: abortSignal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        requestId,
        capability: "character-voice",
        config: { modelName, reasoningEffort },
        stream: useStream,
        /* 🔷 «Manca uno streaming di pensiero veritiero — il processo mentale,
           sempre diverso a seconda della richiesta.» Prima dell'ora `StatoDelPensiero`
           sceglieva una frase da una tabella, sempre finta, sempre uguale a
           parità di tono. Qui il modello ragiona per davvero e lo stream lo
           lascia passare; a sforzo basso (il predefinito) il pensiero è breve
           o assente, e in quel caso la tabella resta il ripiego onesto — non
           sparisce, diventa quello che era sempre dovuta essere: un'ultima
           risorsa, non la prima. */
        thinking: useStream,
        webSearch: true,
        system: [
          {
            text: systemPrompt,
          },
        ],
        /* ⚠️ ANCHE QUI, NON SOLO NEL GIRO CON GLI STRUMENTI. Questa è la strada
           della chiacchierata normale — cioè la maggior parte dei turni — e
           senza lo stesso taglio spediva tutta la cronologia mentre l'altra la
           accorciava: i topic avrebbero abbassato il contesto solo quando VINZ
           usava uno strumento, cioè quasi mai. */
        turns: topicAwareHistory(
          messages
            .slice(0, -1)
            .filter((message) => message.role === "user" || message.role === "assistant")
            .map((message) => ({
              id: message.id,
              ts: message.createdAt.toISOString(),
              role: message.role as 'user' | 'assistant',
              content: textOf(message),
            })),
        ).map(({ role, content }) => ({ role, content })),
        user: textOf(last),
        ...(images.length ? { images } : {}),
        ...(files.length ? { files } : {}),
        maxTokens: 2000,
      }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      postChatClientError('ai-fetch', error);
      await saveTrace(modelName ?? null, message);
      throw error;
    }

    if (!response.ok) {
      const problem = (await response.json().catch(() => null)) as
        | { error?: string; reason?: string }
        | null;
      const message = problem?.reason ?? problem?.error ?? `Richiesta fallita (${response.status}).`;
      postChatClientError(`ai-response-${response.status}`, new Error(message));
      postRuntimeEvent({ eventType: 'CHAT_RESPONSE_ERROR', status: 'FAIL', scope: 'chat', requestId, messageId: last?.id, capability: 'character-voice', durationMs: Date.now() - startedAt, error: message });
      await saveTrace(modelName ?? null, message);
      throw new Error(message);
    }

    if (!useStream) {
      const body = (await response.json()) as {
        text?: string;
        sources?: Source[];
        costUsd?: number;
        model?: string;
      };
      const parts = (body.sources ?? []).map(sourcePart);
      if (!body.text) {
        postRuntimeEvent({ eventType: 'CHAT_RESPONSE_ERROR', status: 'FAIL', scope: 'chat', requestId, messageId: last?.id, capability: 'character-voice', durationMs: Date.now() - startedAt, error: 'empty response' });
        await saveTrace(body.model ?? modelName ?? null, "La risposta è arrivata vuota.");
        throw new Error("La risposta è arrivata vuota.");
      }
      const liveRhythm = typingRhythmFor(activeMon ? activeMon.data.voice_dna : ({} as import("@/engine/types").VoiceDna));
      for await (const shown of writtenSnapshots(body.text, abortSignal, liveRhythm)) {
        yield { content: withText(parts, shown) };
      }
      clock.mark("RISPOSTA", body.model ?? modelName ?? "modello sconosciuto");
      const traceId = await saveTrace(
        body.model ?? modelName ?? null,
        null,
        (body.sources ?? []).map((source) => `${source.title} — ${source.url}`),
      );
      yield {
        content: withText(parts, body.text),
        metadata: {
          custom: {
            costUsd: body.costUsd ?? 0,
            model: body.model ?? modelName,
            traceId: traceId ?? undefined,
            monReaction: reactionForAnswer(body.text),
          },
        },
      };
      postRuntimeEvent({ eventType: 'CHAT_RESPONSE_OK', status: 'PASS', scope: 'chat', requestId, messageId: last?.id, capability: 'character-voice', model: body.model ?? modelName, durationMs: Date.now() - startedAt });
      return;
    }

    if (!response.body) throw new Error("Lo stream non è disponibile.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer = "";
    let thinking = "";
    let searching = false;
    let costUsd = 0;
    let answeredBy = modelName;
    const sources = new Map<string, Source>();

    const snapshot = () => {
      const parts: ThreadAssistantMessagePart[] = [];
      if (searching) parts.push(searchPart(false));
      parts.push(...[...sources.values()].map(sourcePart));
      return withText(parts, answer);
    };

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const records = buffer.split("\n\n");
      buffer = records.pop() ?? "";
      for (const record of records) {
        const line = record.split("\n").find((item) => item.startsWith("data: "));
        if (!line) continue;
        const event = JSON.parse(line.slice(6)) as StreamEvent;
        if (event.type === "search_started") searching = true;
        if (event.type === "source_found") sources.set(event.source.url, event.source);
        if (event.type === "thinking_delta") thinking += event.delta;
        if (event.type === "answer_delta") answer += event.delta;
        if (event.type === "answer_completed") {
          searching = false;
          costUsd = event.costUsd;
          answeredBy = event.model;
          for (const source of event.sources) sources.set(source.url, source);
        }
        if (event.type === "error") {
          postChatClientError('ai-stream', new Error(event.message));
          postRuntimeEvent({ eventType: 'CHAT_RESPONSE_ERROR', status: 'FAIL', scope: 'chat', requestId, messageId: last?.id, capability: 'character-voice', durationMs: Date.now() - startedAt, error: event.message });
          await saveTrace(answeredBy ?? null, event.message);
          throw new Error(event.message);
        }
        /* 🔷 Il pensiero viaggia come metadato, non come testo del messaggio:
           non è la risposta, è quello che il modello fa PRIMA di scriverla.
           `StatoDelPensiero` lo legge da qui finché non arriva la prima
           parola vera — poi non serve più, il testo stesso è il segnale. */
        yield { content: snapshot(), metadata: { custom: { thinkingText: thinking } } };
      }
      if (done) break;
    }

    const completeParts: ThreadAssistantMessagePart[] = [];
    if (sources.size > 0) completeParts.push(searchPart(true));
    completeParts.push(...[...sources.values()].map(sourcePart));
    clock.mark("RISPOSTA", answeredBy ?? "modello sconosciuto");
    const traceId = await saveTrace(
      answeredBy ?? null,
      null,
      [...sources.values()].map((source) => `${source.title} — ${source.url}`),
    );
    postRuntimeEvent({ eventType: 'CHAT_RESPONSE_OK', status: 'PASS', scope: 'chat', requestId, messageId: last?.id, capability: 'character-voice', model: answeredBy, durationMs: Date.now() - startedAt });
    yield {
      content: withText(completeParts, answer),
      metadata: {
        custom: { costUsd, model: answeredBy, traceId: traceId ?? undefined, monReaction: reactionForAnswer(answer) },
      },
    };
  },
  };
}

export function createNetlifyChatModel(
  runTool?: (use: ToolUse) => ToolResult | Promise<ToolResult>,
): ChatModelAdapter {
  return {
    async *run(args) {
      postChatDiagnostic('CHAT_MODEL_ADAPTER_START', 'model-adapter');
      const requestId = globalThis.crypto?.randomUUID?.() ?? `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const last = args.messages.at(-1);
      const user = textOf(last);
      const projectId = typeof args.runConfig?.custom?.projectId === 'string' ? args.runConfig.custom.projectId : undefined;
      if (last?.role === "user") {
        // Fire-and-forget: semantic capture is isolated from response latency.
        if (!projectId) void captureChatMemoryForClient({ text: user, messageId: last.id, requestId, context: args.messages.slice(-5, -1).map((message) => ({ role: message.role === 'assistant' ? 'assistant' : 'user', text: textOf(message) })) });
        postRuntimeEvent({ eventType: 'CHAT_SEND_START', status: 'START', scope: 'chat', requestId, messageId: last.id, capability: 'character-voice' });
      }
      const pendingSlot = pendingMealSlot(args.messages);
      const pendingWorkout = hasPendingWorkout(args.messages);
      const pendingPlan = pendingWorkoutPlanProposal(args.messages);
      const waitingAction = pendingAction(args.messages);
      /* 🔴 «Imposta la dieta: colazione leggera, pranzo proteico…» finiva in
         «Confermi che lo registro come colazione?». `isMealLogIntent` vede i
         nomi dei pasti e non sa che la frase parla del PIANO. Un intento
         esplicito di dieta o di piano vince quindi sul log del singolo pasto —
         la stessa precedenza che `isWorkoutLogIntent` applica già rispetto a
         `isWorkoutPlanIntent`. */
      const proposed = !pendingSlot && !pendingWorkout && !waitingAction
        ? proposedAction(user)
        : undefined;
      const planLike = proposed === 'dieta' || proposed === 'piano';

      const mealConfirmation: MealConfirmation | undefined = pendingSlot && confirms(user)
        ? { status: 'confirmed', slot: pendingSlot }
        : !planLike && isMealLogIntent(user)
          ? { status: 'needs-confirmation', slot: proposedMealSlot(user) }
          : undefined;
      const workoutConfirmation: WorkoutConfirmation | undefined = pendingWorkout && confirms(user)
        ? { status: 'confirmed' }
        : !planLike && isWorkoutLogIntent(user)
          ? { status: 'needs-confirmation' }
          : undefined;
      const actionConfirmation: ActionConfirmation | undefined = waitingAction && confirms(user)
        ? { action: waitingAction, status: 'confirmed' }
        : proposed
          ? { action: proposed, status: 'needs-confirmation' }
          : undefined;
      /* Il vecchio percorso «proposta di piano riconosciuta dalla prosa» resta
         per le frasi che non passano dalla domanda dell'app; quando invece la
         conferma esplicita c'è, comanda quella — due strade insieme
         scriverebbero il piano due volte. */
      const confirmedPlan = !actionConfirmation && pendingPlan && confirms(user) ? pendingPlan : undefined;
      if (isV2IssueIntent(user)) {
        yield* runV2IssueCapture(user);
        return;
      }
      if (isImageCreationIntent(user)) {
        yield* runImageCreation(args.messages, args.abortSignal);
        return;
      }
      /* La decisione semantica appena calcolata deve bastare per entrare nel
         percorso salute anche PRIMA della conferma. Prima controllavamo solo
         `confirmed`: una frase naturale come «ho cenato» produceva
         `needs-confirmation`, ma poi ricadeva nella chat senza strumenti e il
         modello poteva inventare «registrato». */
      const useTools = Boolean(runTool && (shouldUseLocalTools(user) || projectId || mealConfirmation || workoutConfirmation || actionConfirmation || confirmedPlan));
      const token = savedToken();
      if (!token) throw new Error('Prima attiva VINZ.MON: manca il token.');
      postChatDiagnostic('CHAT_MEMORY_FETCH_START', 'canonical-context');
      let contextSelection: ContextDecision[] = [];
      let systemPrompt = await resolveChatContext(token, user, useTools, args.abortSignal, projectId, args.messages.slice(-5, -1).map(textOf).join('\n'), selection => { contextSelection = selection; });

      /* Segnalibro e archivio si leggono qui, dove il prompt di sistema viene
         composto: così valgono sia per il giro con gli strumenti sia per la
         risposta diretta, senza due strade da tenere allineate. */
      topicWatermark = await readWatermark(activeThreadId()).catch(() => null);
      if (topicWatermark) {
        const archive = await topicArchive().catch(() => '');
        if (archive) systemPrompt += archive;
      }

      /* 🔷 «Continuiamo a parlare di questa cosa.» Il riassunto del topic
         ripreso entra nel contesto di QUESTO turno, dichiarato come materiale
         d'archivio: è roba già detta, non un fatto nuovo. */
      const resumed = consumeTopicContext();
      if (resumed) {
        systemPrompt += `\n\nCONVERSAZIONE PRECEDENTE RIPRESA DALL'UTENTE — «${resumed.title}»\n${resumed.summary}\nEND. È il riassunto di uno scambio passato: usalo per riprendere il filo, non trattarlo come qualcosa detto adesso.`;
      }

      // FIX 3 (2026-09-06) — capacità sempre dichiarate, in OGNI percorso che
      // parte da qui (BASE e loop strumenti condividono questo UNICO punto
      // in cui il system prompt viene risolto): una domanda come "che
      // strumenti hai?" non attiva nessun intento sopra e senza questo
      // blocco il modello rispondeva con quello che si ricorda di sé
      // (web.run) invece di quello che VINZ.MON sa fare davvero. Vedi
      // `buildCapabilitySummary` in `ai/toolLayer.ts` — proiettata dai
      // registri veri dei tool, mai una lista scritta a mano scollegata.
      systemPrompt += buildCapabilitySummary(true);
      systemPrompt += await loadEnabledSkillsSummary(token);
      if (runTool && useTools) {
        yield* runWithLocalTools(
          args.messages,
          args.abortSignal,
          runTool,
          args.context.config?.modelName,
          mealConfirmation,
          workoutConfirmation,
          actionConfirmation,
          confirmedPlan,
          { systemPrompt, requestId, projectId, contextSelection },
        );
        return;
      }
      const result = createBaseNetlifyChatModel({ systemPrompt, requestId, contextSelection }).run(args);
      if (result instanceof Promise) {
        yield await result;
      } else {
        yield* result;
      }
    },
  };
}

export const netlifyChatModel = createNetlifyChatModel();
