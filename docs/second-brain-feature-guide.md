# Second Brain Feature Guide

Last updated: 2026-06-13

This guide lists the main features available in Second Brain, what each feature does, and how to use it. It covers the core web app, the Chrome extension, the Telegram bot, the desktop wrapper, and the latest sandbox work on saved views, inbox review, workflow status, and richer table/board views.

## Core App

### Brain dashboard

**What it does:** The main workspace for capturing, finding, reviewing, organizing, and editing everything in your Second Brain.

**How to use it:**

- Open the Second Brain web app.
- Use the capture bar at the top to add new items.
- Use saved view chips, search, filters, and view controls to change what you are looking at.
- Open any card to edit notes, tags, categories, reminders, relations, attachments, and AI features.

### Quick capture bar

**What it does:** Lets you quickly add links, thoughts, tasks, and memories without opening a full editor.

**How to use it:**

- Paste a URL to save it as a link.
- Type normal text to save a thought.
- Start with `/t` to create a task.
- Start with `/m` to create a memory.
- Add tags or a category after saving from the item editor if needed.
- Use the voice button when available to dictate capture text into the bar.

### Card editor

**What it does:** Opens the full details for an item so you can update its title, body, notes, tags, category, type, reminders, attachments, and related cards.

**How to use it:**

- Click a card to expand or open it.
- Edit the fields you want to change.
- Save the item when finished.
- If another browser window changed the same item first, Second Brain will show a conflict warning so you do not overwrite newer work by accident.

### Pop-out item window

**What it does:** Opens an item in a separate focused window for deeper editing or review.

**How to use it:**

- Open an item.
- Click the pop-out/open action.
- Edit or review the item in the separate window.
- Changes sync back to the main app.

## Capture Sources

### Chrome extension context menu

**What it does:** Saves the current page, a link, or selected text directly from Chrome into Second Brain.

**How to use it:**

- In Chrome, go to `chrome://extensions`.
- Make sure `Second Brain - Save to Brain` is enabled.
- Click reload on the extension after code changes.
- Right-click a page, link, or selected text.
- Choose `Save to Second Brain`.
- Open Second Brain and check the Inbox or All view for the saved card.

### Chrome extension popup

**What it does:** Lets you save the current tab from the extension button, with optional tags and category.

**How to use it:**

- Click the Second Brain extension icon in Chrome.
- Set the Second Brain host URL and API secret if prompted.
- Add optional tags or category.
- Click `Save to Brain`.

### Web share target

**What it does:** Accepts shared text, links, and files from the browser or operating system share sheet.

**How to use it:**

- Use your browser or device share action.
- Choose Second Brain as the destination when available.
- Share text, a link, or supported files.
- Second Brain saves the shared content and uploads shared files as attachments.

### Telegram bot capture

**What it does:** Lets you send links or notes to Second Brain from Telegram.

**How to use it:**

- Configure the Telegram bot token and webhook in the environment.
- Message the bot with a link or note.
- The bot saves the message into Second Brain.
- Check the app for the new captured item.

### Desktop wrapper

**What it does:** Provides a Windows desktop app wrapper around the web-hosted Second Brain.

**How to use it:**

- Install or run the generated desktop app.
- Use it like the normal web app.
- It loads the hosted Second Brain experience inside a desktop shell.

## Views

### Saved view chips

**What it does:** Gives one-click access to important working views with live counts.

**How to use it:**

- Click a chip near the top of the app.
- Built-in chips include `All`, `Inbox`, `Action`, `Favorites`, `Tasks`, `Reminders`, and `Cleanup`.
- The list updates immediately to match the selected view.

### Custom saved views

**What it does:** Lets you save your current search, filters, and sort as a reusable view.

**How to use it:**

- Set up the search, category, tags, type, status, and sort you want.
- Click the add/save view control.
- Name the view.
- Click the saved custom view later to restore those filters.
- Delete custom views you no longer need from the view control.

