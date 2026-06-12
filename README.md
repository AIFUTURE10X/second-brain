# ◆ Second Brain

Clips, notes, links & thoughts — a single-user personal knowledge app.

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · Neon Postgres · Drizzle ORM · Vercel Blob · Anthropic (auto-tagging) · OpenAI (summaries) · Tailwind CSS

**Satellite clients:** browser extension (`extension/`), Tauri desktop wrapper (`desktop/`), Telegram bot.

## Security model (read this first)

There is **deliberately no login** right now: the web UI is public to anyone
who has the URL, and API routes accept either a same-origin browser request or
the `API_SECRET` bearer token (`x-api-key` header) used by the extension and
scripts. Don't store anything sensitive outside the encrypted vault. A complete
single-user passphrase-auth implementation is parked on the
`phase-0-security` branch, to be finished before the app is ever offered to
other users.

## Features

- **Capture fast** — quick-capture bar mirroring the Telegram grammar: paste a
  URL → link (auto-enriched + AI-tagged), plain text → thought, `/t` → task,
  `/m` → memory. Voice input included.
- **Find things later** — hybrid search: Postgres full-text search over a
  weighted, indexed `tsvector` column (title > tags/category > body/notes >
  link metadata) merged with pgvector semantic search (OpenAI
  `text-embedding-3-small`) via reciprocal rank fusion, plus a trigram fuzzy
  fallback for typos and structured `?tag=/?category=/?type=` filters.
  Semantic ranking activates when `OPENAI_API_KEY` is set; embeddings are
  generated after every save.
- URL enrichment (OpenGraph + YouTube), AI auto-tagging and categorization,
  category hierarchy, tasks with checklists, note entries per card, related
  cards, Telegram reminders + daily digest + memory-of-the-week crons,
  attachments on Vercel Blob, client-side encrypted vault, JSON/CSV/Markdown
  export, offline read via service worker, cross-device edit-conflict
  detection, near-realtime cross-device sync (focused tabs poll `?since=`
  deltas every 45s; deletes propagate via tombstones), offline write queue
  (failed creates/updates/deletes land in IndexedDB and replay on reconnect
  through the same conflict machinery; the service worker stays read-only).

## Setup

```bash
git clone https://github.com/AIFUTURE10X/second-brain.git
cd second-brain
npm install
cp .env.example .env.local   # fill in values — see comments in the file
```

Database (Neon Postgres):

```bash
node scripts/run-db-setup.mjs   # one-time: pg_trgm + pgvector extensions (push can't create them)
npm run db:push                 # apply schema (interactive — review prompts, never run in CI)
node scripts/backfill-embeddings.mjs   # optional: embed pre-existing cards for semantic search
```

Run:

```bash
npm run dev
```

## Commands

```bash
npm run dev        # dev server
npm run build      # production build
npm test           # node --test "tests/*.test.mjs"
npm run lint       # eslint (flat config)
npx tsc --noEmit   # typecheck
npm run db:push    # drizzle-kit push (no migration files by design)
```

Every commit should pass typecheck + lint + test + build — CI
(`.github/workflows/ci.yml`) enforces this on push.

## API

All routes accept `x-api-key: $API_SECRET` (or same-origin browser requests).

| Route | Purpose |
|---|---|
| `GET/POST/PUT/DELETE /api/items` | CRUD; `?q=` hybrid search — indexed FTS merged with pgvector semantic ranking (`x-search-semantic: 1` header when active; `?semantic=0` FTS-only, `?semantic=1` semantic-only) + `x-search-fuzzy` header on typo fallback; `?tag=/?category=/?type=` filters; `?since=<ISO8601>` polling-sync delta → `{ items, deletedIds, serverTime }`; PUT supports optional `expectedUpdatedAt` → `409` + current row on conflict |
| `POST /api/save` | Automation endpoint (extension/Telegram/scripts): `{url}` or `{text}` or `{title, content}` |
| `GET/POST/PUT/PATCH/DELETE /api/categories` | Category CRUD, hierarchy, reorder |
| `GET/POST/PUT/DELETE /api/reminders` | Telegram reminders |
| `GET/POST/DELETE /api/item-relations` | Related-card links |
| `POST /api/tags/merge` | Merge duplicate tags |
| `GET /api/export?format=json\|csv\|markdown` | Backup |
| `POST /api/import` | Restore from JSON export |
| `POST /api/summarize` | OpenAI bullet summary appended to notes |
| `POST /api/upload` | Vercel Blob client-upload handshake |
| `POST /api/telegram` | Bot webhook |
| `GET /api/cron/*` | Vercel crons (require `CRON_SECRET` bearer) |

Request bodies are validated with zod; invalid payloads return
`400 { error, fields }`.

## Satellites

- **Extension** (`extension/`): load unpacked in Chrome, set the deployment URL
  + `API_SECRET` in the popup.
- **Telegram bot**: set `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ALLOWED_USER_ID`, then
  register the webhook against `/api/telegram` (include
  `&secret_token=$TELEGRAM_WEBHOOK_SECRET` if set).
- **Desktop** (`desktop/`): Tauri WebView wrapper pointed at the production
  URL; installer built by `.github/workflows/build-desktop.yml`.

## Backups

`GET /api/export?format=json` returns everything. Take one before any
`db:push` schema change.
