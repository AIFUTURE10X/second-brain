import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
const moduleUrl = new URL('../lib/workspace-discovery.mjs', import.meta.url);
const now = new Date('2026-09-05T08:00:00Z');
const items = [
  { id: 'old', title: 'Activation notes', content: 'Onboarding activation lessons', tags: ['activation'], category: 'Product', createdAt: '2026-07-01', updatedAt: '2026-07-01' },
  { id: 'new', title: 'New onboarding flow', content: 'Activation', tags: ['activation'], category: 'Product', createdAt: '2026-09-04', updatedAt: '2026-09-04' },
  { id: 'task', title: 'Test onboarding', type: 'task', actionRequired: true, createdAt: '2026-07-01', updatedAt: '2026-07-01' },
  { id: 'done', title: 'Completed task', type: 'task', completed: true, actionRequired: true, createdAt: '2026-07-01' },
  { id: 'archived', title: 'Archived', category: 'Product', archivedAt: '2026-09-01', createdAt: '2026-07-01' },
];
const projects = [{ id: 'p', data: { name: 'Launch', goal: 'Improve activation', category: 'Product', itemIds: [] } }];

test('Today is bounded, explainable and excludes done or archived work', async () => {
  assert.ok(existsSync(moduleUrl), 'Discovery ranking must exist');
  const { buildDiscoveries } = await import(moduleUrl.href);
  const found = buildDiscoveries({ items, projects, decisions: [], feedback: [], now });
  assert.ok(found.length > 0 && found.length <= 3, 'Only useful suggestions, at most three; do not pad the feed');
  assert.ok(found.every(s => s.reason && s.sourceIds.length));
  assert.ok(found.every(s => !s.sourceIds.includes('done') && !s.sourceIds.includes('archived')));
  assert.ok(found.some(s => s.kind === 'resurface' && s.sourceIds.includes('old')));
});

test('Dismissals persist, snoozes expire and a scheduled decision can resurface', async () => {
  assert.ok(existsSync(moduleUrl), 'Discovery feedback must exist');
  const { buildDiscoveries } = await import(moduleUrl.href);
  const decision = { id: 'd', data: { title: 'Provider choice', reviewOn: '2026-09-01', sourceIds: ['old'] } };
  const initial = buildDiscoveries({ items, projects, decisions: [decision], feedback: [], now });
  assert.equal(initial[0].kind, 'decision');
  const feedback = [{ data: { suggestionId: initial[0].id, status: 'snoozed', snoozedUntil: '2026-09-06T00:00:00Z' } }];
  assert.ok(!buildDiscoveries({ items, projects, decisions: [decision], feedback, now }).some(s => s.id === initial[0].id));
  assert.ok(buildDiscoveries({ items, projects, decisions: [decision], feedback, now: new Date('2026-09-07') }).some(s => s.id === initial[0].id));
  feedback[0].data.status = 'dismissed';
  assert.ok(!buildDiscoveries({ items, projects, decisions: [decision], feedback, now: new Date('2026-09-07') }).some(s => s.id === initial[0].id));
});

test('Snoozing a card prevents immediate reappearance as another suggestion kind', async () => {
  const { buildDiscoveries } = await import(moduleUrl.href);
  const feedback = [{ data: { suggestionId: 'action:task', sourceIds: ['task'], status: 'snoozed', snoozedUntil: '2026-09-12T00:00:00Z' } }];
  const cards = items.map(i => i.id === 'task' ? { ...i, category: 'Product' } : i);
  const found = buildDiscoveries({ items: cards, projects, decisions: [], feedback, now });
  assert.ok(found.every(s => !s.sourceIds.includes('task')));
  feedback[0].data.status = 'reset';
  assert.ok(buildDiscoveries({ items: cards, projects, decisions: [], feedback, now }).some(s => s.sourceIds.includes('task')));
});
