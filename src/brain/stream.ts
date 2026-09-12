import type { BrainMessage } from './store/types';
import { TOOLS, assistantTurn, resultBlocks, type ToolResult, type ToolUse } from '../ai/tools';
import { CODE_TOOL_DEFS, EXPORT_REPORT_TOOL_DEF, REPO_OPS_TOOL_DEFS, RESTART_SERVICE_TOOL_NAME, buildCapabilitySummary } from '../ai/toolLayer';
import { useApp } from '../state/store';
import { buildVoiceSystemPrompt } from '../ai/voicePrompt';
import { persistChatTrace, recordChatTrace, systemPromptComposition, traceClock, type ChatTrace } from '../ai/chatTrace';
import { voiceCard } from '../engine/voiceCard';
import { resolveChatContext } from '../ai/chatContext';
import { LOCAL_CHEAP_ROUND_SENTINEL } from '../../netlify/functions/_shared/routing';

/* ============================================================================
   🔷 «Riporta la chat a prima.» — e dentro, il problema vero.

   Il percorso SENZA strumenti (`netlify-runtime.ts` → `createBaseNetlifyChatModel`)
   costruiva già il prompt da `buildVoiceSystemPrompt`: il .mon rispondeva in
   carattere. Questo percorso, quello CON gli strumenti — che si accende ogni
   volta che il messaggio tocca dati o azioni, cioè spesso — aveva invece un
   system prompt neutro cablato qui sotto: «a neutral high-quality personal AI
   assistant». Due porte alla stessa chat, una in carattere e una no: da lì
   «Neutro è il grande problema su tutto», non da QUALE schermo la monta.

   🔒 Legge lo stato direttamente da `useApp.getState()`, come già fa
   `savedToken()` qui sopra — nessun parametro in più da far passare per tre
   livelli di componenti. Se non c'è un .mon attivo (VINZ.LAB, che non
   condivide questo salvataggio) resta la stessa riga neutra di sempre: non è
   una regressione, è la stessa condizione che il percorso senza strumenti usa
   già per lo stesso caso. */
function characterVoiceBlock(toolsAvailable = true): { text: string } | null {
  const s = useApp.getState();
  const record = s.activeMonName ? s.mons[s.activeMonName] : undefined;
  if (!record) return null;
  /* 🔒 CINTURA OLTRE LA BRETELLA. Se qualcosa nei dati reali di una
     creatura fa inciampare `buildVoiceSystemPrompt` (un campo che una
     versione più vecchia del salvataggio non aveva ancora), l'errore non
     deve portarsi via l'intera risposta — un .mon che risponde neutro per
     un turno è meglio di un .mon che non risponde affatto. */
  try {
    return {
      text: buildVoiceSystemPrompt(record, s.mood, s.voiceNotes, {
        rating: record.rating ?? null,
        faceRedos: s.faceRedos,
        timeSkipped: s.usedDevTime,
      }, { toolsAvailable }),
    };
  } catch (error) {
    console.warn('[chat] system prompt del personaggio non costruito, torno al neutro:', error);
    return null;
  }
}

export type ChatCost = { costUsd: number; model?: string; traceId?: string };
export type ChatFileInput = { mediaType: string; data: string; filename: string };

function tracePersonality(): ChatTrace['personality'] {
  const state = useApp.getState();
  const record = state.activeMonName ? state.mons[state.activeMonName] : undefined;
  if (!record) return undefined;
  const card = voiceCard(record);
  return {
    monName: record.data.name,
    voicePreset: record.data.voice_preset,
    writingFingerprint: card.fingerprint,
    ...(card.writingStyle?.reactions ? { reactions: card.writingStyle.reactions } : {}),
  };
}

function traceContext(): string[] {
  return useApp.getState().voiceNotes
    .filter((note) => note.status === 'accettata')
    .map((note) => note.text);
}

/** Legge soltanto il token tecnico già salvato dall'app principale. */
export function savedToken(): string | null {
  // An authenticated running app must not depend on a successful cache write.
  const activeToken = useApp.getState().token;
  if (activeToken) return activeToken;
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

  const clock = traceClock();
  const character = characterVoiceBlock(false);
  const system = [
    character ?? {
      text: [
        'You are VINZ.MON, a high-quality general personal AI assistant.',
        'Be accurate, useful, direct and natural. Do not roleplay or simulate emotions or consciousness.',
        'Answer in the language used by the user. When the user writes Italian, use natural Italian.',
        'Prefer concise answers unless detail is useful or requested.',
        'If current information is needed, use web search and distinguish verified facts from inference.',
      ].join(' '),
    },
  ];
  clock.mark('SYSTEM PROMPT', character ? `voce vera · ${character.text.length} caratteri` : 'neutro (nessun .mon attivo)');

  let model: string | null = null;
  let errore: string | null = null;
  let outcome: ChatCost | null = null;
  try {
    clock.mark('RICHIESTA', 'POST /api/ai · capability character-voice');
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
    model = response.headers.get('x-vinz-model');
    if (contentType.includes('application/json')) {
      const body = await response.json() as { text?: string; costUsd?: number; model?: string };
      if (!body.text) throw new Error(image ? 'Non sono riuscito a leggere l’immagine.' : 'La risposta è arrivata vuota.');
      model = body.model ?? null;
      clock.mark('RISPOSTA', model ?? 'modello sconosciuto');
      onChunk(body.text);
      outcome = { costUsd: body.costUsd ?? 0, model: body.model };
      return outcome;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk) onChunk(chunk);
    }
    clock.mark('RISPOSTA', 'stream concluso');
    outcome = { costUsd: 0 };
    return outcome;
  } catch (e) {
    errore = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    const trace: ChatTrace = {
      path: 'diretto',
      characterVoice: Boolean(character),
      systemChars: system.reduce((n, b) => n + b.text.length, 0),
      systemPromptComposition: systemPromptComposition(
        system.map((block) => ({ name: character ? 'CHARACTER VOICE' : 'NEUTRAL ASSISTANT', text: block.text })),
      ),
      model,
      effort: null,
      toolRounds: [],
      totalMs: clock.elapsed(),
      error: errore,
      steps: clock.steps(),
      at: Date.now(),
      personality: tracePersonality(),
      ...(character && traceContext().length
        ? { context: traceContext(), contextKind: 'voice-notes' as const }
        : {}),
    };
    recordChatTrace(trace);
    const traceId = await persistChatTrace(trace);
    if (outcome && traceId) outcome.traceId = traceId;
  }
}

const TOOL_INTENT = /\b(miei dati|mia salute|come sto|\bme\b|dormit\w*|allenat\w*|allenamento|palestra|workout|programma|piano|scheda|calendario|agenda|lista|riepilogo|sezione|blocco|corsa|camminata|mangiat\w*|bevut\w*|pasto|colazione|pranzo|cena|spuntino|merenda|extra|calori\w*|kcal|protein\w*|carbo\w*|grass\w*|macro|peso|dieta|barcode|codice a barre|etichetta|obiettiv\w*|target|corregg\w*|modific\w*|giornat\w*|protocollo|ricordami|promemoria|pagina|aspetto|schermata)\b/i;

/* TOOL LAYER PHASE 1 — riconosce una domanda di ispezione tecnica del
   repository ("puoi leggere il tuo codice?", "dove viene gestito X",
   "quale file gestisce Y", "esiste già una funzione per Z") perché il
   catalogo `TOOL_INTENT` sopra non conosce vocabolario tecnico: senza
   questo, quelle domande cadevano nel percorso SENZA strumenti e il .mon
   poteva solo tirare a indovinare o negare di avere accesso al codice. */
const CODE_INSPECTION_INTENT = /\b(tuo codice|codice sorgente|leggere il (?:tuo )?codice|guarda(?:re)? (?:nel|il) (?:tuo )?codice|cerca(?:re)? nel (?:tuo )?codice|controll\w* (?:nel|il) (?:tuo )?codice|quale file|quali file|che file|file gestisce|dove viene (?:gestit\w*|usat\w*|implementat\w*|chiamat\w*)|esiste (?:gi[aà] )?una funzione|una funzione per|repository|nel tuo repo|source code)\b/i;

