import { DomainValidationError } from "@/shared/domain/errors";

export function normalizeSkillName(skill: string): string {
  return skill.trim();
}

// Skills are canonical dictionary names (scoring.md §1): non-empty,
// deduped case-insensitively.
export function validateSkills(skills: string[]): void {
  const seen = new Set<string>();

  for (const skill of skills) {
    const normalized = normalizeSkillName(skill);

    if (normalized.length === 0) {
      throw new DomainValidationError("Resume skills must not contain empty entries");
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      throw new DomainValidationError(`Duplicate skill: "${normalized}"`);
    }
    seen.add(key);
  }
}
