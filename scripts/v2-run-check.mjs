import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({
  stdin: { contents: `
    export { executeRun } from './netlify/functions/_shared/v2/runEngine';
    export { capabilitiesFor } from './netlify/functions/_shared/v2/permissions';
    export { openCodeAvailability } from './netlify/functions/_shared/v2/codingWorker';
    export { DOMAIN_BOUNDARIES } from './netlify/functions/_shared/v2/domainRegistry';
    export { WORKSPACE_POLICY } from './netlify/functions/_shared/v2/workspaceCapability';
  `, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'error',
  plugins: [{ name: 'no-persistence', setup(builder) {
    builder.onLoad({ filter: /_shared\/runtimeLog\.ts$/ }, () => ({ contents: 'export const appendRuntimeEvent=async()=>{};' }));
    builder.onLoad({ filter: /v2\/runStore\.ts$/ }, () => ({ contents: 'export const saveRun=async()=>{}; export const readRun=async()=>null;' }));
  } }],
});
const m = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const domains = {
  identity: async () => 'VINZ.MON identity', listProjects: async () => [], project: async (id) => ({ id, title: 'Fixture project' }),
  globalMemory: async () => [], me: async () => [],
};
const definition = { name: 'lookup', description: 'Read fixture evidence', schema: { type: 'object', properties: {} } };
let round = 0;
const provider = async (_provider, request) => {
  round += 1;
  if (round === 1) return { ok: true, text: '', usage: {}, model: 'fixture-model', toolUses: [{ id: 'tool-1', name: 'lookup', input: {} }], sources: [], stopReason: 'tool_use' };
  assert(Array.isArray(request.userBlocks));
  assert(JSON.stringify(request.userBlocks).includes('fixture-result'));
  return { ok: true, text: 'done', usage: {}, model: 'fixture-model', toolUses: [], sources: [] };
};
const completed = await m.executeRun({ profile: 'project-chat', input: 'Use evidence', projectId: 'project-fixture', contextWindow: 16_000 }, {
  domains, provider, persist: false,
  tools: [{ definition, risk: 'read', execute: (use) => ({ id: use.id, content: 'fixture-result', isError: false }) }],
});
assert.equal(completed.status, 'completed');
assert.equal(completed.text, 'done');
assert.deepEqual(completed.toolUses, [{ name: 'lookup', ok: true }]);
assert.equal(completed.projectId, 'project-fixture');
assert(completed.events.some((item) => item.type === 'tool-finished'));

const caller = await m.executeRun({ profile: 'chat', input: 'Call it', toolMode: 'caller', tools: [definition], modelPreference: 'fixture-cloud' }, {
  domains, persist: false,
  provider: async () => ({ ok: true, text: '', usage: {}, model: 'fixture-model', toolUses: [{ id: 'caller-1', name: 'lookup', input: { q: 1 } }], sources: [], stopReason: 'tool_use' }),
});
assert.equal(caller.status, 'completed');
assert.equal(caller.rawToolUses[0].input.q, 1);

let exposed = null;
await m.executeRun({ profile: 'chat', input: 'Do a write' }, {
  domains, persist: false,
  tools: [{ definition: { ...definition, name: 'write' }, risk: 'write', execute: () => { throw new Error('must not execute'); } }],
  provider: async (_provider, request) => { exposed = request.tools; return { ok: true, text: 'refused', usage: {}, model: 'fixture-model', toolUses: [], sources: [] }; },
});
assert.deepEqual(exposed, [], 'chat profile must not expose write capabilities without approval');
assert(m.capabilitiesFor('coding').includes('workspace-read'));
assert(!m.capabilitiesFor('coding').includes('workspace-write'));
assert(m.WORKSPACE_POLICY.denied.includes('arbitrary-shell'));
assert.equal(m.DOMAIN_BOUNDARIES.me.role, 'derived');
assert.equal(m.openCodeAvailability().available, false);
console.log('PASS V2 run: canonical loop, projectId, caller tool handoff, permission gate, audit events, domain registry, coding-worker blocker.');
