import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/db";
import { checkApiKey } from "@/lib/api-key";
import { serverError } from "@/lib/api-errors";

export const maxDuration = 60;

// One-click schema migration: brings a database created before the
// tier 1-3 feature work up to the current schema. Every statement is
// additive and idempotent (IF NOT EXISTS), so calling this repeatedly —
// or on an already-migrated database — is a no-op. Mirrors what
// `node scripts/run-db-setup.mjs && npm run db:push` would do, but runs
// inside the deployment so no local DATABASE_URL is needed:
//
//   open https://<app>/api/admin/migrate            (same-origin browser)
//   curl -X POST https://<app>/api/admin/migrate -H "x-api-key: $API_SECRET"
const MIGRATION_STATEMENTS: [name: string, statement: string][] = [
  // Extensions (push can't create these; Neon ships both).
  ["pg_trgm extension", `CREATE EXTENSION IF NOT EXISTS pg_trgm`],
  ["pgvector extension", `CREATE EXTENSION IF NOT EXISTS vector`],
  // Semantic search (roadmap 1.1)
  ["items.embedding", `ALTER TABLE items ADD COLUMN IF NOT EXISTS embedding vector(1536)`],
  // Archive (2.4), read-later (2.9), recurring tasks (2.11)
  ["items.archived_at", `ALTER TABLE items ADD COLUMN IF NOT EXISTS archived_at timestamp`],
  ["items.reading_status", `ALTER TABLE items ADD COLUMN IF NOT EXISTS reading_status text`],
  ["items.recurrence", `ALTER TABLE items ADD COLUMN IF NOT EXISTS recurrence text`],
  // Reminder snooze + recurrence (2.8)
  ["reminders.snoozed_until", `ALTER TABLE reminders ADD COLUMN IF NOT EXISTS snoozed_until timestamp`],
  ["reminders.recurrence", `ALTER TABLE reminders ADD COLUMN IF NOT EXISTS recurrence text`],
  // Polling-sync delete tombstones (1.2)
  [
    "deleted_items table",
    `CREATE TABLE IF NOT EXISTS deleted_items (
      id uuid PRIMARY KEY,
      deleted_at timestamp DEFAULT now() NOT NULL
    )`,
  ],
  ["deleted_items index", `CREATE INDEX IF NOT EXISTS deleted_items_deleted_idx ON deleted_items USING btree (deleted_at)`],
  ["items.updated_at index", `CREATE INDEX IF NOT EXISTS items_updated_idx ON items USING btree (updated_at)`],
  ["items.embedding HNSW index", `CREATE INDEX IF NOT EXISTS items_embedding_hnsw_idx ON items USING hnsw (embedding vector_cosine_ops)`],
];

async function runMigration(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const applied: string[] = [];
  try {
    for (const [name, statement] of MIGRATION_STATEMENTS) {
      await sql.query(statement);
      applied.push(name);
    }
    return NextResponse.json({
      ok: true,
      applied,
      note: "Schema is up to date. Optionally backfill embeddings for existing cards via /api/admin/backfill-embeddings (repeat until remaining is 0).",
    });
  } catch (error) {
    console.error("Migration failed:", error);
    return serverError(error);
  }
}

// GET is supported so the migration can be triggered by opening the URL in
// a browser — it's idempotent and additive, so repeat calls are harmless.
export async function GET(req: NextRequest) {
  return runMigration(req);
}

export async function POST(req: NextRequest) {
  return runMigration(req);
}
