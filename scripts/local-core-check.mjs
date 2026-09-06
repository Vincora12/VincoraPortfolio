import assert from 'node:assert/strict';

const base = process.env.VINZMON_TEST_URL || 'http://127.0.0.1:8791';
const token = process.env.VINZMON_TOKEN;
if (!token) throw new Error('VINZMON_TOKEN is required');
const headers = { authorization: `Bearer ${token}` };
const jsonHeaders = { ...headers, 'content-type': 'application/json' };
const request = async (path, init = {}) => {
  const response = await fetch(`${base}${path}`, init);
  const text = await response.text();
  let value;
  try { value = text ? JSON.parse(text) : null; } catch { value = text; }
  if (!response.ok) throw new Error(`${init.method || 'GET'} ${path}: ${response.status} ${text}`);
  return { response, value };
};

const marker = 'local-core-gauntlet-v1';
if (process.argv.includes('--readback')) {
  const stored = await request(`/api/user-data?key=${marker}`, { headers });
  assert.equal(stored.value.value, marker);
  const projects = await request('/api/projects', { headers });
  assert.ok(projects.value.projects.some((project) => project.title === 'Gauntlet Project A'));
  const calendar = await request('/api/calendar', { headers });
  assert.ok(calendar.value.events.some((row) => row.event.title === 'Gauntlet Reminder'));
  console.info('restart readback: PASS');
  process.exit(0);
}

assert.equal((await request('/health')).value.status, 'ok');
const root = await fetch(`${base}/`); assert.equal(root.status, 200); assert.match(await root.text(), /VINZ\.MON/);
const spa = await fetch(`${base}/non-root-route`); assert.equal(spa.status, 200); assert.match(await spa.text(), /VINZ\.MON/);

await request(`/api/user-data?key=${marker}`, { method: 'PUT', headers, body: marker });
assert.equal((await request(`/api/user-data?key=${marker}`, { headers })).value.value, marker);

const create = async (title, context) => (await request('/api/projects', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ action: 'create', title, context }) })).value.project;
const a = await create('Gauntlet Project A', 'PROJECT_A_ONLY');
const b = await create('Gauntlet Project B', 'PROJECT_B_ONLY');
assert.notEqual(a.id, b.id); assert.equal(a.context.includes('PROJECT_B_ONLY'), false); assert.equal(b.context.includes('PROJECT_A_ONLY'), false);
const saved = (await request('/api/projects', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ action: 'save-artifact', projectId: a.id, revision: a.revision, title: 'Stable Artifact', markdown: '# First' }) })).value.project;
const artifact = saved.artifacts[0];
const updated = (await request('/api/projects', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ action: 'save-artifact', projectId: a.id, revision: saved.revision, slug: artifact.slug, title: artifact.title, markdown: '# Updated' }) })).value.project;
assert.equal(updated.artifacts[0].slug, artifact.slug); assert.equal(updated.artifacts[0].revision, 2);

const eventId = `gauntlet_${Date.now()}`;
await request('/api/calendar', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ id: eventId, event: { title: 'Gauntlet Reminder', start: new Date().toISOString(), timezone: 'Europe/Rome', category: 'personal', status: 'planned', notes: '', reminderAt: new Date(Date.now() - 1000).toISOString() } }) });
for (let attempt = 0; attempt < 30; attempt += 1) {
  const calendar = await request('/api/calendar', { headers });
  const found = calendar.value.events.find((row) => row.event.id === eventId);
  if (found?.event.reminderDelivery) break;
  await new Promise((done) => setTimeout(done, 250));
}
const calendar = await request('/api/calendar', { headers });
assert.ok(calendar.value.events.find((row) => row.event.id === eventId)?.event.reminderDelivery);
console.info(JSON.stringify({ status: 'PASS', projectId: a.id, artifactSlug: artifact.slug, eventId }));
