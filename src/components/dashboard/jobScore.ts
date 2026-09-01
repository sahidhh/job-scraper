import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";

// Shared score presentation for the desktop row (`ScoreBadge`) and the mobile
// card (`ScorePill`). Both used to carry their own copy of the formatter and
// of the band thresholds, which is exactly how two surfaces drift apart.

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

// Defined in the scoring domain (features/scoring/domain/scoreBands.ts), not
// here: the dashboard repository filters on the same boundaries, and
// infrastructure cannot import from `src/components/`. Re-exported so the
// existing UI import path keeps working and there is still one definition.
export { AI_SCORE_MODERATE, AI_SCORE_STRONG } from "@/features/scoring/domain/scoreBands";
import { AI_SCORE_MODERATE, AI_SCORE_STRONG } from "@/features/scoring/domain/scoreBands";

/** `0.83` -> `"83%"`. Unscored reads as an em dash. */
export function formatScore(score: number | null): string {
  return score === null ? "—" : `${Math.round(score * 100)}%`;
}

/** Badge colour for a job that has been through the AI scoring stage. */
export function scoreBadgeVariant(aiScore: number): BadgeVariant {
  if (aiScore >= AI_SCORE_STRONG) return "success";
  if (aiScore >= AI_SCORE_MODERATE) return "warning";
  return "outline";
}

/**
 * claude_routine jobs carry their own 0-100 `manual_score` and never get a
 * job_scores row (by design -- AD-67), so they must never render through the
 * AI "Pending" path. `manualScore` is the truth for these rows; reuse the
 * same band thresholds by normalizing to the 0-1 scale `scoreBadgeVariant`
 * expects.
 */
export function manualScoreBadgeVariant(manualScore: number): BadgeVariant {
  return scoreBadgeVariant(manualScore / 100);
}

/**
 * Label for a job the AI has not scored yet. The keyword score rides inside
 * the pending pill so the row is self-describing — "Pending" on its own was
 * indistinguishable from a genuinely low AI score (AD-56).
 */
export function pendingScoreLabel(keywordScore: number | null): string {
  return keywordScore === null ? "Pending" : `Pending · ${formatScore(keywordScore)}`;
}
