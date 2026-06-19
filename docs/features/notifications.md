# Notifications Feature

## Overview

The notification system sends Telegram alerts for high-scoring job matches. Every job that
clears the AI scoring threshold triggers a notification (or is included in a digest) the next
time the `notify.ts` cron runs, and each job is guaranteed to be notified at most once.

---

## Architecture

```
scripts/notify.ts           ← cron entry point; reads NOTIFY_MODE
        │
        ├─ NOTIFY_MODE=individual (default)
        │       └─ sendNotification()         one Telegram message per job
        │
        └─ NOTIFY_MODE=digest
                └─ sendDigest()               one grouped Telegram message per run
```

### Layers

| Layer | Path | Responsibility |
|---|---|---|
| Domain | `src/features/notifications/domain/` | Types, repository interfaces, `TelegramSender` interface |
| Application | `src/features/notifications/application/` | Use cases: `sendNotification`, `sendDigest`; formatters; filter logic |
| Infrastructure | `src/features/notifications/infrastructure/` | `TelegramBotSender`, `SupabaseNotificationRepository`, `SupabaseNotificationPreferencesRepository` |
| Script | `scripts/notify.ts` | Wires dependencies, reads env config, dispatches to the correct use case |

### Key files

| File | Purpose |
|---|---|
| `domain/types.ts` | `JobMatch`, `NotificationPreferences`, `NotifyMode` |
| `domain/NotificationRepository.ts` | `findUnnotifiedMatches`, `markNotified`, `listRecent` |
| `domain/TelegramSender.ts` | `sendMessage` interface |
| `application/sendNotification.ts` | Individual-mode use case |
| `application/sendDigest.ts` | Digest-mode use case |
| `application/formatMatchMessage.ts` | Per-job Telegram HTML formatter |
| `application/formatDigestMessage.ts` | Digest Telegram HTML formatter + chunk splitter |
| `application/filterMatches.ts` | Include-only preference filtering |
| `infrastructure/TelegramBotSender.ts` | Telegram Bot API adapter with 429 retry |
| `infrastructure/SupabaseNotificationRepository.ts` | Supabase persistence for matches + log |

---

## Configuration

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | _(required)_ | Token from @BotFather |
| `TELEGRAM_CHAT_ID` | _(required)_ | Chat or channel ID to send messages to |
| `NOTIFY_THRESHOLD` | `0.75` | Minimum `ai_score` [0–1] to include a job in notifications |
| `NOTIFY_MODE` | `individual` | Delivery mode: `individual` or `digest` |

### `NOTIFY_MODE=individual` (default)

One Telegram message per matching job. Preserves the original behaviour. Suitable for low-volume
scraping runs where you want instant per-job alerts.

**Message format:**
```
🎯 New match (87%)
Senior React Developer @ Acme Corp
📍 Remote
Strong match — candidate's Node.js, PostgreSQL experience aligns well.
https://boards.greenhouse.io/acme/jobs/123
```

### `NOTIFY_MODE=digest`

