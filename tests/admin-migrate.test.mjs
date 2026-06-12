import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrateSource = await readFile(new URL("../app/api/admin/migrate/route.ts", import.meta.url), "utf8");
const backfillSource = await readFile(new URL("../app/api/admin/backfill-embeddings/route.ts", import.meta.url), "utf8");
const schemaSource = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");

test("admin migration covers every schema object added by the roadmap work", () => {
  for (const fragment of [
    "CREATE EXTENSION IF NOT EXISTS pg_trgm",
    "CREATE EXTENSION IF NOT EXISTS vector",
    "ADD COLUMN IF NOT EXISTS embedding vector(1536)",
    "ADD COLUMN IF NOT EXISTS archived_at timestamp",
    "ADD COLUMN IF NOT EXISTS reading_status text",
    "ADD COLUMN IF NOT EXISTS recurrence text",
    "ADD COLUMN IF NOT EXISTS snoozed_until timestamp",
    "CREATE TABLE IF NOT EXISTS deleted_items",
    "CREATE INDEX IF NOT EXISTS deleted_items_deleted_idx",
    "CREATE INDEX IF NOT EXISTS items_updated_idx",
    "CREATE INDEX IF NOT EXISTS items_embedding_hnsw_idx ON items USING hnsw (embedding vector_cosine_ops)",
  ]) {
    assert.ok(migrateSource.includes(fragment), `missing: ${fragment}`);
  }
});

test("every migration statement is idempotent (IF NOT EXISTS)", () => {
  const statements = [...migrateSource.matchAll(/`((?:CREATE|ALTER)[\s\S]*?)`/g)].map(m => m[1]);
  assert.ok(statements.length >= 11);
  for (const statement of statements) {
    assert.match(statement, /IF NOT EXISTS/, `not idempotent: ${statement.slice(0, 60)}`);
  }
});

test("migration matches the drizzle schema's recurrence columns on both tables", () => {
  // items + reminders each have a recurrence column; the migration must add both.
  const recurrenceAlters = migrateSource.match(/ALTER TABLE (items|reminders) ADD COLUMN IF NOT EXISTS recurrence text/g) || [];
  assert.equal(recurrenceAlters.length, 2);
  assert.match(schemaSource, /recurrence: text\("recurrence"\)/);
});

test("serverless embedding backfill is batched, resumable, and auth-checked", () => {
  assert.match(backfillSource, /checkApiKey/);
  assert.match(backfillSource, /WHERE embedding IS NULL/);
  assert.match(backfillSource, /remaining/);
  assert.match(backfillSource, /TIME_BUDGET_MS/);
});
