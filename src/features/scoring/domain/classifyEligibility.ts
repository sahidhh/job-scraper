import {
  GEO_LOCK_EXCLUSION_PHRASES,
  NO_SPONSORSHIP_EXCLUSION_PHRASES,
  REMOTE_OPEN_LOCATION_WORDS,
  REMOTE_SINGLE_COUNTRY_LOCK_NAMES,
} from "@/shared/config/candidate-constraints";
import type { LocationTag } from "@/shared/domain/enums";
import { containsToken } from "@/shared/domain/skills";

/**
 * Stable machine code for why a job can never be applied to, persisted as
 * `jobs.ineligible_reason` at ingest (AD-51). The human `reason` string
 * quotes the matched phrase and is for logs/UI; this is what queries filter
 * on, so the values must stay stable even if the phrase lists change.
 */
export type IneligibleReason =
  /** Remote, but restricted to a region/country the candidate can't work from. */
  | "geo_locked"
  /** Onsite/hybrid, with an explicit "we don't sponsor" signal. */
  | "no_sponsorship";

export const INELIGIBLE_REASON_LABELS: Record<IneligibleReason, string> = {
  geo_locked: "Region-locked",
  no_sponsorship: "No visa sponsorship",
};

export interface EligibilityResult {
  eligible: boolean;
  /** Stable code for persistence/filtering, null when eligible. */
  code: IneligibleReason | null;
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

// Common ATS conventions for a country-restricted remote posting:
// "Remote - Poland", "Remote (Germany)", "Remote, France", "Remote: Spain".
// Only matches when "Remote" is the whole locationRaw's leading token, not
// when it appears elsewhere in a longer free-form string (e.g. "San
// Francisco, CA ... or Remote within Canada or United States" is NOT
// matched here -- too free-form to safely regex-parse without false
// positives, see design/limitations.md).
const REMOTE_QUALIFIER_PATTERNS = [/^remote\s*[-–—:,]\s*(.+)$/i, /^remote\s*\(([^)]+)\)\s*$/i];

function extractRemoteLocationQualifier(locationRaw: string): string | null {
  const trimmed = locationRaw.trim();
  for (const pattern of REMOTE_QUALIFIER_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1].trim().toLowerCase();
  }
  return null;
}

// True when the qualifier names exactly one specific, non-India country
// this candidate cannot work from -- e.g. "Poland" or "Poland or Germany",
// but not "New Zealand or India" (an open word present) or "EMEA" (not in
// the curated country list, so treated as unknown/open rather than locked).
function isCountryLockedQualifier(qualifier: string): string | null {
  if (REMOTE_OPEN_LOCATION_WORDS.some((word) => qualifier.includes(word))) return null;
  return REMOTE_SINGLE_COUNTRY_LOCK_NAMES.find((country) => containsToken(qualifier, country)) ?? null;
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
 *
 * Remote geo-lock detection covers two shapes: (1) explicit exclusion
 * phrases anywhere in locationRaw/description (GEO_LOCK_EXCLUSION_PHRASES),
 * and (2) a structural "Remote - <country>" style locationRaw naming a
 * single non-India country this candidate cannot work from
 * (REMOTE_SINGLE_COUNTRY_LOCK_NAMES) -- a common ATS payroll/residency
 * convention that doesn't use any of the explicit-phrase wording (found via
 * a real production job, "Remote - Poland", that passed shape (1) but was
 * still country-restricted).
 */
export function classifyEligibility(job: EligibilityJob): EligibilityResult {
  const haystack = `${job.locationRaw}\n${job.description}`.toLowerCase();
  const isRemote = job.locationTags.includes("remote");

  if (isRemote) {
    const matched = findPhrase(haystack, GEO_LOCK_EXCLUSION_PHRASES);
    if (matched) {
      return { eligible: false, code: "geo_locked", reason: `remote but geo-locked ("${matched}")` };
    }

    const qualifier = extractRemoteLocationQualifier(job.locationRaw);
    const lockedCountry = qualifier ? isCountryLockedQualifier(qualifier) : null;
    if (lockedCountry) {
      return {
        eligible: false,
        code: "geo_locked",
        reason: `remote but restricted to a single country ("${job.locationRaw}", matched "${lockedCountry}")`,
      };
    }

    return { eligible: true, code: null, reason: null };
  }

  const matched = findPhrase(haystack, NO_SPONSORSHIP_EXCLUSION_PHRASES);
  if (matched) {
    return { eligible: false, code: "no_sponsorship", reason: `onsite with no-sponsorship signal ("${matched}")` };
  }
  return { eligible: true, code: null, reason: null };
}
