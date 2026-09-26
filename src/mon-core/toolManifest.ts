/* ============================================================================
   CANONICAL TOOL / CAPABILITY MANIFEST (vNext Step 8)

   ONE list of every tool VINZ.MON can put in front of a model, with the
   policy that governs it: read/write classification, which executor runs it,
   which confirmation it needs, which modes may offer it. Executors keep their
   own implementations (they run in different places with different
   authority — browser state, Local Core filesystem, Agent Lab, the CEREBRO
   MCP bridge); the manifest is what they all agree on.

   Pure data, no imports: used by the browser orchestrator, /api/ai (rejects
   tools that are not declared here), the permit service, the run engine and
   the MCP bridge checks. Adding a tool anywhere without adding it here fails
   `verify:vnext-tools`.
   ========================================================================= */

export type ToolRisk = 'read' | 'write' | 'external' | 'destructive';
/** Where a tool executes. */
export type ToolExecutor =
  | 'browser'      // src/ai/tools.ts runTool / executeRuntimeTool (browser-authoritative state)
  | 'local-core'   // src/ai/toolLayer.ts → /api/code-tools, /api/repo-ops (Mac only for writes)
  | 'lab'          // netlify/functions/agent-lab.ts (read-only inspection)
  | 'mcp'          // CEREBRO bridge: scripts/hermes-vinz-mcp-server.mjs → /api/hermes-tools
  | 'structured';  // structured-output schema, never executed (healthEstimate)
/**
 * `app-question`: the app appends a fixed question and the tool is withheld
 * until the user's yes (brain/stream.ts CONFIRMABLE_ACTIONS / meal/workout).
 * `permit`: additionally the server executes it only with a one-shot/limited
 * permit issued after verifying that yes (_shared/actionPermits.ts).
 */
export type ToolConfirmation = 'none' | 'app-question' | 'permit';
export type ToolDomain = 'me-journal' | 'pages' | 'project' | 'workspace' | 'repo' | 'connector' | 'skills' | 'system' | 'memory' | 'look' | 'automation' | 'world' | 'export';

export interface ToolSpec {
  name: string;
  risk: ToolRisk;
  domain: ToolDomain;
  executor: ToolExecutor;
  confirmation: ToolConfirmation;
  /** The exact question the app asks, when confirmation is required. */
  question?: string;
  /** Modes that may offer the tool (ANSWER never offers tools). */
  modes: Array<'ACTION' | 'WORK'>;
}

const A = ['ACTION'] as Array<'ACTION' | 'WORK'>;
const AW = ['ACTION', 'WORK'] as Array<'ACTION' | 'WORK'>;
const t = (name: string, risk: ToolRisk, domain: ToolDomain, executor: ToolExecutor, confirmation: ToolConfirmation = 'none', extra: Partial<ToolSpec> = {}): ToolSpec =>
  ({ name, risk, domain, executor, confirmation, modes: A, ...extra });

/** The confirmation questions, verbatim — the app, the button row and the permit check read them from here. */
export const CONFIRMATION_QUESTIONS = {
  pasto: /Confermi che lo registro come \*\*(?:colazione|spuntino|pranzo|merenda|cena|extra)(?:\s*\/[^*]+)?\*\*\?/i,
  allenamento: 'Confermi che registro questo **allenamento** in ME?',
  peso: 'Confermi che registro questo **peso** in ME?',
  promemoria: 'Confermi che creo questo **promemoria**?',
  automazione: 'Confermi che creo questa **automazione**?',
  piano: 'Confermi che aggiorno il **piano di allenamento**?',
  dieta: 'Confermi che aggiorno la **dieta**?',
  riavvio: 'Confermi che riavvio il servizio **Local Core** sul tuo Mac?',
  codice: 'Confermi che modifico il **codice** del repository?',
} as const;

