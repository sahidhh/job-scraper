-- Track which AI model produced each score row so that scores can be
-- audited or invalidated when the OPENROUTER_MODEL env var changes.
-- Nullable: existing rows and keyword-gate-skipped rows (ai_score IS NULL)
-- keep NULL for model.
alter table job_scores add column model text;