### Responsive compact list grid

**What it does:** Shows list-style cards in compact responsive columns instead of stretching every card across the full screen.

**How to use it:**

- Choose the list/card view.
- Resize the browser window.
- The app automatically fits more cards on wide screens and fewer cards on narrow screens.

### Compact grid view

**What it does:** Shows many items at once using smaller cards and thumbnails.

**How to use it:**

- Use the view toggle until the compact grid view is selected.
- Scan thumbnails, titles, tags, categories, and badges.
- Open any card for full details.

### Table view

**What it does:** Shows items in a denser database-style table for scanning, sorting, and triage.

**How to use it:**

- Use the view toggle until the table view is selected.
- Scan title, type, category, tags, workflow status, related-card counts, and updated time.
- Open an item from the table to edit it.

### Board view

**What it does:** Shows items grouped into columns, useful for workflow review.

**How to use it:**

- Use the view toggle until the board view is selected.
- Review items by their current group, such as workflow status.
- Open cards from the board to edit or move them through the workflow.

## Finding And Filtering

### Full-text search

**What it does:** Searches across titles, tags, categories, body text, notes, and link metadata.

**How to use it:**

- Click the search box or use `Ctrl+K`.
- Type the keyword, URL, tag, category, or phrase you want.
- The results update to show matching items.
- If exact full-text search misses something, fuzzy matching helps find near matches.

### Type filters

**What it does:** Narrows the brain to specific item types.

**How to use it:**

- Open the type filter.
- Choose items such as links, notes, thoughts, tasks, memories, files, or checklist items.
- Clear the filter to return to all types.

### Category filters

**What it does:** Narrows the brain to one or more categories.

**How to use it:**

- Open the category filter.
- Pick the category you want to inspect.
- Combine category filters with tags, search, and saved views.

### Tag filters

**What it does:** Narrows the brain by tags.

**How to use it:**

- Open the tag filter.
- Select one or more tags.
- Use tag filters with search or category filters for more precise results.

### More filters

**What it does:** Provides extra filters for review and cleanup workflows.

**How to use it:**

- Open the `More` filter menu.
- Filter by things like source, favorites, action-required items, reminders, review state, or other metadata.
- Clear filters when you want to return to the broader view.

### Sorting

**What it does:** Changes the order of displayed items.

**How to use it:**

- Use the sort control.
- Pick newest, oldest, or the available sort that fits your review session.

## Organization

### Categories

**What it does:** Gives each item a primary bucket, such as business, design, AI, research, personal, or project areas.

**How to use it:**

- Add or change the category from the item editor.
- Use category filters to focus on one area of the brain.
- Use the category manager to edit category names, colors, hierarchy, and ordering.

### Category hierarchy

**What it does:** Allows categories to be organized into parent and child groups.

**How to use it:**

- Open the category manager.
- Create or edit categories.
- Assign parent categories where useful.
- Use the hierarchy to keep large category lists easier to scan.

### Tags

**What it does:** Adds flexible labels to items so one card can belong to many topics.

**How to use it:**

- Add tags while editing an item.
- Filter by tags from the tag filter.
- Use consistent tag names for recurring topics and projects.

### Tag manager and merge

**What it does:** Helps clean up duplicate or messy tags.

**How to use it:**

- Open the tag manager.
- Review duplicate or similar tags.
- Merge tags when two labels should become one.
- Use this periodically to keep the brain tidy.

### Workflow status

**What it does:** Tracks where an item is in your personal knowledge workflow.

**How to use it:**

- Use statuses such as `Inbox`, `Active`, `Waiting`, `Done`, and `Archived`.
- New captures can start in `Inbox`.
- Move reviewed or useful items into `Active`, `Waiting`, or `Done`.
- Use the board or saved views to review items by status.

### Review state

**What it does:** Separates newly captured items from items you have already processed.

**How to use it:**

