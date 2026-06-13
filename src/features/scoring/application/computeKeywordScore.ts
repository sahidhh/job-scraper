/**
 * Stage-1 score (scoring.md §2): the fraction of skills the job mentions
 * that the resume also lists -- a recall-style score against the job's
 * stated requirements. Matching is case-insensitive over canonical skill
 * names already extracted via the shared skills dictionary.
 *
 * Returns 0 if the job mentions no dictionary skills at all (nothing to
 * assess against).
 */
export function computeKeywordScore(resumeSkills: readonly string[], jobSkills: readonly string[]): number {
  if (jobSkills.length === 0) {
    return 0;
  }

  const resumeSet = new Set(resumeSkills.map((skill) => skill.toLowerCase()));
  const matched = jobSkills.filter((skill) => resumeSet.has(skill.toLowerCase()));

  return matched.length / jobSkills.length;
}
