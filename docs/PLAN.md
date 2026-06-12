# Second Brain — Production-Readiness Plan

App/repo root: `C:\Projects\Second Brain\second-brain` (branch `main`). On approval, step 0 is: create the feature branch and commit this plan as `docs/PLAN.md`. **No implementation until then; feature branches only, never direct to `main`.**

## Context

Second Brain ("Clips, notes, links & thoughts — synced across all your devices") is a personal Next.js 16.2.2 + Neon/Drizzle + Vercel Blob app with satellite clients (browser extension, Tauri desktop wrapper, Telegram bot). The user wants it production-ready with great UX. Exploration found:

- **The web UI is fully public** — no middleware, no login. Anyone with the URL sees every note.
- **The API guard is forgeable**: `lib/api-key.ts` trusts the `Sec-Fetch-Site: same-origin` header (any curl can send it), accepts `?key=` in query params (leaks into logs), uses non-constant-time compare, and allows-all when `API_SECRET` is unset. Cron + Telegram auth are similarly fail-open.
- **README is fiction**: claims Next 14 + NextAuth + GitHub OAuth; none exist. `.env.example` lists NextAuth vars the code never reads.
- **The entire UI is one 3,975-line client component** (`components/Brain.tsx`).
- **"Cross-device sync"** = fetch-on-load + BroadcastChannel (cross-tab only). Concurrent edits = silent last-write-wins; `updatedAt` exists but is never checked.
- **Search (the user's #1 pain point — "finding things later")**: server FTS exists (`GET /api/items?q=`) but computes `to_tsvector` over a LATERAL haystack per-row per-query — unindexable seq scan; haystack omits `note_entries` (annotations unsearchable); `lib/item-search.ts` has a bug where 4-letter terms skip prefix matching; tag clicks just stuff the tag into the search box.
- Healthy: `tsc --noEmit` = 0 errors (strict), toast system + ErrorBoundary exist, 18 node:test files, schema is solid (items/categories/relations/reminders/encrypted vault), SSRF guard on URL enrichment. NOT in git: `.env.local` (verified untracked — an audit agent's claim it was committed is false).
- Verified nuances: desktop app is a pure WebView wrapper pointing at the prod URL (no API key code — needs only a one-time login after auth lands); extension already sends `x-api-key` header (one `?key=` usage in test-connection); `/api/upload` is a Vercel Blob `handleUpload` route whose `onUploadCompleted` callback must not be 401'd by middleware (carries `x-vercel-signature`); summarize uses OpenAI (`OPENAI_API_KEY`), tagging uses Anthropic; item `type` includes `task` and `memory` beyond the documented four; no drizzle migrations — workflow is `db:push`.

## User decisions (final)

1. **Auth**: single-user login — one passphrase → HMAC session cookie + middleware gating all pages/APIs. Satellites keep a fixed bearer token, properly verified. No users table.
2. **UI**: polish the current single-page card grid (quick-capture bar, better filter row, consistent loading/empty/error states). No nav redesign.
3. **Scope (all in)**: repo structure cleanup, incremental Brain.tsx decomposition, satellite client token updates, sync conflict handling via `updatedAt`.
4. **#1 UX priority**: finding things later.

## Branch/commit strategy

One branch per phase (`phase-0-security`, `phase-1-ux`, `phase-2-hardening`). Every commit passes `npx tsc --noEmit && npm run lint && node --test tests/ && npm run build`. Merge only after the phase's verification matrix is green on a **Vercel preview deployment** (never test auth lockout on production).

---

# Phase 0 — Week-1 security: lock the door (URGENT, pulled forward; ~2–4 days)

**Goal:** every page and API route requires a valid session cookie or bearer token. Kill the `sec-fetch-site` bypass, query-param key, non-constant-time compare, and all fail-open defaults.

**Session design (no new deps):** hand-rolled HMAC token via Web Crypto (works in middleware Edge runtime and Node routes). Cookie `sb_session`, httpOnly, Secure, SameSite=Lax, 30-day Max-Age. Format: `v1.<expiresAtMs>.<base64url(HMAC-SHA256(AUTH_SECRET, "sb-session.v1."+expiresAtMs))>`. New env vars: `AUTH_SECRET` (32+ random bytes), `AUTH_PASSPHRASE_HASH` (SHA-256 hex of a long random passphrase; login hashes input and compares fixed-length digests — timing-safe). iron-session/jose rejected: session carries no data, ~50 lines suffice, fully node:test-able.

**`checkApiKey` replacement (`lib/auth.ts`):** `requireAuth(req)` = valid session cookie OR `verifyApiToken` (Authorization: Bearer, plus legacy `x-api-key` during transition; constant-time via SHA-256-digest XOR compare; **fail closed if `API_SECRET` unset**). Removed: sec-fetch-site trust, `?key=`, raw `===`. Keep per-route call sites as defense-in-depth under middleware.

**Middleware (`middleware.ts` at repo root):** matcher excludes only static assets (`_next/static`, `_next/image`, favicon, icons, manifest, sw.js); policy in code:
- Public: `/login`, `/api/auth/login`, `/api/telegram` (self-authed via Telegram secret token), `/api/cron/*` (self-authed via `CRON_SECRET` bearer — Vercel cron keeps working), `/api/app-version`.
- `/api/upload` with `x-vercel-signature` header: pass through (handleUpload verifies the callback itself).
- Other `/api/*`: session or token → next, else 401 JSON.
- Pages (`/`, `/card/[id]`, `/share`): session → next, else 307 to `/login?next=<path>` (sanitize: must start with `/`, not `//`).

| # | Item | Files | Size |
|---|------|-------|------|
| 0.1 | Session lib (mint/verify) + tests | ✚ `lib/session.ts`, ✚ `tests/session.test.mjs` | S |
| 0.2 | `lib/auth.ts`; swap `checkApiKey(req)` → `await requireAuth(req)` in 13 routes; delete `lib/api-key.ts` | ✚ `lib/auth.ts`, ✎ `app/api/{items,save,categories,settings,reminders,item-relations,tags/merge,export,import,upload,vault,summarize,admin/fix-yt-thumbs}/route.ts` | M |
| 0.3 | Login page + auth routes; rate-limit login 5/min/IP with existing `lib/rate-limit.ts` | ✚ `app/login/page.tsx`, ✚ `app/api/auth/{login,logout}/route.ts`, ✎ `lib/rate-limit.ts` | M |
| 0.4 | Middleware gate + logout button in Brain header | ✚ `middleware.ts`, ✎ `components/Brain.tsx` | M |
| 0.5 | Fail-closed cron (`verifyCronAuth`: unset secret → false) + require `TELEGRAM_WEBHOOK_SECRET`; re-register webhook with `secret_token` | ✎ `lib/telegram.ts`, ✎ `app/api/telegram/route.ts` | S |
| 0.6 | Extension: drop `?key=` from test call, send `Authorization: Bearer` | ✎ `extension/popup.js` | S |
| 0.7 | Add new env vars to `.env.example` (full rewrite in Phase 2); generate + set secrets in Vercel; **rotate `API_SECRET`** (old value has leaked into logs via `?key=`) | ✎ `.env.example` | S |
| 0.8 | SW hygiene: bump `CACHE_VERSION`; logout posts `CLEAR_RUNTIME_CACHES` (handler exists in sw.js) | ✎ `public/sw.js` | S |

**Verification (against preview deploy):**
```bash
curl -i https://<preview>/api/items                                   # 401
curl -i -H "sec-fetch-site: same-origin" https://<preview>/api/items  # 401 (the old hole)
curl -i "https://<preview>/api/items?key=$API_SECRET"                 # 401 (query param dead)
curl -i -H "Authorization: Bearer $API_SECRET" https://<preview>/api/items  # 200
curl -i https://<preview>/                                            # 307 → /login
curl -i https://<preview>/api/cron/daily-digest                       # 401
curl -i -H "Authorization: Bearer $CRON_SECRET" .../api/cron/daily-digest   # 200
```
Manual: login on browser + phone PWA + desktop app (one-time each); extension save; Telegram message after webhook re-registration; attachment upload (validates blob-callback exception); trigger each cron from Vercel dashboard.

**Risks:** lockout (test full login on preview first; Vercel instant-rollback is break-glass) · **satellite breakage** — rotating `API_SECRET` breaks the extension until re-entered in its popup; Telegram until webhook re-registered; any `?key=`-style callers (iOS Shortcuts etc.) must move the key to a header — document · blob `onUploadCompleted` 401 if the signature exception is missed. No schema changes → no data-loss risk.

---

# Phase 1 — UX: capture fast, find things later

## 1A. Brain.tsx decomposition (incremental, behavior-preserving; one extraction per commit, never extract + restyle together)

Extraction order: **(1)** `lib/brain-model.ts` + `lib/brain-format.ts` — pure types/constants/helpers (`timeAgo`, `formatStamp`, `sourceFromUrl`, …), zero render risk, makes them testable; **(2)** `components/brain/TelegramHelpMenu.tsx` — self-contained popover (Brain.tsx:1783-1863), proves the pattern; **(3)** `components/brain/ItemCard.tsx` — card render (~2470-2990), the big de-risking move, required before state/style work; **(4)** `components/brain/FilterBar.tsx` — extracted together with the filter-row redesign (1.6); **(5)** `components/brain/ItemFormModal.tsx` — add/edit modal + draft-autosave effects, most entangled, do last. Filter state stays in Brain, passed as props; `git diff --stat` shows Brain.tsx only shrinking.

## 1B. Search overhaul (the pain point)

**Approach: weighted `GENERATED ALWAYS AS … STORED` tsvector column + GIN index** (primary), `pg_trgm` GIN on title as zero-result fuzzy fallback. Weights: A=title; B=tags+category (`simple` config — don't stem tags); C=content+notes+**note_entries**(fixes the gap)+checklist_items; D=og fields+url. Stay on the `db:push` workflow (no migration-system adoption mid-flight); `CREATE EXTENSION pg_trgm` + trgm index via idempotent `scripts/db-setup.sql` (push can't create extensions). Rewrite `?q=` to `WHERE search_tsv @@ query ORDER BY pinned DESC, ts_rank_cd(...) DESC`; on 0 rows fall back to `word_similarity` flagged `fuzzy: true`. Fix `lib/item-search.ts` (delete the `length !== 4` prefix-match exception) and keep `lib/card-search.ts` consistent. **Fallback if the generated-column expression is rejected as non-immutable (jsonb casts): expression GIN index directly on `to_tsvector(...)` — no schema column needed.**

| # | Item | Files | Size |
|---|------|-------|------|
| 1.1 | Extractions 1–2 (model/format libs, help menu) + tests | ✚ `lib/brain-model.ts`, `lib/brain-format.ts`, `components/brain/TelegramHelpMenu.tsx`, `tests/brain-format.test.mjs`; ✎ `Brain.tsx` | M |
| 1.2 | FTS column + GIN + trgm + route rewrite + tsquery fix | ✎ `db/schema.ts`, `app/api/items/route.ts`, `lib/item-search.ts`, `lib/card-search.ts`, `tests/item-search.test.mjs`; ✚ `scripts/db-setup.sql` | M |
| 1.3 | Structured filters: `?tag=`/`?category=`/`?type=` params (jsonb `tags @> …`); tag clicks set a real `tagFilter` instead of stuffing the search box; active-filter chips | ✎ `app/api/items/route.ts`, `Brain.tsx` | M |
| 1.4 | Extract `ItemCard` (extraction 3) | ✚ `components/brain/ItemCard.tsx`; ✎ `Brain.tsx` | L |
| 1.5 | Persistent quick-capture bar: paste URL→link, text→thought, `/t `→task (mirrors Telegram grammar); Enter saves, optimistic insert + toast | ✚ `components/brain/QuickCaptureBar.tsx`; ✎ `Brain.tsx` | M |
| 1.6 | Filter row redesign + `FilterBar` extraction: one row = search/type/category/tags/sort; secondary toggles into "More filters" popover with count badges; "Clear all" | ✚ `components/brain/FilterBar.tsx`; ✎ `Brain.tsx` | L |
| 1.7 | Loading/empty/error states: skeleton grid; three empty states (new brain / no matches + fuzzy suggestion + clear-filters / fetch error + retry); inline search spinner | ✚ `components/brain/{EmptyState,SkeletonCard}.tsx`; ✎ `Brain.tsx`, `ItemCard.tsx` | M |
| 1.8 | Extract `ItemFormModal` (extraction 5) | ✚ `components/brain/ItemFormModal.tsx`; ✎ `Brain.tsx` | L |
| 1.9 | Mobile pass: filter row h-scroll on `<sm`, capture above the fold, ≥44px tap targets, full-screen modal on mobile | ✎ `components/brain/*.tsx`, `app/globals.css` | M |

**Verification:** after every extraction, typecheck + build + manual smoke (create/edit/delete each type, expand card, attach, pin, tag click, category filter, density toggle). Search: seed ≥500 items on a **Neon branch**; `EXPLAIN ANALYZE` shows GIN index scan; text inside a note entry now matches (regression vs today); typo "recat" suggests "react". Take an `/api/export` backup before `db:push`; **never accept a push prompt that drops/truncates a column**; run push interactively, never in CI.

**Risks:** Brain.tsx regressions (mitigated by extraction-per-commit + smoke script) · generated-column immutability (fallback above) · table rewrite lock on push (seconds at this size; test on Neon branch first). Satellite impact: none — API changes are additive.

---

# Phase 2 — Hardening

| # | Item | Files | Size |
|---|------|-------|------|
| 2.1 | **zod on all routes**: schemas for item create/update (type enum incl. `task`/`memory`), save, category, settings, reminder, relation, tags/merge, import, vault, login; `safeParse` → 400 with field errors; `.strict()` on update **fixes a real mass-assignment hole** (PUT spreads raw `...updates` into the DB, items/route.ts:243) | ✚ `lib/validation.ts`, `tests/validation.test.mjs`; ✎ all route files; `npm i zod` | L |
| 2.2 | **Error responses**: `jsonError(status, publicMsg)` helper + try/catch per route; generic 500s, real error to `console.error`; remove `(error as Error).message` passthroughs (e.g. upload/route.ts:57) | ✚ `lib/api-errors.ts`; ✎ routes (combined with 2.1 commits) | M |
| 2.3 | **Rate limiting (documented tradeoff)**: keep in-memory for authed expensive routes (summarize); add Postgres-backed limiter for `/api/auth/login` only (the sole unauthenticated brute-forceable surface) — `login_attempts` table, upsert-increment per IP+window, fail closed at 5/min, cron-time cleanup; document the no-Redis tradeoff in README | ✚ `lib/pg-rate-limit.ts`, `tests/pg-rate-limit.test.mjs`; ✎ `db/schema.ts`, `app/api/auth/login/route.ts` | M |
| 2.4 | **Sync conflict handling**: PUT accepts optional `expectedUpdatedAt`; update `WHERE id=? AND date_trunc('milliseconds', updated_at)=date_trunc('milliseconds', ?::timestamptz)` (µs-vs-ms round-trip would false-conflict otherwise); 0 rows + exists → **409 with current server row**; client conflict dialog: "Changed on another device" → [Use server version] / [Overwrite]. Old clients omit the field → last-write-wins, **no satellite breakage** | ✚ `components/brain/ConflictDialog.tsx`; ✎ `app/api/items/route.ts`, `Brain.tsx`, `lib/item-updates.mjs`, `tests/item-updates.test.mjs` | L |
| 2.5 | **CI**: GitHub Actions on push/PR — `npm ci`, typecheck, lint, `npm test`, build (dummy env vars in workflow); add missing `"test": "node --test tests/"` script | ✚ `.github/workflows/ci.yml`; ✎ `package.json` | S |
| 2.6 | **README + .env.example rewrite to reality**: Next 16, passphrase login, bearer tokens for satellites; real env list (`DATABASE_URL`, `AUTH_SECRET`, `AUTH_PASSPHRASE_HASH`, `API_SECRET`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `TELEGRAM_*`); delete NextAuth/GitHub fiction; document extension/Telegram/desktop setup, crons, `scripts/db-setup.sql`, `/api/export` backups | ✎ `README.md`, `.env.example`, extension/desktop docs | S |
| 2.7 | **Repo structure cleanup** (parent `C:\Projects\Second Brain\`): keep git root where it is (moving = all risk, no payoff). Delete parent-level `tests/` (verified empty), `.playwright-mcp/`; inspect then delete `second-brain.zip` (`unzip -l` first — Apr 8 snapshot) and `desktop-build/` **after** confirming the desktop CI workflow still produces the installer artifact; add `desktop/dist/`, `desktop/src-tauri/target/`, `.playwright-mcp/` to `.gitignore` | parent-folder deletions; ✎ `.gitignore` | S |
| 2.8 | **Retire legacy `x-api-key`** once extension update confirmed installed | ✎ `lib/auth.ts`, docs | S |

**Verification:** CI green on its own PR; malformed payloads → 400 never 500; PUT with unknown column rejected; two-tab concurrent edit → conflict dialog, Overwrite wins, BroadcastChannel still refreshes; 6 wrong passphrases → 429 surviving redeploy; desktop installer artifact downloads + installs **before** `desktop-build/` deletion. **FLAG: zip + desktop-build deletions are irreversible — inspect both first.**

---

# Phase 3 — Deferred (sketch)

- **Near-real-time sync**: focus-aware 30–60s polling of `GET /api/items?since=<updatedAt>` (add `updated_at` index) before considering SSE.
- **Offline writes**: IndexedDB mutation queue replayed through the Phase 2 conflict machinery; current SW stays read-only.
- **Public share links**: `/card/[id]` is now login-gated; if sharing is wanted, signed share tokens (`?share=<HMAC>`) reusing `lib/session.ts` primitives.
- **Multi-user**: explicitly out (users table + per-row ownership + real identity); revisit only if requirements change.
- **Semantic search**: pgvector on Neon + save-time embeddings, hybrid-ranked with the Phase 1 FTS; Telegram `/find` reusing the same endpoint.

## Key files

`lib/api-key.ts` (replaced) · `middleware.ts` + `lib/session.ts` + `lib/auth.ts` (new) · `app/api/items/route.ts` (FTS, filters, zod, concurrency) · `components/Brain.tsx` (decomposition source) · `db/schema.ts` (tsvector + login_attempts) · `lib/telegram.ts` (fail-closed cron/webhook).
