import type { RunProfile, ServerTool } from './contracts';

export type Capability = 'data-read' | 'data-write' | 'workspace-read' | 'workspace-write' | 'git-inspect' | 'git-commit' | 'git-push' | 'shell-allowlisted' | 'network-allowlisted' | 'dependency-install' | 'service-control' | 'secret-use' | 'browser-observe' | 'browser-act';

const PROFILE_CAPABILITIES: Record<RunProfile, ReadonlySet<Capability>> = {
  chat: new Set(['data-read', 'network-allowlisted']),
  'project-chat': new Set(['data-read', 'network-allowlisted']),
  lab: new Set(['data-read', 'workspace-read', 'git-inspect']),
  inspection: new Set(['data-read', 'workspace-read', 'git-inspect']),
  automation: new Set(['data-read', 'network-allowlisted']),
  coding: new Set(['workspace-read', 'git-inspect']),
};

export function toolCapability(tool: ServerTool): Capability {
  if (tool.risk === 'external') return 'network-allowlisted';
  return tool.risk === 'write' ? 'data-write' : 'data-read';
}

export function mayExecuteTool(profile: RunProfile, tool: ServerTool): boolean {
  return PROFILE_CAPABILITIES[profile].has(toolCapability(tool));
}

export function capabilitiesFor(profile: RunProfile): Capability[] {
  return [...PROFILE_CAPABILITIES[profile]];
}
