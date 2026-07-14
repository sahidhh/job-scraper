-- Local embedding-similarity signal (merge-workspace Phase 2, decisions.md
-- AD-31): resume/job cosine similarity computed offline via
-- Transformers.js, continuously mapped to [0,1] (jobhunt bug #1 fix -- see
-- embeddingSimilarity.ts). Stage 2, same keyword-threshold gate as
-- ai_score. Informational only -- not part of overall_score's ranking
-- blend, so no index (nothing sorts or filters on it yet).
alter table job_scores add column embedding_score real;

-- Extend upsert_job_score with one new optional parameter appended at the
-- end with a default -- CREATE OR REPLACE FUNCTION supports this without
-- creating a duplicate overload, so existing callers that omit it keep
-- working unchanged (same pattern as AD-26's overall_score addition).
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
  p_overall_score_reasons text[] default null,
  p_embedding_score real default null
)
returns void
language plpgsql
as $$
begin
  insert into job_scores (
    job_id, role_selection_id, resume_version, keyword_score, ai_score,
    ai_reasoning, model, tokens_input, tokens_output, estimated_cost_usd,
    retry_count, overall_score, overall_score_reasons, embedding_score
  )
  values (
    p_job_id, p_role_selection_id, p_resume_version, p_keyword_score, p_ai_score,
    p_ai_reasoning, p_model, p_tokens_input, p_tokens_output, p_estimated_cost_usd,
    case when p_ai_score is null then 1 else 0 end,
    p_overall_score, p_overall_score_reasons, p_embedding_score
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
    overall_score_reasons = excluded.overall_score_reasons,
    embedding_score = excluded.embedding_score;
end;
$$;
