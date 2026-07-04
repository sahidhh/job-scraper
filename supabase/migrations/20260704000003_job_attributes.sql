-- Deterministic job attributes (Phase 2 personal-intelligence polish, see
-- src/features/jobs/domain/extractJobAttributes.ts). employment_type/
-- seniority/work_arrangement are plain text -- fixed value sets live in
-- TypeScript (EmploymentType/SeniorityLevel/WorkArrangement), same
-- convention as scrape_runs.failure_category / jobs.salary_period.
alter table jobs
  add column employment_type       text,
  add column seniority             text,
  add column work_arrangement      text,
  add column visa_sponsorship      boolean,
  add column relocation_assistance boolean,
  add column security_clearance    boolean not null default false,
  add column urgent_hiring         boolean not null default false;

-- Notification-preference exclude filters (Phase 3) will most commonly
-- restrict/exclude by employment_type; index it for that read path.
create index jobs_employment_type_idx on jobs (employment_type);
