/* ============================================================================
   CEREBRO — the runtime-agnostic WORK interface (vNext Step 9)

   CEREBRO is a ROLE, not a product: the executor MON CORE delegates
   autonomous multi-step WORK to. Hermes is implementation v1
   (`../v2/hermesAdapter.ts`); a future runtime implements this same
   interface and nothing else in VINZ.MON changes.

   VINZ.MON keeps ownership of everything around the work: it decides the
   mode (MON CORE), resolves the Project and workspace, assembles the context
   package, chooses the model (model gateway), issues permits for structured
   writes (actionPermits), exposes its tools (manifest + MCP bridge), records
   spend, sends push, and holds personal memory. A CEREBRO runtime owns only
   the execution session: planning, tool use, retries, continuity of a task.

   This module is pure types plus the small registry that picks the active
   runtime. It has no Hermes-specific names.
   ========================================================================= */
import type { Turn } from '../providers';

/** A model VINZ.MON chose for this work (see modelGateway.resolveWorkModel). */
export interface CerebroModel { model: string; provider?: string; location: 'local' | 'cloud' }

/** The work package MON CORE hands to CEREBRO. */
export interface CerebroWorkRequest {
  /** Turn id: correlates decision, permit, events, spend and trace. */
  requestId: string;
  projectId: string;
  projectName: string;
  /** Absolute workspace path, resolved by VINZ.MON (never by the client). */
  workspaceRoot: string;
  /** Session continuity key: one conversation ↔ one runtime session. */
  conversationId: string;
  input: string;
  /** The context package VINZ assembled (identity, memory, Project, ME…). */
  systemPrompt: string;
  turns: Turn[];
  /** Runtime-native model/provider ids, already translated by the adapter from VINZ's choice. */
  model?: string;
  provider?: string;
  effort?: 'low' | 'medium' | 'high';
  /** What structured writes (if any) are authorised in this turn and under which permit. */
  actionPolicy?: string;
}

export interface CerebroContextUsage { usedTokens: number; maxTokens: number; percent: number; estimated?: boolean }
export interface CerebroWorkspaceFile { path: string; size: number }
export interface CerebroTimings {
  requestReceivedMs: number;
  runStartedMs?: number;
  firstEventMs?: number;
  firstTextDeltaMs?: number;
  firstToolEventMs?: number;
  completedMs?: number;
}

/**
 * Real operational events only — never reasoning text. `decision` is
 * emitted by VINZ.MON (not by the runtime) before delegation.
 */
export type CerebroEvent =
  | { type: 'decision'; runId: string; mode: 'WORK'; executor: 'cerebro'; contextItems: number; skills: number; at: string }
  | { type: 'status'; runId: string; status: 'starting' | 'running' | 'completed' | 'cancelled'; at: string }
  | { type: 'progress'; runId: string; message: string; at: string }
  | { type: 'text_delta'; runId: string; delta: string; at: string }
  | { type: 'tool_started'; runId: string; tool: string; preview?: string; at: string }
  | { type: 'tool_progress'; runId: string; tool: string; preview?: string; at: string }
  | { type: 'tool_completed'; runId: string; tool: string; durationMs?: number; error?: boolean; at: string }
  /** The runtime asked for an approval; under `approvalPolicy: 'deny'` VINZ has already refused it. */
  | { type: 'approval_required'; runId: string; requestId?: string; reason?: string; at: string }
  | { type: 'final'; runId: string; text: string; model?: string; usage?: Record<string, number>; costUsd?: number; timings: CerebroTimings; files?: CerebroWorkspaceFile[]; at: string }
  | { type: 'error'; runId: string; message: string; at: string }
  | { type: 'context'; runId: string; hermes?: CerebroContextUsage; vinz?: CerebroContextUsage; at: string };

/**
 * `deny`: every runtime-side approval request is refused (v1 policy — VINZ's
 * own confirmations/permits are the only way to authorise writes).
 * `ask`: reserved for a runtime that can suspend and resume on a VINZ
 * confirmation; no runtime implements it yet.
 */
export type CerebroApprovalPolicy = 'deny' | 'ask';

export interface CerebroRuntime {
  /** Stable id for logs and traces (e.g. 'hermes'). */
  readonly id: string;
  readonly approvalPolicy: CerebroApprovalPolicy;
  /** Null when the runtime is not enabled; throws when enabled but misconfigured. */
  configured(): CerebroConfig | null;
  /** The ownership boundary is in place (no runtime-owned personal memory). */
  boundaryConfirmed(): boolean;
  /** The workspace VINZ resolved is one this runtime is scoped to. */
  assertWorkspace(config: CerebroConfig, workspaceRoot: string): void;
  /** Translate VINZ's provider id to the runtime's own, or null if it cannot run it. */
  providerFor(provider: string | undefined): string | null;
  run(config: CerebroConfig, request: CerebroWorkRequest, signal?: AbortSignal): AsyncGenerator<CerebroEvent>;
  cancel(config: CerebroConfig, runId: string): Promise<boolean>;
  /** Forget VINZ's pointer to the runtime session for one conversation. */
  resetSession(projectId: string, conversationId: string): Promise<void>;
}

/** Runtime configuration as VINZ.MON sees it. */
export interface CerebroConfig { workspaceRoot: string; model: string }
