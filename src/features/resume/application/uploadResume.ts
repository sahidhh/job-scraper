import type { NewResume, Resume } from "@/features/resume/domain/types";
import type { ResumeRepository } from "@/features/resume/domain/ResumeRepository";
import { normalizeSkillName, validateParsedText, validateSkills } from "@/features/resume/domain/validation";
import { extractSkills, type SkillDictionaryEntry } from "@/shared/domain/skills";

export interface UploadResumeInput {
  filePath: string;
  buffer: Buffer;
  mimeType: string;
  contentHash: string;
  // User-edited skill list from the /resume confirmation step (scoring.md
  // §1.5). When provided, this overrides dictionary extraction entirely.
  manualSkills?: string[];
}

// Infrastructure port: turns a file buffer into plain text (pdf-parse for
// PDF, mammoth for DOCX -- see infrastructure/parseResumeFile.ts). Injected
// so the parse-once cache below is testable without real files.
export type ParseResumeText = (buffer: Buffer, mimeType: string) => Promise<string>;

export interface UploadResumeDeps {
  resumeRepository: ResumeRepository;
  skillsDictionary: readonly SkillDictionaryEntry[];
  parseText: ParseResumeText;
}

// sha256 parse-once cache (decisions.md AD-30): if a resume row with this
// exact content_hash already exists, its parsedText is reused verbatim and
// pdf-parse/mammoth is never invoked again for the same bytes.
export async function uploadResume(input: UploadResumeInput, deps: UploadResumeDeps): Promise<Resume> {
  const cached = await deps.resumeRepository.findByContentHash(input.contentHash);

  let parsedText: string;
  if (cached) {
    parsedText = cached.parsedText;
  } else {
    parsedText = await deps.parseText(input.buffer, input.mimeType);
    validateParsedText(parsedText);
  }

  const skills =
    input.manualSkills !== undefined
      ? input.manualSkills.map(normalizeSkillName)
      : extractSkills(parsedText, deps.skillsDictionary);

  validateSkills(skills);

  const newResume: NewResume = {
    filePath: input.filePath,
    parsedText,
    skills,
    contentHash: input.contentHash,
  };

  return deps.resumeRepository.create(newResume);
}
