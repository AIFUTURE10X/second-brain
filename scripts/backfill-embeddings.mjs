// Backfills items.embedding for cards saved before semantic search existed
// (or while OPENAI_API_KEY was unset). Idempotent — only touches rows where
// embedding IS NULL. Safe to re-run; aborts on the first OpenAI failure.
//
// Usage: node scripts/backfill-embeddings.mjs
// Requires DATABASE_URL + OPENAI_API_KEY (falls back to .env.local for both).
// Run AFTER `node scripts/run-db-setup.mjs` + `npm run db:push`.
import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";
import { buildEmbeddingInput, generateEmbeddings, vectorLiteral } from "../lib/embeddings.mjs";

// Keeps each request well under OpenAI's per-request token limits even when
// every card is at MAX_EMBEDDING_INPUT_CHARS.
const BATCH_SIZE = 25;

for (const key of ["DATABASE_URL", "OPENAI_API_KEY"]) {
  if (!process.env[key]) {
    try {
      const env = await readFile(new URL("../.env.local", import.meta.url), "utf8");
      const value = env.match(new RegExp(`^${key}=(.+)$`, "m"))?.[1]?.trim().replace(/^"|"$/g, "");
      if (value) process.env[key] = value;
    } catch {}
  }
  if (!process.env[key]) {
    console.error(`${key} is not set and .env.local was not readable.`);
    process.exit(1);
  }
}

const sql = neon(process.env.DATABASE_URL);

// Snapshot the pending ids up front: rows whose embedding input is empty stay
// NULL forever, so re-querying `embedding IS NULL` in a loop would never end.
const pending = await sql`SELECT id FROM items WHERE embedding IS NULL ORDER BY created_at`;
console.log(`${pending.length} item(s) without an embedding.`);

let embedded = 0;
let skipped = 0;

for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
  const ids = pending.slice(offset, offset + BATCH_SIZE).map(row => row.id);
  const rows = await sql`
    SELECT id, title, content, url, notes, tags, category,
           note_entries AS "noteEntries",
           checklist_items AS "checklistItems",
           og_title AS "ogTitle",
           og_description AS "ogDescription",
           site_name AS "siteName"
    FROM items
    WHERE id = ANY(${ids}::uuid[]) AND embedding IS NULL
  `;

  const embeddable = rows
    .map(row => ({ row, input: buildEmbeddingInput(row) }))
    .filter(entry => entry.input);
  skipped += rows.length - embeddable.length;
  if (embeddable.length === 0) continue;

  const vectors = await generateEmbeddings(embeddable.map(entry => entry.input));
  if (!vectors) {
    console.error(`OpenAI embedding request failed after ${embedded} item(s) — re-run to resume.`);
    process.exit(1);
  }

  for (let i = 0; i < embeddable.length; i++) {
    await sql.query(
      "UPDATE items SET embedding = $1::vector WHERE id = $2",
      [vectorLiteral(vectors[i]), embeddable[i].row.id]
    );
  }
  embedded += embeddable.length;
  console.log(`Embedded ${embedded}/${pending.length - skipped}…`);
}

console.log(`Done. Embedded ${embedded} item(s), skipped ${skipped} empty card(s).`);
