/* ============================================================================
   V2 ISSUE CAPTURE — VINZ.MON PROTOTYPE V1 → V2

   VINZ.MON è ora ufficialmente un prototipo (docs/PROTOTYPE_V1_STATUS.md).
   I problemi che scopriamo usandolo non devono più diventare inviti a
   rifattorizzare V1: diventano requisiti registrati per la ricostruzione
   pulita, V2. Questo modulo è il riconoscimento dell'intento — «questa cosa
   va segnata per la versione finale» — separato da tutto il resto della
   Chat, apposta: non tocca Composer, promozione, first-turn, ownership del
   thread. Vive nello stesso punto dove `netlify-runtime.ts` già intercetta
   un altro intento deterministico (`isImageCreationIntent`), prima che il
   messaggio arrivi al modello o al loop degli strumenti.

   🔒 QUESTA NON È: Mem0, cronologia della Chat, Runtime Log, localStorage,
   bug reporting automatico. È conoscenza di prodotto — cosa deve fare V2 —
   e l'utente decide cosa vale la pena registrare, non un errore a caso.

   Deterministico apposta (regex, nessuna chiamata AI): la spec vieta
   esplicitamente di spendere un modello anche solo economico per capire
   «segna per la V2 che X». */

export type V2IssueArea =
  | 'CHAT' | 'MEMORY' | 'ME' | 'MON' | 'WORLD' | 'NARRATIVE' | 'PROGRESSION'
  | 'STORAGE' | 'AI' | 'LAB' | 'UI' | 'PERFORMANCE' | 'COST' | 'OTHER';

export type V2IssueType =
  | 'BUG' | 'UX' | 'ARCHITECTURE' | 'FEATURE' | 'PERFORMANCE' | 'COST' | 'OTHER';

export interface V2Issue {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  area: V2IssueArea;
  type: V2IssueType;
  observation: string;
  expectedBehavior?: string;
  finalRequirement?: string;
  status: 'OPEN' | 'CLOSED';
}

/** Il pezzo che rende chiaro "questo è per la versione finale", non per ora. */
const V2_TARGET = String.raw`(?:\bv2\b|versione\s+final\w*|versione\s+definitiv\w*|prodotto\s+final\w*)`;

/**
 * Non basta nominare "v2": "Quando esce la v2?" è una domanda, non un
 * appunto da registrare. Serve o un verbo di annotazione vicino al
 * bersaglio ("segna... per la v2"), o il bersaglio seguito da una frase che
 * descrive un difetto/requisito ("...nella v2 va sistemata").
 */
const V2_ISSUE_INTENT = new RegExp(
  String.raw`\b(?:segna(?:t\w*)?|ricordati|ricorda|annota\w*|tieni\s+nota|registra(?:lo)?)\b[^.!?]*${V2_TARGET}` +
  '|' +
  `${V2_TARGET}[^.!?]*\\b(?:va\\s+sistemat\\w*|va\\s+risolt\\w*|va\\s+corrett\\w*|non\\s+deve\\s+funzionare|deve\\s+funzionare\\s+divers\\w*|deve\\s+cambiare|voglio\\s+che|dovr[aà]\\s+\\w+)\\b`,
  'i',
);

export function isV2IssueIntent(text: string): boolean {
  return V2_ISSUE_INTENT.test(text);
}

const AREA_KEYWORDS: [RegExp, V2IssueArea][] = [
  [/\bchat\b|messagg\w*|conversazion\w*|composer/i, 'CHAT'],
  [/memori\w*|\bricord\w*|mem0/i, 'MEMORY'],
  [/\bme\b|\bpast\w*|allenament\w*|\bdieta\b|\bpeso\b|nutrizional\w*/i, 'ME'],
  [/\bmon\b|\.mon\b|creatura/i, 'MON'],
  [/\bworld\b|\bmondo\b|canone/i, 'WORLD'],
  [/narrat\w*|\bstoria\b/i, 'NARRATIVE'],
  [/progression\w*|\bsync\b|\blivell\w*/i, 'PROGRESSION'],
  [/storage|salvataggio|localstorage|\bblob\w*/i, 'STORAGE'],
  [/\bai\b|modello|prompt|routing/i, 'AI'],
  [/\blab\b/i, 'LAB'],
  [/\bui\b|interfaccia|schermata|pulsante|bottone/i, 'UI'],
  [/lent\w*|performance|velocit\w*/i, 'PERFORMANCE'],
  [/\bcost\w*|spesa|prezzo/i, 'COST'],
];

