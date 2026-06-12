// Applies scripts/db-setup.sql to the database in DATABASE_URL.
// Usage: node scripts/run-db-setup.mjs
// Falls back to the DATABASE_URL line in .env.local when the env var is unset.
import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";

let url = process.env.DATABASE_URL;
if (!url) {
  try {
    const env = await readFile(new URL("../.env.local", import.meta.url), "utf8");
    url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim().replace(/^"|"$/g, "");
  } catch {}
}
if (!url) {
  console.error("DATABASE_URL is not set and .env.local was not readable.");
  process.exit(1);
}

const sqlFile = await readFile(new URL("./db-setup.sql", import.meta.url), "utf8");
const statements = sqlFile
  .replace(/^\s*--.*$/gm, "")
  .split(";")
  .map(statement => statement.trim())
  .filter(Boolean);

const sql = neon(url);
for (const statement of statements) {
  console.log(`Running: ${statement.replace(/\s+/g, " ").slice(0, 70)}…`);
  await sql.query(statement);
}
console.log(`Applied ${statements.length} statement(s).`);
