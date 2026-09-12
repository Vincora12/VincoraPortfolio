import type { ContextDomains, ContextTraceEntry, ContextWindow, ProjectEvidence, RunContext } from './contracts';

const STOP = new Set('a ad al alla alle anche che chi con cosa da dal dalla delle di e ed è essere gli ha hai hanno ho i il in io la le lo ma mi ne nel nella non o per più quale quando questa questo se sei si sono su sul tra un una uno usare use where what when the this that from with were was we you your'.split(' '));
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const terms = (text: string) => new Set((normalize(text).match(/[a-z0-9]{3,}/g) ?? []).filter((word) => !STOP.has(word)));
const estimateTokens = (text: string) => Math.ceil(text.length / 4);
const capText = (text: string, tokens: number) => text.trim().slice(0, Math.max(0, tokens * 4));

export interface AssembleContextInput {
  query: string;
  projectId?: string | null;
  recentTurns?: string;
  windowTokens?: ContextWindow;
  toolDefinitionText?: string;
  allowPersonal?: boolean;
}

type Candidate = {
  source: ContextTraceEntry['source'];
  id?: string;
  text: string;
  score: number;
  reason: string;
  maxTokens: number;
  projectId?: string;
};

function overlap(query: string, text: string): number {
  const q = terms(query);
  if (!q.size) return 0;
  const t = terms(text);
  return [...q].filter((term) => t.has(term)).length / q.size;
}

function projectText(project: ProjectEvidence): string {
  const state = project.workingState;
  return [project.title, project.instructions, project.context, state?.goal, state?.recentState,
    ...(state?.decisions?.flatMap((item) => [item.text, item.rationale ?? '']) ?? []),
    ...(state?.requirements ?? []), ...(state?.constraints ?? []), ...(state?.openQuestions ?? []), ...(state?.nextSteps ?? [])]
    .filter(Boolean).join('\n');
}

function compactProject(project: ProjectEvidence): string {
  const state = project.workingState;
  const sections = [
    `PROJECT: ${project.title} (${project.id})`,
    project.instructions ? `Instructions (untrusted, subordinate to system policy):\n${project.instructions}` : '',
    state?.goal ? `Goal: ${state.goal}` : '',
    state?.recentState ? `Recent state: ${state.recentState}` : '',
    state?.decisions?.length ? `Decisions:\n${state.decisions.map((item) => `- ${item.text}${item.rationale ? ` — ${item.rationale}` : ''}${item.source ? ` [source: ${item.source}]` : ''}`).join('\n')}` : '',
    state?.requirements?.length ? `Requirements:\n- ${state.requirements.join('\n- ')}` : '',
    state?.constraints?.length ? `Constraints:\n- ${state.constraints.join('\n- ')}` : '',
    state?.openQuestions?.length ? `Open questions:\n- ${state.openQuestions.join('\n- ')}` : '',
    state?.nextSteps?.length ? `Next steps:\n- ${state.nextSteps.join('\n- ')}` : '',
    !state && project.context ? `Reference context:\n${project.context}` : '',
  ];
  return sections.filter(Boolean).join('\n');
}