- Use the `Inbox` view to see unreviewed captures.
- Review each card.
- Mark items as reviewed when they have the right category, tags, and next action.

### Favorites

**What it does:** Marks high-value items you want to find quickly.

**How to use it:**

- Click the favorite/star action on a card.
- Use the `Favorites` saved view to see starred items.

### Action required

**What it does:** Marks items that need a decision, reply, task, or follow-up.

**How to use it:**

- Click the action-required indicator on a card.
- Use the `Action` saved view to review everything waiting on you.
- Clear the action marker when handled.

### Pinned or priority items

**What it does:** Highlights important cards so they stand out during review.

**How to use it:**

- Use the pin or priority action on the card when available.
- Look for the priority badge or icon in card, table, or board views.

### Bulk triage

**What it does:** Applies changes to multiple selected items at once.

**How to use it:**

- Select multiple cards.
- Use the bulk action bar.
- Mark selected cards reviewed, favorite them, flag action required, set workflow status, assign category, or add tags.
- Use this for inbox cleanup sessions.

### AI organization suggestions

**What it does:** Suggests useful tags and categories for a card, but asks you to confirm before applying them.

**How to use it:**

- Open a card.
- Click the AI suggestion action.
- Review the proposed tags and category.
- Apply the suggestions you want to keep.

### AI auto-tagging on save

**What it does:** Automatically suggests tags and a category when new items are saved.

**How to use it:**

- Save a link or note normally.
- Review the generated tags and category later in the card.
- Adjust anything that is not quite right.

## Item Types

### Link cards

**What it does:** Stores a URL with title, description, image, source metadata, tags, and notes.

**How to use it:**

- Paste a URL into quick capture, use the Chrome extension, or share a link to Second Brain.
- Open the card to add notes, tags, category, reminder, or relations.

### Thought cards

**What it does:** Stores quick text notes, ideas, observations, or snippets.

**How to use it:**

- Type a normal sentence or paragraph into quick capture.
- Save it.
- Add tags or category later if needed.

### Memory cards

**What it does:** Stores durable facts, decisions, instructions, or things you want to remember.

**How to use it:**

- Start quick capture with `/m`.
- Write the memory.
- Save it and tag it by project or topic.

### Task cards

**What it does:** Stores tasks and follow-up work inside the brain.

**How to use it:**

- Start quick capture with `/t`.
- Save the task.
- Use the task saved view to review tasks.
- Add reminders or checklist items if the task has steps.

### Checklist cards

**What it does:** Tracks multi-step tasks with checkable rows.

**How to use it:**

- Create or open a task/checklist item.
- Add checklist rows.
- Tick rows off as you complete them.
- Use the task view to find unfinished checklist work.

### File and attachment cards

**What it does:** Stores uploaded files and images alongside item metadata.

**How to use it:**

- Upload or attach files from the item editor.
- Share supported files through the web share target.
- Drag files onto an existing card when supported.
- Open the card to view or manage attachments.

## Card Details

### Notes

**What it does:** Adds your own extra context to an item after capture.

**How to use it:**

- Open a card.
- Add notes in the notes field.
- Save the card.
- Links inside notes can be detected and made easier to open.

### AI summaries

**What it does:** Generates a short summary for long pages, videos, or notes.

**How to use it:**

- Open a card.
- Click the summarize action.
- Review the generated summary.
- Keep, edit, or use it as a quick reminder of what the item contains.

### URL enrichment

**What it does:** Pulls useful metadata from saved links, such as title, description, site name, image, and source domain.

**How to use it:**

- Save a URL.
- Wait for enrichment to complete.
- Review the generated preview on the card.

### YouTube enrichment

**What it does:** Improves YouTube cards with video metadata, thumbnail, and summary-friendly content where available.

**How to use it:**

- Save a YouTube URL.
- Open the card to review the title, channel/source, thumbnail, and extracted context.
- Use AI summary for longer videos when useful.

