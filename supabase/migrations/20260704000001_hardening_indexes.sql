-- Production hardening review (2026-07-04): indexes for query shapes added
-- during Phases 1-4 that weren't covered by 20260612000003_indexes.sql.
--
-- Note: jobs.is_active is NOT indexed here -- 20260618000001_expired_job_
-- detection.sql already created `jobs_is_active_idx on jobs (is_active)`
-- when that column was added. An earlier audit this pass missed that and
-- tried to (re)create it as a partial index under the same name, which
-- fails migration application with "relation already exists" (verified by
-- replaying every migration file in order against a throwaway Postgres
-- instance). The existing full index already serves `is_active = true`
-- lookups; a partial index would only be a marginal space optimization on
-- a 2-valued boolean column, not worth a second index/name here.

-- ============================================================
-- job_scores
-- ============================================================

-- findAwaitingAi's scoring-queue shape: filtered to one (role_selection,
-- resume_version) pair, unscored rows only, ordered oldest-first.
create index job_scores_awaiting_ai_idx
  on job_scores (role_selection_id, resume_version, scored_at)
  where ai_score is null;

-- ============================================================
-- scrape_runs
-- ============================================================

-- listRecentBySource (getSourceHealthReport, called once per source per
-- /analytics load) filters by source then sorts by run_at desc; the
-- existing scrape_runs_run_at_idx only covers the unfiltered listRecent.
create index scrape_runs_source_run_at_idx
  on scrape_runs (source, run_at desc);
