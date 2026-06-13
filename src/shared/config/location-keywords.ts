import type { LocationKeywordRule } from "@/features/filtering/domain/types";

// Keyword lists for filtering.application.tagLocations() (architecture.md
// §3.1 step 4). Matched case-insensitively as substrings of
// RawJob.locationRaw -- a job's locationTags is the set of every rule whose
// keywords match.
export const LOCATION_KEYWORD_RULES: readonly LocationKeywordRule[] = [
  {
    tag: "india",
    keywords: [
      "india",
      "bengaluru",
      "bangalore",
      "hyderabad",
      "mumbai",
      "pune",
      "delhi",
      "gurugram",
      "gurgaon",
      "noida",
      "chennai",
      "ncr",
    ],
  },
  {
    tag: "singapore",
    keywords: ["singapore"],
  },
  {
    tag: "uae",
    keywords: ["uae", "dubai", "abu dhabi", "united arab emirates", "sharjah"],
  },
  {
    tag: "remote",
    keywords: ["remote", "work from home", "wfh", "anywhere", "distributed"],
  },
];