function classifyArea(text: string): V2IssueArea {
  for (const [pattern, area] of AREA_KEYWORDS) {
    if (pattern.test(text)) return area;
  }
  return 'OTHER';
}

const TYPE_KEYWORDS: [RegExp, V2IssueType][] = [
  [/\bbug\b|errore\w*|si rompe|non funziona\w*|sparisc\w*|\bcrash\w*/i, 'BUG'],
  [/\bux\b|esperienza|confus\w*|scomod\w*/i, 'UX'],
  [/architettur\w*|\brefactor\w*|riscritt\w*/i, 'ARCHITECTURE'],
  [/funzionalit\w*|\bfeature\b|aggiungere|vorrei che ci fosse/i, 'FEATURE'],
  [/lent\w*|performance/i, 'PERFORMANCE'],
  [/\bcost\w*|spesa/i, 'COST'],
];

function classifyType(text: string): V2IssueType {
  for (const [pattern, type] of TYPE_KEYWORDS) {
    if (pattern.test(text)) return type;
  }
  return 'OTHER';
}

/** Toglie la parte che dice "questo va registrato" e tiene solo il problema. */
function extractObservation(rawText: string): string {
  const trimmed = rawText.trim();
  const afterChe = /\bche\b\s+(.+)/i.exec(trimmed);
  if (afterChe && afterChe[1].trim().length > 6) {
    return afterChe[1].trim().replace(/[.!?]+$/, '');
  }
  const strippedPrefix = trimmed.replace(
    new RegExp(`^.*?${V2_TARGET}[^,:]*[,:]?\\s*`, 'i'),
    '',
  ).trim();
  const candidate = strippedPrefix.length > 6 ? strippedPrefix : trimmed;
  return candidate.replace(/[.!?]+$/, '');
}

function capitalizeFirst(text: string): string {
  return text.length > 0 ? text[0]!.toUpperCase() + text.slice(1) : text;
}

const TITLE_MAX = 90;

/** Estrae titolo/area/tipo/osservazione da un messaggio con intento V2 già
 * confermato — nessuna chiamata AI, solo parole chiave. */
export function classifyV2Issue(rawText: string): {
  title: string;
  area: V2IssueArea;
  type: V2IssueType;
  observation: string;
} {
  const observation = capitalizeFirst(extractObservation(rawText));
  const title = observation.length > TITLE_MAX
    ? `${observation.slice(0, TITLE_MAX - 1).trimEnd()}…`
    : observation;
  return {
    title,
    area: classifyArea(rawText),
    type: classifyType(rawText),
    observation,
  };
}

/** Testo deterministico della conferma — mai un "segnato" prima di sapere
 * se il salvataggio è davvero riuscito. Usato da runV2IssueCapture
 * (netlify-runtime.ts) e testato direttamente in verify:v2-issues. */
export function v2IssueConfirmationText(
  outcome:
    | { ok: true; issue: { id: string; title: string }; merged: boolean }
    | { ok: false },
): string {
  if (!outcome.ok) return 'Non sono riuscito a salvarlo per la V2 — riprova tra poco.';
  const verb = outcome.merged ? 'Aggiornato' : 'Segnato';
  return `${verb} per la V2 (${outcome.issue.id}): ${outcome.issue.title}.`;
}

/** Stessa normalizzazione usata lato server per il confronto di
 * deduplicazione — duplicata (non condivisa via import) perché il client
 * la usa solo per un'anteprima best-effort, mai per decidere davvero: la
 * decisione vive nel server, unica fonte di verità sull'elenco. */
export function normalizeV2Title(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
