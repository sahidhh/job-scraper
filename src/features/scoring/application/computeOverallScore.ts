import type { Job } from "@/features/jobs/domain/types";
import type { RankingPreferences } from "@/features/scoring/domain/types";

export interface OverallScoreResult {
  overallScore: number;
  /** Human-readable reasons a bonus was applied, in the order checked. Empty when none applied. */
  reasons: string[];
}

const DEFAULT_COMPANY_BONUS = 0.05;
const DEFAULT_REMOTE_BONUS = 0.03;
const DEFAULT_SALARY_BONUS = 0.02;
const DEFAULT_SPONSORSHIP_BONUS = 0.04;
export const FRESHNESS_BOOST = 0.06;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

type RankableJob = Pick<
  Job,
  "canonicalCompanyName" | "locationTags" | "salaryMin" | "salaryMax" | "visaSponsorship"
> & {
  postedAt?: string | Date | null;
};

/**
 * Dynamic `< 24h` freshness boost for notification ranking. Kept separate
 * from persisted `job_scores.overall_score` so old jobs do not stay
 * permanently boosted on `/dashboard`.
 */
export function computeFreshnessBoost(postedAt: string | Date | null | undefined, now: Date = new Date()): number {
  if (!postedAt) return 0;
  const postedMs = postedAt instanceof Date ? postedAt.getTime() : Date.parse(postedAt);
  if (Number.isNaN(postedMs)) return 0;
  const ageMs = now.getTime() - postedMs;
  return ageMs < TWENTY_FOUR_HOURS_MS ? FRESHNESS_BOOST : 0;
}

/**
 * Deterministic composite ranking score for a single personal user's
 * dashboard (Theme 1 continuous-improvement pass): aiScore plus small,
 * configurable additive bonuses for signals the AI match score doesn't
 * already capture -- a preferred company, a remote posting when the user
 * prefers remote, salary being disclosed at all (an information advantage,
 * not a judgement of whether the number is "good"), and an explicit visa
 * sponsorship offer (a strong positive for an abroad-targeting candidate).
 * Deliberately not ML/embeddings-based -- see design/decisions.md.
 *
 * Only called when aiScore is non-null; freshness is already handled by the
 * dashboard's existing `posted_at desc` tiebreaker, so it isn't blended in
 * here to avoid double-counting.
 */
export function computeOverallScore(
  job: RankableJob,
  aiScore: number,
  preferences: RankingPreferences,
  now: Date = new Date(),
): OverallScoreResult {
  let score = aiScore;
  const reasons: string[] = [];

  const preferredCompanies = preferences.preferredCompanies ?? [];
  const companyLower = job.canonicalCompanyName.toLowerCase();
  const isPreferredCompany = preferredCompanies.some(
    (company) => company.trim().length > 0 && companyLower.includes(company.toLowerCase()),
  );
  if (isPreferredCompany) {
    score += preferences.companyBonus ?? DEFAULT_COMPANY_BONUS;
    reasons.push("preferred company");
  }

  if (preferences.preferRemote && job.locationTags.includes("remote")) {
    score += preferences.remoteBonus ?? DEFAULT_REMOTE_BONUS;
    reasons.push("remote");
  }

  if (job.visaSponsorship === true) {
    score += preferences.sponsorshipBonus ?? DEFAULT_SPONSORSHIP_BONUS;
    reasons.push("offers visa sponsorship");
  }

  if (job.salaryMin !== null || job.salaryMax !== null) {
    score += preferences.salaryBonus ?? DEFAULT_SALARY_BONUS;
    reasons.push("salary disclosed");
  }

  const freshnessBoost = computeFreshnessBoost(job.postedAt, now);
  if (freshnessBoost > 0) {
    score += freshnessBoost;
    reasons.push("posted within 24h");
  }

  return { overallScore: Math.min(1, score), reasons };
}
