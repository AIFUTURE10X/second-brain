# Task Checkbox Flow Design

Date: 2026-06-07
Repo: `C:\Projects\Second Brain\second-brain`
Status: Approved design, awaiting final spec review before implementation

## Goal

Change tasks from the current delete-on-complete behavior into a real saved checkbox flow that fits `Second Brain`'s lightweight contextual task model.

The new behavior should let a task be:

- open and actionable,
- marked done without losing its notes, files, images, reminders, or related context,
- reopened later if needed.

## Current Behavior

Tasks already exist as a normal `item` type in the shared `items` table and are surfaced in the main `Task` tab.

Current limitations:

- tasks are identified visually with `☐`, but not stored as checked or unchecked,
- the current complete action deletes the task via `DELETE /api/items`,
- there is no persistent `Done` state,
- completed tasks cannot be reopened.

## Proposed Approach

Use the existing `items` model and add a small task-specific completion state instead of creating a separate todo subsystem.

Recommended UX:

- open tasks appear in an `Open` section,
- completed tasks move into a `Done` section inside the `Task` view,
- the completion control becomes a real toggle instead of a destructive action,
- delete remains available as a separate explicit action.

This keeps the product lightweight while preserving task context.

## Data Model Changes

Add two new fields to `items`:

- `completed` boolean, default `false`
- `completedAt` timestamp, nullable

Rules:

- these fields are meaningful primarily for `type = "task"`,
- all existing rows should remain valid,
- existing tasks should default to open,
- non-task items can safely keep `completed = false` and `completedAt = null`.

## API Changes

Update item read and write flows so the new task state is included end to end.

### `GET /api/items`

- return `completed` and `completedAt` with each item

### `POST /api/items`

- allow task creation with default open state
- quick-add tasks should not need to send completion fields explicitly

### `PUT /api/items`

- support toggling `completed`
- when completing a task:
  - set `completed = true`
  - set `completedAt = now`
- when reopening a task:
  - set `completed = false`
  - clear `completedAt`

### `DELETE /api/items`

- keep delete behavior unchanged for intentional removal
- task completion must no longer use this endpoint

## UI Changes

### Task Tab

In the existing `Task` filter view:

- show `Open` tasks first
- show `Done` tasks in a separate section below
- sort `Open` tasks using the current task ordering rules
- sort `Done` tasks by newest `completedAt` first

If there are no completed tasks, the `Done` section can stay hidden.

### Task Row / Card Behavior

Replace the current destructive completion affordance with a real checkbox toggle:

- open task: empty checkbox
- done task: checked checkbox and softer visual styling
- clicking the checkbox toggles the saved state

Visual changes for done tasks should stay subtle and readable:

- reduced emphasis,
- checked icon,
- optional muted title styling.

### Counts and Signals

The top task badge should represent open tasks only.

This keeps the task count meaningful and avoids mixing archived work with currently actionable work.

### Editing

Completed tasks should remain editable unless that creates friction during implementation.

At minimum, users must be able to:

- reopen a task,
- view its attached notes/files/images,
- delete it intentionally.

## Behavior Rules

- completing a task must preserve note entries, attachments, reminders, tags, category, and relations
- reopening a task must restore it to the `Open` section without data loss
- deleting a task must still fully remove it when the user chooses delete
- existing non-task item flows must remain unchanged

## Migration / Backwards Compatibility

Implementation should include a safe schema update so existing databases gain:

- `completed` with a default of `false`
- `completedAt` as nullable

No existing tasks should disappear or become done automatically.

## Testing and Verification

Implementation is complete when all of the following work:

1. Create a new task from the quick-add input.
2. Mark the task complete.
3. Confirm it moves from `Open` to `Done`.
4. Reopen the task.
5. Confirm it returns to `Open`.
6. Confirm notes and attachments remain intact across completion toggles.
7. Confirm delete still removes the task entirely.
8. Confirm the app builds successfully.

Recommended verification stack:

- targeted task-status tests for the item API and any extracted task helpers
- `npm run build`

If the change touches desktop packaging behavior indirectly, no extra desktop changes are required for this feature.

## Non-Goals

This change does not include:

- recurring tasks,
- subtasks or checklist trees,
- collaboration,
- kanban/project boards,
- a separate todo application,
- reminder-system redesign.

## Implementation Notes

Prefer the smallest change that preserves the existing product shape:

- extend the current `items` model instead of introducing a second task table,
- reuse the existing `Task` tab instead of creating a new page,
- keep delete separate from complete,
- preserve current search/filter behavior unless task completion requires a targeted update.
