import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({
  stdin: { contents: `export { assembleContext } from './netlify/functions/_shared/v2/contextAssembler'; export { createProject, updateProject, mutationProblem } from './src/engine/projects';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'error',
});
const { assembleContext, createProject, updateProject, mutationProblem } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

const ff = {
  id: 'project-ffuoco', title: 'FFuoco', instructions: 'Mantieni il tono editoriale.', context: 'Campagna con creators italiani.',
  workingState: {
    goal: 'Lanciare la campagna FFuoco.',
    decisions: [{ text: 'Coinvolgere tre creators verticali.', rationale: 'Più credibilità.', source: 'conversation:ff-17' }],
    requirements: ['Contenuti verticali'], constraints: ['Budget limitato'], openQuestions: ['Date finali'], nextSteps: ['Confermare creators'], recentState: 'Shortlist creators pronta.',
  },
};
const sanbitter = {
  id: 'project-sanbitter', title: 'Sanbitter', instructions: '', context: '',
  workingState: { goal: 'Refresh visuale.', decisions: [{ text: 'Visual direction rosso grafico, ombre nette.', source: 'artifact:visual-direction' }], requirements: [], constraints: [], openQuestions: [], nextSteps: [], recentState: 'Moodboard approvato.' },
};
const projects = [ff, sanbitter];
const domains = {
  identity: async () => 'VINZ.MON identity and safety policy.',
  listProjects: async () => projects.map(({ id, title }) => ({ id, title })),
  project: async (id) => projects.find((project) => project.id === id) ?? null,
  globalMemory: async (query) => /montr|montreal/i.test(query) ? [{ id: 'memory-canada', text: 'A Montréal il posto si chiamava Crew Collective & Café.', score: 0.98 }] : [{ id: 'memory-stress', text: 'Ultimamente il carico di lavoro aumenta lo stress.', score: 0.7 }],
  me: async (query) => /stress/i.test(query) ? [{ id: 'me-stress', text: 'ME: i periodi con troppe scadenze coincidono con maggiore stress.', score: 0.9 }] : [],
};
const selected = (context, source, id) => context.trace.some((item) => item.selected && item.source === source && (!id || item.sourceId === id));

const a = await assembleContext(domains, { query: 'What did we decide about the creators?', projectId: ff.id, windowTokens: 16_000 });
assert(selected(a, 'active-project', ff.id), 'A: active FFuoco context must dominate');

const b = await assembleContext(domains, { query: 'What was the name of that place in Montréal?', projectId: ff.id, windowTokens: 16_000 });
assert(selected(b, 'global-memory', 'memory-canada'), 'B: global Canada memory must be retrieved');
assert(!selected(b, 'active-project', ff.id), 'B: unrelated active project must not pollute retrieval');

const c = await assembleContext(domains, { query: 'Use the visual direction we developed for Sanbitter.', projectId: ff.id, windowTokens: 16_000 });
assert(selected(c, 'cross-project', sanbitter.id), 'C: named cross-project evidence must be selected');
assert.equal(c.resolvedProjectIds.includes(ff.id), false, 'C: active project id is not silently switched or injected when unrelated');

const d = await assembleContext(domains, { query: 'Where were we with FFuoco?', windowTokens: 16_000 });
assert(selected(d, 'resolved-project', ff.id), 'D: named project must resolve without active project');

const e = await assembleContext(domains, { query: "I'm stressed lately. Do you think this Project is contributing?", projectId: ff.id, windowTokens: 16_000 });
assert(selected(e, 'active-project', ff.id), 'E: active project context must participate');
assert(selected(e, 'me', 'me-stress'), 'E: derived ME projection must participate');

const f = await assembleContext(domains, { query: 'Continue from where we stopped.', projectId: ff.id, recentTurns: 'user: working on creator shortlist', windowTokens: 16_000 });
assert(selected(f, 'active-project', ff.id), 'F: continuation must strongly select active working state');

for (const windowTokens of [16_000, 32_000]) {
  const context = await assembleContext(domains, { query: 'Continue from where we stopped.', projectId: ff.id, recentTurns: 'x'.repeat(40_000), windowTokens });
  assert(context.estimatedInputTokens <= context.inputBudgetTokens, `${windowTokens}: input budget exceeded`);
  assert.equal(context.windowTokens, windowTokens);
  assert(context.reservedOutputTokens > 0);
  assert(!JSON.stringify(context.trace).includes('Shortlist creators'), 'trace metadata must not copy personal text');
}

const created = createProject({ action: 'create', title: 'Fixture' }, 'project-fixture', '2026-01-01T00:00:00.000Z');
const workingMutation = { action: 'update-working-state', projectId: created.id, revision: created.revision, workingState: { goal: 'Ship safely', decisions: [{ text: 'Keep UI', source: 'test:1' }], requirements: ['Parity'], constraints: ['No production writes'], openQuestions: [], nextSteps: ['Validate'], recentState: 'V2 isolated' } };
assert.equal(mutationProblem(workingMutation), null);
const updated = updateProject(created, workingMutation, '2026-01-02T00:00:00.000Z');
assert.equal(updated.workingState.goal, 'Ship safely');
assert.equal(updated.workingState.updatedAt, '2026-01-02T00:00:00.000Z');
assert.equal(created.workingState, undefined, 'project update must not mutate original record');

console.log('PASS V2 context: active prior, global escape, cross-project resolution, ME mix, continuation, 16K/32K budgets, metadata-only trace.');
