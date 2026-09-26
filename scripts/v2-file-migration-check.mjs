import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const compiled = await build({ stdin: { contents: `export { planProjectFileMigration, applyProjectFileMigration, rollbackProjectFileMigration } from './netlify/functions/_shared/v2/projectFileMigration';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'error' });
const m = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const root = await mkdtemp(join(tmpdir(), 'vinzmon-v2-fixture-'));
try {
  const project = { id: 'project-fixture', title: 'Fixture', instructions: '', context: '', revision: 1, createdAt: '', updatedAt: '', artifacts: [], files: [{ id: 'file-fixture', name: '../notes.txt', size: 5, data: Buffer.from('hello').toString('base64') }] };
  const plan = m.planProjectFileMigration(project, '2026-01-01T00:00:00.000Z');
  assert.equal(plan.files.length, 1);
  assert(!plan.files[0].relativePath.includes('..'));
  await assert.rejects(() => m.applyProjectFileMigration(plan, root), /ENOENT/);
  await writeFile(join(root, '.vinzmon-v2-fixture'), 'fixture only');
  const metadata = await m.applyProjectFileMigration(plan, root);
  assert.equal(metadata[0].source, 'legacy-project-record');
  assert.equal(metadata[0].revision, 1);
  assert.equal(await readFile(join(root, metadata[0].relativePath), 'utf8'), 'hello');
  assert(!JSON.stringify(metadata).includes(project.files[0].data), 'metadata must not duplicate canonical bytes');
  await m.rollbackProjectFileMigration(plan, root);
  await assert.rejects(() => readFile(join(root, metadata[0].relativePath)), /ENOENT/);
  console.log('PASS V2 files: fixture marker, path confinement, checksum, filesystem bytes, metadata-only records.');
} finally {
  await rm(root, { recursive: true, force: true });
}