/** Usa il Tool Layer (code_search/code_read) solo quando la domanda è
    davvero un'ispezione tecnica — mai per ogni conversazione. */
export function isCodeInspectionIntent(text: string): boolean {
  return CODE_INSPECTION_INTENT.test(text);
}

/* VINZ.MON AUDIT & UNIFICATION — root cause del "non posso": `TOOL_INTENT` e
   `CODE_INSPECTION_INTENT` sopra non conoscono il vocabolario dell'AUDIT
   ("audit", "tool layer", "runtime agentico", "diagnosi", "cosa manca per
   essere un vero agent", "un report da passare ad Astra"...). Una domanda
   come «Fammi un audit del Tool Layer. Controlla realmente il sistema e cita
   le evidenze.» non tocca né dati personali né la sintassi tecnica di
   CODE_INSPECTION_INTENT ("quale file", "dove viene gestito") — cadeva
   quindi nel percorso BASE, senza NESSUNO strumento disponibile: da lì il
   "non posso", non da una vera assenza di capacità. */
const AUDIT_INTENT = /\b(audit\w*|diagnosi|diagnostic\w*|tool\s*layer|runtime\s*agentico|agent\s*loop|cosa\s+manca\s+per\s+essere\s+un\s+vero\s+agent\w*|report\b[^.!?]{0,40}\bastra\b|astra\b[^.!?]{0,40}\breport\b|controll\w*\s+(?:se\s+)?(?:il\s+|la\s+|lo\s+|i\s+)?(?:tuo\s+|tua\s+)?sistema|verific\w*\s+se\s+il\s+runtime|persona\s+viene\s+caricat\w*|narratore|\bnarrator\b)\b/i;

/** Usa il pool di strumenti dell'AUDIT (codice + dati/ME in sola lettura +
    export) quando la domanda chiede esplicitamente un audit/diagnosi del
    sistema stesso — indipendente da CODE_INSPECTION_INTENT/TOOL_INTENT,
    perché un audit vero spesso ha bisogno di ENTRAMBI insieme. */
export function isAuditIntent(text: string): boolean {
  return AUDIT_INTENT.test(text);
}

/* REPO OPS — «mani in più» sul Mac dove gira VINZ.MON: git, test/build/
   typecheck, i log del servizio, lo stato di Local Core/Mem0/Ollama, il
   riavvio. STESSO problema di CODE_INSPECTION_INTENT sopra: senza un
   rilevatore dedicato, "fai girare i test" o "sei online sul mio Mac?" non
   toccano nessun vocabolario esistente e cadono nel percorso senza
   strumenti — da cui un "non posso" non vero. */
const REPO_OPS_INTENT = /\b(git\b|commit\w*|branch\b|\blog\b.{0,20}(?:servizio|core)|servizio.{0,20}\blog\b|esegui\w*\s+.{0,20}\btest\b|lancia\w*\s+.{0,20}\btest\b|fai\w*\s+.{0,20}\btest\b|\bnpm\s+run\b|\btypecheck\b|\blint\b|\bbuild\b.{0,20}(?:progetto|repository|vinz)|(?:local\s*core|mem0|ollama)\b.{0,30}\b(?:online|acceso|spento|funziona|raggiungibile)|\b(?:stato|status)\b.{0,20}(?:servizi|local\s*core|mem0|ollama)|riavvia\w*\s+.{0,20}(?:servizio|local\s*core|vinz)|restart\w*\s+.{0,20}(?:service|local\s*core|vinz))\b/i;

/** Usa il pool REPO OPS (git/npm/log/servizi, `REPO_OPS_TOOL_DEFS`) solo
    quando la domanda riguarda davvero il repository/i servizi sul Mac — mai
    per ogni conversazione tecnica generica (quella resta a CODE_INSPECTION). */
export function isRepoOpsIntent(text: string): boolean {
  return REPO_OPS_INTENT.test(text);
}

/** "Esporta questo audit in TXT" può arrivare come turno successivo, senza
    ripetere vocabolario di audit: un rilevatore separato, più permissivo solo
    sul verbo di esportazione, evita di dover tenere l'intero pool aperto per
    ogni turno della conversazione.

    PRODOTTO — FILE TXT SCARICABILI (2026-09-06): questo rilevatore copriva
    solo l'esportazione di un audit/report già discusso ("dammi"/"fammi" +
    "file"/"txt"). Una richiesta diretta e generica ("creami un txt con
    scritto ciao", "salvami questa risposta come nome.txt") non passava da
    nessun verbo riconosciuto e cadeva nel percorso BASE, senza lo strumento
    `esporta_report` disponibile — da lì il "non ho uno strumento per
    creare... file scaricabile", non da una vera assenza di capacità (lo
    strumento esiste già, vedi `EXPORT_REPORT_TOOL_DEF` in `ai/toolLayer.ts`).
    Aggiunti "crea(mi)"/"salva(mi)"/"genera(mi)"/"scrivi(mi)"/"prepara(mi)"
    come verbi equivalenti, e allargata la distanza dal verbo a "file"/"txt"
    per lasciare spazio a un nome file reale nel mezzo ("...come
    audit_tool_layer.txt"). */
const EXPORT_INTENT = /\b(esport\w*\s+.{0,30}\btxt\b|\btxt\b.{0,30}esport\w*|scaric\w*\s+.{0,20}(?:report|audit|file)|(?:dammi|fammi|crea(?:mi)?|salva(?:mi)?|genera(?:mi)?|scrivi(?:mi)?|prepara(?:mi)?)\s+.{0,80}\b(?:file|txt)\b|report\s+come\s+file)\b/i;

export function isExportIntent(text: string): boolean {
  return EXPORT_INTENT.test(text);
}

export type ChatMealSlot = 'colazione' | 'spuntino' | 'pranzo' | 'merenda' | 'cena' | 'extra';
export type MealConfirmation = {
  status: 'needs-confirmation' | 'confirmed';
  slot: ChatMealSlot;
};
export type WorkoutConfirmation = { status: 'needs-confirmation' | 'confirmed' };

/* ============================================================================
   LE ALTRE AZIONI CHE PASSANO DA UNA CONFERMA

   🔒 STESSA FORMA DI PASTO E ALLENAMENTO, NON UNA SECONDA. La domanda la scrive
   l'app (in coda alla risposta), non il modello: è quello che rende il pulsante
   in chat affidabile invece che un indovinello sulla prosa. Chi aggiunge una
   voce qui deve aggiungere anche la riga corrispondente in `CONFIRM_ACTIONS`
   (components/examples/chatgpt.tsx), altrimenti la domanda compare e il
   pulsante no.

   ⚠️ Queste quattro scrivono nel registro di ME: peso, promemoria, piano e
   dieta. Le CORREZIONI restano fuori apposta — sono già una richiesta
   esplicita, e chiedere conferma a una conferma è solo attrito. */
export type ConfirmableAction = 'peso' | 'promemoria' | 'automazione' | 'piano' | 'dieta' | 'riavvio';
export type ActionConfirmation = { action: ConfirmableAction; status: 'needs-confirmation' | 'confirmed' };

