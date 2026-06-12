# Second Brain — Project Notes

Personal single-user app: clips, notes, links & thoughts. Next.js 16.2.2 (App Router) ·
React 19 · Neon Postgres + Drizzle · Vercel Blob · Anthropic (auto-tagging) · OpenAI (summaries).
Satellite clients: `extension/` (browser), `desktop/` (Tauri WebView wrapper), Telegram bot.

## The plan

`docs/PLAN.md` is the approved production-readiness plan. Work it phase by phase:

- **Phase 0 (security)** — DONE on branch `phase-0-security` (9 commits, pushed 2026-06-12).
  Locally verified (full curl auth matrix). **Not merged yet** — blocked on user actions below.
- **Phase 1 (UX: search/FTS + Brain.tsx decomposition)** — next. Extraction order in PLAN.md §1A.
- **Phase 2 (hardening)** — zod, conflict handling, CI, README rewrite, repo cleanup.

### Pending user actions before Phase 0 merge
1. `node scripts/generate-auth-env.mjs "<passphrase>"` → set `AUTH_SECRET` + `AUTH_PASSPHRASE_HASH`
   in Vercel (Preview + Production) and `.env.local`.
2. Rotate `API_SECRET` in Vercel (old value leaked into logs via `?key=` for months).
3. Set `CRON_SECRET` and `TELEGRAM_WEBHOOK_SECRET` in Vercel.
4. Verify the preview deployment (login, extension save, upload), then merge.
5. After production deploy: re-enter the new key in the extension popup; re-register the Telegram
   webhook with `&secret_token=<TELEGRAM_WEBHOOK_SECRET>`; log in once in the desktop app.

## Commands (gotchas included)

```bash
npm run dev                        # dev server
npm run build                      # production build
npm test                           # = node --test "tests/*.test.mjs" — plain `node --test tests/` FAILS
npm run lint                       # eslint . (flat config in eslint.config.mjs — next lint is gone in Next 16)
npx tsc --noEmit --incremental false
npm run db:push                    # drizzle-kit push — NO migration files; run interactively, never in CI
```

Every commit must pass: typecheck + lint + test + build. One feature branch per phase.

## Conventions & architecture notes

- **Auth**: `proxy.ts` at repo root is the global gate (Next 16 convention — do NOT create
  `middleware.ts`, it's deprecated). Session = HMAC cookie (`lib/session.ts`); API clients send
  `Authorization: Bearer <API_SECRET>` (`lib/auth.ts`, constant-time, fail-closed). Legacy
  `x-api-key` header still accepted — retire in Phase 2.8 once the extension update is confirmed.
- **UI**: almost everything lives in `components/Brain.tsx` (~4,000 lines). Decompose as-you-touch
  per PLAN.md §1A — one extraction per commit, never extract + restyle together.
- **Tests**: node:test, `.mjs` files in `tests/` that transpile TS imports on the fly via the
  `typescript` package (see `tests/view-mode.test.mjs` for the loader pattern).
- **Lint**: `react-hooks/set-state-in-effect` is downgraded to *warn* (legacy fetch-in-effect
  everywhere); don't add new violations.
- **Search**: server FTS in `GET /api/items?q=` is currently an unindexed per-row tsvector and
  misses `note_entries` — Phase 1.2 replaces it with a generated tsvector column + GIN index.
- **Cross-tab sync**: BroadcastChannel (`lib/sync.ts`) — cross-tab only, NOT cross-device.
  Conflict handling (optimistic concurrency on `updatedAt`) is Phase 2.4.
- **Vercel**: project `second-brain`; crons in `vercel.json` authenticate via `CRON_SECRET`
  bearer. The Vercel MCP token available in Claude Code sessions is scoped to a different team
  and CANNOT see this project — use the dashboard.
