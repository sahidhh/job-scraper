-- Composite ranking score (continuous-improvement pass, Theme 1): a
-- deterministic, additive blend of ai_score plus small configurable bonuses
-- (preferred company, remote preference, salary disclosed -- see
-- computeOverallScore.ts and design/decisions.md). Nullable and indexed the
-- same way as ai_score, so jobs awaiting AI scoring keep sorting exactly as
-- before. overall_score_reasons records which bonuses applied, for display
-- next to the score ("why this job ranked here").
alter table job_scores add column overall_score real;
alter table job_scores add column overall_score_reasons text[];

-- Backfill: every already-scored row gets overall_score = ai_score (i.e.
-- zero bonuses) so existing rows don't sink to the bottom of the new
-- `overall_score desc nulls last` dashboard sort just because they predate
-- this column. Bonuses apply from the next scoring run onward, when
-- score.ts recomputes and rewrites the row via upsert_job_score.
update job_scores set overall_score = ai_score where ai_score is not null and overall_score is null;

create index job_scores_overall_score_idx on job_scores (overall_score desc nulls last);

-- Extend upsert_job_score with two new optional parameters appended at the
-- end with defaults -- CREATE OR REPLACE FUNCTION supports adding
-- parameters this way without creating a duplicate overload, so existing
-- callers that omit them keep working unchanged.
create or replace function upsert_job_score(
  p_job_id uuid,
  p_role_selection_id uuid,
  p_resume_version integer,
  p_keyword_score real,
  p_ai_score real,
  p_ai_reasoning text,
  p_model text,
  p_tokens_input integer,
  p_tokens_output integer,
  p_estimated_cost_usd numeric,
  p_overall_score real default null,
  p_overall_score_reasons text[] default null
)
returns void
language plpgsql
as $$
begin
  insert into job_scores (
    job_id, role_selection_id, resume_version, keyword_score, ai_score,
    ai_reasoning, model, tokens_input, tokens_output, estimated_cost_usd,
    retry_count, overall_score, overall_score_reasons
  )
  values (
    p_job_id, p_role_selection_id, p_resume_version, p_keyword_score, p_ai_score,
    p_ai_reasoning, p_model, p_tokens_input, p_tokens_output, p_estimated_cost_usd,
    case when p_ai_score is null then 1 else 0 end,
    p_overall_score, p_overall_score_reasons
  )
  on conflict (job_id, role_selection_id, resume_version)
  do update set
    keyword_score = excluded.keyword_score,
    ai_score = excluded.ai_score,
    ai_reasoning = excluded.ai_reasoning,
    model = excluded.model,
    tokens_input = excluded.tokens_input,
    tokens_output = excluded.tokens_output,
    estimated_cost_usd = excluded.estimated_cost_usd,
    retry_count = job_scores.retry_count + case when excluded.ai_score is null then 1 else 0 end,
    overall_score = excluded.overall_score,
    overall_score_reasons = excluded.overall_score_reasons;
end;
$$;
