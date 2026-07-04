-- Cross-source duplicate detection (Phase 1 Task 1-3). A deterministic
-- fingerprint (normalized title + canonical company + location tags,
-- computed in TS -- see src/features/jobs/application/computeFingerprint.ts)
-- lets ingestJobs/SupabaseJobRepository recognize the same logical job
-- posted on two different sources instead of inserting a second row.
--
-- fingerprint/canonical_company_name default to '' for existing rows;
-- run `npm run backfill:fingerprints` once after deploying this migration
-- to populate them for jobs ingested before this change (see
-- scripts/backfill-fingerprints.ts).
alter table jobs
  add column fingerprint text not null default '',
  add column canonical_company_name text not null default '';

create index jobs_fingerprint_idx on jobs (fingerprint);

-- Provenance for a logical job rediscovered under a different (source,
-- source_job_id) after fingerprint-matching an existing `jobs` row. The
-- `jobs` row itself is never duplicated -- this just records that another
-- source also carries the same posting.
create table job_duplicates (
  id               uuid primary key default gen_random_uuid(),
  canonical_job_id uuid not null references jobs(id) on delete cascade,
  source           job_source not null,
  source_job_id    text not null,
  url              text not null,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),

  constraint job_duplicates_source_source_job_id_uq unique (source, source_job_id)
);

create index job_duplicates_canonical_job_id_idx on job_duplicates (canonical_job_id);

-- Per-run duplicate count, alongside the existing inserted/updated counters
-- (scrape_runs, 20260619000001_scrape_run_metrics.sql).
alter table scrape_runs add column duplicate_count integer;

-- RLS: authenticated users can read (future analytics); writes are
-- service-role only (scripts/scrape.ts), same pattern as role_packs.
alter table job_duplicates enable row level security;

create policy "authenticated users can read job_duplicates"
  on job_duplicates for select
  to authenticated
  using (true);
