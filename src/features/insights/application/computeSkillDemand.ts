import type { SkillDemand } from "@/features/insights/domain/types";

/**
 * Returns a frequency map of all skills across the provided jobs, where
 * count = number of distinct jobs that mention the skill (not total occurrences).
 *
 * - Per-job deduplication: a skill repeated within a single job counts once.
 * - Includes skills the resume already covers (overall demand, not a gap view).
 * - Sort: count descending, then skill ascending (localeCompare) as tiebreaker.
 */
export function computeSkillDemand(
  jobsSkills: readonly (readonly string[])[],
): SkillDemand[] {
  // Map from lowercase skill → { canonical casing, count }
  const demandMap = new Map<string, { skill: string; count: number }>();

  for (const jobSkills of jobsSkills) {
    // Dedupe within this job before counting
    const seenInJob = new Set<string>();

    for (const skill of jobSkills) {
      const lower = skill.toLowerCase();
      if (seenInJob.has(lower)) continue;
      seenInJob.add(lower);

      const existing = demandMap.get(lower);
      if (existing) {
        existing.count += 1;
      } else {
        demandMap.set(lower, { skill, count: 1 });
      }
    }
  }

  return [...demandMap.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.skill.localeCompare(b.skill),
  );
}
