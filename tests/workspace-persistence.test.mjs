import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createWorkspaceFixture } from './helpers/workspace-fixture.mjs';

process.env.API_SECRET = 'fixture-only';
process.env.OPENAI_API_KEY = 'fixture-only';
const f = await createWorkspaceFixture();
after(() => f.close());
const project = (name = 'Project') => ({ id: randomUUID(), kind: 'project', revision: 0, data: { name, goal: 'Improve onboarding activation', category: 'Product', itemIds: [], questions: 'What prevents activation?' } });

test('Real Postgres persistence rejects stale edits and never overwrites on retry', async () => {
  const p = project();
  const created = await f.store.writeWorkspaceRecord(p);
  assert.equal(created.record.revision, 1);
  assert.equal((await f.store.writeWorkspaceRecord(p)).conflict, true);
  const [a, b] = await Promise.all([
    f.store.writeWorkspaceRecord({ ...created.record, data: { ...p.data, goal: 'First edit' } }),
    f.store.writeWorkspaceRecord({ ...created.record, data: { ...p.data, goal: 'Second edit' } }),
  ]);
  assert.equal([a, b].filter(r => !r.conflict).length, 1);
  assert.equal((await f.store.readWorkspaceRecord('project', p.id)).revision, 2);
});

test('Workspace endpoints authorize and return 409 for a stale browser tab', async () => {
  assert.equal((await f.routes.records.GET(f.request('records', 'GET', undefined, false))).status, 401);
  const p = project('Conflict');
  const first = await f.routes.records.PUT(f.request('records', 'PUT', p));
  assert.equal(first.status, 200);
  assert.equal((await f.routes.records.PUT(f.request('records', 'PUT', p))).status, 409);
  assert.equal((await f.routes.records.PUT(f.request('records', 'PUT', { ...p, data: { ...p.data, itemIds: ['invalid'] } }))).status, 400);
});

test('Backup restoration skips existing records and paginated reads preserve every record', async () => {
  const batch = Array.from({ length: 110 }, (_, i) => project(`Backup ${i}`));
  assert.equal((await f.store.restoreWorkspaceRecords(batch)).imported, 110);
  assert.equal((await f.store.restoreWorkspaceRecords(batch)).skipped, 110);
  const first = await f.store.listWorkspaceRecords();
  assert.equal(first.records.length, 100);
  assert.ok(first.nextCursor);
  const second = await f.store.listWorkspaceRecords(first.nextCursor);
  assert.equal(new Set([...first.records, ...second.records].map(r => r.id)).size, 112);
});

test('Ask uses stored transcript passages, honors project scope, and fails closed', async () => {
  const id = randomUUID();
  await f.db.insert(f.schema.items).values({ id, title: 'Onboarding', content: 'Overview', category: 'Product', tags: [] });
  await f.db.insert(f.schema.itemTranscripts).values({ itemId: id, text: 'Introduction. '.repeat(300) + ' Onboarding activation improves with seven small steps.' });
  const p = project('Ask scope'); await f.store.writeWorkspaceRecord(p);
  const response = await f.routes.ask.POST(f.request('ask', 'POST', { question: 'onboarding activation seven steps', itemIds: [id], projectId: p.id }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.match(f.context.providerRequest.context, /seven small steps/);
  assert.equal(data.sources[0].id, id);
  assert.equal((await f.routes.ask.POST(f.request('ask', 'POST', { question: 'q', itemIds: [randomUUID()], projectId: p.id }))).status, 400);
  f.context.setProviderFailure(true);
  assert.equal((await f.routes.ask.POST(f.request('ask', 'POST', { question: 'q', itemIds: [id] }))).status, 502);
  f.context.setProviderFailure(false);
});

test('Saving the same generated output twice creates one card with source links', async () => {
  const sourceId = randomUUID();
  await f.db.insert(f.schema.items).values({ id: sourceId, title: 'Evidence card', tags: [] });
  const output = { id: randomUUID(), title: 'Try an experiment', content: 'Measure activated teams [1].', type: 'task', category: 'Product', sourceIds: [sourceId] };
  const first = await f.routes.save.POST(f.request('save', 'POST', output));
  assert.equal(first.status, 201);
  const saved = await first.json();
  assert.ok(saved.websiteLinks[0].url.endsWith(`/card/${sourceId}`));
  assert.equal((await f.routes.save.POST(f.request('save', 'POST', output))).status, 200);
  assert.equal((await f.routes.save.POST(f.request('save', 'POST', { ...output, content: 'Different content' }))).status, 409);
  assert.equal((await f.pg.query('SELECT count(*)::int AS n FROM items WHERE id=$1', [output.id])).rows[0].n, 1);
});

test('Ordinary settings APIs cannot expose bulky workspace history or bypass revisions', async () => {
  const response = await f.routes.settings.GET(f.request('settings'));
  assert.ok(Object.keys(await response.json()).every(key => !key.startsWith('knowledge_workspace:')));
  const p = project('Reserved'); await f.store.writeWorkspaceRecord(p);
  const key = `knowledge_workspace:project:${p.id}`;
  assert.equal((await f.routes.settings.PUT(f.request('settings', 'PUT', { key, value: {} }))).status, 400);
  assert.equal((await f.routes.settings.DELETE(f.request('settings', 'DELETE', undefined, true, `?key=${key}`))).status, 400);
  assert.equal((await f.store.readWorkspaceRecord('project', p.id)).data.name, 'Reserved');
});
