-- Retry visibility for the AI-scoring queue (Phase 1 Task 6). scored_at
-- alone can't tell "how many times has this job failed to get an ai_score"
-- because it is set once at first insert and never touched by a plain
-- upsert -- it stays stable across retries (useful for "oldest pending",
-- but not for "how many attempts"). retry_count adds that missing signal.
alter table job_scores add column retry_count integer not null default 0;

-- Atomic upsert + retry-count increment: a plain client-side .upsert()
-- can't express "increment only when the write leaves ai_score null"
-- without a read-modify-write round trip per job, so this mirrors the
-- existing set_active_resume/set_active_role_selection RPC pattern
-- (decisions.md AD-09) for a single-round-trip atomic write instead.
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
  p_estimated_cost_usd numeric
)
returns void
language plpgsql
as $$
begin
  insert into job_scores (
    job_id, role_selection_id, resume_version, keyword_score, ai_score,
    ai_reasoning, model, tokens_input, tokens_output, estimated_cost_usd,
    retry_count
  )
  values (
    p_job_id, p_role_selection_id, p_resume_version, p_keyword_score, p_ai_score,
    p_ai_reasoning, p_model, p_tokens_input, p_tokens_output, p_estimated_cost_usd,
    case when p_ai_score is null then 1 else 0 end
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
    retry_count = job_scores.retry_count + case when excluded.ai_score is null then 1 else 0 end;
end;
$$;
