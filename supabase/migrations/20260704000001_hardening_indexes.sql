-- Production hardening review (2026-07-04): indexes for query shapes added
-- during Phases 1-4 that weren't covered by 20260612000003_indexes.sql.

-- ============================================================
-- jobs
-- ============================================================

-- findUnscored/countMatchingExpandedRoles/countJobStats/markExpiredJobs all
-- filter on is_active before anything else; no existing index covers it.
create index jobs_is_active_idx
  on jobs (is_active)
  where is_active = true;

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