### Related cards and backlinks

**What it does:** Connects items that belong together so one idea can lead to another.

**How to use it:**

- Open a card.
- Add related items from the relation controls.
- Use related counts in card, table, and board views to spot connected material.
- Open related cards when reviewing a topic.

### Reminders

**What it does:** Adds time-based follow-up to cards.

**How to use it:**

- Open a card.
- Add a reminder date, time, and optional message.
- Use the `Reminders` saved view to see scheduled reminders.
- If Telegram reminders are configured, due reminders can be sent through Telegram.

### Attachments

**What it does:** Keeps files, images, and shared uploads attached to the relevant item.

**How to use it:**

- Add attachments from the card editor.
- Share files to Second Brain through the web share target.
- Open the card to view or manage the attached files.

## Review Workflows

### Inbox review

**What it does:** Gives you a place to process new captures before they disappear into the wider brain.

**How to use it:**

- Open the `Inbox` saved view.
- Review each new item.
- Add missing tags, category, status, reminder, or action flag.
- Mark reviewed or move it out of Inbox when finished.

### Cleanup view

**What it does:** Finds cards that probably need organization work, such as missing tags, weak metadata, or incomplete categorization.

**How to use it:**

- Open the `Cleanup` saved view.
- Fix one card at a time or use bulk triage.
- Add tags, categories, summaries, or notes until the item is useful.

### Action review

**What it does:** Shows everything marked as needing your attention.

**How to use it:**

- Open the `Action` saved view.
- Work through the list.
- Clear the action flag once the item is handled.

### Task review

**What it does:** Shows task and checklist items together.

**How to use it:**

- Open the `Tasks` saved view.
- Update task status, checklist progress, reminders, or action flags.
- Move finished tasks to `Done` or archive them.

## Import, Export, And Backup

### JSON export

**What it does:** Exports your brain data in a structured backup format.

**How to use it:**

- Open the export controls.
- Choose JSON.
- Save the generated backup file.

### CSV export

**What it does:** Exports item data into a spreadsheet-friendly format.

**How to use it:**

- Open the export controls.
- Choose CSV.
- Open the result in Excel, Google Sheets, or another spreadsheet tool.

### Markdown export

**What it does:** Exports item content into Markdown for portable reading or archiving.

**How to use it:**

- Open the export controls.
- Choose Markdown.
- Use the generated Markdown files as a readable backup or external reference.

### Import

**What it does:** Restores or brings in data from a supported export file.

**How to use it:**

- Open the import controls.
- Choose the supported import file.
- Review the imported items after the process finishes.

### Pre-migration backups

**What it does:** Protects your data before database schema changes.

**How to use it:**

- Use the backup or export process before applying migrations.
- Keep the backup until the migration has been verified.

## Automation

### Telegram reminders

**What it does:** Sends due reminder notifications through Telegram when configured.

**How to use it:**

- Configure the Telegram token and chat settings.
- Add reminders to cards.
- Let the scheduled reminder job run.

### Daily digest

**What it does:** Sends a daily summary of relevant brain activity or reminders through Telegram when configured.

**How to use it:**

- Configure Telegram and the digest cron.
- Let the scheduled job run.
- Review the digest message in Telegram.

### Memory of the week

**What it does:** Surfaces older or important memories periodically so useful knowledge does not go stale.

**How to use it:**

- Configure the scheduled job.
- Keep memory cards tagged and categorized.
- Review the weekly memory when it arrives.

### API save endpoint

**What it does:** Allows external tools, the Chrome extension, and integrations to save items into Second Brain.

**How to use it:**

- Send a request to the save API endpoint.
- Include the API secret in the `x-api-key` header when calling from outside the same-origin app.
- Send item fields such as URL, title, text, tags, category, or source.

### Item API

**What it does:** Provides programmatic access to create, read, update, and delete items.

**How to use it:**

