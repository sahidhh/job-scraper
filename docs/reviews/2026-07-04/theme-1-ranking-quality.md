# Theme 1 — Job Quality & Ranking

**Date:** 2026-07-04 (continuous-improvement session)
**Scope:** Investigate ranking/prioritization gaps for a single-user dashboard; implement only high-value, low/medium-complexity, low-risk items.

## Investigation Summary

Prior to this pass, the dashboard sorted purely by `ai_score` (descending, `posted_at` tiebreaker). There
was no composite score, no notion of a preferred company or technology, no remote-preference weighting,
no salary weighting, and no per-job explanation of *why* it ranked where it did. `computeKeywordScore`
already serves as an implicit "technology weighting" proxy (skill-overlap recall against the resume), so
a separate technology-weighting mechanism would be redundant with the existing two-stage scoring pipeline.

Freshness was already handled: the dashboard's `posted_at desc` secondary sort key already breaks ties by
recency, so a dedicated "freshness bonus" would double-count the same signal.

## Implemented

**Deterministic composite ranking score** (`overall_score`):

- `computeOverallScore(job, aiScore, preferences)` (`src/features/scoring/application/computeOverallScore.ts`) —
  pure function: `overall_score = min(1, ai_score + companyBonus? + remoteBonus? + salaryBonus?)`.
  - **Preferred company weighting**: case-insensitive substring match against `canonicalCompanyName`.
  - **Remote preference weighting**: applies only when the user has opted in (`preferRemote`) and the job is tagged `remote`.
  - **Salary weighting**: applies when the job has *any* parsed salary (min or max) — an information-advantage signal, not a judgement of whether the number is competitive (no market-data comparison exists in this codebase, and adding one would cross into the "avoid complex recommendation engines" boundary).
  - All three bonus amounts are configurable (defaults 5%/3%/2%), satisfying "configurable ranking weights."
- **Explanation of score**: `overall_score_reasons` (text array) records which bonuses applied; shown next to the AI score badge on both the desktop table (`JobRow.tsx`) and mobile card (`JobCard.tsx`) — e.g. "+ preferred company, remote".
- **Settings UI**: `/settings` → Ranking (`RankingPreferencesCard.tsx`) lets the user list preferred companies, toggle "prefer remote," and override bonus amounts; `getRankingPreferencesAction`/`setRankingPreferencesAction` (`src/features/scoring/actions.ts`).
- **Persistence**: computed once per job at scoring time in `scoreJob.ts` (mirrors the existing `ai_score` write path), stored on `job_scores.overall_score`/`overall_score_reasons` via two new trailing, defaulted parameters on the `upsert_job_score` RPC (`supabase/migrations/20260704000003_ranking_overall_score.sql`) — additive, no breaking signature change.
- **Backfill**: the same migration sets `overall_score = ai_score` for every already-scored row, so existing jobs don't sink to the bottom of the new sort just for predating the column.
- **Dashboard sort**: `SupabaseJobRepository.findForDashboard` now orders by `overall_score desc nulls last` (was `ai_score`), `posted_at desc` tiebreaker unchanged.

## Why Read-Time Recomputation Was Rejected

The obvious alternative — computing `overall_score` at dashboard-read time, following the existing
"skills recomputed at read time, not persisted" precedent from the insights feature — was considered and
rejected. The dashboard's pagination is genuine server-side `LIMIT`/`OFFSET` via PostgREST; re-sorting by
a value only known after fetching would require either fetching every matching row on every page load (a
real, riskier change to a core, heavily-tested query path, unverifiable end-to-end without live Supabase
credentials in this environment) or would silently fail to bubble a page-2 preferred-company job onto
page 1. Persisting at scoring time keeps the existing pagination/sort architecture completely intact. See
`docs/decisions.md` AD-25 for the full writeup.

## Skipped

- **Freshness weighting as a separate bonus** — already covered by the existing `posted_at desc`
  tiebreaker; adding it as an additive bonus too would double-count the same signal.
- **Technology/skill weighting** — already covered by `computeKeywordScore` (stage-1 scoring) and folded
  into `aiScore` (stage-2); a separate mechanism would be redundant.
- **Confidence indicators beyond what already exists** — `salaryConfidence`/`contactEmailConfidence`
  already exist per-field; a dedicated "ranking confidence" indicator was judged low-value on top of the
  existing AI reasoning text and bonus-reason list, and risked becoming a vague, unexplainable number.
- **ML/embeddings-based re-ranking** — explicitly out of scope per this session's constraints.

## Files Changed

- `supabase/migrations/20260704000003_ranking_overall_score.sql` (new)
- `supabase/database.types.ts` (manually patched — no live Supabase project to regenerate from)
- `src/features/scoring/domain/types.ts`, `validation.ts` (+test), `RankingPreferencesRepository.ts` (new)
- `src/features/scoring/application/computeOverallScore.ts` (new, +test), `scoreJob.ts` (+wired)
- `src/features/scoring/infrastructure/SupabaseRankingPreferencesRepository.ts` (new), `SupabaseScoreRepository.ts` (+test)
- `src/features/scoring/actions.ts` (new)
- `src/features/jobs/domain/types.ts` (`JobWithScore.overallScore`/`overallScoreReasons`)
- `src/features/jobs/infrastructure/SupabaseJobRepository.ts` (+test)
- `src/components/settings/RankingPreferencesCard.tsx` (new)
- `src/components/dashboard/JobRow.tsx`, `JobCard.tsx`
- `src/app/(protected)/settings/page.tsx`
- `scripts/score.ts`
- Docs: `design/architecture.md`, `design/erd.md`, `design/scope.md`, `design/use-cases.md`, `design/api-reference.md`, `design/user-guide.md`, `design/limitations.md`, `design/tech-stack.md` (none — no new env var), `docs/decisions.md` (AD-25)

## Testing

`npx tsc --noEmit`, `npx vitest run` (all suites green, including 9 new `computeOverallScore` tests, 7 new
`validateRankingPreferences`/`validateNewJobScore` tests, and new `SupabaseJobRepository`/
`SupabaseScoreRepository` assertions), `npm run build`, `npm run check:service-role-boundary` — all pass.
No live Supabase project available in this environment, so the migration itself was reviewed but not
replayed against a real database (see "Remaining Opportunities").

## Impact

- **User experience**: dashboard ranking now reflects more of what actually matters to a single job-seeker
  (preferred employers, remote preference, salary transparency), with a visible explanation instead of a
  black-box AI number.
- **Data quality / reliability**: fully deterministic, backward-compatible (backfilled), reversible
  (dropping the two new columns/RPC params is a clean rollback).

## Remaining Opportunities

- Apply the migration to a live Supabase project and confirm `supabase db push` succeeds end-to-end
  (cannot be verified in this sandboxed environment — no live credentials).
- If real usage shows the additive-bonus model needs finer control (e.g. per-technology weighting), that
  would be a new, separate proposal — not implemented speculatively here.
