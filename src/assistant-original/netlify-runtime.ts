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
  isRepoOpsIntent,
  isCodeWriteIntent,
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
import { executeRuntimeTool, lastReadSkillName, loadEnabledSkillsSummary, type ToolResult, type ToolUse } from "@/ai/tools";
import { connectorsSummaryForProject } from "@/connectors/summary";
import { readHealthJournal } from "@/engine/healthJournal";
import { runStep, useApp } from "@/state/store";
import type { ContextDecision } from '@/ai/contextSelection';
import { resolveChatContext } from '@/ai/chatContext';
import { buildCapabilitySummary } from "@/ai/toolLayer";
import { persistChatTrace, recordChatTrace, systemPromptComposition, traceClock, type ChatTrace } from "@/ai/chatTrace";
import { voiceCard } from "@/engine/voiceCard";
import { captureChatMemoryForClient } from "@/assistant-original/chat-memory-feedback";
import { postChatClientError, postChatDiagnostic, postRuntimeEvent } from "@/system/runtimeLog";
import { createV2Issue } from "@/ai/backend";
import { activeThreadId, consumeTopicContext, readWatermark, topicArchive } from "./conversation-topics";
import { openHermesProjectRun, readHermesProjectEvents, type ContextUsage, type HermesWorkspaceFile } from './hermes-project-runtime';
import { classifyV2Issue, isV2IssueIntent, v2IssueConfirmationText } from "@/ai/v2Issues";
import { browserUuid } from "@/system/browserUuid";
import { processLifeTurn } from "./life-cycle-runtime";
import { GLOBAL_PROJECT_ID, WORLD_PROJECT_ID } from "@/engine/projects";
import { ledgerBlock, worldBlock } from "@/engine/world";
import { chatNarratorFallbackFrame, writeChatNarratorFrameWithAi } from "@/ai/narratorPrompt";

type Source = { title: string; url: string; domain?: string };

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
  return parts.flatMap((part) => part.type === "file" && (part.mimeType === "application/pdf" || part.mimeType === "text/plain")
    ? [{ mediaType: part.mimeType, data: part.data, filename: part.filename ?? "documento.pdf" }]
    : []).slice(0, 2);
}

/**
 * Il PDF allegato resta il riferimento per tutto il compito ancora aperto,
 * non solo per il messaggio subito dopo. Due difetti trovati dal vivo nella
 * prima versione di questa funzione:
 * 1. Serviva una parola chiave ("pdf", "documento"...) nel messaggio corrente
 *    per anche solo PROVARE a recuperarlo — un follow-up come «quanti pezzi
 *    per il modello X» non la contiene mai, quindi il file spariva subito.
 * 2. La ricerca guardava solo 6 messaggi indietro — un compito reale fatto
 *    di conferme, correzioni e domande («ci salviamo tutto», «il 24SA017
 *    tienilo come 30») li supera via via che la conversazione continua.
 * Ora si cerca all'indietro finché dura il TOPIC corrente (lo stesso confine
 * di `topicAwareHistory`, `topicWatermark` qui sotto): un PDF resta
 * raggiungibile per tutto il tempo in cui la conversazione intorno a lui
 * resta visibile al modello, non un numero di messaggi arbitrario.
 */
