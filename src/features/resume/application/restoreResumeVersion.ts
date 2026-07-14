import type { ResumeRepository } from "@/features/resume/domain/ResumeRepository";
import type { Resume } from "@/features/resume/domain/types";
import { DomainValidationError } from "@/shared/domain/errors";

export interface RestoreResumeVersionDeps {
  resumeRepository: ResumeRepository;
}

// Old resume versions are preserved (set_active_resume deactivates, never
// deletes) but were otherwise unreachable. "Restore" does not flip
// is_active on the old row in place -- that would violate the
// never-mutate-a-version invariant every other resume-write path relies on
// (AD-30/AD-33: job_scores.resume_version and resume_suggestions.resume_id
// both key off a specific, immutable version). Instead it re-runs the same
// set_active_resume path a fresh upload uses, seeded with the target
// version's exact content, producing a new active version with identical
// text/skills/content_hash.
export async function restoreResumeVersion(resumeId: string, deps: RestoreResumeVersionDeps): Promise<Resume> {
  const versions = await deps.resumeRepository.listVersions();
  const target = versions.find((version) => version.id === resumeId);

  if (!target) {
    throw new DomainValidationError("Resume version not found.");
  }
  if (target.isActive) {
    throw new DomainValidationError("This is already the active resume version.");
  }

  return deps.resumeRepository.create({
    filePath: target.filePath,
    parsedText: target.parsedText,
    skills: target.skills,
    contentHash: target.contentHash,
  });
}
