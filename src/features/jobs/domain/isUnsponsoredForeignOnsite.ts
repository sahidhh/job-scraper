import type { LocationTag } from "@/shared/domain/enums";

// Abroad, relative to the India-based candidate. `remote` and `india` are
// the other two allowed LocationTags (hasAllowedLocation) and neither
// requires a work visa, so neither can ever be "foreign onsite".
const FOREIGN_LOCATION_TAGS: readonly LocationTag[] = ["uae", "singapore"];

type SponsorshipJob = {
  locationTags: readonly LocationTag[];
  visaSponsorship?: boolean | null;
};

/**
 * True for a posting the candidate would need a work visa for, where the
 * posting explicitly says it will NOT sponsor one (AD-51). Gates the
 * optional `skip_unsponsored_foreign_jobs` ingest filter.
 *
 * Deliberately keyed on `visaSponsorship === false` (an explicit refusal),
 * not on `!== true`: extractJobAttributes leaves the field null whenever
 * the posting simply doesn't mention sponsorship, which is the overwhelming
 * majority -- UAE employers in particular sponsor by default and almost
 * never say so, so a "must explicitly sponsor" rule would discard nearly
 * the entire UAE pipeline. Unknown is kept; only a stated "no" is dropped.
 */
export function isUnsponsoredForeignOnsite(job: SponsorshipJob): boolean {
  if (job.visaSponsorship !== false) return false;
  if (job.locationTags.includes("remote")) return false;
  return FOREIGN_LOCATION_TAGS.some((tag) => job.locationTags.includes(tag));
}