One grouped Telegram message per cron run (split into multiple messages automatically if the
combined text exceeds Telegram's 4 096-character limit). Suitable for high-volume runs where
individual-mode would flood the chat.

**Message format:**
```
📋 Jobs Digest

High Match (≥85%)

🎯 91% — Staff Engineer @ Stripe
📍 Singapore · https://boards.greenhouse.io/stripe/jobs/456

🎯 87% — Senior React Developer @ Acme Corp
📍 Remote · https://boards.greenhouse.io/acme/jobs/123

Medium Match

🎯 78% — Full Stack Developer @ Shopify
📍 Remote · https://example.com/shopify/789

New Companies

• Stripe
• Acme Corp
• Shopify

Summary

3 jobs processed
2 high-value jobs
```

**Score sections:**
- **High Match** — `ai_score ≥ 0.85`
- **Medium Match** — `ai_score ≥ NOTIFY_THRESHOLD` and `< 0.85`

---

## Deduplication

### At-most-once guarantee

Every job is notified at most once, enforced by two complementary mechanisms:

1. **Database constraint** — `notifications_log(job_id)` has a `UNIQUE` constraint. The
   `markNotified(jobId)` call uses `INSERT … ON CONFLICT (job_id) DO NOTHING`.

2. **Query filter** — `findUnnotifiedMatches()` excludes jobs that already have a
   `notifications_log` row via a `LEFT JOIN … WHERE notifications_log.id IS NULL` filter.

### What this covers

| Scenario | Handled |
|---|---|
| Same cron run triggered twice | Yes — second run finds no unnotified matches |
| Job re-scraped on the next run | Yes — upsert on `(source, source_job_id)` keeps the same `job_id` |
| Job score updated after first notification | Yes — `notifications_log` row already exists |
| Notification preferences changed | Partially — filtered-out jobs stay unnotified and re-qualify if preferences are loosened |

### Known limitation: reposted jobs

If a recruiter closes and reposts the same role under a new ATS job ID, the scraper will
ingest it as a new job with a new `job_id`. The deduplication layer has no way to recognise
it as a duplicate, so a second notification will be sent. This is a known limitation
(see `design/limitations.md`).

---

## Notification Preferences

Users can set include-only filters via the `/settings` page (or `setNotificationPreferencesAction`).

Filters are **AND**-ed between categories and **OR**-ed within each category:

| Filter | Field | Match logic |
|---|---|---|
| `roles` | `title` | Case-insensitive substring match against any listed role |
| `skills` | `description` | Skill dictionary lookup; any skill from the list present in the description |
| `locations` | `locationTags` | Exact match; `locationTags` must include at least one listed tag |
| `minExperience` | `min_years` | `min_years ≥ minExperience`; null `min_years` always passes |
| `maxExperience` | `min_years` | `min_years ≤ maxExperience`; null `min_years` always passes |
| `sources` | `source` | Exact match; source must be in the list |

Jobs filtered out by preferences are **not** marked as notified. If preferences are later
loosened, those jobs become eligible again.

Preferences have no effect on which jobs are scored — filtering only happens at the
notification delivery step.

---

## Operational guidance

### Switching delivery modes

Set `NOTIFY_MODE` in the GitHub Actions environment (or `.env` for local runs):

```bash
# Individual mode (default — preserves prior behaviour)
NOTIFY_MODE=individual

# Digest mode (single grouped message per run)
NOTIFY_MODE=digest
```

No database migration is required when switching modes. Both modes read from and write to
the same `notifications_log` table.

### High-volume runs

If a large number of jobs are scored in a single run with `individual` mode, Telegram may
apply rate limiting (20 messages/min per chat). The `TelegramBotSender` respects the
`retry_after` header automatically (capped at 30 seconds), but very large batches (74+
messages) may cause the cron job to run for several minutes.

**Recommendation:** switch to `NOTIFY_MODE=digest` once daily job volume regularly exceeds
~20 matches per run.

### Retrying failed notifications

In individual mode, a send failure for one job is isolated — other jobs in the same run are
still notified. The failed job remains unnotified and will be retried on the next cron run.

In digest mode, a send failure aborts the entire digest. No jobs are marked as notified, so
the full digest will be retried on the next run.

### Clearing the notification log

To re-notify all jobs (e.g. after a Telegram chat migration), truncate `notifications_log`:

```sql
TRUNCATE notifications_log;
```

This requires the service role key and should be run in the Supabase SQL editor with care.

---

## Testing

Tests live alongside the application layer:

| File | Covers |
|---|---|
| `application/sendNotification.test.ts` | Individual-mode use case, error isolation, preference filtering |
| `application/sendDigest.test.ts` | Digest-mode use case, send failure semantics, chunk splitting |
| `application/formatMatchMessage.test.ts` | Per-job message formatting, HTML escaping |
| `application/formatDigestMessage.test.ts` | Digest formatting, section placement, chunk splitting |
| `application/filterMatches.test.ts` | All filter types, AND/OR logic |
| `infrastructure/SupabaseNotificationRepository.test.ts` | DB query construction |
| `infrastructure/TelegramBotSender.test.ts` | HTTP adapter, 429 retry logic |

Run all tests:

```bash
npm test
```
