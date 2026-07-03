-- Deterministic failure classification (Phase 1 Task 5/7, see
-- src/features/sources/domain/classifyScrapeFailure.ts). Plain text, not a
-- Postgres enum -- the fixed value set lives in TypeScript
-- (FailureCategory) so it can be extended without an enum-alter migration.
-- Set when status='failed' (why the adapter threw), or 'empty_feed' on an
-- otherwise-successful run that found zero jobs. Null when the run
-- succeeded normally.
alter table scrape_runs add column failure_category text;