export const CONFIRMABLE_ACTIONS: Record<ConfirmableAction, {
  tool: string;
  question: string;
  hold: string;
  go: string;
}> = {
  peso: {
    tool: 'registra_peso',
    question: 'Confermi che registro questo **peso** in ME?',
    hold: 'Read the weight the user stated and comment on it if useful, but DO NOT call registra_peso and do not ask the final confirmation question. The app will ask it. The weight is NOT stored yet: never say or imply that it was saved. The write tool is intentionally withheld until confirmation: never claim it is unavailable.',
    go: 'The user has just confirmed the weight. Call registra_peso now.',
  },
  promemoria: {
    tool: 'programma_promemoria',
    question: 'Confermi che creo questo **promemoria**?',
    hold: 'Restate the reminder you understood — what, which date and which time, with the timezone — but DO NOT call programma_promemoria and do not ask the final confirmation question. The app will ask it. Nothing is scheduled yet: never say or imply that the reminder exists. If the date or time is not certain, ask for it instead of guessing.',
    go: 'The user has just confirmed the reminder. Call programma_promemoria now with the date and time you restated.',
  },
  automazione: {
    tool: 'crea_automazione',
    question: 'Confermi che creo questa **automazione**?',
    hold: 'Restate the automation you understood — what it will do and at which time, with the timezone — but DO NOT call crea_automazione and do not ask the final confirmation question. The app will ask it. Nothing is scheduled yet: never say or imply that the automation exists. If the time is not certain, ask for it instead of guessing. Say plainly that an automation is read-only: it searches and reports, it cannot record anything in ME.',
    go: 'The user has just confirmed the automation. Call crea_automazione now with the title, description and time you restated.',
  },
  piano: {
    tool: 'imposta_piano_allenamento',
    question: 'Confermi che aggiorno il **piano di allenamento**?',
    hold: 'Show the workout plan exactly as it would become, preserving every day not explicitly changed, but DO NOT call imposta_piano_allenamento and do not ask the final confirmation question. The app will ask it. The plan is NOT updated yet: never say or imply that it was saved.',
    go: 'The user has just confirmed the workout plan change. Call imposta_piano_allenamento now with the plan you showed.',
  },
  dieta: {
    tool: 'imposta_dieta',
    question: 'Confermi che aggiorno la **dieta**?',
    hold: 'Show the diet exactly as it would become, but DO NOT call imposta_dieta and do not ask the final confirmation question. The app will ask it. The diet is NOT updated yet: never say or imply that it was saved.',
    go: 'The user has just confirmed the diet change. Call imposta_dieta now with the diet you showed.',
  },
  riavvio: {
    tool: RESTART_SERVICE_TOOL_NAME,
    question: 'Confermi che riavvio il servizio **Local Core** sul tuo Mac?',
    hold: 'The user is asking to restart the Local Core service. Explain what this does (a brief interruption of the local server, then it comes back), but DO NOT call the restart tool and do not ask the final confirmation question. The app will ask it. Nothing is restarted yet.',
    go: 'The user has just confirmed the restart. Call the restart tool now. After it responds, do not claim the service is already back online — only inspect_local_services can confirm that, and only in a later turn.',
  },
};

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

/* 🔴 LEGGERE UN FILE NON È REGISTRARE. «Leggi il csv degli allenamenti e dimmi
   in che settimana ho corso di più» contiene «ho corso», quindi passava per un
   allenamento da registrare e VINZ offriva il pulsante REGISTRA ALLENAMENTO su
   una domanda che parlava di un CSV. È la stessa regola di sempre — parlare non
   è registrare — applicata a una forma che prima non esisteva. */
/* 🔴 RICORDARE NON È REGISTRARE. «Riprendiamo il discorso su «Registrazione
   allenamento, pasto e peso»» contiene «registrazione» e «pasto», quindi
   passava per un pasto da salvare e VINZ offriva REGISTRA PASTO mentre ti
   stava raccontando cosa vi eravate detti. Chiedere del passato non scrive
   niente nel presente. */
const RECALL_INTENT =
  /\briprendiamo\b|\bcosa\s+(?:avevamo|abbiamo)\b|\b(?:quando|di\s+cosa)\s+(?:abbiamo|avevamo)\s+parlato\b|\bti\s+ricordi\b/i;

const READ_FILE_INTENT =
  /\b(?:leggi|legg\w*|apri|analizz\w*|guard\w*|controll\w*|riassum\w*)\b[^.!?]*\b(?:file|csv|txt|markdown|pdf|documento|allegat\w*)\b/i;

export function isMealLogIntent(text: string): boolean {
  if (READ_FILE_INTENT.test(text) || RECALL_INTENT.test(text)) return false;
  if (isMealCorrectionIntent(text)) return false;
  if (/^\s*(?:cosa|che cosa|quanto|quanti|quante)\b.*\b(?:mangiat\w*|bevut\w*)/i.test(text)) return false;
  if (/\bnon\s+ho\s+(?:mangiato|bevuto)\b/i.test(text)) return false;
  return /\b(?:ho\s+(?:mangiato|bevuto|cenato|pranzato|fatto\s+(?:colazione|merenda|uno\s+spuntino))|(?:mangio|bevo)\b|pasto|colazione|pranzo|cena|spuntino|merenda|snack|registra(?:mi)?\s+(?:questo\s+)?pasto)\b/i.test(text);
}

export function isWorkoutLogIntent(text: string): boolean {
  if (READ_FILE_INTENT.test(text) || RECALL_INTENT.test(text)) return false;
  if (isWorkoutPlanIntent(text)) return false;
  if (/^\s*(?:cosa|che cosa|quanto|quanti|quante)\b.*\b(?:allenat\w*|cors\w*|camminat\w*)/i.test(text)) return false;
  if (/\bnon\s+(?:mi\s+sono\s+allenat\w*|ho\s+fatto\s+(?:allenamento|sport))\b/i.test(text)) return false;
  return /\b(?:mi\s+sono\s+allenat\w*|ho\s+(?:corso|camminato|nuotato|pedalato)|ho\s+fatto\s+[^.!?]*(?:allenamento|palestra|workout|corsa|camminata|cardio|lower|upper)|(?:registra|aggiungi|segna(?:lo)?)\w*\s+[^.!?]*(?:allenament\w*|sport|workout|corsa|camminata)|allenamento\s+(?:completato|fatto)|corsa\s+\d|camminata\s+\d)\b/i.test(text);
}

/** Usa il loop strumenti solo quando la richiesta riguarda dati o azioni locali. */
export function shouldUseLocalTools(text: string): boolean {
  return TOOL_INTENT.test(text) || CODE_INSPECTION_INTENT.test(text) || AUDIT_INTENT.test(text) || EXPORT_INTENT.test(text) || REPO_OPS_INTENT.test(text) || isDailyEnergyIntent(text) || /\b(file|txt|markdown|csv|pdf|allegat\w*|caricat\w*|documento|artifact|progett\w*|sorgent\w*|codice|bmr|tdee|deficit|energia)\b/i.test(text)
    || RECALL_INTENT.test(text);
}

const CORRECTION_INTENT = /\b(?:corregg\w*|rettific\w*|modific\w*|anzi)\b/i;
function isMealCorrectionIntent(text: string): boolean {
  return CORRECTION_INTENT.test(text) && /\b(?:pasto|colazione|pranzo|merenda|cena|spuntino)\b/i.test(text)
    && !/\b(?:piano|programma|dieta|obiettiv\w*)\b/i.test(text);
}

export function isDailyEnergyIntent(text: string): boolean {
  return /\b(?:energia|energy|bmr|tdee|deficit|surplus|netto|bilancio)\b/i.test(text)
    || /\b(?:quante|quanto)\b[^.!?]*\bcalori\w*\b[^.!?]*\b(?:restano|rimangono|resta|rimane|posso)\b/i.test(text)
    || /\bquanto\b[^.!?]*\b(?:dovrei|devo|posso)\b[^.!?]*\bmangiare\b/i.test(text);
}

