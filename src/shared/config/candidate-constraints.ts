// Ground-truth candidate constraints for scoring accuracy (session:
// scoring-accuracy eligibility filter + constraint-aware prompt). Single
// source of truth for both the eligibility pre-filter (classifyEligibility.ts)
// and the AI scoring prompt (OpenRouterAiScoreProvider.ts) -- edit here, not
// inline at either call site.
export const CANDIDATE_CONSTRAINTS = {
  location: "Chennai, India",
  yearsExperience: 2,
  primaryStack: ["Python", "TypeScript"],
  secondaryStack: [".NET"],
  notPrimaryStack: ["Java"],
  targetRoles: ["backend", "full-stack", "AI-tooling"],
} as const;

// Eligibility pre-filter (scoreJob.ts, classifyEligibility.ts): the
// candidate needs visa sponsorship for ANY onsite role and is not
// region-restricted out of remote roles open to India. Phrases are matched
// case-insensitively as substrings of `${locationRaw}\n${description}`.
// Edit these lists to tune what gets hard-excluded before the AI call --
// deliberately specific (named region/phrase) rather than generic
// "must reside in" style fragments, so a benign "must reside in India" line
// can never be caught by the remote geo-lock check.

// A remote job explicitly restricted to a region the candidate (India-based)
// does not qualify for.
export const GEO_LOCK_EXCLUSION_PHRASES: readonly string[] = [
  "us only",
  "u.s. only",
  "usa only",
  "united states only",
  "us-based candidates only",
  "us based candidates only",
  "us residents only",
  "united states residents only",
  "must be based in the us",
  "must be based in the united states",
  "must reside in the us",
  "must reside in the united states",
  "must be located in the us",
  "must be located in the united states",
  "open to us-based candidates only",
  "this role is only open to candidates based in the us",
  "eu only",
  "eu-based only",
  "eu based only",
  "european union only",
  "eu residents only",
  "must be based in the eu",
  "must reside in the eu",
  "uk only",
  "uk-based only",
  "uk based only",
  "united kingdom only",
  "uk residents only",
  "must be based in the uk",
  "must reside in the uk",
  "must be based in the united kingdom",
  "canada only",
  "must be based in canada",
  "must reside in canada",
  "australia only",
  "must be based in australia",
  "must be a us citizen",
  "must be a uk citizen",
  "must be located in north america",
  "north america only",
];

// Words/phrases in a "Remote - <X>" style qualifier that indicate the
// posting is genuinely open (to India, globally, or unspecified) rather
// than restricted to one place. Checked before REMOTE_SINGLE_COUNTRY_LOCK_NAMES
// below, so e.g. "Remote - New Zealand or India" is never excluded.
export const REMOTE_OPEN_LOCATION_WORDS: readonly string[] = [
  "india",
  "anywhere",
  "global",
  "worldwide",
  "world",
  "remote-first",
  "distributed",
  "multiple locations",
  "various locations",
  "flexible",
];

// Single-country names that, when they appear in a remote job's locationRaw
// immediately after "Remote" (e.g. "Remote - Poland", "Remote (Germany)"),
// indicate the posting is restricted to workers based in that one
// country -- a common ATS convention for payroll/legal residency
// requirements, distinct from genuinely open remote postings. Matched as
// whole words (containsToken, shared/domain/skills.ts) so short codes like
// "us"/"uk" don't false-match inside "Russia"/"Ukraine". Curated, not
// exhaustive -- add more as they're discovered (same "known gaps,
// deliberately not handled" philosophy as extractJobAttributes.ts; see
// design/limitations.md for what this deliberately does NOT cover, e.g.
// free-form multi-location strings and region names like "EMEA"/"APAC").
// Deliberately excludes India.
export const REMOTE_SINGLE_COUNTRY_LOCK_NAMES: readonly string[] = [
  "us",
  "usa",
  "united states",
  "uk",
  "united kingdom",
  "canada",
  "australia",
  "poland",
  "germany",
  "france",
  "netherlands",
  "spain",
  "italy",
  "ireland",
  "portugal",
  "sweden",
  "norway",
  "denmark",
  "finland",
  "switzerland",
  "austria",
  "belgium",
  "czech republic",
  "romania",
  "ukraine",
  "mexico",
  "brazil",
  "argentina",
  "japan",
  "south korea",
  "china",
  "philippines",
  "vietnam",
  "indonesia",
  "malaysia",
  "thailand",
  "south africa",
  "nigeria",
  "kenya",
  "egypt",
  "israel",
  "turkey",
  "new zealand",
];

// An onsite job with an explicit no-sponsorship / authorization-required signal.
export const NO_SPONSORSHIP_EXCLUSION_PHRASES: readonly string[] = [
  "no sponsorship",
  "not able to sponsor",
  "unable to sponsor",
  "does not sponsor",
  "cannot sponsor",
  "do not sponsor",
  "without sponsorship",
  "sponsorship is not available",
  "sponsorship not available",
  "sponsorship not provided",
  "not provide sponsorship",
  "no visa sponsorship",
  "visa sponsorship is not available",
  "citizens only",
  "us citizens only",
  "citizens of the us only",
  "must have work authorization",
  "must have valid work authorization",
  "must already have work authorization",
  "must possess work authorization",
  "authorized to work without sponsorship",
  "authorized to work in the us without sponsorship",
  "must be authorized to work in the united states without sponsorship",
  "green card holders only",
  "permanent residents only",
];
