import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
const env = readFileSync(envPath, "utf8");
const dbUrl = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.replace(/^["']|["']$/g, "");
if (!dbUrl) throw new Error("DATABASE_URL missing from .env.local");

const sql = neon(dbUrl);
const result = await sql`
  UPDATE items
  SET og_image = REPLACE(og_image, '/maxresdefault.jpg', '/hqdefault.jpg'),
      updated_at = NOW()
  WHERE og_image LIKE 'https://img.youtube.com/vi/%/maxresdefault.jpg'
  RETURNING id, title, og_image
`;

console.log(`Updated ${result.length} item(s):`);
for (const r of result) console.log(`  - ${r.title || "(untitled)"} -> ${r.og_image}`);
