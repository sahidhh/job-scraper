-- Job status tracking (P0, docs/plans/feature-roadmap.md Phase 1).
-- Turns the scraper into a tracker: each job carries at most one
-- user-assigned status. Statuses are seeded (supabase/seed.sql) with mild
-- colors; full add/edit/delete CRUD is deferred to a later phase.
--
-- "Archive" / "remove" is a status value (Archived), NOT a DELETE -- the
-- scrape pipeline upserts on (source, source_job_id) and would re-insert any
-- hard-deleted row on the next cron run (architecture.md §3.1).

-- ============================================================
-- job_statuses: config rows (label + mild display color).
-- ============================================================
create table job_statuses (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique,
  color      text not null,                 -- mild hex, e.g. '#E5E7EB'
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- job_state: at most one status per job. No row => "unset" (rendered as New).
-- on delete cascade with jobs; on delete set null with job_statuses so
-- removing a status config doesn't orphan-delete the job's state row.
-- ============================================================
create table job_state (
  job_id     uuid primary key references jobs(id) on delete cascade,
  status_id  uuid references job_statuses(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index job_state_status_idx on job_state (status_id);

-- RLS: single-user app, one full-access policy per table for the
-- authenticated role (20260612000005_rls.sql). Service role bypasses RLS.
alter table job_statuses enable row level security;
alter table job_state    enable row level security;

create policy "authenticated_full_access" on job_statuses
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on job_state
  for all to authenticated using (true) with check (true);
