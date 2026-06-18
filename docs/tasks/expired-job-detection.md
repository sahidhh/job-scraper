# Expired Job Detection (Phase 1)

## Problem

Jobs scraped into the platform remain in the `jobs` table indefinitely. When a posting is removed from the source board (filled, expired, or delisted), it continues to appear in the dashboard, skewing analytics and lowering trust in recommendations. Users have no way to tell whether a job is still accepting applications.

## Root Cause

The upsert pipeline (`SupabaseJobRepository.upsertMany`) only wrote `updated_at` on conflict — there was no field to distinguish "seen in this scrape run" from "last seen weeks ago". Nothing in the pipeline checked whether an existing job failed to appear in a new scrape.

## Requirements

- During every scrape, jobs that are found again must have their "last seen" timestamp refreshed.
- Newly discovered jobs must have the timestamp initialized.
- Jobs not seen for a configurable threshold (default 14 days) must be marked inactive.
- Dashboard and all user-facing queries must show only active jobs by default.
- Historical records must never be deleted.

## Design Decisions

### Option A: Last Seen Tracking (chosen)

Add `last_seen_at` to every job row. On each upsert, write `last_seen_at = now()`. After all scrapers finish, run a single `UPDATE` to mark jobs inactive where `is_active = true AND last_seen_at < now() - N days`.

This approach is minimal-diff: one migration, one extra field in `toUpsertRow`, one new method in the repository, and one call at the end of `scripts/scrape.ts`.

### Option B: Per-Scrape Seen Set

Track which `(source, source_job_id)` pairs appeared in the current scrape run, then diff against the DB. Rejected: requires holding entire source catalogs in memory and is complex to implement correctly for partial scrape failures.

### Option C: Source Re-Fetch for Each Job

Re-fetch individual job URLs to verify they're still live. Rejected: too many HTTP requests, sources may block, and it's disproportionately expensive.

## Alternatives Considered

- **Hard delete**: Destroys historical data, breaks `notifications_log` FK, prevents analytics on past pipelines. Rejected.
- **Expiration via DB trigger**: Adds implicit database logic outside the application layer, harder to test and deploy. Rejected.
- **`inactive_at` instead of `is_active`**: Would require `IS NULL` checks everywhere instead of a simple boolean. The boolean is cleaner.

## Files Changed

| File | Change |
|---|---|
| `supabase/migrations/20260618000001_expired_job_detection.sql` | Adds `last_seen_at`, `is_active`, `inactive_reason` columns + index |
| `supabase/database.types.ts` | Adds new columns to jobs Row/Insert/Update types |
| `src/features/jobs/domain/types.ts` | Adds `lastSeenAt`, `isActive`, `inactiveReason` to `Job` interface |
| `src/features/jobs/domain/JobRepository.ts` | Adds `markExpiredJobs(thresholdDays)` to interface |
| `src/features/jobs/infrastructure/SupabaseJobRepository.ts` | `toUpsertRow` writes `last_seen_at`+`is_active`; `findForDashboard`/`findUnscored`/`countMatchingExpandedRoles` filter `is_active=true`; implements `markExpiredJobs` |
| `scripts/scrape.ts` | Calls `markExpiredJobs` after all scrapers finish; reads `JOB_EXPIRATION_DAYS` env var |
| `src/features/jobs/infrastructure/SupabaseJobRepository.test.ts` | Updates fixtures; adds `markExpiredJobs` tests |
| `design/erd.md` | Documents new columns in the JOBS entity |
| `design/limitations.md` | Updates §1.6 — limitation is now resolved |
| `docs/tasks/expired-job-detection.md` | This file |

## DB Changes

```sql
ALTER TABLE jobs
  ADD COLUMN last_seen_at   timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN is_active      boolean     NOT NULL DEFAULT true,
  ADD COLUMN inactive_reason text;

CREATE INDEX jobs_is_active_idx ON jobs (is_active);
```

Existing rows receive `last_seen_at = now()` so no job is immediately expired after deploy.

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `JOB_EXPIRATION_DAYS` | `14` | Days without being seen before a job is marked inactive |

## Testing

All tests pass (`npx vitest run`). New test coverage:

- `markExpiredJobs` updates only active jobs older than the cutoff and returns the count.
- `markExpiredJobs` returns 0 when no jobs meet the threshold.
- Existing upsert tests verify `last_seen_at` and `is_active` are written on every upsert.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Jobs re-listed after expiry won't reactivate | Low | Upsert always writes `is_active=true` + `last_seen_at=now()`, so a returning job will be reactivated on the next scrape |
| Feed-based sources that partially fail temporarily expire valid jobs | Medium | Expiration threshold is 14 days by default — short-lived outages won't trigger expiry |
| Newly deployed migration immediately expires all jobs | None | Migration sets `last_seen_at = now()` for all existing rows |

## Rollback Plan

1. Revert `scripts/scrape.ts` to remove the `markExpiredJobs` call (stops further expirations).
2. Run `UPDATE jobs SET is_active = true` to restore all hidden jobs.
3. Revert code changes and migration (drop columns via a new migration if needed).