/** Le registrazioni esplicite non devono dipendere dalla buona volontà del modello. */
export function requiredWriteTool(text: string): string | undefined {
  // A correction must not append another record or enter the new-meal confirmation gate.
  if (CORRECTION_INTENT.test(text)) {
    if (/\b(?:peso|kg)\b/i.test(text)) return 'correggi_ultimo_peso';
    if (isMealCorrectionIntent(text)) return 'correggi_ultimo_pasto';
    if (/\b(?:allenament\w*|corsa|workout|palestra|camminata|nuoto)\b/i.test(text) && !isWorkoutPlanIntent(text)) return 'correggi_ultimo_allenamento';
  }
  if (isWorkoutPlanIntent(text)
    || /\b(?:crea|scrivi|prepara|imposta|fammi|salva|aggiorna)\w*\b[^.!?]*\b(?:piano|programma|scheda)\b[^.!?]*\b(?:allenamento|allenamenti|palestra|workout)\b/i.test(text)
    || /\b(?:piano|programma|scheda)\b[^.!?]*\b(?:allenamento|allenamenti|palestra|workout)\b[^.!?]*\b(?:crea|scrivi|prepara|imposta|fammi|salva|aggiorna)\w*\b/i.test(text)) {
    return 'imposta_piano_allenamento';
  }
  if (/\b(?:peso|sono)\s*(?:oggi\s*)?(?:circa\s*)?\d+(?:[.,]\d+)?\s*kg\b/i.test(text)) {
    if (/\bnon\s+(?:peso|sono)\b/i.test(text)) return undefined;
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
  run: (use: ToolUse) => ToolResult | Promise<ToolResult>,
  voiceModel?: string | null,
  images: { mediaType: string; data: string }[] = [],
  mealConfirmation?: MealConfirmation,
  workoutConfirmation?: WorkoutConfirmation,
  actionConfirmation?: ActionConfirmation,
  files: ChatFileInput[] = [],
  shared?: { contextSelection?: import('../ai/contextSelection').ContextDecision[]; systemPrompt: string; requestId: string; projectId?: string },
  /* 🔷 «Manca il pensiero vero mentre usa gli strumenti.» Questo ciclo era
     l'unica strada per cui NESSUN pensiero vero poteva mai arrivare: sempre
     bloccante (`stream:false`), mai un tubo da cui farlo passare. Ora ogni
     giro apre uno stream vero; `onThinking` porta il ragionamento fuori,
     turno per turno, verso `StatoDelPensiero` — `onChunk` invece resta
     invariato, chiamato una sola volta a fine giro come prima: il testo
     finale passa ancora dalla sostituzione per la conferma pasto/allenamento
     più sotto, che dovrebbe restare intatta. */
  onThinking?: (delta: string) => void,
  /* 🔷 CONTROL ROOM — «FINAL RESPONSE = CLOUD» non è più un'assunzione fissa:
     spento di default (nessuno perde qualità senza averlo scelto), acceso
     dal Control Room fa provare Ollama anche nel giro 0 e nel giro finale,
     con la STESSA rete di sicurezza try/catch già usata per i giri
     intermedi — mai un silenzio se il locale non risponde, sempre
     un'escalation dichiarata al modello scelto dall'utente. */
  finalResponseLocalFirst = false,
): Promise<ChatCost> {
  const token = savedToken();
  if (!token) throw new Error('Prima attiva VINZ.MON: manca il token.');

  const clock = traceClock();
  const workoutPlanContext = isWorkoutPlanIntent(user)
    ? (await run({ id: 'read-workout-plan', name: 'leggi_me', input: { sezione: 'sport' } })).content
    : '';
  /* 🔷 Due blocchi, non uno: il primo dice CHI risponde (il contesto
     canonico risolto da `resolveChatContext`/`shared.systemPrompt` — un solo
     punto condiviso col percorso BASE, vedi netlify-runtime.ts), il secondo
     dice COME usare gli strumenti — regole operative valide a prescindere da
     chi risponde, e per questo restano qui invece di finire dentro
     `buildCoreSystemPrompt`, che non sa niente di pasti o conferme.

     FIX 3 (2026-09-06) — la sintesi delle capacità reali va DENTRO questo
     `character.text`, mai anche nel blocco sotto: quando arriva `shared`
     (il percorso vero di netlify-runtime.ts) lo porta già — calcolato una
     sola volta e condiviso con `createBaseNetlifyChatModel` — e aggiungerlo
     di nuovo qui lo duplicherebbe nello stesso prompt. Il ramo di fallback
     serve solo al chiamante legacy senza `shared` (`brain/Brain.tsx`, non
     più caricato — vedi `assistant-check.mjs`), che altrimenti non lo
     vedrebbe mai. */
  const character = { text: shared?.systemPrompt ?? (await resolveChatContext(token, user, true, signal)) + buildCapabilitySummary(true) };
  /* Calcolati qui (non più sotto, insieme al resto del pool) perché il
     system prompt sotto ne ha bisogno prima ancora di sapere quali
     strumenti saranno disponibili. */
  const isAudit = isAuditIntent(user) && !requiredWriteTool(user) && !mealConfirmation && !workoutConfirmation && !actionConfirmation;
  const wantsExport = (isExportIntent(user) || isAudit) && !requiredWriteTool(user) && !mealConfirmation && !workoutConfirmation && !actionConfirmation;
  const system = [
    character ?? { text: 'You are VINZ.MON, a neutral high-quality personal AI assistant. Answer in the user language.' },
    {
      text: [
        'Use tools whenever the answer depends on personal data or the user asks for an action.',
        'Never claim an action succeeded unless its tool result confirms it. Be concise and natural.',
        'The five fixed meal moments are: colazione, spuntino, pranzo, merenda, cena. Additional food is extra.',
        'Meals and completed workouts must use their dedicated typed tools. Never use gestisci_me as a substitute for registra_pasto or registra_allenamento.',
        images.length
          ? 'The user attached one or more real images. Inspect them directly: never say that you cannot see them. If they show food, identify visible foods, preparation, sauces and a plausible portion; estimate kcal, protein, carbohydrates and fat, clearly marking estimates and asking only for details that materially change the result. Do not invent hidden ingredients. Use all attached images together when one shows the dish and another shows a menu, label or portion reference.'
          : '',
        files.length
          ? 'Read every attached PDF directly. If it is a diet or training plan, summarize it faithfully before proposing any change; distinguish values explicitly written in the document from your own estimates. Never claim that a PDF was unreadable unless the provider actually returns an error.'
          : '',
        mealConfirmation?.status === 'needs-confirmation'
          ? `Analyze the food and estimate nutrition, but DO NOT call registra_pasto and do not ask the final confirmation question. The app will ask whether it is ${mealConfirmation.slot}. The meal is NOT stored yet: never say or imply that it was saved, registered, added or marked. The write tool is intentionally withheld until confirmation: never claim that it is unavailable or that the app cannot save the meal.`
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
        actionConfirmation?.status === 'needs-confirmation'
          ? CONFIRMABLE_ACTIONS[actionConfirmation.action].hold
          : '',
        actionConfirmation?.status === 'confirmed'
          ? CONFIRMABLE_ACTIONS[actionConfirmation.action].go
          : '',
        'The AI may read and update every ME journal field through its dedicated tools: diet, nutrition targets, meals, completed workouts, workout plan, weight and period goal. It may also create, update, remove and reorder safe ME blocks with gestisci_me, including calendars, lists, notes and metrics. Calendar entries must use one item per event formatted as "Lunedì 08:00-09:00 · Title · Details", and belong in DIET or SPORT. Use gestisci_me when the request does not fit a fixed field. Never directly invent or edit VINZ.MON game stats; they are deterministic.',
        workoutPlanContext
          ? `The user is editing the workout schedule. Here is the current ME SPORT data: ${workoutPlanContext}. Preserve every existing day not explicitly changed, then call imposta_piano_allenamento. A weekday request refers to the plan, never to a completed workout.`
          : '',
        isCodeInspectionIntent(user)
          ? 'The user is asking a technical question about your own real source code/repository. Use code_search to find real files and code_read to actually read them before answering — never claim a file path, function name or implementation detail you have not actually retrieved through these tools. If a search returns no results or a read fails, say inspection found nothing or failed — never invent evidence.'
          : '',
        isRepoOpsIntent(user) || actionConfirmation?.action === 'riavvio'
          ? 'The user is asking about the real git repository, running tests/build/typecheck, reading VINZ.MON\'s own service logs, or the status of Local Core/Mem0/Ollama on their Mac — or asking to restart the Local Core service. These tools (git_status, git_diff, git_log, git_branch, git_show, repo_list, repo_write, repo_edit, esegui_test, esegui_build, esegui_typecheck, esegui_typecheck_funzioni, leggi_log_vinzmon, stato_servizi_locali, and the restart tool) only work when you are actually running on the Local Core Server on the user\'s Mac — if a call reports it is not available there, say so plainly, never pretend it worked. Never claim a git status, a test result, a log line or a service state you have not actually retrieved through these tools. The restart tool requires the user\'s explicit confirmation first; after it responds "restart started" is not the same as "back online" — only stato_servizi_locali in a later turn can confirm that.'
          : '',
        isAudit
          ? 'The user is asking for a real AUDIT of yourself (a subsystem or your whole system: tool layer, memory, persona, agent loop, ME...). This must be a grounded audit, never a generic or invented answer, and never "I cannot" when you have the tools to check. Use code_search/code_read to inspect the real repository for the subsystem in question (e.g. tool layer: src/ai/tools.ts, src/ai/toolLayer.ts, netlify/functions/code-tools.ts, src/brain/stream.ts; memory/ME: src/state/store.ts and its ME/journal fields; agent loop: src/brain/stream.ts replyWithLocalTools, netlify/functions/agent-lab.ts). Use leggi_me/leggi_i_miei_dati when the audit is about live ME/personal data, not source code. Structure the answer as TITLE / SCOPE / EXECUTIVE SUMMARY / CAPABILITY MATRIX (capability, status EXISTS or PARTIAL or MISSING or BROKEN, evidence with real file/path, risk, recommended action) / DETAILED FINDINGS / ROOT CAUSES / RECOMMENDED NEXT STEPS. Clearly separate FACT (verified via a tool) from INFERENCE (your reasoning) from RECOMMENDATION. If a capability genuinely does not exist, say so plainly — never claim it does.'
          : '',
        wantsExport
          ? 'The user wants a real downloadable ".txt" file — this can be an audit/report, but just as often it is any other text they asked for: a short note ("creami un txt con scritto ciao"), this reply saved under a name they gave ("salvami questa risposta come nome.txt"), or a longer piece of writing. Call esporta_report with the exact requested text as "contenuto" — for a full audit/report use the COMPLETE text, never a shortened summary; for a short explicit text (e.g. "scritto ciao") contenuto is exactly that text, verbatim, nothing added or embellished — and a short "titolo" (used to name the file; if the user gave an explicit filename, use it as the titolo). The exported text must be self-sufficient: readable and usable without depending on this conversation. Its tool_result starts with "SUCCESSO" and a "FILE: <name>" line when the download really happened, or starts with "EXPORT FALLITO" when it did not. Only say the file was created, and only cite that exact filename, after reading a "SUCCESSO" tool_result — if you see "EXPORT FALLITO" or get no tool_result at all, say plainly that the export failed or is missing, never assume success.'
          : '',
      ].join(' '),
    },
  ];
  clock.mark('SYSTEM PROMPT', character ? `voce vera · ${character.text.length} caratteri` : 'neutro (nessun .mon attivo)');
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
  const toolRounds: string[][] = [];
  let errore: string | null = null;
  let outcome: ChatCost | null = null;
  /* Il backend accetta al massimo 12 strumenti per richiesta. Quelli salute
     sono in testa al catalogo; il limite evita che una frase come «ho
     mangiato una banana» venga rifiutata prima ancora che il modello la legga. */
  const healthToolNames = new Set([
    'leggi_i_miei_dati', 'leggi_me', 'registra_pasto', 'correggi_ultimo_pasto',
    'registra_allenamento', 'correggi_ultimo_allenamento', 'registra_peso',
    'correggi_ultimo_peso', 'imposta_dieta', 'imposta_piano_allenamento', 'imposta_obiettivi_nutrizionali', 'gestisci_me',
    'calcola_energia_giornaliera',
  ]);
  /* ⚠️ UNA CONFERMA IN ATTESA BATTE LA SCRITTURA FORZATA. `requiredWriteTool`
     esiste per portare dritti allo strumento giusto; se però quella stessa
     azione sta aspettando un sì, forzarla adesso scriverebbe prima che tu abbia
     confermato — esattamente ciò che il pulsante serve a evitare. */
  const explicitWrite = actionConfirmation?.status === 'needs-confirmation'
    ? undefined
    : requiredWriteTool(user);
  const energyRequest = isDailyEnergyIntent(user);
  const isHealthRequest = Boolean(explicitWrite) || energyRequest
    || /\b(me|salute|pasto|mangiat\w*|bevut\w*|colazione|spuntino|pranzo|merenda|cena|extra|calori\w*|protein\w*|carbo\w*|grass\w*|macro|diet\w*|allenament\w*|allenat\w*|palestra|workout|corsa|camminata|peso|kg|obiettiv\w*)\b/i.test(user)
    || Boolean(mealConfirmation || workoutConfirmation || actionConfirmation);
  const projectTools = new Set(['leggi_progetto', 'leggi_sorgente_progetto', 'disegna_sezione_me', 'imposta_obiettivo_progetto']);
  /* 🔷 A differenza di `projectTools` (mai su Generale — leggono/scrivono
     istruzioni e contesto di un progetto vero), la cartella di lavoro esiste
     anche su Generale (`~/VinzMon/generale/`): niente esclusione forzata sotto,
     solo un'inclusione automatica quando c'è un progetto, più il trigger a
     parole chiave (`fileRequest`/`workspaceRequest`) che la copre ovunque. */
  const WORKSPACE_TOOL_NAMES = ['vedi_cartella_lavoro', 'leggi_file_lavoro', 'leggi_documento_lavoro', 'scrivi_file_lavoro', 'cancella_file_lavoro'];
  const reminderRequest = /\b(promemori\w*|ricordami|ricorda|reminder|domani)\b/i.test(user);
  /* Il pool si taglia a 12: senza una priorità, gli strumenti della cartella
     di lavoro possono restare fuori proprio nel turno in cui l'utente chiede
     di un file. */
  const fileRequest = /\b(file|allegat\w*|caricat\w*|csv|txt|markdown|pdf|documento)\b/i.test(user);
  const recallRequest = RECALL_INTENT.test(user);
  /* Stessa ragione di fileRequest/recallRequest: senza una priorità propria
     questi tre finiscono in coda al catalogo e lo slice(0,12) qui sotto li
     taglia via proprio nel turno in cui servirebbero. */
  const calendarRequest = /\b(calendari\w*|agenda|impegn\w*|appuntament\w*)\b/i.test(user);
  const vaultRequest = /\b(secondo cervello|second brain|obsidian|vault)\b/i.test(user);
  const icloudRequest = /\bicloud\b/i.test(user);
  const workspaceRequest = /\b(tua cartella|cartella di lavoro|workspace|organizza\w*|salva (questo|nella tua cartella))\b/i.test(user);
  const connectorRequest = /\b(connettor\w*|integrazion\w*)\b/i.test(user);
  /* ⚠️ «Cancella anche "Test frontmatter"» non contiene «skill»: un giro
     basato solo sul messaggio di adesso perde `gestisci_skill_locale` proprio
     nel turno che chiude una skill appena creata/discussa — stesso guaio del
     «sì» senza parola chiave sopra. Qui, a differenza di quei casi, non c'è
     un `shared?.projectId` da appoggiarci: si guarda anche l'ultimo scambio
     (non solo l'ultima frase) prima di arrendersi. */
  const skillRequest = /\bskill\w*\b/i.test(`${turns.slice(-4).map((t) => t.content).join(' ')} ${user}`);
  const htmlSurfaceRequest = /\b(canvas|sketch|animazion\w*|arte generativa|generative art|p5\.js|interattiv\w*|mini.?gioco|superficie html|disegn\w+ (qualcosa|un|una) (interattiv\w*|animazion\w*))\b/i.test(`${turns.slice(-4).map((t) => t.content).join(' ')} ${user}`);
  const driveRequest = /\b(drive|documento\w*|foglio di calcolo|presentazione|slide)\b/i.test(user);
  const emailRequest = /\b(email|e-mail|mail|gmail|posta)\b/i.test(user);
  /* ⚠️ L'ELENCO ICONE CONDIVIDE PAROLE COL FILTRO SALUTE («salute», «peso»,
     «sport»…): «cambia l'icona in salute» finirebbe scartato dal pool insieme
     a tutto il resto non-salute proprio per la parola che nomina l'icona. */
  const iconRequest = /\bicon[ae]\b/i.test(user);
  /* 🔷 REPO OPS — git/npm/log/servizi (`REPO_OPS_TOOL_DEFS`, ai/toolLayer.ts).
     Stesso posto di CODE_INSPECTION_INTENT: una richiesta tecnica sul Mac
     sostituisce l'intero pool invece di infilarsi nel ramo salute/non-salute,
     che di questo vocabolario non sa nulla. `restartConfirmationActive`
     copre ANCHE il giro di conferma del riavvio: `actionConfirmation` reso
     verità fa scattare `isHealthRequest` (riga sotto), quindi senza questo
     ramo dedicato il pool salute vincerebbe e riavvia_servizio_vinzmon (che
     vive qui, non in TOOLS) sparirebbe anche da confermato. */
  const repoOpsRequest = isRepoOpsIntent(user);
  const restartConfirmationActive = actionConfirmation?.action === 'riavvio';
  const basePool = isAudit ? [...CODE_TOOL_DEFS, ...TOOLS.filter(tool => tool.name === 'leggi_me' || tool.name === 'leggi_i_miei_dati')]
    : restartConfirmationActive ? REPO_OPS_TOOL_DEFS
    : isCodeInspectionIntent(user) && !isHealthRequest ? CODE_TOOL_DEFS
    : repoOpsRequest && !isHealthRequest ? REPO_OPS_TOOL_DEFS
    : TOOLS.filter((tool) => (reminderRequest && tool.name === 'programma_promemoria')
    /* ⚠️ I FILE NON SONO UN ARGOMENTO «SALUTE» O «NON SALUTE». Chiedere «leggi
       il csv degli allenamenti» finisce nel ramo salute per via della parola
       allenamenti, e lì la cartella di lavoro non c'è: la risposta diventava
       «non riesco a leggere quel CSV». Attraversa la divisione, come il
       promemoria. */
    || (fileRequest && WORKSPACE_TOOL_NAMES.includes(tool.name))
    /* Come i file: cercare nel passato non è un argomento «salute» o no. */
    || (recallRequest && tool.name === 'cerca_conversazione')
    || (calendarRequest && tool.name === 'leggi_calendario_google')
    || (vaultRequest && tool.name === 'cerca_secondo_cervello')
    || (icloudRequest && tool.name === 'cerca_icloud')
    || (connectorRequest && tool.name === 'chiama_connettore_personalizzato')
    || (skillRequest && (tool.name === 'leggi_skill' || tool.name === 'gestisci_skill_locale'))
    || (driveRequest && (tool.name === 'cerca_drive' || tool.name === 'leggi_file_drive'))
    || (emailRequest && tool.name === 'cerca_email')
    || (iconRequest && tool.name === 'cambia_icona_progetto')
    || (htmlSurfaceRequest && tool.name === 'mostra_superficie_html')
    /* ⚠️ IL SÌ NON CONTIENE PIÙ LA PAROLA CHIAVE. «Vai, crea» non fa scattare
       `reminderRequest`, quindi al giro della conferma lo strumento sarebbe
       sparito dal pool e il modello avrebbe risposto «non posso» dopo che
       l'utente aveva appena detto di sì. Finché una conferma è in corso, il suo
       strumento resta disponibile: a trattenerlo prima del sì ci pensa il
       filtro qui sotto, non l'assenza dal pool. */
    || (actionConfirmation && tool.name === CONFIRMABLE_ACTIONS[actionConfirmation.action].tool)
    || (shared?.projectId && projectTools.has(tool.name))
    || (isHealthRequest ? healthToolNames.has(tool.name) : !healthToolNames.has(tool.name) || tool.name === 'leggi_i_miei_dati'));
  const toolPool = wantsExport ? [...basePool, EXPORT_REPORT_TOOL_DEF] : basePool;
  const availableTools = toolPool.filter((tool) => shared?.projectId || !projectTools.has(tool.name))
    .sort((a, b) => {
      const priority = (name: string) => name === explicitWrite
        || (name === 'registra_pasto' && mealConfirmation?.status === 'confirmed')
        || (name === 'registra_allenamento' && workoutConfirmation?.status === 'confirmed')
        || (actionConfirmation?.status === 'confirmed' && name === CONFIRMABLE_ACTIONS[actionConfirmation.action].tool) ? 4
        : energyRequest && name === 'calcola_energia_giornaliera' ? 3
        : reminderRequest && name === 'programma_promemoria' ? 3
        : fileRequest && WORKSPACE_TOOL_NAMES.includes(name) ? 3
        : recallRequest && name === 'cerca_conversazione' ? 3
        : calendarRequest && name === 'leggi_calendario_google' ? 3
        : vaultRequest && name === 'cerca_secondo_cervello' ? 3
        : icloudRequest && name === 'cerca_icloud' ? 3
        : workspaceRequest && WORKSPACE_TOOL_NAMES.includes(name) ? 3
        : connectorRequest && name === 'chiama_connettore_personalizzato' ? 3
        : skillRequest && (name === 'leggi_skill' || name === 'gestisci_skill_locale') ? 3
        : driveRequest && (name === 'cerca_drive' || name === 'leggi_file_drive') ? 3
        : emailRequest && name === 'cerca_email' ? 3
        : iconRequest && name === 'cambia_icona_progetto' ? 3
        : htmlSurfaceRequest && name === 'mostra_superficie_html' ? 3
        /* 🔷 «È nella tua cartella, ma dove stai cercando tu?» — trovato dal
           vivo: "aggiorna business plan" non contiene nessuna delle parole
           chiave sopra (file/pdf/documento/cartella...), quindi
           vedi_cartella_lavoro restava a priorità 0 mentre leggi_progetto/
           scrivi_artifact_progetto (le "Pagine", un sistema tutto diverso)
           avevano già la priorità 2 SOLO per essere dentro un progetto. Col
           tetto di 12 strumenti, le Pagine vincevano sempre il posto e VINZ
           finiva sempre lì — non per una descrizione sbagliata, per un pool
           strutturalmente sbilanciato verso le Pagine. Stessa priorità di
           base per entrambi: chi vince è la parola chiave, non la sorte. */
        : shared?.projectId && (projectTools.has(name) || WORKSPACE_TOOL_NAMES.includes(name)) ? 2 : 0;
      return priority(b.name) - priority(a.name);
    }).filter((tool) => {
    if (tool.name === 'registra_pasto') return mealConfirmation?.status === 'confirmed';
    if (tool.name === 'registra_allenamento') return workoutConfirmation?.status === 'confirmed';
    if (tool.name === 'gestisci_me' && mealConfirmation) return false;
    if (actionConfirmation && tool.name === CONFIRMABLE_ACTIONS[actionConfirmation.action].tool) {
      return actionConfirmation.status === 'confirmed';
    }
    if (tool.name === 'correggi_ultimo_pasto' && mealConfirmation?.status === 'needs-confirmation') return false;
    if (tool.name === 'correggi_ultimo_allenamento' && workoutConfirmation?.status === 'needs-confirmation') return false;
    return true;
  }).slice(0, 12);
  const forcedWrite = mealConfirmation?.status === 'confirmed'
    ? 'registra_pasto'
    : workoutConfirmation?.status === 'confirmed'
      ? 'registra_allenamento'
    : explicitWrite;

  /* Un audit reale spesso ha bisogno di raccogliere prove in PIÙ passaggi:
     cerca, legge un file, magari ne legge un altro o continua uno troncato,
     e solo allora sintetizza (ed eventualmente esporta). Il tetto di 4 round
     di ogni altra richiesta lascerebbe l'ultimo round senza strumenti
     (`round < maxRounds - 1`) troppo presto per un audit con export.

     🔷 «Fai delle tab per vedere tutto il business plan» — trovato dal vivo:
     leggi_progetto (round 1) + due disegna_sezione_me riuscite (round 2-3)
     riempivano già tutti e 4 i round di un turno normale, lasciando l'ultimo
     — quello SENZA strumenti, apposta — a dover dire onestamente "non ho più
     il comando" per la terza tab richiesta. Non un'allucinazione: il turno
     finiva i round prima di finire il lavoro. Il lavoro multi-passo di un
     progetto (leggi, poi crea più cose) merita lo stesso spazio di un audit,
     non meno. */
  const maxRounds = isAudit || Boolean(shared?.projectId) ? 8 : 4;

  /* 🔷 «Se un file è già nella cartella, deve essere sempre consultabile.»
     `leggi_documento_lavoro` non risponde con testo (vedi ToolResult.attachment
     in ai/tools.ts): il documento vero va allegato al giro SUCCESSIVO come se
     l'utente lo avesse appena mandato in chat. `images`/`files` restano gli
     allegati arrivati con il messaggio; queste copie mutabili si arricchiscono
     quando un tool ne pesca uno nuovo dalla cartella di lavoro. */
  let liveImages = images;
  let liveFiles = files;

  /* 🔷 «Risolviamo anche i giri intermedi: un modello economico invece del
     modello scelto per ogni giro.» Nessuno LEGGE il testo dei giri che
     decidono solo quale strumento chiamare — a leggerlo è solo la risposta
     che chiude il turno.

     🔷 «Mettiamolo per i giri intermedi» — il modello locale su Ollama
     (`LOCAL_CHEAP_ROUND_SENTINEL`, vedi routing.ts: il nome vero del modello
     resta deciso dal server, mai libero dal client) costa zero, non 1/25 di
     Sol. Va usato SOLO per quei giri intermedi, mai per il primo (spesso
     l'unico, e allora è già la risposta vera) né per l'ultimo forzato.

     🔒 IL LOCALE PUÒ MANCARE — Ollama spento, modello non scaricato, Mac che
     dorme — e un giro fallito non deve rompere l'intero turno: se il giro
     economico locale fallisce (rete/errore), si ripete lo STESSO giro su
     GPT-5.6 Luna (25 volte meno di Sol, ma sempre disponibile) prima di
     arrendersi. Se anche un giro economico (locale o di riserva) decide di
     chiudere senza altri strumenti, quel testo NON è la risposta finale
     vera: si rifà la STESSA richiesta col modello scelto e `tools: []`, così
     quello che l'utente legge resta sempre scritto dal modello che ha
     scelto lui, mai da quello economico. */
  const CHEAP_ROUND_FALLBACK_MODEL = 'gpt-5.6-luna';

  const baseRoundBody = (modelOverride: string | null | undefined, toolsForRound: typeof availableTools, toolChoiceForRound?: string) => ({
    capability: 'character-voice',
    requestId: shared?.requestId,
    voiceModel: modelOverride,
    thinking: true,
    system,
    turns: history,
    user: currentUser,
    /* 🔷 «Mando un pdf e poi dice che non ce l'ha più.» Prima si
       mandavano foto/pdf SOLO al round 0: appena il primo giro
       chiamava uno strumento (comunissimo — VINZ usa tool per quasi
       tutto), il round successivo perdeva il file per sempre, anche
       se la richiesta è la STESSA identica del turno in corso. Costa
       ripetere gli stessi byte a ogni giro, ma perdere il documento a
       metà di un turno che lo sta ancora leggendo è peggio. */
    ...(liveImages.length ? { images: liveImages } : {}),
    ...(liveFiles.length ? { files: liveFiles } : {}),
    ...(userBlocks ? { userBlocks } : {}),
    tools: toolsForRound,
    ...(toolChoiceForRound ? { toolChoice: toolChoiceForRound } : {}),
    webSearch: true,
    maxTokens: 2000,
  });

  /* 🔷 «Se lo streaming non è disponibile, semplicemente non lo vediamo.»
     Grok e Kimi non sanno fare streaming (`ai.ts` li rifiuta con 400): prima
     quel rifiuto tecnico finiva dritto in chat come testo rosso. Non è un
     errore da mostrare, è solo un modo diverso di ottenere la stessa
     risposta — si ripete lo STESSO giro in blocco (`stream:false`, la
     stessa strada di sempre per chi non sa fare streaming) invece di
     arrendersi. Il pensiero live sparisce per quel giro (il bloccante non
     lo porta), il resto è identico. */
  const runRoundBlocking = async (
    modelOverride: string | null | undefined,
    toolsForRound: typeof availableTools,
    toolChoiceForRound?: string,
  ): Promise<{ text: string; uses: ToolUse[]; roundCostUsd: number; roundModel?: string }> => {
    const response = await fetch('/api/ai', {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...baseRoundBody(modelOverride, toolsForRound, toolChoiceForRound), stream: false }),
    });
    const body = await response.json().catch(() => null) as {
      text?: string; toolUses?: ToolUse[]; model?: string; costUsd?: number; error?: string; reason?: string;
    } | null;
    if (!response.ok || !body) {
      throw new Error(body?.reason ?? body?.error ?? `Richiesta fallita (${response.status}).`);
    }
    return { text: body.text ?? '', uses: body.toolUses ?? [], roundCostUsd: body.costUsd ?? 0, roundModel: body.model };
  };

  const runRound = async (
    modelOverride: string | null | undefined,
    toolsForRound: typeof availableTools,
    toolChoiceForRound?: string,
  ): Promise<{ text: string; uses: ToolUse[]; roundCostUsd: number; roundModel?: string }> => {
    const response = await fetch('/api/ai', {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...baseRoundBody(modelOverride, toolsForRound, toolChoiceForRound), stream: true }),
    });
    if (!response.ok || !response.body) {
      const detail = await response.json().catch(() => null) as { error?: string; reason?: string } | null;
      if (detail?.error === 'streaming non disponibile per questo modello') {
        return runRoundBlocking(modelOverride, toolsForRound, toolChoiceForRound);
      }
      throw new Error(detail?.reason ?? detail?.error ?? `Richiesta fallita (${response.status}).`);
    }

    /* Consuma lo stream di QUESTO giro: il testo non va a `onChunk` mano a
       mano (sotto lo aspetta ancora la sostituzione per la conferma
       pasto/allenamento, che ha bisogno del testo completo), solo il
       pensiero è veramente live. */
    let text = '';
    let uses: ToolUse[] = [];
    let roundCostUsd = 0;
    let roundModel: string | undefined;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const records = buffer.split('\n\n');
      buffer = records.pop() ?? '';
      for (const record of records) {
        const line = record.split('\n').find((item) => item.startsWith('data: '));
        if (!line) continue;
        const event = JSON.parse(line.slice(6)) as {
          type?: string;
          delta?: string;
          model?: string;
          costUsd?: number;
          toolUses?: ToolUse[];
          message?: string;
        };
        if (event.type === 'thinking_delta' && event.delta) onThinking?.(event.delta);
        if (event.type === 'answer_delta' && event.delta) text += event.delta;
        if (event.type === 'answer_completed') {
          roundModel = event.model;
          roundCostUsd = event.costUsd ?? 0;
          uses = event.toolUses ?? [];
        }
        if (event.type === 'error') throw new Error(event.message ?? 'Errore nello stream.');
      }
      if (done) break;
    }
    return { text, uses, roundCostUsd, roundModel };
  };

  try {
    const completed = new Map<string, ToolResult>();
    for (let round = 0; round < maxRounds; round++) {
      signal.throwIfAborted();
      const isForcedFinalRound = round === maxRounds - 1;
      const useCheapModel = round > 0 && !isForcedFinalRound;
      /* 🔷 LOCAL-FIRST — un modello locale (Ollama/Qwen) ragiona peggio su un
         menu di 12 strumenti che su uno di 6: stesso elenco già ordinato per
         priorità (il `.sort()` sopra), solo un tetto più stretto per i giri
         che vanno lì. Il giro cloud (round 0, il finale forzato, e il
         fallback su errore locale sopra) non è toccato. */
      const toolsForRound = isForcedFinalRound ? [] : useCheapModel ? availableTools.slice(0, 6) : availableTools;
      clock.mark(`ROUND ${round + 1}`, `POST /api/ai · ${toolsForRound.length} strumenti disponibili${useCheapModel ? ' · modello economico' : ''}`);

      const toolChoiceForRound = round === 0 && (forcedWrite || energyRequest) ? (forcedWrite ?? 'calcola_energia_giornaliera') : undefined;
      /* Solo i giri che altrimenti userebbero direttamente il modello scelto
         (giro 0, giro finale forzato): i giri intermedi già provano il
         locale via `useCheapModel` sopra, non serve una seconda strada. */
      const wantsLocalFirstFinal = finalResponseLocalFirst && !useCheapModel;
      let { text, uses, roundCostUsd, roundModel } = useCheapModel
        ? await runRound(LOCAL_CHEAP_ROUND_SENTINEL, toolsForRound, toolChoiceForRound).catch(() => {
            /* Il fallback torna al cloud: stesso tetto di 12 strumenti degli
               altri giri cloud, non quello ristretto pensato per il locale. */
            clock.mark(`ROUND ${round + 1} — LOCALE NON DISPONIBILE`, 'passo a GPT-5.6 Luna per questo giro');
            return runRound(CHEAP_ROUND_FALLBACK_MODEL, availableTools, toolChoiceForRound);
          })
        : wantsLocalFirstFinal
          ? await runRound(LOCAL_CHEAP_ROUND_SENTINEL, toolsForRound, toolChoiceForRound).catch(() => {
              clock.mark(`ROUND ${round + 1} — LOCALE NON DISPONIBILE`, 'passo al modello scelto per questo giro');
              return runRound(voiceModel, toolsForRound, toolChoiceForRound);
            })
          : await runRound(voiceModel, toolsForRound, toolChoiceForRound);
      totalCostUsd += roundCostUsd;
      lastModel = roundModel ?? lastModel;

      if (uses.length === 0 && useCheapModel) {
        clock.mark(`ROUND ${round + 1} — RIFATTO`, 'il modello economico ha chiuso: rifaccio col modello scelto');
        const redo = await runRound(voiceModel, []);
        totalCostUsd += redo.roundCostUsd;
        lastModel = redo.roundModel ?? lastModel;
        text = redo.text;
        uses = redo.uses;
      }

      if (uses.length === 0) {
        clock.mark(`ROUND ${round + 1} — TESTO`, lastModel ?? 'modello sconosciuto');
        /* 🔷 Trovato testando `mostra_superficie_html`: il giro di CHIUSURA,
           quello dopo che uno strumento ha già fatto il suo lavoro vero,
           qualche volta torna vuoto (pochi token, né testo né altro
           strumento) — non il primo giro, quello che chiama lo strumento,
           che infatti funzionava. Buttare via l'intero turno con un errore
           a questo punto perderebbe anche il lavoro già riuscito (compresa
           la superficie html appena generata, che vive solo nei metadata di
           QUESTO turno): meglio un «Fatto.» onesto — non finto, il lavoro è
           davvero successo — che un errore che lo nasconde. Solo qui, non al
           primo giro: lì un vuoto resta un vuoto vero, senza niente da
           salvare. */
        if (!text.trim()) {
          if (toolRounds.length > 0) {
            onChunk('Fatto.');
            outcome = { costUsd: totalCostUsd, model: lastModel };
            return outcome;
          }
          throw new Error('La risposta è arrivata vuota.');
        }
        const safeText = mealConfirmation?.status === 'needs-confirmation'
          && /\b(?:segnat|registrat|salvat|aggiunt)\w*/i.test(text)
          ? 'Ho capito cosa hai mangiato. Non è ancora registrato.'
          : text.trim();
        const confirmation = mealConfirmation?.status === 'needs-confirmation'
          ? `\n\nConfermi che lo registro come **${mealConfirmation.slot === 'extra' ? 'extra / spuntino aggiuntivo' : mealConfirmation.slot}**?`
          : workoutConfirmation?.status === 'needs-confirmation'
            ? '\n\nConfermi che registro questo **allenamento** in ME?'
          : actionConfirmation?.status === 'needs-confirmation'
            ? `\n\n${CONFIRMABLE_ACTIONS[actionConfirmation.action].question}`
          : '';
        onChunk(`${safeText}${confirmation}`);
        outcome = { costUsd: totalCostUsd, model: lastModel };
        return outcome;
      }

      toolRounds.push(uses.map((u) => u.name));
      clock.mark(`ROUND ${round + 1} — STRUMENTI`, uses.map((u) => u.name).join(', '));

      if (round === 0 && currentUser) history.push({ role: 'user', content: currentUser });
      /* Il risultato dell'ultimo giro era stato inviato come `userBlocks`,
         fuori dalla cronologia. Se il modello chiede un ALTRO strumento,
         quel risultato deve diventare parte stabile del dialogo prima di
         aggiungere la nuova function call. Altrimenti il giro successivo
         contiene la prima `function_call` ma soltanto l'ultimo
         `function_call_output`, e OpenAI lo rifiuta con «No tool output found
         for function call …». */
      if (userBlocks?.length) {
        history.push({ role: 'user', content: userBlocks });
      }
      history.push(assistantTurn(text, uses) as { role: 'assistant'; content: unknown });
      const toolResults: ToolResult[] = [];
      for (const use of uses) {
        signal.throwIfAborted();
        if (!availableTools.some((tool) => tool.name === use.name) || round === maxRounds - 1) {
          toolResults.push({ id: use.id, isError: true, content: 'Tool not available or not authorized in this turn. No action performed.' });
          continue;
        }
        let result = completed.get(use.id);
        if (!result) {
          const input = typeof use.input === 'object' && use.input ? use.input as Record<string, unknown> : {};
          try { result = await run(use.name === 'registra_pasto' && mealConfirmation?.status === 'confirmed'
            ? { ...use, input: { ...input, pasto: mealConfirmation.slot } } : use); }
          catch { result = { id: use.id, isError: true, content: 'Tool failed. Success is not confirmed; do not repeat a write automatically.' }; }
          completed.set(use.id, result);
        }
        if (result.attachment) {
          if (result.attachment.mediaType === 'application/pdf') {
            liveFiles = [...liveFiles, { mediaType: result.attachment.mediaType, data: result.attachment.data, filename: result.attachment.filename ?? 'documento.pdf' }].slice(-2);
          } else {
            liveImages = [...liveImages, { mediaType: result.attachment.mediaType, data: result.attachment.data }].slice(-4);
          }
        }
        toolResults.push(result);
      }

      /* Una scrittura imposta e riuscita è già la verità finale. Prima la
         rimandavamo al provider per farla riformulare: quel secondo giro poteva
         rifiutare il function_call_output e mostrare un errore anche DOPO aver
         salvato correttamente in ME. Chiudiamo invece il turno sul risultato
         reale dello strumento: niente falso «non ho accesso al diario». */
      if (forcedWrite && uses.some((use) => use.name === forcedWrite)) {
        const failed = toolResults.find((result) => result.isError);
        if (failed) throw new Error(failed.content);
        const confirmation = ({
          registra_pasto: 'Pasto registrato in ME.',
          registra_allenamento: 'Allenamento registrato in ME.',
          registra_peso: 'Peso aggiornato in ME.',
          correggi_ultimo_pasto: 'Pasto corretto in ME.',
          correggi_ultimo_allenamento: 'Allenamento corretto in ME.',
          correggi_ultimo_peso: 'Peso corretto in ME.',
          imposta_dieta: 'Piano alimentare aggiornato in ME.',
          imposta_piano_allenamento: 'Piano di allenamento aggiornato in ME.',
          imposta_obiettivi_nutrizionali: 'Obiettivi nutrizionali aggiornati in ME.',
          gestisci_me: 'ME aggiornato.',
          /* Un'automazione e un promemoria non stanno in ME: senza queste due
             righe il fallback avrebbe risposto «ME aggiornato» a una cosa che
             ME non l'ha toccato. */
          crea_automazione: 'Automazione creata.',
          programma_promemoria: 'Promemoria aggiornato.',
        } as Record<string, string>)[forcedWrite] ?? 'ME aggiornato.';
        onChunk(confirmation);
        outcome = { costUsd: totalCostUsd, model: lastModel };
        return outcome;
      }

      userBlocks = resultBlocks(toolResults);
      currentUser = '';
    }

    throw new Error('La richiesta ha usato troppi passaggi. Prova a dividerla in due.');
  } catch (e) {
    errore = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    const trace: ChatTrace = {
      contextSelection: shared?.contextSelection,
      path: 'strumenti',
      characterVoice: Boolean(character),
      systemChars: system.reduce((n, b) => n + b.text.length, 0),
      systemPromptComposition: systemPromptComposition(system.map((block, index) => ({
        name: index === 0
          ? (character ? 'CHARACTER VOICE' : 'NEUTRAL ASSISTANT')
          : 'TOOL POLICY',
        text: block.text,
      }))),
      model: lastModel ?? null,
      effort: 'none',
      toolRounds,
      totalMs: clock.elapsed(),
      error: errore,
      steps: clock.steps(),
      at: Date.now(),
      personality: tracePersonality(),
      ...(character && traceContext().length
        ? { context: traceContext(), contextKind: 'voice-notes' as const }
        : {}),
    };
    recordChatTrace(trace);
    const traceId = await persistChatTrace(trace);
    if (outcome && traceId) outcome.traceId = traceId;
  }
}
