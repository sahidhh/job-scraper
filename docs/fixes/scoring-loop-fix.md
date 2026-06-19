# Scoring Loop Fix

## Root Cause

`JobRepository.findUnscored()` returned any job whose `job_scores` row had `ai_score IS NULL` for the current `(role_selection_id, resume_version)`. The query could not distinguish between:

1. **Intentional skip** — `keyword_score < KEYWORD_THRESHOLD`; stage 2 (AI) deliberately did not run.
2. **Genuine AI failure** — `keyword_score >= KEYWORD_THRESHOLD` but the AI call returned null (timeout, 5xx, malformed response); stage 2 should be retried.

Both cases store `ai_score = null`. Without distinguishing them, every job below the keyword gate was re-queued on every `score.ts` run, causing an infinite loop that wasted compute and produced noisy logs.

## Previous Behavior

1. `score.ts` called `findUnscored(roleSelectionId, expandedRoles, resumeVersion)`.
2. That query fetched all `job_scores` rows where `ai_score IS NOT NULL` and excluded those job IDs.
3. Any job with `ai_score IS NULL` — including intentionally-skipped jobs — was returned.
4. `scoreJob` ran again, computed the same keyword score, stored `ai_score = null` again.
5. Repeat on every cron run, forever.

## New Behavior

`findUnscored` now accepts a fourth parameter: `keywordThreshold: number`.

The exclusion query uses an OR filter:

```sql
SELECT job_id FROM job_scores
WHERE role_selection_id = $roleSelectionId
  AND resume_version    = $resumeVersion
  AND (
        ai_score IS NOT NULL          -- fully scored
        OR
        keyword_score < $threshold    -- intentionally skipped at gate
      )
```

Jobs in this set are excluded from the scoring queue. Jobs where `keyword_score >= threshold AND ai_score IS NULL` (genuine AI failure) are **not** in this set and remain eligible for retry.

`score.ts` passes `keywordThreshold` to `findUnscored` after reading it from the `KEYWORD_THRESHOLD` env var (default `0.25`).

## Operational Impact

- Jobs below the keyword gate are scored exactly once (keyword stage only) and then permanently excluded from retry for that `(role_selection_id, resume_version)`.
- If `KEYWORD_THRESHOLD` is raised, jobs that previously fell below the new threshold are no longer re-queued. Jobs that previously fell above the old threshold but below the new one will be excluded on the next run.
- If the active resume changes (new `resume_version`), all jobs are re-scored against the new resume, including previously-skipped ones — this is the intended behavior, since the new resume may have different skills.
- No schema migration required; the fix is purely in query logic.

## Follow-up Regression and Resolution

Expanding the exclusion set to cover keyword-skipped jobs (in addition to AI-scored ones) caused `doneIds` to grow from ~50 to ~400+ entries. The original implementation excluded them by placing all IDs in a PostgREST `NOT IN (...)` URL parameter, which exceeded the 8 KB Supabase API gateway limit and produced a 414 URI Too Long error on every `score.ts` run.

The regression was fixed by replacing the single two-query pattern with a three-step approach:

1. **Query 1** (unchanged): fetch `doneIds` from `job_scores` using the OR filter above — result is a response body, not a URL parameter.
2. **Query 2** (new): fetch only `id` from `jobs` matching the role filter — URL is small regardless of done-set size.
3. **In memory**: compute `eligibleIds = candidateIds − doneIds` as a set difference.
4. **Query 3+** (chunked): fetch full job rows for eligible IDs in chunks of 100 — each URL is bounded to ≤ 3,700 chars.

No schema changes were required. See `docs/reports/findUnscored-regression-fix.md` for the full investigation and implementation record.
