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

type RankableJob = Pick<Job, "canonicalCompanyName" | "locationTags" | "salaryMin" | "salaryMax" | "visaSponsorship">;

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

  return { overallScore: Math.min(1, score), reasons };
}
