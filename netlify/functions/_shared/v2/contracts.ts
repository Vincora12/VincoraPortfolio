import type { Source, ToolDef, ToolUse, Turn } from '../providers';

export type RunProfile = 'chat' | 'project-chat' | 'lab' | 'automation' | 'inspection' | 'coding';
export type ContextWindow = 16_000 | 32_000;
export type RunStatus = 'queued' | 'assembling-context' | 'running' | 'waiting-approval' | 'completed' | 'failed' | 'cancelled';

export interface RunRequest {
  runId?: string;
  profile: RunProfile;
  input: string;
  conversationId?: string;
  projectId?: string | null;
  turns?: Turn[];
  contextWindow?: ContextWindow;
  modelPreference?: string;
  tools?: ToolDef[];
  /** Caller mode returns structured tool calls without executing them (OpenAI-compatible clients). */
  toolMode?: 'server' | 'caller';
  system?: Array<{ text: string; cache?: boolean }>;
  maxOutputTokens?: number;
  webSearch?: boolean;
}

export interface ContextTraceEntry {
  source: 'identity' | 'request' | 'recent-conversation' | 'active-project' | 'resolved-project' | 'cross-project' | 'global-memory' | 'me' | 'project-file' | 'artifact' | 'tools';
  sourceId?: string;
  selected: boolean;
  reason: string;
  estimatedTokens: number;
  score?: number;
}

export interface RunContext {
  windowTokens: ContextWindow;
  reservedOutputTokens: number;
  inputBudgetTokens: number;
  estimatedInputTokens: number;
  system: Array<{ text: string; cache?: boolean }>;
  trace: ContextTraceEntry[];
  resolvedProjectIds: string[];
}

export interface RunEvent {
  runId: string;
  at: string;
  type: 'created' | 'context-ready' | 'model-started' | 'tool-started' | 'tool-finished' | 'completed' | 'failed' | 'cancelled';
  status: RunStatus;
  toolName?: string;
  error?: string;
}

export interface RunResult {
  runId: string;
  status: Extract<RunStatus, 'completed' | 'failed' | 'cancelled'>;
  text: string;
  model?: string;
  projectId?: string | null;
  toolUses: Array<{ name: string; ok: boolean }>;
  rawToolUses?: ToolUse[];
  sources: Source[];
  usage: { inputTokens?: number; outputTokens?: number; costUsd?: number };
  context: RunContext;
  events: RunEvent[];
  error?: string;
}

export interface ToolExecutionResult {
  id: string;
  content: string;
  isError: boolean;
  metadata?: Record<string, unknown>;
}

export interface ServerTool {
  definition: ToolDef;
  risk: 'read' | 'write' | 'external';
  execute(use: ToolUse, signal?: AbortSignal): Promise<ToolExecutionResult> | ToolExecutionResult;
}

export interface ProjectEvidence {
  id: string;
  title: string;
  instructions?: string;
  context?: string;
  workingState?: {
    goal?: string;
    decisions?: Array<{ text: string; rationale?: string; source?: string }>;
    requirements?: string[];
    constraints?: string[];
    openQuestions?: string[];
    nextSteps?: string[];
    recentState?: string;
    updatedAt?: string;
  };
  artifacts?: Array<{ slug: string; title: string; markdown: string; updatedAt?: string }>;
  files?: Array<{ id: string; name: string; size: number; data?: string }>;
}

export interface MemoryEvidence {
  id: string;
  text: string;
  score?: number;
  source?: string;
}

export interface ContextDomains {
  identity(): Promise<string>;
  listProjects(): Promise<Array<{ id: string; title: string }>>;
  project(id: string): Promise<ProjectEvidence | null>;
  globalMemory(query: string, limit: number): Promise<MemoryEvidence[]>;
  me(query: string, limit: number): Promise<MemoryEvidence[]>;
}
