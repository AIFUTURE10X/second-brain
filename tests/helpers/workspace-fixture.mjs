import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

// Executes production route/store code against an in-memory Postgres engine.
// Every server dependency is explicit: an unresolved app alias is a hard error.
export async function createWorkspaceFixture({ origin = 'http://localhost' } = {}) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const dir = path.join(root, 'tests', '.tmp', `workspace-${process.pid}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  const out = name => pathToFileURL(path.join(dir, name + '.mjs')).href;
  async function compile(relative, name, replacements = {}) {
    let source = ts.transpileModule(await readFile(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
    source = source.replace(/from\s+(['"])([^'"]+)\1/g, (all, quote, spec) => `from ${quote}${replacements[spec] || spec}${quote}`);
    if (/from\s+['"]@\//.test(source)) throw new Error(`Unmocked application import in ${relative}`);
    await writeFile(path.join(dir, name + '.mjs'), source);
    return out(name);
  }
  const schema = await compile('db/schema.ts', 'schema');
  await writeFile(path.join(dir, 'context.mjs'), `
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { PgDialect } from 'drizzle-orm/pg-core';
import * as schema from '${schema}';
export { NextRequest, NextResponse } from 'next/server.js';
export const after = () => {};
export const pg = await PGlite.create();
const dialect = new PgDialect();
for (const table of [schema.settings, schema.items, schema.itemTranscripts]) {
  const config = getTableConfig(table);
  const columns = config.columns.map(c => {
    const type = c.getSQLType().replace(/^vector.*$/, 'text');
    let def = '';
    if (c.default !== undefined) {
      if (c.default?.queryChunks) def = dialect.sqlToQuery(c.default).sql;
      else if (typeof c.default === 'boolean' || typeof c.default === 'number') def = String(c.default);
      else def = "'" + String(type === 'jsonb' ? JSON.stringify(c.default) : c.default).replaceAll("'", "''") + "'";
    }
    return '"' + c.name + '" ' + type + (def ? ' DEFAULT ' + def : '') + (c.primary ? ' PRIMARY KEY' : '');
  });
  await pg.exec('CREATE TABLE "' + config.name + '" (' + columns.join(',') + ')');
}
export const db = drizzle(pg, { schema });
export const sql = { query: async (text, params) => (await pg.query(text, params)).rows };
export const embeddingsEnabled = () => false;
export const updateItemEmbedding = async () => { throw new Error('Embedding call forbidden in fixture'); };
export const rateLimit = () => ({ allowed: true });
export let providerRequest;
export let providerFailure = false;
export function setProviderFailure(value) { providerFailure = value; }
export async function generateKnowledgeAnswer(options) {
  providerRequest = options;
  if (providerFailure) throw new Error('Fixture provider unavailable');
  return options.mode === 'connections' ? 'Proposal: connect the workflow ideas [1] [2]. Try one small experiment and record the result.' : 'Proposal: test a smaller onboarding flow [1]. Measure activated teams before adopting it.';
}
export const hybridSearchItems = async () => ({ rows: await db.select().from(schema.items), semanticUsed: false, fuzzy: false });
`);
  const context = await import(out('context'));
  const model = pathToFileURL(path.join(root, 'lib/workspace-model.mjs')).href;
  const aliases = { '@/db': out('context'), '@/db/schema': schema, 'next/server': out('context'), '@/lib/rate-limit': out('context'), '@/lib/embeddings.mjs': out('context'), '@/lib/embedding-store': out('context'), '@/lib/search-items': out('context'), './workspace-model.mjs': model, '@/lib/workspace-model.mjs': model };
  aliases['@/lib/api-key'] = await compile('lib/api-key.ts', 'auth', aliases);
  aliases['./validation'] = await compile('lib/validation.ts', 'validation');
  aliases['@/lib/validation'] = aliases['./validation'];
  aliases['@/lib/api-errors'] = await compile('lib/api-errors.ts', 'errors', aliases);
  aliases['@/lib/workspace-store'] = await compile('lib/workspace-store.ts', 'store', aliases);
  for (const name of ['ask-brain.mjs', 'knowledge-passages.mjs']) aliases['@/lib/' + name] = pathToFileURL(path.join(root, 'lib', name)).href;
  await writeFile(path.join(dir, 'provider.mjs'), `export { generateKnowledgeAnswer } from './context.mjs'; export { prepareAttachmentInputs } from '${pathToFileURL(path.join(root, 'lib/knowledge-provider.mjs')).href}';`);
  aliases['@/lib/knowledge-provider.mjs'] = out('provider');
  const routes = {};
  for (const [name, relative] of Object.entries({ records: 'app/api/workspace/records/route.ts', save: 'app/api/workspace/save/route.ts', ask: 'app/api/ask/route.ts', settings: 'app/api/settings/route.ts' })) routes[name] = await import(await compile(relative, name, aliases));
  const store = await import(aliases['@/lib/workspace-store']);
  const schemaModule = await import(schema);
  const { NextRequest } = context;
  function request(route, method = 'GET', data, authorized = true, query = '') {
    return new NextRequest(`${origin}/api/${route === 'ask' ? 'ask' : `workspace/${route}`}${query}`, {
      method, headers: { ...(authorized ? { 'sec-fetch-site': 'same-origin' } : {}), 'Content-Type': 'application/json' },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  }
  return { ...context, context, store, routes, request, schema: schemaModule, close: async () => {
    await context.pg.close();
    const relative = path.relative(path.join(root, 'tests', '.tmp'), path.resolve(dir));
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe fixture cleanup path');
    await rm(path.resolve(dir), { recursive: true, force: true });
  } };
}
