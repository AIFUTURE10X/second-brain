-- One-time / idempotent database setup that drizzle-kit push cannot do
-- (push can't CREATE EXTENSION). Run against the database in DATABASE_URL
-- after cloning: node scripts/run-db-setup.mjs — or paste into the Neon SQL
-- editor. Run BEFORE `npm run db:push` on a fresh database.
--
-- Indexes are NOT created here: drizzle-kit push drops any index it doesn't
-- know about, so all indexes (including the pg_trgm one on items.title)
-- live in db/schema.ts.

-- Trigram extension for the zero-result fuzzy search fallback
-- ("recat" still surfaces "react" cards via word_similarity on titles).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
