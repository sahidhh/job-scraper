import type { LocationKeywordRule, TaggedRawJob } from "@/features/filtering/domain/types";
import type { RawJob } from "@/features/sources/domain/types";
import type { LocationTag } from "@/shared/domain/enums";
import { LOCATION_KEYWORD_RULES } from "@/shared/config/location-keywords";

/**
 * Tags each RawJob with the LocationTags whose keywords appear in
 * locationRaw (case-insensitive substring match), per architecture.md
 * §3.1 step 4. Jobs matching no rule get locationTags: [] -- callers drop
 * these per step 5 (filtering.domain.hasAllowedLocation).
 */
export function tagLocations(
  jobs: readonly RawJob[],
  rules: readonly LocationKeywordRule[] = LOCATION_KEYWORD_RULES,
): TaggedRawJob[] {
  return jobs.map((job) => ({
    ...job,
    locationTags: matchTags(job.locationRaw, rules),
  }));
}

function matchTags(locationRaw: string, rules: readonly LocationKeywordRule[]): LocationTag[] {
  const haystack = locationRaw.toLowerCase();
  const tags: LocationTag[] = [];

  for (const rule of rules) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
      tags.push(rule.tag);
    }
  }

  return tags;
}
