import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

export interface CodingTask {
  id: string;
  objective: string;
  repositoryRoot: string;
  worktreeRoot: string;
  allowedPaths: string[];
  testCommands: string[];
  createdAt: string;
}

export interface CodingWorkerResult {
  taskId: string;
  status: 'completed' | 'failed' | 'blocked';
  diff?: string;
  tests?: Array<{ command: string; ok: boolean; output: string }>;
  error?: string;
}

export interface CodingWorker {
  id: string;
  run(task: Readonly<CodingTask>, signal: AbortSignal): Promise<CodingWorkerResult>;
}

export function createCodingTask(input: Omit<CodingTask, 'id' | 'createdAt'>): Readonly<CodingTask> {
  if (!input.objective.trim() || input.objective.length > 8_000) throw new Error('Invalid coding objective.');
  if (!isAbsolute(input.repositoryRoot) || !isAbsolute(input.worktreeRoot)) throw new Error('Repository and worktree roots must be absolute.');
  const repositoryRoot = resolve(input.repositoryRoot);
  const worktreeRoot = resolve(input.worktreeRoot);
  if (repositoryRoot === worktreeRoot || !existsSync(worktreeRoot)) throw new Error('A disposable, existing Git worktree is required.');
  const task: CodingTask = { ...input, repositoryRoot, worktreeRoot, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  return Object.freeze({ ...task, allowedPaths: Object.freeze([...task.allowedPaths]) as unknown as string[], testCommands: Object.freeze([...task.testCommands]) as unknown as string[] });
}

export async function runCodingWorker(worker: CodingWorker, task: Readonly<CodingTask>, signal = new AbortController().signal): Promise<CodingWorkerResult> {
  if (!task.worktreeRoot || task.worktreeRoot === task.repositoryRoot) return { taskId: task.id, status: 'blocked', error: 'Coding worker requires a disposable worktree.' };
  return worker.run(task, signal);
}

/** OpenCode is optional. No shell fallback is created when the binary/sandbox contract is absent. */
export function openCodeAvailability(commandPath?: string): { available: boolean; reason: string } {
  return commandPath && isAbsolute(commandPath) && existsSync(commandPath)
    ? { available: true, reason: 'OpenCode binary found; an explicit restricted adapter is still required before execution.' }
    : { available: false, reason: 'OpenCode is not installed or no absolute binary path was provided.' };
}