function filesForRun(messages: readonly ThreadMessage[]): ChatFile[] {
  const last = messages.at(-1);
  const current = filesOf(last);
  if (current.length) return current;
  const boundary = topicWatermark ? messages.findIndex((m) => m.id === topicWatermark) : -1;
  for (let index = messages.length - 2; index > boundary; index--) {
    const previous = messages[index];
    if (previous?.role !== "user") continue;
    const files = filesOf(previous);
    if (files.length) return files;
  }
  return [];
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

/* REPO OPS — riavvio del Local Core Server: STESSA forma di conferma di
   peso/promemoria/dieta/piano (vedi CONFIRMABLE_ACTIONS.riavvio in
   brain/stream.ts), qui solo il riconoscimento della richiesta iniziale. */
const RESTART_INTENT = /\briavvia\w*\s+.{0,20}(?:servizio|local\s*core|vinz)|\brestart\w*\s+.{0,20}(?:service|local\s*core|vinz)/i;

function proposedAction(text: string): ConfirmableAction | undefined {
  const tool = requiredWriteTool(text);
  if (tool && ACTION_BY_TOOL[tool]) return ACTION_BY_TOOL[tool];
  if (RESTART_INTENT.test(text)) return 'riavvio';
  if (isCodeWriteIntent(text)) return 'codice';
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

/* Alcuni strumenti VINZ.MON vivono ancora nel browser perché usano sessioni,
   autorizzazioni o UI già collegate lì. Finché non esiste un adapter Hermes
   equivalente, queste richieste restano sul percorso storico: Hermes governa
   la conversazione e l'esecuzione generica senza rompere capacità funzionanti. */
const BROWSER_PRODUCT_TOOL_INTENT = /\b(?:calendari\w*|agenda|impegn\w*|appuntament\w*|secondo cervello|second brain|obsidian|vault|icloud|drive|gmail|e-?mail|posta|connettor\w*|integrazion\w*|promemori\w*|reminder|automazion\w*|aspetto|schermata|icon[ae]|superficie html|canvas)\b/i;

function needsLegacyProductTool(
  user: string,
  actionConfirmation?: ActionConfirmation,
  confirmedPlan?: string,
): boolean {
  if (confirmedPlan || (actionConfirmation && actionConfirmation.action !== 'peso')) return true;
  const writeTool = requiredWriteTool(user);
  if (writeTool && writeTool !== 'registra_peso') return true;
  return BROWSER_PRODUCT_TOOL_INTENT.test(user) || isRepoOpsIntent(user);
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
    case 'imposta_obiettivo_progetto': return 'Obiettivo del progetto aggiornato';
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

    /* --- Skill ---
       🔷 «Come "Aggiunto in ME", vorrei "Skill 'nome' usata".» Unica lettura
       con una riga: le altre restano silenziose (sotto), ma seguire una
       skill cambia visibilmente COME arriva la risposta — non è un dato
       recuperato in background, è una procedura scelta al posto di
       improvvisare la propria. */
    case 'leggi_skill': {
      const sourceId = typeof args.sorgente === 'string' ? args.sorgente : '';
      const skillId = typeof args.id === 'string' ? args.id : '';
      const name = sourceId && skillId ? lastReadSkillName(sourceId, skillId) : null;
      return name ? `Skill "${name}" usata` : null;
    }
    case 'gestisci_skill_locale': {
      const name = typeof args.nome === 'string' ? args.nome.trim() : '';
      return action === 'crea' ? (name ? `Skill "${name}" creata` : 'Skill creata')
        : action === 'aggiorna' ? (name ? `Skill "${name}" aggiornata` : 'Skill aggiornata')
        : action === 'rimuovi' ? 'Skill rimossa'
        : null;
    }

    /* Altre letture e ricerche: nessuna riga, per scelta. */
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
  const files = filesForRun(messages);
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
  /* 🔷 «Manca il pensiero vero mentre usa gli strumenti.» `replyWithLocalTools`
     ora apre uno stream vero per ogni giro e può portare fuori il pensiero
     reale del modello (`onThinking`, in fondo alla sua firma) — qui lo si
     raccoglie e si passa a `StatoDelPensiero` esattamente come `activity`,
     con lo stesso meccanismo di risveglio (`waiting`). */
  let thinking = '';
  let thinkingChanged = false;
  const notifyThinking = () => { thinkingChanged = true; waiting?.(); waiting = null; };
  /* 🔷 «Una superficie html in un box suo, dentro il messaggio.» Il contenuto
     lo scrive il modello, non un file da salvare da nessuna parte: basta
     leggerlo da `use.input` (mostra_superficie_html lo valida e basta,
     `ai/tools.ts`) e passarlo nei metadata del messaggio finale — la stessa
     via di `updates`/`activity` qui sotto. Una sola per messaggio: l'ultima
     vince, non ha senso impilarne più di una nello stesso box. */
  let htmlSurface: string | null = null;

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
    if (use.name === 'mostra_superficie_html') {
      const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
      if (typeof args.html === 'string' && args.html.trim()) htmlSurface = args.html;
    }
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
    (delta) => { thinking += delta; notifyThinking(); },
    useApp.getState().finalResponseLocalFirst,
  )
    .then((result) => { cost = result; })
    .catch((error: unknown) => { failure = error; })
    .finally(() => {
      finished = true;
      waiting?.();
      waiting = null;
    });

  while (!finished || chunks.length > 0 || activityChanged || thinkingChanged) {
    if (activityChanged) {
      activityChanged = false;
      yield { content: answer ? [{ type: 'text' as const, text: answer }] : [], metadata: { custom: { activity: activity.map((item) => ({ ...item })) } } };
    }
    if (thinkingChanged) {
      thinkingChanged = false;
      yield { content: answer ? [{ type: 'text' as const, text: answer }] : [], metadata: { custom: { thinkingText: thinking } } };
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
        htmlSurface,
        monReaction: reactionForAnswer(answer),
        ...(mealConfirmation?.status === 'needs-confirmation'
          ? { pendingMeal: { slot: mealConfirmation.slot } }
          : {}),
      },
    },
  };
}

