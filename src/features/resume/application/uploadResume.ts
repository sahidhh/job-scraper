import type { NewResume, Resume } from "@/features/resume/domain/types";
import type { ResumeRepository } from "@/features/resume/domain/ResumeRepository";
import { normalizeSkillName, validateSkills } from "@/features/resume/domain/validation";
import { extractSkills, type SkillDictionaryEntry } from "@/shared/domain/skills";

export interface UploadResumeInput {
  filePath: string;
  parsedText: string;
  // User-edited skill list from the /resume confirmation step (scoring.md
  // §1.5). When provided, this overrides dictionary extraction entirely.
  manualSkills?: string[];
}

export interface UploadResumeDeps {
  resumeRepository: ResumeRepository;
  skillsDictionary: readonly SkillDictionaryEntry[];
}

export async function uploadResume(input: UploadResumeInput, deps: UploadResumeDeps): Promise<Resume> {
  const skills =
    input.manualSkills !== undefined
      ? input.manualSkills.map(normalizeSkillName)
      : extractSkills(input.parsedText, deps.skillsDictionary);

  validateSkills(skills);

  const newResume: NewResume = {
    filePath: input.filePath,
    parsedText: input.parsedText,
    skills,
  };

  return deps.resumeRepository.create(newResume);
}
