import {
  GEO_LOCK_EXCLUSION_PHRASES,
  NO_SPONSORSHIP_EXCLUSION_PHRASES,
} from "@/shared/config/candidate-constraints";
import type { LocationTag } from "@/shared/domain/enums";

export interface EligibilityResult {
  eligible: boolean;
  /** Human-readable exclusion reason (matched phrase), null when eligible. */
  reason: string | null;
}

type EligibilityJob = {
  locationRaw: string;
  locationTags: readonly LocationTag[];
  description: string;
};

function findPhrase(haystack: string, phrases: readonly string[]): string | null {
  return phrases.find((phrase) => haystack.includes(phrase)) ?? null;
}

/**
 * Hard eligibility pre-filter (scoring-accuracy session): the candidate is
 * India-based and needs visa sponsorship for any onsite role, so a
 * geo-locked-remote or sponsorship-refusing-onsite posting can never
 * actually be applied to, regardless of skill overlap. Runs before the AI
 * call (scoreJob.ts) so excluded jobs skip stage 2 entirely, saving tokens.
 * Operates only on existing job fields (locationRaw/locationTags/
 * description) -- no new columns.
 *
 * "Onsite" here means "not tagged remote" (locationTags), mirroring the
 * existing convention in extractJobAttributes.ts (workArrangement only
 * distinguishes hybrid/onsite for non-remote postings; remote is already a
 * LocationTag). Hybrid postings are treated as onsite for eligibility
 * purposes since they still require physical presence and sponsorship.
 */
export function classifyEligibility(job: EligibilityJob): EligibilityResult {
  const haystack = `${job.locationRaw}\n${job.description}`.toLowerCase();
  const isRemote = job.locationTags.includes("remote");

  if (isRemote) {
    const matched = findPhrase(haystack, GEO_LOCK_EXCLUSION_PHRASES);
    if (matched) {
      return { eligible: false, reason: `remote but geo-locked ("${matched}")` };
    }
    return { eligible: true, reason: null };
  }

  const matched = findPhrase(haystack, NO_SPONSORSHIP_EXCLUSION_PHRASES);
  if (matched) {
    return { eligible: false, reason: `onsite with no-sponsorship signal ("${matched}")` };
  }
  return { eligible: true, reason: null };
}
