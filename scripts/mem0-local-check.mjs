import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const data = await mkdtemp(join(tmpdir(), 'vinzmon-mem0-test-'));
const secret = 'fixture-memory-secret-123456789';
const memoryUrl = 'http://127.0.0.1:8794';
const provider = createServer(async (req, res) => {
  for await (const _chunk of req) { /* drain */ }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ object: 'list', model: 'fixture-embedding', data: [{ object: 'embedding', index: 0, embedding: [1, 0, 0, 0, 0, 0, 0, 0] }], usage: { prompt_tokens: 1, total_tokens: 1 } }));
});
await new Promise((done, fail) => provider.once('error', fail).listen(8793, '127.0.0.1', done));

const env = { ...process.env, PORT: '8794', HOST: '127.0.0.1', VINZMON_MEMORY_SERVICE_SECRET: secret,
  MEM0_LLM_API_KEY: 'fixture', MEM0_EMBEDDER_API_KEY: 'fixture', MEM0_EMBEDDING_DIMS: '8',
  MEM0_LLM_BASE_URL: 'http://127.0.0.1:8793/v1', MEM0_EMBEDDER_BASE_URL: 'http://127.0.0.1:8793/v1',
  MEM0_HISTORY_DB_PATH: join(data, 'history.sqlite'), MEM0_VECTOR_DB_PATH: join(data, 'vectors.sqlite') };
const start = () => spawn(process.execPath, [resolve('services/mem0/dist/server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
const waitForHealth = async () => {
  for (let i = 0; i < 60; i += 1) {
    try { const response = await fetch(`${memoryUrl}/health`); if (response.ok) return; } catch { /* starting */ }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error('Mem0 fixture service did not become healthy');
};
const call = async (path, body) => {
  const response = await fetch(`${memoryUrl}${path}`, { method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const value = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(value));
  return value;
};
let child;
try {
  child = start(); await waitForHealth();
  const marker = `durable-local-memory-${Date.now()}`;
  await call('/memory/add', { userId: 'user-a', text: marker, infer: false });
  assert.ok(JSON.stringify(await call('/memory/search', { userId: 'user-a', query: marker, limit: 5 })).includes(marker));
  assert.equal(JSON.stringify(await call('/memory/search', { userId: 'user-b', query: marker, limit: 5 })).includes(marker), false);
  child.kill('SIGTERM'); await new Promise((done) => child.once('exit', done));
  child = start(); await waitForHealth();
  assert.ok(JSON.stringify(await call('/memory/search', { userId: 'user-a', query: marker, limit: 5 })).includes(marker));
  console.info('PASS Mem0 local SQLite add/search, user isolation, process restart, and retrieval.');
} finally {
  child?.kill('SIGTERM');
  await new Promise((done) => provider.close(done));
  await rm(data, { recursive: true, force: true });
}
