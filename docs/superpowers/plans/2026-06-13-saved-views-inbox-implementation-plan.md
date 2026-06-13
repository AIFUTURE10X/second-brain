# Saved Views and Review Inbox Implementation Plan

> **For agentic workers:** Use test-driven development. Each production behavior starts with a failing test, then the smallest implementation to pass it.

**Goal:** Ship Phase 1 of the Second Brain roadmap: built-in saved views plus a real review Inbox for newly captured cards.

**Architecture:** Add a shared saved-view helper module for counts/filter presets, extend the item model with `reviewedAt`, thread that field through create/update/search/save routes, then render the saved-view controls and mark-reviewed card action in the main Brain UI.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Drizzle ORM, Neon Postgres, Node test runner

---

### Task 1: Add saved-view helper tests and implementation

**Files:**
- Create: `C:\Projects\Second Brain\second-brain\.worktrees\saved-views-inbox\lib\saved-views.ts`
- Create: `C:\Projects\Second Brain\second-brain\.worktrees\saved-views-inbox\tests\saved-views.test.mjs`

- [x] Write failing tests for Inbox detection, saved-view counts, filter presets, and the cleanup heuristic.
- [x] Run `node --test tests/saved-views.test.mjs` and verify it fails for the missing helper.
- [x] Implement the minimal saved-view helper functions.
- [x] Re-run `node --test tests/saved-views.test.mjs` and verify it passes.

### Task 2: Thread `reviewedAt` through schema and APIs

**Files:**
- Modify: `C:\Projects\Second Brain\second-brain\.worktrees\saved-views-inbox\db\schema.ts`
- Modify: `C:\Projects\Second Brain\second-brain\.worktrees\saved-views-inbox\lib\brain-model.ts`
- Modify: `C:\Projects\Second Brain\second-brain\.worktrees\saved-views-inbox\lib\validation.ts`
- Modify: `C:\Projects\Second Brain\second-brain\.worktrees\saved-views-inbox\app\api\items\route.ts`
- Modify: `C:\Projects\Second Brain\second-brain\.worktrees\saved-views-inbox\app\api\save\route.ts`
- Create: `C:\Projects\Second Brain\second-brain\.worktrees\saved-views-inbox\tests\review-inbox-api.test.mjs`

- [x] Write failing static coverage for schema, validation, item search aliases, and new save defaults.
- [x] Run `node --test tests/review-inbox-api.test.mjs` and verify it fails.
- [x] Add nullable `reviewedAt` with `defaultNow()` to the item schema and model.
- [x] Allow `reviewedAt` in create/update validation.
- [x] Alias `reviewed_at AS "reviewedAt"` in search SQL.
- [x] Explicitly save newly created `/api/items` and `/api/save` cards with `reviewedAt: null` unless a reviewed timestamp is supplied.
- [x] Re-run the API test and verify it passes.

### Task 3: Add saved views and review actions to the Brain UI

**Files:**
- Modify: `C:\Projects\Second Brain\second-brain\.worktrees\saved-views-inbox\components\Brain.tsx`
- Modify: `C:\Projects\Second Brain\second-brain\.worktrees\saved-views-inbox\components\brain\FilterBar.tsx`
- Modify: `C:\Projects\Second Brain\second-brain\.worktrees\saved-views-inbox\components\brain\ItemCard.tsx`

- [x] Add `inboxOnly` filter state and include it in filtering, counts, pagination reset, and Clear All.
- [x] Render built-in saved view buttons between Quick Capture and FilterBar.
- [x] Apply saved views by resetting detailed filters and enabling the selected preset.
- [x] Add an Inbox quick filter to the More menu.
- [x] Add the per-card reviewed action and update state after successful PUT.

### Task 4: Verify end to end

**Files:**
- Verify only

- [x] Run `node --test tests/saved-views.test.mjs tests/review-inbox-api.test.mjs`.
- [x] Run `npm test`.
- [x] Run `npm run lint`.
- [x] Run `npm run build`.
- [x] Report that production DB still needs a schema push/backfill review before merge/deploy.
