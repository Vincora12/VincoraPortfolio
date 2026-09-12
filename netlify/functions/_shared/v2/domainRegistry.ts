export const DOMAIN_BOUNDARIES = Object.freeze({
  identity: { owner: 'VINZ.MON Core', source: 'vinzmon-state', role: 'canonical' },
  persona: { owner: 'VINZ.MON Core', source: 'vinzmon-state/mon', role: 'canonical' },
  memory: { owner: 'PersonalMemoryDomain', source: 'core/memory', role: 'canonical-with-reconciliation-gate' },
  me: { owner: 'ME projection', source: 'machines/me + PersonalMemoryDomain', role: 'derived' },
  projects: { owner: 'ProjectDomain', source: 'vinzmon-projects', role: 'canonical' },
  projectFiles: { owner: 'ProjectFileDomain', source: 'filesystem-bytes + SQLite metadata', role: 'v2-opt-in-until-migrated' },
  artifacts: { owner: 'ProjectDomain', source: 'project artifacts', role: 'canonical' },
  conversations: { owner: 'ConversationDomain', source: 'assistant thread storage + brain store', role: 'compatibility' },
  calendar: { owner: 'CalendarDomain', source: 'calendar store', role: 'canonical' },
  automations: { owner: 'AutomationDomain', source: 'vinzmon-automations', role: 'canonical' },
  gameNarrative: { owner: 'GameDomain', source: 'vinzmon-state', role: 'canonical-deterministic' },
  approvals: { owner: 'RunPolicy', source: 'explicit client confirmation', role: 'canonical' },
  auditRuns: { owner: 'RunDomain', source: 'vinzmon-runs + runtime log', role: 'canonical' },
});

export type ProductDomain = keyof typeof DOMAIN_BOUNDARIES;
