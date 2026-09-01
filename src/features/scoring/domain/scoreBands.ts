/**
 * The bands an `ai_score` in [0,1] is read through. Lives in the scoring
 * domain rather than beside the badge that renders it, because the dashboard
 * repository filters on the same boundaries and infrastructure must not import
 * from `src/components/` to get them. `components/dashboard/jobScore.ts`
 * re-exports these for the UI, so there is still one definition.
 *
 * Fixed by docs/decisions.md AD-56: `0.75` is NOTIFY_THRESHOLD (docs/
 * scoring.md §3/§5), so a green badge means "this one would have pinged you".
 * Do not retune these without amending that decision.
 */
export const AI_SCORE_STRONG = 0.75;
export const AI_SCORE_MODERATE = 0.4;

/**
 * The score the AI scorer returns when it declines to make a judgement.
 *
 * This is an empirical fact about the model's output, not a preference. The
 * scorer emits coarse multiples of 0.05, and `0.4000` is by far its largest
 * single output: on the production set at the time of writing, 160 of 340
 * scored, eligible, active jobs (47%) sat on exactly `0.4`, against 30 above
 * it and 6 at or above `AI_SCORE_STRONG`. A pile that size on one exact value
 * is a default, not a distribution -- it is what the model returns when the
 * posting gives it nothing to work with.
 *
 * It coincides with `AI_SCORE_MODERATE` by construction, which is why the
 * dashboard's weak-match cut is `> AI_SCORE_SHRUG` and not `>=`: everything at
 * the shrug value is the model's silence, and the first genuine "this is a
 * partial fit" sits above it. Being equal to `AI_SCORE_MODERATE` today does
 * not make it the same number -- one is where a badge turns amber, the other
 * is where the model gave up -- so it is named separately and both are
 * asserted in `scoreBands.test.ts`. If the scoring prompt or model changes,
 * re-measure this against `job_scores` before trusting the filter that uses it
 * (docs/decisions.md AD-69).
 */
export const AI_SCORE_SHRUG = 0.4;

/**
 * Whether a score represents a real positive judgement rather than the
 * scorer's shrug. `score` is on the 0-1 AI scale; `claude_routine` rows must
 * normalise their 0-100 `manual_score` before calling (the same normalisation
 * `manualScoreBadgeVariant` already does).
 *
 * Null is *not* weak -- an unscored job has no judgement either way, and the
 * dashboard's low-match/queued buckets already account for it.
 */
export function isAboveShrug(score: number | null): boolean {
  return score === null || score > AI_SCORE_SHRUG;
}
