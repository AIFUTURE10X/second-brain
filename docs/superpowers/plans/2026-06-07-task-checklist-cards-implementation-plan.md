# Task Checklist Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add checklist rows inside task cards so one task can hold multiple checkbox items with automatic parent completion.

**Architecture:** Extend the shared `items` model with checklist JSON plus derived completion fields, then thread those fields through the item API, the main `Brain` task UI, and the card popout editor. Keep one parent task card per task and derive its completed state from the checklist rows instead of creating standalone child tasks.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Drizzle ORM, Neon Postgres, Node test runner

---

### Task 1: Add checklist state helpers and regression tests

**Files:**
- Create: `C:\Projects\Second Brain\second-brain\lib\task-checklists.ts`
- Create: `C:\Projects\Second Brain\second-brain\tests\task-checklists.test.mjs`

- [ ] **Step 1: Write the failing checklist-state tests**

Add tests that prove a task stays open with no checklist rows, becomes complete when all rows are checked, and reopens when one row is unchecked.

- [ ] **Step 2: Run the checklist test and verify it fails**

Run: `node --test tests/task-checklists.test.mjs`

Expected: FAIL because `lib/task-checklists.ts` does not exist yet.

- [ ] **Step 3: Add minimal checklist helpers**

Implement:
- `newChecklistItem(text?: string)`
- `normalizeChecklistItems(value)`
- `deriveTaskCompletion(checklistItems, fallbackCompleted, fallbackCompletedAt)`

- [ ] **Step 4: Re-run the checklist test and verify it passes**

Run: `node --test tests/task-checklists.test.mjs`

Expected: PASS

### Task 2: Thread checklist fields through the item schema and API

**Files:**
- Modify: `C:\Projects\Second Brain\second-brain\db\schema.ts`
- Modify: `C:\Projects\Second Brain\second-brain\app\api\items\route.ts`
- Create: `C:\Projects\Second Brain\second-brain\tests\items-route-task-checklists.test.mjs`

- [ ] **Step 1: Write the failing API/route coverage test**

Add a test that scans the route source for `checklistItems`, `completed`, and `completedAt`, and verifies the route imports the checklist helper module.

- [ ] **Step 2: Run the route test and verify it fails**

Run: `node --test tests/items-route-task-checklists.test.mjs`

Expected: FAIL because the route does not yet include checklist fields.

- [ ] **Step 3: Update schema and route**

Add `checklistItems`, `completed`, and `completedAt` to the Drizzle schema. Update the item route so GET returns those fields, POST normalizes checklist input, and PUT recomputes parent task completion before saving.

- [ ] **Step 4: Re-run the route test and verify it passes**

Run: `node --test tests/items-route-task-checklists.test.mjs`

Expected: PASS

### Task 3: Add checklist editing to the main Brain task flow

**Files:**
- Modify: `C:\Projects\Second Brain\second-brain\components\Brain.tsx`

- [ ] **Step 1: Extend task item and form state**

Add checklist fields to the task item type and editor form state, plus helpers to add, edit, toggle, and delete checklist rows.

- [ ] **Step 2: Replace destructive task completion**

Remove the current delete-on-complete flow for tasks and instead persist checklist-row toggles that automatically update parent task completion.

- [ ] **Step 3: Render checklist rows in task cards and the add/edit panel**

Show checklist progress on task cards, editable checklist rows in the task editor, and inline toggles in the task list.

- [ ] **Step 4: Smoke-test the UI behavior through build verification**

Run the full build after the component change instead of relying on assumptions from the editor refactor.

### Task 4: Add checklist support to the popout card editor

**Files:**
- Modify: `C:\Projects\Second Brain\second-brain\app\card\[id]\page.tsx`

- [ ] **Step 1: Extend the card page item and form state**

Mirror the new checklist fields and helper functions from `Brain.tsx`.

- [ ] **Step 2: Render checklist editing in the card page**

Allow the popout editor to add, rename, toggle, and delete checklist rows on task cards.

- [ ] **Step 3: Persist checklist rows through the existing save flow**

Make sure save sends normalized checklist data so the route can derive task completion consistently.

### Task 5: Verify end to end

**Files:**
- Verify only

- [ ] **Step 1: Run targeted checklist helper tests**

Run: `node --test tests/task-checklists.test.mjs tests/items-route-task-checklists.test.mjs`

Expected: PASS

- [ ] **Step 2: Run existing regression coverage that could be affected by item-shape changes**

Run: `node --test tests/item-search.test.mjs tests/item-updates.test.mjs`

Expected: PASS

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: PASS

- [ ] **Step 4: Apply the schema to the configured database**

Run: `npx drizzle-kit push`

Expected: schema updated without dropping existing task data
