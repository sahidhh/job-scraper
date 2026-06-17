import type { SkillGap } from "@/features/insights/domain/types";

/**
 * Returns skills that appear in at least one job's skill list but are absent
 * from the resume (case-insensitive comparison). Each SkillGap carries the
 * count of distinct jobs that mention the skill.
 *
 * - Per-job deduplication: a skill repeated within a single job counts once.
 * - Output casing: preserved from the job lists (canonical dictionary names).
 * - Sort: demandCount descending, then skill ascending (localeCompare) as tiebreaker.
 */
export function computeSkillGaps(
  resumeSkills: readonly string[],
  jobsSkills: readonly (readonly string[])[],
): SkillGap[] {
  // Build a lowercase set for O(1) resume lookup
  const resumeLower = new Set(resumeSkills.map((s) => s.toLowerCase()));

  // Map from lowercase skill → { canonical casing, demandCount }
  const demandMap = new Map<string, { skill: string; demandCount: number }>();

  for (const jobSkills of jobsSkills) {
    // Dedupe within this job before counting
    const seenInJob = new Set<string>();

    for (const skill of jobSkills) {
      const lower = skill.toLowerCase();
      if (seenInJob.has(lower)) continue;
      seenInJob.add(lower);

      // Only track skills not covered by the resume
      if (resumeLower.has(lower)) continue;

      const existing = demandMap.get(lower);
      if (existing) {
        existing.demandCount += 1;
      } else {
        demandMap.set(lower, { skill, demandCount: 1 });
      }
    }
  }

  return [...demandMap.values()].sort(
    (a, b) =>
      b.demandCount - a.demandCount ||
      a.skill.localeCompare(b.skill),
  );
}