async function* runWithHermesProject(
  messages: readonly ThreadMessage[],
  abortSignal: AbortSignal,
  token: string,
  requestId: string,
  projectId: string,
  modelName?: string,
  reasoningEffort?: string,
  mealConfirmation?: MealConfirmation,
  workoutConfirmation?: WorkoutConfirmation,
  actionConfirmation?: ActionConfirmation,
) {
  const images = imagesForRun(messages);
  const files = filesForRun(messages).filter((file) => file.mediaType === 'text/plain');
  const activity: Array<{ tool: string; detail?: string; status: 'RUNNING' | 'PASS' | 'FAIL'; durationMs?: number }> = [];
  let thinkingText = 'Hermes sta preparando il piano di lavoro…';
  let imageEntry: (typeof activity)[number] | undefined;
  const imageStartedAt = performance.now();
  if (images.length) {
    imageEntry = {
      tool: 'Lettura immagine',
      detail: images.length === 1 ? 'Sto leggendo localmente l’immagine allegata' : `Sto leggendo localmente ${images.length} immagini allegate`,
      status: 'RUNNING',
    };
    activity.push(imageEntry);
    thinkingText = `${imageEntry.detail}…`;
    yield { content: [], metadata: { custom: { orchestrator: 'hermes', activity: activity.map((item) => ({ ...item })), thinkingText, costUsd: 0 } } };
  }
  const response = await openHermesProjectRun({
    token,
    requestId,
    projectId,
    conversationId: activeThreadId() || requestId,
    user: textOf(messages.at(-1)) || (files.length ? 'Leggi il foglio di calcolo allegato e dimmi cosa contiene.' : ''),
    turns: topicAwareHistory(toBrainMessages(messages.slice(0, -1))).slice(-6).map(({ role, content }) => ({ role, content })),
    model: modelName,
    effort: reasoningEffort,
    images,
    files,
    ...(mealConfirmation ? { actionIntent: { action: 'meal' as const, status: mealConfirmation.status, slot: mealConfirmation.slot } }
      : workoutConfirmation ? { actionIntent: { action: 'workout' as const, status: workoutConfirmation.status } }
      : actionConfirmation?.action === 'peso' ? { actionIntent: { action: 'weight' as const, status: actionConfirmation.status } }
      : {}),
    signal: abortSignal,
  });
  if (!response) return false;

  if (imageEntry) {
    imageEntry.status = 'PASS';
    imageEntry.durationMs = Math.round(performance.now() - imageStartedAt);
    thinkingText = 'Immagine letta localmente. Passo il testo a Hermes…';
    yield { content: [], metadata: { custom: { orchestrator: 'hermes', activity: activity.map((item) => ({ ...item })), thinkingText, costUsd: 0 } } };
  }

  let answer = '';
  let model: string | undefined;
  let costUsd = 0;
  let timings: Record<string, number> | undefined;
  let contextUsage: { hermes?: ContextUsage; vinz?: ContextUsage } | undefined;
  let workspaceFiles: HermesWorkspaceFile[] | undefined;
  const updates: string[] = [];
  const toolDetail = (tool: string, preview?: string): string => {
    const target = preview?.trim();
    if (/^(?:read_file|read_many_files|get_file)/i.test(tool)) return target ? `Sto leggendo ${target}` : 'Sto leggendo un file';
    if (/^(?:search_files|grep|find)/i.test(tool)) return target ? `Sto cercando nei file: ${target}` : 'Sto cercando i file pertinenti';
    if (/^(?:list_files|list_directory)/i.test(tool)) return target ? `Sto esplorando ${target}` : 'Sto esplorando le cartelle del progetto';
    if (/^(?:write_file|patch|edit)/i.test(tool)) return target ? `Sto aggiornando ${target}` : 'Sto preparando una modifica';
    if (/^(?:terminal|execute)/i.test(tool)) return target ? `Sto eseguendo: ${target}` : 'Sto eseguendo un controllo nel progetto';
    return target ? `${tool}: ${target}` : `Sto usando ${tool}`;
  };
  for await (const event of readHermesProjectEvents(response)) {
    if (event.type === 'text_delta') answer += event.delta;
    if (event.type === 'progress') thinkingText = event.message;
    if (event.type === 'tool_started') {
      const detail = toolDetail(event.tool, event.preview);
      activity.push({ tool: event.tool, detail, status: 'RUNNING' });
      thinkingText = `${detail}…`;
    }
    if (event.type === 'tool_progress') thinkingText = `${toolDetail(event.tool, event.preview)}…`;
    if (event.type === 'tool_completed') {
      const entry = [...activity].reverse().find((item) => item.tool === event.tool && item.status === 'RUNNING');
      if (entry) {
        entry.status = event.error ? 'FAIL' : 'PASS';
        if (event.durationMs !== undefined) entry.durationMs = event.durationMs;
      } else {
        activity.push({ tool: event.tool, status: event.error ? 'FAIL' : 'PASS', ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}) });
      }
      thinkingText = event.error ? `${entry?.detail || event.tool}: non riuscito` : `${entry?.detail || event.tool}: completato`;
      if (!event.error && /vinz_registra_(?:pasto|allenamento|peso)$/.test(event.tool)) {
        const { pullShortcutQueue } = await import('@/state/store');
        const applied = await pullShortcutQueue();
        if (applied > 0) {
          const label = event.tool.endsWith('pasto') ? 'Pasto aggiunto in ME' : event.tool.endsWith('allenamento') ? 'Allenamento aggiunto in ME' : 'Peso aggiornato in ME';
          if (!updates.includes(label)) updates.push(label);
        }
      }
    }
    if (event.type === 'approval_required') {
      activity.push({ tool: 'Approvazione richiesta', status: 'FAIL' });
      thinkingText = 'Operazione fermata: richiedeva approvazione.';
    }
    if (event.type === 'final') {
      if (!answer) answer = event.text;
      model = event.model;
      costUsd = event.costUsd ?? 0;
      timings = event.timings;
      thinkingText = '';
      if (event.files?.length) workspaceFiles = event.files;
    }
    if (event.type === 'context') contextUsage = { ...(event.hermes ? { hermes: event.hermes } : {}), ...(event.vinz ? { vinz: event.vinz } : {}) };
    if (event.type === 'error') throw new Error(event.message);
    yield {
      content: answer ? [{ type: 'text' as const, text: answer }] : [],
      metadata: { custom: { orchestrator: 'hermes', activity: activity.map((item) => ({ ...item })), updates, costUsd, ...(thinkingText ? { thinkingText } : {}), ...(model ? { model } : {}), ...(timings ? { hermesTimings: timings } : {}), ...(contextUsage ? { contextUsage } : {}), ...(workspaceFiles ? { workspaceFiles } : {}) } },
    };
  }
  if (mealConfirmation?.status === 'needs-confirmation') {
    answer = `${answer.replace(/\b(?:segnat|registrat|salvat|aggiunt)\w*[^.!?]*[.!?]?/gi, '').trim()}\n\nConfermi che lo registro come **${mealConfirmation.slot === 'extra' ? 'extra / spuntino aggiuntivo' : mealConfirmation.slot}**?`.trim();
  } else if (workoutConfirmation?.status === 'needs-confirmation') {
    answer = `${answer.trim()}\n\nConfermi che registro questo **allenamento** in ME?`.trim();
  } else if (actionConfirmation?.action === 'peso' && actionConfirmation.status === 'needs-confirmation') {
    answer = `${answer.trim()}\n\n${CONFIRMABLE_ACTIONS.peso.question}`.trim();
  }
  yield {
    content: answer ? [{ type: 'text' as const, text: answer }] : [],
    metadata: { custom: { orchestrator: 'hermes', activity, updates, costUsd, model, hermesTimings: timings, monReaction: reactionForAnswer(answer), ...(contextUsage ? { contextUsage } : {}), ...(workspaceFiles ? { workspaceFiles } : {}), ...(mealConfirmation?.status === 'needs-confirmation' ? { pendingMeal: { slot: mealConfirmation.slot } } : {}) } },
  };
  return true;
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

