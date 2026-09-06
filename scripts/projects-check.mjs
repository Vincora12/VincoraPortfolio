import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Isolated API/model test: synthetic records, no production data or credentials.
const directory = await mkdtemp(join(tmpdir(), 'vinzmon-project-test-'));
const blobMock = `
const records = new Map(); let version = 0;
export function getStore() { return {
 get: async key => records.get(key)?.data ?? null,
 getWithMetadata: async key => records.get(key) ?? null,
 list: async ({prefix}) => ({blobs:[...records.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))}),
 setJSON: async (key,data,options) => {
  const current=records.get(key);
  if(options?.onlyIfNew && current || options?.onlyIfMatch && current?.etag!==options.onlyIfMatch) return {modified:false};
  records.set(key,{data:structuredClone(data),etag:String(++version)}); return {modified:true};
 }
}; }
`;
try {
  await build({ entryPoints: ['netlify/functions/projects.ts', 'src/engine/projects.ts'], outdir: directory, outbase: '.', bundle: true, format: 'esm', platform: 'node', outExtension: { '.js': '.mjs' }, plugins: [{ name: 'isolated-blobs', setup(builder) { builder.onResolve({ filter: /^@netlify\/blobs$|\/localStore$|^\.\/_shared\/localStore$/ }, () => ({ path: 'mock-blobs', namespace: 'test' })); builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: blobMock, loader: 'js' })); } }] });
  const { default: handler } = await import(pathToFileURL(join(directory, 'netlify/functions/projects.mjs')));
  const { buildProjectContext, mutationProblem, artifactHref, GLOBAL_PROJECT_ID } = await import(pathToFileURL(join(directory, 'src/engine/projects.mjs')));
  const token = 'synthetic-project-test-token-123456';
  const previous = process.env.VINZMON_TOKEN;
  process.env.VINZMON_TOKEN = token;
  const call = (body, query = '', authenticated = true) => handler(new Request(`https://test.invalid/api/projects${query}`, { method: body ? 'POST' : 'GET', headers: { ...(authenticated ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }));
  try {
    assert.equal((await call(null, '', false)).status, 401);
    assert.equal((await call({ action: 'create', title: 'x' }, '', false)).status, 401);
    const globals = await Promise.all([call(null, `?projectId=${GLOBAL_PROJECT_ID}`), call(null, `?projectId=${GLOBAL_PROJECT_ID}`)]);
    const [{project: globalA}, {project: globalB}] = await Promise.all(globals.map(r => r.json()));
    assert.equal(globalA.id, GLOBAL_PROJECT_ID);
    assert.deepEqual(globalA, globalB, 'Concurrent first reads create one canonical GLOBAL');
    assert.equal((await call({ action: 'trash', projectId: globalA.id, revision: globalA.revision })).status, 400);
    const {project: globalFile} = await (await call({action:'upload-files',projectId:globalA.id,revision:globalA.revision,files:[{id:'global-file-test',name:'global.txt',size:2,data:'aGk='}]})).json();
    const {project: globalDoc} = await (await call({action:'save-artifact',projectId:globalA.id,revision:globalFile.revision,title:'Global document',markdown:'# Only GLOBAL'})).json();
    const {project: globalRead} = await (await call(null, `?projectId=${GLOBAL_PROJECT_ID}`)).json();
    assert.equal(globalRead.artifacts[0].markdown, '# Only GLOBAL');
    assert.equal(globalRead.files[0].data, 'aGk=');
    assert.equal(globalRead.revision, globalDoc.revision);
    assert.equal((await (await call(null)).json()).projects.length, 0, 'GLOBAL is not a duplicate selectable group');
    assert.equal((await call({ action: 'create', title: 'x', context: 'data:image/png;base64,AAAA' })).status, 400);
    const created = await call({ action: 'create', title: 'Alpha synthetic', context: 'Alpha only fact', instructions: 'Use concise sections' });
    assert.equal(created.status, 201);
    const { project: alpha } = await created.json();
    const { project: beta } = await (await call({ action: 'create', title: 'Beta synthetic', context: 'Beta only fact' })).json();
    assert(!buildProjectContext(alpha).includes('Beta only fact'));
    assert(!buildProjectContext(beta).includes('Alpha only fact'));
    const { project: saved } = await (await call({ action: 'save-artifact', projectId: alpha.id, revision: alpha.revision, title: 'Report', markdown: '# Report\n\nAlpha only fact' })).json();
    assert.equal(saved.artifacts.length, 1);
    const slug = saved.artifacts[0].slug;
    const href = artifactHref(saved.id, slug);
    const { project: updated } = await (await call({ action: 'save-artifact', projectId: saved.id, revision: saved.revision, slug, title: 'Report', markdown: '# Report\n\nVerified update' })).json();
    assert.equal(updated.artifacts.length, 1);
    assert.equal(updated.artifacts[0].revision, 2);
    assert.equal(artifactHref(updated.id, updated.artifacts[0].slug), href);
    assert.equal((await call({ action: 'save-artifact', projectId: saved.id, revision: saved.revision, slug, title: 'Stale', markdown: 'must not overwrite' })).status, 409);
    const { project: reloaded } = await (await call(null, `?projectId=${alpha.id}`)).json();
    assert.equal(reloaded.artifacts[0].markdown, '# Report\n\nVerified update');
    const { project: betaReloaded } = await (await call(null, `?projectId=${beta.id}`)).json();
    assert.equal(betaReloaded.artifacts.length, 0);
    const list = await (await call(null)).json();
    assert.equal(list.projects.length, 2);
    assert(!JSON.stringify(list).includes('Alpha only fact'));
    assert(!JSON.stringify(list).includes('Verified update'));
    const fixtureFile = { id: 'file-test-12345678', name: 'note.txt', size: 5, data: 'aGVsbG8=' };
    const { project: withFiles } = await (await call({ action: 'upload-files', projectId: updated.id, revision: updated.revision, files: [fixtureFile] })).json();
    assert.equal(withFiles.files[0].data, fixtureFile.data);
    assert.equal((await call({ action: 'upload-files', projectId: updated.id, revision: updated.revision, files: [fixtureFile] })).status, 409);
    assert.equal((await call({ action: 'upload-files', projectId: updated.id, revision: withFiles.revision, files: [{ ...fixtureFile, size: 4 }] })).status, 400);
    const { project: trashed } = await (await call({ action: 'trash', projectId: updated.id, revision: withFiles.revision })).json();
    assert.equal((await (await call(null)).json()).projects.length, 1);
    const trashList = await (await call(null, '?trash=true')).json();
    assert.equal(trashList.projects[0].fileCount, 1);
    assert(!JSON.stringify(trashList).includes('aGVsbG8='));
    assert.equal((await call({ action: 'save-artifact', projectId: updated.id, revision: trashed.revision, title: 'Blocked', markdown: 'no' })).status, 400);
    const { project: restored } = await (await call({ action: 'restore', projectId: updated.id, revision: trashed.revision })).json();
    assert.equal(restored.files[0].name, 'note.txt');
    assert.equal(restored.artifacts[0].markdown, '# Report\n\nVerified update');
    const { project: removed } = await (await call({ action: 'remove-files', projectId: updated.id, revision: restored.revision, ids: [fixtureFile.id] })).json();
    assert.equal(removed.files.length, 0);
    assert.equal(removed.artifacts.length, 1);
    assert(mutationProblem({ action: 'update', projectId: alpha.id, revision: 1, title: 'Missing fields' }));
    assert.equal((await call(null, '?projectId=../../secret')).status, 400);
    assert.equal((await call({ action: 'create', title: 'Oversized', context: 'x'.repeat(12001) })).status, 400);
    for (let index = 2; index < 23; index++) assert.equal((await call({ action: 'create', title: `Synthetic cap ${index}` })).status, 201);
    const raced = await Promise.all([call({ action: 'create', title: 'Concurrent A' }), call({ action: 'create', title: 'Concurrent B' })]);
    assert(raced.every(response => response.status === 201));
    const visible = await (await call(null)).json();
    assert.equal(visible.projects.length, 25, 'Do not hide records created concurrently across the count guard');
    assert.equal((await call({ action: 'create', title: 'Over cap' })).status, 409);
    console.log('PASS projects: auth GET/POST, input bounds, binary rejection, scoped context, create/read/update, stable artifact URL, conflict protection, project isolation, summary privacy.');
  } finally { if (previous === undefined) delete process.env.VINZMON_TOKEN; else process.env.VINZMON_TOKEN = previous; }
} finally {
  await rm(directory, { recursive: true });
}
