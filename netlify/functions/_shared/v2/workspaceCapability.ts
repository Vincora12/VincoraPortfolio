import { listProjectFiles, readProjectFile, searchProjectFiles, TEXT_EXTENSIONS } from '../agentLabFiles';
import { gitBranch, gitDiff, gitLog, gitShow, gitStatus, inspectLocalServices, readVinzmonLogs, repoEdit, repoWrite, runNpmScript } from '../repoOps';

export type WorkspaceOperation =
  | { op: 'list'; path?: string }
  | { op: 'search'; query: string; path?: string }
  | { op: 'read'; path: string; startLine?: number; endLine?: number }
  | { op: 'write'; path: string; content: string }
  | { op: 'edit'; path: string; oldText: string; newText: string }
  | { op: 'git-status' | 'git-branch' }
  | { op: 'git-diff'; path?: string }
  | { op: 'git-log'; limit?: number }
  | { op: 'git-show'; ref: string }
  | { op: 'npm-script'; name: string }
  | { op: 'logs'; which: 'service' | 'service-error' }
  | { op: 'services' };

export const WORKSPACE_POLICY = Object.freeze({
  allowedRoots: ['src', 'netlify', 'docs', 'server', 'scripts'],
  allowedExtensions: [...TEXT_EXTENSIONS],
  denied: ['secrets', 'environment-values', 'arbitrary-shell', 'dependency-install', 'push', 'service-control'],
  npmScripts: ['test', 'build', 'typecheck', 'typecheck:functions'],
});

/** One typed dispatcher over the existing confinement and fixed-command implementations. */
export async function executeWorkspaceOperation(operation: WorkspaceOperation): Promise<unknown> {
  switch (operation.op) {
    case 'list': return listProjectFiles(operation.path);
    case 'search': return searchProjectFiles(operation.query, operation.path);
    case 'read': return readProjectFile(operation.path, { startLine: operation.startLine, endLine: operation.endLine });
    case 'write': return repoWrite(operation.path, operation.content);
    case 'edit': return repoEdit(operation.path, operation.oldText, operation.newText);
    case 'git-status': return gitStatus();
    case 'git-branch': return gitBranch();
    case 'git-diff': return gitDiff(operation.path);
    case 'git-log': return gitLog(operation.limit);
    case 'git-show': return gitShow(operation.ref);
    case 'npm-script': return runNpmScript(operation.name);
    case 'logs': return readVinzmonLogs(operation.which);
    case 'services': return inspectLocalServices();
  }
}