function withText(
  parts: ThreadAssistantMessagePart[],
  text: string,
): ThreadAssistantMessagePart[] {
  return text ? [...parts, { type: "text", text }] : [...parts];
}

/** Runtime reale predefinito. Il mock locale resta disponibile con `?runtime=mock`. */
function createBaseNetlifyChatModel(shared: { systemPrompt: string; requestId: string; contextSelection?: ContextDecision[]; worldNarration?: boolean; questFrame?: { before: string; after: string } }): ChatModelAdapter {
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
    const last = messages.at(-1);
    const images = imagesForRun(messages);
    const files = filesForRun(messages);
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
    /* 🔷 «esco e riesco, mi fa spendere un botto» — prima questa era una
       `fetch(..., {stream:true})` tenuta aperta per tutta la risposta: su
       iOS, uscire dall'app la uccideva in pochi secondi e non c'era niente
       da riprendere, bisognava ripartire da zero (e ripagare il giro).
       Ora si parte e basta (`/api/ai-chat-background`, stesso schema di
       `evolution-background.ts` per i mon): il lavoro vero continua da solo
       sul server, e qui si chiede "sei pronto?" ogni tanto — ogni domanda è
       una richiesta corta, che sopravvive al background perché non deve
       restare aperta per interi minuti. Il prezzo: niente più scrittura
       parola-per-parola, la risposta compare tutta insieme quando è pronta —
       esattamente come per un .mon che si trasforma. */
    clock.mark("RICHIESTA", "POST /api/ai-chat-background · capability character-voice");
    postChatDiagnostic('CHAT_AI_FETCH_START', 'ai-fetch');
    const jobId = browserUuid();
    let started: Response;
    try {
      started = await fetch("/api/ai-chat-background", {
        method: "POST",
        signal: abortSignal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jobId,
          config: { modelName, reasoningEffort },
          webSearch: !shared.questFrame,
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
            (shared.questFrame ? messages.slice(-8, -1) : messages.slice(0, -1))
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
          maxTokens: shared.questFrame ? 400 : 2000,
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      postChatClientError('ai-fetch', error);
      await saveTrace(modelName ?? null, message);
      throw error;
    }

    if (!started.ok) {
      const problem = (await started.json().catch(() => null)) as
        | { error?: string; reason?: string }
        | null;
      const message = problem?.reason ?? problem?.error ?? `Richiesta fallita (${started.status}).`;
      postChatClientError(`ai-response-${started.status}`, new Error(message));
      postRuntimeEvent({ eventType: 'CHAT_RESPONSE_ERROR', status: 'FAIL', scope: 'chat', requestId, messageId: last?.id, capability: 'character-voice', durationMs: Date.now() - startedAt, error: message });
      await saveTrace(modelName ?? null, message);
      throw new Error(message);
    }

    yield { content: [], metadata: { custom: { thinkingText: "Sto pensando…" } } };

    type ChatJobBody = {
      status?: "running" | "ready" | "error";
      text?: string;
      sources?: Source[];
      model?: string;
      costUsd?: number;
      error?: string;
    };

    let job: ChatJobBody | null = null;
    const pollStartedAt = Date.now();
    const MAX_POLL_MS = 15 * 60_000;
    /* 🔴 PRODUCT FIX (2026-09-16) — un utente ha visto questo ciclo martellare
       il server all'infinito con "Sto pensando..." bloccato: il server aveva
       rifiutato il token (401), e "riprova al giro dopo" non distingueva un
       blip di rete (che si risolve da solo) da un rifiuto permanente (che
       NON si risolve mai riprovando). Ora i due casi sono separati: 401/403
       si arrende subito, qualunque altro fallimento ha un tetto di tentativi
       consecutivi prima di arrendersi comunque — mai più un loop senza fine. */
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 8;
    while (true) {
      if (abortSignal.aborted) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 1500));
      if (abortSignal.aborted) return;
      if (Date.now() - pollStartedAt > MAX_POLL_MS) {
        const message = "La risposta non è arrivata in tempo.";
        postChatClientError('ai-chat-job-timeout', new Error(message));
        postRuntimeEvent({ eventType: 'CHAT_RESPONSE_ERROR', status: 'FAIL', scope: 'chat', requestId, messageId: last?.id, capability: 'character-voice', durationMs: Date.now() - startedAt, error: message });
        await saveTrace(modelName ?? null, message);
        throw new Error(message);
      }
      const poll = await fetch(`/api/ai-chat-job?jobId=${encodeURIComponent(jobId)}`, {
        signal: abortSignal,
        headers: { authorization: `Bearer ${token}` },
      }).catch(() => null);

      if (poll && (poll.status === 401 || poll.status === 403)) {
        const message = "Il server ha rifiutato il token. Riapri VINZ.MON e riprova.";
        postChatClientError('ai-chat-job-auth', new Error(message));
        postRuntimeEvent({ eventType: 'CHAT_RESPONSE_ERROR', status: 'FAIL', scope: 'chat', requestId, messageId: last?.id, capability: 'character-voice', durationMs: Date.now() - startedAt, error: message });
        await saveTrace(modelName ?? null, message);
        throw new Error(message);
      }

      if (!poll || !poll.ok) {
        consecutiveFailures += 1;
        if (consecutiveFailures > MAX_CONSECUTIVE_FAILURES) {
          const message = "Non riesco a controllare se la risposta è pronta.";
          postChatClientError('ai-chat-job-unreachable', new Error(message));
          postRuntimeEvent({ eventType: 'CHAT_RESPONSE_ERROR', status: 'FAIL', scope: 'chat', requestId, messageId: last?.id, capability: 'character-voice', durationMs: Date.now() - startedAt, error: message });
          await saveTrace(modelName ?? null, message);
          throw new Error(message);
        }
        continue;
      }
      consecutiveFailures = 0;
      job = (await poll.json().catch(() => null)) as ChatJobBody | null;
      if (!job || job.status === "running") continue;
      break;
    }

    let fallbackError: string | null = null;
    if (job.status === "error" || !job.text?.trim()) {
      const message = job.error?.slice(0, 300) || "La risposta è arrivata vuota.";
      const emptyCompletion = /^completamento vuoto\b/i.test(message) || (job.status !== "error" && !job.text?.trim());
      if (shared.questFrame && emptyCompletion) {
        // The game turn is already committed. Keep its narrator frame and let the Mon answer without another roll.
        fallbackError = message;
        const quest = useApp.getState().ledger.quest;
        job.text = quest?.status === 'complete' ? 'Ce l’abbiamo fatta. Possiamo proseguire.'
          : quest?.status === 'failed' ? 'Devo fermarmi. Torniamo quando sarò pronto.'
          : quest?.status === 'investigate' ? 'Ci serve un altro indizio prima di affrontarlo.'
          : 'È ancora davanti a noi. Sono pronto alla prossima mossa.';
        postChatClientError('ai-chat-job-empty-fallback', new Error(message));
      } else {
        postChatClientError('ai-chat-job', new Error(message));
        postRuntimeEvent({ eventType: 'CHAT_RESPONSE_ERROR', status: 'FAIL', scope: 'chat', requestId, messageId: last?.id, capability: 'character-voice', durationMs: Date.now() - startedAt, error: message });
        await saveTrace(job.model ?? modelName ?? null, message);
        throw new Error(message);
      }
    }

    let answer = job.text;
    if (shared.questFrame) {
      answer = `${shared.questFrame.before}\n\n${job.text}\n\n*${shared.questFrame.after}*`;
    } else if (shared.worldNarration && activeMon) {
      const current = useApp.getState();
      const frame = await runStep('narrator',
        model => writeChatNarratorFrameWithAi(token, activeMon, textOf(last), job!.text!, model, { world: current.world, ledger: current.ledger }),
        value => ({ ok: Boolean(value), why: value ? undefined : 'world-narrator-frame-invalid' }),
        { localTimeoutMs: 60_000 }).catch(() => null)
        ?? chatNarratorFallbackFrame(activeMon, { world: current.world, ledger: current.ledger });
      const clean = (text: string) => text.replace(/[\r\n]+/g, ' ').replace(/[*_`]/g, '').trim();
      answer = `*${clean(frame.before)}*\n\n${job.text}\n\n*${clean(frame.after)}*`;
    }

    const parts = (job.sources ?? []).map(sourcePart);
    clock.mark("RISPOSTA", job.model ?? modelName ?? "modello sconosciuto");
    const traceId = await saveTrace(
      job.model ?? modelName ?? null,
      fallbackError,
      (job.sources ?? []).map((source) => `${source.title} — ${source.url}`),
    );
    postRuntimeEvent({ eventType: 'CHAT_RESPONSE_OK', status: 'PASS', scope: 'chat', requestId, messageId: last?.id, capability: 'character-voice', model: job.model ?? modelName, durationMs: Date.now() - startedAt });
    yield {
      content: withText(parts, answer),
      metadata: {
        custom: {
          costUsd: job.costUsd ?? 0,
          model: job.model ?? modelName,
          traceId: traceId ?? undefined,
          monReaction: reactionForAnswer(job.text),
          ...(shared.worldNarration ? { worldNarration: true } : {}),
        },
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
        /* 🔷 «Una cosa in un progetto tipo ricordalo, deve ricordarlo sempre.»
           C'è UNA sola memoria personale, mai divisa per progetto: i progetti
           sono solo un indizio di argomento per la chat ("sei dentro ffuoco,
           quindi parliamo di quello"), non un recinto di memoria separato.
           Prima questa riga si fermava dentro un progetto (`if (!projectId)`):
           per questo, da quando l'utente vive quasi solo dentro progetti, non
           vedeva più "Memoria aggiornata" sotto i messaggi.
           Fire-and-forget: semantic capture is isolated from response latency. */
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
      const useTools = Boolean(runTool && (shouldUseLocalTools(user) || (projectId && projectId !== WORLD_PROJECT_ID) || mealConfirmation || workoutConfirmation || actionConfirmation || confirmedPlan));
      const token = savedToken();
      if (!token) throw new Error('Prima attiva VINZ.MON: manca il token.');
      if (projectId && projectId !== WORLD_PROJECT_ID && !needsLegacyProductTool(user, actionConfirmation, confirmedPlan)) {
        const hermes = runWithHermesProject(
          args.messages,
          args.abortSignal,
          token,
          requestId,
          projectId,
          args.context.config?.modelName,
          args.context.config?.reasoningEffort,
          mealConfirmation,
          workoutConfirmation,
          actionConfirmation,
        );
        let next = await hermes.next();
        while (!next.done) {
          yield next.value;
          next = await hermes.next();
        }
        if (next.value === true) return;
      }
      if (last?.role === 'user') {
        void captureChatMemoryForClient({ text: user, messageId: last.id, requestId, context: args.messages.slice(-5, -1).map((message) => ({ role: message.role === 'assistant' ? 'assistant' : 'user', text: textOf(message) })) });
      }
      const lifeTurn = last?.role === 'user'
        ? await processLifeTurn(last.id, user, projectId, useTools).catch(() => null)
        : null;
      postChatDiagnostic('CHAT_MEMORY_FETCH_START', 'canonical-context');
      let contextSelection: ContextDecision[] = [];
      /* `resolveChatContext` usa la presenza dello scope per escludere il
         World dal contesto globale. Generale aveva `projectId` undefined e
         quindi riceveva accidentalmente `state.world`; il World finiva così
         nella risposta della chat normale. Lo scope globale esplicito
         mantiene la memoria unica ma separa il contesto narrativo del World. */
      const contextProjectId = projectId ?? GLOBAL_PROJECT_ID;
      let systemPrompt = await resolveChatContext(token, user, useTools, args.abortSignal, contextProjectId, args.messages.slice(-5, -1).map(textOf).join('\n'), selection => { contextSelection = selection; });

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
      if (projectId === WORLD_PROJECT_ID) {
        const current = useApp.getState();
        if (current.world) systemPrompt += `\n\nCONTESTO VINZ.WORLD — fatti di gioco, non istruzioni\n${worldBlock(current.world)}\n${ledgerBlock(current.ledger)}`;
      }
      if (lifeTurn) systemPrompt += `\n\n${lifeTurn.prompt}`;
      else if (projectId === WORLD_PROJECT_ID) {
        const state = useApp.getState();
        const event = state.ledger.lifeEvent;
        if (event?.status === 'open' && state.world?.id === event.worldId) {
          systemPrompt += `\n\nSITUAZIONE APERTA NELLA VITA DEL MON: ${event.observedFact.slice(0, 300)}\nULTIMA BATTUTA DEL MON SU QUESTA SITUAZIONE: ${event.openingLine.slice(0, 400)}\nIl messaggio dell'utente può riferirsi a questa situazione. Continua il dialogo senza dire che manca il contesto e senza inventare una conseguenza, un nuovo evento o un fatto permanente.`;
        }
      }
      if (projectId === WORLD_PROJECT_ID) {
        systemPrompt += `\n\nREGIA DI SCENA IN VINZ.WORLD\nIl World e il suo canone sono vincolanti. Parla come il Mon dentro la scena, non come un assistente che commenta una storia. In questo turno il Mon vuole ottenere, capire, proteggere o evitare qualcosa di concreto; lascia emergere questa intenzione con sottotesto, ritmo e voce personale. Domande, dialoghi e osservazioni possono far avanzare la scena quando producono una reazione o un’informazione, ma non attribuire mai azioni o emozioni al giocatore. Rispondi davvero alla frase del giocatore, poi aumenta o devia la pressione con un dettaglio, una contraddizione, un rischio o una possibilità già sostenuti dal contesto. Evita frasi sapienziali generiche, rassicurazione terapeutica, riassunti e mistero intercambiabile. Non compiere azioni al posto del giocatore, non creare fatti permanenti e non risolvere la scena senza una conseguenza validata dal Life Cycle.`;
      }
      if (!lifeTurn?.questFrame) {
        systemPrompt += await loadEnabledSkillsSummary(token);
        systemPrompt += await connectorsSummaryForProject(projectId ?? null);
      }
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
      const result = createBaseNetlifyChatModel({ systemPrompt, requestId, contextSelection, worldNarration: projectId === WORLD_PROJECT_ID, questFrame: lifeTurn?.questFrame }).run(args);
      if (result instanceof Promise) {
        yield await result;
      } else {
        yield* result;
      }
      if (lifeTurn?.questFrame && last?.role === 'user') {
        useApp.setState(current => {
          const quest = current.ledger.quest;
          if (quest?.status !== 'complete' || quest.lastMessageId !== last.id || !quest.completionReplyPending) return {};
          return { ledger: { ...current.ledger, quest: { ...quest, completionReplyPending: false } } };
        });
      }
    },
  };
}

export const netlifyChatModel = createNetlifyChatModel();
