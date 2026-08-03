-- Manual (Claude-routine) job matches (docs/tasks/manual-job-matches.md).
-- New job_source value for ad hoc Claude-routine matches, plus nullable
-- columns for the routine's own 0-100 score and narrative fields. Additive
-- only -- never touched by the automated scrape/score pipeline.
alter type job_source add value if not exists 'claude_routine';

alter table jobs add column if not exists manual_score integer;
alter table jobs add column if not exists manual_standout text;
alter table jobs add column if not exists manual_verify text;
alter table jobs add column if not exists manual_requirements text;

alter table jobs
  add constraint jobs_manual_score_range
  check (manual_score is null or (manual_score >= 0 and manual_score <= 100));
