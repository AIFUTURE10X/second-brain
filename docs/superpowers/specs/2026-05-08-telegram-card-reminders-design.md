# Telegram Card Reminders Design

## Goal

Add reminders to Second Brain cards so important subscriptions, cancellations, reviews, and follow-ups can trigger Telegram pings without using email.

## Scope

The first version stores one or more reminders linked to existing cards. Telegram is the delivery channel. Browser notifications, desktop-native notifications, recurring reminders, and two-way Telegram commands are out of scope for the first pass.

## User Experience

Each card edit surface gets a reminder section with:

- a due date/time field,
- an optional reminder note,
- quick visibility when a card has a pending reminder,
- a way to clear the reminder once it is no longer needed.

Card lists show a compact reminder badge for pending reminders. The badge uses the reminder due time so the user can scan what is coming up without opening each card.

When a reminder is due, the Telegram bot sends a message containing:

- the reminder note or a generic reminder title,
- the card title,
- the due time,
- a direct link to the card.

## Data Model

Create a `reminders` table:

- `id`: UUID primary key,
- `item_id`: UUID foreign key to `items.id`, cascade delete,
- `message`: optional short reminder note,
- `due_at`: timestamp,
- `status`: `pending`, `sent`, or `done`,
- `sent_at`: nullable timestamp,
- `created_at` and `updated_at`.

Indexes support listing reminders by card and finding due pending reminders efficiently.

## API

Add `/api/reminders`:

- `GET`: list reminders, optionally filtered by `itemId`,
- `POST`: create a pending reminder for a card,
- `PUT`: update a reminder's due time, message, or status,
- `DELETE`: delete a reminder.

Add `/api/cron/reminders`:

- verify cron auth using the existing `CRON_SECRET` helper,
- find pending reminders where `due_at <= now`,
- send a Telegram message to configured allowed users,
- mark successfully sent reminders as `sent` with `sent_at`.

If Telegram is not configured, the cron route returns an explicit configuration error and does not change reminder state.

## Integration Points

The main card UI in `components/Brain.tsx` owns the first reminder editor because it already handles card create/edit. The pop-out card page gets the same basic fields so editing a card in a separate window does not hide reminders.

`vercel.json` adds a cron entry for the reminder check. The schedule should be frequent enough for practical reminders while still respecting Vercel cron limits.

## Testing

Add a `node:test` helper test for reminder due selection and Telegram message formatting. Then verify TypeScript and the production build.

## Future Work

Later versions can add snooze buttons, recurring reminders, Telegram reply commands, desktop-native notifications, and a dedicated reminders view.