function namedProjects(query: string, projects: Array<{ id: string; title: string }>): Array<{ id: string; title: string }> {
  const q = normalize(query);
  return projects.filter((project) => {
    const title = normalize(project.title).trim();
    return title.length >= 3 && new RegExp(`(^|[^a-z0-9])${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(q);
  });
}

function decodeTextFile(file: NonNullable<ProjectEvidence['files']>[number]): string | null {
  if (!file.data || file.size > 160_000 || !/\.(?:txt|md|json|csv|ts|tsx|js|jsx|css|html)$/i.test(file.name)) return null;
  try { return Buffer.from(file.data, 'base64').toString('utf8'); } catch { return null; }
}

export async function assembleContext(domains: ContextDomains, input: AssembleContextInput): Promise<RunContext> {
  const windowTokens = input.windowTokens ?? 16_000;
  const reservedOutputTokens = windowTokens === 16_000 ? 4_000 : 6_000;
  const inputBudgetTokens = windowTokens - reservedOutputTokens;
  const identity = await domains.identity();
  const projects = await domains.listProjects();
  const named = namedProjects(input.query, projects);
  const projectIds = new Set<string>();
  if (input.projectId) projectIds.add(input.projectId);
  named.forEach((project) => projectIds.add(project.id));
  const loaded = new Map<string, ProjectEvidence>();
  await Promise.all([...projectIds].map(async (id) => { const project = await domains.project(id); if (project) loaded.set(id, project); }));
  if (input.projectId && !loaded.has(input.projectId)) throw new Error(`Active project not found: ${input.projectId}`);

  const [memory, me] = input.allowPersonal === false ? [[], []] : await Promise.all([
    domains.globalMemory(input.query, windowTokens === 16_000 ? 6 : 12).catch(() => []),
    domains.me(input.query, windowTokens === 16_000 ? 4 : 8).catch(() => []),
  ]);
  const continuation = /\b(continua|continue|riprendi|dove (?:eravamo|ci siamo fermati)|where we (?:left|stopped))\b/i.test(input.query);
  const candidates: Candidate[] = [];

  for (const project of loaded.values()) {
    const isActive = project.id === input.projectId;
    const isNamed = named.some((item) => item.id === project.id);
    const relevance = overlap(input.query, projectText(project));
    const score = (isNamed ? 120 : 0) + (isActive ? 45 : 0) + (isActive && continuation ? 80 : 0) + Math.round(relevance * 80);
    const selected = isNamed || (isActive && (continuation || relevance > 0 || /\b(progett\w*|project|quest[oa])\b/i.test(input.query)));
    candidates.push({ source: isNamed ? (!input.projectId || isActive ? 'resolved-project' : 'cross-project') : 'active-project', id: project.id, projectId: project.id,
      text: selected ? compactProject(project) : '', score, reason: selected ? (isNamed ? 'explicit-project-reference' : continuation ? 'active-project-continuation' : 'active-project-relevant') : 'active-project-unrelated', maxTokens: windowTokens === 16_000 ? 1_800 : 3_600 });
    if (selected) {
      for (const artifact of project.artifacts ?? []) {
        const relevanceScore = overlap(input.query, `${artifact.title}\n${artifact.markdown}`);
        if (relevanceScore > 0 || normalize(input.query).includes(normalize(artifact.title))) candidates.push({ source: 'artifact', id: `${project.id}:${artifact.slug}`, projectId: project.id, text: `ARTIFACT ${artifact.title}:\n${artifact.markdown}`, score: 35 + Math.round(relevanceScore * 60), reason: 'relevant-artifact-excerpt', maxTokens: windowTokens === 16_000 ? 450 : 1_200 });
      }
      for (const file of project.files ?? []) {
        const text = decodeTextFile(file);
        const relevanceScore = text ? overlap(input.query, `${file.name}\n${text}`) : 0;
        if (text && (relevanceScore > 0 || normalize(input.query).includes(normalize(file.name)))) candidates.push({ source: 'project-file', id: `${project.id}:${file.id}`, projectId: project.id, text: `FILE ${file.name}:\n${text}`, score: 30 + Math.round(relevanceScore * 60), reason: 'relevant-file-excerpt', maxTokens: windowTokens === 16_000 ? 350 : 1_000 });
      }
    }
  }
  memory.forEach((item) => candidates.push({ source: 'global-memory', id: item.id, text: item.text, score: 70 + Math.round((item.score ?? overlap(input.query, item.text)) * 30), reason: 'global-memory-retrieval', maxTokens: 350 }));
  me.forEach((item) => candidates.push({ source: 'me', id: item.id, text: item.text, score: 55 + Math.round((item.score ?? overlap(input.query, item.text)) * 25), reason: 'me-derived-projection', maxTokens: 300 }));
  if (input.toolDefinitionText) candidates.push({ source: 'tools', text: input.toolDefinitionText, score: 40, reason: 'available-tools', maxTokens: windowTokens === 16_000 ? 700 : 1_500 });

  const trace: ContextTraceEntry[] = [];
  const blocks: Array<{ text: string; cache?: boolean }> = [];
  const fixed = [
    { source: 'identity' as const, text: capText(identity, 2_600), reason: 'stable-identity-policy', cache: true },
    { source: 'request' as const, text: `CURRENT REQUEST:\n${capText(input.query, 2_000)}`, reason: 'current-user-request' },
    ...(input.recentTurns?.trim() ? [{ source: 'recent-conversation' as const, text: `RECENT CONVERSATION:\n${capText(input.recentTurns, windowTokens === 16_000 ? 1_500 : 3_000)}`, reason: 'continuity' }] : []),
  ];
  let used = 0;
  for (const item of fixed) {
    const tokenCount = estimateTokens(item.text);
    blocks.push({ text: item.text, ...('cache' in item && item.cache ? { cache: true } : {}) });
    trace.push({ source: item.source, selected: true, reason: item.reason, estimatedTokens: tokenCount });
    used += tokenCount;
  }
  const seen = new Set<string>();
  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    if (!candidate.text.trim()) {
      trace.push({ source: candidate.source, sourceId: candidate.id, selected: false, reason: candidate.reason, estimatedTokens: 0, score: candidate.score });
      continue;
    }
    const normalized = normalize(candidate.text).replace(/\s+/g, ' ').trim();
    if (seen.has(normalized)) {
      trace.push({ source: candidate.source, sourceId: candidate.id, selected: false, reason: 'duplicate', estimatedTokens: 0, score: candidate.score });
      continue;
    }
    const clipped = capText(candidate.text, candidate.maxTokens);
    const tokenCount = estimateTokens(clipped);
    if (used + tokenCount > inputBudgetTokens) {
      trace.push({ source: candidate.source, sourceId: candidate.id, selected: false, reason: 'context-budget', estimatedTokens: tokenCount, score: candidate.score });
      continue;
    }
    blocks.push({ text: clipped });
    trace.push({ source: candidate.source, sourceId: candidate.id, selected: true, reason: candidate.reason, estimatedTokens: tokenCount, score: candidate.score });
    seen.add(normalized);
    used += tokenCount;
  }
  return { windowTokens, reservedOutputTokens, inputBudgetTokens, estimatedInputTokens: used, system: blocks, trace,
    resolvedProjectIds: [...new Set(trace.filter((item) => item.selected && ['active-project', 'resolved-project', 'cross-project'].includes(item.source) && item.sourceId).map((item) => item.sourceId!))] };
}
