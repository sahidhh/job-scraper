-- Extend scrape_runs with detailed per-run metrics for source observability.
-- Renames jobs_found → found_count for consistency with the new metric naming,
-- and adds timing, filter-pass, ingest-result, and metadata columns.

ALTER TABLE scrape_runs
  RENAME COLUMN jobs_found TO found_count;

ALTER TABLE scrape_runs
  ADD COLUMN started_at     timestamptz,
  ADD COLUMN completed_at   timestamptz,
  ADD COLUMN duration_ms    integer,
  ADD COLUMN kept_count     integer,
  ADD COLUMN inserted_count integer,
  ADD COLUMN updated_count  integer,
  ADD COLUMN failed_count   integer NOT NULL DEFAULT 0,
  ADD COLUMN metadata       jsonb;
