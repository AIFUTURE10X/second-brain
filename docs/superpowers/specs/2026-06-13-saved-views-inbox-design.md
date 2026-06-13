# Saved Views and Review Inbox Design

**Goal:** Make newly captured cards easy to find and triage, especially cards saved from Chrome, without forcing the user to remember search terms or categories.

**Problem being solved:** The Chrome context-menu save now works, but a saved page can still feel missing once the user opens Second Brain because it lands among every other card. The first roadmap phase should answer: "What just came in, and what do I need to process next?"

## Product Decisions

- Add a first-class **Inbox** saved view for unreviewed cards.
- Add a persisted `reviewedAt` item field. A card is in Inbox only when `reviewedAt === null`.
- Keep historical cards out of Inbox by adding the database column with a default timestamp, then explicitly saving new captures with `reviewedAt: null`.
- Add built-in saved view buttons, not a custom saved-view builder yet.
- Keep the existing heuristic "Review" filter, but rename its mental model to cleanup/attention. It catches cards with missing metadata, short titles, or stale tasks.
- Give every unreviewed card a small mark-reviewed action so triage can happen directly from the card list.

## Built-In Saved Views

- **All:** no saved-view filter.
- **Inbox:** `reviewedAt === null`.
- **Action:** `actionRequired === true`.
- **Favorites:** `favourite === true`.
- **Tasks:** `type === "task"`.
- **Reminders:** has a pending reminder.
- **Cleanup:** existing review heuristic: no category, no tags, short title, or stale task.

## Data Model

Add `items.reviewed_at timestamptz default now()` as nullable:

- Existing rows get a timestamp and do not flood the new Inbox.
- New API-created cards explicitly set `reviewedAt: null`.
- Marking a card reviewed sets `reviewedAt` to the current ISO timestamp.

## UI Shape

Saved view buttons sit between Quick Capture and the detailed FilterBar. They are small, count-bearing controls that feel like saved filters, not marketing cards.

The FilterBar still owns search, type, category, tags, source, sort, and secondary toggles. Inbox becomes one more secondary toggle so Clear All and active-filter counts stay honest.

Unreviewed cards show a compact "Inbox" marker and a "Reviewed" action. Pressing it updates the card in place, removes it from Inbox when the Inbox view is active, and broadcasts the existing sync event.

## Non-Goals for This Phase

- User-created saved views.
- Kanban/table/calendar layouts.
- AI field autofill prompts.
- Bulk review actions.
- A separate migration runner or production database push.

## Verification

- Pure helper tests for saved-view filters, counts, and review heuristics.
- Static API/schema tests for `reviewedAt` being present in schema, validation, search aliases, and save routes.
- Existing regression suite.
- Lint and production build.
