-- Add per-call token usage and estimated cost to job_scores for spend
-- visibility and historical cost analysis (roadmap initiative 3).
-- All columns are nullable: existing rows and keyword-gate-skipped rows
-- (ai_score IS NULL) retain NULL; only rows where the AI call succeeded
-- will have non-null values after this deploy.
alter table job_scores
  add column tokens_input      integer,
  add column tokens_output     integer,
  add column estimated_cost_usd numeric(10,8);
