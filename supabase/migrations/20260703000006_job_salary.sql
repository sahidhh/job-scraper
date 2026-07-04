-- Salary extraction (Phase 2 Task 10, see
-- src/features/jobs/domain/extractSalary.ts). period/confidence are plain
-- text -- fixed value sets live in TypeScript (SalaryPeriod: yearly|monthly|
-- hourly; SalaryConfidence: high|medium|low) -- same convention as
-- scrape_runs.failure_category / jobs.contact_email_category.
alter table jobs
  add column salary_currency   text,
  add column salary_min        numeric,
  add column salary_max        numeric,
  add column salary_period     text,
  add column salary_confidence text;
