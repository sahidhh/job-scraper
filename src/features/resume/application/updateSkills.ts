import type { ResumeRepository } from "@/features/resume/domain/ResumeRepository";
import type { Resume } from "@/features/resume/domain/types";
import { normalizeSkillName, validateSkills } from "@/features/resume/domain/validation";

export interface UpdateSkillsDeps {
  resumeRepository: ResumeRepository;
}

// Manual skill edits from the /resume confirmation step (scoring.md §1.5),
// overriding dictionary extraction.
export async function updateSkills(id: string, skills: string[], deps: UpdateSkillsDeps): Promise<Resume> {
  const normalized = skills.map(normalizeSkillName);
  validateSkills(normalized);

  return deps.resumeRepository.updateSkills(id, normalized);
}
