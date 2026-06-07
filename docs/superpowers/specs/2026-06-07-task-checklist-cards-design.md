# Task Checklist Cards Design

Date: 2026-06-07
Repo: `C:\Projects\Second Brain\second-brain`
Status: Approved design, awaiting final spec review before implementation

## Goal

Add real checklist behavior inside task cards so a task can hold multiple checkbox items such as:

- `Grocery trip`
- `[ ] eggs`
- `[ ] milk`
- `[x] bread`

This should feel like a lightweight contextual todo list inside `Second Brain`, not a separate project-management system.

## Product Shape

The core unit remains a task card.

Each task card can include:

- a parent task title,
- optional notes and note entries,
- optional files and images,
- an internal checklist of checkbox lines.

Checklist items belong to their parent task card and should not appear as separate standalone cards in the main `Task` list.

This keeps related work grouped together and avoids clutter.

## Desired Behavior

### Parent Task

A parent task is the overall outcome, such as `Immigration + bank account documents` or `Grocery trip`.

The parent task should:

- remain visible as one task card in the main task list,
- display checklist progress,
- automatically become completed when every checklist item is checked,
- become open again if any checklist item is unchecked.

### Checklist Items

Each checklist item should support:

- a persistent checked or unchecked state,
- text content,
- future extensibility for item-level notes/files if needed later.

For this implementation, each checklist item should be modeled as an object rather than a plain string so the shape can grow later without a migration rewrite.

## Recommended Approach

Extend the existing `items` model for `type = "task"` instead of creating a second task system.

Use:

- one parent task card in the main list,
- one embedded checklist editor/view inside that card,
- automatic parent completion derived from checklist state.

This is the best fit because it matches how the user thinks about the work: one job with several required documents or steps.

## Data Model Changes

Add checklist support to task items.

### New checklist item type

Add a TypeScript shape similar to:

- `id`
- `text`
- `completed`
- `completedAt`

Optional future fields such as notes or attachments should not be implemented yet, but the checklist item should remain an object so they can be added later.

### New item fields

Add to `items`:

- `checklistItems` as JSON, default `[]`
- `completed` boolean, default `false`
- `completedAt` timestamp, nullable

Rules:

- `checklistItems` is meaningful mainly for `type = "task"`
- parent `completed` is derived from checklist state when checklist items exist
- if a task has no checklist items, parent `completed` can still be toggled manually later if needed, but this first implementation should focus on checklist-driven completion
- non-task items should keep empty checklist data and open state defaults

## Completion Rules

Parent completion should be automatic:

- if a task has one or more checklist items and all are completed, set parent `completed = true`
- if any checklist item is unchecked, set parent `completed = false`
- when parent becomes completed, set `completedAt = now`
- when parent becomes open again, clear `completedAt`

Important edge case:

- a task with zero checklist items should not auto-complete

## API Changes

Update item read/write flows so checklist data and derived completion state round-trip correctly.

### `GET /api/items`

- return `checklistItems`, `completed`, and `completedAt`

### `POST /api/items`

- allow creating tasks with an empty checklist
- quick-add task creation should still work

### `PUT /api/items`

- allow updating checklist items
- recompute parent completion before saving task updates
- preserve notes, attachments, tags, category, reminders, and relations

### `DELETE /api/items`

- unchanged
- deleting a task still removes the whole parent task card

## UI Changes

### Task Card

Within a task card:

- show the parent title
- show checklist items underneath
- allow adding new checklist rows
- allow checking and unchecking rows directly

Recommended interaction:

- checkbox on the left
- editable text input or text area for the line
- add-item affordance at the bottom of the checklist

### Add/Edit Task Form

In the existing add/edit task section:

- support adding checklist lines while creating or editing a task
- preserve the existing notes/files/images behavior

This is the main place where the user should build a document-preparation list or grocery list.

### Main Task List

The top-level task list should still show one card per parent task.

It should not explode one card into many separate cards.

Recommended display:

- parent title
- progress summary such as `2/3 complete`
- visible checklist rows when expanded or in the card body

### Completed Styling

Checklist items:

- checked rows should look visibly completed
- unchecked rows should remain normal

Parent task:

- parent task can show a completed state once all checklist items are checked
- completed styling should be subtle, not hidden or removed

## Editing Rules

Users should be able to:

- add checklist items
- edit checklist item text
- check or uncheck any checklist item
- delete checklist items
- keep using task notes, files, and images alongside the checklist

## Backwards Compatibility

Existing tasks should continue to work.

Default behavior for old tasks:

- `checklistItems = []`
- `completed = false`
- `completedAt = null`

Old tasks without checklists should remain visible and editable.

## Verification

Implementation is complete when all of the following work:

1. Create a task card such as `Grocery trip`.
2. Add checklist items `eggs`, `milk`, and `bread`.
3. Check one item and confirm its state persists.
4. Check all items and confirm the parent task becomes completed automatically.
5. Uncheck one item and confirm the parent task becomes open again.
6. Edit a checklist item text and confirm it persists.
7. Delete a checklist item and confirm the rest remain intact.
8. Confirm notes, files, and images still work on the same parent task card.
9. Confirm the app builds successfully.

Recommended verification stack:

- targeted tests for checklist state derivation and item update flows
- `npm run build`

## Non-Goals

This change does not include:

- recurring tasks
- shared team task lists
- kanban boards
- nested subtasks beyond one checklist level
- separate standalone cards for each checklist line
- item-level notes/files on checklist rows in this first version

## Implementation Notes

Keep the implementation narrow and durable:

- reuse the existing `items` table
- use JSON checklist data rather than a new relational table for this lightweight first version
- derive parent completion from checklist state
- keep the main task list clean by rendering one parent card per task
