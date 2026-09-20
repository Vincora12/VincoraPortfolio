import { strict as assert } from 'node:assert';
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'vinz-life-ai-'));
const entry = join(dir, 'entry.ts');
const out = join(dir, 'entry.mjs');
writeFileSync(entry, `export * from '${process.cwd()}/src/ai/lifeEvent.ts'; export { emptyLedger } from '${process.cwd()}/src/engine/world.ts';`);
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent', plugins: [{
  name: 'synthetic-ai', setup(plugin) {
    plugin.onResolve({ filter: /^\.\/backend$/ }, args => args.importer.endsWith('/src/ai/lifeEvent.ts') ? { path: 'mock-backend', namespace: 'mock' } : null);
    plugin.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export async function ask(_token, req) { globalThis.__lifeRequests.push(req); return globalThis.__lifeFailure ? {data:null,failure:globalThis.__lifeFailure,status:504} : {data:{text:globalThis.__lifeResponse(req)},failure:null}; }', loader: 'js' }));
  },
}] });
const ai = await import(`file://${out}`);
const mon = { data: { name: 'v.test.mon', mindline_node: 'node_0', lifeStage: 'BABY', evolution_state: { label: 'BABY' }, narrativeDNA: { drive: 'scoprire' } }, firstEncounter: { status: 'completato' }, learnings: [{ id: 'learning-1', about: 'mondo', kind: 'fatto', text: 'Le pietre cambiano colore.' }], curiosityQuestions: [] };
const world = (name, description) => ({ id: name.toLowerCase(), name, description, emergedOnDay: 1, emergedWith: mon.data.name, canon: [{ id: 'origin', day: 1, kind: 'origin', epistemic: 'WORLD_CANON', text: description, monName: mon.data.name }] });
const nul = world('NUL', 'Una spiaggia con pietre e sabbia.');
const bosco = world('BOSCO', 'Un sentiero fra alberi e muschio.');
const ledger = ai.emptyLedger();
globalThis.__lifeRequests = [];
globalThis.__lifeResponse = req => {
  const worldId = req.user.match(/WORLD ID: ([^\n.]+)/)?.[1] ?? '';
  const detail = worldId === 'nul' ? 'pietre' : 'muschio';
  return JSON.stringify({ worldId, eventType: 'osservazione', observedFact: `Un riflesso breve passa sul ${detail}.`, openingLine: `Hai visto quel riflesso sul ${detail}?`, worldRelevance: detail, openThreadRefs: [], memoryRefsUsed: [], possibleMonReaction: 'si ferma', scale: 'small', novelty: 'primo riflesso', continuityNotes: 'nessuna contraddizione' });
};
const c1 = { world: nul, ledger, mon, personalFacts: [], day: 1 };
const c2 = { world: bosco, ledger, mon, personalFacts: [], day: 1 };
const p1 = await ai.proposeLifeEvent('synthetic-token', c1, 'local-cheap-round');
const p2 = await ai.proposeLifeEvent('synthetic-token', c2, 'local-cheap-round');
assert(p1?.observedFact.includes('pietre') && p2?.observedFact.includes('muschio'), 'B/C: distinct runtime contexts yield distinct model proposals');
assert(globalThis.__lifeRequests.every(r => r.capability === 'text-cheap' && r.voiceModel === 'local-cheap-round'), 'existing local routing used');
const diagnostics = [];
globalThis.__lifeResponse = () => 'not-json';
assert.equal(await ai.proposeLifeEvent('synthetic-token', c1, 'local-cheap-round', '', result => diagnostics.push(result)), null);
assert.equal(diagnostics.at(-1).code, 'invalid-json', 'malformed proposal has a technical reason');
globalThis.__lifeFailure = 'timeout';
assert.equal(await ai.proposeLifeEvent('synthetic-token', c1, 'local-cheap-round', '', result => diagnostics.push(result)), null);
assert.equal(diagnostics.at(-1).code, 'backend-timeout', 'timeout has a technical reason');
globalThis.__lifeFailure = null;
globalThis.__lifeResponse = req => {
  const worldId = req.user.match(/WORLD ID: ([^\n.]+)/)?.[1] ?? '';
  return JSON.stringify({ worldId, eventType: 'osservazione', observedFact: 'Una piccola ombra appare fra le pietre.', openingLine: 'Hai visto quella piccola ombra?', worldRelevance: 'fra le pietre', openThreadRefs: [], memoryRefsUsed: [], possibleMonReaction: 'si ferma', scale: 'small', novelty: 'prima ombra', continuityNotes: 'coerente' });
};
globalThis.fetch = async () => ({ ok: true, json: async () => ({ material: [
  { id: 'relevant', text: 'Costruisco un progetto tra pietre e materiali.', epistemic: 'FACT' },
  { id: 'unrelated', text: 'Ascolto musica jazz.', epistemic: 'FACT' },
  { id: 'sensitive', text: 'La mia diagnosi riguarda le pietre.', epistemic: 'FACT' },
  { id: 'inference', text: 'Forse temo le pietre.', epistemic: 'AI_CONNECTION' },
] }) });
const facts = await ai.fetchLifePersonalFacts('synthetic-token', mon, nul, ledger);
assert.deepEqual(facts.map(f => f.id), ['relevant'], 'D/E: only pertinent nonsensitive user facts');
await ai.proposeLifeEvent('synthetic-token', { ...c1, personalFacts: facts }, 'local-cheap-round');
assert(globalThis.__lifeRequests.at(-1).user.includes('[USER FACT relevant]'), 'D: minimal sourced fact reaches narrator');
assert(!/diagnosi|Ascolto musica jazz|Forse temo/.test(globalThis.__lifeRequests.at(-1).user), 'E: sensitive, unrelated and inferred material excluded');
globalThis.__lifeResponse = req => JSON.stringify({ intent: 'narrative_action', eventId: 'life_nul_1', worldId: 'nul', playerActionQuote: 'mi avvicino', observedConsequence: 'Il riflesso si ferma sulla pietra.', signal: 'initiative' });
const withEvent = { ...ledger, lifeEvent: { id: 'life_nul_1', worldId: 'nul', monNodeId: 'node_0', day: 1, status: 'open', eventType: 'osservazione', observedFact: 'Un riflesso appare.', openingLine: 'Hai visto?', possibleMonReaction: 'si ferma', openThreadRefs: [], memoryRefsUsed: [] } };
const consequence = await ai.proposeLifeConsequence('synthetic-token', nul, withEvent, 'mi avvicino', 'local-cheap-round');
assert.equal(consequence?.signal, 'initiative', 'H: model proposes a structured consequence');
assert(!globalThis.__lifeRequests.at(-1).user.includes('Ascolto musica jazz'), 'no unrelated memory in consequence request');
const { outputFiles } = await build({ entryPoints: [`${process.cwd()}/netlify/functions/_shared/providers.ts`], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
const providers = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
let localBody;
globalThis.fetch = async (_url, options) => {
  localBody = JSON.parse(options.body);
  return new Response(JSON.stringify({ model: 'qwen2.5:14b', choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const routed = await providers.callProvider('ollama', { model: 'qwen2.5:14b', system: [], turns: [], user: 'synthetic', maxTokens: 100, effort: 'low' });
assert(routed.ok && localBody.max_tokens === 100 && !('reasoning_effort' in localBody), 'Ollama request omits unsupported thinking and uses max_tokens');
console.log('Life Cycle AI synthetic checks: PASS');
