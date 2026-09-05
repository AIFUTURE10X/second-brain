import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';

const modelUrl = new URL('../lib/workspace-model.mjs', import.meta.url);
const providerUrl = new URL('../lib/knowledge-provider.mjs', import.meta.url);
const id = '11111111-1111-4111-8111-111111111111';

test('Workspace records validate goals, source IDs, revisions and backup round trips', async () => {
  assert.ok(existsSync(modelUrl), 'Workspace record validation must exist');
  const { workspaceRecordSchema, parseWorkspaceBackup } = await import(modelUrl.href);
  const project = { id, kind: 'project', revision: 0, data: { name: 'Launch', goal: 'Activate seven teams', category: 'Product', itemIds: [id], questions: 'What prevents activation?' } };
  assert.equal(workspaceRecordSchema.safeParse(project).success, true);
  assert.equal(workspaceRecordSchema.safeParse({ ...project, revision: -1 }).success, false);
  assert.equal(workspaceRecordSchema.safeParse({ ...project, data: { ...project.data, itemIds: ['bad-id'] } }).success, false);
  assert.deepEqual(parseWorkspaceBackup(JSON.stringify({ version: 1, records: [project] })), [project]);
  assert.throws(() => parseWorkspaceBackup('{"version":2,"records":[]}'));
});

test('Decision records require a choice and retain the reason and review date', async () => {
  assert.ok(existsSync(modelUrl), 'Decision validation must exist');
  const { workspaceRecordSchema } = await import(modelUrl.href);
  const decision = { id, kind: 'decision', revision: 0, data: { title: 'Provider', choice: 'Keep current provider', rationale: 'Measured latency meets target', alternatives: 'Switch providers', sourceIds: [id], projectId: null, reviewOn: '2026-10-01' } };
  assert.deepEqual(workspaceRecordSchema.parse(decision), decision);
  assert.equal(workspaceRecordSchema.safeParse({ ...decision, data: { ...decision.data, choice: '' } }).success, false);
});

test('AI requests retain the configured model, disable storage, and reject incomplete output', async () => {
  assert.ok(existsSync(providerUrl), 'Bounded provider request must exist');
  const { generateKnowledgeAnswer } = await import(providerUrl.href);
  let request;
  const fetcher = async (url, init) => { request = { url, ...JSON.parse(init.body) }; return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Evidence [1]' }] }] }); };
  const answer = await generateKnowledgeAnswer({ apiKey: 'test-only', model: 'existing-model', context: '[1] Fact', question: 'Explain', history: [], fetcher });
  assert.equal(answer, 'Evidence [1]');
  assert.equal(request.model, 'existing-model');
  assert.equal(request.store, false);
  assert.ok(request.max_output_tokens <= 2000);
  await assert.rejects(generateKnowledgeAnswer({ apiKey: 'test', model: 'test', context: '', question: 'q', fetcher: async () => Response.json({ status: 'incomplete', output_text: 'half' }) }), /incomplete/i);
});

test('Attachments require explicit selection, trusted upload URLs and a bounded total size', async () => {
  assert.ok(existsSync(providerUrl), 'Attachment guard must exist');
  const { prepareAttachmentInputs } = await import(providerUrl.href);
  const rows = [{ id, attachments: [{ url: 'https://example.public.blob.vercel-storage.com/report.pdf', name: 'Report.pdf', contentType: 'application/pdf', size: 1000 }] }];
  const result = prepareAttachmentInputs(rows, [{ itemId: id, index: 0 }]);
  assert.equal(result.inputs[1].type, 'input_file');
  assert.equal(prepareAttachmentInputs(rows, []).inputs.length, 0);
  assert.throws(() => prepareAttachmentInputs(rows, [{ itemId: id, index: 9 }]), /attachment/i);
  rows[0].attachments[0].url = 'https://localhost/private';
  assert.throws(() => prepareAttachmentInputs(rows, [{ itemId: id, index: 0 }]), /upload/i);
});