- Use the documented API routes from the app.
- Authenticate external calls with the API secret.
- Use same-origin browser calls from the web app.

## Security And Privacy

### API secret protection

**What it does:** Protects external API calls so random callers cannot save or change items.

**How to use it:**

- Keep `API_SECRET` private.
- Configure it in the Chrome extension popup when saving from Chrome.
- Include it as `x-api-key` for external scripts or integrations.

### Single-user app model

**What it does:** Keeps the app simple by assuming one trusted owner instead of a multi-user login system.

**How to use it:**

- Run it as your own personal Second Brain.
- Do not expose admin surfaces publicly without the API secret and deployment protections in place.
- Use the encrypted vault for sensitive secrets.

### Encrypted vault

**What it does:** Stores sensitive secrets separately from normal brain cards using client-side encryption.

**How to use it:**

- Click the vault/lock button.
- Create a master password.
- Save the recovery key somewhere safe.
- Unlock the vault when needed.
- Add entries with title, username, password, URL, notes, and tags.
- Search, reveal, edit, or delete entries from the unlocked vault.

### Vault recovery

**What it does:** Helps regain vault access if you need to recover with the saved recovery key.

**How to use it:**

- Keep the recovery key outside Second Brain.
- Use the vault recovery flow if you lose access.
- Treat the recovery key like a password.

## Offline And Sync

### Offline read support

**What it does:** Lets recently cached app content remain readable when the network is unavailable.

**How to use it:**

- Open the app while online so the service worker can cache app assets.
- If offline, reopen the app and review available cached content.
- Reconnect before making important changes.

### Cross-window sync

**What it does:** Keeps multiple open Second Brain windows or pop-out item windows aware of changes.

**How to use it:**

- Use the app in multiple windows if needed.
- Save changes in one window.
- Other windows update or detect conflicts where needed.

### Edit conflict detection

**What it does:** Warns when an item was changed elsewhere before your edit is saved.

**How to use it:**

- If a conflict warning appears, compare the versions.
- Keep the newer data or intentionally overwrite only when you are sure.

## Admin And Maintenance

### Category manager

**What it does:** Maintains the category system for the brain.

**How to use it:**

- Open category management.
- Add, edit, delete, color, reorder, or nest categories.
- Use categories consistently so filters and saved views stay useful.

### Tag cleanup

**What it does:** Keeps tags from becoming fragmented over time.

**How to use it:**

- Open the tag manager.
- Merge duplicates.
- Standardize spelling and naming.
- Review old tags during cleanup sessions.

### Extension reload after changes

**What it does:** Makes Chrome pick up the latest local extension files.

**How to use it:**

- Go to `chrome://extensions`.
- Find `Second Brain - Save to Brain`.
- Click reload.
- Test by right-clicking a page, link, or selection and choosing `Save to Second Brain`.

### App health checks

**What it does:** Confirms the app is loading and the development server is reachable.

**How to use it:**

- Start the local dev server.
- Open the local URL in Chrome.
- If the app says it cannot load the brain, check the server, environment variables, database connection, and browser console.

### Quality checks

**What it does:** Verifies the codebase before merging or deploying.

**How to use it:**

- Run `npm test` for automated tests.
- Run `npm run build` to confirm production build succeeds.
- Run `npm run lint` to catch lint issues.
- Run `git diff --check` before committing to catch whitespace problems.

## Recommended Daily Workflow

1. Capture everything quickly through the web app, Chrome extension, Telegram, or share sheet.
2. Open the `Inbox` view once or twice a day.
3. Add missing tags, category, reminder, status, or action flag.
4. Use bulk triage for groups of similar cards.
5. Move reviewed items into the right workflow status.
6. Use `Action`, `Tasks`, and `Reminders` for execution.
7. Use search, saved views, table view, and board view when reviewing larger topics.
8. Run cleanup periodically to merge tags, improve weak cards, and archive finished work.
