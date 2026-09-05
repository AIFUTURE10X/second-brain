import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAskContext } from '../lib/ask-brain.mjs';

test('Ask reads the relevant passage late in a stored transcript', () => {
  const text = 'An unrelated introduction. '.repeat(200) + '\n[12:34] Retry queues require an idempotency key to prevent duplicate payments.';
  const result = buildAskContext([{ id: 'one', title: 'Reliable workflows', type: 'link', url: 'https://youtube.com/watch?v=abcdefghijk', transcript: text }], { question: 'idempotency duplicate payments' });
  assert.match(result.contextText, /idempotency key/);
  assert.ok(result.sources[0].passages.some(p => p.text.includes('duplicate payments')));
  assert.ok(result.sources[0].passages.some(p => p.url?.includes('t=754')));
});

test('Ask can read an annotation beyond the beginning of a long card', () => {
  const row = { id: 'one', title: 'Notes', content: 'Introductory information. '.repeat(200), noteEntries: [{ body: 'The launch success measure is seven activated teams.' }] };
  const result = buildAskContext([row], { question: 'launch success measure' });
  assert.match(result.contextText, /seven activated teams/);
});

test('Ask passage excerpts are literal source text and do not invent timing', () => {
  const text = 'Plain transcript with a useful lesson about queue latency.';
  const result = buildAskContext([{ id: 'one', title: 'Queue lesson', transcript: text }], { question: 'queue latency' });
  assert.ok(result.sources[0].passages?.length);
  for (const passage of result.sources[0].passages) {
    assert.ok(text.includes(passage.text));
    assert.equal(passage.url, '');
  }
});

test('Context including separators stays within its budget', () => {
  const rows = Array.from({ length: 12 }, (_, n) => ({ id: `${n}`, title: `Source ${n}`, content: 'Useful material '.repeat(300) }));
  const result = buildAskContext(rows, { maxChars: 2200, question: 'material' });
  assert.ok(result.contextText.length <= 2200);
  assert.ok(result.sources.length > 0);
});