export const TOOL_MANIFEST: readonly ToolSpec[] = Object.freeze([
  // ── ME journal (browser-authoritative) ───────────────────────────────────
  t('leggi_i_miei_dati', 'read', 'me-journal', 'browser'),
  t('leggi_me', 'read', 'me-journal', 'browser'),
  t('calcola_energia_giornaliera', 'read', 'me-journal', 'browser'),
  t('registra_pasto', 'write', 'me-journal', 'browser', 'app-question'),
  t('registra_allenamento', 'write', 'me-journal', 'browser', 'app-question', { question: CONFIRMATION_QUESTIONS.allenamento }),
  t('registra_peso', 'write', 'me-journal', 'browser', 'app-question', { question: CONFIRMATION_QUESTIONS.peso }),
  t('correggi_ultimo_pasto', 'write', 'me-journal', 'browser'),
  t('correggi_ultimo_allenamento', 'write', 'me-journal', 'browser'),
  t('correggi_ultimo_peso', 'write', 'me-journal', 'browser'),
  t('imposta_dieta', 'write', 'me-journal', 'browser', 'app-question', { question: CONFIRMATION_QUESTIONS.dieta }),
  t('imposta_piano_allenamento', 'write', 'me-journal', 'browser', 'app-question', { question: CONFIRMATION_QUESTIONS.piano }),
  t('imposta_obiettivi_nutrizionali', 'write', 'me-journal', 'browser'),
  t('gestisci_me', 'write', 'me-journal', 'browser'),
  // ── Pages / look / screen / memory (browser) ─────────────────────────────
  t('elenca_le_pagine', 'read', 'pages', 'browser'),
  t('leggi_una_pagina', 'read', 'pages', 'browser'),
  t('scrivi_una_pagina', 'write', 'pages', 'browser'),
  t('aggiorna_una_pagina', 'write', 'pages', 'browser'),
  t('guarda_aspetto', 'read', 'look', 'browser'),
  t('cambia_aspetto', 'write', 'look', 'browser'),
  t('guarda_schermata', 'read', 'look', 'browser'),
  t('cambia_schermata', 'write', 'look', 'browser'),
  t('mostra_superficie_html', 'write', 'look', 'browser'),
  t('ricorda_di', 'write', 'memory', 'browser'),
  t('cerca_conversazione', 'read', 'memory', 'browser'),
  t('registra_scoperta', 'write', 'world', 'browser'),
  // ── Automation (browser → server APIs) ───────────────────────────────────
  t('programma_promemoria', 'write', 'automation', 'browser', 'app-question', { question: CONFIRMATION_QUESTIONS.promemoria }),
  t('crea_automazione', 'write', 'automation', 'browser', 'app-question', { question: CONFIRMATION_QUESTIONS.automazione }),
  // ── Projects / workspace ─────────────────────────────────────────────────
  t('leggi_progetto', 'read', 'project', 'browser', 'none', { modes: AW }),
  t('leggi_sorgente_progetto', 'read', 'project', 'browser', 'none', { modes: AW }),
  t('crea_file_testo', 'write', 'project', 'browser'),
  t('cambia_icona_progetto', 'write', 'project', 'browser'),
  t('disegna_sezione_me', 'write', 'project', 'browser'),
  t('imposta_obiettivo_progetto', 'write', 'project', 'browser'),
  t('vedi_cartella_lavoro', 'read', 'workspace', 'browser', 'none', { modes: AW }),
  t('leggi_file_lavoro', 'read', 'workspace', 'browser', 'none', { modes: AW }),
  t('leggi_documento_lavoro', 'read', 'workspace', 'browser', 'none', { modes: AW }),
  t('scrivi_file_lavoro', 'write', 'workspace', 'browser'),
  t('cancella_file_lavoro', 'destructive', 'workspace', 'browser'),
  // ── Connectors (external, read) ──────────────────────────────────────────
  t('leggi_calendario_google', 'external', 'connector', 'browser'),
  t('cerca_drive', 'external', 'connector', 'browser'),
  t('leggi_file_drive', 'external', 'connector', 'browser'),
  t('cerca_email', 'external', 'connector', 'browser'),
  t('cerca_secondo_cervello', 'external', 'connector', 'browser'),
  t('cerca_icloud', 'external', 'connector', 'browser'),
  t('chiama_connettore_personalizzato', 'external', 'connector', 'browser'),
  // ── Skills (VINZ-owned catalog) ──────────────────────────────────────────
  t('leggi_skill', 'read', 'skills', 'browser'),
  t('gestisci_skill_locale', 'write', 'skills', 'browser'),
  // ── Repository / system (Local Core) ─────────────────────────────────────
  t('code_search', 'read', 'repo', 'local-core'),
  t('code_read', 'read', 'repo', 'local-core'),
  t('repo_list', 'read', 'repo', 'local-core'),
  t('git_status', 'read', 'repo', 'local-core'),
  t('git_diff', 'read', 'repo', 'local-core'),
  t('git_log', 'read', 'repo', 'local-core'),
  t('git_branch', 'read', 'repo', 'local-core'),
  t('git_show', 'read', 'repo', 'local-core'),
  t('esegui_test', 'read', 'repo', 'local-core'),
  t('esegui_build', 'read', 'repo', 'local-core'),
  t('esegui_typecheck', 'read', 'repo', 'local-core'),
  t('esegui_typecheck_funzioni', 'read', 'repo', 'local-core'),
  t('leggi_log_vinzmon', 'read', 'system', 'local-core'),
  t('stato_servizi_locali', 'read', 'system', 'local-core'),
  t('repo_write', 'write', 'repo', 'local-core', 'permit', { question: CONFIRMATION_QUESTIONS.codice }),
  t('repo_edit', 'write', 'repo', 'local-core', 'permit', { question: CONFIRMATION_QUESTIONS.codice }),
  t('riavvia_servizio_vinzmon', 'destructive', 'system', 'local-core', 'app-question', { question: CONFIRMATION_QUESTIONS.riavvio }),
  t('esporta_report', 'read', 'export', 'browser'),
  // ── Agent Lab (read-only inspection) ─────────────────────────────────────
  t('list_files', 'read', 'repo', 'lab'),
  t('read_file', 'read', 'repo', 'lab'),
  t('search_files', 'read', 'repo', 'lab'),
  t('export_report', 'read', 'export', 'lab'),
  t('propose_ui_change', 'read', 'repo', 'lab'),
  // ── CEREBRO bridge (MCP) ─────────────────────────────────────────────────
  t('vinz_leggi_me', 'read', 'me-journal', 'mcp', 'none', { modes: ['WORK'] }),
  t('vinz_registra_pasto', 'write', 'me-journal', 'mcp', 'permit', { modes: ['WORK'] }),
  t('vinz_registra_allenamento', 'write', 'me-journal', 'mcp', 'permit', { modes: ['WORK'], question: CONFIRMATION_QUESTIONS.allenamento }),
  t('vinz_registra_peso', 'write', 'me-journal', 'mcp', 'permit', { modes: ['WORK'], question: CONFIRMATION_QUESTIONS.peso }),
  // ── Structured-output schemas (never executed) ───────────────────────────
  t('stima_pasto_sync', 'read', 'me-journal', 'structured'),
  t('stima_allenamento_sync', 'read', 'me-journal', 'structured'),
]);

const BY_NAME = new Map(TOOL_MANIFEST.map((spec) => [spec.name, spec]));

export function toolSpec(name: string): ToolSpec | undefined {
  return BY_NAME.get(name);
}

/** Tools a model may be offered through /api/ai (the browser + Local Core executors and structured schemas). */
export function isModelOfferableTool(name: string): boolean {
  const spec = BY_NAME.get(name);
  return Boolean(spec && (spec.executor === 'browser' || spec.executor === 'local-core' || spec.executor === 'structured'));
}

/** Server-side risk for the run engine's ServerTool adapter. */
export function serverToolRisk(name: string): 'read' | 'write' | 'external' {
  const risk = BY_NAME.get(name)?.risk ?? 'write';
  return risk === 'destructive' ? 'write' : risk;
}

export function requiresPermit(name: string): boolean {
  return BY_NAME.get(name)?.confirmation === 'permit';
}
