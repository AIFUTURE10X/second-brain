# Bulk Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Phase 2 triage power: select multiple cards and apply common review actions in one pass.

**Architecture:** Keep selection state in `Brain.tsx`, because filtering and item updates already live there. Add a small `BulkTriageBar` presentational component, and teach `ItemCard` how to render a selectable control without changing card navigation behavior.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind utility classes, Node test runner

---

### Task 1: Add bulk triage UI coverage

**Files:**
- Create: `C:\Projects\Second Brain\second-brain\.worktrees\saved-views-inbox\tests\bulk-triage-ui.test.mjs`
- Modify: `C:\Projects\Second Brain\second-brain\.worktrees\saved-views-inbox\components\Brain.tsx`
- Modify: `C:\Projects\Second Brain\second-brain\.worktrees\saved-views-inbox\components\brain\ItemCard.tsx`
- Create: `C:\Projects\Second Brain\second-brain\.worktrees\saved-views-inbox\components\brain\BulkTriageBar.tsx`

- [ ] **Step 1: Write the failing static tests**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const brainSource = await readFile(new URL("../components/Brain.tsx", import.meta.url), "utf8");
const itemCardSource = await readFile(new URL("../components/brain/ItemCard.tsx", import.meta.url), "utf8");
const bulkBarSource = await readFile(new URL("../components/brain/BulkTriageBar.tsx", import.meta.url), "utf8").catch(() => "");

test("Brain tracks selected cards and renders the bulk triage bar", () => {
  assert.match(brainSource, /const \[selectedIds, setSelectedIds\] = useState<Set<string>>\(new Set\(\)\)/);
  assert.match(brainSource, /<BulkTriageBar/);
  assert.match(brainSource, /selectedCount={selectedItems.length}/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test tests\bulk-triage-ui.test.mjs`

Expected: FAIL because `BulkTriageBar.tsx` and `selectedIds` do not exist yet.

### Task 2: Implement selectable cards

**Files:**
- Modify: `C:\Projects\Second Brain\second-brain\.worktrees\saved-views-inbox\components\brain\ItemCard.tsx`
- Modify: `C:\Projects\Second Brain\second-brain\.worktrees\saved-views-inbox\components\Brain.tsx`

- [ ] **Step 1: Extend `ItemCardProps`**

Add:

```ts
  selected: boolean;
  onToggleSelected: () => void;
```

- [ ] **Step 2: Add the card select button**

Use a button that stops propagation:

```tsx
<button
  onClick={e => { e.stopPropagation(); onToggleSelected(); }}
  className={`absolute left-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border text-[11px] transition ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
  aria-pressed={selected}
  aria-label={selected ? "Deselect card" : "Select card"}
  title={selected ? "Deselect" : "Select"}
>
  {selected ? "✓" : ""}
</button>
```

- [ ] **Step 3: Wire selection from `Brain.tsx`**

Add:

```ts
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const toggleSelectedId = (id: string) => {
  setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
};
```

Pass `selected={selectedIds.has(item.id)}` and `onToggleSelected={() => toggleSelectedId(item.id)}` to `ItemCard`.

### Task 3: Add the bulk triage bar and actions

**Files:**
- Create: `C:\Projects\Second Brain\second-brain\.worktrees\saved-views-inbox\components\brain\BulkTriageBar.tsx`
- Modify: `C:\Projects\Second Brain\second-brain\.worktrees\saved-views-inbox\components\Brain.tsx`

- [ ] **Step 1: Create `BulkTriageBar`**

The component returns `null` when `selectedCount === 0`, otherwise shows selected count and buttons for Reviewed, Favorite, Action, and Clear.

- [ ] **Step 2: Add bulk update helpers**

Use `/api/items` `PUT` for each selected item:

```ts
const updateSelectedItems = async (
  ids: string[],
  payloadForId: (id: string) => Partial<Item>,
  successMessage: string,
  failureMessage: string,
) => {
  const results = await Promise.allSettled(ids.map(async id => {
    const res = await fetch("/api/items", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...payloadForId(id) }),
    });
    if (!res.ok) throw new Error("Bulk update failed");
    return await res.json() as Item;
  }));
  const saved = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
  setItems(prev => prev.map(item => saved.find(next => next.id === item.id) || item));
  saved.forEach(item => broadcastSync({ type: "item-updated", item }));
  if (saved.length !== ids.length) showToast(failureMessage, "error");
  else showToast(successMessage, "success");
};
```

- [ ] **Step 3: Verify**

Run:

```powershell
node --test tests\bulk-triage-ui.test.mjs
npm test
npm run build
npm run lint
```

Expected: tests pass, build succeeds, lint exits with zero errors.
