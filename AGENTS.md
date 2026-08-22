# AGENTS.md

## Cursor Cloud specific instructions

Second Brain is a single Next.js 16 app (App Router + Turbopack, React 19). The
UI and all `/api/*` route handlers run in one `next dev` process. Standard
commands live in `package.json` / `README.md`:

- `npm run dev` — dev server on `http://localhost:3000`
- `npm run lint` · `npm test` · `npx tsc --noEmit` · `npm run build`

The update script already runs `npm ci`, so dependencies are installed on
startup. The notes below are the non-obvious bits for getting the app to run
end-to-end.

### Database is required at runtime (and is the only real gotcha)

`db/index.ts` uses the `@neondatabase/serverless` **HTTP** driver, which always
issues `POST https://api.<db-host>/sql` (it rewrites the first DNS label of the
`DATABASE_URL` host to `api.`). So the app cannot talk to a plain local Postgres
directly — it needs an endpoint speaking Neon's SQL-over-HTTP protocol. Two ways
to provide one:

1. **Canonical:** set a real Neon `DATABASE_URL` (and `API_SECRET`) in
   `.env.local`. This matches `README.md` / `.env.example`.

2. **Offline (used in this VM):** local Postgres + a tiny TLS proxy that speaks
   Neon's HTTP protocol. A working proxy lives at `/home/ubuntu/neon-proxy/`
   (a ~90-line `pg`-backed `server.js` + self-signed cert) and is started in the
   `neon-proxy` tmux session. Key facts to reproduce/restart it:
   - Postgres 16 runs locally: `sudo pg_ctlcluster 16 main start`. DB `neondb`,
     superuser role `neon`/`neonpass`, `pg_trgm` extension enabled.
   - `/etc/hosts` maps `db.localtest.me` and `api.localtest.me` to localhost.
   - The proxy listens on `:443` (run via `sudo`) and forwards `/sql` to
     Postgres, returning rows as raw text arrays + field OIDs (Neon-Array-Mode
     / Neon-Raw-Text-Output). Restart it with:
     `sudo /exec-daemon/node /home/ubuntu/neon-proxy/server.js`.
   - `.env.local` must set `DATABASE_URL=postgresql://neon:neonpass@db.localtest.me:5432/neondb`,
     `API_SECRET=...`, and **`NODE_TLS_REJECT_UNAUTHORIZED=0`** (the proxy uses a
     self-signed cert; without this the app's `fetch` to the proxy fails TLS).

### Applying the schema

`npm run db:push` (drizzle-kit) connects over the Neon **WebSocket** driver,
which the HTTP proxy above does NOT implement — it hangs/fails against the local
proxy. Against the local Postgres, apply the schema with:
`npx drizzle-kit generate` then `psql -d neondb -f db/migrations/*.sql`
(`db/migrations/` is generated output; delete it afterward to keep the tree
clean). `db:push` works normally against a real Neon `DATABASE_URL`.

### API auth

All `/api/*` routes accept same-origin browser requests or the
`x-api-key: $API_SECRET` header. Quick end-to-end check:
`curl -X POST -H "x-api-key: $API_SECRET" -H "content-type: application/json" -d '{"text":"hi"}' http://localhost:3000/api/save`.

### Optional integrations

Anthropic / OpenAI / Vercel Blob / Telegram / Apify all degrade gracefully when
their env vars are unset — none are needed to run or test the core app.
