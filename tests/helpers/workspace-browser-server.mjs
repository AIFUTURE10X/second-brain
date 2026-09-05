// Local-only walkthrough host. App routes execute with an in-memory database;
// provider output is deterministic. Unknown API paths never reach Next or a network provider.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { createWorkspaceFixture } from './workspace-fixture.mjs';

process.env.API_SECRET = 'fixture-only';
process.env.OPENAI_API_KEY = 'fixture-only';
const f = await createWorkspaceFixture({ origin: 'http://127.0.0.1:3180' });
const old = new Date(Date.now() - 40 * 86400000);
const recent = new Date(Date.now() - 86400000);
await f.db.insert(f.schema.items).values([
  { id: '11111111-1111-4111-8111-111111111111', title: 'Activation notes', type: 'note', content: 'Improve onboarding activation with smaller steps.', category: 'Product', tags: ['workflow', 'activation'], createdAt: old, updatedAt: old, attachments: [{ url: 'https://fixture.public.blob.vercel-storage.com/activation.pdf', name: 'Activation report.pdf', contentType: 'application/pdf', size: 1200 }] },
  { id: '22222222-2222-4222-8222-222222222222', title: 'Welcome workflow', type: 'link', content: 'A hospitality welcome workflow reduces waiting by preparing the next step.', url: 'https://youtube.com/watch?v=abcdefghijk', category: 'Hospitality', tags: ['workflow'], createdAt: recent, updatedAt: recent },
  { id: '33333333-3333-4333-8333-333333333333', title: 'Review onboarding', type: 'task', content: 'Review the activation flow', category: 'Product', tags: ['activation'], actionRequired: true, createdAt: old, updatedAt: old },
]);
await f.db.insert(f.schema.itemTranscripts).values({ itemId: '22222222-2222-4222-8222-222222222222', text: 'Unrelated introduction. '.repeat(100) + '\n[12:34] Prepare each welcome step before the guest arrives. Reduce waiting through workflow planning.' });
if (process.argv.includes('--restore-fixture')) {
  const snapshot = JSON.parse(await readFile(new URL('../.tmp/workspace-browser-state.json', import.meta.url), 'utf8'));
  await f.store.restoreWorkspaceRecords(snapshot.records);
  for (const item of snapshot.items.filter(i => !['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'].includes(i.id))) {
    for (const key of ['createdAt', 'updatedAt', 'reviewedAt', 'completedAt', 'archivedAt']) if (item[key]) item[key] = new Date(item[key]);
    item.websiteLinks = (item.websiteLinks || []).map(link => ({ ...link, url: link.url.replace('http://localhost/card/', 'http://127.0.0.1:3180/card/') }));
    delete item.embedding; delete item.searchTsv;
    await f.db.insert(f.schema.items).values(item);
  }
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost:3180');
    if (!url.pathname.startsWith('/api/')) {
      const headers = { ...req.headers, host: '127.0.0.1:3181' };
      const upstream = http.request({ hostname: '127.0.0.1', port: 3181, path: req.url, method: req.method, headers }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
      upstream.on('error', () => { res.writeHead(502); res.end('Local Next server is not ready'); });
      req.pipe(upstream); return;
    }
    const chunks = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    const body = raw ? JSON.parse(raw) : undefined;
    let response;
    if (url.pathname === '/api/workspace/records') response = await f.routes.records[req.method](f.request('records', req.method, body, true, url.search));
    else if (url.pathname === '/api/workspace/save') response = await f.routes.save.POST(f.request('save', 'POST', body));
    else if (url.pathname === '/api/ask') response = await f.routes.ask.POST(f.request('ask', 'POST', body));
    else if (url.pathname === '/api/items' && req.method === 'GET') {
      const rows = await f.db.select().from(f.schema.items);
      const id = url.searchParams.get('id');
      response = id ? Response.json(rows.find(r => r.id === id) || { error: 'Not found' }, { status: rows.some(r => r.id === id) ? 200 : 404 }) : Response.json(url.searchParams.has('since') ? { items: rows, deletedIds: [], serverTime: new Date().toISOString() } : rows);
    } else if (url.pathname === '/api/categories') response = Response.json([{ id: 'product', name: 'Product', color: '#E8A838', parentId: null }, { id: 'hospitality', name: 'Hospitality', color: '#5B8DEF', parentId: null }]);
    else if (url.pathname === '/api/reminders') response = Response.json([]);
    else if (url.pathname === '/api/item-relations') response = Response.json([]);
    else if (url.pathname === '/api/settings') response = Response.json({});
    else if (url.pathname === '/api/transcript' && req.method === 'GET') response = Response.json({ transcript: (await f.db.select().from(f.schema.itemTranscripts).where(eq(f.schema.itemTranscripts.itemId, url.searchParams.get('itemId'))))[0] || null });
    else if (url.pathname === '/api/app-version') response = Response.json({ version: 'fixture' });
    else response = Response.json({ error: 'API unavailable in local fixture' }, { status: 404 });
    res.writeHead(response.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(await response.text());
  } catch (error) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
});
// Turbopack waits for its development socket before hydrating the page.
server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/_next/webpack-hmr')) { socket.destroy(); return; }
  const upstream = http.request({ hostname: '127.0.0.1', port: 3181, path: req.url, headers: { ...req.headers, host: '127.0.0.1:3181' } });
  upstream.on('upgrade', (response, peer, peerHead) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\n' + Object.entries(response.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n');
    if (head.length) peer.write(head);
    if (peerHead.length) socket.write(peerHead);
    socket.pipe(peer); peer.pipe(socket);
    socket.on('error', () => peer.destroy()); peer.on('error', () => socket.destroy());
  });
  upstream.on('error', () => socket.destroy()); upstream.end();
});
server.listen(3180, '127.0.0.1', () => console.info('Isolated workspace walkthrough: http://127.0.0.1:3180/workspace'));
const stop = () => server.close(async () => { await f.close(); process.exit(0); });
process.on('SIGINT', stop); process.on('SIGTERM', stop);
