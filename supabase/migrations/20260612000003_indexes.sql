-- Performance indexes and partial-unique indexes (the latter double as
-- constraints -- see decisions.md AD-09 for the single-active pattern).

-- ============================================================
-- companies
-- ============================================================

-- one board_token per source (ignore rows where board_token is null,
-- since wellfound/remoteok never set it)
create unique index companies_source_token_uq
  on companies (source, board_token)
  where board_token is not null;

-- scrape.ts loads only active companies, per source
create index companies_active_idx
  on companies (source)
  where active = true;

-- ============================================================
-- jobs
-- ============================================================

-- dashboard filter by location tag (array containment / overlap)
create index jobs_location_tags_idx
  on jobs using gin (location_tags);

-- dashboard default sort
create index jobs_posted_at_idx
  on jobs (posted_at desc);

-- "new since last visit" queries
create index jobs_first_seen_idx
  on jobs (first_seen_at desc);

-- ============================================================
-- resumes
-- ============================================================

-- AD-09: at most one active resume at a time
create unique index resumes_single_active_uq
  on resumes (is_active)
  where is_active = true;

-- ============================================================
-- role_selections
-- ============================================================

-- AD-09: at most one active role selection at a time
create unique index role_selections_single_active_uq
  on role_selections (is_active)
  where is_active = true;

-- ============================================================
-- job_scores
-- ============================================================

-- dashboard sort by match score; notify.ts threshold query
create index job_scores_ai_score_idx
  on job_scores (ai_score desc nulls last);

-- score lookups scoped to the active role_selection
create index job_scores_role_selection_idx
  on job_scores (role_selection_id);

-- ============================================================
-- scrape_runs
-- ============================================================

-- settings page recent-runs view
create index scrape_runs_run_at_idx
  on scrape_runs (run_at desc);
