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
