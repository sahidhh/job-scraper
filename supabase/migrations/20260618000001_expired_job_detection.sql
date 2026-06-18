-- Expired job detection (Phase 1, docs/tasks/expired-job-detection.md).
--
-- last_seen_at: updated on every upsert so we can detect jobs that haven't
--   appeared in recent scrapes. Initialized to now() for all existing rows
--   so no job is immediately considered expired on deploy.
-- is_active: set to false by the expiration sweep when a job hasn't been seen
--   for JOB_EXPIRATION_DAYS (default 14). Never hard-deleted.
-- inactive_reason: optional label for why a job became inactive
--   ('expired' is the only value set today; reserved for future use).

alter table jobs
  add column last_seen_at  timestamptz not null default now(),
  add column is_active      boolean     not null default true,
  add column inactive_reason text;

-- Backfill: treat all existing rows as seen today so nothing expires
-- immediately after the migration is applied.
update jobs set last_seen_at = now() where last_seen_at = now();

create index jobs_is_active_idx on jobs (is_active);
