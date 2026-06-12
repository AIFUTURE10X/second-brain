# Second Brain — Feature Roadmap (no auth)

Implementation plan for recommended tiers **excluding passphrase login**.
Auth is explicitly deferred — the app stays open (same-origin + `API_SECRET` bearer).

**Handoff:** implement in order, one PR per chunk on `cursor/<name>-c4dd`.

---

## Tier 1 — Foundation

| # | Feature | What to build |
|---|---------|---------------|
| 1.1 | **Semantic search** ✅ | pgvector on Neon; embedding column on `items`; generate embeddings at save (OpenAI `text-embedding-3-small`); hybrid rank with existing FTS (`search_tsv` + `ts_rank_cd`); optional `?semantic=1` or auto-merge; Telegram `/find` reuses same endpoint |
| 1.2 | **Polling sync** | `GET /api/items?since=<ISO8601>` returns items where `updated_at > since`; index on `updated_at`; client polls every 30–60s when tab focused + on `visibilitychange`; merge into local state via existing `BroadcastChannel` |
| 1.3 | **Offline write queue** | IndexedDB queue for create/update/delete; replay on reconnect through existing `expectedUpdatedAt` conflict machinery; SW stays read-only |

---

## Tier 2 — High-value product

| # | Feature | What to build |
|---|---------|---------------|
| 2.1 | **Saved searches** | `saved_searches` table or settings JSON: name + filter state (`tag`, `category`, `type`, sort, toggles); chip row to apply; API CRUD |
| 2.2 | **Backlinks + `[[wiki]]`** | On save, parse `[[title]]` in content/notes → `item_relations`; show inbound links on cards; optional graph panel |
| 2.3 | **Timeline / date views** | Filter by `createdAt` range (this week, month, custom); calendar or grouped list UI |
| 2.4 | **Archive** | `archived_at` column; hide archived from default grid; "Archive" action + filter toggle |
| 2.5 | **Bulk actions** | Multi-select in review mode + grid; bulk tag, category, archive, delete |
| 2.6 | **Extension context menu** | MV3 `contextMenus`: "Save link to Brain", "Save selection to Brain" |
| 2.7 | **Telegram `/find` + `/done`** | `/find <query>` → search API results in chat; `/done <id or title>` → mark task complete |
| 2.8 | **Reminder snooze + recurring** | `snoozed_until`, `recurrence` on reminders; snooze buttons in Telegram; cron handles recurrence |
| 2.9 | **Read-later** | `reading_status`: `unread` \| `reading` \| `done` on link items; filter + quick toggle |
| 2.10 | **Card templates** | `templates` in settings or table; pre-fill type, tags, category, checklist skeleton |
| 2.11 | **Recurring tasks** | `recurrence` field on tasks; cron or daily digest surfaces next occurrence |
| 2.12 | **Duplicate detection** | On save, check URL exact match + title trigram similarity; toast "similar card exists" with link |
| 2.13 | **Ask my brain** | Chat UI; RAG over item embeddings (depends on 1.1); cite source cards |

---

## Tier 3 — Polish & satellites

| # | Feature | What to build |
|---|---------|---------------|
| 3.1 | **Extension shortcuts** | MV3 `commands` keyboard shortcut; highlight → annotate on link card |
| 3.2 | **Desktop notifications** | Tauri notification plugin; fire on reminder cron via desktop bridge or poll |
| 3.3 | **Signed share links** | `?share=<HMAC>` on `/card/[id]`; verify with `AUTH_SECRET` or dedicated `SHARE_SECRET` (no login required for share token only) |
| 3.4 | **Vault extras** | TOTP field; copy username/password with auto-clear clipboard; link vault entry to card |

---

## Tier 4 — Out of scope

- Multi-user / collaboration
- Notion-style block editor
- RSS reader
- Passphrase login / middleware (deferred by user)

---

## Suggested PR order

1. `cursor/tier-1-semantic-c4dd`
2. `cursor/tier-1-sync-c4dd`
3. `cursor/tier-1-offline-c4dd`
4. `cursor/tier-2-collections-c4dd` — saved searches, archive, bulk, timeline
5. `cursor/tier-2-capture-c4dd` — extension context menu, Telegram commands, read-later
6. `cursor/tier-2-knowledge-c4dd` — backlinks, templates, recurring tasks
7. `cursor/tier-2-ai-c4dd` — duplicate detection, Ask my brain
8. `cursor/tier-3-polish-c4dd` — share links, desktop notifications, vault extras, extension shortcuts

---

## Repo context (already done on `main`)

- Weighted FTS + GIN index + trigram fuzzy fallback
- Structured filters (`?tag=`, `?category=`, `?type=`)
- Brain.tsx decomposed into `components/brain/*`
- Quick-capture bar, conflict dialog, review mode
- Zod validation, CI, export/import
- Telegram bot, reminders, crons, vault, extension, desktop, PWA share target

## Commands

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
node scripts/run-db-setup.mjs   # pg_trgm (one-time)
npm run db:push                 # schema changes (interactive)
```
