import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { createWorkspaceFixture } from './helpers/workspace-fixture.mjs';

let f, summary, provider, route, source;
const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;
const originalSecret = process.env.API_SECRET;
const id = '11111111-1111-4111-8111-111111111111';
const videoId = '22222222-2222-4222-8222-222222222222';
const overview = 'A scheduling tool that lets teams publish booking pages and send appointment reminders.';
const detail = 'Teams can publish a booking page to let customers choose an available appointment.\n\n- Calendar syncing keeps availability current.\n- Automatic reminders help customers remember their appointments.';
const generated = { shortSummary: overview, detailedSummary: detail };
const note = { id: 'my-note', body: 'Remember to compare this tool with our current booking process.', createdAt: '2026-09-01', updatedAt: '2026-09-01' };

before(async () => {
  process.env.OPENAI_API_KEY = 'test-key-never-sent';
  process.env.API_SECRET = 'test-secret';
  f = await createWorkspaceFixture();
  const aliases = { ...f.aliases };
  for (const name of ['youtube', 'youtube-owner', 'html-text', 'item-summary', 'summary-provider']) {
    aliases[`./${name}`] = aliases[`@/lib/${name}`] = await f.compile(`lib/${name}.ts`, name);
  }
  aliases['./enrich'] = aliases['@/lib/enrich'] = await f.compile('lib/enrich.ts', 'enrich', aliases);
  aliases['@/lib/summary-source'] = await f.compile('lib/summary-source.ts', 'summary-source', aliases);
  summary = await import(aliases['@/lib/item-summary']);
  provider = await import(aliases['@/lib/summary-provider']);
  source = await import(aliases['@/lib/summary-source']);
  route = await import(await f.compile('app/api/summarize/route.ts', 'summarize', aliases));
});

after(async () => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
  if (originalSecret === undefined) delete process.env.API_SECRET;
  else process.env.API_SECRET = originalSecret;
  await f?.close();
});

function aiResponse(value = generated) {
  return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
}

test('new and legacy summaries remain readable without duplicating or deleting user notes', () => {
  const entries = summary.upsertAiSummaryEntry([note], generated);
  assert.deepEqual(summary.getItemSummary({ noteEntries: entries }), generated);
  const again = summary.upsertAiSummaryEntry([...entries, entries[1]], generated);
  assert.equal(again.length, 2);
  assert.deepEqual(again[0], note);
  assert.equal(again[1].id, entries[1].id);
  assert.equal(again[1].createdAt, entries[1].createdAt);
  const old = '--- AI Summary ---\n- **Explain booking workflows.**\n- Sync calendars.';
  assert.deepEqual(summary.getItemSummary({ notes: `My note\n${old}` }), {
    shortSummary: 'Explain booking workflows.', detailedSummary: '- **Explain booking workflows.**\n- Sync calendars.',
  });
  assert.equal(summary.stripLegacyAiSummary(`My note\n${old}`), 'My note');
  assert.equal(summary.getItemSummary({ noteEntries: [{ ...note, body: `  \n${old}` }] }).shortSummary, 'Explain booking workflows.');
  assert.equal(summary.getItemSummary({ noteEntries: [note] }), null);
  assert.equal(summary.getItemSummary({ notes: '--- AI Summary ---' }), null);
});

test('website summary persists both levels, uses real page text, and preserves notes on regeneration', async () => {
  await f.db.insert(f.schema.items).values({ id, type: 'link', url: 'https://example.com/booking', title: 'Booking tool', notes: 'Saved by me', noteEntries: [note] });
  let request;
  globalThis.fetch = async (url, options) => {
    if (url === 'https://example.com/booking') return new Response('<nav>Unrelated menu</nav><main>Publish a booking page. Sync calendars and send automatic reminders. Customers choose available appointments for their team.</main>', { headers: { 'content-type': 'text/html' } });
    assert.equal(url, 'https://api.openai.com/v1/responses');
    request = JSON.parse(options.body);
    return aiResponse();
  };
  const response = await route.POST(f.request('summarize', 'POST', { id }));
  assert.equal(response.status, 200, await response.clone().text());
  const saved = await response.json();
  assert.deepEqual(summary.getItemSummary(saved), generated);
  assert.deepEqual(saved.noteEntries[0], note);
  assert.equal(saved.notes, 'Saved by me');
  assert.match(request.input, /Publish a booking page/);
  assert.doesNotMatch(request.input, /Unrelated menu/);
  assert.equal(request.text.format.type, 'json_schema');
  const second = await route.POST(f.request('summarize', 'POST', { id }));
  assert.equal(second.status, 200);
  assert.equal((await second.json()).noteEntries.length, 2);
  assert.doesNotMatch(request.input, /Teams can publish a booking page to let customers/);
});

test('video summaries reuse the stored transcript without fetching captions again', async () => {
  await f.db.insert(f.schema.items).values({ id: videoId, type: 'link', url: 'https://youtube.com/watch?v=abcdefghijk', title: 'Better bookings', ogDescription: 'Example Channel' });
  const transcript = 'First create a calendar for the team. Then set availability and publish a booking page. Finish by enabling reminders for each appointment.';
  await f.db.insert(f.schema.itemTranscripts).values({ itemId: videoId, text: transcript });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses', 'stored transcripts must prevent another network fetch');
    const input = JSON.parse(options.body).input;
    assert.match(input, /YouTube transcript/);
    assert.ok(input.includes(transcript));
    assert.match(input, /Channel\/author: Example Channel/);
    return aiResponse();
  };
  const response = await route.POST(f.request('summarize', 'POST', { id: videoId }));
  assert.equal(response.status, 200, await response.clone().text());
});

test('provider failures and concurrent edits never overwrite saved summaries or notes', async () => {
  const [before] = await f.db.select().from(f.schema.items).where(eq(f.schema.items.id, id));
  globalThis.fetch = async url => url === 'https://example.com/booking'
    ? new Response('Unavailable', { status: 403 })
    : aiResponse({ shortSummary: 'Only one field' });
  await f.db.update(f.schema.items).set({ content: 'A booking service that helps teams publish calendars, coordinate appointments, and send reminders to their customers.' }).where(eq(f.schema.items.id, id));
  const failure = await route.POST(f.request('summarize', 'POST', { id }));
  assert.equal(failure.status, 500);
  const [unchanged] = await f.db.select().from(f.schema.items).where(eq(f.schema.items.id, id));
  assert.deepEqual(unchanged.noteEntries, before.noteEntries);
  globalThis.fetch = async url => {
    if (url === 'https://example.com/booking') return new Response('', { status: 403 });
    await f.db.update(f.schema.items).set({ notes: 'Edited while summarizing', updatedAt: new Date(Date.now() + 1000) }).where(eq(f.schema.items.id, id));
    return aiResponse();
  };
  const conflict = await route.POST(f.request('summarize', 'POST', { id }));
  assert.equal(conflict.status, 409);
  const [edited] = await f.db.select().from(f.schema.items).where(eq(f.schema.items.id, id));
  assert.equal(edited.notes, 'Edited while summarizing');
  assert.deepEqual(edited.noteEntries, before.noteEntries);
});

test('missing sources do not invent a summary from a title or channel name', async () => {
  await f.db.delete(f.schema.itemTranscripts).where(eq(f.schema.itemTranscripts.itemId, videoId));
  globalThis.fetch = async url => {
    assert.notEqual(url, 'https://api.openai.com/v1/responses');
    return new Response('', { status: 404 });
  };
  assert.equal((await route.POST(f.request('summarize', 'POST', { id: videoId }))).status, 422);
  assert.equal((await route.POST(f.request('summarize', 'POST', { id: 'invalid' }))).status, 400);
  assert.equal((await route.POST(f.request('summarize', 'POST', { id }, false))).status, 401);
});

test('incomplete, refused and malformed provider responses are rejected', async () => {
  for (const data of [
    { status: 'incomplete', output_text: JSON.stringify(generated) },
    { output: [{ content: [{ type: 'refusal', refusal: 'Cannot summarize' }] }] },
    { output_text: 'not JSON' },
    { output_text: JSON.stringify({ shortSummary: '', detailedSummary: detail }) },
  ]) {
    globalThis.fetch = async () => Response.json(data);
    await assert.rejects(provider.summarizeWithOpenAI('Source text', 'fake-key'));
  }
});

test('long source excerpts include the beginning, middle and ending and disclose omissions', () => {
  const result = source.sourceExcerpt('A'.repeat(100) + 'B'.repeat(100) + 'C'.repeat(100), 90);
  assert.match(result, /Source excerpts/);
  assert.ok(result.includes('A'.repeat(30)) && result.includes('B'.repeat(30)) && result.includes('C'.repeat(30)));
});

test('website redirects are rechecked before fetching a private address', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secret' } }); };
  assert.equal(await source.fetchSummaryPageText('https://example.com'), '');
  assert.equal(calls, 1);
});
